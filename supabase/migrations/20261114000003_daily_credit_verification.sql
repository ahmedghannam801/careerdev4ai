-- Migration: 20261114000003_daily_credit_verification.sql
-- Description: Gates the daily free-credit allowance on a verified email.
--
-- The allowance is an engagement incentive, so it must only reach accounts
-- that have completed the registration verification. An account whose email
-- has not been confirmed is not eligible, which keeps unverified sign-ups
-- from accumulating free credits.
--
-- The check lives inside the function so it is authoritative and atomic: the
-- server cannot forget it, and there is no extra round trip.

CREATE OR REPLACE FUNCTION public.claim_daily_credits(
  p_profile_id uuid,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_reset timestamptz := public.careerpilot_egypt_next_reset(now());
  v_grant public.daily_credit_grants;
  v_balance integer;
  v_granted integer := 0;
  v_expired integer := 0;
  v_expired_row record;
  v_confirmed timestamptz;
BEGIN
  IF p_amount <= 0 OR p_amount > 10 THEN
    RAISE EXCEPTION 'claim_daily_credits: amount must be between 1 and 10';
  END IF;

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
  END IF;

  -- 2. Grant today's allowance, at most once per day.
  SELECT * INTO v_grant
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today;

  IF NOT FOUND THEN
    SELECT running_balance INTO v_balance
      FROM public.ai_credit_ledger
     WHERE profile_id = p_profile_id
     ORDER BY created_at DESC, id DESC
     LIMIT 1;

    v_balance := COALESCE(v_balance, 0) + p_amount;

    INSERT INTO public.daily_credit_grants (
      profile_id, grant_date, granted_amount, remaining, expires_at
    ) VALUES (
      p_profile_id, v_today, p_amount, p_amount, v_reset
    )
    ON CONFLICT (profile_id, grant_date) DO NOTHING;

    INSERT INTO public.ai_credit_ledger (
      profile_id, amount, running_balance, operation, source_type,
      idempotency_key, description, metadata
    ) VALUES (
      p_profile_id, p_amount, v_balance, 'grant', 'daily_allowance',
      'daily-grant:' || p_profile_id::text || ':' || v_today::text,
      'Daily free credits',
      jsonb_build_object('grant_date', v_today::text, 'expires_at', v_reset)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_granted := p_amount;
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
    'daily_remaining', COALESCE(v_grant.remaining, 0),
    'daily_allowance', COALESCE(v_grant.granted_amount, p_amount),
    'balance', COALESCE(v_balance, 0),
    'expires_at', v_reset,
    'grant_date', v_today,
    'email_verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_credits(uuid, integer) TO service_role;

-- The read-only companion reports whether the account is eligible, so the
-- interface can explain why no allowance is showing.
CREATE OR REPLACE FUNCTION public.get_daily_credit_state(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_grant public.daily_credit_grants;
  v_expired integer := 0;
  v_row record;
  v_confirmed timestamptz;
BEGIN
  SELECT email_confirmed_at INTO v_confirmed
  FROM auth.users
  WHERE id = p_profile_id;

  FOR v_row IN
    SELECT remaining FROM public.daily_credit_grants
     WHERE profile_id = p_profile_id AND grant_date < v_today AND remaining > 0
  LOOP
    v_expired := v_expired + v_row.remaining;
  END LOOP;

  SELECT * INTO v_grant
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today;

  RETURN jsonb_build_object(
    'daily_remaining', CASE WHEN v_confirmed IS NULL THEN 0 ELSE COALESCE(v_grant.remaining, 0) END,
    'daily_allowance', CASE WHEN v_confirmed IS NULL THEN 0 ELSE COALESCE(v_grant.granted_amount, 0) END,
    'expires_at', public.careerpilot_egypt_next_reset(now()),
    'grant_date', v_today,
    'expiring_credits', v_expired,
    'email_verified', v_confirmed IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_credit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_credit_state(uuid) TO service_role;
