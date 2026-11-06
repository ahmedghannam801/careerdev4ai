-- Migration: 20261110000002_subscriptions_and_payments.sql
-- Description: Core Subscriptions, Payment Requests, and Privacy Consents
--
-- Tables:
-- 1. public.user_privacy_consents (Explicit granular consents e.g. birthday)
-- 2. public.payment_requests (Manual payment submission, 24h temp access, risk scoring)
-- 3. public.subscriptions (Active candidate tier subscriptions)

-- ---------------------------------------------------------------------------
-- 1. user_privacy_consents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_privacy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_purpose text NOT NULL,
  status text NOT NULL DEFAULT 'granted',
  consented_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL DEFAULT 'v1.0',
  ip_address text,
  user_agent text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  corrected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT user_privacy_consents_purpose_check CHECK (
    consent_purpose IN (
      'birthday_reward',
      'ai_data_processing',
      'marketing_communications'
    )
  ),
  CONSTRAINT user_privacy_consents_status_check CHECK (
    status IN ('granted', 'withdrawn', 'corrected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_privacy_consents_active_purpose
  ON public.user_privacy_consents (profile_id, consent_purpose)
  WHERE (status = 'granted');

CREATE INDEX IF NOT EXISTS idx_user_privacy_consents_profile_history
  ON public.user_privacy_consents (profile_id, created_at DESC);

ALTER TABLE public.user_privacy_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_privacy_consents_select_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_select_own ON public.user_privacy_consents
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_privacy_consents_insert_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_insert_own ON public.user_privacy_consents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_privacy_consents_update_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_update_own ON public.user_privacy_consents
  FOR UPDATE TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

GRANT SELECT, INSERT, UPDATE ON public.user_privacy_consents TO authenticated;
GRANT ALL ON public.user_privacy_consents TO service_role;

DROP TRIGGER IF EXISTS trg_user_privacy_consents_updated_at ON public.user_privacy_consents;
CREATE TRIGGER trg_user_privacy_consents_updated_at
  BEFORE UPDATE ON public.user_privacy_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. payment_requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  original_amount_piasters integer NOT NULL,
  discount_amount_piasters integer NOT NULL DEFAULT 0,
  amount_piasters integer NOT NULL,
  currency text NOT NULL DEFAULT 'EGP',
  coupon_id uuid REFERENCES public.coupon_definitions(id) ON DELETE SET NULL,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  transaction_reference text,
  sender_phone_or_handle text,
  receipt_storage_path text,
  receipt_filename text,
  receipt_content_type text,
  receipt_size_bytes integer,
  receipt_hash text,
  risk_score numeric(5,2) NOT NULL DEFAULT 0.00,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  temporary_access_granted_at timestamptz,
  temporary_access_expires_at timestamptz,
  review_notes text,
  rejection_reason text,
  reviewed_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT payment_requests_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT payment_requests_currency_check CHECK (currency = 'EGP'),
  CONSTRAINT payment_requests_amounts_check CHECK (
    original_amount_piasters >= 0 AND
    discount_amount_piasters >= 0 AND
    amount_piasters >= 0 AND
    amount_piasters = (original_amount_piasters - discount_amount_piasters)
  ),
  CONSTRAINT payment_requests_billing_cycle_check CHECK (
    billing_cycle IN ('monthly', 'annual')
  ),
  CONSTRAINT payment_requests_payment_method_check CHECK (
    payment_method IN ('vodafone_cash', 'instapay')
  ),
  CONSTRAINT payment_requests_status_check CHECK (
    status IN (
      'pending',
      'under_review',
      'temporary_access',
      'paid',
      'rejected',
      'expired',
      'refunded'
    )
  ),
  CONSTRAINT payment_requests_risk_score_check CHECK (
    risk_score >= 0.00 AND risk_score <= 100.00
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_profile_status
  ON public.payment_requests (profile_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_requests_admin_queue
  ON public.payment_requests (status, created_at ASC)
  WHERE (status IN ('under_review', 'temporary_access'));

CREATE INDEX IF NOT EXISTS idx_payment_requests_temp_access_sweep
  ON public.payment_requests (status, temporary_access_expires_at)
  WHERE (status = 'temporary_access');

CREATE INDEX IF NOT EXISTS idx_payment_requests_tx_reference
  ON public.payment_requests (payment_method, lower(trim(transaction_reference)))
  WHERE (transaction_reference IS NOT NULL AND status IN ('paid', 'under_review', 'temporary_access'));

CREATE INDEX IF NOT EXISTS idx_payment_requests_receipt_hash
  ON public.payment_requests (receipt_hash)
  WHERE (receipt_hash IS NOT NULL AND status IN ('paid', 'under_review', 'temporary_access'));

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_requests_select_own ON public.payment_requests;
CREATE POLICY payment_requests_select_own ON public.payment_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

-- BLK-01: Direct client INSERT removed. Payment requests are created exclusively server-side via service_role.
DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;

DROP POLICY IF EXISTS payment_requests_admin_all ON public.payment_requests;
CREATE POLICY payment_requests_admin_all ON public.payment_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;

DROP TRIGGER IF EXISTS trg_payment_requests_updated_at ON public.payment_requests;
CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  current_period_starts_at timestamptz NOT NULL DEFAULT now(),
  current_period_ends_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  ended_at timestamptz,
  latest_payment_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  auto_renew boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT subscriptions_billing_cycle_check CHECK (billing_cycle IN ('monthly', 'annual')),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'expired', 'cancelled', 'suspended')
  ),
  CONSTRAINT subscriptions_period_validity CHECK (
    current_period_ends_at > current_period_starts_at
  )
);

-- Crucial: Enforces exactly ONE active subscription per candidate
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON public.subscriptions (profile_id)
  WHERE (status = 'active');

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_expiration
  ON public.subscriptions (status, current_period_ends_at)
  WHERE (status = 'active');

CREATE INDEX IF NOT EXISTS idx_subscriptions_profile_history
  ON public.subscriptions (profile_id, created_at DESC);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS subscriptions_admin_select ON public.subscriptions;
CREATE POLICY subscriptions_admin_select ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

DROP POLICY IF EXISTS subscriptions_admin_manage ON public.subscriptions;
CREATE POLICY subscriptions_admin_manage ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() 
        AND au.status = 'active'
        AND au.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() 
        AND au.status = 'active'
        AND au.role = 'super_admin'
    )
  );

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

