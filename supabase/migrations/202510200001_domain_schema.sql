-- Phase B.3.4 — CareerPilot domain schema
-- Adds the 17 domain tables from B3_3_DOMAIN_SCHEMA_AUDIT.md + 11 additive columns on public.profiles.
--
-- Ownership model (verified live):
--   auth.users.id -> public.profiles.id -> <table>.profile_id
-- No auth_uid column. No destructive DDL. No data migration.

-- ============================================================
-- STEP 4 — Additive columns on public.profiles
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_position text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_company text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS headline text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS professional_summary text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_goal_text text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS years_of_experience text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ============================================================
-- STEP 5 — Domain tables
-- ============================================================

-- 1. roadmaps — one roadmap per profile
CREATE TABLE IF NOT EXISTS public.roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_enrolled boolean NOT NULL DEFAULT false,
  target_role_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmaps_profile_id_key UNIQUE (profile_id)
);

-- 2. roadmap_phases
CREATE TABLE IF NOT EXISTS public.roadmap_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  phase_number int NOT NULL,
  title text NOT NULL,
  description text,
  is_unlocked boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT roadmap_phases_roadmap_phase_key UNIQUE (roadmap_id, phase_number)
);

-- 3. roadmap_milestones (completedTasksCount is derived — not stored)
CREATE TABLE IF NOT EXISTS public.roadmap_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.roadmap_phases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT roadmap_milestones_phase_order_key UNIQUE (phase_id, sort_order)
);

-- 4. roadmap_tasks
CREATE TABLE IF NOT EXISTS public.roadmap_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.roadmap_milestones(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started',
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  skill_name text,
  deadline date,
  resource_id text,
  resource_title text,
  evidence_id uuid,
  estimated_hours int,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT roadmap_tasks_status_check CHECK (status IN ('not_started','in_progress','completed')),
  CONSTRAINT roadmap_tasks_milestone_order_key UNIQUE (milestone_id, sort_order)
);

-- 5. projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal text,
  description text,
  difficulty text,
  status text,
  repository_url text,
  demo_url text,
  documentation text,
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 6. project_skills
CREATE TABLE IF NOT EXISTS public.project_skills (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  CONSTRAINT project_skills_pkey PRIMARY KEY (project_id, skill_id)
);

-- 7. evidence_items (project deletion must NOT delete evidence)
CREATE TABLE IF NOT EXISTS public.evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text,
  description text,
  url text,
  verified boolean NOT NULL DEFAULT false,
  date_added date
);

-- Deferred FK: roadmap_tasks.evidence_id -> evidence_items (added after evidence_items exists)
ALTER TABLE public.roadmap_tasks
  ADD CONSTRAINT roadmap_tasks_evidence_id_fkey
  FOREIGN KEY (evidence_id) REFERENCES public.evidence_items(id) ON DELETE SET NULL;

-- 8. evidence_skills
CREATE TABLE IF NOT EXISTS public.evidence_skills (
  evidence_id uuid NOT NULL REFERENCES public.evidence_items(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  CONSTRAINT evidence_skills_pkey PRIMARY KEY (evidence_id, skill_id)
);

-- 9. cvs (one active CV per user)
CREATE TABLE IF NOT EXISTS public.cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_role_title text,
  storage_path text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. cv_versions
CREATE TABLE IF NOT EXISTS public.cv_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id uuid NOT NULL REFERENCES public.cvs(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  name text NOT NULL,
  target_role_title text,
  profile_json jsonb,
  ats_analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_versions_cv_version_key UNIQUE (cv_id, version_number)
);

-- 11. saved_roles
CREATE TABLE IF NOT EXISTS public.saved_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id text NOT NULL,
  title text NOT NULL,
  category text,
  level text,
  payload_json jsonb,
  saved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_roles_profile_role_key UNIQUE (profile_id, role_id)
);

-- 12. job_applications (job_id is a catalogue reference, not an FK)
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id text,
  company text NOT NULL,
  role text NOT NULL,
  location text,
  work_mode text,
  stage text NOT NULL DEFAULT 'saved',
  applied_date date,
  last_updated date,
  next_action text,
  next_action_date date,
  notes text,
  salary_discussed boolean NOT NULL DEFAULT false,
  interview_stage_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_stage_check CHECK (stage IN ('saved','applied','screening','interview','technical','final','offer','rejected','withdrawn'))
);

-- 13. interview_sessions
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_title text,
  type text,
  question text NOT NULL,
  user_answer text,
  ai_feedback jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. profile_certifications
CREATE TABLE IF NOT EXISTS public.profile_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text,
  issue_date date,
  url text,
  credential_id text
);

-- 15. profile_languages
CREATE TABLE IF NOT EXISTS public.profile_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  proficiency text,
  is_primary boolean NOT NULL DEFAULT false
);

-- 16. profile_links
CREATE TABLE IF NOT EXISTS public.profile_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text,
  url text NOT NULL,
  CONSTRAINT profile_links_profile_kind_key UNIQUE (profile_id, kind)
);

-- 17. profile_career_identity
CREATE TABLE IF NOT EXISTS public.profile_career_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  who_you_are text,
  where_youre_going text,
  why text,
  what_youre_missing text,
  what_youre_building text,
  how_youre_presenting text,
  where_applying text,
  CONSTRAINT profile_career_identity_profile_key UNIQUE (profile_id)
);

-- ============================================================
-- STEP 6 — Indexes (justified by access patterns)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_roadmap_phases_roadmap_id ON public.roadmap_phases(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_milestones_phase_id ON public.roadmap_milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_milestone_id ON public.roadmap_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_status ON public.roadmap_tasks(status);
CREATE INDEX IF NOT EXISTS idx_projects_profile_id ON public.projects(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_skill_id ON public.project_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_profile_id ON public.evidence_items(profile_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_project_id ON public.evidence_items(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_skills_skill_id ON public.evidence_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_cvs_profile_id ON public.cvs(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cvs_one_active_per_profile ON public.cvs(profile_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cv_versions_cv_id ON public.cv_versions(cv_id);
CREATE INDEX IF NOT EXISTS idx_saved_roles_profile_id ON public.saved_roles(profile_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_profile_id ON public.job_applications(profile_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON public.job_applications(stage);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_profile_id ON public.interview_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at ON public.interview_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_certifications_profile_id ON public.profile_certifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_languages_profile_id ON public.profile_languages(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_links_profile_id ON public.profile_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_career_identity_profile_id ON public.profile_career_identity(profile_id);

-- ============================================================
-- STEP 7 — RLS on every new user-owned table
-- Ownership: auth.uid() = profile_id  (profiles.id = auth.users.id)
-- ============================================================
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cv_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_career_identity ENABLE ROW LEVEL SECURITY;

-- Direct-owner tables: owner column is profile_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmaps' AND policyname='roadmaps_select_own') THEN
    CREATE POLICY roadmaps_select_own ON public.roadmaps FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmaps' AND policyname='roadmaps_insert_own') THEN
    CREATE POLICY roadmaps_insert_own ON public.roadmaps FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmaps' AND policyname='roadmaps_update_own') THEN
    CREATE POLICY roadmaps_update_own ON public.roadmaps FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmaps' AND policyname='roadmaps_delete_own') THEN
    CREATE POLICY roadmaps_delete_own ON public.roadmaps FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_select_own') THEN
    CREATE POLICY projects_select_own ON public.projects FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_insert_own') THEN
    CREATE POLICY projects_insert_own ON public.projects FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_update_own') THEN
    CREATE POLICY projects_update_own ON public.projects FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_delete_own') THEN
    CREATE POLICY projects_delete_own ON public.projects FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_items' AND policyname='evidence_items_select_own') THEN
    CREATE POLICY evidence_items_select_own ON public.evidence_items FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_items' AND policyname='evidence_items_insert_own') THEN
    CREATE POLICY evidence_items_insert_own ON public.evidence_items FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_items' AND policyname='evidence_items_update_own') THEN
    CREATE POLICY evidence_items_update_own ON public.evidence_items FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_items' AND policyname='evidence_items_delete_own') THEN
    CREATE POLICY evidence_items_delete_own ON public.evidence_items FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cvs' AND policyname='cvs_select_own') THEN
    CREATE POLICY cvs_select_own ON public.cvs FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cvs' AND policyname='cvs_insert_own') THEN
    CREATE POLICY cvs_insert_own ON public.cvs FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cvs' AND policyname='cvs_update_own') THEN
    CREATE POLICY cvs_update_own ON public.cvs FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cvs' AND policyname='cvs_delete_own') THEN
    CREATE POLICY cvs_delete_own ON public.cvs FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_roles' AND policyname='saved_roles_select_own') THEN
    CREATE POLICY saved_roles_select_own ON public.saved_roles FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_roles' AND policyname='saved_roles_insert_own') THEN
    CREATE POLICY saved_roles_insert_own ON public.saved_roles FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_roles' AND policyname='saved_roles_update_own') THEN
    CREATE POLICY saved_roles_update_own ON public.saved_roles FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_roles' AND policyname='saved_roles_delete_own') THEN
    CREATE POLICY saved_roles_delete_own ON public.saved_roles FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='job_applications_select_own') THEN
    CREATE POLICY job_applications_select_own ON public.job_applications FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='job_applications_insert_own') THEN
    CREATE POLICY job_applications_insert_own ON public.job_applications FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='job_applications_update_own') THEN
    CREATE POLICY job_applications_update_own ON public.job_applications FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='job_applications_delete_own') THEN
    CREATE POLICY job_applications_delete_own ON public.job_applications FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_sessions' AND policyname='interview_sessions_select_own') THEN
    CREATE POLICY interview_sessions_select_own ON public.interview_sessions FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_sessions' AND policyname='interview_sessions_insert_own') THEN
    CREATE POLICY interview_sessions_insert_own ON public.interview_sessions FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_sessions' AND policyname='interview_sessions_update_own') THEN
    CREATE POLICY interview_sessions_update_own ON public.interview_sessions FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_sessions' AND policyname='interview_sessions_delete_own') THEN
    CREATE POLICY interview_sessions_delete_own ON public.interview_sessions FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certifications' AND policyname='profile_certifications_select_own') THEN
    CREATE POLICY profile_certifications_select_own ON public.profile_certifications FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certifications' AND policyname='profile_certifications_insert_own') THEN
    CREATE POLICY profile_certifications_insert_own ON public.profile_certifications FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certifications' AND policyname='profile_certifications_update_own') THEN
    CREATE POLICY profile_certifications_update_own ON public.profile_certifications FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_certifications' AND policyname='profile_certifications_delete_own') THEN
    CREATE POLICY profile_certifications_delete_own ON public.profile_certifications FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_languages' AND policyname='profile_languages_select_own') THEN
    CREATE POLICY profile_languages_select_own ON public.profile_languages FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_languages' AND policyname='profile_languages_insert_own') THEN
    CREATE POLICY profile_languages_insert_own ON public.profile_languages FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_languages' AND policyname='profile_languages_update_own') THEN
    CREATE POLICY profile_languages_update_own ON public.profile_languages FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_languages' AND policyname='profile_languages_delete_own') THEN
    CREATE POLICY profile_languages_delete_own ON public.profile_languages FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_links' AND policyname='profile_links_select_own') THEN
    CREATE POLICY profile_links_select_own ON public.profile_links FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_links' AND policyname='profile_links_insert_own') THEN
    CREATE POLICY profile_links_insert_own ON public.profile_links FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_links' AND policyname='profile_links_update_own') THEN
    CREATE POLICY profile_links_update_own ON public.profile_links FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_links' AND policyname='profile_links_delete_own') THEN
    CREATE POLICY profile_links_delete_own ON public.profile_links FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_career_identity' AND policyname='profile_career_identity_select_own') THEN
    CREATE POLICY profile_career_identity_select_own ON public.profile_career_identity FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_career_identity' AND policyname='profile_career_identity_insert_own') THEN
    CREATE POLICY profile_career_identity_insert_own ON public.profile_career_identity FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_career_identity' AND policyname='profile_career_identity_update_own') THEN
    CREATE POLICY profile_career_identity_update_own ON public.profile_career_identity FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_career_identity' AND policyname='profile_career_identity_delete_own') THEN
    CREATE POLICY profile_career_identity_delete_own ON public.profile_career_identity FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

-- Child tables: ownership resolved through the parent chain
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_phases' AND policyname='roadmap_phases_select_own') THEN
    CREATE POLICY roadmap_phases_select_own ON public.roadmap_phases FOR SELECT USING (EXISTS (SELECT 1 FROM public.roadmaps r WHERE r.id = roadmap_phases.roadmap_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_phases' AND policyname='roadmap_phases_insert_own') THEN
    CREATE POLICY roadmap_phases_insert_own ON public.roadmap_phases FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.roadmaps r WHERE r.id = roadmap_phases.roadmap_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_phases' AND policyname='roadmap_phases_update_own') THEN
    CREATE POLICY roadmap_phases_update_own ON public.roadmap_phases FOR UPDATE USING (EXISTS (SELECT 1 FROM public.roadmaps r WHERE r.id = roadmap_phases.roadmap_id AND r.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.roadmaps r WHERE r.id = roadmap_phases.roadmap_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_phases' AND policyname='roadmap_phases_delete_own') THEN
    CREATE POLICY roadmap_phases_delete_own ON public.roadmap_phases FOR DELETE USING (EXISTS (SELECT 1 FROM public.roadmaps r WHERE r.id = roadmap_phases.roadmap_id AND r.profile_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_milestones' AND policyname='roadmap_milestones_select_own') THEN
    CREATE POLICY roadmap_milestones_select_own ON public.roadmap_milestones FOR SELECT USING (EXISTS (SELECT 1 FROM public.roadmap_phases p JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE p.id = roadmap_milestones.phase_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_milestones' AND policyname='roadmap_milestones_insert_own') THEN
    CREATE POLICY roadmap_milestones_insert_own ON public.roadmap_milestones FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.roadmap_phases p JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE p.id = roadmap_milestones.phase_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_milestones' AND policyname='roadmap_milestones_update_own') THEN
    CREATE POLICY roadmap_milestones_update_own ON public.roadmap_milestones FOR UPDATE USING (EXISTS (SELECT 1 FROM public.roadmap_phases p JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE p.id = roadmap_milestones.phase_id AND r.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.roadmap_phases p JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE p.id = roadmap_milestones.phase_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_milestones' AND policyname='roadmap_milestones_delete_own') THEN
    CREATE POLICY roadmap_milestones_delete_own ON public.roadmap_milestones FOR DELETE USING (EXISTS (SELECT 1 FROM public.roadmap_phases p JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE p.id = roadmap_milestones.phase_id AND r.profile_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_tasks' AND policyname='roadmap_tasks_select_own') THEN
    CREATE POLICY roadmap_tasks_select_own ON public.roadmap_tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.roadmap_milestones m JOIN public.roadmap_phases p ON p.id = m.phase_id JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE m.id = roadmap_tasks.milestone_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_tasks' AND policyname='roadmap_tasks_insert_own') THEN
    CREATE POLICY roadmap_tasks_insert_own ON public.roadmap_tasks FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.roadmap_milestones m JOIN public.roadmap_phases p ON p.id = m.phase_id JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE m.id = roadmap_tasks.milestone_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_tasks' AND policyname='roadmap_tasks_update_own') THEN
    CREATE POLICY roadmap_tasks_update_own ON public.roadmap_tasks FOR UPDATE USING (EXISTS (SELECT 1 FROM public.roadmap_milestones m JOIN public.roadmap_phases p ON p.id = m.phase_id JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE m.id = roadmap_tasks.milestone_id AND r.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.roadmap_milestones m JOIN public.roadmap_phases p ON p.id = m.phase_id JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE m.id = roadmap_tasks.milestone_id AND r.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='roadmap_tasks' AND policyname='roadmap_tasks_delete_own') THEN
    CREATE POLICY roadmap_tasks_delete_own ON public.roadmap_tasks FOR DELETE USING (EXISTS (SELECT 1 FROM public.roadmap_milestones m JOIN public.roadmap_phases p ON p.id = m.phase_id JOIN public.roadmaps r ON r.id = p.roadmap_id WHERE m.id = roadmap_tasks.milestone_id AND r.profile_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_skills' AND policyname='project_skills_select_own') THEN
    CREATE POLICY project_skills_select_own ON public.project_skills FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_skills.project_id AND p.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_skills' AND policyname='project_skills_insert_own') THEN
    CREATE POLICY project_skills_insert_own ON public.project_skills FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_skills.project_id AND p.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_skills' AND policyname='project_skills_update_own') THEN
    CREATE POLICY project_skills_update_own ON public.project_skills FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_skills.project_id AND p.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_skills.project_id AND p.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_skills' AND policyname='project_skills_delete_own') THEN
    CREATE POLICY project_skills_delete_own ON public.project_skills FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_skills.project_id AND p.profile_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_skills' AND policyname='evidence_skills_select_own') THEN
    CREATE POLICY evidence_skills_select_own ON public.evidence_skills FOR SELECT USING (EXISTS (SELECT 1 FROM public.evidence_items e WHERE e.id = evidence_skills.evidence_id AND e.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_skills' AND policyname='evidence_skills_insert_own') THEN
    CREATE POLICY evidence_skills_insert_own ON public.evidence_skills FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.evidence_items e WHERE e.id = evidence_skills.evidence_id AND e.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_skills' AND policyname='evidence_skills_update_own') THEN
    CREATE POLICY evidence_skills_update_own ON public.evidence_skills FOR UPDATE USING (EXISTS (SELECT 1 FROM public.evidence_items e WHERE e.id = evidence_skills.evidence_id AND e.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.evidence_items e WHERE e.id = evidence_skills.evidence_id AND e.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_skills' AND policyname='evidence_skills_delete_own') THEN
    CREATE POLICY evidence_skills_delete_own ON public.evidence_skills FOR DELETE USING (EXISTS (SELECT 1 FROM public.evidence_items e WHERE e.id = evidence_skills.evidence_id AND e.profile_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_versions' AND policyname='cv_versions_select_own') THEN
    CREATE POLICY cv_versions_select_own ON public.cv_versions FOR SELECT USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_versions.cv_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_versions' AND policyname='cv_versions_insert_own') THEN
    CREATE POLICY cv_versions_insert_own ON public.cv_versions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_versions.cv_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_versions' AND policyname='cv_versions_update_own') THEN
    CREATE POLICY cv_versions_update_own ON public.cv_versions FOR UPDATE USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_versions.cv_id AND c.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_versions.cv_id AND c.profile_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cv_versions' AND policyname='cv_versions_delete_own') THEN
    CREATE POLICY cv_versions_delete_own ON public.cv_versions FOR DELETE USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_versions.cv_id AND c.profile_id = auth.uid()));
  END IF;
END $$;

-- ============================================================
-- STEP 8 — Public profile read policy (SELECT only)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_public') THEN
    CREATE POLICY profiles_select_public ON public.profiles FOR SELECT USING (is_public = true);
  END IF;
END $$;
