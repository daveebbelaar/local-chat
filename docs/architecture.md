# Architecture

Chat is a Tauri 2 app. Rust owns everything that touches the machine. React owns everything the user sees.

```
┌──────────────────────── React (src/) ────────────────────────┐
│ Sidebar (Chat | Code, conversations)  ChatView  CodeView      │
│ api.ts: typed invoke() calls and Channel event types          │
└───────────────┬──────────────────────────────▲───────────────┘
        invoke("chat", { ..., onEvent })        │ Channel messages
┌───────────────▼──────────── Rust (src-tauri/src/) ───────────┐
│ ollama.rs  HTTP to Ollama, one thread per answer              │
│ pi.rs      the Pi child process, JSON lines on stdin/stdout   │
│ store.rs   conversations and settings as JSON files           │
│ main.rs    commands, plugins, shared state, cleanup on exit   │
└──────┬─────────────────────────┬──────────────────────┬──────┘
       │ http://127.0.0.1:11434   │ pi --mode rpc        │ app data folder
   Ollama server             Pi coding agent        conversations/*.json
                             (in the chosen folder)  settings.json
```

## Boundaries

- **All HTTP goes through Rust.** The webview never calls Ollama. A direct `fetch` works in development and on macOS,
  but the Windows build runs on `http://tauri.localhost`, which Ollama's default CORS rules reject.
- **Streaming uses Tauri Channels**, not global events. The frontend creates a `Channel`, passes it to a command, and
  Rust sends typed messages in order.
- **One thread per answer.** A command that reads a stream would block the app, so it starts a `std::thread`, moves the
  Channel into it, and returns at once.
- **Ollama types stop in `ollama.rs`.** React receives four events: `thinking`, `text`, `done` (token count and tokens
  per second), `error`.
- **Pi events pass through raw.** Rust forwards each stdout line from Pi as JSON. React turns `tool_execution_*` events
  into tool cards. Rust stays small and Pi can add fields without a Rust change.
- **Pi gets its own config folder.** The app writes `models.json` into `<app data>/pi` and sets `PI_CODING_AGENT_DIR`,
  so it never touches the user's `~/.pi/agent`.
- **The Pi child dies with the app.** Stop sends `abort`. Closing the Code chat, closing the window, or quitting kills
  the process.
- **Storage is plain files.** One JSON file per conversation, one `settings.json`. No database.

## Data flow: one chat answer

1. React appends the user message and calls `invoke("chat", { request, onEvent })`.
2. Rust starts a thread, POSTs `/api/chat` with `stream: true`, the whole history, `think`, and `options.num_ctx`.
3. Ollama answers with one JSON object per line. Rust parses each line and sends `thinking` or `text` to the Channel.
4. The last line holds `eval_count` and `eval_duration`. Rust sends `done` with
   `tokens per second = eval_count / eval_duration * 1e9`.
5. React saves the conversation with `invoke("save_conversation")`.
6. Stop sets a flag. The thread sees it at the next line, drops the connection, and Ollama stops generating.

## Data flow: one Code mode task

1. React calls `code_start` with the folder and model. Rust writes Pi's `models.json` and starts
   `pi --mode rpc --no-session --offline --provider ollama --model <model>` in that folder.
2. React calls `code_prompt` with the instruction. Rust writes `{"type":"prompt","message":...}` to Pi's stdin.
3. Pi prints JSON lines: text deltas, `tool_execution_start`, `tool_execution_end`, and `agent_settled` at the end.
4. Stop writes `{"type":"abort"}`.

## Platform notes

- **macOS:** an app started from Finder does not get the shell `PATH`, so `pi` (a Node script) is not found. Rust asks
  the login shell for its `PATH` once at startup.
- **Windows:** npm installs `pi.cmd`, which `Command::new("pi")` does not run. Starting it through `cmd /C` would
  leave Node running when the app kills `cmd.exe`. Rust finds the folder that holds `pi.cmd` on the `PATH` and starts
  `node <that folder>\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js` directly.
