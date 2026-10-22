# Final Supabase Baseline Report

Date: 2026-10-23  
Repository: `D:\careerpilot-ai`  
Branch: `audit/before-supabase-migration`  
Base commit: `6e20404`

## Outcome

A schema-only, idempotent baseline migration now exists for a fresh Supabase project:

`supabase/migrations/20251019000000_fresh_project_baseline.sql`

The migration was validated from zero against a disposable PostgreSQL 17.10 cluster with Supabase-compatible `auth` and `storage` stubs. It was **not applied to the production project**. No production schema was modified and no existing production row was altered. One temporary auth user was created and deleted solely for the live trigger probe.

## What the baseline adds

The baseline reconstructs the prerequisites that the historical migrations assumed already existed:

- `profiles`
- `skills`
- `experiences`
- `educations`
- `user_skills`
- `user_preferences`
- foreign keys, unique constraints and indexes
- `updated_at` triggers
- RLS enablement, policies and grants
- the `auth.users -> public.profiles` / `public.user_preferences` trigger

The timestamp `20251019000000` deliberately sorts before `202510200001_domain_schema.sql`. Historical migrations were not rewritten.

The migration is schema-only. It inserts no user, profile, CV, course or other application data.

## Validation evidence

A full clean-database run applied all 12 checked-in migrations in order:

| Check | Result |
| --- | --- |
| Migrations applied from zero | 12/12 |
| Public tables | 33 |
| Live/fresh table-name parity | 33/33, 0 missing, 0 extra |
| Column-name parity | 0 mismatches |
| Nullability parity | 0 mismatches |
| PostgreSQL type parity | 0 mismatches |
| Default-value parity | 0 mismatches |
| Public RLS policies | 118 |
| RLS enabled | 33/33 public tables |
| Baseline applied twice | Passed |
| Baseline re-applied after the full series | Passed |

Parity was compared against the live generated PostgREST OpenAPI document and the generated live TypeScript types.

### Auth trigger

A real `auth.users` insert produced exactly:

- one `public.profiles` row
- one `public.user_preferences` row

Observed defaults:

- profile: `full_name`, `username`, `avatar_url` null; `onboarding_completed = false`; `is_public = false`
- preferences: `theme = system`; `language = en`; `notifications_enabled = true`

The temporary live probe user was deleted afterwards.

### RLS and storage behavior

The local validation exercised:

- a user sees their own profile plus a public profile
- a user cannot update another user's profile
- an anonymous caller sees only public profiles
- a user cannot write to the global `skills` catalogue
- a user can insert their own experience
- a user cannot insert another user's experience
- a user can insert a CV object under their own storage folder
- a user cannot insert an object under another user's folder

All probes behaved as expected.

## Limitation

A full live DDL dump was not possible because the environment has:

- no Docker
- no Supabase personal access token
- no production database password

The limitation was mitigated with:

- the live generated types and PostgREST OpenAPI schema
- live auth-trigger behavior probes
- a disposable PostgreSQL 17 cluster running the complete migration chain
- direct RLS and storage policy probes

This is sufficient to validate migration reachability, schema shape and policy behavior, but it is not a byte-for-byte live `pg_dump` comparison.

## Deployment note

The baseline is safe to re-run on the existing project because every object is guarded or uses `IF NOT EXISTS` / `CREATE OR REPLACE`, and it was explicitly tested twice and again after the full migration series.

It still must be applied through the normal controlled migration process for the target environment. Do not apply it to production without a backup and the normal release approval.

## Status

**Complete for local/fresh-project reproducibility.**  
**Not applied to production.**  
The remaining production step is to run the reviewed migration in the target environment and verify the 33-table/RLS/trigger checks there.
