-- The roadmap's additive time breakdown.
--
-- The deployed project has this column and the application writes it
-- (`server/db/roadmap.ts` reads and writes `work_kind`), but no migration in
-- this folder creates it: the change reached the deployed project outside the
-- folder. A database rebuilt from this folder alone therefore produced a
-- roadmap table the application could not write to.
--
-- This adds the column with the same type, nullability and meaning the
-- deployed project uses. It is additive: no existing row is changed, and no
-- existing row is read while it is being added.
--
-- The kinds are: learning, practice, project, application. They are written by
-- the roadmap generator, so no check constraint is imposed here — the same
-- freedom the deployed project gives.

alter table public.roadmap_tasks
  add column if not exists work_kind text;

comment on column public.roadmap_tasks.work_kind is
  'The kind of work this step is: learning, practice, project or application. Used for the additive time breakdown.';
