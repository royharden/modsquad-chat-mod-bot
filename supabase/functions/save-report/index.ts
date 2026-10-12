import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Saves an end-of-stream report (the browser has no INSERT access to
// sessions). Only whitelisted, bounded columns are written. The response
// carries a one-time delete token; only its sha256 hash is stored.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FN_NAME = "save-report";

// Daily cap on saved reports (DAILY_CALL_LIMIT secret overrides it).
const DEFAULT_DAILY_CAP = 200;
const DAILY_LIMIT_BODY = {
  error: "Demo daily limit reached - Offline demo still works",
  code: "daily_limit",
};

// Request bounds (recap limits match write-recap's output bounds).
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_CHARS = 200;
const MAX_STREAM_FIELD_CHARS = 500;
const MAX_STATS = 20;
const MAX_HEADLINE_CHARS = 1000;
const MAX_ITEMS = 20;
const MAX_ITEM_CHARS = 2000;
const MAX_SUMMARY_CHARS = 4000;
const MAX_MOOD_CHARS = 200;

const SLUG_WORDS = ["chat", "stream", "queue", "health", "recap", "spoiler", "highlight"];
const SLUG_ATTEMPTS = 3;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Service-role client from env only; null (-> 503) if either var is missing.
function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ServiceClient = NonNullable<ReturnType<typeof serviceClient>>;

function dailyCap(): number {
  const raw = Deno.env.get("DAILY_CALL_LIMIT");
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  // A malformed override falls back to the default instead of lifting the cap.
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : DEFAULT_DAILY_CAP;
}

// Counts one call. Fails closed: an RPC error or any result other than a
// positive integer (or -1 for "over the cap") is treated as unavailable.
async function takeQuota(supabase: ServiceClient): Promise<"ok" | "limit" | "unavailable"> {
  try {
    const { data, error } = await supabase.rpc("increment_usage", {
      fn_name: FN_NAME,
      cap: dailyCap(),
    });
    if (error) {
      console.error(`${FN_NAME}: increment_usage failed`, error);
      return "unavailable";
    }
    if (typeof data !== "number" || !Number.isInteger(data)) {
      console.error(`${FN_NAME}: increment_usage returned a non-integer result`, data);
      return "unavailable";
    }
    if (data === -1) return "limit";
    return data >= 1 ? "ok" : "unavailable";
  } catch (err) {
    console.error(`${FN_NAME}: increment_usage threw`, err);
    return "unavailable";
  }
}

// Reads the body with a hard byte cap (Content-Length is checked first, then
// the stream is cut off once it passes the cap).
async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  if (!req.body) return { ok: false, status: 400, error: "Invalid JSON body" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, error: "Request body too large" };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

class ValidationError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function boundedString(v: unknown, max: number, field: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`);
  if (v.length > max) {
    throw new ValidationError(`${field} is too long (max ${max} characters)`);
  }
  return v;
}

function boundedStringList(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array`);
  if (v.length > MAX_ITEMS) {
    throw new ValidationError(`${field} has too many items (max ${MAX_ITEMS})`);
  }
  return v.map((s, i) => boundedString(s, MAX_ITEM_CHARS, `${field}[${i}]`));
}

// Whitelisted columns only; id, slug, policy and created_at are set here.
function parseReport(body: unknown) {
  if (!isRecord(body)) throw new ValidationError("Body must be a JSON object");

  const stream = body.stream_context ?? {};
  if (!isRecord(stream)) throw new ValidationError("stream_context must be an object");

  const rawStats = body.stats ?? {};
  if (!isRecord(rawStats)) throw new ValidationError("stats must be an object");
  const statEntries = Object.entries(rawStats);
  if (statEntries.length > MAX_STATS) {
    throw new ValidationError(`stats has too many entries (max ${MAX_STATS})`);
  }
  const stats: Record<string, number> = {};
  for (const [k, v] of statEntries) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) throw new ValidationError("stats has an invalid key");
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new ValidationError(`stats.${k} must be a number`);
    }
    stats[k] = v;
  }

  const recap = body.recap;
  if (!isRecord(recap)) throw new ValidationError("recap must be an object");
  const headline = boundedString(recap.headline, MAX_HEADLINE_CHARS, "recap.headline");
  if (headline.trim() === "") throw new ValidationError("recap.headline is required");

  const writerMode = body.writer_mode;
  if (writerMode !== "llm" && writerMode !== "mock") {
    throw new ValidationError("writer_mode must be llm or mock");
  }

  return {
    source: boundedString(body.source, MAX_SOURCE_CHARS, "source") || "simulation",
    stream_context: {
      title: boundedString(stream.title, MAX_STREAM_FIELD_CHARS, "stream_context.title"),
      progress: boundedString(stream.progress, MAX_STREAM_FIELD_CHARS, "stream_context.progress"),
      spoiler_free_until: boundedString(
        stream.spoiler_free_until,
        MAX_STREAM_FIELD_CHARS,
        "stream_context.spoiler_free_until",
      ),
    },
    policy: {},
    stats,
    recap: {
      headline,
      highlights: boundedStringList(recap.highlights, "recap.highlights"),
      top_questions: boundedStringList(recap.top_questions, "recap.top_questions"),
      mod_summary: boundedString(recap.mod_summary, MAX_SUMMARY_CHARS, "recap.mod_summary"),
      chat_mood: boundedString(recap.chat_mood, MAX_MOOD_CHARS, "recap.chat_mood"),
    },
    writer_mode: writerMode,
  };
}

function makeSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  const word = SLUG_WORDS[bytes[0] % SLUG_WORDS.length];
  const suffix = Array.from(bytes.slice(1), (b) => (b % 36).toString(36)).join("");
  return `${word}-${suffix}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = serviceClient();
    if (!supabase) {
      console.error(`${FN_NAME}: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set`);
      return json({ error: "Service unavailable" }, 503);
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body.ok) return json({ error: body.error }, body.status);
    const row = parseReport(body.value);

    const quota = await takeQuota(supabase);
    if (quota === "limit") return json(DAILY_LIMIT_BODY, 429);
    if (quota !== "ok") return json({ error: "Usage counter unavailable" }, 503);

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = makeSlug();
      const { data, error } = await supabase
        .from("sessions")
        .insert({ ...row, slug })
        .select("id")
        .single();
      if (error?.code === "23505") continue; // slug collision, try another
      if (error || !data) {
        console.error(`${FN_NAME}: insert failed`, error);
        return json({ error: "Couldn't save the report" }, 500);
      }

      const deleteToken = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const { error: tokenErr } = await supabase
        .from("session_delete_tokens")
        .insert({ session_id: data.id, token_hash: await sha256Hex(deleteToken) });
      if (tokenErr) {
        console.error(`${FN_NAME}: delete token insert failed`, tokenErr);
        await supabase.from("sessions").delete().eq("id", data.id);
        return json({ error: "Couldn't save the report" }, 500);
      }

      return json({ slug, delete_token: deleteToken });
    }

    console.error(`${FN_NAME}: no free slug after ${SLUG_ATTEMPTS} attempts`);
    return json({ error: "Couldn't save the report" }, 500);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.message }, 422);
    console.error(`${FN_NAME}: unexpected error`, err);
    return json({ error: "Internal error" }, 500);
  }
});
