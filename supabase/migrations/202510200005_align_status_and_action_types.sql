-- Phase B.3.7.1 — Align the roadmap task status and the activity action type
-- with what the application actually uses.
--
-- 1. public.roadmap_tasks.status
--    The CHECK created in 202510200001 allows only 3 values, but the
--    application type and the RoadmapView status picker use 5:
--    not_started | in_progress | completed | skipped | blocked.
--    The constraint is replaced with a superset, so every existing row
--    remains valid and no row is deleted.
--
-- 2. public.activities.action_type
--    'completed_course' is removed: the application has no course-completion
--    event (the learning centre only tracks enrolment), so the value is dead
--    architecture and is cleaned from the schema as well as the types.
--    The replacement CHECK is a superset of the old one minus that value, so
--    every existing row remains valid.

-- 1. Roadmap task status — widen to the statuses the UI offers.
ALTER TABLE public.roadmap_tasks
  DROP CONSTRAINT IF EXISTS roadmap_tasks_status_check;
ALTER TABLE public.roadmap_tasks
  ADD CONSTRAINT roadmap_tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped', 'blocked'));

-- 2. Activity action type — drop the unused 'completed_course'.
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_action_type_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_action_type_check
  CHECK (action_type IN (
    'completed_task', 'added_project', 'uploaded_cv', 'applied_job',
    'mock_interview', 'acquired_skill', 'added_evidence', 'saved_job',
    'goal_updated', 'document_saved'
  ));
