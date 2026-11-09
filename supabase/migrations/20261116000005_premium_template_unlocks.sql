-- Migration: 20261116000005_premium_template_unlocks.sql
-- Description: Lets a candidate unlock a premium CV template with AI credits, and
-- records the unlock so the same template is never charged for twice.
--
-- Why
-- ---
-- A premium template used to be reachable in one way only: the candidate had to
-- hold an active, verified paid subscription. Everything else was a dead end —
-- the candidate could see that the template existed, but there was nothing they
-- could do about it.
--
-- The product now sells the template on its own for a fixed price of ten AI
-- credits. The credits are the currency the platform already runs on, so the
-- purchase has to land in the same ledger as every other credit operation: it
-- must be a `consume` row with an `ai_action_type`, it must be idempotent, and
-- it must be refundable if the work it paid for does not happen.
--
-- The unlock itself is recorded here. Two reasons:
--
--   1. One template, one payment. A candidate who paid ten credits for a
--      template must not be asked for ten credits again to export the CV they
--      already paid for.
--   2. The record is the proof. The server reads it when it decides whether a
--      template may be used, so the decision rests on the ledger and not on
--      anything the browser claims.
--
-- The `ai_action_type` constraint is widened because the ledger validates the
-- action against a closed list, and `premium_template_unlock` is a new action
-- with a different weight from the other CV actions.

-- ---------------------------------------------------------------------------
-- 1. The ledger accepts the new action
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_credit_ledger
  DROP CONSTRAINT IF EXISTS ai_credit_ledger_ai_action_type_check;

ALTER TABLE public.ai_credit_ledger
  ADD CONSTRAINT ai_credit_ledger_ai_action_type_check CHECK (
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
      'project_analysis',
      'premium_template_unlock'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The unlocks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cv_template_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The id of the template as the catalogue names it. It is a code identifier,
  -- not a row of `cv_templates`, which holds only the administrator's metadata
  -- overrides and is empty for a built-in template.
  template_id text NOT NULL,
  -- What the candidate paid. Kept so the ledger and this record can be compared.
  credits_paid integer NOT NULL DEFAULT 0,
  -- The ledger row that took the credits. It is what makes the purchase traceable.
  ledger_idempotency_key text,
  -- The moment the candidate paid. It is the moment the template became theirs.
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cv_template_unlocks_profile_template_key UNIQUE (profile_id, template_id),
  CONSTRAINT cv_template_unlocks_credits_paid_check CHECK (credits_paid >= 0)
);

CREATE INDEX IF NOT EXISTS cv_template_unlocks_profile_id_idx
  ON public.cv_template_unlocks (profile_id);

COMMENT ON TABLE public.cv_template_unlocks IS
  'Premium CV templates a candidate unlocked with AI credits. One row per template per candidate: a template is unlocked once and is not charged for again.';

COMMENT ON COLUMN public.cv_template_unlocks.ledger_idempotency_key IS
  'The idempotency key of the ledger row that consumed the credits, so the purchase can be traced to the money.';

ALTER TABLE public.cv_template_unlocks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cv_template_unlocks FROM anon;
REVOKE ALL ON public.cv_template_unlocks FROM authenticated;
GRANT ALL ON public.cv_template_unlocks TO service_role;
