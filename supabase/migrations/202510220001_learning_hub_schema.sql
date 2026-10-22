-- Phase B.5 - AI Learning Hub schema
--
-- Normalized learning model:
--   courses             the curated catalogue (provider, URL, availability, format)
--   course_skills       which skills a course teaches (scoring input)
--   course_roles        which target roles a course is relevant to (scoring input)
--   user_learning_items the user's own learning state (saved / in progress / completed /
--                       dismissed, progress metadata)
--
-- Ownership follows the same model as every other CareerPilot domain:
--   auth.users.id -> public.profiles.id -> user_learning_items.profile_id
--
-- The catalogue tables are GLOBAL and read-only for clients. They are seeded
-- from the verified catalogue migration and are readable by anon and
-- authenticated callers. Writes stay with the service-role client, so a user
-- cannot create a course or alter its URL.
--
-- Idempotent: every statement can be re-applied. No table is dropped, no row
-- is deleted and no existing B.4 table is modified.

CREATE TABLE IF NOT EXISTS public.courses (
  id text PRIMARY KEY,
  title text NOT NULL,
  provider text NOT NULL,
  provider_url text,
  category text NOT NULL,
  level text NOT NULL,
  duration_hours numeric(6, 1),
  language text NOT NULL DEFAULT 'English',
  url text NOT NULL,
  availability text NOT NULL,
  availability_note text,
  format text NOT NULL DEFAULT 'course',
  description text,
  is_verified boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_level_check CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  CONSTRAINT courses_availability_check CHECK (
    availability IN (
      'free',
      'free_with_limitations',
      'audit',
      'free_course_paid_certificate',
      'paid',
      'youtube_free'
    )
  ),
  CONSTRAINT courses_format_check CHECK (
    format IN ('course', 'professional_certificate', 'learning_path', 'tutorial', 'video', 'playlist')
  )
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON public.courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level);
CREATE INDEX IF NOT EXISTS idx_courses_availability ON public.courses(availability);
CREATE INDEX IF NOT EXISTS idx_courses_provider ON public.courses(provider);

-- ---------------------------------------------------------------------------
-- course_skills
--
-- `skill_name` is the canonical join key used by the deterministic scorer: the
-- application identifies a user's skills by name (public.skills.name and the
-- role catalogue in src/data/rolesData.ts both use names). `skill_id` is an
-- optional link to the shared skill catalogue for future FK-based queries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  importance int NOT NULL DEFAULT 3,
  CONSTRAINT course_skills_importance_check CHECK (importance BETWEEN 1 AND 5),
  CONSTRAINT course_skills_course_skill_key UNIQUE (course_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_course_skills_course_id ON public.course_skills(course_id);
CREATE INDEX IF NOT EXISTS idx_course_skills_skill_name ON public.course_skills(lower(skill_name));

-- ---------------------------------------------------------------------------
-- course_roles
--
-- `role_slug` is the stable id of a role in the application catalogue
-- (src/data/rolesData.ts: frontend-engineer, data-analyst, ...). A separate
-- roles table would duplicate a catalogue the application already owns, so the
-- slug is stored directly and validated against that catalogue by the server.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  relevance_score int NOT NULL DEFAULT 50,
  CONSTRAINT course_roles_relevance_check CHECK (relevance_score BETWEEN 1 AND 100),
  CONSTRAINT course_roles_course_role_key UNIQUE (course_id, role_slug)
);

CREATE INDEX IF NOT EXISTS idx_course_roles_course_id ON public.course_roles(course_id);
CREATE INDEX IF NOT EXISTS idx_course_roles_role_slug ON public.course_roles(role_slug);

-- ---------------------------------------------------------------------------
-- user_learning_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'saved',
  progress_percent int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  notes text,
  recommendation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_learning_items_status_check CHECK (
    status IN ('saved', 'in_progress', 'completed', 'dismissed')
  ),
  CONSTRAINT user_learning_items_progress_check CHECK (
    progress_percent BETWEEN 0 AND 100
  ),
  CONSTRAINT user_learning_items_profile_course_key UNIQUE (profile_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_learning_items_profile ON public.user_learning_items(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_learning_items_status ON public.user_learning_items(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_user_learning_items_course ON public.user_learning_items(course_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_learning_items ENABLE ROW LEVEL SECURITY;

-- The catalogue is public reference data. It is read-only for every client;
-- there is deliberately no INSERT/UPDATE/DELETE policy, so only the
-- service-role client (which bypasses RLS) can change it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='courses' AND policyname='courses_select_catalog') THEN
    CREATE POLICY courses_select_catalog ON public.courses FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_skills' AND policyname='course_skills_select_catalog') THEN
    CREATE POLICY course_skills_select_catalog ON public.course_skills FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_roles' AND policyname='course_roles_select_catalog') THEN
    CREATE POLICY course_roles_select_catalog ON public.course_roles FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- The user's own learning state. Every operation is scoped to auth.uid();
  -- a client cannot read or mutate another user's row, and cannot forge a
  -- profile_id because the server always writes the verified auth user id.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_learning_items' AND policyname='user_learning_items_select_own') THEN
    CREATE POLICY user_learning_items_select_own ON public.user_learning_items FOR SELECT TO authenticated USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_learning_items' AND policyname='user_learning_items_insert_own') THEN
    CREATE POLICY user_learning_items_insert_own ON public.user_learning_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_learning_items' AND policyname='user_learning_items_update_own') THEN
    CREATE POLICY user_learning_items_update_own ON public.user_learning_items FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_learning_items' AND policyname='user_learning_items_delete_own') THEN
    CREATE POLICY user_learning_items_delete_own ON public.user_learning_items FOR DELETE TO authenticated USING (auth.uid() = profile_id);
  END IF;
END $$;
