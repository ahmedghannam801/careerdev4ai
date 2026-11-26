-- Conversation memory for the AI features.
-- ===========================================================================
-- Until now the Copilot forgot the candidate between messages: the browser
-- kept a transcript for display, and the model was sent one message at a time.
-- A follow-up like "and how do I close that gap?" arrived with nothing to
-- refer back to.
--
-- The memory is stored server-side, owned by the verified profile, and read
-- back only for that profile. It is deliberately small and bounded:
--
--   * ai_conversations holds one row per thread, plus the rolling summary of
--     the turns that have aged out of the verbatim window;
--   * ai_messages holds the words, in order, with a role per turn;
--   * the summary is written by the server, never by the client.
--
-- Additive only: two new tables, their indexes and their policies. No existing
-- table, column or row is touched.

-- 1. The threads.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The owner. Always the verified auth user, never a value from a request.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'copilot' today; the column exists so another feature can reuse the thread.
  feature text NOT NULL DEFAULT 'copilot',
  -- A short title, derived from the first question so the list is readable.
  title text,
  -- The compressed history of the turns that are no longer sent verbatim.
  summary text,
  -- How many messages the summary already covers, so it is only rewritten when
  -- the window moves.
  summarized_count integer NOT NULL DEFAULT 0,
  -- The response language of the thread, so a resumed thread keeps its language.
  language text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_conversations IS
  'AI conversation threads. One row per thread; the rolling summary of old turns lives here.';
COMMENT ON COLUMN public.ai_conversations.summary IS
  'A server-written compression of the turns that are no longer sent verbatim. Never written by the client.';

-- 2. The words.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  -- Denormalised owner, so a policy can check it without a join.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'user' | 'assistant'
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_messages IS
  'The turns of an AI conversation, in order. Read back for the candidate''s own thread only.';

-- 3. The indexes the thread is read with.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_conversations_profile_last
  ON public.ai_conversations(profile_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages(conversation_id, created_at ASC);

-- 4. Row level security.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_select_own'
  ) THEN
    -- A thread is readable only by the candidate it belongs to.
    CREATE POLICY ai_conversations_select_own
      ON public.ai_conversations
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_insert_own'
  ) THEN
    CREATE POLICY ai_conversations_insert_own
      ON public.ai_conversations
      FOR INSERT
      WITH CHECK (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_update_own'
  ) THEN
    CREATE POLICY ai_conversations_update_own
      ON public.ai_conversations
      FOR UPDATE
      USING (profile_id = auth.uid())
      WITH CHECK (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_delete_own'
  ) THEN
    CREATE POLICY ai_conversations_delete_own
      ON public.ai_conversations
      FOR DELETE
      USING (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_select_own'
  ) THEN
    CREATE POLICY ai_messages_select_own
      ON public.ai_messages
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_insert_own'
  ) THEN
    CREATE POLICY ai_messages_insert_own
      ON public.ai_messages
      FOR INSERT
      WITH CHECK (profile_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_delete_own'
  ) THEN
    CREATE POLICY ai_messages_delete_own
      ON public.ai_messages
      FOR DELETE
      USING (profile_id = auth.uid());
  END IF;
END $$;
