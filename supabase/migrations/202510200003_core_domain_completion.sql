-- Phase B.3.7 — Core domain persistence completion: schema corrections
--
-- Every change below was proven necessary by the application code (B.3.7 audit):
--   1. job_applications.salary_discussed is BOOLEAN in the schema but the
--      TypeScript type is `salaryDiscussed?: string` and the real usage stores
--      a salary amount ('$145,000') — a boolean column would silently
--      corrupt that data.
--   2. job_applications.interview_stage_details is JSONB in the schema but the
--      TypeScript type is `interviewStageDetails?: string` and the real usage
--      stores 'Technical Interview (Virtual)'.
--   3. profile_certifications has no expiry_date, but ProfileView edits
--      certForm.expiryDate.
--   4. profiles has no country/city, but ProfileView reads and writes
--      profile.city and profile.country.
--
-- All four are ADDITIVE or a type widening. No table is created or dropped.
-- No data is deleted. Previous migrations are not modified.

-- 1 & 2. Widen the two job_applications columns to text.
--    USING is a safe cast for boolean -> text and jsonb -> text.
ALTER TABLE public.job_applications
  ALTER COLUMN salary_discussed TYPE text USING salary_discussed::text;
ALTER TABLE public.job_applications
  ALTER COLUMN interview_stage_details TYPE text USING interview_stage_details::text;

-- 3. Certification expiry date (mirrors UserCertificationEntry.expiryDate).
ALTER TABLE public.profile_certifications
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- 4. Location parts (mirrors UserProfile.city / UserProfile.country).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text;

-- profile_languages: the TS type has no is_primary, and the same language
-- must not be stored twice for one profile.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_languages_profile_name
  ON public.profile_languages(profile_id, name);

-- profile_certifications: one row per credential id for a profile.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_certifications_credential
  ON public.profile_certifications(profile_id, credential_id)
  WHERE credential_id IS NOT NULL;
