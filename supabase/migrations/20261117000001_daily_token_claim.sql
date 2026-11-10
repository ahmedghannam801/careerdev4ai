-- Migration: 20261117000001_daily_token_claim.sql
-- Description: The daily free allowance becomes a CLAIMED reward of two tokens,
-- and the balance read stops handing it out.
--
-- Why this migration exists
-- -------------------------
-- The daily allowance used to be granted automatically. Two things followed
-- from that, and both of them are wrong for a product that shows a "Claim"
-- button:
--
--   1. Reading the balance granted the allowance. The claim was a side effect
--      of a GET request, so the reward was never actually claimed by anybody —
--      it simply appeared. A button that says "Claim 2 tokens" and a server
--      that has already given them away are two different products.
--   2. The size was three tokens, and it was three tokens by a decision that
--      predates the button. The product promise is now TWO tokens, claimed
--      deliberately.
--
-- What this migration changes
-- ---------------------------
--   1. The allowance is two tokens. `careerpilot_daily_credit_allowance()`
--      is the single place that number lives, and the application constant is
--      asserted to equal it.
--
--   2. The claim is explicit. `claim_daily_credits` is now called ONLY by the
--      explicit claim route. Reading the balance calls the new
--      `expire_daily_credits` instead, which expires yesterday's leftovers
--      and grants nothing.
--
--   3. The state read reports `claimed_today`, which is TRUE as soon as a
--      bucket exists for today — even after every claimed token has been
--      spent. The button reads that flag, so a candidate who claimed and then
--      spent the tokens still sees "Claimed Today" rather than being offered
--      a second claim.
--
--   4. The sweep no longer sweeps. `grant_daily_credits_to_all` grants
--      nothing and says so, so a scheduled job can never quietly hand out the
--      reward that the button exists to hand out.
--
-- Invariants this migration preserves
-- ----------------------------------
--   * `running_balance = general_balance + sum(daily bucket remaining)`.
--   * The daily bucket is a separate pool: it funds AI operations and nothing
--     else. It never changes a plan and never extends a subscription.
--   * Yesterday's unused allowance expires rather than accumulating. This is
--     why the expiry half survives in a function of its own.
--   * Purchased credits and paid subscription credits are untouched.
--   * One advisory lock key per profile, shared by every credit function.

-- ---------------------------------------------------------------------------
-- 1. The one place the allowance is defined: TWO tokens
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_daily_credit_allowance()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2;
$$;

COMMENT ON FUNCTION public.careerpilot_daily_credit_allowance() IS
  'The number of free tokens an eligible account may CLAIM each day (Africa/Cairo).';

-- ---------------------------------------------------------------------------
-- 2. The expiry, on its own
--
-- The claim used to expire yesterday's bucket on its way to granting today's.
-- Now that the grant is a deliberate act, the expiry still has to happen — and
-- it has to happen on the ordinary path, because an account that never claims
-- would otherwise keep yesterday's tokens in its running balance forever and
-- could spend them.
--
-- This function expires and grants nothing. It is what a balance read calls.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_daily_credits(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_balance integer;
  v_expired integer := 0;
  v_expired_row record;
BEGIN
  -- The same lock key every other credit function uses, so an expiry can
  -- never interleave with a purchase, a deduction or a claim.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  FOR v_expired_row IN
    -- The OLD remaining is what is counted. See the note in
    -- `expire_daily_credits`, which has the same shape.
    WITH stale AS (
      SELECT id, remaining AS old_remaining
        FROM public.daily_credit_grants
       WHERE profile_id = p_profile_id
         AND grant_date < v_today
         AND remaining > 0
    )
    UPDATE public.daily_credit_grants g
       SET remaining = 0
      FROM stale s
     WHERE g.id = s.id
    RETURNING s.old_remaining
  LOOP
    v_expired := v_expired + v_expired_row.old_remaining;
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
      'Daily free tokens expired',
      jsonb_build_object('expired_credits', v_expired, 'grant_date', v_today::text)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- The balance is read again at the end, so it is the balance the ledger
  -- holds whether or not anything expired. Returning a zero here would be a
  -- lie the caller would believe: "nothing expired" is not "the balance is
  -- zero".
  SELECT running_balance INTO v_balance
    FROM public.ai_credit_ledger
   WHERE profile_id = p_profile_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'expired', v_expired,
    'balance', COALESCE(v_balance, 0),
    'grant_date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_daily_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_daily_credits(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The claim, unchanged in behaviour but explicitly invoked
--
-- The claim is idempotent per Africa/Cairo calendar day. It still tops up a
-- bucket that was created under the old, larger allowance, so an account that
-- was under-granted today is brought to the full allowance rather than being
-- left short until tomorrow.
--
-- What changed is the CALLER, not the function: this is now the explicit
-- claim the button presses, and nothing else calls it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_daily_credits(
  p_profile_id uuid,
  p_amount integer DEFAULT 2
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
    -- The OLD remaining is what is returned, not the new one.
    --
    -- `UPDATE ... RETURNING remaining` returns the value AFTER the update,
    -- which is zero — the very value this loop is trying to count. The
    -- earlier version of this function had that mistake, so it zeroed the
    -- bucket and then believed it had expired nothing: the tokens left the
    -- bucket and stayed in the running balance, where they could still be
    -- spent long after they had expired. The CTE reads the amount before the
    -- update takes it away.
    WITH stale AS (
      SELECT id, remaining AS old_remaining
        FROM public.daily_credit_grants
       WHERE profile_id = p_profile_id
         AND grant_date < v_today
         AND remaining > 0
    )
    UPDATE public.daily_credit_grants g
       SET remaining = 0
      FROM stale s
     WHERE g.id = s.id
    RETURNING s.old_remaining
  LOOP
    v_expired := v_expired + v_expired_row.old_remaining;
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
      'Daily free tokens expired',
      jsonb_build_object('expired_credits', v_expired, 'grant_date', v_today::text)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

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
      'Daily free tokens claimed',
      jsonb_build_object('grant_date', v_today::text, 'expires_at', v_reset)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_granted := v_target;
  ELSIF v_grant.granted_amount < v_target THEN
    -- 3. The bucket was created under a smaller allowance. Top it up.
    --
    --    The extra tokens go into the bucket AND into the running balance, so
    --    the invariant `running_balance = general + daily remaining` holds. The
    --    general balance — purchased tokens, subscription tokens — is not
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
      'Daily free tokens topped up to the full daily allowance',
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

-- ---------------------------------------------------------------------------
-- 4. The read-only state, with `claimed_today`
--
-- It reports the allowance the account is PROMISED — two tokens — even when
-- today's bucket has not been created yet, so the interface can say "2 free
-- tokens a day" before the claim has been made.
--
-- `claimed_today` is the flag the button reads. It is TRUE as soon as a
-- bucket exists for today, and it stays TRUE after the claimed tokens have
-- been spent. It is deliberately NOT derived from `daily_remaining`: a
-- candidate who claimed two tokens and spent both has still claimed today,
-- and offering them a second claim would be a lie the database has to make.
-- ---------------------------------------------------------------------------

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
  v_has_grant boolean := false;
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

  v_has_grant := FOUND;

  RETURN jsonb_build_object(
    'daily_remaining', CASE WHEN v_confirmed IS NULL THEN 0 ELSE COALESCE(v_grant.remaining, 0) END,
    'daily_allowance', CASE WHEN v_confirmed IS NULL THEN 0 ELSE GREATEST(COALESCE(v_grant.granted_amount, 0), v_target) END,
    'expires_at', public.careerpilot_egypt_next_reset(now()),
    'grant_date', v_today,
    'expiring_credits', v_expired,
    'claimed_today', CASE WHEN v_confirmed IS NULL THEN false ELSE v_has_grant END,
    'email_verified', v_confirmed IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_credit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_credit_state(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The sweep no longer sweeps
--
-- The sweep existed so that the allowance would reach accounts that never
-- opened the application. That was the right reason when the allowance was
-- granted automatically. It is the wrong reason now: the reward is CLAIMED,
-- and a sweep that grants it silently makes the button meaningless.
--
-- The function is kept — its name is still called by the maintenance job, and
-- a scheduled job must never be able to hand out the reward behind the
-- button's back. It grants nothing and says why.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_daily_credits_to_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'manual_claim', true,
    'message', 'The daily allowance is claimed by the candidate and is never granted automatically.',
    'grant_date', public.careerpilot_egypt_date(now()),
    'daily_allowance', public.careerpilot_daily_credit_allowance(),
    'granted', 0,
    'topped_up', 0,
    'skipped', 0,
    'failed', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_daily_credits_to_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_daily_credits_to_all() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The expiry sweep
--
-- The balance read expires the caller's own leftovers, which is enough for
-- anybody who opens the application. This sweep covers the rest: accounts
-- that have not opened it since their allowance expired.
--
-- It expires and grants nothing, for exactly the same reason the grant sweep
-- grants nothing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_all_daily_credits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_profile record;
  v_expired integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_result jsonb;
BEGIN
  FOR v_profile IN
    SELECT DISTINCT profile_id
      FROM public.daily_credit_grants
     WHERE grant_date < v_today
       AND remaining > 0
  LOOP
    BEGIN
      v_result := public.expire_daily_credits(v_profile.profile_id);
      v_expired := v_expired + COALESCE((v_result ->> 'expired')::integer, 0);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired,
    'skipped', v_skipped,
    'failed', v_failed,
    'grant_date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_all_daily_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_all_daily_credits() TO service_role;

COMMENT ON FUNCTION public.grant_daily_credits_to_all() IS
  'Deprecated: the daily allowance is claimed by the candidate. This function grants nothing and exists so that no scheduled job can grant the reward automatically.';
