-- Profile and Portfolio Enhancements
--
-- Adds project portfolio metadata (category, role, responsibilities, start_date,
-- is_featured, include_in_portfolio, thumbnail_url, screenshots) and
-- certification attachment support.
--
-- Additive only: no table is dropped, no column is removed, no existing data is altered.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS responsibilities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_in_portfolio boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS screenshots jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.profile_certifications
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- Index for featured portfolio projects
CREATE INDEX IF NOT EXISTS idx_projects_profile_featured
  ON public.projects(profile_id, is_featured)
  WHERE is_featured = true;

