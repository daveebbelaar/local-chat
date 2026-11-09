//! Code mode: run the Pi coding agent as a child process and talk to it in JSON lines.
//! Pi docs: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md

use crate::store;
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

const INSTALL_HINT: &str =
    "Pi is not installed. Run: npm install -g @earendil-works/pi-coding-agent@1.5.0";

struct PiProcess {
    child: Child,
    stdin: ChildStdin,
}

/// The one Pi process the app runs, if any.
#[derive(Default)]
pub struct PiState(Mutex<Option<PiProcess>>);

/// Start Pi in `folder`. Every line Pi prints arrives on `on_event` as JSON.
#[tauri::command(async)]
pub fn code_start(
    app: AppHandle,
    folder: String,
    model: String,
    pi_path: String,
    on_event: Channel<Value>,
    state: State<'_, PiState>,
) -> Result<(), String> {
    shutdown(&state);
    if !Path::new(&folder).is_dir() {
        return Err(format!("Folder not found: {folder}"));
    }

    // Pi reads its settings from this folder, never from the user's own ~/.pi/agent.
    let config_dir = store::data_dir(&app)?.join("pi");
    write_models_json(&config_dir, &model)?;

    let path = search_path();
    let mut command = pi_command(&pi_path, &path)?;
    command
        .args(["--mode", "rpc", "--no-session", "--offline"])
        .args(["--provider", "ollama", "--model", &model])
        .args(["--thinking", "low", "--tools", "read,write,edit,bash"])
        .current_dir(&folder)
        .env("PI_CODING_AGENT_DIR", &config_dir)
        .env("PATH", &path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window pops up
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start pi: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // stderr is Pi's log, never protocol. Keep the last lines to explain a crash.
    let log = Arc::new(Mutex::new(Vec::<String>::new()));
    let log_writer = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let mut lines = log_writer.lock().unwrap();
            lines.push(line);
            if lines.len() > 20 {
                lines.remove(0);
            }
        }
    });

    // stdout is strict JSON lines. Forward each one as is; React decides what it means.
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let event = serde_json::from_str(&line)
                .unwrap_or_else(|_| json!({ "type": "log", "text": line }));
            if on_event.send(event).is_err() {
                break;
            }
        }
        let log = log.lock().unwrap().join("\n");
        let _ = on_event.send(json!({ "type": "exit", "log": log }));
    });

    *state.0.lock().unwrap() = Some(PiProcess { child, stdin });
    Ok(())
}

/// Send an instruction to Pi.
#[tauri::command]
pub fn code_prompt(message: String, state: State<'_, PiState>) -> Result<(), String> {
    send(&state, json!({ "type": "prompt", "message": message }))
}

/// Stop what Pi is doing now. Pi stays running for the next instruction.
#[tauri::command]
pub fn code_abort(state: State<'_, PiState>) -> Result<(), String> {
    send(&state, json!({ "type": "abort" }))
}

/// End the Pi process.
#[tauri::command]
pub fn code_stop(state: State<'_, PiState>) {
    shutdown(&state);
}

fn send(state: &PiState, command: Value) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let pi = guard.as_mut().ok_or("Pi is not running")?;
    writeln!(pi.stdin, "{command}").map_err(|e| format!("Pi stopped: {e}"))?;
    pi.stdin.flush().map_err(|e| e.to_string())
}

/// Close stdin so Pi can exit cleanly, then kill it if it is still running after a second.
/// A forgotten Pi process can hold on to a lot of memory, so this runs on stop, window close, and exit.
pub fn shutdown(state: &PiState) {
    let Some(PiProcess { mut child, stdin }) = state.0.lock().unwrap().take() else {
        return;
    };
    drop(stdin);
    let deadline = Instant::now() + Duration::from_secs(1);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Pi talks to Ollama's OpenAI-compatible endpoint.
/// `supportsDeveloperRole: false` is required: without it Pi sends its system prompt with the
/// "developer" role, Ollama drops it, and the model never sees Pi's instructions.
fn write_models_json(dir: &Path, model: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let config = json!({
        "providers": {
            "ollama": {
                "baseUrl": "http://127.0.0.1:11434/v1",
                "api": "openai-completions",
                "apiKey": "ollama",
                "compat": { "supportsDeveloperRole": false },
                "models": [{
                    "id": model,
                    "contextWindow": 32768,
                    "maxTokens": 8192,
                    "reasoning": true
                }]
            }
        }
    });
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    store::write_atomic(&dir.join("models.json"), &text)
}

/// How to start Pi on this platform.
fn pi_command(pi_path: &str, path: &str) -> Result<Command, String> {
    if !pi_path.trim().is_empty() {
        return Ok(Command::new(pi_path.trim()));
    }
    // npm installs `pi.cmd` on Windows. Run Node on Pi's script directly, so killing the
    // child kills Pi itself and not only a cmd.exe wrapper around it.
    if cfg!(windows) {
        let folder = find_on_path("pi.cmd", path)
            .and_then(|file| file.parent().map(Path::to_path_buf))
            .ok_or(INSTALL_HINT)?;
        let script =
            folder.join(r"node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js");
        let mut command = Command::new("node");
        command.arg(script);
        return Ok(command);
    }
    let pi = find_on_path("pi", path).ok_or(INSTALL_HINT)?;
    Ok(Command::new(pi))
}

fn find_on_path(name: &str, path: &str) -> Option<PathBuf> {
    std::env::split_paths(path)
        .map(|dir| dir.join(name))
        .find(|file| file.is_file())
}

/// The PATH to search for `pi` and `node`.
/// An app opened from Finder or the Dock gets a minimal PATH without nvm, Homebrew, or npm's
/// global folder. Ask the user's login shell for its PATH each time Pi starts, and add it in front.
fn search_path() -> String {
    let own = std::env::var("PATH").unwrap_or_default();
    #[cfg(unix)]
    {
        if let Some(shell_path) = login_shell_path() {
            return format!("{shell_path}:{own}");
        }
    }
    own
}

#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut child = Command::new(shell)
        .args(["-l", "-i", "-c", "printf '__PATH__%s' \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // A shell profile that waits for input must not hang the app.
    let deadline = Instant::now() + Duration::from_secs(5);
    while child.try_wait().ok()?.is_none() {
        if Instant::now() > deadline {
            let _ = child.kill();
            return None;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let mut output = String::new();
    std::io::Read::read_to_string(&mut child.stdout.take()?, &mut output).ok()?;
    let path = output.split("__PATH__").nth(1)?.trim();
    (!path.is_empty()).then(|| path.to_string())
}
