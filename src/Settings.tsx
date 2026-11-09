import { useState } from "react";
import type { ModelInfo, Settings } from "./api";

type Props = {
  settings: Settings;
  models: ModelInfo[];
  onSave: (settings: Settings) => void;
  onClose: () => void;
};

export default function SettingsDialog({ settings, models, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [temperature, setTemperature] = useState(settings.temperature?.toString() ?? "");

  function save() {
    const value = temperature.trim() === "" ? null : Number(temperature);
    onSave({ ...draft, temperature: value === null || Number.isNaN(value) ? null : value });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="field">
          <span>System prompt, sent before every chat</span>
          <textarea
            rows={4}
            value={draft.systemPrompt}
            placeholder="You are a concise assistant."
            onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Default model for new chats</span>
          <select
            value={draft.defaultModel}
            onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
          >
            <option value="">The model you used last</option>
            {models.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Temperature (empty uses the model's default, 0 gives repeatable answers)</span>
          <input
            inputMode="decimal"
            value={temperature}
            placeholder="Model default"
            onChange={(e) => setTemperature(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Code mode model</span>
          <select value={draft.codeModel} onChange={(e) => setDraft({ ...draft, codeModel: e.target.value })}>
            {!models.some((m) => m.name === draft.codeModel) && <option>{draft.codeModel}</option>}
            {models.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Path to pi (empty finds it on your PATH)</span>
          <input
            value={draft.piPath}
            placeholder="/usr/local/bin/pi"
            onChange={(e) => setDraft({ ...draft, piPath: e.target.value })}
          />
        </label>
        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
