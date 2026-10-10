/*
# ModSquad schema: sessions, messages, usage counters

1. Purpose
   ModSquad is a no-auth public demo of a live-chat moderation bot.
   A single public demo workspace stores every simulated or pasted chat
   session, its per-message moderation results, and a read-only public
   report page per session. All data can be deleted from the UI with one
   button ("delete pasted logs"), so there are no user accounts.

2. New Tables
   - `sessions`
     - `id` (uuid, primary key, default gen_random_uuid())
     - `slug` (text, unique) — short public id used by the read-only report route `/r/:slug`
     - `source` (text) — simulator stream name or "paste"
     - `stream_context` (jsonb) — game/show title, progress, spoiler-free-until text
     - `policy` (jsonb) — the streamer's editable mod policy thresholds at session time
     - `stats` (jsonb) — aggregated counters (messages checked, latency, cost, overrides)
     - `recap` (jsonb) — the end-of-stream LLM recap (null until created)
     - `writer_mode` (text) — which writer produced the recap ("llm" or "mock")
     - `created_at` (timestamptz, default now())
   - `messages`
     - `id` (uuid, primary key, default gen_random_uuid())
     - `session_id` (uuid, FK to sessions, ON DELETE CASCADE)
     - `ts_offset_ms` (int) — message time offset from stream start
     - `username` (text) — fake fixture usernames or pasted-log usernames
     - `text` (text) — the raw chat line (untrusted data)
     - `jev_response` (jsonb) — the full raw Jev answer payload, or a fallback marker
     - `toxic`, `toxic_conf`, `spoiler_p`, `question_p`, `spam_p`, `injection_p` (numeric) — extracted scores/probabilities
     - `topic` (text) — gameplay | streamer | tech | community | off_topic | uncertain
     - `action` (text) — shown | hidden | spoiler | highlight | review (computed by policy)
     - `mod_override` (text) — null, or the action a human mod chose instead
     - `latency_ms` (int) — measured Jev round-trip for this message
     - `cost_usd` (numeric) — computed from input tokens
     - `created_at` (timestamptz, default now())
   - `usage_counters`
     - `fn` (text, part of composite PK with `day`)
     - `day` (date, part of composite PK)
     - `calls` (int, default 0)
     Used by both Edge Functions to enforce a friendly daily cap of 200 calls.

3. Indexes
   - `messages_session_idx` on `messages(session_id)` for session fetches.

4. Security
   - RLS is ENABLED on all three tables.
   - This is a no-auth demo: policies are permissive `TO anon, authenticated`
     with `USING (true)` / `WITH CHECK (true)` because the whole workspace is
     intentionally public and single-tenant. Pasted logs are deletable via the
     UI, and reports are read by slug from any browser without signing in.
   - `usage_counters` also gets permissive anon policies because the Edge
     Functions call it with the service role, but the demo front end may
     display remaining quota.

5. Notes
   - No user_id columns: the demo has no sign-in.
   - CASCADE delete from sessions to messages keeps "delete this session"
     one operation and never orphans rows.
*/

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  source text NOT NULL,
  stream_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  recap jsonb,
  writer_mode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ts_offset_ms int NOT NULL DEFAULT 0,
  username text NOT NULL,
  text text NOT NULL,
  jev_response jsonb,
  toxic numeric(4, 3) NOT NULL DEFAULT 0,
  toxic_conf numeric(4, 3) NOT NULL DEFAULT 0,
  spoiler_p numeric(4, 3) NOT NULL DEFAULT 0,
  question_p numeric(4, 3) NOT NULL DEFAULT 0,
  spam_p numeric(4, 3) NOT NULL DEFAULT 0,
  injection_p numeric(4, 3) NOT NULL DEFAULT 0,
  topic text,
  action text NOT NULL DEFAULT 'shown',
  mod_override text,
  latency_ms int,
  cost_usd numeric(10, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_counters (
  fn text NOT NULL,
  day date NOT NULL,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (fn, day)
);

CREATE INDEX IF NOT EXISTS messages_session_idx ON messages (session_id);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sessions" ON sessions;
CREATE POLICY "anon_select_sessions" ON sessions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sessions" ON sessions;
CREATE POLICY "anon_insert_sessions" ON sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sessions" ON sessions;
CREATE POLICY "anon_update_sessions" ON sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sessions" ON sessions;
CREATE POLICY "anon_delete_sessions" ON sessions
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_usage" ON usage_counters;
CREATE POLICY "anon_select_usage" ON usage_counters
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_usage" ON usage_counters;
CREATE POLICY "anon_insert_usage" ON usage_counters
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_usage" ON usage_counters;
CREATE POLICY "anon_update_usage" ON usage_counters
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
