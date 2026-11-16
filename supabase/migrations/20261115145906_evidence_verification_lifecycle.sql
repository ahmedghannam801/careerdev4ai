-- Evidence review lifecycle. Existing self-asserted `verified=true` records are moved to pending review.

alter table public.evidence_items
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists verification_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evidence_items_verification_status_check'
  ) then
    alter table public.evidence_items
      add constraint evidence_items_verification_status_check
      check (verification_status in ('pending', 'verified', 'rejected'));
  end if;
end $$;

-- `verified` was previously writable by the submitter. Do not silently treat
-- those claims as platform-reviewed evidence after introducing this lifecycle.
update public.evidence_items
set verified = false,
    verification_status = 'pending',
    verified_at = null,
    verified_by = null
where verified = true and verification_status = 'pending';

create index if not exists idx_evidence_items_verification_status
  on public.evidence_items (verification_status, date_added desc);

create or replace function public.prevent_self_evidence_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.verified is distinct from old.verified
    or new.verification_status is distinct from old.verification_status
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by
    or new.verification_note is distinct from old.verification_note
  ) then
    raise exception 'Evidence review fields may only be changed by the server review workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_items_prevent_self_review on public.evidence_items;
create trigger evidence_items_prevent_self_review
before update on public.evidence_items
for each row execute function public.prevent_self_evidence_review();
