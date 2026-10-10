import {
  type Action,
  type JevAnswers,
  type ModPolicy,
  type ModeratedMessage,
  type ChatMessage,
  DEFAULT_POLICY,
} from "./types";

export interface JevAnswersWithReasons extends JevAnswers {
  _reasons?: string[];
}

export function computeToxicConfidence(raw: Record<string, unknown>): number {
  if (typeof raw.confidence === "number") return raw.confidence;
  const probs = raw.probabilities as Record<string, number> | undefined;
  if (probs) {
    const values = Object.values(probs).filter((v) => typeof v === "number");
    if (values.length > 0) {
      const max = Math.max(...values);
      const sorted = [...values].sort((a, b) => b - a);
      return Math.max(0, Math.min(1, 2 * max - (sorted[1] ?? 0)));
    }
  }
  const p = typeof raw.score === "number" ? raw.score / 3 : 0.5;
  return Math.abs(2 * Math.min(Math.max(p, 0), 1) - 1);
}

export function extractAnswers(
  raw: Record<string, unknown>,
): JevAnswersWithReasons {
  const a = (raw.answers ?? raw) as Record<string, unknown>;
  const num = (k: string, dflt = 0): number => {
    const v = a[k] as Record<string, unknown> | undefined;
    if (!v) return dflt;
    if (typeof v.noul === "number") return v.noul;
    if (typeof v.score === "number") return v.score;
    if (typeof v.choice === "string") return dflt;
    if (typeof v === "number") return v;
    return dflt;
  };
  const toxicRaw = a.toxic as Record<string, unknown> | undefined;
  const topicRaw = a.topic as Record<string, unknown> | undefined;
  const topic = (topicRaw?.choice as JevAnswers["topic"]) ?? "uncertain";
  const injection = num("injection");
  return {
    toxic: num("toxic"),
    toxic_conf: computeToxicConfidence(toxicRaw ?? {}),
    spoiler: num("spoiler"),
    question: num("question"),
    spam: num("spam"),
    injection,
    topic,
    injection_flag: injection >= 0.5,
  };
}

export interface Decision {
  action: Action;
  reasons: string[];
}

export function decide(
  answers: JevAnswersWithReasons,
  policy: ModPolicy = DEFAULT_POLICY,
): Decision {
  const reasons: string[] = [];
  answers._reasons = reasons;
  let action: Action = "shown";

  if (answers.injection_flag) {
    reasons.push("Instruction-like message flagged (not obeyed)");
  }

  if (answers.toxic >= policy.hide_toxic) {
    action = "hidden";
    reasons.push(`Toxicity ${answers.toxic.toFixed(1)} ≥ ${policy.hide_toxic}`);
  } else if (answers.spam >= policy.hide_spam) {
    action = "hidden";
    reasons.push(`Spam ${answers.spam.toFixed(2)} ≥ ${policy.hide_spam}`);
  } else if (answers.spoiler >= policy.blur_spoiler) {
    action = "spoiler";
    reasons.push(`Spoiler ${answers.spoiler.toFixed(2)} ≥ ${policy.blur_spoiler}`);
  } else if (answers.question >= policy.highlight_question) {
    action = "highlight";
    reasons.push(`Real question (${(answers.question * 100).toFixed(0)}%)`);
  }

  const uncertain =
    (answers.spoiler > 0.4 && answers.spoiler < 0.6) ||
    (answers.question > 0.4 && answers.question < 0.6) ||
    (answers.spam > 0.4 && answers.spam < 0.6) ||
    (answers.toxic > 1 && answers.toxic < policy.hide_toxic) ||
    answers.toxic_conf < 0.5;

  if (uncertain && action !== "hidden") {
    return { action: "review", reasons: [...reasons, "Jev uncertain — mod review"] };
  }
  if (uncertain && action === "hidden") {
    reasons.push("Borderline score — visible to mods");
  }
  return { action, reasons };
}

export interface TimeoutState {
  hideTimes: Map<string, number[]>;
}

export function newTimeoutState(): TimeoutState {
  return { hideTimes: new Map() };
}

export function checkTimeout(
  state: TimeoutState,
  username: string,
  nowMs: number,
  policy: ModPolicy = DEFAULT_POLICY,
): boolean {
  const times = (state.hideTimes.get(username) ?? []).filter(
    (t) => nowMs - t <= policy.timeout_window_ms,
  );
  times.push(nowMs);
  state.hideTimes.set(username, times);
  return times.length >= policy.timeout_hide_count;
}

export function questionPriority(p: number, similarCount: number): number {
  return p * (1 + 0.2 * similarCount);
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s?]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

export function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

export interface QuestionGroup {
  id: string;
  question: string;
  count: number;
  priority: number;
  usernames: string[];
  memberIds: string[];
}

export function groupQuestions(
  messages: ModeratedMessage[],
  policy: ModPolicy = DEFAULT_POLICY,
): QuestionGroup[] {
  const highlightable = messages.filter(
    (m) =>
      m.answers &&
      m.action !== "hidden" &&
      (m.action === "highlight" || m.action === "review") &&
      m.answers.question >= policy.highlight_question * 0.85,
  );

  const groups: { members: ModeratedMessage[]; tokens: Set<string> }[] = [];
  for (const m of highlightable) {
    const tokens = tokenize(m.text);
    let placed = false;
    for (const g of groups) {
      let shared = 0;
      for (const t of tokens) if (g.tokens.has(t)) shared++;
      if (tokens.size > 0 && shared / Math.max(tokens.size, 1) >= 0.5) {
        g.members.push(m);
        for (const t of tokens) g.tokens.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ members: [m], tokens });
  }

  return groups
    .map((g) => {
      const best = [...g.members].sort(
        (a, b) => (b.answers?.question ?? 0) - (a.answers?.question ?? 0),
      )[0];
      const avgP =
        g.members.reduce((s, m) => s + (m.answers?.question ?? 0), 0) /
        g.members.length;
      return {
        id: best.id,
        question: best.text,
        count: g.members.length,
        priority: questionPriority(avgP, g.members.length - 1),
        usernames: [...new Set(g.members.map((m) => m.username))],
        memberIds: g.members.map((m) => m.id),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

export interface HealthPoint {
  t: number;
  health: number;
}

export function chatHealthSeries(
  messages: ModeratedMessage[],
  windowMs = 60_000,
  bucketMs = 10_000,
): HealthPoint[] {
  if (messages.length === 0) return [];
  const end = messages[messages.length - 1].ts_offset_ms;
  const start = messages[0].ts_offset_ms;
  const points: HealthPoint[] = [];
  for (let t = Math.max(0, start); t <= end; t += bucketMs) {
    const window = messages.filter(
      (m) =>
        m.ts_offset_ms > t - windowMs &&
        m.ts_offset_ms <= t &&
        m.override !== "hidden",
    );
    if (window.length === 0) {
      if (points.length > 0) points.push({ t, health: points[points.length - 1].health });
      continue;
    }
    const toxicRate =
      window.filter((m) => (m.answers?.toxic ?? 0) >= 2.5).length / window.length;
    const spamRate =
      window.filter((m) => (m.answers?.spam ?? 0) >= 0.8).length / window.length;
    const spoilerRate =
      window.filter((m) => (m.answers?.spoiler ?? 0) >= 0.6).length / window.length;
    const health = Math.max(
      0,
      Math.min(100, 100 - 40 * toxicRate - 30 * spamRate - 20 * spoilerRate),
    );
    points.push({ t, health: Math.round(health * 10) / 10 });
  }
  return points;
}

const FALLBACK_BLOCKLIST = ["[slur]", "kys", "idiot", "moron", "scam"];
const LINK_RE = /(https?:\/\/|www\.|\.[a-z]{2,}\/)/i;

export interface FallbackAnswers extends JevAnswers {
  fallback: boolean;
}

export function keywordFallback(
  text: string,
  username: string,
  recentContext: string[],
): FallbackAnswers {
  const lower = text.toLowerCase();
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const capsRatio = letters.length > 6 ? (text.replace(/[^A-Z]/g, "").length / letters.length) : 0;
  const isLink = LINK_RE.test(text);
  const hasBadWord = FALLBACK_BLOCKLIST.some((w) => lower.includes(w));
  const isQuestion = text.includes("?");
  const injection =
    /(ignore (your |all )?(rules|instructions)|you must|mod(erator)?,?\s+(unban|ban|promote)|system prompt|disregard)/i.test(
      text,
    );

  return {
    fallback: true,
    toxic: hasBadWord ? 2.8 : 0,
    toxic_conf: hasBadWord ? 0.9 : 0.6,
    spoiler: 0,
    question: isQuestion ? 0.8 : 0,
    spam: isLink || capsRatio > 0.7 ? 0.9 : 0,
    injection: injection ? 1 : 0,
    topic: isQuestion ? "streamer" : "uncertain",
    injection_flag: injection,
  };
}

export function makeFallbackMessage(
  msg: ChatMessage,
  recentContext: string[],
  _sourceIndex: number,
): ModeratedMessage {
  const fb = keywordFallback(msg.text, msg.username, recentContext);
  const { action, reasons } = decide(fb);
  return {
    ...msg,
    answers: { ...fb, _reasons: reasons } as JevAnswersWithReasons,
    jev: { fallback: true, latency_ms: 0, cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } },
    action,
    override: null,
    latency_ms: 0,
    cost_usd: 0,
    fallback: true,
  };
}

export function priorityForRecap(
  questions: QuestionGroup[],
): { question: string; count: number; priority: number }[] {
  return questions.slice(0, 5).map((q) => ({
    question: q.question,
    count: q.count,
    priority: Math.round(q.priority * 100) / 100,
  }));
}
