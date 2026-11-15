-- Migration: 20261115012049_cv_ai_edit_quota.sql
-- Description: The CV Studio AI edit allowance — three AI writes a day for a
-- free account, and no limit at all for a paid one.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The CV Studio is where the platform spends the most AI capacity per
-- candidate: the inline assistant writes summaries, headlines, bullet lists,
-- education lines and project descriptions, and the tailoring produces a whole
-- CV aimed at one advertisement. Nothing about that work is metered, so a free
-- account could rewrite its entire CV as often as it liked while paying
-- nothing.
--
-- The allowance is three AI writes in a twenty-four hour window for a free
-- account. Every paid plan keeps the unlimited access it has today.
--
-- WHAT THIS MIGRATION ADDS
-- -------------------------
--   * `public.cv_ai_edit_counters`: one row per profile — how many edits were
--     used in the current window, and when that window ends.
--
--   * `public.cv_ai_edit_limit()`: the number three, in the database, so the
--     application constant and the enforcement can never drift apart.
--
--   * `public.get_cv_ai_edit_state(p_profile_id)`: a read-only report of the
--     allowance. It never resets anything.
--
--   * `public.consume_cv_ai_edit(p_profile_id)`: the atomic write that takes
--     one edit out of the allowance, or refuses to.
--
-- THE WINDOW
-- ----------
-- The window is anchored to the FIRST edit of the window, not to midnight and
-- not to a rolling twenty-four hours. The first edit sets `reset_at` to
-- twenty-four hours later; every edit inside that window shares it; when the
-- window runs out the next edit starts a new one. A candidate who edits at
-- 23:00 is not cut off at midnight and is not handed a fresh allowance at
-- 00:01.
--
-- THE ATOMICITY
-- -------------
-- `consume_cv_ai_edit` takes the profile's advisory lock — the same lock key
-- every other credit function uses — before it reads and before it writes, so
-- two concurrent requests can never both see the last edit as available. The
-- check and the increment happen in one transaction, which is the only way the
-- third edit is the third edit rather than the third and fourth at the same
-- time.
--
-- THE PLAN IS NOT IN THE DATABASE
-- -------------------------------
-- The database knows how many edits an account may make. It does not know
-- whether the account is free or paid, because that answer belongs to the
-- subscription system and changes independently of this table. The application
-- therefore calls `consume_cv_ai_edit` only for limited accounts, and reports
-- an unlimited allowance for paid ones without touching the counter at all.
--
-- OWNERSHIP
-- ---------
-- Every row belongs to exactly one profile, and the profile id is the id
-- verified from the caller's Supabase JWT — never a value supplied by the
-- browser. The table is written and read through the server (service_role),
-- so the browser never needs to write it. The client grants are revoked: a
-- leak of the anon or authenticated key must not allow anyone to manufacture
-- their own allowance.
--
-- BACKWARD COMPATIBLE
-- -------------------
-- This migration only creates a new table, two functions and their policies.
-- No existing table is altered, no row is rewritten and no existing query
-- changes meaning. An account that has never edited anything has no row, and
-- that row appears on the first edit.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cv_ai_edit_counters (
  -- The owner. The id comes from the verified Supabase session.
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- How many edits were used in the current window.
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),

  -- When the current window ends. Set by the first edit of the window.
  reset_at timestamptz NOT NULL,

  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cv_ai_edit_counters IS
  'The CV Studio AI edit allowance: the edits used in the current window and the end of that window.';

-- ---------------------------------------------------------------------------
-- 2. The one place the allowance is defined: THREE edits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cv_ai_edit_limit()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 3;
$$;

COMMENT ON FUNCTION public.cv_ai_edit_limit() IS
  'The number of CV Studio AI edits a limited account may make in one 24-hour window.';

-- The window length, in seconds: twenty-four hours.
CREATE OR REPLACE FUNCTION public.cv_ai_edit_window_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 86400;
$$;

-- ---------------------------------------------------------------------------
-- 3. The read-only state
-- ---------------------------------------------------------------------------
-- It reports the allowance the account is PROMISED — three — even before the
-- first edit, so the interface can say "3 AI edits left" before anything has
-- been written. It never resets the counter: a read has no side effects.

CREATE OR REPLACE FUNCTION public.get_cv_ai_edit_state(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := public.cv_ai_edit_limit();
  v_row record;
  v_used integer := 0;
  v_reset_at timestamptz;
BEGIN
  SELECT used, reset_at INTO v_row
    FROM public.cv_ai_edit_counters
   WHERE profile_id = p_profile_id;

  IF FOUND AND v_row.reset_at > now() THEN
    v_used := LEAST(GREATEST(v_row.used, 0), v_limit);
    v_reset_at := v_row.reset_at;
  END IF;

  RETURN jsonb_build_object(
    'limit', v_limit,
    'used', v_used,
    'remaining', GREATEST(v_limit - v_used, 0),
    'locked', v_used >= v_limit,
    'reset_at', v_reset_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cv_ai_edit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cv_ai_edit_state(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The atomic write
-- ---------------------------------------------------------------------------
-- It takes one edit out of the allowance, or refuses to.
--
-- The refusal is the interesting case. When the allowance is spent the
-- function returns `allowed = false` together with the moment the window
-- ends, so the interface can show a countdown that is TRUE rather than a
-- number nobody checked.
--
-- A window that has run out is not an error: the counter is reset and the
-- edit proceeds, which is how the allowance comes back on its own.
CREATE OR REPLACE FUNCTION public.consume_cv_ai_edit(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := public.cv_ai_edit_limit();
  v_window integer := public.cv_ai_edit_window_seconds();
  v_row record;
  v_used integer := 0;
  v_reset_at timestamptz;
  v_allowed boolean := false;
BEGIN
  -- One edit at a time per profile. The same lock key every other credit
  -- function uses, so a concurrent request cannot take the same last edit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  SELECT used, reset_at INTO v_row
    FROM public.cv_ai_edit_counters
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  IF FOUND AND v_row.reset_at > now() THEN
    -- The window is still running.
    v_used := GREATEST(v_row.used, 0);
    v_reset_at := v_row.reset_at;
  ELSIF FOUND THEN
    -- The window has run out. The allowance is whole again, and the next edit
    -- starts a new window.
    v_used := 0;
    v_reset_at := now() + make_interval(secs => v_window);
  ELSE
    -- The first edit of the first window. It starts the clock.
    v_used := 0;
    v_reset_at := now() + make_interval(secs => v_window);
  END IF;

  IF v_used < v_limit THEN
    v_used := v_used + 1;
    v_allowed := true;

    INSERT INTO public.cv_ai_edit_counters (profile_id, used, reset_at, updated_at)
    VALUES (p_profile_id, v_used, v_reset_at, now())
    ON CONFLICT (profile_id) DO UPDATE
      SET used = EXCLUDED.used,
          reset_at = EXCLUDED.reset_at,
          updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit,
    'used', v_used,
    'remaining', GREATEST(v_limit - v_used, 0),
    'locked', (v_used >= v_limit),
    'reset_at', v_reset_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_cv_ai_edit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_cv_ai_edit(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The refund
-- ---------------------------------------------------------------------------
-- An edit that was taken out of the allowance and then FAILED — the model was
-- unreachable, the response was unusable, the request was cancelled — was never
-- an edit. The candidate must not pay for it.
--
-- The refund gives one edit back, and only inside the window it was taken out
-- of: a refund that arrived after the window had already run out would reset a
-- counter that no longer exists. The count never goes below zero, and a refund
-- can never push the count above the limit either — it can only undo a
-- reservation that was actually made.
CREATE OR REPLACE FUNCTION public.release_cv_ai_edit(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := public.cv_ai_edit_limit();
  v_row record;
  v_used integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  SELECT used, reset_at INTO v_row
    FROM public.cv_ai_edit_counters
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- There is nothing to give back: no reservation was ever recorded.
    RETURN jsonb_build_object('refunded', false, 'used', 0, 'remaining', v_limit);
  END IF;

  IF v_row.reset_at <= now() THEN
    -- The window has run out. The allowance is already whole, and the counter
    -- is left for the next edit to reset.
    RETURN jsonb_build_object(
      'refunded', false,
      'used', GREATEST(v_row.used, 0),
      'remaining', GREATEST(v_limit - GREATEST(v_row.used, 0), 0)
    );
  END IF;

  v_used := GREATEST(LEAST(GREATEST(v_row.used, 0) - 1, v_limit), 0);

  UPDATE public.cv_ai_edit_counters
     SET used = v_used,
         updated_at = now()
   WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'refunded', true,
    'used', v_used,
    'remaining', GREATEST(v_limit - v_used, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_cv_ai_edit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cv_ai_edit(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
-- The counter is read and written through the server, so the browser needs no
-- grant at all. The policies are still there: a request that somehow bypassed
-- the server would read nothing belonging to anybody else.

ALTER TABLE public.cv_ai_edit_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_ai_edit_counters' AND policyname='cv_ai_edit_counters_select_own') THEN
    CREATE POLICY cv_ai_edit_counters_select_own ON public.cv_ai_edit_counters FOR SELECT USING (auth.uid() = profile_id);
  END IF;
END $$;

REVOKE ALL ON public.cv_ai_edit_counters FROM anon;
REVOKE ALL ON public.cv_ai_edit_counters FROM authenticated;

COMMENT ON FUNCTION public.consume_cv_ai_edit(uuid) IS
  'Takes one CV Studio AI edit out of the allowance, or refuses and reports when the window ends.';
COMMENT ON FUNCTION public.release_cv_ai_edit(uuid) IS
  'Gives one CV Studio AI edit back when the edit it was taken for did not happen.';
COMMENT ON FUNCTION public.get_cv_ai_edit_state(uuid) IS
  'The CV Studio AI edit allowance for a profile: used, remaining, and when the window ends.';
