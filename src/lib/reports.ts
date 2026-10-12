import { supabase } from "./supabase";
import type { Recap, WriterMode } from "./jev";
import type { StreamContext } from "./types";

// Reports are written and deleted by Edge Functions (the browser only has
// read access). Each saved report comes back with a one-time delete token;
// tokens for pasted-chat reports are kept so "Delete pasted data" can remove them.

const PASTED_TOKENS_KEY = "modsquad.pastedReportTokens";
const MAX_STORED_TOKENS = 50;
const TOKEN_RE = /^[0-9a-f]{64}$/;

let sessionTokens: string[] = [];

function loadTokens(): string[] {
  try {
    const raw = localStorage.getItem(PASTED_TOKENS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string" && TOKEN_RE.test(t));
      }
    }
  } catch {
    // storage unavailable — fall back to this tab's tokens
  }
  return sessionTokens;
}

function storeTokens(tokens: string[]) {
  sessionTokens = tokens.slice(-MAX_STORED_TOKENS);
  try {
    localStorage.setItem(PASTED_TOKENS_KEY, JSON.stringify(sessionTokens));
  } catch {
    // storage unavailable — session-only
  }
}

export interface ReportInput {
  source: string;
  stream_context: StreamContext;
  stats: Record<string, number>;
  recap: Recap;
  writer_mode: WriterMode;
}

export async function createReport(input: ReportInput, pasted: boolean): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    slug: string;
    delete_token: string;
  }>("save-report", { body: input as unknown as Record<string, unknown> });
  if (error || !data?.slug) throw new Error("Couldn't save the report");
  if (pasted && typeof data.delete_token === "string" && TOKEN_RE.test(data.delete_token)) {
    storeTokens([...loadTokens(), data.delete_token]);
  }
  return data.slug;
}

export async function deletePastedReports(): Promise<void> {
  const tokens = loadTokens();
  if (tokens.length === 0) return;
  const { error } = await supabase.functions.invoke("delete-reports", {
    body: { tokens },
  });
  if (!error) storeTokens([]);
}
