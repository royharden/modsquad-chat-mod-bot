import { Check, X, TriangleAlert as AlertTriangle } from "lucide-react";
import type { ModeratedMessage } from "../lib/types";
import { effectiveAction } from "./ChatColumn";

export function ModQueue({
  messages,
  onOverride,
}: {
  messages: ModeratedMessage[];
  onOverride: (id: string, action: "shown" | "hidden") => void;
}) {
  const queue = messages.filter(
    (m) => effectiveAction(m) === "review" || m.action === "review",
  );

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-studio-700/70 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-spoiler-400" />
          Mod queue
        </h2>
        <span className="text-xs text-studio-400">
          {queue.length} flagged for review
        </span>
      </div>
      <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
        {queue.length === 0 && (
          <p className="py-6 text-center text-sm text-studio-400">
            Nothing flagged yet. Uncertain Jev calls and instruction-like
            messages land here.
          </p>
        )}
        {queue.map((m) => (
          <div
            key={m.id}
            className="animate-fadeup rounded-lg border border-studio-700 bg-studio-850 p-2.5"
          >
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-semibold text-sm text-studio-200">
                {m.username}
              </span>
              <span className="text-[10px] text-studio-500">
                Jev: {describe(m)}
              </span>
            </div>
            <p className="mb-2 text-sm text-studio-100">{m.text}</p>
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1 py-1 text-xs hover:border-question-500/60 hover:text-question-400"
                onClick={() => onOverride(m.id, "shown")}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                className="btn-ghost flex-1 py-1 text-xs hover:border-toxic-500/60 hover:text-toxic-400"
                onClick={() => onOverride(m.id, "hidden")}
              >
                <X className="h-3.5 w-3.5" /> Hide
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function describe(m: ModeratedMessage): string {
  const a = m.answers;
  if (!a) return "no data";
  const bits: string[] = [];
  if (a.toxic >= 2) bits.push(`toxic ${a.toxic.toFixed(1)}`);
  if (a.spam >= 0.5) bits.push(`spam ${Math.round(a.spam * 100)}%`);
  if (a.injection >= 0.4) bits.push("injection attempt");
  if (bits.length === 0) bits.push("uncertain");
  return bits.join(", ");
}
