-- Migration: 20261110000006_subscription_system_remediation.sql
-- Description: Audit Remediation — Fixes BLK-01, BLK-02, BLK-03, BLK-08, BLK-10, BLK-11
--
-- 1. BLK-01: Remove authenticated direct INSERT on payment_requests.
-- 2. BLK-02: Support credit packs in payment_requests and add confirm_credit_pack_payment.
-- 3. BLK-03: Create atomic admin_grant_ai_credits stored procedure.
-- 4. BLK-08: Isolate monthly credit expiration in expire_subscriptions so purchased credits never expire.
-- 5. BLK-10: Enforce transaction reference uniqueness on confirmed payments.
-- 6. BLK-11: Revoke authenticated SELECT on coupon_definitions to prevent coupon scraping.

-- ---------------------------------------------------------------------------
-- 1. BLK-01 & BLK-11: RLS Hardening
-- ---------------------------------------------------------------------------

-- Revoke client direct insert on payment_requests
DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;
REVOKE INSERT ON public.payment_requests FROM authenticated;
REVOKE INSERT ON public.payment_requests FROM anon;

-- Revoke client direct select on coupon_definitions (server-side validation only)
DROP POLICY IF EXISTS coupon_definitions_select_active ON public.coupon_definitions;
REVOKE SELECT ON public.coupon_definitions FROM authenticated;
REVOKE SELECT ON public.coupon_definitions FROM anon;

-- Ensure authenticated role has SELECT grant on admin_users so that RLS admin subqueries
-- (e.g. EXISTS (SELECT 1 FROM public.admin_users ...)) can evaluate without permission errors.
-- Row Level Security on admin_users (admin_users_select_self) continues to restrict reads
-- to each user's own admin row (auth.uid() = profile_id).
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- ---------------------------------------------------------------------------
-- 2. BLK-02: Credit Pack Payment Columns
-- ---------------------------------------------------------------------------

-- Allow plan_id to be nullable for credit-pack purchases
ALTER TABLE public.payment_requests ALTER COLUMN plan_id DROP NOT NULL;

-- Add item_type, credit_pack_id, and credits_to_grant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payment_requests' 
      AND column_name = 'item_type'
  ) THEN
    ALTER TABLE public.payment_requests
      ADD COLUMN item_type text NOT NULL DEFAULT 'subscription'
      CONSTRAINT payment_requests_item_type_check CHECK (item_type IN ('subscription', 'credit_pack')),
      ADD COLUMN credit_pack_id text,
      ADD COLUMN credits_to_grant integer;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2b. BLK-10: Database-Level Partial Unique Index for Confirmed Payment References
-- ---------------------------------------------------------------------------
-- While procedural IF EXISTS checks guard sequential attempts, concurrent confirmations
-- of separate payment requests sharing the same reference can race past the check before
-- either commits. A partial unique index guarantees engine-level serializability.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_unique_confirmed_tx_ref
  ON public.payment_requests (payment_method, lower(trim(transaction_reference)))
  WHERE (status = 'paid' AND transaction_reference IS NOT NULL AND trim(transaction_reference) <> '');

-- ---------------------------------------------------------------------------
-- 3. BLK-02: Stored Procedure for Credit Pack Payment Confirmation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_credit_pack_payment(
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
  v_credit_balance integer;
  v_ledger_id uuid;
  v_credits integer;
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

  IF v_payment.item_type <> 'credit_pack' THEN
    RAISE EXCEPTION 'Payment request % is not a credit pack purchase.', p_payment_id;
  END IF;

  v_credits := coalesce(v_payment.credits_to_grant, 0);
  IF v_credits <= 0 THEN
    RAISE EXCEPTION 'Invalid credit pack payment: credits_to_grant must be positive.';
  END IF;

  -- 3. BLK-10: Check duplicate confirmed transaction reference
  IF v_payment.transaction_reference IS NOT NULL AND trim(v_payment.transaction_reference) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.payment_requests
      WHERE payment_method = v_payment.payment_method
        AND lower(trim(transaction_reference)) = lower(trim(v_payment.transaction_reference))
        AND status = 'paid'
        AND id <> p_payment_id
    ) THEN
      RAISE EXCEPTION 'Transaction reference % has already been confirmed for another payment.', v_payment.transaction_reference;
    END IF;
  END IF;

  -- 4. Transition Payment Request to 'paid'
  UPDATE public.payment_requests
  SET status = 'paid',
      paid_at = now(),
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      review_notes = coalesce(p_notes, review_notes),
      updated_at = now()
  WHERE id = v_payment.id;

  -- 5. Record verification
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
      'item_type', 'credit_pack',
      'credits_granted', v_credits,
      'confirmed_at', now()
    ),
    CASE WHEN p_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END,
    p_admin_id
  );

  -- 6. Allocate Non-Expiring Purchased Pack Credits via Advisory Lock
  PERFORM pg_advisory_xact_lock(hashtext(v_payment.profile_id::text));

  SELECT running_balance INTO v_credit_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = v_payment.profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_credit_balance := coalesce(v_credit_balance, 0) + v_credits;

  INSERT INTO public.ai_credit_ledger (
    profile_id,
    operation,
    amount,
    running_balance,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata
  ) VALUES (
    v_payment.profile_id,
    'grant',
    v_credits,
    v_credit_balance,
    'payment',
    v_payment.id,
    'pack_grant_' || v_payment.id::text,
    'Purchased AI Credit Pack (' || v_credits || ' credits)',
    jsonb_build_object(
      'credit_pack_id', v_payment.credit_pack_id,
      'amount_piasters', v_payment.amount_piasters,
      'payment_method', v_payment.payment_method
    )
  )
  RETURNING id INTO v_ledger_id;

  -- 7. Notify Candidate
  INSERT INTO public.notifications (
    profile_id,
    type,
    title,
    message,
    link_view
  ) VALUES (
    v_payment.profile_id,
    'payment_success',
    'AI Credits Added!',
    'Your booster pack of ' || v_credits || ' AI credits has been added to your balance.',
    'billing'
  );

  RETURN jsonb_build_object(
    'success', true,
    'credits_granted', v_credits,
    'new_balance', v_credit_balance,
    'ledger_id', v_ledger_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Transaction reference % has already been confirmed on % for another payment.', v_payment.transaction_reference, v_payment.payment_method;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. BLK-03: Stored Procedure for Admin Manual Credit Grants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_grant_ai_credits(
  p_profile_id uuid,
  p_admin_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin public.admin_users;
  v_existing_id uuid;
  v_current_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
BEGIN
  -- 1. Validate Admin Authorization
  SELECT * INTO v_admin
  FROM public.admin_users
  WHERE id = p_admin_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: Active administrator record not found.';
  END IF;

  -- 2. Validate Parameters
  IF p_amount <= 0 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Grant amount must be between 1 and 1000 credits.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A valid grant reason is required for administrative audit.';
  END IF;

  -- 3. Idempotency Check
  SELECT id INTO v_existing_id
  FROM public.ai_credit_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    SELECT running_balance INTO v_current_balance
    FROM public.ai_credit_ledger
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'granted_credits', p_amount,
      'balance', v_current_balance
    );
  END IF;

  -- 4. Acquire Advisory Lock on Profile
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text));

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_current_balance := coalesce(v_current_balance, 0);
  v_new_balance := v_current_balance + p_amount;

  -- 5. Insert Ledger Row using valid 'admin' source_type
  INSERT INTO public.ai_credit_ledger (
    profile_id,
    operation,
    amount,
    running_balance,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata
  ) VALUES (
    p_profile_id,
    'grant',
    p_amount,
    v_new_balance,
    'admin',
    p_admin_id,
    p_idempotency_key,
    trim(p_reason),
    jsonb_build_object(
      'granted_by_admin_id', p_admin_id,
      'granted_by_admin_email', v_admin.email
    )
  )
  RETURNING id INTO v_ledger_id;

  -- 6. Record Audit Log
  INSERT INTO public.admin_audit_log (
    admin_id,
    admin_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_admin_id,
    v_admin.email,
    'credits.granted',
    'profile',
    p_profile_id::text,
    jsonb_build_object(
      'amount', p_amount,
      'reason', trim(p_reason),
      'ledger_id', v_ledger_id,
      'new_balance', v_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'granted_credits', p_amount,
    'balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. BLK-10: Harden confirm_payment_and_activate with Duplicate Ref Check
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

  -- Route credit pack payments to dedicated routine
  IF v_payment.item_type = 'credit_pack' THEN
    RETURN public.confirm_credit_pack_payment(p_payment_id, p_admin_id, p_notes);
  END IF;

  -- BLK-10: Check duplicate confirmed transaction reference
  IF v_payment.transaction_reference IS NOT NULL AND trim(v_payment.transaction_reference) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.payment_requests
      WHERE payment_method = v_payment.payment_method
        AND lower(trim(transaction_reference)) = lower(trim(v_payment.transaction_reference))
        AND status = 'paid'
        AND id <> p_payment_id
    ) THEN
      RAISE EXCEPTION 'Transaction reference % has already been confirmed on % for another payment.', v_payment.transaction_reference, v_payment.payment_method;
    END IF;
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

    IF v_existing_sub.current_period_ends_at > now() AND v_existing_sub.plan_id = v_payment.plan_id THEN
      v_ends_at := v_existing_sub.current_period_ends_at + v_period_interval;
      v_sub_event_type := 'renewed';
    ELSE
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

  -- 8. Allocate Plan Monthly AI Credits in Ledger
  IF v_plan.monthly_ai_credits > 0 THEN
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
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Transaction reference % has already been confirmed on % for another payment.', v_payment.transaction_reference, v_payment.payment_method;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. BLK-08: Isolate Monthly Subscription Credits Expiration
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
  v_consumed integer := 0;
  v_unspent_monthly integer := 0;
  v_current_balance integer := 0;
  v_expire_amount integer := 0;
BEGIN
  FOR v_sub IN
    SELECT s.*, p.code as plan_code, p.monthly_ai_credits
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

    -- 2. BLK-08: Expire unspent portion of monthly credits from this cycle WITHOUT touching purchased pack credits
    IF coalesce(v_sub.monthly_ai_credits, 0) > 0 THEN
      -- Calculate credits consumed during this subscription cycle
      SELECT coalesce(sum(abs(amount)), 0) INTO v_consumed
      FROM public.ai_credit_ledger
      WHERE profile_id = v_sub.profile_id
        AND operation = 'consume'
        AND created_at >= v_sub.current_period_starts_at;

      v_unspent_monthly := greatest(0, v_sub.monthly_ai_credits - v_consumed);

      IF v_unspent_monthly > 0 THEN
        PERFORM pg_advisory_xact_lock(hashtext(v_sub.profile_id::text));

        SELECT running_balance INTO v_current_balance
        FROM public.ai_credit_ledger
        WHERE profile_id = v_sub.profile_id
        ORDER BY created_at DESC
        LIMIT 1;

        v_current_balance := coalesce(v_current_balance, 0);
        v_expire_amount := least(v_unspent_monthly, v_current_balance);

        IF v_expire_amount > 0 THEN
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
            v_sub.profile_id,
            'expire',
            -v_expire_amount,
            v_current_balance - v_expire_amount,
            'subscription',
            v_sub.id,
            'expire_sub_' || v_sub.id::text || '_' || to_char(now(), 'YYYYMMDD'),
            'Expired unspent monthly credits from subscription ' || v_sub.id::text
          );
        END IF;
      END IF;
    END IF;

    -- 3. Emit lifecycle event
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

    -- 4. Notify Candidate
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

REVOKE ALL ON FUNCTION public.expire_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO service_role;

