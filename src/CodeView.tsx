import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ModelInfo } from "./api";
import Composer from "./Composer";
import { ChevronRight, Folder } from "./icons";
import Markdown from "./Markdown";
import Menu from "./Menu";
import {
  applyPiEvent,
  codeAbort,
  codePrompt,
  codeStart,
  codeStop,
  duration,
  isSettled,
  shortPath,
  toolSummary,
  type CodeItem,
  type PiEvent,
} from "./pi";

type Props = {
  models: ModelInfo[];
  model: string;
  folder: string | null;
  piPath: string;
  items: CodeItem[];
  onModel: (model: string) => void;
  onFolder: (folder: string) => void;
  setItems: (update: (items: CodeItem[]) => CodeItem[]) => void;
  onBusy: (busy: boolean) => void;
};

const EXAMPLES = [
  "Find the bug, fix it, and run the code to prove it works",
  "Explain what this project does and how it is structured",
  "Add a short README that explains how to run this project",
];

const VERBS: Record<string, string> = { read: "Read", write: "Wrote", edit: "Edited", bash: "Ran" };

export default function CodeView(props: Props) {
  const { models, model, folder, piPath, items, setItems, onBusy } = props;
  const [busy, setBusyState] = useState(false);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  // Which folder and model the running Pi process was started with, if any.
  const running = useRef<{ folder: string; model: string } | null>(null);
  const alive = useRef(true);

  const setBusy = useCallback(
    (value: boolean) => {
      setBusyState(value);
      onBusy(value);
    },
    [onBusy],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items]);

  // Leaving this task ends its Pi process.
  useEffect(
    () => () => {
      alive.current = false;
      codeStop();
      onBusy(false);
    },
    [onBusy],
  );

  function handle(event: PiEvent) {
    if (!alive.current) return;
    setItems((all) => applyPiEvent(all, event));
    if (event.type === "exit") running.current = null;
    if (isSettled(event)) setBusy(false);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, title: "Pick the folder Pi may work in" });
    if (typeof picked === "string") props.onFolder(picked);
  }

  async function send(message: string) {
    if (!folder) return;
    setItems((all) => [...all, { kind: "user", text: message }]);
    setBusy(true);
    try {
      const current = running.current;
      if (!current || current.folder !== folder || current.model !== model) {
        if (items.length > 0) {
          setItems((all) => [
            ...all.slice(0, -1),
            { kind: "notice", text: "New Pi session. Earlier messages are not in its memory." },
            all[all.length - 1],
          ]);
        }
        await codeStart(folder, model, piPath, handle);
        running.current = { folder, model };
      }
      await codePrompt(message);
    } catch (error) {
      setItems((all) => [...all, { kind: "notice", text: String(error) }]);
      setBusy(false);
    }
  }

  const stop = useCallback(() => {
    codeAbort().catch(() => {});
  }, []);

  const folderName = folder?.split(/[\\/]/).filter(Boolean).pop();

  return (
    <>
      <div className="messages">
        {items.length === 0 ? (
          <div className="empty">
            <h1>What should Pi build?</h1>
            <p>
              Pi works in {folder ? <code title={folder}>{shortPath(folder)}</code> : "the folder you pick"}, on{" "}
              {model || "a local model"}. It can read and edit files there and run commands.
            </p>
            <div className="examples">
              {folder ? (
                EXAMPLES.map((example) => (
                  <button key={example} onClick={() => setText(example)}>
                    {example}
                  </button>
                ))
              ) : (
                <button onClick={pickFolder}>Pick a folder to start</button>
              )}
            </div>
          </div>
        ) : (
          <div className="thread">
            {folder && (
              <div className="workspace" title={folder}>
                Working in {shortPath(folder)}
              </div>
            )}
            {items.map((item, i) => (
              <CodeItemView key={i} item={item} />
            ))}
            {busy && <div className="pending" />}
            <div ref={bottom} />
          </div>
        )}
      </div>
      <Composer
        text={text}
        setText={setText}
        busy={busy}
        disabled={!folder || !model}
        placeholder={folder ? "Tell Pi what to do" : "Pick a folder first"}
        onSend={send}
        onStop={stop}
        controls={
          <>
            <button type="button" className="control pill" title={folder ?? "Pick a folder"} onClick={pickFolder} disabled={busy}>
              <Folder />
              <span className="control-label">{folderName ?? "Pick folder"}</span>
            </button>
            <Menu
              title="Model"
              label={model || "No model"}
              selected={model}
              onSelect={props.onModel}
              items={models.map((m) => ({
                value: m.name,
                label: m.name,
                detail: `${m.parameterSize}, ${(m.size / 1e9).toFixed(1)} GB`,
              }))}
            />
          </>
        }
      />
    </>
  );
}

function CodeItemView({ item }: { item: CodeItem }) {
  switch (item.kind) {
    case "user":
      return <div className="message user">{item.text}</div>;
    case "notice":
      return <div className="notice">{item.text}</div>;
    case "assistant":
      // Between tool calls Pi often only thinks. Like Claude Code, keep those steps out of the way.
      if (!item.text.trim()) return null;
      return (
        <div className="message assistant">
          {item.thinking && (
            <details className="thinking">
              <summary>
                <span>Thinking</span>
                <ChevronRight />
              </summary>
              <pre>{item.thinking}</pre>
            </details>
          )}
          <Markdown text={item.text} />
        </div>
      );
    case "tool": {
      const status =
        item.status === "running"
          ? "running"
          : item.status === "error"
            ? "failed"
            : item.durationMs !== undefined
              ? duration(item.durationMs)
              : "done";
      return (
        <details className="tool-card">
          <summary>
            <span className="tool-name">{VERBS[item.name] ?? item.name}</span>
            <span className="tool-arg">{toolSummary(item)}</span>
            <span className={`tool-status ${item.status === "error" ? "failed" : item.status === "done" ? "ok" : ""}`}>
              {status}
            </span>
          </summary>
          <pre>{item.output || "No output"}</pre>
        </details>
      );
    }
  }
}
