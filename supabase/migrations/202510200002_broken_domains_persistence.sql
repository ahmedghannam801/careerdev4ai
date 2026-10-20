-- Phase B.3.6 — Persistence for the five previously broken domains
-- Source of truth: B3_5_FIVE_BROKEN_DOMAINS_TYPE_AUDIT.md
--
-- Creates exactly 4 tables. `documents` is deliberately NOT a table: it is a
-- derived UI concept composed from cvs / cover_letters / profile_certifications /
-- projects (see the report, section 2).
--
-- Ownership model: auth.users.id -> public.profiles.id -> <table>.profile_id
-- No auth_uid column. No destructive DDL. No data migration.

-- ============================================================
-- 1. activities — append-only user activity/event feed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  title text NOT NULL,
  subtitle text,
  related_object text,
  link_view text,
  -- Real timestamp. The previous client-side "timestamp" was a display string
  -- ("Just now", "Today, 10:45 AM"); it is now derived at render time.
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_action_type_check CHECK (action_type IN (
    'completed_task', 'completed_course', 'added_project', 'uploaded_cv',
    'applied_job', 'mock_interview', 'acquired_skill', 'added_evidence',
    'saved_job', 'goal_updated', 'document_saved'
  ))
);

-- ============================================================
-- 2. secondary_goals — exact current SecondaryCareerGoal shape
-- ============================================================
CREATE TABLE IF NOT EXISTS public.secondary_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  deadline date,
  status text NOT NULL DEFAULT 'active',
  progress_percent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secondary_goals_priority_check CHECK (priority IN ('high','medium','low')),
  CONSTRAINT secondary_goals_status_check CHECK (status IN ('active','achieved','paused')),
  CONSTRAINT secondary_goals_progress_check CHECK (progress_percent BETWEEN 0 AND 100)
);

-- ============================================================
-- 3. career_milestones — exact current CareerMilestoneItem shape
--    Independent of roadmap_milestones (achieved events, not planned work).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.career_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  date_achieved date NOT NULL,
  notes text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_milestones_category_check CHECK (category IN (
    'internship','project','certification','application','interview',
    'offer','role','promotion','skill'
  ))
);

-- ============================================================
-- 4. cover_letters — exact current CoverLetter shape
--    The canonical source for cover letters (no CareerDocument mirror).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  role text NOT NULL,
  job_description text,
  content text NOT NULL,
  key_highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Static job catalogue reference (source code, not a table) — stays a string.
  target_job_id text,
  -- Application reference. ON DELETE SET NULL so removing an application
  -- does not destroy the user's cover letter.
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes (justified by actual access patterns)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activities_profile_created ON public.activities(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_secondary_goals_profile_id ON public.secondary_goals(profile_id);
CREATE INDEX IF NOT EXISTS idx_career_milestones_profile_id ON public.career_milestones(profile_id);
CREATE INDEX IF NOT EXISTS idx_career_milestones_date ON public.career_milestones(date_achieved DESC);
CREATE INDEX IF NOT EXISTS idx_cover_letters_profile_id ON public.cover_letters(profile_id);
CREATE INDEX IF NOT EXISTS idx_cover_letters_application_id ON public.cover_letters(application_id);

-- ============================================================
-- RLS — owner expression: auth.uid() = profile_id
-- ============================================================
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secondary_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activities' AND policyname='activities_select_own') THEN
    CREATE POLICY activities_select_own ON public.activities FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activities' AND policyname='activities_insert_own') THEN
    CREATE POLICY activities_insert_own ON public.activities FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activities' AND policyname='activities_delete_own') THEN
    CREATE POLICY activities_delete_own ON public.activities FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secondary_goals' AND policyname='secondary_goals_select_own') THEN
    CREATE POLICY secondary_goals_select_own ON public.secondary_goals FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secondary_goals' AND policyname='secondary_goals_insert_own') THEN
    CREATE POLICY secondary_goals_insert_own ON public.secondary_goals FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secondary_goals' AND policyname='secondary_goals_update_own') THEN
    CREATE POLICY secondary_goals_update_own ON public.secondary_goals FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secondary_goals' AND policyname='secondary_goals_delete_own') THEN
    CREATE POLICY secondary_goals_delete_own ON public.secondary_goals FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_milestones' AND policyname='career_milestones_select_own') THEN
    CREATE POLICY career_milestones_select_own ON public.career_milestones FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_milestones' AND policyname='career_milestones_insert_own') THEN
    CREATE POLICY career_milestones_insert_own ON public.career_milestones FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_milestones' AND policyname='career_milestones_update_own') THEN
    CREATE POLICY career_milestones_update_own ON public.career_milestones FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_milestones' AND policyname='career_milestones_delete_own') THEN
    CREATE POLICY career_milestones_delete_own ON public.career_milestones FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cover_letters' AND policyname='cover_letters_select_own') THEN
    CREATE POLICY cover_letters_select_own ON public.cover_letters FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cover_letters' AND policyname='cover_letters_insert_own') THEN
    CREATE POLICY cover_letters_insert_own ON public.cover_letters FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cover_letters' AND policyname='cover_letters_update_own') THEN
    CREATE POLICY cover_letters_update_own ON public.cover_letters FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cover_letters' AND policyname='cover_letters_delete_own') THEN
    CREATE POLICY cover_letters_delete_own ON public.cover_letters FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;
