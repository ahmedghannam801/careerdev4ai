-- Volunteer experience + its link to the existing projects.
--
-- The platform has no volunteer concept today: `public.experiences` holds
-- EMPLOYMENT (company + job title) and feeds the CV import pipeline and the
-- public resume, so a volunteer stint cannot be stored there without
-- polluting the employment timeline that the CV builder reads.
--
-- This migration adds a self-contained pair of tables instead:
--
--   public.volunteer_experiences  — one volunteer stint (organisation, role,
--                                    duration, responsibilities, achievements,
--                                    skills gained).
--   public.volunteer_projects      — the link from a volunteer stint to the
--                                    EXISTING public.projects rows, so a
--                                    project can be shown as evidence of the
--                                    volunteering and vice versa.
--
-- `public.projects` itself is NOT changed: the link table points at it, so
-- every existing project keeps working exactly as before.
--
-- Ownership follows the rest of the schema: `profile_id = auth.users.id`,
-- enforced by row-level security. Nothing here reads or writes another
-- user's rows.
--
-- Idempotent: every statement can be re-applied. No table is dropped, no
-- existing row is modified and no data is migrated.

-- ---------------------------------------------------------------------------
-- 1. volunteer_experiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.volunteer_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The organisation the user volunteered for.
  organization text NOT NULL,
  -- The role the user took on, e.g. "Mentor" or "Field Volunteer".
  role text NOT NULL,
  location text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  -- A short summary of the stint.
  description text,
  -- What the user was responsible for.
  responsibilities text[] NOT NULL DEFAULT '{}'::text[],
  -- Concrete outcomes of the stint.
  achievements text[] NOT NULL DEFAULT '{}'::text[],
  -- The skills the user gained or demonstrated through it.
  skills text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_volunteer_experiences_profile_id
  ON public.volunteer_experiences(profile_id);

-- ---------------------------------------------------------------------------
-- 2. volunteer_projects — the link to the existing projects
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.volunteer_projects (
  volunteer_experience_id uuid NOT NULL
    REFERENCES public.volunteer_experiences(id) ON DELETE CASCADE,
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_projects_pkey PRIMARY KEY (volunteer_experience_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_projects_project_id
  ON public.volunteer_projects(project_id);

-- ---------------------------------------------------------------------------
-- 3. Row level security
--
-- The volunteer rows are owned by the user (profile_id = auth.users.id). The
-- link rows are owned through BOTH ends: the volunteer stint AND the project
-- must belong to the signed-in user, so a link can never point at somebody
-- else's project.
-- ---------------------------------------------------------------------------

ALTER TABLE public.volunteer_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volunteer_experiences_select_own ON public.volunteer_experiences;
CREATE POLICY volunteer_experiences_select_own ON public.volunteer_experiences
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_experiences_insert_own ON public.volunteer_experiences;
CREATE POLICY volunteer_experiences_insert_own ON public.volunteer_experiences
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_experiences_update_own ON public.volunteer_experiences;
CREATE POLICY volunteer_experiences_update_own ON public.volunteer_experiences
  FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_experiences_delete_own ON public.volunteer_experiences;
CREATE POLICY volunteer_experiences_delete_own ON public.volunteer_experiences
  FOR DELETE USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_projects_select_own ON public.volunteer_projects;
CREATE POLICY volunteer_projects_select_own ON public.volunteer_projects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.volunteer_experiences v
            WHERE v.id = volunteer_projects.volunteer_experience_id AND v.profile_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = volunteer_projects.project_id AND p.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS volunteer_projects_insert_own ON public.volunteer_projects;
CREATE POLICY volunteer_projects_insert_own ON public.volunteer_projects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.volunteer_experiences v
            WHERE v.id = volunteer_projects.volunteer_experience_id AND v.profile_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = volunteer_projects.project_id AND p.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS volunteer_projects_delete_own ON public.volunteer_projects;
CREATE POLICY volunteer_projects_delete_own ON public.volunteer_projects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.volunteer_experiences v
            WHERE v.id = volunteer_projects.volunteer_experience_id AND v.profile_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = volunteer_projects.project_id AND p.profile_id = auth.uid())
  );
