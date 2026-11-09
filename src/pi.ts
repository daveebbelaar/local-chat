// Code mode: typed wrappers for the Pi commands, and the logic that turns Pi's events into what the app shows.
import { Channel, invoke } from "@tauri-apps/api/core";

/** One thing in a Code conversation, in order. */
export type CodeItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; thinking: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: Record<string, unknown>;
      output: string;
      status: "running" | "done" | "error";
      durationMs?: number;
    }
  | { kind: "notice"; text: string };

/** A line from Pi's stdout. Only the fields we read are typed. */
export type PiEvent = {
  type: string;
  [key: string]: unknown;
};

type Content = { content?: { type: string; text?: string }[] };

export function codeStart(folder: string, model: string, piPath: string, onEvent: (event: PiEvent) => void) {
  const channel = new Channel<PiEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("code_start", { folder, model, piPath, onEvent: channel });
}

export const codePrompt = (message: string) => invoke<void>("code_prompt", { message });
export const codeAbort = () => invoke<void>("code_abort");
export const codeStop = () => invoke<void>("code_stop");

function textOf(result: unknown) {
  const content = (result as Content | undefined)?.content ?? [];
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

/** Pi has finished the whole task, including retries. `agent_end` can be followed by more work. */
export function isSettled(event: PiEvent) {
  return event.type === "agent_settled" || event.type === "exit";
}

/** Apply one Pi event to the list of items. Unknown events change nothing. */
export function applyPiEvent(items: CodeItem[], event: PiEvent): CodeItem[] {
  switch (event.type) {
    case "message_update": {
      const update = event.assistantMessageEvent as { type: string; delta?: string } | undefined;
      if (!update?.delta) return items;
      const field = update.type === "text_delta" ? "text" : update.type === "thinking_delta" ? "thinking" : null;
      if (!field) return items;
      const last = items[items.length - 1];
      if (last?.kind === "assistant") {
        return [...items.slice(0, -1), { ...last, [field]: last[field] + update.delta }];
      }
      return [...items, { kind: "assistant", text: "", thinking: "", [field]: update.delta }];
    }
    case "tool_execution_start":
      return [
        ...items,
        {
          kind: "tool",
          id: String(event.toolCallId),
          name: String(event.toolName),
          args: (event.args as Record<string, unknown>) ?? {},
          output: "",
          status: "running",
        },
      ];
    case "tool_execution_update":
    case "tool_execution_end":
      return items.map((item) => {
        if (item.kind !== "tool" || item.id !== String(event.toolCallId)) return item;
        if (event.type === "tool_execution_update") return { ...item, output: textOf(event.partialResult) };
        return {
          ...item,
          output: textOf(event.result),
          status: event.isError ? "error" : "done",
          durationMs: event.durationMs as number | undefined,
        };
      });
    case "response":
      // Pi answers every command. A failed one carries an error message.
      if (event.success === false) {
        return [...items, { kind: "notice", text: `Pi: ${String(event.error ?? "command failed")}` }];
      }
      return items;
    case "agent_settled":
      return event.aborted ? [...items, { kind: "notice", text: "Stopped." }] : items;
    case "exit": {
      const log = String(event.log ?? "").trim();
      return [...items, { kind: "notice", text: log ? `Pi stopped.\n${log}` : "Pi stopped." }];
    }
    default:
      return items;
  }
}

/** The one argument worth showing on a collapsed tool card. */
export function toolSummary(item: Extract<CodeItem, { kind: "tool" }>) {
  const { command, path, file_path } = item.args as { command?: string; path?: string; file_path?: string };
  return command ?? path ?? file_path ?? JSON.stringify(item.args);
}

/** "~/Projects/app" instead of the full path, and only the last two folders when it is long. */
export function shortPath(path: string) {
  const home = path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Z]:\\Users\\[^\\]+/, "~");
  const parts = home.split(/[\\/]/).filter(Boolean);
  const lead = home.startsWith("/") ? "/" : "";
  return parts.length > 3 ? `${lead}${parts[0]}/.../${parts.slice(-2).join("/")}` : home;
}

/** "41 ms" for fast tools, "2.3 s" for slow ones. */
export function duration(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
