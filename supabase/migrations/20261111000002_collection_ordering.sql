-- The order of the entries on a CV.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The order of the experience, the education, the certifications, the
-- languages and the projects is part of the document. A candidate who worked
-- at two employers wants the one that matters first, and a recruiter reads
-- the top of the CV longest.
--
-- The order was never stored. Every list was re-sorted by the server on every
-- read — by start date for the timeline, by issue date for the certificates,
-- by name for the languages, by creation time for the projects — so a
-- candidate could not put the entry they wanted first, and a CV that made
-- sense to them came back in a different order every time it was rebuilt.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   * One `sort_order` column on each of the five collections that appear on
--     a CV.
--
-- WHY IT IS BACKWARD COMPATIBLE
-- -----------------------------
-- The column defaults to 0 and the server reads it as the FIRST key of the
-- sort, with the old date as the tiebreak. Every existing row therefore has
-- sort_order = 0 and keeps exactly the order it has today — the change is
-- invisible until somebody reorders something. Nothing is backfilled, and
-- nothing is rewritten.
--
-- Row-level security is untouched: every one of these tables already has
-- owner-only policies, and no new table and no new access path is introduced.

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.educations
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.profile_certifications
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.profile_languages
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.experiences.sort_order IS
  'The position of this entry on the CV, lowest first. Ties are broken by start_date.';
COMMENT ON COLUMN public.educations.sort_order IS
  'The position of this entry on the CV, lowest first. Ties are broken by start_date.';
COMMENT ON COLUMN public.profile_certifications.sort_order IS
  'The position of this entry on the CV, lowest first. Ties are broken by issue_date.';
COMMENT ON COLUMN public.profile_languages.sort_order IS
  'The position of this entry on the CV, lowest first. Ties are broken by name.';
COMMENT ON COLUMN public.projects.sort_order IS
  'The position of this entry on the CV, lowest first. Ties are broken by created_at.';
