import { useEffect, useState } from "react";
import { modelOptions, type ModelInfo, type ModelOptions, type Think } from "./api";
import { Bulb } from "./icons";
import Menu from "./Menu";

type Props = {
  models: ModelInfo[];
  model: string;
  think: Think | null;
  onModel: (model: string) => void;
  onThink: (think: Think | null) => void;
};

function thinkLabel(value: Think) {
  if (value === false) return "Off";
  if (value === true) return "On";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The model button and, for models that think, a thinking pill.
 * Levels (gpt-oss, qwen3.8) get a menu, on/off models get a toggle,
 * and models that always think (qwen3:30b) or never think get nothing.
 */
export default function ModelPicker({ models, model, think, onModel, onThink }: Props) {
  // Remember which model the options belong to, so we never apply one model's levels to another.
  const [options, setOptions] = useState<{ model: string; value: ModelOptions } | null>(null);

  useEffect(() => {
    if (!model) return;
    modelOptions(model)
      .then((value) => setOptions({ model, value }))
      .catch(() => setOptions({ model, value: { thinking: null } }));
  }, [model]);

  // Keep the thinking level valid for this model. Fall back to the model's own default.
  const loaded = options?.model === model;
  const thinking = loaded ? options.value.thinking : null;
  useEffect(() => {
    if (!loaded) return;
    if (!thinking) {
      if (think !== null) onThink(null);
    } else if (think === null || !thinking.values.includes(think)) {
      onThink(thinking.default);
    }
  }, [loaded, thinking, think, onThink]);

  const values = thinking?.values ?? [];
  const isToggle = values.length === 2 && values.includes(true) && values.includes(false);

  return (
    <>
      <Menu
        title="Model"
        label={model || "No model"}
        selected={model}
        onSelect={onModel}
        items={models.map((m) => ({
          value: m.name,
          label: m.name,
          detail: `${m.parameterSize}, ${(m.size / 1e9).toFixed(1)} GB`,
        }))}
      />
      {think !== null && isToggle && (
        <button
          type="button"
          className={think ? "control pill on" : "control pill"}
          title="Thinking"
          onClick={() => onThink(!think)}
        >
          <Bulb />
          <span className="control-label">Thinking</span>
        </button>
      )}
      {think !== null && values.length > 1 && !isToggle && (
        <Menu
          pill
          title="Thinking"
          icon={<Bulb />}
          label={think === false ? "No thinking" : `Thinking: ${thinkLabel(think)}`}
          selected={JSON.stringify(think)}
          onSelect={(value) => onThink(JSON.parse(value))}
          items={values.map((value) => ({ value: JSON.stringify(value), label: thinkLabel(value) }))}
        />
      )}
    </>
  );
}
