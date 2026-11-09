import { useState } from "react";
import type { Summary } from "./api";
import { Gear, Plus, Search, Trash } from "./icons";

export type Mode = Summary["mode"];

type Props = {
  mode: Mode;
  onMode: (mode: Mode) => void;
  conversations: Summary[];
  currentId: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
};

/** Today, Yesterday, or Earlier, so a long list stays easy to scan. */
function group(updatedAt: number) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (updatedAt >= startOfToday) return "Today";
  if (updatedAt >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

export default function Sidebar(props: Props) {
  const { mode, conversations, currentId } = props;
  const [query, setQuery] = useState("");

  const visible = conversations.filter(
    (c) => c.mode === mode && c.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const groups = ["Today", "Yesterday", "Earlier"]
    .map((name) => ({ name, items: visible.filter((c) => group(c.updatedAt) === name) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header" data-tauri-drag-region />
      <div className="mode-switch" role="tablist">
        {(["chat", "code"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => props.onMode(m)}>
            {m === "chat" ? "Chat" : "Code"}
          </button>
        ))}
      </div>
      <button className="new-chat" onClick={props.onNew} title="New (Cmd+N)">
        <Plus />
        {mode === "chat" ? "New chat" : "New task"}
      </button>
      <label className="search">
        <Search />
        <input value={query} placeholder="Search" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <nav className="conversations">
        {groups.map((g) => (
          <section key={g.name}>
            <h3>{g.name}</h3>
            {g.items.map((c) => (
              <div key={c.id} className={`conversation ${c.id === currentId ? "active" : ""}`}>
                <button className="open" title={c.title} onClick={() => props.onOpen(c.id)}>
                  {c.title || "Untitled"}
                </button>
                <button className="delete" title="Delete" aria-label="Delete" onClick={() => props.onDelete(c.id)}>
                  <Trash />
                </button>
              </div>
            ))}
          </section>
        ))}
        {visible.length === 0 && <p className="sidebar-empty">{query ? "No matches" : "Nothing here yet"}</p>}
      </nav>
      <button className="sidebar-footer" onClick={props.onSettings}>
        <Gear />
        Settings
      </button>
    </aside>
  );
}
