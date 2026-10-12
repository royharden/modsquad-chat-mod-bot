/*
# Security hardening: daily usage cap and locked-down tables

1. usage_counters
   - Created if missing. RLS stays ENABLED and EVERY policy on it is dropped,
     so anon/authenticated have no policies at all, plus REVOKE ALL.
   - Only ever incremented through `increment_usage(fn_name, cap)`.

2. increment_usage(fn_name text, cap int default 200) returns int
   - SECURITY DEFINER, `SET search_path = public`.
   - Atomic upsert of today's (UTC) row via INSERT ... ON CONFLICT DO UPDATE
     ... RETURNING. Returns the new count, or -1 when the cap is reached
     (the counter then stops growing).
   - EXECUTE revoked from PUBLIC, anon, authenticated; granted to service_role
     only. Edge Functions call it with the service-role client before every
     paid upstream request.

3. sessions / messages
   - Every existing policy is dropped (the old ones let anon UPDATE/DELETE).
   - anon/authenticated keep only SELECT on sessions, which the public
     read-only report page (/r/:slug) needs. messages gets no anon or
     authenticated access: the browser never reads or writes it.
   - Report inserts and deletes go through the save-report / delete-reports
     Edge Functions using the service-role client.

4. session_delete_tokens
   - sha256 hash of a random per-report delete token that save-report returns
     once to the browser that created the report. delete-reports only deletes
     reports whose token the caller holds, so there is no anonymous or global
     delete. RLS on, no policies, no anon/authenticated privileges.

5. Any other public table, and storage
   - anon/authenticated/public INSERT, UPDATE, DELETE and ALL policies are
     dropped. This app has no storage buckets; the storage cleanup is a no-op
     safety net.

6. No keys, URLs or JWTs live in this file. Edge Functions read them from env.
*/

CREATE TABLE IF NOT EXISTS public.usage_counters (
  fn text NOT NULL,
  day date NOT NULL,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (fn, day)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop every policy on the app tables (including any added outside migrations).
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('usage_counters', 'sessions', 'messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END
$$;

-- Any other public table: drop write policies open to anon/authenticated.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END
$$;

-- Storage: same for storage.objects / storage.buckets, if present and ours to change.
DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename IN ('objects', 'buckets')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', pol.policyname, pol.tablename);
  END LOOP;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped storage policy cleanup: insufficient privilege';
END
$$;

-- sessions: public read-only (report page). No anon/authenticated writes.
DROP POLICY IF EXISTS "anon_select_sessions" ON public.sessions;
CREATE POLICY "anon_select_sessions" ON public.sessions
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON TABLE public.sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.sessions TO anon, authenticated;

REVOKE ALL ON TABLE public.messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.usage_counters FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO service_role;

-- Per-report delete tokens (hash only), service-role access only.
CREATE TABLE IF NOT EXISTS public.session_delete_tokens (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_delete_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.session_delete_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.session_delete_tokens TO service_role;

-- Atomic daily counter. Returns the new count, or -1 once the cap is reached.
CREATE OR REPLACE FUNCTION public.increment_usage(fn_name text, cap int DEFAULT 200)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_calls int;
BEGIN
  IF fn_name IS NULL OR fn_name !~ '^[a-z0-9_-]{1,64}$' THEN
    RAISE EXCEPTION 'increment_usage: invalid fn_name';
  END IF;
  IF cap IS NULL OR cap <= 0 THEN
    RETURN -1;
  END IF;

  INSERT INTO public.usage_counters AS uc (fn, day, calls)
  VALUES (fn_name, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (fn, day) DO UPDATE
    SET calls = uc.calls + 1
    WHERE uc.calls < cap
  RETURNING uc.calls INTO new_calls;

  -- No row returned means the WHERE above failed: already at the cap.
  RETURN COALESCE(new_calls, -1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_usage(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(text, int) TO service_role;
