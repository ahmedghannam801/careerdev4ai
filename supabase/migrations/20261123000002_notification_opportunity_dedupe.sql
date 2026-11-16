-- Deduplicating the notifications about newly discovered opportunities.
--
-- A candidate is told about an opportunity once. The rule needs somewhere to
-- live that the database can enforce, because two runs of the pipeline can
-- overlap and a candidate must not receive the same notice twice.
--
-- The opportunity is therefore recorded in a column of its own rather than
-- inside the notification's parameters. A column can be indexed and
-- constrained; a value buried in a jsonb object can only be searched for, and
-- a search that misses would put the same notice in a real inbox twice.
--
-- The index is unique but not partial. A row whose opportunity is null is
-- exempt from it anyway, because a unique index treats nulls as distinct —
-- so the announcements, the receipts and everything else that shares the
-- table are left alone, and the index can still be named as the target of an
-- upsert that must not duplicate a notice.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS opportunity_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_opportunity_once
  ON public.notifications(profile_id, opportunity_id);
