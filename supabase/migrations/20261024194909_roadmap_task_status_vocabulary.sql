-- Phase B.6 - Roadmap task status vocabulary
--
-- The API accepts five task states (not_started, in_progress, completed,
-- skipped, blocked) and the frontend renders all five, but the original
-- database constraint only allowed three. Writing 'skipped' or 'blocked'
-- therefore passed application validation and then failed the Postgres CHECK,
-- surfacing as a 500 on PATCH /api/roadmap/tasks/:taskId.
--
-- This migration widens the constraint to the vocabulary the application
-- actually uses. It does not change any existing row.
--
-- Idempotent: every statement can be re-applied. No table is dropped, no row
-- is deleted and no existing table is modified beyond the constraint itself.

ALTER TABLE public.roadmap_tasks DROP CONSTRAINT IF EXISTS roadmap_tasks_status_check;

ALTER TABLE public.roadmap_tasks
  ADD CONSTRAINT roadmap_tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped', 'blocked'));

-- ---------------------------------------------------------------------------
-- 1. Learning catalogue category vocabulary
-- ---------------------------------------------------------------------------
-- The learning catalogue is multi-domain now. `courses.category` was free
-- text already, so no schema change is required for storage, but the
-- distribution of categories is what the Learning Center filters on. This
-- statement is a no-op placeholder kept so the category vocabulary is
-- documented next to the data that uses it.

COMMENT ON COLUMN public.courses.category IS
  'Catalogue category (e.g. Programming, Data, Finance, People, Marketing, Healthcare). Unconstrained free text so new career domains can be added without a migration.';
