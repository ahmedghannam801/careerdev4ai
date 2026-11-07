-- Migration: 20261113000001_stripe_billing.sql
-- Description: Stripe card payments, subscriptions, invoices, webhook ledger
--
-- Stripe is the source of truth for card payments. These tables are a
-- read-only mirror for the application: the webhook handler (service_role)
-- writes them, candidates may only read their own rows, and no client role
-- has INSERT, UPDATE or DELETE.
--
-- The offline rails (`payment_requests`, `subscriptions`) are untouched. A
-- candidate can pay by card through Stripe or by wallet transfer through the
-- existing flow, and `getUserEffectivePlan()` checks Stripe first.

-- ---------------------------------------------------------------------------
-- 1. stripe_customers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_customers (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  email text,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_customers_select_own ON public.stripe_customers;
CREATE POLICY stripe_customers_select_own ON public.stripe_customers
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS stripe_customers_admin_select ON public.stripe_customers;
CREATE POLICY stripe_customers_admin_select ON public.stripe_customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.stripe_customers TO authenticated;
GRANT ALL ON public.stripe_customers TO service_role;

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON public.stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON public.stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. stripe_subscriptions
-- ---------------------------------------------------------------------------
--
-- `status` keeps Stripe's own vocabulary (active, trialing, past_due,
-- canceled, unpaid, incomplete, incomplete_expired, paused) rather than
-- mapping it into the offline enum. A mirror that invents a status it cannot
-- reverse is harder to reconcile than one that stores exactly what Stripe
-- said.

CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  plan_code text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL,
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  trial_end timestamptz,
  livemode boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stripe_subscriptions_billing_cycle_check CHECK (
    billing_cycle IN ('monthly', 'annual')
  ),
  CONSTRAINT stripe_subscriptions_status_check CHECK (
    status IN (
      'active', 'trialing', 'past_due', 'canceled', 'unpaid',
      'incomplete', 'incomplete_expired', 'paused'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_profile
  ON public.stripe_subscriptions (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_active
  ON public.stripe_subscriptions (profile_id, current_period_end DESC)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status
  ON public.stripe_subscriptions (status, current_period_end);

ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_subscriptions_select_own ON public.stripe_subscriptions;
CREATE POLICY stripe_subscriptions_select_own ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS stripe_subscriptions_admin_select ON public.stripe_subscriptions;
CREATE POLICY stripe_subscriptions_admin_select ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.stripe_subscriptions TO authenticated;
GRANT ALL ON public.stripe_subscriptions TO service_role;

DROP TRIGGER IF EXISTS trg_stripe_subscriptions_updated_at ON public.stripe_subscriptions;
CREATE TRIGGER trg_stripe_subscriptions_updated_at
  BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. stripe_invoices
-- ---------------------------------------------------------------------------
--
-- Stripe Billing already issues an invoice for every subscription charge.
-- Mirroring the header row is what makes the Admin Center and the candidate's
-- billing history able to read one table instead of paging the Stripe API.

CREATE TABLE IF NOT EXISTS public.stripe_invoices (
  id text PRIMARY KEY,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id text,
  subscription_id text,
  status text,
  billing_reason text,
  number text,
  currency text NOT NULL DEFAULT 'egp',
  amount_due integer NOT NULL DEFAULT 0,
  amount_paid integer NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  hosted_invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_profile
  ON public.stripe_invoices (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_subscription
  ON public.stripe_invoices (subscription_id);

ALTER TABLE public.stripe_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_invoices_select_own ON public.stripe_invoices;
CREATE POLICY stripe_invoices_select_own ON public.stripe_invoices
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS stripe_invoices_admin_select ON public.stripe_invoices;
CREATE POLICY stripe_invoices_admin_select ON public.stripe_invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.stripe_invoices TO authenticated;
GRANT ALL ON public.stripe_invoices TO service_role;

DROP TRIGGER IF EXISTS trg_stripe_invoices_updated_at ON public.stripe_invoices;
CREATE TRIGGER trg_stripe_invoices_updated_at
  BEFORE UPDATE ON public.stripe_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. stripe_webhook_events
-- ---------------------------------------------------------------------------
--
-- The primary key is the Stripe event id, which is what makes redelivery
-- idempotent. Client roles get no access at all: the payload can contain
-- another candidate's billing details.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  api_version text,
  livemode boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_unprocessed
  ON public.stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy for `authenticated` and no grant: only service_role.
GRANT ALL ON public.stripe_webhook_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. grant_ai_credits
-- ---------------------------------------------------------------------------
--
-- A purchase has to add credits to a running balance that can go up and down.
-- The existing ledger inserts a fixed running_balance (correct for the
-- one-time trial), which is not safe for a concurrent purchase. This function
-- serialises on the profile, reads the latest balance, appends one row, and is
-- idempotent on the caller's key.
--
-- `expire` and `consume` are not routed through it: those already have their
-- own stored procedures.

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
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_ai_credits: amount must be positive';
  END IF;

  IF p_source_type NOT IN ('subscription', 'payment', 'admin', 'system', 'onboarding', 'birthday', 'trial') THEN
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

REVOKE ALL ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb) TO service_role;
