# Chat

"Chat" is a local AI desktop app for macOS and Windows. Chat mode is a ChatGPT-style chat on Ollama models. Code mode
is a Claude Code-style agent: the Pi coding agent works in a folder you pick and every tool call shows as a card.
It is built with Tauri: Rust for the backend, React for the frontend. Everything runs on your own computer.

## Branches and steps

- `main` is the starter: the whole interface (React), conversation storage (`store.rs`), and configuration, but no
  connection to any model. It compiles and opens an empty Chat window.
- `development` adds the model connections in three commits, each with a tag. One command copies a step's Rust files
  into your clone:

| Step | Command | Adds |
| --- | --- | --- |
| 1 | `git checkout step-1-ollama -- src-tauri/src` | `ollama.rs`: models, streaming, Stop, tokens per second |
| 2 | `git checkout step-2-apple -- src-tauri/src` | `apple.rs`: Apple's on-device model through `fm serve` (macOS 27) |
| 3 | `git checkout step-3-pi -- src-tauri/src` | `pi.rs`: Code mode with the Pi coding agent |

- `solution` is the reviewed, finished app (the same code as `step-3-pi`).

Tutorial: <https://learn.datalumina.com/docs/local-chat>

## Prerequisites

- Rust 1.85 or newer (`rustup`)
- Node.js 22.19 or newer
- pnpm 11 or newer
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Microsoft C++ Build Tools with "Desktop development with C++", and WebView2 (built into Windows 10 and 11)
- [Ollama](https://ollama.com) with at least one model, for example `ollama pull qwen3:8b`
- For Code mode: `npm install -g @earendil-works/pi-coding-agent@1.5.0` and `ollama pull gpt-oss:20b`

## Install

```bash
pnpm install --frozen-lockfile
cd src-tauri && cargo fetch --locked && cd ..
```

No environment variables or API keys are needed.

## Run

Start Ollama with a context window large enough for Pi:

```bash
OLLAMA_CONTEXT_LENGTH=32768 ollama serve
```

Then start the app:

```bash
pnpm tauri dev
```

## Verify

```bash
pnpm typecheck
pnpm build
cd src-tauri && cargo clippy --locked -- -D warnings && cargo fmt --check && cd ..
```

Manual walkthrough:

1. Chat: pick a model in the composer, send a question, watch it stream, press Stop (or Escape) on a long answer.
2. Quit and restart the app: the conversation is still in the sidebar.
3. Code: copy `demos/broken-project` to a temporary folder, pick it, and click "Find the bug, fix it, and run the code
   to prove it works". Pi's tool calls appear as cards; `python3 main.py` prints `OK` afterward.
4. The two speed demos: [`demos/moe-race.md`](demos/moe-race.md) and
   [`demos/speculative-edit.md`](demos/speculative-edit.md).

## Build the desktop app

```bash
pnpm tauri build
```

- macOS: `src-tauri/target/release/bundle/macos/Chat.app` and a `.dmg` in `bundle/dmg/`.
- Windows: a setup `.exe` in `src-tauri\target\release\bundle\nsis\`. Build it on Windows.

The app is not code-signed. On macOS, right-click the app and choose Open the first time.

## Where things are

- `src-tauri/src/`: `ollama.rs` (HTTP to Ollama), `pi.rs` (the Pi process), `store.rs` (JSON files), `main.rs`.
- `src/`: `App.tsx`, `Sidebar.tsx`, `ChatView.tsx`, `CodeView.tsx`, `Composer.tsx`, `ModelPicker.tsx`,
  `Markdown.tsx`, `Settings.tsx`, `api.ts`, `pi.ts`.
- Data: `~/Library/Application Support/com.datalumina.chat` on macOS, `%APPDATA%\com.datalumina.chat` on Windows.

Start with [the client brief](docs/client-brief.md) and [the architecture](docs/architecture.md). The
[build-along guide](docs/build-along.md) reproduces the build step by step.
