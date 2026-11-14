-- Target opportunity type.
--
-- WHY
-- A candidate's profile and their CV summary disagreed about what they were
-- aiming at. The profile said "Land a first full-time role" while the CV
-- summary was written for a "Data Analyst internship", and there was nowhere
-- in the product for the candidate to say which they meant.
--
-- WHAT
-- One additive, nullable column on public.profiles:
--
--   target_opportunity_type  internship | full_time_entry | both
--
-- A NULL value means "not chosen". The identity layer reads it as "both",
-- which never narrows a search and never claims a preference the candidate
-- did not state.
--
-- The professional headline already has a home: `profiles.headline` is the
-- candidate's own line about themselves, kept apart from `current_title`,
-- which is their present job title and is empty for a student. Nothing is
-- added for it here.
--
-- The migration is idempotent (IF NOT EXISTS) so it can be re-run safely on
-- an environment where part of it was applied by hand.

alter table public.profiles
  add column if not exists target_opportunity_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_target_opportunity_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_target_opportunity_type_check
      check (
        target_opportunity_type is null
        or target_opportunity_type in ('internship', 'full_time_entry', 'both')
      );
  end if;
end $$;

comment on column public.profiles.target_opportunity_type is
  'The kind of opening the candidate is aiming at: internship | full_time_entry | both. NULL means not chosen.';
