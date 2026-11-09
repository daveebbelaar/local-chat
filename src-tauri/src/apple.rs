//! Optional: Apple's on-device model on macOS 27, through the `fm serve` command that ships with macOS.
//! `fm serve` speaks the OpenAI Chat Completions format, so only the line format differs from Ollama.

use crate::ollama::{ChatEvent, ChatRequest};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// The name the model picker shows for Apple's model.
pub const MODEL: &str = "apple-on-device";
const FM: &str = "/usr/bin/fm";

/// The running `fm serve` process and its port.
static SERVER: Mutex<Option<(Child, u16)>> = Mutex::new(None);

pub fn available() -> bool {
    cfg!(target_os = "macos") && std::path::Path::new(FM).exists()
}

/// Start `fm serve` on a free port the first time it is needed.
fn port() -> Result<u16, String> {
    let mut server = SERVER.lock().unwrap();
    if let Some((_, port)) = server.as_ref() {
        return Ok(*port);
    }
    // Ask the OS for a free port, then hand it to fm.
    let port = TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map_err(|e| e.to_string())?
        .port();
    let child = Command::new(FM)
        .args(["serve", "--host", "127.0.0.1", "--port", &port.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start fm serve: {e}"))?;
    *server = Some((child, port));

    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if ureq::get(format!("http://127.0.0.1:{port}/health"))
            .call()
            .is_ok()
        {
            return Ok(port);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err("fm serve did not start".to_string())
}

/// The same job as `ollama::stream_answer`, for Apple's model.
pub fn stream_answer(
    request: &ChatRequest,
    events: &Channel<ChatEvent>,
    stop: &AtomicBool,
) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port()?);
    let mut body = json!({
        "model": "system",
        "messages": request.messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }
    let started = Instant::now();
    let response = ureq::post(url)
        .send_json(&body)
        .map_err(|e| format!("Apple model: {e}"))?;

    // Server-sent events: lines that start with "data: ", ending with "data: [DONE]".
    let mut first_token: Option<Instant> = None;
    let mut chunks = 0u64;
    let mut usage_tokens = None;
    for line in BufReader::new(response.into_body().into_reader()).lines() {
        if stop.load(Ordering::SeqCst) {
            let _ = events.send(ChatEvent::stopped());
            return Ok(());
        }
        let line = line.map_err(|e| e.to_string())?;
        let Some(data) = line.strip_prefix("data: ") else {
            continue;
        };
        if data == "[DONE]" {
            break;
        }
        let chunk: Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
        if let Some(tokens) = chunk["usage"]["completion_tokens"].as_u64() {
            usage_tokens = Some(tokens);
        }
        let text = chunk["choices"][0]["delta"]["content"]
            .as_str()
            .unwrap_or("");
        if !text.is_empty() {
            first_token.get_or_insert_with(Instant::now);
            chunks += 1;
            let _ = events.send(ChatEvent::Text {
                delta: text.to_string(),
            });
        }
    }

    // fm reports token usage at the end; if it does not, count streamed chunks instead.
    let first = first_token.unwrap_or_else(Instant::now);
    let tokens = usage_tokens.unwrap_or(chunks);
    let seconds = first.elapsed().as_secs_f64();
    let _ = events.send(ChatEvent::Done {
        stopped: false,
        tokens,
        tokens_per_second: if seconds > 0.0 {
            tokens as f64 / seconds
        } else {
            0.0
        },
        load_seconds: 0.0,
        prompt_seconds: (first - started).as_secs_f64(),
    });
    Ok(())
}

/// Stop `fm serve` when the app exits.
pub fn shutdown() {
    if let Some((mut child, _)) = SERVER.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
