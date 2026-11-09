-- Migration: 20261116000001_daily_credit_allowance_three.sql
-- Description: The daily free-credit allowance is THREE credits, and it is
-- granted to every eligible account rather than only to the ones that happen
-- to read their balance.
--
-- Why this migration exists
-- -------------------------
-- The allowance was configured as one credit. Every eligible account was
-- therefore entitled to one credit a day, while the product promised three.
-- A candidate who spent that single credit on a one-credit action — the
-- Learning Hub recommendation layer is one credit — was told that the request
-- failed with "Required: 1, Available: 0", which is arithmetically true and
-- completely wrong as a promise.
--
-- Three things are fixed here, in the database, because the database is the
-- only place that cannot drift:
--
--   1. The size of the allowance lives in ONE place — `careerpilot_daily_credit_allowance()`
--      — and the claim function uses it. The application can no longer ask for
--      a smaller allowance by passing a smaller number.
--   2. The claim TOP-UPs a bucket that was created under the old, smaller
--      allowance. An account that already received one credit today is brought
--      up to the full allowance instead of being left short.
--   3. A sweep grants the allowance to every eligible account, so the grant
--      does not depend on the candidate happening to open the application.
--
-- Invariants this migration preserves
-- ----------------------------------
--   * `running_balance = general_balance + sum(daily bucket remaining)`.
--     Every mutation below keeps it true.
--   * The daily bucket is a separate pool. It funds AI operations and nothing
--     else: it never changes a plan, never extends a subscription and never
--     unlocks a paid-only entitlement.
--   * Yesterday's unused allowance expires rather than accumulating.
--   * Purchased credits and paid subscription credits are untouched. Only the
--     daily bucket is topped up.
--   * One advisory lock key per profile, shared by every credit function.

-- ---------------------------------------------------------------------------
-- 1. The one place the allowance is defined
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_daily_credit_allowance()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 3;
$$;

COMMENT ON FUNCTION public.careerpilot_daily_credit_allowance() IS
  'The number of free AI credits an eligible account receives each day (Africa/Cairo).';

-- ---------------------------------------------------------------------------
-- 2. The claim, with the top-up
--
-- The claim is idempotent per Africa/Cairo calendar day. It now also brings a
-- bucket that was created under a smaller allowance up to the full allowance,
-- so an account that was under-granted today is not left short until
-- tomorrow.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_daily_credits(
  p_profile_id uuid,
  p_amount integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_reset timestamptz := public.careerpilot_egypt_next_reset(now());
  v_target integer := public.careerpilot_daily_credit_allowance();
  v_grant public.daily_credit_grants;
  v_balance integer;
  v_granted integer := 0;
  v_topped_up integer := 0;
  v_expired integer := 0;
  v_expired_row record;
  v_confirmed timestamptz;
BEGIN
  -- The parameter is kept for backward compatibility with the callers that
  -- still pass it, but it no longer decides the size of the allowance: the
  -- database owns that number. A caller asking for less cannot reduce it, and
  -- a caller asking for more is capped at the allowance.
  IF p_amount <= 0 OR p_amount > 10 THEN
    RAISE EXCEPTION 'claim_daily_credits: amount must be between 1 and 10';
  END IF;

  -- One credit operation per profile at a time. This is the same lock key
  -- every other credit function uses.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  SELECT running_balance INTO v_balance
    FROM public.ai_credit_ledger
   WHERE profile_id = p_profile_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  -- The account must have a verified email before the allowance applies.
  SELECT email_confirmed_at INTO v_confirmed
    FROM auth.users
   WHERE id = p_profile_id;

  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object(
      'granted', 0,
      'daily_remaining', 0,
      'daily_allowance', 0,
      'balance', COALESCE(v_balance, 0),
      'expires_at', v_reset,
      'grant_date', v_today,
      'email_verified', false
    );
  END IF;

  -- 1. Expire every earlier day's bucket that still holds credits.
  FOR v_expired_row IN
    UPDATE public.daily_credit_grants
       SET remaining = 0
     WHERE profile_id = p_profile_id
       AND grant_date < v_today
       AND remaining > 0
    RETURNING remaining
  LOOP
    v_expired := v_expired + v_expired_row.remaining;
  END LOOP;

  IF v_expired > 0 THEN
    SELECT running_balance INTO v_balance
      FROM public.ai_credit_ledger
     WHERE profile_id = p_profile_id
     ORDER BY created_at DESC, id DESC
     LIMIT 1;

    v_balance := GREATEST(COALESCE(v_balance, 0) - v_expired, 0);

    INSERT INTO public.ai_credit_ledger (
      profile_id, amount, running_balance, operation, source_type,
      idempotency_key, description, metadata
    ) VALUES (
      p_profile_id, -v_expired, v_balance, 'expire', 'daily_allowance',
      'daily-expire:' || p_profile_id::text || ':' || v_today::text,
      'Daily free credits expired',
      jsonb_build_object('expired_credits', v_expired, 'grant_date', v_today::text)
    );
  END LOOP;

  -- 2. Grant today's allowance, at most once per day.
  SELECT * INTO v_grant
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT running_balance INTO v_balance
      FROM public.ai_credit_ledger
     WHERE profile_id = p_profile_id
     ORDER BY created_at DESC, id DESC
     LIMIT 1;

    v_balance := COALESCE(v_balance, 0) + v_target;

    INSERT INTO public.daily_credit_grants (
      profile_id, grant_date, granted_amount, remaining, expires_at
    ) VALUES (
      p_profile_id, v_today, v_target, v_target, v_reset
    )
    ON CONFLICT (profile_id, grant_date) DO NOTHING;

    INSERT INTO public.ai_credit_ledger (
      profile_id, amount, running_balance, operation, source_type,
      idempotency_key, description, metadata
    ) VALUES (
      p_profile_id, v_target, v_balance, 'grant', 'daily_allowance',
      'daily-grant:' || p_profile_id::text || ':' || v_today::text,
      'Daily free credits',
      jsonb_build_object('grant_date', v_today::text, 'expires_at', v_reset)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_granted := v_target;
  ELSIF v_grant.granted_amount < v_target THEN
    -- 3. The bucket was created under a smaller allowance. Top it up.
    --
    --    The extra credits go into the bucket AND into the running balance, so
    --    the invariant `running_balance = general + daily remaining` holds. The
    --    general balance — purchased credits, subscription credits — is not
    --    touched: only the expiring bucket grows.
    v_topped_up := v_target - v_grant.granted_amount;

    SELECT running_balance INTO v_balance
      FROM public.ai_credit_ledger
     WHERE profile_id = p_profile_id
     ORDER BY created_at DESC, id DESC
     LIMIT 1;

    v_balance := COALESCE(v_balance, 0) + v_topped_up;

    UPDATE public.daily_credit_grants
       SET granted_amount = v_target,
           remaining = remaining + v_topped_up
     WHERE id = v_grant.id;

    INSERT INTO public.ai_credit_ledger (
      profile_id, amount, running_balance, operation, source_type,
      idempotency_key, description, metadata
    ) VALUES (
      p_profile_id, v_topped_up, v_balance, 'grant', 'daily_allowance',
      'daily-topup:' || p_profile_id::text || ':' || v_today::text,
      'Daily free credits topped up to the full daily allowance',
      jsonb_build_object(
        'grant_date', v_today::text,
        'expires_at', v_reset,
        'previous_allowance', v_grant.granted_amount,
        'daily_allowance', v_target
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_granted := v_topped_up;
  END IF;

  SELECT * INTO v_grant
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today;

  SELECT running_balance INTO v_balance
    FROM public.ai_credit_ledger
   WHERE profile_id = p_profile_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'granted', v_granted,
    'topped_up', v_topped_up,
    'daily_remaining', COALESCE(v_grant.remaining, 0),
    'daily_allowance', COALESCE(v_grant.granted_amount, v_target),
    'balance', COALESCE(v_balance, 0),
    'expires_at', v_reset,
    'grant_date', v_today,
    'email_verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_credits(uuid, integer) TO service_role;

-- The read-only companion of the claim.
--
-- It reports the allowance the account is PROMISED — three credits — even when
-- today's bucket has not been created yet, so the interface can say "3 free
-- credits a day" before the grant has been made. The remaining count is
-- always the truth.
CREATE OR REPLACE FUNCTION public.get_daily_credit_state(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_target integer := public.careerpilot_daily_credit_allowance();
  v_grant public.daily_credit_grants;
  v_expired integer := 0;
  v_row record;
  v_confirmed timestamptz;
BEGIN
  SELECT email_confirmed_at INTO v_confirmed
    FROM auth.users
   WHERE id = p_profile_id;

  FOR v_row IN
    SELECT remaining
      FROM public.daily_credit_grants
     WHERE profile_id = p_profile_id
       AND grant_date < v_today
       AND remaining > 0
  LOOP
    v_expired := v_expired + v_row.remaining;
  END LOOP;

  SELECT * INTO v_grant
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today;

  RETURN jsonb_build_object(
    'daily_remaining', CASE WHEN v_confirmed IS NULL THEN 0 ELSE COALESCE(v_grant.remaining, 0) END,
    'daily_allowance', CASE WHEN v_confirmed IS NULL THEN 0 ELSE GREATEST(COALESCE(v_grant.granted_amount, 0), v_target) END,
    'expires_at', public.careerpilot_egypt_next_reset(now()),
    'grant_date', v_today,
    'expiring_credits', v_expired,
    'email_verified', v_confirmed IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_credit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_credit_state(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The sweep: the allowance reaches EVERY eligible account
--
-- The claim above is lazy: it happens when the balance is read. That is right
-- for the reader — it is how the balance is always current — but it means an
-- account that never opens the application never receives the allowance it was
-- promised. This sweep closes that gap.
--
-- It is idempotent: an account that already has a bucket for today is skipped,
-- and the account that already has one is topped up by the claim above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_daily_credits_to_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_target integer := public.careerpilot_daily_credit_allowance();
  v_profile record;
  v_result jsonb;
  v_granted integer := 0;
  v_topped_up integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
BEGIN
  FOR v_profile IN
    SELECT p.id
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE u.email_confirmed_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.daily_credit_grants g
          WHERE g.profile_id = p.id AND g.grant_date = v_today
       )
  LOOP
    -- The account is locked by somebody else right now — a purchase, a
    -- deduction, or another sweep. It is skipped rather than waited for: the
    -- next sweep, or the account's own balance read, will finish the job.
    IF NOT pg_try_advisory_xact_lock(hashtextextended(v_profile.id::text, 0)) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      -- The lock is already held by this transaction, so the claim's own
      -- acquisition is re-entrant and does not wait.
      v_result := public.claim_daily_credits(v_profile.id, v_target);
      v_granted := v_granted + COALESCE((v_result ->> 'granted')::integer, 0);
      v_topped_up := v_topped_up + COALESCE((v_result ->> 'topped_up')::integer, 0);
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'grant_date', v_today,
    'daily_allowance', v_target,
    'granted', v_granted,
    'topped_up', v_topped_up,
    'skipped', v_skipped,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_daily_credits_to_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_daily_credits_to_all() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The one-time trial grant, done correctly
--
-- The trial grant used to write a hard-coded running balance of 5. For an
-- account whose real balance was 0 that was wrong twice over: it invented
-- credits and it broke the relationship between the ledger and the bucket.
-- Here the balance is read under the account's own lock and the trial credits
-- are added to it.
--
-- The grant is still once per account: the idempotency key is derived from
-- the profile id, so a replay pays nothing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_trial_credits(
  p_profile_id uuid,
  p_amount integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance integer;
  v_existing public.ai_credit_ledger;
  v_key text := 'trial_initial_' || p_profile_id::text;
BEGIN
  IF p_amount <= 0 OR p_amount > 100 THEN
    RAISE EXCEPTION 'grant_trial_credits: amount out of range';
  END IF;

  SELECT * INTO v_existing
    FROM public.ai_credit_ledger
   WHERE idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', false,
      'already_awarded', true,
      'balance', v_existing.running_balance
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  -- Re-check under the lock: a concurrent grant may have landed while this
  -- transaction was waiting for it.
  SELECT * INTO v_existing
    FROM public.ai_credit_ledger
   WHERE idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', false,
      'already_awarded', true,
      'balance', v_existing.running_balance
    );
  END IF;

  SELECT running_balance INTO v_balance
    FROM public.ai_credit_ledger
   WHERE profile_id = p_profile_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  v_balance := COALESCE(v_balance, 0) + p_amount;

  INSERT INTO public.ai_credit_ledger (
    profile_id, amount, running_balance, operation, source_type,
    idempotency_key, description, metadata
  ) VALUES (
    p_profile_id, p_amount, v_balance, 'grant', 'trial',
    v_key,
    'One-time initial free trial credits (' || p_amount || ' credits)',
    jsonb_build_object('amount', p_amount)
  );

  RETURN jsonb_build_object('granted', true, 'balance', v_balance);
EXCEPTION
  WHEN unique_violation THEN
    SELECT running_balance INTO v_balance
      FROM public.ai_credit_ledger
     WHERE idempotency_key = v_key;
    RETURN jsonb_build_object(
      'granted', false,
      'already_awarded', true,
      'balance', COALESCE(v_balance, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_trial_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_trial_credits(uuid, integer) TO service_role;
