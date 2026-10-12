import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Deletes reports the caller created (the browser has no DELETE access to
// sessions). Each report can only be deleted with the one-time token that
// save-report returned for it, so this is not a global/admin delete.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FN_NAME = "delete-reports";

// Daily cap on delete calls (DAILY_CALL_LIMIT secret overrides it).
const DEFAULT_DAILY_CAP = 200;
const DAILY_LIMIT_BODY = {
  error: "Demo daily limit reached - Offline demo still works",
  code: "daily_limit",
};

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TOKENS = 50;
const TOKEN_RE = /^[0-9a-f]{64}$/;

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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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
    const tokens = (body.value as { tokens?: unknown } | null)?.tokens;
    if (
      !Array.isArray(tokens) ||
      tokens.length === 0 ||
      tokens.length > MAX_TOKENS ||
      !tokens.every((t) => typeof t === "string" && TOKEN_RE.test(t))
    ) {
      return json(
        { error: `tokens must be 1-${MAX_TOKENS} delete tokens` },
        422,
      );
    }

    const quota = await takeQuota(supabase);
    if (quota === "limit") return json(DAILY_LIMIT_BODY, 429);
    if (quota !== "ok") return json({ error: "Usage counter unavailable" }, 503);

    const hashes = await Promise.all((tokens as string[]).map(sha256Hex));
    const { data: rows, error } = await supabase
      .from("session_delete_tokens")
      .select("session_id")
      .in("token_hash", hashes);
    if (error) {
      console.error(`${FN_NAME}: token lookup failed`, error);
      return json({ error: "Couldn't delete reports" }, 500);
    }

    const ids = (rows ?? []).map((r: { session_id: string }) => r.session_id);
    if (ids.length === 0) return json({ deleted: 0 });

    // Cascades to messages and session_delete_tokens.
    const { error: delErr, count } = await supabase
      .from("sessions")
      .delete({ count: "exact" })
      .in("id", ids);
    if (delErr) {
      console.error(`${FN_NAME}: delete failed`, delErr);
      return json({ error: "Couldn't delete reports" }, 500);
    }

    return json({ deleted: count ?? ids.length });
  } catch (err) {
    console.error(`${FN_NAME}: unexpected error`, err);
    return json({ error: "Internal error" }, 500);
  }
});
