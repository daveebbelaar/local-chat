# Chat

This is the clean starter for "Chat", a local AI desktop app for macOS and Windows. You will build a ChatGPT-style
Chat mode on Ollama and a Claude Code-style Code mode on the Pi coding agent, with Tauri: Rust for the backend, React
for the frontend. Everything runs on your own computer.

> You are on `main`, the learner starter. Active work is visible on `development`; the reviewed finished application
> is on `solution`.

Tutorial: <https://learn.datalumina.com/docs/local-chat>

## What is included

- The client brief and target architecture
- Exact dependency pins and lockfiles
- Tauri, Vite, and TypeScript configuration
- The app icon

Application code is intentionally absent. `src/` and `src-tauri/src/` hold only a `.gitkeep`. The tutorial builds the
app from this starting point.

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
cd src-tauri
cargo fetch --locked
```

No environment variables or API keys are needed.

## Verify the starter installation

Both install commands above must finish without changing `pnpm-lock.yaml` or `src-tauri/Cargo.lock`:

```bash
git status --short
```

Expected: no output.

## Choose a branch

- `main`: clone this branch to follow the tutorial from the prepared starting point.
- `development`: inspect the public working branch and later experiments.
- `solution`: inspect the reviewed end product.

To switch to the finished application:

```bash
git switch solution
```

Start with [the client brief](docs/client-brief.md), then follow the
[complete tutorial](https://learn.datalumina.com/docs/local-chat).
