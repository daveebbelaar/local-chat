// Typed wrappers around the Rust commands. React never calls Ollama directly.
import { Channel, invoke } from "@tauri-apps/api/core";
import type { CodeItem } from "./pi";

export type Message = { role: "system" | "user" | "assistant"; content: string };

/** One message as the app shows it: the text plus what we learned while streaming it. */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingStartedAt?: number;
  thinkingSeconds?: number;
  status?: "streaming" | "done" | "stopped" | "error";
  error?: string;
  model?: string;
  stats?: Stats;
};

/** Speed of one finished answer, from the last line Ollama sends. */
export type Stats = {
  tokens: number;
  tokensPerSecond: number;
  loadSeconds: number;
  promptSeconds: number;
};

export type ModelInfo = {
  name: string;
  size: number;
  parameterSize: string;
  contextLength: number;
};

/** `false`, `true`, or a level such as "low". Ollama's /api/show lists the ones a model accepts. */
export type Think = boolean | string;

export type ModelOptions = {
  thinking: { values: Think[]; default: Think } | null;
};

/** Matches `ChatEvent` in src-tauri/src/ollama.rs. */
export type ChatEvent =
  | { event: "thinking"; data: { delta: string } }
  | { event: "text"; data: { delta: string } }
  | { event: "done"; data: Stats & { stopped: boolean } }
  | { event: "error"; data: { message: string } };

export type ChatRequest = {
  model: string;
  messages: Message[];
  think: Think | null;
  contextLength: number;
  temperature: number | null;
};

export function chat(request: ChatRequest, onEvent: (event: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("chat", { request, onEvent: channel });
}

export function listModels() {
  return invoke<ModelInfo[]>("list_models");
}

export function modelOptions(model: string) {
  return invoke<ModelOptions>("model_options", { model });
}

export function unloadModel(model: string) {
  return invoke<void>("unload_model", { model });
}

export function stopChat() {
  return invoke<void>("stop_chat");
}

/** Matches `Conversation` in src-tauri/src/store.rs. */
export type Conversation = {
  id: string;
  title: string;
  mode: "chat" | "code";
  model: string;
  think: Think | null;
  folder: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  items: CodeItem[];
};

export type Summary = { id: string; title: string; mode: Conversation["mode"]; updatedAt: number };

export function newConversation(mode: Conversation["mode"], model: string): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    mode,
    model,
    think: null,
    folder: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
    items: [],
  };
}

export function listConversations() {
  return invoke<Summary[]>("list_conversations");
}

export function loadConversation(id: string) {
  return invoke<Conversation>("load_conversation", { id });
}

export function saveConversation(conversation: Conversation) {
  return invoke<void>("save_conversation", { conversation });
}

export function deleteConversation(id: string) {
  return invoke<void>("delete_conversation", { id });
}

/** Matches `Settings` in src-tauri/src/store.rs. */
export type Settings = {
  systemPrompt: string;
  defaultModel: string;
  temperature: number | null;
  codeModel: string;
  piPath: string;
};

export function loadSettings() {
  return invoke<Settings>("load_settings");
}

export function saveSettings(settings: Settings) {
  return invoke<void>("save_settings", { settings });
}
