import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  chat,
  stopChat,
  type ChatEvent,
  type ChatMessage,
  type Message,
  type ModelInfo,
  type Think,
} from "./api";
import Composer from "./Composer";
import { ChevronRight, Copy, Retry } from "./icons";
import Markdown from "./Markdown";
import ModelPicker from "./ModelPicker";

type Props = {
  models: ModelInfo[];
  model: string;
  think: Think | null;
  onModel: (model: string) => void;
  onThink: (think: Think | null) => void;
  systemPrompt: string;
  temperature: number | null;
  messages: ChatMessage[];
  setMessages: (update: (messages: ChatMessage[]) => ChatMessage[]) => void;
};

const EXAMPLES = [
  "Explain how a hash map works, with a short Python example",
  "Write a polite email asking a client to pay a late invoice",
  "What is the difference between a process and a thread?",
];

export default function ChatView(props: Props) {
  const { models, model, think, systemPrompt, temperature, messages, setMessages } = props;
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Each answer gets a number. Events from an older, stopped answer never touch the newer one.
  const run = useRef(0);

  // After you open another conversation, late events from this one must not land there.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /** Apply a change to one message. */
  function update(index: number, change: (message: ChatMessage) => ChatMessage) {
    if (!alive.current) return;
    setMessages((all) => all.map((m, i) => (i === index ? change(m) : m)));
  }

  /** Ask `text`, continuing from `base` (the messages before it). */
  function send(text: string, base: ChatMessage[] = messages) {
    const history: Message[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
      ...[...base, { role: "user" as const, content: text }].map((m) => ({ role: m.role, content: m.content })),
    ];
    const index = base.length + 1; // where the answer will sit
    const id = ++run.current;
    setMessages(() => [
      ...base,
      { role: "user", content: text },
      { role: "assistant", content: "", status: "streaming", model },
    ]);
    setBusy(true);

    const contextLength = models.find((m) => m.name === model)?.contextLength ?? 8192;
    chat({ model, messages: history, think, contextLength, temperature }, (event: ChatEvent) => {
      switch (event.event) {
        case "thinking":
          update(index, (m) => ({
            ...m,
            thinking: (m.thinking ?? "") + event.data.delta,
            thinkingStartedAt: m.thinkingStartedAt ?? Date.now(),
          }));
          return;
        case "text":
          update(index, (m) => ({ ...finishThinking(m), content: m.content + event.data.delta }));
          return;
        case "done": {
          const { stopped, ...stats } = event.data;
          update(index, (m) =>
            stopped ? { ...finishThinking(m), status: "stopped" } : { ...finishThinking(m), status: "done", stats },
          );
          break;
        }
        case "error":
          update(index, (m) => ({ ...finishThinking(m), status: "error", error: event.data.message }));
          break;
      }
      if (id === run.current) setBusy(false);
    }).catch((error) => {
      // The command itself failed, for example because the backend does not have it yet.
      update(index, (m) => ({ ...finishThinking(m), status: "error", error: String(error) }));
      if (id === run.current) setBusy(false);
    });
  }

  const stop = useCallback(() => {
    stopChat();
    setBusy(false);
    setMessages((all) => all.map((m) => (m.status === "streaming" ? { ...finishThinking(m), status: "stopped" } : m)));
  }, [setMessages]);

  /** Ask the last question again, replacing the last answer. */
  function retry() {
    const question = messages[messages.length - 2];
    if (question?.role === "user") send(question.content, messages.slice(0, -2));
  }

  return (
    <>
      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty">
            <h1>How can I help you?</h1>
            <p>Answers come from {model || "a local model"}, running on this computer.</p>
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button key={example} onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="message user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className={i === messages.length - 1 ? "message assistant last" : "message assistant"}>
                  {m.thinking && <ThinkingBlock message={m} />}
                  <Markdown text={m.content} />
                  {m.status === "streaming" && !m.content && !m.thinking && <div className="pending" />}
                  {m.error && <div className="error">{m.error}</div>}
                  {m.status !== "streaming" && (
                    <div className="answer-footer">
                      <Stats message={m} />
                      <div className="actions">
                        <IconButton title="Copy answer" onClick={() => navigator.clipboard.writeText(m.content)}>
                          <Copy />
                        </IconButton>
                        {i === messages.length - 1 && !busy && (
                          <IconButton title="Try again" onClick={retry}>
                            <Retry />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ),
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>
      <Composer
        text={text}
        setText={setText}
        busy={busy}
        disabled={!model}
        placeholder="Message Chat"
        onSend={(value) => send(value)}
        onStop={stop}
        controls={
          <ModelPicker models={models} model={model} think={think} onModel={props.onModel} onThink={props.onThink} />
        }
      />
    </>
  );
}

/** Freeze the thinking time once the answer starts. */
function finishThinking(m: ChatMessage): ChatMessage {
  if (!m.thinkingStartedAt || m.thinkingSeconds !== undefined) return m;
  return { ...m, thinkingSeconds: (Date.now() - m.thinkingStartedAt) / 1000 };
}

/** "Thinking 4s" while it runs, then a collapsed "Thought for 12s". */
function ThinkingBlock({ message }: { message: ChatMessage }) {
  const running = message.thinkingSeconds === undefined && message.status === "streaming";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const seconds = running ? (now - (message.thinkingStartedAt ?? now)) / 1000 : (message.thinkingSeconds ?? 0);
  const label = running ? `Thinking ${Math.max(0, Math.round(seconds))}s` : `Thought for ${Math.max(1, Math.round(seconds))}s`;

  return (
    <details className="thinking">
      <summary>
        <span className={running ? "shimmer" : ""}>{label}</span>
        <ChevronRight />
      </summary>
      <pre>{message.thinking}</pre>
    </details>
  );
}

/** The speed of one answer. Separate elements, so no separator characters are needed. */
function Stats({ message }: { message: ChatMessage }) {
  if (message.status === "stopped") return <div className="stats">Stopped</div>;
  const stats = message.stats;
  if (!stats) return <div className="stats" />;
  const firstToken = stats.loadSeconds + stats.promptSeconds;
  return (
    <div className="stats">
      <span className="stat strong">{stats.tokensPerSecond.toFixed(1)} tok/s</span>
      <span className="stat">{stats.tokens} tokens</span>
      <span className="stat">{firstToken.toFixed(1)}s to first token</span>
      <span className="stat">{message.model}</span>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}
