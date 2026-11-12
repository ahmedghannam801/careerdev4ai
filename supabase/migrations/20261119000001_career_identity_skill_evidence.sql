-- Career identity and skill evidence.
--
-- WHY
-- The platform could not tell a claim from a measurement, and it could not
-- remember a candidate's education state independently of a free-text date.
--
--   * user_skills held one proficiency number. A diagnostic knowledge check
--     could score a skill but had nowhere to persist the result, so the UI
--     asked the user to press "sync" and the profile, readiness and roadmap
--     could disagree until they did.
--   * profiles had no place to record that a candidate is still studying, so a
--     future graduation year could be read as "graduated".
--
-- WHAT
-- The columns are additive and nullable. Existing rows keep working: an
-- assessment that never ran stays NULL, and an education state that was never
-- stated stays NULL rather than being guessed.
--
-- The migration is idempotent (IF NOT EXISTS) so it can be re-run safely on an
-- environment where part of it was applied by hand.

alter table public.profiles
  add column if not exists education_status text,
  add column if not exists expected_graduation_year integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_education_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_education_status_check
      check (
        education_status is null
        or education_status in ('currently_studying', 'graduated', 'not_set')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_expected_graduation_year_check'
  ) then
    alter table public.profiles
      add constraint profiles_expected_graduation_year_check
      check (
        expected_graduation_year is null
        or (expected_graduation_year between 1900 and 2200)
      );
  end if;
end $$;

alter table public.user_skills
  add column if not exists assessed_level smallint,
  add column if not exists assessment_score smallint,
  add column if not exists assessment_at timestamptz,
  add column if not exists evidence_sources jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_skills_assessed_level_check'
  ) then
    alter table public.user_skills
      add constraint user_skills_assessed_level_check
      check (assessed_level is null or assessed_level between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skills_assessment_score_check'
  ) then
    alter table public.user_skills
      add constraint user_skills_assessment_score_check
      check (assessment_score is null or assessment_score between 0 and 100);
  end if;
end $$;

-- The evidence sources are a JSON array of short strings. Keeping the default
-- as an empty array (rather than NULL) means the client never has to branch on
-- the difference between "no evidence" and "column was just added".
comment on column public.user_skills.evidence_sources is
  'Evidence backing this skill: self_reported, diagnostic_assessment, course_completed, verified_project, certificate, work_experience.';
comment on column public.user_skills.assessed_level is
  'The level a diagnostic knowledge check measured (1-5), independent of the self-reported proficiency.';
comment on column public.profiles.education_status is
  'currently_studying | graduated | not_set. A future expected graduation year always means currently_studying.';
