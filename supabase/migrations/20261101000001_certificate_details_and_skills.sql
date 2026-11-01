-- Certificate detail and skill coverage.
--
-- The platform spec asks every certificate to carry a description and the
-- skills or tools it produced. The table had neither:
--
--   * public.profile_certifications had name / issuer / issue_date /
--     expiry_date / url / credential_id, so a description could only ever
--     live inside the CV document, where it was never written and always
--     arrived empty.
--   * there was no link table, so "the skills this certificate gave me" had
--     nowhere to be recorded at all.
--
-- Everything below is ADDITIVE. No table is dropped, no column is removed,
-- no row is deleted and no existing value is rewritten. Existing
-- certificates keep working exactly as they did and simply gain two
-- optional, empty fields.

-- 1. The description of a certificate.
ALTER TABLE public.profile_certifications
  ADD COLUMN IF NOT EXISTS description text;

-- 2. The skills and tools a certificate produced.
--
-- The shape mirrors public.project_skills and public.evidence_skills: a
-- join table that points at the canonical public.skills catalogue, so the
-- same skill name cannot drift between a project, a piece of evidence and a
-- certificate.
--
-- The link is to the certificate rather than to the profile, and ownership is
-- inherited through it, which is why the policies below resolve the owner
-- with a sub-select instead of reading a profile_id column.
CREATE TABLE IF NOT EXISTS public.profile_certification_skills (
  certification_id uuid NOT NULL REFERENCES public.profile_certifications(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  CONSTRAINT profile_certification_skills_pkey PRIMARY KEY (certification_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_certification_skills_skill_id
  ON public.profile_certification_skills(skill_id);

-- 3. Row level security.
--
-- The certificate link rows have no profile_id of their own: the owner is
-- the profile that owns the certificate they point at. The policies below
-- therefore resolve the owner through public.profile_certifications, exactly
-- as public.project_skills resolves it through public.projects.
ALTER TABLE public.profile_certification_skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certification_skills' AND policyname='profile_certification_skills_select_own') THEN
    CREATE POLICY profile_certification_skills_select_own ON public.profile_certification_skills FOR SELECT USING (EXISTS (SELECT 1 FROM public.profile_certifications c WHERE c.id = profile_certification_skills.certification_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certification_skills' AND policyname='profile_certification_skills_insert_own') THEN
    CREATE POLICY profile_certification_skills_insert_own ON public.profile_certification_skills FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profile_certifications c WHERE c.id = profile_certification_skills.certification_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certification_skills' AND policyname='profile_certification_skills_update_own') THEN
    CREATE POLICY profile_certification_skills_update_own ON public.profile_certification_skills FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profile_certifications c WHERE c.id = profile_certification_skills.certification_id AND c.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.profile_certifications c WHERE c.id = profile_certification_skills.certification_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certification_skills' AND policyname='profile_certification_skills_delete_own') THEN
    CREATE POLICY profile_certification_skills_delete_own ON public.profile_certification_skills FOR DELETE USING (EXISTS (SELECT 1 FROM public.profile_certifications c WHERE c.id = profile_certification_skills.certification_id AND c.profile_id = auth.uid()));
  END IF;
END $$;
