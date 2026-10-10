import { Pause, Play, Radio, Upload, Rewind as RewindIcon } from "lucide-react";
import { SimulationBadge } from "../App";
import { SIMULATOR_STREAMS } from "../lib/fixtures";
import type { SourceMode } from "../hooks/usePlayback";

interface HeaderProps {
  source: SourceMode;
  onSourceChange: (s: SourceMode) => void;
  mode: "live" | "offline";
  onModeChange: (m: "live" | "offline") => void;
  writerMode: "llm" | "mock";
  onWriterModeChange: (m: "llm" | "mock") => void;
  playback: {
    playing: boolean;
    setPlaying: (p: boolean) => void;
    speed: 1 | 2 | 5;
    setSpeed: (s: 1 | 2 | 5) => void;
    elapsedMs: number;
    durationMs: number;
    seek: (percent: number) => void;
  };
  onOpenPaste: () => void;
}

export function Header({
  source,
  onSourceChange,
  mode,
  onModeChange,
  writerMode,
  onWriterModeChange,
  playback,
  onOpenPaste,
}: HeaderProps) {
  const pct =
    playback.durationMs > 0
      ? (playback.elapsedMs / playback.durationMs) * 100
      : 0;

  return (
    <header className="sticky top-0 z-20 border-b border-studio-700/70 bg-studio-950/95 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            ModSquad:{" "}
            <span className="text-question-400">your chat, moderated live.</span>
          </h1>
          <SimulationBadge />
          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup
              options={[
                { value: "live", label: "Live Jev" },
                { value: "offline", label: "Offline replay" },
              ]}
              value={mode}
              onChange={(v) => onModeChange(v as "live" | "offline")}
            />
            <ToggleGroup
              options={[
                { value: "llm", label: "LLM writer" },
                { value: "mock", label: "Mock writer" },
              ]}
              value={writerMode}
              onChange={(v) => onWriterModeChange(v as "llm" | "mock")}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-studio-600 bg-studio-800 px-3 py-1.5 text-sm text-studio-100"
            value={source.kind === "simulator" ? source.stream : "__paste"}
            onChange={(e) => {
              if (e.target.value === "__paste") {
                onOpenPaste();
              } else {
                onSourceChange({
                  kind: "simulator",
                  stream: e.target.value as SourceMode extends { kind: "simulator"; stream: infer S } ? S : never,
                });
              }
            }}
          >
            {SIMULATOR_STREAMS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__paste">
              {source.kind === "paste" ? "Pasted log (loaded)" : "Paste a chat log…"}
            </option>
          </select>

          <button className="btn-ghost" onClick={onOpenPaste}>
            <Upload className="h-4 w-4" /> Paste log
          </button>

          <div className="mx-2 h-6 w-px bg-studio-700" />

          <button
            className="btn-primary"
            onClick={() => playback.setPlaying(!playback.playing)}
            disabled={playback.durationMs === 0}
          >
            {playback.playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {playback.playing ? "Pause" : "Play"}
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-studio-600 bg-studio-800 p-0.5">
            {([1, 2, 5] as const).map((s) => (
              <button
                key={s}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  playback.speed === s
                    ? "bg-question-500 text-studio-950"
                    : "text-studio-300 hover:text-studio-100"
                }`}
                onClick={() => playback.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <RewindIcon className="h-3.5 w-3.5 text-studio-400" />
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={pct}
              onChange={(e) => playback.seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-studio-600 accent-question-500"
            />
            <span className="w-24 text-right font-mono text-xs text-studio-300">
              {formatMs(playback.elapsedMs)} / {formatMs(playback.durationMs)}
            </span>
          </div>

          {mode === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-toxic-500/15 px-2.5 py-1 text-xs font-medium text-toxic-400">
              <Radio className="h-3 w-3 animate-pulse" />
              Live — every message costs a Jev call
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-studio-600 bg-studio-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.value
              ? "bg-studio-600 text-studio-100"
              : "text-studio-300 hover:text-studio-100"
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
