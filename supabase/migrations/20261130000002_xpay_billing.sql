-- XPay payments.
--
-- Three tables, each answering one question the application has after money
-- moves:
--
--   xpay_webhook_events   has this delivery already been handled?
--   xpay_checkout_sessions what was this session for, and has it been paid?
--   xpay_purchases        what does this candidate's money grant, and until when?
--
-- The split matters for the asynchronous methods. Fawry completes checkout
-- before the money arrives, so a session is stored as unpaid and becomes a
-- purchase only when a verified event says `paymentStatus = paid`. Keeping the
-- two apart means "a session exists" can never be mistaken for "a plan was
-- bought".

CREATE TABLE IF NOT EXISTS public.xpay_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  livemode BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.xpay_webhook_events IS
  'One row per XPay event id. A repeat delivery is skipped, which is what makes fulfilment safe to retry.';

CREATE INDEX IF NOT EXISTS xpay_webhook_events_received_at_idx
  ON public.xpay_webhook_events (received_at DESC);

CREATE TABLE IF NOT EXISTS public.xpay_checkout_sessions (
  id TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  purchase_kind TEXT NOT NULL CHECK (purchase_kind IN ('subscription', 'credit_pack')),
  plan_code TEXT,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  pack_id TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  list_amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  amount_total INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'expired')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'no_payment_required')),
  payment_method_type TEXT,
  payment_intent_id TEXT,
  -- Fawry and other pay-later methods hand the customer a reference. Storing
  -- it lets the screen show "waiting for your payment" with the number the
  -- customer was given, instead of a generic pending state.
  voucher_reference TEXT,
  voucher_expires_at TIMESTAMPTZ,
  coupon_code TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xpay_checkout_sessions IS
  'The XPay session as this platform understands it. payment_status is the only evidence of payment.';

CREATE INDEX IF NOT EXISTS xpay_checkout_sessions_profile_idx
  ON public.xpay_checkout_sessions (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS xpay_checkout_sessions_unpaid_idx
  ON public.xpay_checkout_sessions (payment_status, status)
  WHERE payment_status = 'unpaid';

CREATE TABLE IF NOT EXISTS public.xpay_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE REFERENCES public.xpay_checkout_sessions (id) ON DELETE CASCADE,
  purchase_kind TEXT NOT NULL CHECK (purchase_kind IN ('subscription', 'credit_pack')),
  plan_code TEXT,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  pack_id TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  amount_total INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  payment_method_type TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  -- A plan bought through XPay is one period, renewed by hand: there is no
  -- mandate on file, so access ends when the period ends.
  access_starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  access_ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xpay_purchases IS
  'One row per paid session. The UNIQUE session_id is what makes double fulfilment impossible.';

CREATE INDEX IF NOT EXISTS xpay_purchases_profile_idx
  ON public.xpay_purchases (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS xpay_purchases_access_idx
  ON public.xpay_purchases (profile_id, access_ends_at DESC)
  WHERE status = 'active';

-- These tables hold payment state and must not be writable by a signed-in
-- client. Only the server, which holds the service role, reads and writes them.
ALTER TABLE public.xpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xpay_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xpay_purchases ENABLE ROW LEVEL SECURITY;

-- A candidate may read their own sessions and purchases, so a settings screen
-- can show what they bought without an extra endpoint.
DROP POLICY IF EXISTS xpay_sessions_select_own ON public.xpay_checkout_sessions;
CREATE POLICY xpay_sessions_select_own ON public.xpay_checkout_sessions
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS xpay_purchases_select_own ON public.xpay_purchases;
CREATE POLICY xpay_purchases_select_own ON public.xpay_purchases
  FOR SELECT USING (auth.uid() = profile_id);

-- No policy grants INSERT, UPDATE or DELETE to a client: a candidate cannot
-- mark a session paid, and cannot grant themselves a plan.
