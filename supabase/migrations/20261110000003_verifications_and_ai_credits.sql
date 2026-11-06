-- Migration: 20261110000003_verifications_and_ai_credits.sql
-- Description: Payment Verification Audit Trail and Double-Entry AI Credit Ledger
--
-- Tables:
-- 1. public.payment_verifications (OCR, duplicate check, amount verification audit trail)
-- 2. public.ai_credit_ledger (Immutable double-entry AI credit ledger)

-- ---------------------------------------------------------------------------
-- 1. payment_verifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  verification_type text NOT NULL,
  result text NOT NULL,
  confidence_score numeric(5,2),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verifier_type text NOT NULL,
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT payment_verifications_type_check CHECK (
    verification_type IN (
      'ocr',
      'duplicate_check',
      'amount_check',
      'admin_manual',
      'admin_confirm'
    )
  ),
  CONSTRAINT payment_verifications_result_check CHECK (
    result IN ('pass', 'fail', 'inconclusive')
  ),
  CONSTRAINT payment_verifications_verifier_type_check CHECK (
    verifier_type IN ('system', 'admin')
  ),
  CONSTRAINT payment_verifications_confidence_check CHECK (
    confidence_score IS NULL OR (confidence_score >= 0.00 AND confidence_score <= 100.00)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_verifications_request_created
  ON public.payment_verifications (payment_request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_payment_verifications_admin_audit
  ON public.payment_verifications (admin_user_id, created_at DESC)
  WHERE (admin_user_id IS NOT NULL);

ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_verifications_select_own ON public.payment_verifications;
CREATE POLICY payment_verifications_select_own ON public.payment_verifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_requests pr
      WHERE pr.id = payment_verifications.payment_request_id
        AND pr.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payment_verifications_admin_select ON public.payment_verifications;
CREATE POLICY payment_verifications_admin_select ON public.payment_verifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

DROP POLICY IF EXISTS payment_verifications_admin_insert ON public.payment_verifications;
CREATE POLICY payment_verifications_admin_insert ON public.payment_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.payment_verifications TO authenticated;
GRANT ALL ON public.payment_verifications TO service_role;

-- ---------------------------------------------------------------------------
-- 2. ai_credit_ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  running_balance integer NOT NULL,
  operation text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  ai_action_type text,
  idempotency_key text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT ai_credit_ledger_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT ai_credit_ledger_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT ai_credit_ledger_running_balance_positive CHECK (running_balance >= 0),
  CONSTRAINT ai_credit_ledger_operation_check CHECK (
    operation IN ('grant', 'consume', 'refund', 'expire', 'bonus')
  ),
  CONSTRAINT ai_credit_ledger_operation_sign_check CHECK (
    (operation IN ('grant', 'refund', 'bonus') AND amount > 0) OR
    (operation IN ('consume', 'expire') AND amount < 0)
  ),
  CONSTRAINT ai_credit_ledger_source_type_check CHECK (
    source_type IN ('subscription', 'payment', 'admin', 'system', 'onboarding', 'birthday', 'trial')
  ),
  CONSTRAINT ai_credit_ledger_ai_action_type_check CHECK (
    ai_action_type IS NULL OR ai_action_type IN (
      'cv_generation',
      'cv_tailoring',
      'cv_ats_analysis',
      'job_description_analysis',
      'cover_letter_generation',
      'interview_mock_session',
      'roadmap_generation',
      'career_consultation_chat',
      'ai_assist_inline',
      'learning_recommendation',
      'project_analysis'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_profile_created
  ON public.ai_credit_ledger (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_source
  ON public.ai_credit_ledger (source_type, source_id);

ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_credit_ledger_select_own ON public.ai_credit_ledger;
CREATE POLICY ai_credit_ledger_select_own ON public.ai_credit_ledger
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS ai_credit_ledger_admin_select ON public.ai_credit_ledger;
CREATE POLICY ai_credit_ledger_admin_select ON public.ai_credit_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

GRANT SELECT ON public.ai_credit_ledger TO authenticated;
GRANT ALL ON public.ai_credit_ledger TO service_role;

