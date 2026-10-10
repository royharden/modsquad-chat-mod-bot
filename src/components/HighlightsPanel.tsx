import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  MessageCircleQuestion,
  Lightbulb,
  Trophy,
  EyeOff,
} from "lucide-react";
import type { ModeratedMessage, StreamContext } from "../lib/types";
import { TOPIC_LABELS, type Topic } from "../lib/types";
import {
  chatHealthSeries,
  groupQuestions,
} from "../lib/policy";
import { effectiveAction } from "./ChatColumn";
import {
  requestAnswerSuggestions,
  type AnswerSuggestion,
} from "../lib/jev";

const TOPIC_COLORS: Record<Topic, string> = {
  gameplay: "#3ddc91",
  streamer: "#b57aff",
  tech: "#4cc3ff",
  community: "#ffb84c",
  off_topic: "#9aa8b6",
  uncertain: "#5d6a76",
};

export function HighlightsPanel({
  messages,
  streamContext,
  writerMode,
}: {
  messages: ModeratedMessage[];
  streamContext: StreamContext;
  writerMode: "llm" | "mock";
}) {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [suggestState, setSuggestState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  const questions = useMemo(() => groupQuestions(messages), [messages]);
  const health = useMemo(() => chatHealthSeries(messages), [messages]);

  const topicMix = useMemo(() => {
    const counts = new Map<Topic, number>();
    for (const m of messages) {
      if (!m.answers) continue;
      counts.set(m.answers.topic, (counts.get(m.answers.topic) ?? 0) + 1);
    }
    return [...counts.entries()].map(([topic, value]) => ({
      name: TOPIC_LABELS[topic],
      value,
    }));
  }, [messages]);

  const leaderboard = useMemo(() => {
    const helpful = new Map<string, number>();
    const hidden = new Map<string, number>();
    for (const m of messages) {
      if (!m.answers) continue;
      if (effectiveAction(m) === "highlight" && m.answers.question >= 0.7) {
        helpful.set(m.username, (helpful.get(m.username) ?? 0) + 1);
      }
      if (effectiveAction(m) === "hidden") {
        hidden.set(m.username, (hidden.get(m.username) ?? 0) + 1);
      }
    }
    return {
      helpful: [...helpful.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      hidden: [...hidden.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [messages]);

  const topQuestions = questions.slice(0, 5);

  const suggest = async () => {
    setSuggestState("loading");
    try {
      const res = await requestAnswerSuggestions(
        topQuestions.map((q) => ({
          question: q.question,
          count: q.count,
          priority: Math.round(q.priority * 100) / 100,
        })),
        streamContext,
        writerMode,
      );
      const map: Record<string, string> = {};
      for (const s of res as AnswerSuggestion[]) map[s.question] = s.suggested_reply;
      setSuggestions((prev) => ({ ...prev, ...map }));
      setSuggestState("idle");
    } catch {
      setSuggestState("error");
    }
  };

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-studio-700/70 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-question-400" />
          Highlights
        </h2>
      </div>

      <div className="space-y-4 p-3">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-studio-400">
            <MessageCircleQuestion className="h-3.5 w-3.5" /> Top questions
          </h3>
          {topQuestions.length === 0 ? (
            <p className="text-xs text-studio-500">No questions detected yet.</p>
          ) : (
            <ul className="space-y-2">
              {topQuestions.map((q) => (
                <li key={q.id} className="rounded-lg bg-studio-850 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-studio-100">{q.question}</p>
                    <span className="shrink-0 rounded-full bg-question-500/15 px-2 py-0.5 text-[10px] font-bold text-question-400">
                      ×{q.count}
                    </span>
                  </div>
                  {suggestions[q.question] && (
                    <p className="mt-1.5 flex gap-1.5 rounded-md bg-question-500/10 p-2 text-xs text-question-300">
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
                      {suggestions[q.question]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {topQuestions.length > 0 && (
            <button
              className="btn-ghost mt-2 w-full py-1 text-xs"
              onClick={suggest}
              disabled={suggestState === "loading"}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              {suggestState === "loading"
                ? "Writing suggestions…"
                : "Suggest answers"}
            </button>
          )}
          {suggestState === "error" && (
            <p className="mt-1 text-xs text-toxic-400">
              Couldn't reach the writer. Try again or use the Mock writer.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-studio-400">
            Chat health (rolling 60s)
          </h3>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={health} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="t" hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7a89" }} />
                <Tooltip
                  contentStyle={{
                    background: "#14181d",
                    border: "1px solid #323b46",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => {
                    const total = Math.floor(Number(t) / 1000);
                    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="health"
                  stroke="#3ddc91"
                  fill="#3ddc91"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-studio-400">
              Topic mix
            </h3>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topicMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={28}
                    outerRadius={50}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {topicMix.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          TOPIC_COLORS[
                            (Object.keys(TOPIC_LABELS) as Topic[]).find(
                              (k) => TOPIC_LABELS[k] === entry.name,
                            ) ?? "uncertain"
                          ]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#14181d",
                      border: "1px solid #323b46",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 9 }} iconSize={7} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-studio-400">
              Leaderboard
            </h3>
            <div className="space-y-1.5 text-xs">
              <p className="flex items-center gap-1 font-medium text-question-400">
                <Trophy className="h-3 w-3" /> Most helpful
              </p>
              {leaderboard.helpful.length === 0 && (
                <p className="text-studio-500">—</p>
              )}
              {leaderboard.helpful.map(([u, n]) => (
                <p key={u} className="flex justify-between text-studio-300">
                  <span className="truncate">{u}</span>
                  <span className="font-mono text-question-400">{n}</span>
                </p>
              ))}
              <p className="flex items-center gap-1 pt-1 font-medium text-toxic-400">
                <EyeOff className="h-3 w-3" /> Most hidden
              </p>
              {leaderboard.hidden.length === 0 && (
                <p className="text-studio-500">—</p>
              )}
              {leaderboard.hidden.map(([u, n]) => (
                <p key={u} className="flex justify-between text-studio-300">
                  <span className="truncate">{u}</span>
                  <span className="font-mono text-toxic-400">{n}</span>
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
