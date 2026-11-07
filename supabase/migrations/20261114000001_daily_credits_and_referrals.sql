-- Migration: 20261114000001_daily_credits_and_referrals.sql
-- Description: Daily free-credit allowance with an expiring bucket, and a
-- server-authoritative personal referral programme.
--
-- Goals
-- 1. A small daily allowance that resets every day and never accumulates.
-- 2. The allowance is a separate pool from subscription entitlements. It can
--    fund eligible AI operations, but it never changes a plan, never extends
--    a subscription and never unlocks a paid-only entitlement.
-- 3. Referrals are attributed on the server from the signup metadata, and the
--    reward is only paid once the referred account has a verified email.
--
-- Design notes
-- * The ledger keeps `running_balance` as the authoritative total. The daily
--   allowance is tracked separately in `daily_credit_grants`, and the
--   invariant `running_balance = general_balance + sum(daily remaining)`
--   is maintained by every function below. Daily credits are spent first
--   because they are the ones that expire.
-- * Every mutation runs under ONE advisory lock key per profile
--   (`hashtextextended(profile_id::text, 0)`). The previous code used two
--   different keys for grants and deductions, so a concurrent purchase and a
--   concurrent deduction could interleave and corrupt the running balance.
-- * Nothing here is callable by `anon` or `authenticated`: every function is
--   revoked from the client roles and granted to `service_role` only.

-- ---------------------------------------------------------------------------
-- 1. Ledger and notification vocabularies
-- ---------------------------------------------------------------------------

-- The ledger's source vocabulary gains the two new money sources.
ALTER TABLE public.ai_credit_ledger
  DROP CONSTRAINT IF EXISTS ai_credit_ledger_source_type_check;

ALTER TABLE public.ai_credit_ledger
  ADD CONSTRAINT ai_credit_ledger_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'subscription', 'payment', 'admin', 'system', 'onboarding',
    'birthday', 'trial', 'daily_allowance', 'referral'
  ]::text[]));

-- Notifications gain a credit and a referral type.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'interview', 'roadmap', 'application', 'achievement', 'system',
    'announcement', 'subscription', 'payment', 'payment_success',
    'payment_failed', 'subscription_expired', 'credits', 'referral'
  ]::text[]));

-- Notifications can carry a translation key and its parameters so the client
-- renders them in the reader's language. Existing rows keep their literal
-- title and message.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title_key text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Egypt-local day helpers
--
-- The platform's documented timezone policy is Africa/Cairo. Every "day"
-- boundary in the credits and birthday systems is computed there, so a user
-- in Egypt gets their allowance at their own midnight, not at UTC's.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_egypt_date(
  p_at timestamptz DEFAULT now()
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (timezone('Africa/Cairo', p_at))::date;
$$;

CREATE OR REPLACE FUNCTION public.careerpilot_egypt_next_reset(
  p_at timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (((timezone('Africa/Cairo', p_at))::date + 1)::timestamp
          AT TIME ZONE 'Africa/Cairo');
$$;

-- ---------------------------------------------------------------------------
-- 3. The daily allowance bucket
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The Egypt-local calendar day the allowance belongs to.
  grant_date date NOT NULL,
  granted_amount integer NOT NULL CHECK (granted_amount > 0),
  -- Credits still available inside this bucket. Never negative.
  remaining integer NOT NULL CHECK (remaining >= 0 AND remaining <= granted_amount),
  -- The moment the allowance stops being usable (the next Egypt midnight).
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_credit_grants_unique_day UNIQUE (profile_id, grant_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_credit_grants_profile_date
  ON public.daily_credit_grants (profile_id, grant_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_credit_grants_expires
  ON public.daily_credit_grants (expires_at)
  WHERE remaining > 0;

ALTER TABLE public.daily_credit_grants ENABLE ROW LEVEL SECURITY;

-- No client policy at all: the bucket is written only by the server.
REVOKE ALL ON public.daily_credit_grants FROM anon, authenticated;
GRANT ALL ON public.daily_credit_grants TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Personal referral codes and attributed referrals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_codes (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Public, shareable, non-guessable. Never a sequential id.
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code
  ON public.referral_codes (code);

CREATE TABLE IF NOT EXISTS public.referral_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The two foreign keys are deferred: the attribution is written by a
  -- trigger on auth.users, and the profile row for the new account is
  -- created by another trigger in the same transaction. Deferring the check to
  -- commit removes the dependency on trigger firing order.
  referrer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  -- One attribution per referred account: a replay cannot create a second row.
  referred_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  reward_credits integer NOT NULL DEFAULT 0 CHECK (reward_credits >= 0),
  reward_ledger_id uuid REFERENCES public.ai_credit_ledger(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A referral can never point at the account that made it.
  CONSTRAINT referral_relations_no_self_referral
    CHECK (referrer_profile_id <> referred_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer
  ON public.referral_relations (referrer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_relations_status
  ON public.referral_relations (status);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_relations ENABLE ROW LEVEL SECURITY;

-- A user may read their own code and the referrals they made. They may never
-- write, and they may never read somebody else's referral list.
CREATE POLICY referral_codes_select_own
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY referral_relations_select_own
  ON public.referral_relations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_profile_id OR auth.uid() = referred_profile_id);

REVOKE ALL ON public.referral_codes FROM anon;
REVOKE ALL ON public.referral_relations FROM anon;
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referral_relations TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
GRANT ALL ON public.referral_relations TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The daily allowance claim
--
-- Idempotent per Egypt-local day: the first call of the day grants, every
-- later call only returns the state. Yesterday's leftover is expired first,
-- so the allowance can never accumulate.
-- ---------------------------------------------------------------------------

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
BEGIN
  IF p_amount <= 0 OR p_amount > 10 THEN
    RAISE EXCEPTION 'claim_daily_credits: amount must be between 1 and 10';
  END IF;

  -- One credit operation per profile at a time. This is the same lock key
  -- every other credit function uses.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

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
    'grant_date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_credits(uuid, integer) TO service_role;

-- The read-only companion of the claim.
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
BEGIN
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
    'daily_remaining', COALESCE(v_grant.remaining, 0),
    'daily_allowance', COALESCE(v_grant.granted_amount, 0),
    'expires_at', public.careerpilot_egypt_next_reset(now()),
    'grant_date', v_today,
    'expiring_credits', v_expired
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_credit_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_credit_state(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Bucket-aware deduction
--
-- The daily allowance is spent first because it is the part that expires. The
-- ledger's `running_balance` still falls by the full amount, which keeps the
-- invariant `running_balance = general + daily_remaining` intact.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_profile_id uuid,
  p_operation text,
  p_amount integer,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_existing_ledger public.ai_credit_ledger;
  v_ledger_id uuid;
  v_today date := public.careerpilot_egypt_date(now());
  v_from_daily integer := 0;
  v_take integer;
  v_grant_row record;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduction amount must be strictly positive.';
  END IF;

  -- Check for existing idempotent execution
  SELECT * INTO v_existing_ledger
  FROM public.ai_credit_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'remaining_balance', v_existing_ledger.running_balance,
      'ledger_id', v_existing_ledger.id
    );
  END IF;

  -- Serialize credit mutations for this candidate profile. This is the SAME
  -- lock key the grants use, so a purchase and a deduction can never
  -- interleave.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  v_current_balance := COALESCE(v_current_balance, 0);

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', p_amount,
      'available', v_current_balance
    );
  END IF;

  -- Spend the expiring daily allowance first.
  FOR v_grant_row IN
    SELECT id, remaining
      FROM public.daily_credit_grants
     WHERE profile_id = p_profile_id
       AND grant_date = v_today
       AND remaining > 0
     ORDER BY expires_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_from_daily >= p_amount;

    v_take := LEAST(v_grant_row.remaining, p_amount - v_from_daily);

    UPDATE public.daily_credit_grants
       SET remaining = remaining - v_take
     WHERE id = v_grant_row.id;

    v_from_daily := v_from_daily + v_take;
  END LOOP;

  v_new_balance := v_current_balance - p_amount;

  INSERT INTO public.ai_credit_ledger (
    profile_id,
    operation,
    amount,
    running_balance,
    source_type,
    ai_action_type,
    idempotency_key,
    description,
    metadata
  ) VALUES (
    p_profile_id,
    'consume',
    -p_amount,
    v_new_balance,
    'system',
    p_operation,
    p_idempotency_key,
    'AI Action: ' || p_operation,
    p_metadata
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'deducted', p_amount,
    'daily_credit_used', v_from_daily,
    'remaining_balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credits(uuid, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, text, integer, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Bucket-aware refund
--
-- A refunded credit goes back into the daily bucket when that bucket still
-- has room, so a failed operation does not silently destroy the user's daily
-- allowance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_profile_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_source_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
  v_today date := public.careerpilot_egypt_date(now());
  v_gap integer := 0;
  v_to_daily integer := 0;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be strictly positive.';
  END IF;

  -- Check idempotency
  SELECT id INTO v_ledger_id
  FROM public.ai_credit_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
  END IF;

  -- Serialize candidate credit mutations
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  -- Return the credit to today's daily bucket first, when it still has room.
  SELECT granted_amount - remaining INTO v_gap
    FROM public.daily_credit_grants
   WHERE profile_id = p_profile_id
     AND grant_date = v_today
   FOR UPDATE;

  IF v_gap IS NOT NULL AND v_gap > 0 THEN
    v_to_daily := LEAST(p_amount, v_gap);

    UPDATE public.daily_credit_grants
       SET remaining = remaining + v_to_daily
     WHERE profile_id = p_profile_id
       AND grant_date = v_today;
  END IF;

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  v_current_balance := COALESCE(v_current_balance, 0);
  v_new_balance := v_current_balance + p_amount;

  INSERT INTO public.ai_credit_ledger (
    profile_id,
    operation,
    amount,
    running_balance,
    source_type,
    ai_action_type,
    idempotency_key,
    description,
    metadata
  ) VALUES (
    p_profile_id,
    'refund',
    p_amount,
    v_new_balance,
    'system',
    NULL,
    p_idempotency_key,
    p_reason,
    jsonb_build_object('source_id', p_source_id, 'returned_to_daily_bucket', v_to_daily)
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'refunded', p_amount,
    'daily_credit_restored', v_to_daily,
    'remaining_balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_ai_credits(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(uuid, integer, text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. grant_ai_credits learns the two new sources
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_ai_credits(
  p_profile_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_source_type text,
  p_source_id uuid,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing integer;
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_ai_credits: amount must be positive';
  END IF;

  IF p_source_type NOT IN (
    'subscription', 'payment', 'admin', 'system', 'onboarding',
    'birthday', 'trial', 'daily_allowance', 'referral'
  ) THEN
    RAISE EXCEPTION 'grant_ai_credits: invalid source_type %', p_source_type;
  END IF;

  SELECT running_balance INTO v_existing
  FROM public.ai_credit_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object('granted', false, 'balance', v_existing);
  END IF;

  -- One purchase at a time per profile. The advisory lock is transaction
  -- scoped, so it is released even if the insert fails.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  SELECT running_balance INTO v_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  v_balance := COALESCE(v_balance, 0) + p_amount;

  INSERT INTO public.ai_credit_ledger (
    profile_id, amount, running_balance, operation, source_type,
    source_id, idempotency_key, description, metadata
  ) VALUES (
    p_profile_id, p_amount, v_balance, 'grant', p_source_type,
    p_source_id, p_idempotency_key, p_description, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('granted', true, 'balance', v_balance);
EXCEPTION
  WHEN unique_violation THEN
    SELECT running_balance INTO v_existing
    FROM public.ai_credit_ledger
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('granted', false, 'balance', COALESCE(v_existing, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Referral attribution and reward
--
-- The referral code travels in the signup metadata. The database validates
-- it: an unknown code is ignored, a self-referral is refused, and an account
-- can only ever be attributed once. The reward is paid when the referred
-- account's email is confirmed, never before.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_attempts integer := 0;
BEGIN
  SELECT code INTO v_code
  FROM public.referral_codes
  WHERE profile_id = p_profile_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- 64 bits of entropy, rendered as four readable groups. `gen_random_uuid`
  -- is built into PostgreSQL 13 and later, so this needs no extension.
  WHILE v_attempts < 8 LOOP
    v_attempts := v_attempts + 1;

    v_code := 'CD4-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 5, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 9, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 13, 4);

    BEGIN
      INSERT INTO public.referral_codes (profile_id, code)
      VALUES (p_profile_id, v_code);

      RETURN v_code;
    EXCEPTION
      WHEN unique_violation THEN
        v_code := NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'ensure_referral_code: could not allocate a unique code';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO service_role;

-- Pays the referral reward for a referred account, once.
CREATE OR REPLACE FUNCTION public.verify_referral_relation(
  p_referred_profile_id uuid,
  p_reward_credits integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_relation public.referral_relations;
  v_confirmed timestamptz;
  v_result jsonb;
  v_referrer uuid;
BEGIN
  IF p_reward_credits <= 0 OR p_reward_credits > 5 THEN
    RAISE EXCEPTION 'verify_referral_relation: reward out of range';
  END IF;

  SELECT * INTO v_relation
  FROM public.referral_relations
  WHERE referred_profile_id = p_referred_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none', 'rewarded', false);
  END IF;

  IF v_relation.status = 'verified' THEN
    RETURN jsonb_build_object(
      'status', 'verified',
      'rewarded', false,
      'already_awarded', true,
      'reward_credits', v_relation.reward_credits
    );
  END IF;

  -- The account must have a verified email before it counts.
  SELECT email_confirmed_at INTO v_confirmed
  FROM auth.users
  WHERE id = p_referred_profile_id;

  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object('status', 'pending_email', 'rewarded', false);
  END IF;

  v_referrer := v_relation.referrer_profile_id;

  -- The reward is paid to the referrer, through the ordinary ledger, under
  -- the same per-profile lock every other grant uses. The idempotency key is
  -- derived from the referred account, so a replay pays nothing.
  v_result := public.grant_ai_credits(
    v_referrer,
    p_reward_credits,
    'referral-reward:' || p_referred_profile_id::text,
    'referral',
    v_relation.id,
    'Referral reward',
    jsonb_build_object(
      'referred_profile_id', p_referred_profile_id,
      'referral_code', v_relation.referral_code
    )
  );

  UPDATE public.referral_relations
     SET status = 'verified',
         verified_at = now(),
         reward_credits = p_reward_credits,
         reward_ledger_id = (
           SELECT id FROM public.ai_credit_ledger
           WHERE idempotency_key = 'referral-reward:' || p_referred_profile_id::text
           LIMIT 1
         )
   WHERE id = v_relation.id;

  INSERT INTO public.notifications (
    profile_id, title, message, type, title_key, params, link_view
  ) VALUES (
    v_referrer,
    'Referral reward earned',
    'A friend you referred has joined. You received ' || p_reward_credits || ' credit.',
    'referral',
    'notification.referralReward',
    jsonb_build_object('credits', p_reward_credits),
    'referrals'
  );

  RETURN jsonb_build_object(
    'status', 'verified',
    'rewarded', true,
    'reward_credits', p_reward_credits,
    'referrer_profile_id', v_referrer,
    'grant', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_referral_relation(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_referral_relation(uuid, integer) TO service_role;

-- Records the attribution when a new account is created.
CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_referrer uuid;
BEGIN
  v_code := lower(coalesce(
    NEW.raw_user_meta_data ->> 'ref',
    NEW.raw_user_meta_data ->> 'referral_code',
    ''
  ));

  IF v_code IS NULL OR v_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT profile_id INTO v_referrer
  FROM public.referral_codes
  WHERE lower(code) = v_code
    AND revoked_at IS NULL;

  -- An unknown code is simply ignored, and nobody can refer themselves.
  IF v_referrer IS NULL OR v_referrer = NEW.id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_relations (
    referrer_profile_id, referred_profile_id, referral_code, status
  ) VALUES (
    v_referrer, NEW.id, v_code, 'pending'
  )
  ON CONFLICT (referred_profile_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_referral_signup ON auth.users;
CREATE TRIGGER trg_handle_referral_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_signup();

-- Pays the reward the moment the referred account confirms its email.
CREATE OR REPLACE FUNCTION public.handle_referral_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at = OLD.created_at) THEN
    PERFORM public.verify_referral_relation(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_referral_email_confirmation ON auth.users;
CREATE TRIGGER trg_handle_referral_email_confirmation
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_email_confirmation();
