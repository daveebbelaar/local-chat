import { useCallback, useEffect, useState } from "react";
import {
  deleteConversation,
  listConversations,
  listModels,
  loadConversation,
  loadSettings,
  newConversation,
  saveConversation,
  saveSettings,
  stopChat,
  unloadModel,
  type ChatMessage,
  type Conversation,
  type ModelInfo,
  type Settings,
  type Summary,
  type Think,
} from "./api";
import ChatView from "./ChatView";
import CodeView from "./CodeView";
import { NewChat, SidebarToggle } from "./icons";
import type { CodeItem } from "./pi";
import SettingsDialog from "./Settings";
import Sidebar, { type Mode } from "./Sidebar";

export default function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conversations, setConversations] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<Conversation>(() => newConversation("chat", ""));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mode = current.mode;

  const refreshList = useCallback(() => {
    listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    refreshList();
    Promise.all([listModels().catch(() => []), loadSettings()]).then(([list, loaded]) => {
      setModels(list);
      setSettings(loaded);
      setCurrent((c) => (c.model ? c : { ...c, model: pickModel("chat", loaded, list, "") }));
    });
  }, [refreshList]);

  // Save after every finished answer or finished Pi task, never in the middle of one.
  useEffect(() => {
    if (current.messages.length === 0 && current.items.length === 0) return;
    if (current.messages.some((m) => m.status === "streaming") || codeBusy) return;
    saveConversation(current).then(refreshList).catch(console.error);
  }, [current, codeBusy, refreshList]);

  const setMessages = useCallback((update: (messages: ChatMessage[]) => ChatMessage[]) => {
    setCurrent((c) => {
      const messages = update(c.messages);
      const title = c.title || (messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "");
      const updatedAt = messages.length > c.messages.length ? Date.now() : c.updatedAt;
      return { ...c, messages, title, updatedAt };
    });
  }, []);

  const setItems = useCallback((update: (items: CodeItem[]) => CodeItem[]) => {
    setCurrent((c) => {
      const items = update(c.items);
      const first = items.find((i) => i.kind === "user");
      const title = c.title || (first?.kind === "user" ? first.text.slice(0, 60) : "");
      const updatedAt = items.length > c.items.length ? Date.now() : c.updatedAt;
      return { ...c, items, title, updatedAt };
    });
  }, []);

  // Switching models frees the old one, so two large models never share memory.
  const changeModel = useCallback(
    (next: string) => {
      if (current.model && current.model !== next) unloadModel(current.model).catch(() => {});
      setCurrent((c) => ({ ...c, model: next }));
    },
    [current.model],
  );

  const changeThink = useCallback((think: Think | null) => setCurrent((c) => ({ ...c, think })), []);

  function startNew(nextMode: Mode = mode) {
    stopChat();
    const model = pickModel(nextMode, settings, models, current.model);
    if (current.model && current.model !== model) unloadModel(current.model).catch(() => {});
    const fresh = newConversation(nextMode, model);
    // A new Code task keeps the folder you were working in.
    if (nextMode === "code" && current.mode === "code") fresh.folder = current.folder;
    setCurrent(fresh);
  }

  // Cmd+N (Ctrl+N on Windows) starts a new conversation. Cmd+B shows or hides the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        startNew();
      } else if (key === "b") {
        e.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function open(id: string) {
    stopChat();
    const conversation = await loadConversation(id);
    if (current.model && current.model !== conversation.model) unloadModel(current.model).catch(() => {});
    setCurrent({ ...conversation, items: conversation.items ?? [] });
  }

  async function remove(id: string) {
    await deleteConversation(id);
    if (id === current.id) startNew();
    refreshList();
  }

  return (
    <div className={sidebarOpen ? "app" : "app sidebar-closed"}>
      {/* Sits next to the macOS window buttons, and stays put when the sidebar hides. */}
      <div className="window-controls">
        <button
          className="icon-button"
          title={sidebarOpen ? "Hide sidebar (Cmd+B)" : "Show sidebar (Cmd+B)"}
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <SidebarToggle />
        </button>
        {!sidebarOpen && (
          <button className="icon-button" title="New (Cmd+N)" aria-label="New" onClick={() => startNew()}>
            <NewChat />
          </button>
        )}
      </div>
      {sidebarOpen && (
      <Sidebar
        mode={mode}
        onMode={(next) => next !== mode && startNew(next)}
        conversations={conversations}
        currentId={current.id}
        onNew={() => startNew()}
        onOpen={open}
        onDelete={remove}
        onSettings={() => setShowSettings(true)}
      />
      )}
      <main className="main">
        {/* An empty bar you can drag the window by, like a native title bar. */}
        <header className="main-header" data-tauri-drag-region>
          <span className="main-title" data-tauri-drag-region>
            {current.title}
          </span>
        </header>
        {mode === "chat" ? (
          <ChatView
            key={current.id}
            models={models}
            model={current.model}
            think={current.think}
            onModel={changeModel}
            onThink={changeThink}
            systemPrompt={settings?.systemPrompt ?? ""}
            temperature={settings?.temperature ?? null}
            messages={current.messages}
            setMessages={setMessages}
          />
        ) : (
          <CodeView
            key={current.id}
            models={models}
            model={current.model}
            folder={current.folder}
            piPath={settings?.piPath ?? ""}
            items={current.items}
            onModel={changeModel}
            onFolder={(folder) => setCurrent((c) => ({ ...c, folder }))}
            setItems={setItems}
            onBusy={setCodeBusy}
          />
        )}
      </main>
      {showSettings && settings && (
        <SettingsDialog
          settings={settings}
          models={models}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            saveSettings(next).catch(console.error);
            setSettings(next);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The model for a new conversation. Code mode uses the Code model from Settings.
 * Chat uses the default from Settings if it is installed, else the last one used.
 */
function pickModel(mode: Mode, settings: Settings | null, models: ModelInfo[], last: string) {
  const preferred = mode === "code" ? settings?.codeModel : settings?.defaultModel;
  if (preferred && models.some((m) => m.name === preferred)) return preferred;
  return last || models[0]?.name || "";
}
