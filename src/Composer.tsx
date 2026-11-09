import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUp, StopSquare } from "./icons";

type Props = {
  text: string;
  setText: (text: string) => void;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  /** Model, thinking, or folder controls, shown in the bottom row. */
  controls: ReactNode;
  onSend: (text: string) => void;
  onStop: () => void;
};

/**
 * The box at the bottom: text on top, controls and the send button underneath.
 * Enter sends, Shift+Enter adds a line, Escape stops, and the send button turns into Stop.
 */
export default function Composer({ text, setText, busy, disabled, placeholder, controls, onSend, onStop }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to the CSS max-height.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) return;
    const stop = (e: KeyboardEvent) => e.key === "Escape" && onStop();
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [busy, onStop]);

  useEffect(() => box.current?.focus(), []);

  function send() {
    const value = text.trim();
    if (!value || busy || disabled) return;
    onSend(value);
    setText("");
  }

  return (
    <div className="composer">
      <div className="composer-card">
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-row">
          <div className="composer-controls">{controls}</div>
          {busy ? (
            <button className="send stop" title="Stop (Esc)" onClick={onStop}>
              <StopSquare />
            </button>
          ) : (
            <button className="send" title="Send (Enter)" onClick={send} disabled={disabled || !text.trim()}>
              <ArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
