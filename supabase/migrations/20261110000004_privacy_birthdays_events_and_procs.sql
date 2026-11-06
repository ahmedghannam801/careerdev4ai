-- Migration: 20261110000004_privacy_birthdays_events_and_procs.sql
-- Description: Birthday Rewards, Subscription Event Sourcing, Notification Widen, and Atomic Stored Procedures
--
-- Tables:
-- 1. public.birthday_rewards (Annual 30% discount, Law 151 compliant without birth year)
-- 2. public.subscription_events (Append-only state audit and event sourcing)
--
-- Alterations:
-- - Widen public.notifications.type constraint for subscription and payment events
--
-- Procedures:
-- - confirm_payment_and_activate(uuid, uuid, text)
-- - consume_ai_credits(uuid, text, integer, text, jsonb)
-- - refund_ai_credits(uuid, integer, text, text, uuid)
-- - expire_subscriptions()
-- - expire_temporary_access()
-- - late_payment_restore(uuid, uuid, text)

-- ---------------------------------------------------------------------------
-- 1. Widen notifications type constraint
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'interview', 'roadmap', 'application', 'achievement', 'system', 'announcement',
  'subscription', 'payment', 'payment_success', 'payment_failed', 'subscription_expired'
));

-- ---------------------------------------------------------------------------
-- 2. birthday_rewards
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.birthday_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  privacy_consent_id uuid NOT NULL REFERENCES public.user_privacy_consents(id) ON DELETE RESTRICT,
  birth_month smallint NOT NULL,
  birth_day smallint NOT NULL,
  reward_year smallint NOT NULL,
  discount_percentage smallint NOT NULL DEFAULT 30,
  max_discount_piasters integer NOT NULL DEFAULT 10000, -- 100.00 EGP
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  is_combinable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available',
  redeemed_at timestamptz,
  redeemed_payment_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT birthday_rewards_month_check CHECK (birth_month BETWEEN 1 AND 12),
  CONSTRAINT birthday_rewards_day_check CHECK (birth_day BETWEEN 1 AND 31),
  CONSTRAINT birthday_rewards_year_check CHECK (reward_year >= 2026),
  CONSTRAINT birthday_rewards_one_per_user_year UNIQUE (profile_id, reward_year),
  CONSTRAINT birthday_rewards_discount_percent_check CHECK (discount_percentage = 30),
  CONSTRAINT birthday_rewards_max_discount_check CHECK (max_discount_piasters = 10000),
  CONSTRAINT birthday_rewards_non_combinable CHECK (is_combinable = false),
  CONSTRAINT birthday_rewards_status_check CHECK (
    status IN ('available', 'redeemed', 'expired')
  ),
  CONSTRAINT birthday_rewards_validity_window CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_birthday_rewards_profile_status
  ON public.birthday_rewards (profile_id, status);

CREATE INDEX IF NOT EXISTS idx_birthday_rewards_validity_window
  ON public.birthday_rewards (valid_from, valid_until)
  WHERE (status = 'available');

ALTER TABLE public.birthday_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS birthday_rewards_select_own ON public.birthday_rewards;
CREATE POLICY birthday_rewards_select_own ON public.birthday_rewards
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS birthday_rewards_admin_select ON public.birthday_rewards;
CREATE POLICY birthday_rewards_admin_select ON public.birthday_rewards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.birthday_rewards TO authenticated;
GRANT ALL ON public.birthday_rewards TO service_role;

-- ---------------------------------------------------------------------------
-- 3. subscription_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  state_before jsonb,
  state_after jsonb NOT NULL,
  payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT subscription_events_type_check CHECK (
    event_type IN (
      'created',
      'activated',
      'renewed',
      'upgraded',
      'downgraded',
      'expired',
      'cancelled',
      'suspended',
      'restored'
    )
  ),
  CONSTRAINT subscription_events_actor_type_check CHECK (
    actor_type IN ('user', 'admin', 'system', 'cron')
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription_id
  ON public.subscription_events (subscription_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_subscription_events_profile_id
  ON public.subscription_events (profile_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_events_select_own ON public.subscription_events;
CREATE POLICY subscription_events_select_own ON public.subscription_events
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS subscription_events_admin_select ON public.subscription_events;
CREATE POLICY subscription_events_admin_select ON public.subscription_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Stored Procedure: confirm_payment_and_activate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_payment_and_activate(
  p_payment_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payment_requests;
  v_plan public.subscription_plans;
  v_existing_sub public.subscriptions;
  v_sub_id uuid;
  v_period_interval interval;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_credit_balance integer;
  v_sub_event_type text;
  v_sub_state_before jsonb := NULL;
  v_sub_state_after jsonb;
BEGIN
  -- 1. Validate Admin Authorization
  IF p_admin_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = p_admin_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Active administrator record not found.';
    END IF;
  END IF;

  -- 2. Lock and retrieve Payment Request
  SELECT * INTO v_payment
  FROM public.payment_requests
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request % not found.', p_payment_id;
  END IF;

  IF v_payment.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payment already confirmed.');
  END IF;

  IF v_payment.status NOT IN ('pending', 'under_review', 'temporary_access') THEN
    RAISE EXCEPTION 'Cannot confirm payment with status %.', v_payment.status;
  END IF;

  -- 3. Retrieve Plan Details
  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_payment.plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated subscription plan % not found.', v_payment.plan_id;
  END IF;

  -- 4. Calculate Subscription Duration
  IF v_payment.billing_cycle = 'annual' THEN
    v_period_interval := interval '1 year';
  ELSE
    v_period_interval := interval '1 month';
  END IF;

  -- 5. Lock and evaluate candidate's existing subscription
  SELECT * INTO v_existing_sub
  FROM public.subscriptions
  WHERE profile_id = v_payment.profile_id AND status = 'active'
  FOR UPDATE;

  v_starts_at := now();

  IF FOUND THEN
    v_sub_id := v_existing_sub.id;
    v_sub_state_before := to_jsonb(v_existing_sub);

    -- If candidate had temporary access or same plan, extend from max(current_period_ends_at, now())
    IF v_existing_sub.current_period_ends_at > now() AND v_existing_sub.plan_id = v_payment.plan_id THEN
      v_ends_at := v_existing_sub.current_period_ends_at + v_period_interval;
      v_sub_event_type := 'renewed';
    ELSE
      -- Upgrading or replacing existing plan
      v_ends_at := v_starts_at + v_period_interval;
      v_sub_event_type := CASE 
        WHEN v_plan.price_monthly_piasters >= (
          SELECT price_monthly_piasters FROM public.subscription_plans WHERE id = v_existing_sub.plan_id
        ) THEN 'upgraded' ELSE 'downgraded' END;
    END IF;

    UPDATE public.subscriptions
    SET plan_id = v_payment.plan_id,
        billing_cycle = v_payment.billing_cycle,
        status = 'active',
        current_period_starts_at = v_starts_at,
        current_period_ends_at = v_ends_at,
        latest_payment_id = v_payment.id,
        updated_at = now()
    WHERE id = v_sub_id
    RETURNING to_jsonb(subscriptions.*) INTO v_sub_state_after;

  ELSE
    -- Creating a brand new subscription
    v_ends_at := v_starts_at + v_period_interval;
    v_sub_event_type := 'activated';

    INSERT INTO public.subscriptions (
      profile_id,
      plan_id,
      billing_cycle,
      status,
      current_period_starts_at,
      current_period_ends_at,
      latest_payment_id
    ) VALUES (
      v_payment.profile_id,
      v_payment.plan_id,
      v_payment.billing_cycle,
      'active',
      v_starts_at,
      v_ends_at,
      v_payment.id
    )
    RETURNING id, to_jsonb(subscriptions.*) INTO v_sub_id, v_sub_state_after;
  END IF;

  -- 6. Transition Payment Request to 'paid'
  UPDATE public.payment_requests
  SET status = 'paid',
      paid_at = now(),
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      review_notes = coalesce(p_notes, review_notes),
      updated_at = now()
  WHERE id = v_payment.id;

  -- 7. Insert Payment Verification Record
  INSERT INTO public.payment_verifications (
    payment_request_id,
    verification_type,
    result,
    confidence_score,
    evidence,
    verifier_type,
    admin_user_id
  ) VALUES (
    v_payment.id,
    CASE WHEN p_admin_id IS NOT NULL THEN 'admin_confirm' ELSE 'amount_check' END,
    'pass',
    100.00,
    jsonb_build_object(
      'admin_id', p_admin_id,
      'notes', p_notes,
      'confirmed_at', now()
    ),
    CASE WHEN p_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END,
    p_admin_id
  );

  -- 8. Allocate Plan AI Credits in Ledger
  IF v_plan.monthly_ai_credits > 0 THEN
    -- Acquire candidate advisory lock to serialize ledger writes
    PERFORM pg_advisory_xact_lock(hashtext(v_payment.profile_id::text));

    SELECT running_balance INTO v_credit_balance
    FROM public.ai_credit_ledger
    WHERE profile_id = v_payment.profile_id
    ORDER BY created_at DESC
    LIMIT 1;

    v_credit_balance := coalesce(v_credit_balance, 0) + v_plan.monthly_ai_credits;

    INSERT INTO public.ai_credit_ledger (
      profile_id,
      operation,
      amount,
      running_balance,
      source_type,
      source_id,
      idempotency_key,
      description
    ) VALUES (
      v_payment.profile_id,
      'grant',
      v_plan.monthly_ai_credits,
      v_credit_balance,
      'subscription',
      v_sub_id,
      'grant_sub_' || v_sub_id::text || '_' || to_char(now(), 'YYYYMMDDHH24MISS'),
      'Monthly allocation for ' || v_plan.name_en
    );
  END IF;

  -- 9. Append Subscription Event
  INSERT INTO public.subscription_events (
    subscription_id,
    profile_id,
    event_type,
    actor_type,
    actor_id,
    state_before,
    state_after,
    payment_request_id,
    reason
  ) VALUES (
    v_sub_id,
    v_payment.profile_id,
    v_sub_event_type,
    CASE WHEN p_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END,
    p_admin_id,
    v_sub_state_before,
    v_sub_state_after,
    v_payment.id,
    coalesce(p_notes, 'Payment confirmed successfully.')
  );

  -- 10. Send User In-App Notification
  INSERT INTO public.notifications (
    profile_id,
    type,
    title,
    message,
    link_view
  ) VALUES (
    v_payment.profile_id,
    'payment_success',
    'Subscription Activated!',
    'Your ' || v_plan.name_en || ' plan is now active until ' || to_char(v_ends_at, 'YYYY-MM-DD') || '.',
    'billing'
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'status', 'active',
    'ends_at', v_ends_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Stored Procedure: consume_ai_credits
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

  -- Serialize credit mutations for this candidate profile
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text));

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_current_balance := coalesce(v_current_balance, 0);

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', p_amount,
      'available', v_current_balance
    );
  END IF;

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
    'remaining_balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Stored Procedure: refund_ai_credits
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
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text));

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_current_balance := coalesce(v_current_balance, 0);
  v_new_balance := v_current_balance + p_amount;

  INSERT INTO public.ai_credit_ledger (
    profile_id,
    operation,
    amount,
    running_balance,
    source_type,
    source_id,
    idempotency_key,
    description
  ) VALUES (
    p_profile_id,
    'refund',
    p_amount,
    v_new_balance,
    'system',
    p_source_id,
    p_idempotency_key,
    'Refund: ' || p_reason
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'new_balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Stored Procedure: expire_subscriptions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub record;
  v_count integer := 0;
BEGIN
  FOR v_sub IN
    SELECT s.*, p.code as plan_code
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.status = 'active'
      AND s.current_period_ends_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 1. Transition status
    UPDATE public.subscriptions
    SET status = 'expired',
        ended_at = now(),
        updated_at = now()
    WHERE id = v_sub.id;

    -- 2. Emit lifecycle event
    INSERT INTO public.subscription_events (
      subscription_id,
      profile_id,
      event_type,
      actor_type,
      state_before,
      state_after,
      reason
    ) VALUES (
      v_sub.id,
      v_sub.profile_id,
      'expired',
      'cron',
      to_jsonb(v_sub),
      jsonb_build_object('status', 'expired', 'ended_at', now()),
      'Billing period ended without manual renewal.'
    );

    -- 3. Notify Candidate
    INSERT INTO public.notifications (
      profile_id,
      type,
      title,
      message,
      link_view
    ) VALUES (
      v_sub.profile_id,
      'subscription_expired',
      'Subscription Expired',
      'Your subscription has expired. Renew today to keep premium features.',
      'billing'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Stored Procedure: expire_temporary_access
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_temporary_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_count integer := 0;
BEGIN
  FOR v_req IN
    SELECT pr.*
    FROM public.payment_requests pr
    WHERE pr.status = 'temporary_access'
      AND pr.temporary_access_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 1. Expire Payment Request
    UPDATE public.payment_requests
    SET status = 'expired',
        updated_at = now()
    WHERE id = v_req.id;

    -- 2. Suspend associated temporary subscription
    UPDATE public.subscriptions
    SET status = 'suspended',
        updated_at = now()
    WHERE latest_payment_id = v_req.id
      AND status = 'active';

    -- 3. Record Audit Verification
    INSERT INTO public.payment_verifications (
      payment_request_id,
      verification_type,
      result,
      evidence,
      verifier_type
    ) VALUES (
      v_req.id,
      'duplicate_check',
      'fail',
      jsonb_build_object('reason', '24-hour temporary access window elapsed without verification.'),
      'system'
    );

    -- 4. Notify Candidate
    INSERT INTO public.notifications (
      profile_id,
      type,
      title,
      message,
      link_view
    ) VALUES (
      v_req.profile_id,
      'payment_failed',
      'Temporary Access Expired',
      'Your temporary access has elapsed. Please re-submit your receipt or contact support.',
      'billing'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Stored Procedure: late_payment_restore
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.late_payment_restore(
  p_payment_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payment_requests;
  v_result jsonb;
BEGIN
  SELECT * INTO v_payment
  FROM public.payment_requests
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request % not found.', p_payment_id;
  END IF;

  IF v_payment.status <> 'expired' THEN
    RAISE EXCEPTION 'late_payment_restore can only be invoked for expired payments. Current status: %', v_payment.status;
  END IF;

  -- Re-open to under_review temporarily so confirm_payment_and_activate accepts it
  UPDATE public.payment_requests
  SET status = 'under_review',
      updated_at = now()
  WHERE id = p_payment_id;

  -- Call standard confirmation routine
  v_result := public.confirm_payment_and_activate(
    p_payment_id,
    p_admin_id,
    'Late Confirmation: ' || coalesce(p_notes, 'Receipt verified after expiration.')
  );

  -- Append restoration event note
  INSERT INTO public.subscription_events (
    subscription_id,
    profile_id,
    event_type,
    actor_type,
    actor_id,
    state_after,
    reason
  ) VALUES (
    (v_result->>'subscription_id')::uuid,
    v_payment.profile_id,
    'restored',
    'admin',
    p_admin_id,
    v_result,
    'Restored from expired status following late receipt verification.'
  );

  RETURN v_result;
END;
$$;

-- Revoke client rights and grant execution to service_role
REVOKE ALL ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_credits(uuid, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_credits(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_temporary_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_payment_restore(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_temporary_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.late_payment_restore(uuid, uuid, text) TO service_role;

