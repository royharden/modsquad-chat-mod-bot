import { useEffect, useRef, useState } from "react";
import { TriangleAlert as AlertTriangle, Eye, EyeOff, MessageCircleQuestion, Sparkles, Link2, BadgeAlert } from "lucide-react";
import type { ModeratedMessage, JevAnswersWithReasons } from "../lib/types-extra";
import { TOXIC_LABELS } from "../lib/types";

export function ChatColumn({
  messages,
  elapsedMs,
  playing,
}: {
  messages: ModeratedMessage[];
  elapsedMs: number;
  playing: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (stick) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, stick]);

  return (
    <div className="panel flex min-h-[400px] flex-col">
      <div className="flex items-center justify-between border-b border-studio-700/70 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Chat</h2>
        <span className="text-xs text-studio-400">
          {playing ? "streaming…" : `${messages.length} messages`}
        </span>
      </div>
      <div
        className="flex-1 space-y-1 overflow-y-auto px-3 py-2"
        style={{ maxHeight: "calc(100vh - 260px)" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {messages.map((m) => (
          <ChatLine key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ChatLine({ m }: { m: ModeratedMessage }) {
  const [peek, setPeek] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isHidden = effectiveAction(m) === "hidden";
  const isSpoiler = effectiveAction(m) === "spoiler" && !revealed;

  return (
    <HoverCard m={m}>
      <div
        className={`animate-fadeup rounded-lg px-2.5 py-1.5 text-sm leading-relaxed transition-colors ${
          isHidden
            ? "bg-toxic-500/10"
            : isSpoiler
              ? "bg-spoiler-500/10"
              : effectiveAction(m) === "highlight"
                ? "bg-question-500/10"
                : effectiveAction(m) === "review"
                  ? "bg-spoiler-400/10 border border-spoiler-500/30"
                  : "hover:bg-studio-800/60"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[10px] text-studio-500">
            {formatOffset(m.ts_offset_ms)}
          </span>
          <span className="shrink-0 font-semibold text-studio-200">
            {m.username}
          </span>
          {effectiveAction(m) === "highlight" && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-question-500/20 px-1.5 py-0.5 text-[10px] font-bold text-question-400">
              <MessageCircleQuestion className="h-3 w-3" /> Q
            </span>
          )}
          {m.fallback && (
            <span className="shrink-0 rounded bg-spam-500/20 px-1.5 py-0.5 text-[10px] font-medium text-spam-400">
              Fallback (not Jev)
            </span>
          )}
        </div>

        {isHidden ? (
          <div className="mt-0.5 flex items-center gap-2 text-toxic-400/80 italic">
            {peek ? (
              <>
                <button
                  className="shrink-0 underline decoration-dotted hover:text-toxic-300"
                  onClick={() => setPeek(false)}
                >
                  <EyeOff className="mr-1 inline h-3 w-3" />
                  hide again
                </button>
                <span className="text-studio-300">{m.text}</span>
              </>
            ) : (
              <>
                <span>message hidden (toxic)</span>
                <button
                  className="underline decoration-dotted hover:text-toxic-300"
                  onClick={() => setPeek(true)}
                >
                  <Eye className="mr-1 inline h-3 w-3" />
                  peek
                </button>
              </>
            )}
          </div>
        ) : isSpoiler ? (
          <button
            className="mt-0.5 block w-full text-left"
            onClick={() => setRevealed(true)}
          >
            <span className="inline-flex items-center gap-1.5 rounded bg-spoiler-500/20 px-2 py-0.5 text-[10px] font-semibold text-spoiler-400">
              <Sparkles className="h-3 w-3" /> Spoiler hidden — click to reveal
            </span>
            <span className="mt-1 block select-none blur-sm transition-all hover:blur-[3px]">
              {m.text}
            </span>
          </button>
        ) : (
          <span className="text-studio-100">{m.text}</span>
        )}
      </div>
    </HoverCard>
  );
}

function HoverCard({
  m,
  children,
}: {
  m: ModeratedMessage;
  children: React.ReactNode;
}) {
  const a = m.answers;
  return (
    <div className="group relative">
      {children}
      {a && (
        <div className="pointer-events-none absolute left-2 right-2 top-full z-30 hidden rounded-lg border border-studio-600 bg-studio-850 p-3 shadow-xl shadow-black/50 group-hover:block">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-studio-400">
            Jev answers {m.fallback ? "(keyword fallback)" : ""}
          </div>
          <ProbBar label="Toxic" value={a.toxic / 3} display={a.toxic.toFixed(1)} color="toxic" />
          <ProbBar label="Spoiler" value={a.spoiler} display={pct(a.spoiler)} color="spoiler" />
          <ProbBar label="Question" value={a.question} display={pct(a.question)} color="question" />
          <ProbBar label="Spam" value={a.spam} display={pct(a.spam)} color="spam" />
          <ProbBar label="Injection" value={a.injection} display={pct(a.injection)} color="toxic" />
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-studio-400">
            <span>Topic: {a.topic}</span>
            {a.toxic_conf < 0.5 && (
              <span className="text-toxic-400">low confidence</span>
            )}
          </div>
          {(a as JevAnswersWithReasons)._reasons &&
            (a as JevAnswersWithReasons)._reasons!.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {(a as JevAnswersWithReasons)._reasons!.map((r, i) => (
                  <li key={i} className="flex items-start gap-1 text-[10px] text-studio-300">
                    <BadgeAlert className="mt-0.5 h-3 w-3 shrink-0 text-studio-500" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

const BAR_COLORS: Record<string, string> = {
  toxic: "bg-toxic-500",
  spoiler: "bg-spoiler-500",
  question: "bg-question-500",
  spam: "bg-spam-500",
};

function ProbBar({
  label,
  value,
  display,
  color,
}: {
  label: string;
  value: number;
  display: string;
  color: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-studio-300">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-studio-700">
        <div
          className={`h-full rounded-full ${BAR_COLORS[color]}`}
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-studio-300">
        {display}
      </span>
    </div>
  );
}

export function effectiveAction(m: ModeratedMessage) {
  return m.override ?? m.action;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
