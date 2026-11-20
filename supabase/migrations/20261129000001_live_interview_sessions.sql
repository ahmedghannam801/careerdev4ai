-- The live voice interview: transcripts only.
-- ===========================================================================
-- A live interview is a spoken conversation with the Gemini Live API. The
-- candidate's voice goes from the browser straight to Google; the platform
-- keeps the WORDS and nothing else.
--
-- There is deliberately no audio column in this table, and no object in any
-- bucket for it. The chosen data-storage policy for the product is
-- `transcript`, and this table is that policy written into the schema.
--
-- The table is additive: it creates a new table and its policies, it does
-- not change any existing table, and it touches no existing row.

-- 1. The table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The owner. It is always the verified auth user, never a client value.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'hr' | 'technical' | 'role' | 'behavioral' | 'mixed'
  interview_type text NOT NULL DEFAULT 'mixed',
  -- 'en' | 'ar' | 'ar-eg'
  language text NOT NULL DEFAULT 'en',
  -- The role the interview was about, when there was one.
  target_role text,
  -- The posting the interview was about, when there was one.
  job_id text,
  -- 'completed' | 'ended'
  status text NOT NULL DEFAULT 'completed',
  -- The conversation, in words: [{ speaker, text, at }]
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The report written from the transcript.
  evaluation jsonb,
  -- How long the conversation lasted, in seconds.
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

COMMENT ON TABLE public.live_interview_sessions IS
  'Live voice interview transcripts. No audio is stored: the audio goes from the browser to Gemini Live and is not kept here.';
COMMENT ON COLUMN public.live_interview_sessions.transcript IS
  'The spoken conversation as text. The platform stores the transcript only.';
COMMENT ON COLUMN public.live_interview_sessions.evaluation IS
  'The post-interview report: scores, strengths, improvements, suggested answers and a training plan.';

-- 2. The index the candidate's own history is read with.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_live_interview_sessions_profile_created
  ON public.live_interview_sessions(profile_id, created_at DESC);

-- 3. Row level security.
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_interview_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_interview_sessions'
      AND policyname = 'live_interview_sessions_select_own'
  ) THEN
    -- A transcript is readable only by the candidate it belongs to. The
    -- policy is on the row's own owner, so one candidate's interview can
    -- never be read by another.
    CREATE POLICY live_interview_sessions_select_own
      ON public.live_interview_sessions
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_interview_sessions'
      AND policyname = 'live_interview_sessions_insert_own'
  ) THEN
    -- The row's owner is the authenticated user. A client cannot write a
    -- transcript into somebody else's history.
    CREATE POLICY live_interview_sessions_insert_own
      ON public.live_interview_sessions
      FOR INSERT
      WITH CHECK (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_interview_sessions'
      AND policyname = 'live_interview_sessions_update_own'
  ) THEN
    CREATE POLICY live_interview_sessions_update_own
      ON public.live_interview_sessions
      FOR UPDATE
      USING (profile_id = auth.uid())
      WITH CHECK (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_interview_sessions'
      AND policyname = 'live_interview_sessions_delete_own'
  ) THEN
    CREATE POLICY live_interview_sessions_delete_own
      ON public.live_interview_sessions
      FOR DELETE
      USING (profile_id = auth.uid());
  END IF;
END $$;
