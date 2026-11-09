-- Migration: 20261116000002_daily_credit_sweep_topup.sql
-- Description: The daily-credit sweep also brings an account that was granted
-- under the old, smaller allowance up to the full allowance.
--
-- Why
-- ---
-- The first sweep only looked at accounts that had NO bucket for today. An
-- account that received one credit this morning — before the allowance became
-- three — already had a bucket, so the sweep skipped it and it stayed short
-- until tomorrow.
--
-- The sweep now selects every eligible account whose bucket for today is
-- missing OR smaller than the allowance, and lets `claim_daily_credits` do
-- the work: it creates the bucket when it is missing and tops it up when it
-- is short. Both paths are idempotent, so the sweep can run as often as the
-- scheduler likes: the second run in a day grants nothing.

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
         SELECT 1
           FROM public.daily_credit_grants g
          WHERE g.profile_id = p.id
            AND g.grant_date = v_today
            AND g.granted_amount >= v_target
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
