# Chat agent instructions

Read `docs/client-brief.md`, `docs/architecture.md`, and `docs/build-along.md` before changing the project.

## Stack

- Desktop shell: Tauri 2.12 (`tauri` 2.12.5, `@tauri-apps/cli` 2.12.4), Rust edition 2024, Rust 1.85 or newer.
- Backend (`src-tauri/src/`): `std::thread`, `std::process`, `std::fs`, `serde`/`serde_json`, `ureq` (blocking HTTP,
  no TLS). No async runtime.
- Frontend (`src/`): React 19, TypeScript strict, Vite 8, plain CSS. `react-markdown` + `remark-gfm` for answers.
- Plugins: `opener` (links open in the browser), `dialog` (folder picker). Nothing else.
- External tools the user installs: Ollama, Node.js 22.19+, Pi (`@earendil-works/pi-coding-agent` 1.5.0).

## Boundaries

- All HTTP and process work happens in Rust. The webview never calls Ollama or starts processes.
- Stream with `tauri::ipc::Channel`, never with global events.
- Long work runs on a `std::thread`; commands return at once.
- Ollama response types stay in `ollama.rs`. React sees `thinking`, `text`, `done`, `error`.
- Pi stdout lines are forwarded raw; React interprets Pi's event types.
- Pi runs with `PI_CODING_AGENT_DIR=<app data>/pi`. Never read or write `~/.pi/agent`.
- Pi's `models.json` must set `"compat": {"supportsDeveloperRole": false}` for Ollama.
- Kill the Pi child on stop of the Code chat, window close, and app exit.
- Storage is JSON files in the app data folder. Settings are read and written only through `store.rs`.
- Do not add accounts, cloud models, sync, auto-update, or a database.

## Dependencies

- Never add a dependency without asking Dave first.
- Every dependency must earn its place. If only a small function is needed, write it locally.
- Never run `pnpm add` or `cargo add` without explicit approval.
- Pin every direct dependency exactly (`=x.y.z` in Cargo, `x.y.z` in `package.json`) and commit `pnpm-lock.yaml` and
  `src-tauri/Cargo.lock`.
- Keep `savePrefix: ""`, `minimumReleaseAge: 10080`, and `minimumReleaseAgeStrict: true` in `pnpm-workspace.yaml`.
- Install with `pnpm install --frozen-lockfile` and `cargo fetch --locked` (in `src-tauri/`).

## Commands

```bash
pnpm install --frozen-lockfile        # JavaScript dependencies
(cd src-tauri && cargo fetch --locked) # Rust dependencies
pnpm typecheck                         # TypeScript
pnpm build                             # frontend production build
(cd src-tauri && cargo clippy --locked -- -D warnings)
(cd src-tauri && cargo fmt --check)
pnpm tauri dev                         # run the app
pnpm tauri build                       # .app/.dmg on macOS, setup .exe on Windows
```

## Teaching guide

Update `docs/build-along.md` in the same commit as every working slice: outcome, why, exact commands, observable
result, checkpoint.

## Verification policy

- No automated test suites, `tests/` directories, or `*.test.*` files.
- Verify with `pnpm typecheck`, `pnpm build`, `cargo clippy`, `cargo fmt --check`, and a manual walkthrough of both
  modes in `pnpm tauri dev`.
- One heavy job at a time on a laptop: one model loaded, one Rust build.
