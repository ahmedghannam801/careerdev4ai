-- Measured CV analyses — the record of what the platform measured.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The ATS analysis and the measured analysis are two different things, and the
-- platform keeps them apart:
--
--   * `cv_versions.ats_analysis` holds the model's ATS evaluation. It stays
--     exactly where it is, with the contract it has always had. This migration
--     does not touch it.
--   * This table holds the *measured* analysis: the score the platform counted
--     from the candidate's own document, with the evidence behind every
--     dimension.
--
-- The measured analysis is kept as its own record because it is its own
-- history. A candidate who re-analyses a CV after editing it must be able to
-- see both results, and the older one must not be overwritten by the newer
-- one. Every run is a new row.
--
-- WHAT THIS MIGRATION ADDS
-- -------------------------
--   * `public.cv_measurements`: one row per measured analysis — who owns it,
--     which CV and which version it was about, the role it was measured
--     against, the score, and the full report.
--
-- Nothing is destroyed. No existing table is altered, no row is rewritten and
-- no existing query changes meaning.
--
-- OWNERSHIP
-- ---------
-- Every row belongs to exactly one profile, and the profile id is the id
-- verified from the caller's Supabase JWT — never a value supplied by the
-- browser. Row Level Security is enabled with the same own-rows-only policies
-- the rest of the schema uses, so a request that somehow bypassed the server
-- would still read nothing belonging to anyone else.
--
-- The table is written and read through the server (service_role), because the
-- measured analysis is produced by the server's own analysis service. The
-- browser never needs to write it directly, so the client grants are revoked:
-- a leak of the anon or authenticated key must not allow anyone to fabricate a
-- score that no document supports.
--
-- BACKWARD COMPATIBLE
-- -------------------
-- This migration only creates a new table and its policies. No existing table
-- is altered, no row is rewritten and no existing query changes meaning.

CREATE TABLE IF NOT EXISTS public.cv_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owner. The id comes from the verified Supabase session, so it is the
  -- only identity the application trusts.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The CV the analysis was about. A measurement that is not about a stored CV
  -- (the studio measures the document the candidate is editing) has no CV and
  -- no version, and is not written here at all.
  cv_id uuid REFERENCES public.cvs(id) ON DELETE CASCADE,
  cv_version_id uuid REFERENCES public.cv_versions(id) ON DELETE SET NULL,

  -- The role the CV was measured against, and the advertisement it was
  -- measured against when one was supplied.
  target_role_title text NOT NULL DEFAULT '',
  job_description text,

  -- The measured score and the band it falls in. The report holds the whole
  -- measurement: the dimensions, their evidence, the strengths, the gaps and
  -- the action plan.
  overall_score integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  band text NOT NULL,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- The listing query: one candidate's analyses, newest first.
CREATE INDEX IF NOT EXISTS cv_measurements_profile_created_idx
  ON public.cv_measurements (profile_id, created_at DESC);

-- The history of one CV, which is what "re-analyze" shows.
CREATE INDEX IF NOT EXISTS cv_measurements_cv_created_idx
  ON public.cv_measurements (cv_id, created_at DESC);

-- Row Level Security: a candidate reads and writes only their own analyses.
ALTER TABLE public.cv_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_measurements' AND policyname='cv_measurements_select_own') THEN
    CREATE POLICY cv_measurements_select_own ON public.cv_measurements FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_measurements' AND policyname='cv_measurements_insert_own') THEN
    CREATE POLICY cv_measurements_insert_own ON public.cv_measurements FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_measurements' AND policyname='cv_measurements_update_own') THEN
    CREATE POLICY cv_measurements_update_own ON public.cv_measurements FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_measurements' AND policyname='cv_measurements_delete_own') THEN
    CREATE POLICY cv_measurements_delete_own ON public.cv_measurements FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

-- The analysis is produced by the server's own service, so the browser never
-- needs to write it. Revoking the client grants keeps a leaked anon or
-- authenticated key from fabricating a score that no document supports.
REVOKE ALL ON public.cv_measurements FROM anon;
REVOKE ALL ON public.cv_measurements FROM authenticated;

COMMENT ON TABLE public.cv_measurements IS
  'The measured CV analyses: the score counted from the candidate''s own document, with its evidence.';
COMMENT ON COLUMN public.cv_measurements.report IS
  'The whole measurement: the six dimensions, their evidence, the strengths, the gaps and the action plan.';
COMMENT ON COLUMN public.cv_measurements.band IS
  'The band the score falls in: excellent, good or needs_improvement.';
