import type { ModPolicy } from "../lib/types";

export function SettingsPanel({
  policy,
  onChange,
}: {
  policy: ModPolicy;
  onChange: (p: ModPolicy) => void;
}) {
  const set = (key: keyof ModPolicy, value: number) =>
    onChange({ ...policy, [key]: value });

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="text-sm font-semibold">Mod policy</h3>
      <p className="text-xs text-studio-400">
        Jev scores each message; these thresholds decide the action. All
        decisions run in code, never in the model.
      </p>
      <Slider
        label="Hide when toxicity ≥"
        value={policy.hide_toxic}
        min={1}
        max={3}
        step={0.1}
        onChange={(v) => set("hide_toxic", v)}
        format={(v) => v.toFixed(1)}
      />
      <Slider
        label="Hide when spam ≥"
        value={policy.hide_spam}
        min={0.5}
        max={1}
        step={0.05}
        onChange={(v) => set("hide_spam", v)}
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Blur as spoiler ≥"
        value={policy.blur_spoiler}
        min={0.3}
        max={0.9}
        step={0.05}
        onChange={(v) => set("blur_spoiler", v)}
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Highlight question ≥"
        value={policy.highlight_question}
        min={0.5}
        max={0.95}
        step={0.05}
        onChange={(v) => set("highlight_question", v)}
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Timeout after N hides"
        value={policy.timeout_hide_count}
        min={2}
        max={6}
        step={1}
        onChange={(v) => set("timeout_hide_count", v)}
        format={(v) => v.toFixed(0)}
      />
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs text-studio-300">
        {label}
        <span className="font-mono font-semibold text-question-400">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-studio-600 accent-question-500"
      />
    </label>
  );
}
