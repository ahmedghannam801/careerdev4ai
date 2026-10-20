-- Phase B.3.9 — Notifications persistence
--
-- The notifications drawer showed two HARD-CODED entries ("Round 2 Technical
-- Interview with Vanguard Systems", "Roadmap Task Due Soon") that lived only
-- in React state. The user's read/unread state was lost on every reload, and
-- the drawer showed fabricated content to real users.
--
-- This migration adds the table that makes notifications real:
--
--   public.notifications
--     id          uuid  PK
--     profile_id  uuid  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
--     title       text  NOT NULL
--     message     text
--     type        text  NOT NULL  (interview | roadmap | application | achievement | system)
--     read_at     timestamptz  (NULL = unread)
--     link_view   text
--     created_at  timestamptz NOT NULL DEFAULT now()
--
-- Ownership model: auth.users.id -> public.profiles.id -> notifications.profile_id
-- (the same model as every other domain table).
--
-- The statement is idempotent: it can be applied to a database that already
-- has the table without changing anything. No existing table is modified and
-- no row is deleted.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'system',
  read_at timestamptz,
  link_view text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type IN (
    'interview', 'roadmap', 'application', 'achievement', 'system'
  ))
);

-- Indexes for the two access patterns: the user's notification list (newest
-- first) and the unread count.
CREATE INDEX IF NOT EXISTS idx_notifications_profile_created
  ON public.notifications(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_unread
  ON public.notifications(profile_id) WHERE read_at IS NULL;

-- Row Level Security: the owner sees only their own notifications, and may
-- insert, update and delete only their own. The policy expressions match the
-- ownership model used by every other domain table.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select_own') THEN
    CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_insert_own') THEN
    CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_own') THEN
    CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_delete_own') THEN
    CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;
