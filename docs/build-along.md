# Build-along guide

The starter on `main` holds the whole interface. Three steps connect it to models: Ollama, Apple's on-device model,
and the Pi coding agent. Each step is one command and leaves the app in a working, verifiable state. The course at
<https://learn.datalumina.com/docs/local-chat> explains each step in more depth.

## The problem

A developer wants a private AI assistant on their own computer: a chat for questions and an agent that edits code in a
project folder. Today that means two terminal tools (`ollama run` and `pi`). Read [the client brief](client-brief.md).

## What we are building

One desktop app called Chat, with two modes:

- **Chat:** streaming answers from a local Ollama model, Stop, markdown, a model picker, a thinking level, tokens per
  second under each answer, saved conversations, settings.
- **Code:** the Pi coding agent working in a folder you pick, with every tool call shown as a card.

Left out on purpose: accounts, cloud models, model downloads, attachments, auto-update, code signing. See
[the architecture](architecture.md) for the boundaries.

## Prerequisites

| Tool | Version used | Check |
| --- | --- | --- |
| Rust | 1.95.0 | `rustc -V` |
| Node.js | 24.16.0 (22.19+ works) | `node -v` |
| pnpm | 12.9.1 (11+ works) | `pnpm -v` |
| Ollama | 0.40.14 | `ollama -v` |
| Pi | 1.5.0 | `pi --version` |

Models used in this guide (all from `ollama pull`):

| Model | Size | Used for |
| --- | --- | --- |
| `qwen3:8b` | 5.2 GB | everyday chat while building |
| `gpt-oss:20b` | 13.8 GB | Code mode with Pi |
| `qwen3.8:27b-q4_K_M` | 17.7 GB | dense model in the speed tests |
| `qwen3:30b` | 18.6 GB | mixture-of-experts test |
| `qwen3.8:27b-mtp-q4_K_M` | 17.7 GB | speculative decoding test |

The three large models need about 20 GB of free memory each. Run one at a time.

## Step 0: the starter

**Outcome:** `pnpm tauri dev` opens the Chat window. The sidebar, composer, settings, and Code mode are all there, but
the model button says "No model", because nothing talks to Ollama yet.

**Why:** the interface is not the point of this project. The starter has all of it: React in `src/`, conversation and
settings storage in `src-tauri/src/store.rs`, and the Tauri configuration. What you add is the part that connects the
app to models.

**Build:**

```bash
git clone https://github.com/daveebbelaar/local-chat.git
cd local-chat
pnpm install --frozen-lockfile
cd src-tauri && cargo fetch --locked && cd ..
pnpm tauri dev
```

The first run compiles about 360 crates. Later runs take seconds.

**Check:** the window opens. The model button says "No model". Settings save and survive a restart, because
`store.rs` already works.

## Step 1: connect Ollama

**Outcome:** the model button lists your Ollama models. Answers stream in, Stop works, and every answer shows its
tokens per second.

**Build:**

```bash
git checkout step-1-ollama -- src-tauri/src
```

This adds `src-tauri/src/ollama.rs` and registers its commands in `main.rs`:

- `list_models` (`GET /api/tags`), `model_options` (`POST /api/show`, the thinking levels), `unload_model`
  (`keep_alive: 0`).
- `chat` starts a thread and returns at once. The thread POSTs `/api/chat` with `stream: true`, reads one JSON line
  at a time, and sends `thinking` and `text` events over a Tauri Channel. The last line carries `eval_count` and
  `eval_duration`; `eval_count / eval_duration * 1e9` is the tokens per second.
- `stop_chat` sets a flag. The thread checks it before each line; returning drops the connection, and Ollama stops.
- `context_size` picks `num_ctx` (8K to 128K) from the length of the chat, so long chats are not cut silently.

**Check:**

```bash
cd src-tauri && cargo clippy --locked -- -D warnings && cd ..
pnpm tauri dev
```

Pick `qwen3:8b`, ask a question, and see the speed line under the answer. Ask for a long story and press Stop.

## Step 2: Apple's on-device model (optional, macOS 27)

**Outcome:** on macOS 27 the model button also lists `apple-on-device`.

**Build:**

```bash
git checkout step-2-apple -- src-tauri/src
```

This adds `src-tauri/src/apple.rs`. It starts `fm serve` on a free port the first time you pick the model, reads its
OpenAI-style server-sent events, and sends the same events as the Ollama path. `ollama.rs` routes requests for
`apple-on-device` to it. `main.rs` stops the server when the app quits.

**Check:** pick `apple-on-device` and ask a short question. After quitting, `pgrep -fl "fm serve"` prints nothing.

## Step 3: Code mode with Pi

**Outcome:** in Code mode, Pi works in a folder you pick on `gpt-oss:20b`, and every tool call shows as a card.

**Build:**

```bash
npm install -g @earendil-works/pi-coding-agent@1.5.0
git checkout step-3-pi -- src-tauri/src
```

This adds `src-tauri/src/pi.rs`. It writes its own `models.json` (with `supportsDeveloperRole: false`, or Ollama drops
Pi's system prompt), starts `pi --mode rpc` in the chosen folder, forwards every stdout line to React over a Channel,
writes `prompt` and `abort` commands to stdin, and kills Pi when the window closes or the app quits.

**Check:** copy `demos/broken-project` to a temporary folder, pick it in Code mode, and click "Find the bug, fix it,
and run the code to prove it works". Afterwards `python3 main.py` prints `Total: 3836.46` and `OK`.

## Build the desktop app

```bash
pnpm tauri build
```

macOS: `src-tauri/target/release/bundle/macos/Chat.app` and a `.dmg`. Windows: a setup `.exe` in
`src-tauri\target\release\bundle\nsis\`.
