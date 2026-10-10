import { supabase } from "./supabase";
import type { JevResponse, StreamContext } from "./types";
import { extractAnswers } from "./policy";

export interface ModeratePayload {
  stream: StreamContext;
  message: { user: string; text: string };
  recent_context: string[];
}

export class DailyCapError extends Error {}

async function invokeWithRetry<T>(
  fn: string,
  body: unknown,
  tries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    const { data, error } = await supabase.functions.invoke<T>(fn, {
      body: body as Record<string, unknown>,
    });
    if (!error) return data as T;
    const status =
      (error as { status?: number; context?: Response }).status ??
      (error as { context?: Response }).context?.status;
    if (status === 429) {
      const msg =
        (data as { error?: string } | null)?.error ??
        error.message ??
        "Demo daily limit reached — try Offline replay";
      throw new DailyCapError(msg);
    }
    if (status && [429, 500, 502, 503, 504, 529].includes(status)) {
      lastErr = error;
      continue;
    }
    throw new Error(error.message || `Edge function ${fn} failed`);
  }
  throw lastErr instanceof Error ? lastErr : new Error("Edge function failed");
}

export interface ModerateResult {
  answers: JevResponse["answers"];
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
  cost_usd: number;
}

export async function callJev(payload: ModeratePayload): Promise<ModerateResult> {
  const started = performance.now();
  const data = await invokeWithRetry<ModerateResult>("jev-moderate", payload);
  const latency_ms = Math.round(performance.now() - started);
  if (!data || typeof data !== "object" || !("answers" in data)) {
    throw new Error("Unexpected Jev response shape");
  }
  return { ...data, latency_ms };
}

export type WriterMode = "llm" | "mock";

export interface AnswerSuggestion {
  question: string;
  suggested_reply: string;
}

export interface Recap {
  headline: string;
  highlights: string[];
  top_questions: string[];
  mod_summary: string;
  chat_mood: string;
}

export async function requestAnswerSuggestions(
  questions: { question: string; count: number; priority: number }[],
  stream: StreamContext,
  mode: WriterMode,
): Promise<AnswerSuggestion[]> {
  if (mode === "mock") return mockSuggestions(questions);
  const data = await invokeWithRetry<{ suggestions: AnswerSuggestion[] }>(
    "write-recap",
    { mode: "answer_suggestions", questions, stream },
  );
  if (!data?.suggestions || !Array.isArray(data.suggestions)) {
    throw new Error("Unexpected suggestions response");
  }
  return data.suggestions;
}

export async function requestRecap(
  input: {
    stats: Record<string, number>;
    highlights: string[];
    top_questions: string[];
  },
  stream: StreamContext,
  mode: WriterMode,
): Promise<Recap> {
  if (mode === "mock") return mockRecap(input);
  const data = await invokeWithRetry<Recap>("write-recap", {
    mode: "recap",
    ...input,
    stream,
  });
  if (!data?.headline || !Array.isArray(data.highlights)) {
    throw new Error("Unexpected recap response");
  }
  return data;
}

function mockSuggestions(
  questions: { question: string; count: number }[],
): AnswerSuggestion[] {
  return questions.map((q) => ({
    question: q.question,
    suggested_reply: `[Mock writer] ${q.count > 1 ? `Asked ${q.count} times — ` : ""}answer this on stream: "${q.question}"`,
  }));
}

function mockRecap(input: {
  stats: Record<string, number>;
  highlights: string[];
  top_questions: string[];
}): Recap {
  const s = input.stats;
  return {
    headline: `[Mock writer] ${Math.round(s.messages_checked ?? 0)} messages checked, health averaged ${Math.round(s.avg_health ?? 0)}/100`,
    highlights: input.highlights.slice(0, 5),
    top_questions: input.top_questions.slice(0, 5),
    mod_summary: `[Mock writer] ${Math.round(s.hidden ?? 0)} hidden, ${Math.round(s.spoilers_blurred ?? 0)} spoilers blurred, ${Math.round(s.flagged ?? 0)} flagged for review, ${Math.round(s.overrides ?? 0)} mod overrides.`,
    chat_mood:
      (s.avg_health ?? 0) > 85
        ? "positive"
        : (s.avg_health ?? 0) > 60
          ? "mixed"
          : "heated",
  };
}

export { extractAnswers };
