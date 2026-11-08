# Build-along guide

This guide is written while the project is built. Each completed section leaves the app in a working, verifiable
state.

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
| `qwen3.8:27b-q4_K_M` | 17.7 GB | dense model in the speed demos |
| `qwen3:30b` | 18.6 GB | mixture-of-experts demo |
| `qwen3.8:27b-mtp-q4_K_M` | 17.7 GB | speculative decoding demo |

The three large models need about 20 GB of free memory each. Run one at a time.

## Step 0: install the starter

**Outcome:** dependencies are installed from the lockfiles, and nothing else exists yet.

**Why:** the lockfiles fix every version, so your build matches this guide.

**Build:**

```bash
git clone https://github.com/daveebbelaar/e2e-local-chat.git
cd e2e-local-chat
pnpm install --frozen-lockfile
cd src-tauri && cargo fetch --locked && cd ..
```

Look at the files that are already there:

- `package.json`: React, the Tauri JavaScript API, two Tauri plugins, and the markdown renderer.
- `src-tauri/Cargo.toml`: Tauri, the same two plugins on the Rust side, `serde`, and `ureq` for HTTP.
- `src-tauri/tauri.conf.json`: the window, the bundle identifier `com.datalumina.chat`, and the dev server port.
- `src-tauri/capabilities/default.json`: what the window may do. Tauri denies everything that is not listed.

**Check:** `git status --short` prints nothing.

**Checkpoint:** a clean starter with installed dependencies. `src/` and `src-tauri/src/` are empty.
