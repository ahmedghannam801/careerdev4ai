-- Migration: 20261128000001_plan_daily_ai_credits.sql
-- Description: The daily allowance becomes a PLAN entitlement, and a paid
-- account receives it without pressing anything.
--
-- Why this migration exists
-- -------------------------
-- A Pro subscriber writes in that they are not receiving their daily AI
-- token increase. The investigation found that they are right, and it found
-- three separate reasons why:
--
--   1. THERE IS NO PRO DAILY ALLOWANCE ANYWHERE.
--      The only daily allowance that exists is `careerpilot_daily_credit_allowance()`,
--      a single number — two — for every account on the platform. It is not
--      read from `subscription_plans`, and the `features` column of the Pro
--      plan carries no daily-allowance key. Pro's configured entitlement is
--      SIXTY CREDITS A MONTH. The monthly allocation and the daily allowance
--      are two different promises, and only the monthly one is attached to
--      the plan.
--
--   2. NOTHING GRANTS THE ALLOWANCE AUTOMATICALLY.
--      The daily reward is CLAIMED, by hand, from a button. The sweep that
--      used to grant it to every eligible account was deliberately neutered
--      by migration 20261117000001, so a scheduled job cannot hand it out at
--      all. A subscriber who never opens the application never receives the
--      day; a subscriber who opens it must notice the button.
--
--   3. THE ALLOWANCE IS NOT PLAN-SCOPED.
--      Because the number is a global constant, there is nowhere to record
--      that one plan is entitled to more of it than another. Fixing the
--      delivery without fixing the shape would leave the platform unable to
--      express the promise in the first place.
--
-- What this migration changes
-- ---------------------------
--   1. `subscription_plans` gains a `daily_ai_credits` column: the number of
--      daily AI credits the plan entitles its account to. It is seeded with
--      the allowance that is in force today — TWO — for every plan, so no
--      commercial promise changes here. The number is DISCOVERED, not
--      invented: two is what `careerpilot_daily_credit_allowance()` already
--      returns and what `shared/credits.ts` already promises. Giving Pro its
--      own number is now one `UPDATE` against this column, with no code
--      change and no deployment.
--
--   2. `careerpilot_daily_credit_allowance(p_profile_id)` resolves the
--      allowance FOR AN ACCOUNT: the plan's own number when the account has an
--      active subscription, and the base allowance otherwise. A plan can
--      raise the allowance; it can never lower it below the free allowance,
--      because the free allowance is a benefit that already exists and this
--      migration is not allowed to remove one.
--
--   3. `ensure_daily_credit_entitlement(p_profile_id)` grants today's
--      allowance to an account that has an ACTIVE SUBSCRIPTION, and grants
--      nothing to an account that has not. This is the entitlement, and it
--      arrives on its own.
--
--   4. `grant_daily_entitlements_to_all()` is the sweep that calls it for
--      every eligible account. It is idempotent, it never blocks on a busy
--      account, and a failed run is picked up by the next one.
--
--   5. The claim and the state read use the account's own allowance, so the
--      button, the balance and the ledger all agree with each other and with
--      the plan.
--
-- What is NOT changed
-- -------------------
--   * The free daily allowance of two tokens, and the button that claims it.
--     `grant_daily_credits_to_all()` still grants nothing: the FREE reward
--     is still claimed on purpose, and the sweep still says so.
--   * The monthly allocation of the plans: 0, 25, 60 and 120 credits.
--   * The prices, the plan names, the credit cost of every AI action, the
--     payment verification, the manual renewal rules and the access rules.
--   * The balance the ledger holds. No balance is overwritten; the daily
--     bucket is only ever created or topped up.
--
-- Invariants this migration preserves
-- -----------------------------------
--   * `running_balance = general_balance + sum(daily bucket remaining)`.
--   * The daily bucket is a separate pool. It funds AI operations and nothing
--     else: it never changes a plan, never extends a subscription and never
--     unlocks a paid-only entitlement.
--   * Yesterday's unused allowance expires rather than accumulating.
--   * Purchased credits and paid subscription credits are untouched.
--   * One advisory lock key per profile, shared by every credit function.
--   * One grant row per profile per Africa/Cairo day, and one ledger row per
--     grant: the unique constraints and the idempotency key are the proof
--     that a repeated request cannot pay out twice.

-- ---------------------------------------------------------------------------
-- 1. The plan's daily allowance
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS daily_ai_credits integer NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subscription_plans_daily_ai_credits_check'
       AND conrelid = 'public.subscription_plans'::regclass
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_daily_ai_credits_check
      CHECK (daily_ai_credits >= 0 AND daily_ai_credits <= 100);
  END IF;
END;
$$;

COMMENT ON COLUMN public.subscription_plans.daily_ai_credits IS
  'The daily AI credits this plan entitles an account to. Seeded with the allowance already in force (2); the value is a product decision and is changed here, not in code.';

-- The column's default has already filled every existing plan with the
-- allowance that is in force today. Nothing is updated here on purpose: the
-- seed is the default, and a plan that is given its own number later is
-- changed by one UPDATE against this column, with no code change and no
-- deployment.

-- ---------------------------------------------------------------------------
-- 2. The plan an account is entitled under
--
-- An account is entitled under a plan when the subscription is active, the
-- plan itself is on sale, and the period has not run out. A subscription that
-- has been cancelled, suspended or expired — or one whose period has passed —
-- is not an entitlement, and the account falls back to the free allowance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_active_plan_code(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.code
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
   WHERE s.profile_id = p_profile_id
     AND s.status = 'active'
     AND p.is_active
     AND (s.ended_at IS NULL OR s.ended_at > now())
     AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
   ORDER BY s.current_period_ends_at DESC NULLS LAST, s.created_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.careerpilot_active_plan_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careerpilot_active_plan_code(uuid) TO service_role;

COMMENT ON FUNCTION public.careerpilot_active_plan_code(uuid) IS
  'The code of the plan an account is currently entitled under, or NULL when there is none.';

-- ---------------------------------------------------------------------------
-- 3. The allowance of an account
--
-- The base allowance is what everybody has today. A plan can add to it; it
-- can never take away from it, because the free allowance is a benefit that
-- already exists and this migration does not remove one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_daily_credit_allowance(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    public.careerpilot_daily_credit_allowance(),
    COALESCE(
      (
        SELECT p.daily_ai_credits
          FROM public.subscriptions s
          JOIN public.subscription_plans p ON p.id = s.plan_id
         WHERE s.profile_id = p_profile_id
           AND s.status = 'active'
           AND p.is_active
           AND (s.ended_at IS NULL OR s.ended_at > now())
           AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
         ORDER BY s.current_period_ends_at DESC NULLS LAST, s.created_at DESC
         LIMIT 1
      ),
      0
    )
  );
$$;

REVOKE ALL ON FUNCTION public.careerpilot_daily_credit_allowance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careerpilot_daily_credit_allowance(uuid) TO service_role;

COMMENT ON FUNCTION public.careerpilot_daily_credit_allowance(uuid) IS
  'The daily AI credits an account is entitled to: the plan own allowance when it has an active subscription, and the base free allowance otherwise.';

-- ---------------------------------------------------------------------------
-- 4. The entitlement
--
-- The grant of today's allowance to an account that has paid for a plan. It
-- is the part of the daily allowance that arrives on its own.
--
-- The rules it obeys:
--
--   * It grants nothing to an account with no active subscription. The free
--     allowance stays a claimed reward.
--   * It grants nothing to an account whose email is not confirmed.
--   * It is idempotent: the bucket is unique per profile per day, the ledger
--     key is unique, and both writes say "do nothing on conflict".
--   * It never blocks on a busy account: the lock is taken with the
--     non-blocking form, so an account that is being paid for, claimed for or
--     spent from right now is skipped, and the next sweep or the account's
--     own next read picks it up.
--   * It never overwrites a balance. The bucket is created or topped up, and
--     the running balance follows the bucket.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_daily_credit_entitlement(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_plan text := public.careerpilot_active_plan_code(p_profile_id);
  v_target integer := public.careerpilot_daily_credit_allowance(p_profile_id);
  v_confirmed timestamptz;
  v_result jsonb;
  v_request integer;
BEGIN
  -- Only a paid account has an entitlement that arrives on its own.
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object(
      'granted', 0,
      'entitled', false,
      'skipped', false,
      'plan_code', NULL,
      'daily_allowance', v_target,
      'grant_date', v_today
    );
  END IF;

  -- The account must have a verified email before the allowance applies.
  SELECT email_confirmed_at INTO v_confirmed
    FROM auth.users
   WHERE id = p_profile_id;

  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object(
      'granted', 0,
      'entitled', false,
      'skipped', false,
      'plan_code', v_plan,
      'daily_allowance', v_target,
      'grant_date', v_today,
      'email_verified', false
    );
  END IF;

  -- The same lock key every other credit function uses, taken with the
  -- non-blocking form: a busy account is skipped rather than waited for, and
  -- the sweep that called this function is never held up by one candidate.
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_profile_id::text, 0)) THEN
    RETURN jsonb_build_object(
      'granted', 0,
      'entitled', true,
      'skipped', true,
      'plan_code', v_plan,
      'daily_allowance', v_target,
      'grant_date', v_today
    );
  END IF;

  -- The claim is the grant: it creates the bucket for today, tops it up to
  -- the account's own allowance, expires yesterday's leftovers, and writes
  -- the ledger entry under an idempotency key that cannot be written twice.
  -- The amount argument is only the shape the function validates: the
  -- allowance is decided by the database, from the plan.
  v_request := LEAST(GREATEST(v_target, 1), 10);
  v_result := public.claim_daily_credits(p_profile_id, v_request);

  RETURN jsonb_build_object(
    'granted', COALESCE((v_result ->> 'granted')::integer, 0),
    'topped_up', COALESCE((v_result ->> 'topped_up')::integer, 0),
    'entitled', true,
    'skipped', false,
    'plan_code', v_plan,
    'daily_allowance', v_target,
    'daily_remaining', COALESCE((v_result ->> 'daily_remaining')::integer, 0),
    'balance', COALESCE((v_result ->> 'balance')::integer, 0),
    'grant_date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daily_credit_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_daily_credit_entitlement(uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_daily_credit_entitlement(uuid) IS
  'Grants today daily allowance to an account with an active subscription. Idempotent per Africa/Cairo day and safe against concurrent calls.';

-- ---------------------------------------------------------------------------
-- 5. The sweep
--
-- The entitlement reaches every account that has a plan, whether or not
-- anybody opens the application. The sweep runs on the platform schedule
-- (every five minutes), and it is safe to run as often as the scheduler
-- likes: the second run in a day grants nothing.
--
-- A failed run is not a lost day. The next run finds the accounts that were
-- not granted and grants them, because the grant is decided by what is in
-- the table rather than by what the previous run did.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_daily_entitlements_to_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_profile record;
  v_result jsonb;
  v_granted integer := 0;
  v_topped_up integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_eligible integer := 0;
BEGIN
  FOR v_profile IN
    SELECT DISTINCT s.profile_id
      FROM public.subscriptions s
      JOIN public.subscription_plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
       AND p.is_active
       AND (s.ended_at IS NULL OR s.ended_at > now())
       AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
  LOOP
    v_eligible := v_eligible + 1;

    BEGIN
      v_result := public.ensure_daily_credit_entitlement(v_profile.profile_id);
      v_granted := v_granted + COALESCE((v_result ->> 'granted')::integer, 0);
      v_topped_up := v_topped_up + COALESCE((v_result ->> 'topped_up')::integer, 0);
      IF COALESCE((v_result ->> 'skipped')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- One account that fails must not stop the sweep. The next run tries
        -- it again, and the account's own balance read tries it as well.
        v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'grant_date', v_today,
    'eligible', v_eligible,
    'granted', v_granted,
    'topped_up', v_topped_up,
    'skipped', v_skipped,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_daily_entitlements_to_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_daily_entitlements_to_all() TO service_role;

COMMENT ON FUNCTION public.grant_daily_entitlements_to_all() IS
  'Grants the daily allowance to every account with an active subscription. Idempotent, non-blocking and safe to run on every tick of the schedule.';

-- ---------------------------------------------------------------------------
-- 6. The claim reads the account own allowance
--
-- The claim is the FREE reward: two tokens, pressed on purpose. It is also
-- the grant the entitlement uses, so it has to grant what the plan promises
-- rather than what the global constant says — otherwise a plan that promises
-- more would be topped down to two by the candidate pressing the button.
--
-- The body below is the body of `claim_daily_credits` as it is deployed,
-- with one line changed: the target is the allowance of the account.
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
  v_target integer := public.careerpilot_daily_credit_allowance(p_profile_id);
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
      'Daily AI credits',
      jsonb_build_object(
        'grant_date', v_today::text,
        'expires_at', v_reset,
        'plan_code', public.careerpilot_active_plan_code(p_profile_id)
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_granted := v_target;
  ELSIF v_grant.granted_amount < v_target THEN
    -- 3. The bucket was created under a smaller allowance. Top it up.
    --
    --    The extra credits go into the bucket AND into the running balance, so
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
      'Daily AI credits topped up to the full daily allowance',
      jsonb_build_object(
        'grant_date', v_today::text,
        'expires_at', v_reset,
        'previous_allowance', v_grant.granted_amount,
        'daily_allowance', v_target,
        'plan_code', public.careerpilot_active_plan_code(p_profile_id)
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
    'plan_code', public.careerpilot_active_plan_code(p_profile_id),
    'email_verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_credits(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The state read reports the account own allowance
--
-- The body below is the body of `get_daily_credit_state` as it is deployed,
-- with one line changed: the allowance is the account's, and the plan is
-- named so that the interface can say which plan it is reading.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_credit_state(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.careerpilot_egypt_date(now());
  v_target integer := public.careerpilot_daily_credit_allowance(p_profile_id);
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
    'plan_code', public.careerpilot_active_plan_code(p_profile_id),
    'entitled', public.careerpilot_active_plan_code(p_profile_id) IS NOT NULL,
    'email_verified', v_confirmed IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_credit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_credit_state(uuid) TO service_role;
