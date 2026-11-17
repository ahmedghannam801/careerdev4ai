-- Giving the evidence table the moment it was recorded.
--
-- Every other table in the schema carries a `created_at`, and this one did
-- not. The date a candidate wrote on an artifact is not the moment the
-- artifact was recorded: it is often a date from the past — the year a
-- certificate was earned, the month a programme started — and it may be
-- empty.
--
-- The administrator's queue is ordered by when the artifact arrived, so that
-- the one that has been waiting longest is the first one to be seen. That
-- needs the recorded moment, and the recorded moment needs a column of its
-- own.
--
-- The column is added with a default of the moment the row was written, so
-- every row has one and no existing row is left without it. The rows already
-- in the table take the moment of this migration, which is the earliest
-- moment the column can honestly claim.

ALTER TABLE public.evidence_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- The queue reads the oldest artifact first.
CREATE INDEX IF NOT EXISTS idx_evidence_items_created_at
  ON public.evidence_items (created_at);
