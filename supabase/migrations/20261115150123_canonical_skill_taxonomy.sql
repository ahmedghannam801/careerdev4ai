-- Stable skill slugs and aliases; duplicate labels receive a stable UUID suffix.

alter table public.skills
  add column if not exists slug text;

with normalized as (
  select
    id,
    nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), '') as base_slug
  from public.skills
), counted as (
  select
    id,
    base_slug,
    count(*) over (partition by base_slug) as duplicate_count
  from normalized
)
update public.skills as skill
set slug = case
  when counted.base_slug is null then 'skill-' || left(skill.id::text, 8)
  when counted.duplicate_count > 1 then counted.base_slug || '-' || left(skill.id::text, 8)
  else counted.base_slug
end
from counted
where skill.id = counted.id and skill.slug is null;

create unique index if not exists idx_skills_slug_unique
  on public.skills (slug) where slug is not null;

create table if not exists public.skill_aliases (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  constraint skill_aliases_normalized_alias_key unique (normalized_alias)
);

create index if not exists idx_skill_aliases_skill_id
  on public.skill_aliases (skill_id);

alter table public.skill_aliases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'skill_aliases' and policyname = 'skill_aliases_read_all'
  ) then
    create policy skill_aliases_read_all on public.skill_aliases
      for select to authenticated, anon using (true);
  end if;
end $$;

alter table public.user_skills
  add column if not exists verified_level smallint,
  add column if not exists target_level smallint,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists last_updated timestamptz;

update public.user_skills
set last_updated = updated_at
where last_updated is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_skills_verified_level_check') then
    alter table public.user_skills add constraint user_skills_verified_level_check
      check (verified_level is null or verified_level between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_skills_target_level_check') then
    alter table public.user_skills add constraint user_skills_target_level_check
      check (target_level is null or target_level between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_skills_verification_status_check') then
    alter table public.user_skills add constraint user_skills_verification_status_check
      check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
  end if;
end $$;
