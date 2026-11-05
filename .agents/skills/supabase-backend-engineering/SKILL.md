---
name: supabase-backend-engineering
description: Governs PostgreSQL schema design, Supabase Auth, Row Level Security (RLS), migrations, and safe database operations for CareerDev4AI.
---

# Supabase Backend Engineering Skill

This skill governs database architecture, schema migrations, Row Level Security (RLS) policies, authentication, storage security, and query performance in Supabase PostgreSQL for CareerDev4AI.

## When to Use

Activate this skill when:
- Designing or modifying database tables, views, indexes, or functions.
- Writing SQL migrations in `supabase/migrations/`.
- Creating, verifying, or hardening Row Level Security (RLS) policies.
- Implementing Supabase Auth flows, session management, or user profiles.
- Querying data via Supabase JS client (`@supabase/supabase-js`) or server database modules (`server/db/`).
- Ensuring database operations are strictly backward-compatible.

## Core Database Rules for CareerDev4AI

1. **Non-Negotiable Safety Directives**:
   - **NEVER drop production tables or databases**.
   - **NEVER delete production records or truncate data**.
   - **NEVER disable Row Level Security (RLS)** on any table.
   - **NEVER commit or expose the `service_role` secret** in client-facing code.

2. **Row Level Security (RLS) Standard**:
   - Every single table MUST have `ENABLE ROW LEVEL SECURITY`.
   - Users can only read, insert, update, or delete records where `user_id = auth.uid()`:
     ```sql
     ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

     CREATE POLICY "Users can manage their own profile"
     ON public.user_profiles
     FOR ALL
     TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
     ```
   - Public read-only tables (such as verified learning resources or role benchmarks) must have explicit `FOR SELECT TO authenticated, anon USING (true)` policies.

3. **Migration Discipline**:
   - All schema changes must be written as forward-only SQL migration files in `supabase/migrations/YYYYMMDDHHMMSS_name.sql`.
   - Use `IF NOT EXISTS` when creating tables or columns to ensure idempotency.
   - Add appropriate indexes for foreign keys and query filter columns (e.g. `user_id`, `created_at`, `status`).

4. **Server vs Client Client Separation**:
   - Client-side code (`src/`): Must only use the public Supabase anonymous key (`VITE_SUPABASE_ANON_KEY`).
   - Server-side code (`server/` / `worker/`): Uses service client only when executing authorized system operations (e.g. background job processing) and must never forward raw service responses to unauthorized callers.

## Step-by-Step Workflow

1. **Plan Schema Changes**:
   - Determine tables, relationships, constraints, and data types (prefer UUIDs, JSONB for extensible metadata, and `timestamptz`).
2. **Draft Migration File**:
   - Create SQL file in `supabase/migrations/`. Include table definition, RLS enablement, policies, and indexes.
3. **Write Automated RLS Tests**:
   - Assert that authenticated user A cannot access user B's records.
   - Assert that anonymous users cannot write to protected tables.
4. **Deploy & Verify**:
   - Apply migration and verify table structure and policies in Supabase dashboard or via API.

## Quality Checklist

- [ ] Is RLS enabled on all newly created tables?
- [ ] Do policies restrict mutations strictly to `auth.uid() = user_id`?
- [ ] Are migration files idempotent (`CREATE TABLE IF NOT EXISTS`)?
- [ ] Are foreign key indexes added for performant joins?
- [ ] Is the `service_role` key strictly absent from any client bundle?

## Common Failure Patterns to Avoid

- **Missing RLS**: Creating a table without `ENABLE ROW LEVEL SECURITY`, leaving data publicly readable and writable.
- **Overly Permissive Policies**: Writing `USING (true)` on insert or update policies for user data.
- **Breaking Schema Migrations**: Renaming or dropping columns in use by running production workers.
