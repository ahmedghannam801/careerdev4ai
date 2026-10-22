-- Fresh-project baseline for the auth-linked tables.
--
-- WHY THIS FILE HAS AN EARLIER TIMESTAMP
-- --------------------------------------
-- The original migration series starts at 202510200001 and assumes that
-- `public.profiles`, `public.skills`, `public.experiences`,
-- `public.educations`, `public.user_skills`, `public.user_preferences`, and
-- the `auth.users -> public.profiles` trigger already exist. They did exist in
-- the original hosted project, so the series worked there, but a brand-new
-- Supabase project failed on the very first statement:
--
--   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ...
--
-- This file therefore sorts BEFORE 202510200001 and creates the missing
-- prerequisites. Historical migrations are not edited or reordered; this is an
-- additive baseline that a fresh database needs and an existing database
-- already satisfies.
--
-- The definitions were reconstructed from the live generated TypeScript types,
-- the live PostgREST schema, the application's database modules, and a live
-- trigger probe. They are schema-only: no user rows and no production data are
-- copied here. The later migrations remain the source of truth for the domain
-- tables and for the learning catalogue.

-- ---------------------------------------------------------------------------
-- 1. Profiles (one row per auth user; id IS auth.users.id)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  username text,
  avatar_url text,
  phone text,
  bio text,
  user_type text,
  career_goal text,
  target_role text,
  target_industry text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  current_title text,
  current_position text,
  current_company text,
  headline text,
  professional_summary text,
  location text,
  timezone text,
  preferred_name text,
  custom_goal_text text,
  years_of_experience text,
  is_public boolean NOT NULL DEFAULT false,
  country text,
  city text
);

-- Additive guard: a project that already has the table but is missing a
-- column gets the column without a table rewrite or data loss.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS career_goal text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_industry text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
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
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;

-- Username uniqueness is relied on by /api/profile/check-username and by the
-- username save path. The live database exposes this as profiles_username_key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- The live vocabulary plus the legacy values, exactly as migration
-- 202510200008 establishes. It is repeated here so a fresh database is valid
-- even before that later migration runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_type_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_type_check
      CHECK (
        user_type IS NULL OR user_type IN (
          'student',
          'fresh_graduate',
          'working_professional',
          'career_switcher',
          'exploring',
          'graduate',
          'working',
          'career_shift'
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Global skills catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Skills are resolved by exact name. The application tolerates a concurrent
-- insert by re-reading after a conflict, which only works when name is unique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_name_key'
      AND conrelid = 'public.skills'::regclass
  ) THEN
    ALTER TABLE public.skills
      ADD CONSTRAINT skills_name_key UNIQUE (name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(category);

-- ---------------------------------------------------------------------------
-- 3. Experiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company text NOT NULL,
  job_title text NOT NULL,
  employment_type text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  location text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS employment_type text;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_experiences_user_id ON public.experiences(user_id);

-- ---------------------------------------------------------------------------
-- 4. Educations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.educations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution text NOT NULL,
  degree text,
  field_of_study text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS institution text;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS degree text;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS field_of_study text;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.educations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_educations_user_id ON public.educations(user_id);

-- ---------------------------------------------------------------------------
-- 5. User skills (the join between a profile and the global catalogue)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency int,
  years_experience numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_skills_user_id_skill_id_key UNIQUE (user_id, skill_id),
  CONSTRAINT user_skills_proficiency_check
    CHECK (proficiency IS NULL OR (proficiency BETWEEN 1 AND 5))
);

ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS proficiency int;
ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS years_experience numeric;
ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_skills ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON public.user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON public.user_skills(skill_id);

-- ---------------------------------------------------------------------------
-- 6. Per-account preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system',
  language text NOT NULL DEFAULT 'en',
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_theme_check
    CHECK (theme IN ('light', 'dark', 'system')),
  CONSTRAINT user_preferences_language_check
    CHECK (language IN ('en', 'ar'))
);

ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 7. updated_at handling
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'profiles_set_updated_at'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER profiles_set_updated_at
             BEFORE UPDATE ON public.profiles
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'experiences_set_updated_at'
      AND tgrelid = 'public.experiences'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER experiences_set_updated_at
             BEFORE UPDATE ON public.experiences
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'educations_set_updated_at'
      AND tgrelid = 'public.educations'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER educations_set_updated_at
             BEFORE UPDATE ON public.educations
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_skills_set_updated_at'
      AND tgrelid = 'public.user_skills'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER user_skills_set_updated_at
             BEFORE UPDATE ON public.user_skills
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_preferences_set_updated_at'
      AND tgrelid = 'public.user_preferences'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER user_preferences_set_updated_at
             BEFORE UPDATE ON public.user_preferences
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_set_updated_at()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Auth trigger: every new auth user gets a profile and preferences row
-- ---------------------------------------------------------------------------
-- Verified against the live project: creating an auth user produces exactly
-- one profiles row (defaults: onboarding_completed=false, is_public=false) and
-- one user_preferences row (theme=system, language=en, notifications=true).
-- The function is named distinctly so applying this migration to an existing
-- project cannot overwrite a differently implemented live trigger.

CREATE OR REPLACE FUNCTION public.careerpilot_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created
             AFTER INSERT ON auth.users
             FOR EACH ROW EXECUTE FUNCTION public.careerpilot_handle_new_user()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------------
-- The server uses the service-role key after verifying the caller's JWT, so
-- these policies are defence-in-depth for any direct PostgREST access. They do
-- not replace the ownership checks in the API.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- profiles: read your own row, read public profiles, write only your own row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_select_own ON public.profiles
             FOR SELECT TO authenticated USING (auth.uid() = id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_select_public'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_select_public ON public.profiles
             FOR SELECT TO anon, authenticated USING (is_public = true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_insert_own ON public.profiles
             FOR INSERT TO authenticated WITH CHECK (auth.uid() = id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_update_own ON public.profiles
             FOR UPDATE TO authenticated
             USING (auth.uid() = id) WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

-- skills: the catalogue is globally readable by signed-in users and is written
-- only by the server (service role). Migration 202510200007 owns this policy on
-- existing databases and skips it if this baseline created it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'skills'
      AND policyname = 'skills_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY skills_select_authenticated ON public.skills
             FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- experiences / educations / user_skills / user_preferences: owner-only CRUD.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='experiences' AND policyname='experiences_select_own') THEN
    EXECUTE 'CREATE POLICY experiences_select_own ON public.experiences FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='experiences' AND policyname='experiences_insert_own') THEN
    EXECUTE 'CREATE POLICY experiences_insert_own ON public.experiences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='experiences' AND policyname='experiences_update_own') THEN
    EXECUTE 'CREATE POLICY experiences_update_own ON public.experiences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='experiences' AND policyname='experiences_delete_own') THEN
    EXECUTE 'CREATE POLICY experiences_delete_own ON public.experiences FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='educations' AND policyname='educations_select_own') THEN
    EXECUTE 'CREATE POLICY educations_select_own ON public.educations FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='educations' AND policyname='educations_insert_own') THEN
    EXECUTE 'CREATE POLICY educations_insert_own ON public.educations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='educations' AND policyname='educations_update_own') THEN
    EXECUTE 'CREATE POLICY educations_update_own ON public.educations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='educations' AND policyname='educations_delete_own') THEN
    EXECUTE 'CREATE POLICY educations_delete_own ON public.educations FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skills' AND policyname='user_skills_select_own') THEN
    EXECUTE 'CREATE POLICY user_skills_select_own ON public.user_skills FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skills' AND policyname='user_skills_insert_own') THEN
    EXECUTE 'CREATE POLICY user_skills_insert_own ON public.user_skills FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skills' AND policyname='user_skills_update_own') THEN
    EXECUTE 'CREATE POLICY user_skills_update_own ON public.user_skills FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skills' AND policyname='user_skills_delete_own') THEN
    EXECUTE 'CREATE POLICY user_skills_delete_own ON public.user_skills FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_select_own') THEN
    EXECUTE 'CREATE POLICY user_preferences_select_own ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_insert_own') THEN
    EXECUTE 'CREATE POLICY user_preferences_insert_own ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_update_own') THEN
    EXECUTE 'CREATE POLICY user_preferences_update_own ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_delete_own') THEN
    EXECUTE 'CREATE POLICY user_preferences_delete_own ON public.user_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Privileges
-- ---------------------------------------------------------------------------
-- RLS decides which rows are visible; these grants decide which operations are
-- reachable at all. Public profiles need anon SELECT; everything else is
-- authenticated-only. The service role bypasses RLS as before.

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experiences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.educations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.skills TO service_role;
GRANT ALL ON public.experiences TO service_role;
GRANT ALL ON public.educations TO service_role;
GRANT ALL ON public.user_skills TO service_role;
GRANT ALL ON public.user_preferences TO service_role;
