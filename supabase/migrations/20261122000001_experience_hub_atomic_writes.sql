-- Migration: 20261122000001_experience_hub_atomic_writes.sql
-- Description: Makes the Career Experience Hub's multi-row writes atomic.
--
-- WHY
-- The server wrote `user_experience_progress` and
-- `user_experience_certificates` in separate statements:
--
--   * clearing a completion rewrote the progress row and then deleted the
--     certificate it supported;
--   * removing the progress deleted the certificate and then the progress;
--   * submitting a certificate checked the completion, checked the existing
--     certificate and then wrote it.
--
-- A failure between two of those statements changed the candidate's record
-- half-way while the API returned an error: a certificate could disappear from
-- an experience that still read as completed, or progress could remain after
-- the certificate that justified it was already gone.
--
-- WHAT
-- Three narrowly scoped functions put each operation in one transaction. They
-- take the owner explicitly, because the server passes the authenticated user
-- id it has already verified; the browser never calls them. The tables,
-- constraints, indexes and RLS policies are untouched, so every ownership and
-- foreign-key rule still applies.
--
-- ORDERING
-- The progress row is always locked before the certificate row, in both the
-- write and the certificate function, so two concurrent requests wait for one
-- another instead of deadlocking.
--
-- Idempotent: the functions can be replaced safely. No table is created,
-- dropped, truncated or rewritten.

-- ---------------------------------------------------------------------------
-- 1. Write the progress row, and clear the certificate it no longer supports
-- ---------------------------------------------------------------------------

create or replace function public.career_experience_progress_set(
  p_profile_id uuid,
  p_experience_id text,
  p_status text,
  p_saved boolean
) returns public.user_experience_progress
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.user_experience_progress;
  v_now timestamptz := now();
begin
  insert into public.user_experience_progress as progress (
    profile_id,
    experience_id,
    status,
    saved,
    started_at,
    completed_at,
    updated_at
  ) values (
    p_profile_id,
    p_experience_id,
    p_status,
    coalesce(p_saved, true),
    -- A start time is written when the row first becomes in-progress.
    case when p_status = 'not_started' then null else v_now end,
    -- A completion time is written when the row first becomes completed.
    case when p_status = 'completed' then v_now else null end,
    v_now
  )
  on conflict on constraint user_experience_progress_profile_experience_key
  do update set
    status = excluded.status,
    -- A caller that does not mention `saved` keeps the stored value.
    saved = case when p_saved is null then progress.saved else excluded.saved end,
    started_at = case
      when excluded.status = 'not_started' then null
      else coalesce(progress.started_at, v_now)
    end,
    -- The first completion time is kept; leaving `completed` clears it.
    completed_at = case
      when excluded.status = 'completed' then coalesce(progress.completed_at, v_now)
      else null
    end,
    updated_at = v_now
  returning * into v_row;

  -- A certificate is evidence of a completion. When that completion is taken
  -- back, the certificate it supported goes with it rather than lingering as a
  -- claim the candidate no longer makes. Same transaction, so neither half can
  -- survive alone.
  if p_status <> 'completed' then
    delete from public.user_experience_certificates as certificate
     where certificate.profile_id = p_profile_id
       and certificate.experience_id = p_experience_id;
  end if;

  return v_row;
end;
$$;

comment on function public.career_experience_progress_set(uuid, text, text, boolean) is
  'Writes one candidate''s Experience Hub progress row and clears the certificate a taken-back completion no longer supports, atomically. Service role only.';

-- ---------------------------------------------------------------------------
-- 2. Remove the progress and the certificate together
-- ---------------------------------------------------------------------------

create or replace function public.career_experience_progress_delete(
  p_profile_id uuid,
  p_experience_id text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.user_experience_certificates as certificate
   where certificate.profile_id = p_profile_id
     and certificate.experience_id = p_experience_id;

  delete from public.user_experience_progress as progress
   where progress.profile_id = p_profile_id
     and progress.experience_id = p_experience_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

comment on function public.career_experience_progress_delete(uuid, text) is
  'Removes one candidate''s Experience Hub progress row and its certificate together, atomically. Returns true when a progress row existed. Service role only.';

-- ---------------------------------------------------------------------------
-- 3. Submit or edit a certificate against a completion, atomically
-- ---------------------------------------------------------------------------

create or replace function public.career_experience_certificate_set(
  p_profile_id uuid,
  p_experience_id text,
  p_certificate_url text
) returns public.user_experience_certificates
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_existing public.user_experience_certificates;
  v_row public.user_experience_certificates;
  v_now timestamptz := now();
begin
  -- Lock the completion row first: a concurrent status change and this
  -- submission are then serialised instead of racing.
  select progress.status into v_status
    from public.user_experience_progress as progress
   where progress.profile_id = p_profile_id
     and progress.experience_id = p_experience_id
   for update;

  if v_status is distinct from 'completed' then
    raise exception using
      errcode = 'P0001',
      message = 'certificate_requires_completion';
  end if;

  select * into v_existing
    from public.user_experience_certificates as certificate
   where certificate.profile_id = p_profile_id
     and certificate.experience_id = p_experience_id
   for update;

  -- A credential a trusted review has already examined is never replaced by
  -- the candidate's own link.
  if found and v_existing.verification_status <> 'self_reported' then
    return v_existing;
  end if;

  insert into public.user_experience_certificates as certificate (
    profile_id,
    experience_id,
    certificate_url,
    verification_status,
    verified_at,
    updated_at
  ) values (
    p_profile_id,
    p_experience_id,
    p_certificate_url,
    'self_reported',
    null,
    v_now
  )
  on conflict on constraint user_experience_certificates_profile_experience_key
  do update set
    certificate_url = excluded.certificate_url,
    verification_status = 'self_reported',
    verified_at = null,
    updated_at = v_now
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.career_experience_certificate_set(uuid, text, text) is
  'Submits or edits a candidate''s self-reported Experience Hub certificate for a completed simulation, atomically. A reviewed certificate is returned unchanged. Service role only.';

-- ---------------------------------------------------------------------------
-- 4. Execution is server-only
--
-- The browser writes through the authenticated API; it never calls these
-- functions. Removing the default PUBLIC grant keeps a direct PostgREST call
-- from reaching a candidate's rows at all.
-- ---------------------------------------------------------------------------

revoke all on function public.career_experience_progress_set(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.career_experience_progress_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.career_experience_certificate_set(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.career_experience_progress_set(uuid, text, text, boolean)
  to service_role;
grant execute on function public.career_experience_progress_delete(uuid, text)
  to service_role;
grant execute on function public.career_experience_certificate_set(uuid, text, text)
  to service_role;

-- Make the new functions visible to PostgREST in the same transaction.
notify pgrst, 'reload schema';
