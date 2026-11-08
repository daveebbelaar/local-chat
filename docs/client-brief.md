# Client brief: Chat

## The user

A developer who wants to use AI models every day without sending their code, notes, or client data to a cloud
service, and without an API bill. They already run Ollama or are willing to install it. They switch between two jobs:

- **Asking questions:** explain an error, draft a message, compare two approaches. A ChatGPT-style chat.
- **Changing code:** fix a failing function in a project folder. A Claude Code-style agent that reads and edits files.

Today they use a terminal (`ollama run`, `pi`) for both. They want one small desktop app on their own computer.

## The outcome

"Chat" is a desktop app for macOS and Windows. Everything runs on the user's machine.

- **Chat mode:** a conversation list, streaming answers, Stop, markdown with code blocks and a copy button, a model
  picker filled from the local Ollama install, a thinking level where the model supports it, and the tokens per
  second under each answer. Conversations are saved locally and survive a restart. Settings hold a system prompt and
  a default model.
- **Code mode:** pick a folder, give an instruction, and the Pi coding agent works in that folder on a local model.
  The app streams Pi's text and shows each tool call (read, write, edit, bash) as a card. Stop aborts the agent.

The app also works as an instrument: the tokens per second under each answer makes two ideas visible.

1. **Mixture of experts:** a 30B MoE model (`qwen3:30b`) answers about six times faster than a 27B dense model
   (`qwen3.8:27b-q4_K_M`) of almost the same file size.
2. **Speculative decoding:** the same 27B model with multi-token prediction heads (`qwen3.8:27b-mtp-q4_K_M`) is about
   two and a half times faster on a one-line code edit, and only a little faster on a normal question.

## Scope

In scope:

- One window, two modes, one Rust backend that owns every call to the machine (HTTP, files, child processes).
- Local storage as JSON files in the app data folder.
- A macOS `.app` and a Windows installer built with `tauri build`.

Out of scope:

- Accounts, sync, cloud models, API keys.
- Downloading or managing models (Ollama does that).
- File attachments, images, voice, retrieval over documents.
- Auto-update, code signing, and notarization.

## Done

- `pnpm tauri dev` opens the app. A chat answer streams, Stop works, and the conversation is still there after a
  restart.
- Code mode fixes a broken file with Pi, with every tool call visible.
- Both demos show their speed difference in the app.
- A `tauri build` app starts from Finder and still finds `pi`.
