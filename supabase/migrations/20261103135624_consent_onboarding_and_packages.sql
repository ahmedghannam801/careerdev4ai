-- Versioned consent, persisted onboarding state, and the job application package.
--
-- This migration adds three things without replacing any existing table:
--
--   user_consents        one row per acceptance, with the Terms and Privacy
--                        versions that were accepted. History is kept: a new
--                        version creates a new row and never overwrites the
--                        old one.
--   profiles             a three-state onboarding status (plus the step the
--                        user reached) so "never started" and "skipped" can be
--                        told apart. The legacy onboarding_completed boolean is
--                        kept and backfilled from the new status.
--   application_packages the association between one job description, the
--                        candidate's source CV, the tailored CV version and
--                        the cover letter. The documents themselves stay in
--                        cvs / cv_versions / cover_letters.
--
-- Every table is owner-scoped with RLS. The server uses the service role for
-- its own guarded reads and writes; the browser never receives a service key.

-- ---------------------------------------------------------------------------
-- 1. Versioned consent
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'withdrawn')),
  source text NOT NULL DEFAULT 'reconsent',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_consents_user_created_idx
  ON public.user_consents (user_id, created_at DESC);

-- The same version pair cannot be accepted twice by the same user. A future
-- version is a different pair, so its acceptance is a separate row.
CREATE UNIQUE INDEX IF NOT EXISTS user_consents_user_versions_key
  ON public.user_consents (user_id, terms_version, privacy_version)
  WHERE status = 'accepted';

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_select_own ON public.user_consents;
CREATE POLICY user_consents_select_own ON public.user_consents
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_consents_insert_own ON public.user_consents;
CREATE POLICY user_consents_insert_own ON public.user_consents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_consents TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Persisted onboarding state
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_updated_at timestamptz;

-- Existing accounts: the boolean is the only historical signal. A completed
-- account becomes 'completed'; everything else starts at 'not_started'.
UPDATE public.profiles
SET onboarding_status = CASE
    WHEN onboarding_completed IS TRUE THEN 'completed'
    ELSE 'not_started'
  END
WHERE onboarding_status IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN onboarding_status SET DEFAULT 'not_started';
ALTER TABLE public.profiles
  ALTER COLUMN onboarding_status SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_status_check
  CHECK (onboarding_status IN ('not_started', 'started', 'completed', 'skipped'));

-- ---------------------------------------------------------------------------
-- 3. Application packages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.application_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title text,
  company text,
  job_description text NOT NULL,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_score integer NOT NULL DEFAULT 0
    CHECK (match_score >= 0 AND match_score <= 100),
  language text,
  source_cv_id uuid REFERENCES public.cvs(id) ON DELETE SET NULL,
  tailored_cv_id uuid REFERENCES public.cvs(id) ON DELETE SET NULL,
  tailored_cv_version_id uuid REFERENCES public.cv_versions(id) ON DELETE SET NULL,
  cover_letter_id uuid REFERENCES public.cover_letters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_packages_profile_created_idx
  ON public.application_packages (profile_id, created_at DESC);

ALTER TABLE public.application_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_packages_select_own ON public.application_packages;
CREATE POLICY application_packages_select_own ON public.application_packages
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS application_packages_insert_own ON public.application_packages;
CREATE POLICY application_packages_insert_own ON public.application_packages
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS application_packages_update_own ON public.application_packages;
CREATE POLICY application_packages_update_own ON public.application_packages
  FOR UPDATE USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS application_packages_delete_own ON public.application_packages;
CREATE POLICY application_packages_delete_own ON public.application_packages
  FOR DELETE USING (auth.uid() = profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_packages TO authenticated;
