-- Migration: 20261113000002_stripe_refunds_and_disputes.sql
-- Description: Stripe refunds, disputes, invoice classification and event ordering
--
-- Additive only. The base Stripe mirror lives in 20261113000001_stripe_billing.sql
-- and is not rewritten: this migration adds what the lifecycle handlers need
-- to record money coming back and to ignore a delayed older webhook.
--
--   * stripe_invoices gains payment_intent (links a refund to the invoice),
--     amount_remaining, plan_code, purchase_kind and last_event_at.
--   * stripe_subscriptions gains ended_at and last_event_at.
--   * stripe_customers gains deleted (customer.deleted).
--   * stripe_refunds and stripe_disputes are new mirrors.
--
-- `last_event_at` is the Stripe event's `created` timestamp. A webhook that is
-- older than the row's last applied event is acknowledged without overwriting
-- newer state, which is what makes out-of-order delivery safe.

-- ---------------------------------------------------------------------------
-- 1. Extend the existing mirrors
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_customers
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.stripe_subscriptions
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

ALTER TABLE public.stripe_invoices
  ADD COLUMN IF NOT EXISTS payment_intent text,
  ADD COLUMN IF NOT EXISTS amount_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS purchase_kind text,
  ADD COLUMN IF NOT EXISTS invoice_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_payment_intent
  ON public.stripe_invoices (payment_intent)
  WHERE payment_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_created
  ON public.stripe_invoices (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. stripe_refunds
-- ---------------------------------------------------------------------------
--
-- One row per Stripe Refund object. `status = 'succeeded'` is the only state
-- that reduces revenue: `pending` and `failed` are visible to the admin but
-- are not counted as money returned.

CREATE TABLE IF NOT EXISTS public.stripe_refunds (
  id text PRIMARY KEY,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id text,
  invoice_id text,
  charge_id text,
  payment_intent text,
  amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'egp',
  status text,
  reason text,
  livemode boolean NOT NULL DEFAULT false,
  refund_created_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_profile
  ON public.stripe_refunds (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_invoice
  ON public.stripe_refunds (invoice_id);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_livemode
  ON public.stripe_refunds (livemode, status, created_at DESC);

ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_refunds_select_own ON public.stripe_refunds;
CREATE POLICY stripe_refunds_select_own ON public.stripe_refunds
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS stripe_refunds_admin_select ON public.stripe_refunds;
CREATE POLICY stripe_refunds_admin_select ON public.stripe_refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.stripe_refunds TO authenticated;
GRANT ALL ON public.stripe_refunds TO service_role;

DROP TRIGGER IF EXISTS trg_stripe_refunds_updated_at ON public.stripe_refunds;
CREATE TRIGGER trg_stripe_refunds_updated_at
  BEFORE UPDATE ON public.stripe_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. stripe_disputes
-- ---------------------------------------------------------------------------
--
-- A dispute is not a refund: the money may still be returned if the dispute is
-- won. It is stored for admin visibility and is never treated as revenue or as
-- an automatic clawback.

CREATE TABLE IF NOT EXISTS public.stripe_disputes (
  id text PRIMARY KEY,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id text,
  charge_id text,
  payment_intent text,
  amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'egp',
  status text,
  reason text,
  livemode boolean NOT NULL DEFAULT false,
  dispute_created_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_livemode
  ON public.stripe_disputes (livemode, status, created_at DESC);

ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;

-- Deliberately no candidate policy: a dispute is an internal finance matter.
DROP POLICY IF EXISTS stripe_disputes_admin_select ON public.stripe_disputes;
CREATE POLICY stripe_disputes_admin_select ON public.stripe_disputes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.stripe_disputes TO authenticated;
GRANT ALL ON public.stripe_disputes TO service_role;

DROP TRIGGER IF EXISTS trg_stripe_disputes_updated_at ON public.stripe_disputes;
CREATE TRIGGER trg_stripe_disputes_updated_at
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();
