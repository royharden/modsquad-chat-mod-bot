import { useMemo } from "react";
import { Activity, Clock, DollarSign, GitCompareArrows, Timer } from "lucide-react";
import type { ModeratedMessage } from "../lib/types";
import { effectiveAction } from "./ChatColumn";

const ESTIMATED_LLM_COST_PER_MESSAGE = 0.0009;
const JEV_COST_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export function StatsBar({
  messages,
  overrideRate,
  timeouts,
}: {
  messages: ModeratedMessage[];
  overrideRate: number;
  timeouts: string[];
}) {
  const stats = useMemo(() => {
    const withLatency = messages.filter(
      (m) => !m.fallback && m.latency_ms != null && m.latency_ms > 0,
    );
    const latencies = withLatency
      .map((m) => m.latency_ms as number)
      .sort((a, b) => a - b);
    const avg =
      latencies.length > 0
        ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)
        : 0;
    const p95 =
      latencies.length > 0
        ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
        : 0;
    const jevCost = messages.reduce((s, m) => s + (m.cost_usd ?? 0), 0);
    const llmCost = messages.length * ESTIMATED_LLM_COST_PER_MESSAGE;
    return {
      checked: messages.length,
      avg,
      p95,
      jevCost,
      llmCost,
      hidden: messages.filter((m) => effectiveAction(m) === "hidden").length,
    };
  }, [messages]);

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="h-4 w-4 text-question-400" />
          Stats
        </h2>
        {timeouts.length > 0 && (
          <span className="rounded-full bg-toxic-500/15 px-2 py-0.5 text-[10px] font-semibold text-toxic-400">
            timeout suggested: {timeouts.join(", ")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat
          icon={<Timer className="h-3 w-3" />}
          label="Messages checked"
          value={stats.checked.toString()}
        />
        <Stat
          icon={<Clock className="h-3 w-3" />}
          label="Avg Jev latency"
          value={stats.avg > 0 ? `${stats.avg} ms` : "—"}
        />
        <Stat
          icon={<Clock className="h-3 w-3" />}
          label="p95 latency"
          value={stats.p95 > 0 ? `${stats.p95} ms` : "—"}
        />
        <Stat
          icon={<GitCompareArrows className="h-3 w-3" />}
          label="Override rate"
          value={`${overrideRate.toFixed(0)}%`}
        />
        <Stat
          icon={<DollarSign className="h-3 w-3" />}
          label="Jev cost"
          value={`$${stats.jevCost.toFixed(5)}`}
          hint={`${JEV_COST_PER_INPUT_TOKEN * 1_000_000}¢ / M input tokens`}
        />
        <Stat
          icon={<DollarSign className="h-3 w-3" />}
          label="LLM-per-message est."
          value={`$${stats.llmCost.toFixed(2)}`}
          hint="editable constant"
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-studio-850 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] text-studio-400">
        {icon}
        {label}
      </p>
      <p className="font-mono text-sm font-semibold text-studio-100">{value}</p>
      {hint && <p className="text-[9px] text-studio-500">{hint}</p>}
    </div>
  );
}
