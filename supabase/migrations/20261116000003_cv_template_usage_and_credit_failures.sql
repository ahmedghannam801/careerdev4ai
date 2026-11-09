-- Migration: 20261116000003_cv_template_usage_and_credit_failures.sql
-- Description: Records which template a CV was made with, and records credit
-- operations that failed so an administrator can inspect them.
--
-- Why
-- ---
-- Two questions could not be answered before this migration:
--
--   * "Which templates do candidates actually use?" The chosen template lived
--     only in `user_preferences.cv_template_id` — a preference, not a record
--     of what a CV was built with, and overwritten the moment the candidate
--     picked a different one. The template a CV was generated with is now
--     stored on the CV itself, together with the tier it was used under, so
--     the free-versus-Premium split can be measured.
--
--   * "Which credit operations failed?" The ledger only ever held successful
--     grants, deductions and refunds. A refusal that was refunded left no
--     trace of the attempt, so an administrator could see that credits came
--     back but not why they had been taken. Failed attempts are now recorded
--     in their own table, with the reason and the amount that was given back.
--
-- The ledger itself is unchanged: it stays the record of the balance, and it
-- keeps its sign and operation rules.

-- ---------------------------------------------------------------------------
-- 1. The template a CV was made with
-- ---------------------------------------------------------------------------

ALTER TABLE public.cvs
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS template_tier text;

-- NOTE: the foreign key on `cvs.template_id` added below is removed again by
-- 20261116000004. The table it pointed at holds only the administrator's
-- metadata rows, and a built-in template has no row there, so the constraint
-- refused every ordinary CV creation. The id is a code constant; a CHECK on
-- the tier is the guarantee that belongs here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cvs_template_id_fkey'
       AND conrelid = 'public.cvs'::regclass
  ) THEN
    ALTER TABLE public.cvs
      ADD CONSTRAINT cvs_template_id_fkey
      FOREIGN KEY (template_id)
      REFERENCES public.cv_templates(template_id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cvs_template_tier_check'
       AND conrelid = 'public.cvs'::regclass
  ) THEN
    ALTER TABLE public.cvs
      ADD CONSTRAINT cvs_template_tier_check
      CHECK (template_tier IS NULL OR template_tier IN ('free', 'premium'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cvs_template_id_idx ON public.cvs (template_id);
CREATE INDEX IF NOT EXISTS cvs_template_tier_idx ON public.cvs (template_tier);

COMMENT ON COLUMN public.cvs.template_id IS
  'The CV template this CV was generated with. NULL for a CV created before templates were recorded.';
COMMENT ON COLUMN public.cvs.template_tier IS
  'The tier of the template used: free or premium. Captured at generation time so a later tier change does not rewrite history.';

-- Backfill the tier of the CVs that exist already, from the template they
-- were made with, where that can be established.
UPDATE public.cvs c
   SET template_tier = t.tier
  FROM public.cv_templates t
 WHERE c.template_id = t.template_id
   AND c.template_tier IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Failed credit operations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_credit_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_action_type text,
  credits_attempted integer NOT NULL DEFAULT 0,
  refunded boolean NOT NULL DEFAULT false,
  failure_reason text,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_credit_failures_credits_attempted_check CHECK (credits_attempted >= 0)
);

CREATE INDEX IF NOT EXISTS ai_credit_failures_profile_id_idx
  ON public.ai_credit_failures (profile_id);
CREATE INDEX IF NOT EXISTS ai_credit_failures_created_at_idx
  ON public.ai_credit_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_credit_failures_action_idx
  ON public.ai_credit_failures (ai_action_type)
  WHERE ai_action_type IS NOT NULL;

COMMENT ON TABLE public.ai_credit_failures IS
  'Credit operations that did not produce a result. The credits were given back; this table records why.';

ALTER TABLE public.ai_credit_failures ENABLE ROW LEVEL SECURITY;

-- An administrator reads these through the service role. A candidate may read
-- their own failures, so that the interface can explain a refused operation.
DROP POLICY IF EXISTS "Users can view their own credit failures" ON public.ai_credit_failures;
CREATE POLICY "Users can view their own credit failures"
  ON public.ai_credit_failures
  FOR SELECT
  USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 3. A single place that counts the daily allowance
--
-- The allowance is three credits. The number lives in one function so that
-- the application, the sweep and the administrative reports all read the same
-- promise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.admin_daily_credit_summary AS
SELECT
  g.grant_date                                        AS grant_day,
  count(*)                                            AS accounts_granted,
  sum(g.granted_amount)                               AS credits_granted,
  sum(g.remaining)                                   AS credits_remaining,
  count(*) FILTER (WHERE g.remaining > 0)             AS accounts_with_credits
FROM public.daily_credit_grants g
GROUP BY g.grant_date;

COMMENT ON VIEW public.admin_daily_credit_summary IS
  'How many accounts received the daily free-credit allowance, and how much of it is still unused.';
