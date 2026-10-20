# B.3.4 — Schema Implementation Report

Phase: B.3.4 — DATABASE SCHEMA IMPLEMENTATION ONLY.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Status: **COMPLETE — applied and independently verified.**

---

## 1. Exact migration filename

`supabase/migrations/202510200001_domain_schema.sql` (374 lines) — the only active migration.

## 2. Pre-migration DB state (verified by direct SQL)

| Item | Value |
|---|---|
| `public` tables | 6 — `educations`, `experiences`, `profiles`, `skills`, `user_preferences`, `user_skills` |
| `profiles` columns | 13 (`id`, `full_name`, `username`, `avatar_url`, `phone`, `bio`, `user_type`, `career_goal`, `target_role`, `target_industry`, `onboarding_completed`, `created_at`, `updated_at`) |
| `profiles` FK | `profiles_id_fkey` → `auth.users(id) ON DELETE CASCADE` |
| Existing FKs | 5, all `ON DELETE CASCADE` (`educations.user_id`, `experiences.user_id`, `user_preferences.user_id`, `user_skills.user_id` → `profiles`; `user_skills.skill_id` → `skills`) |
| RLS | enabled on all 6; 19 policies; owner expressions `auth.uid() = user_id` / `auth.uid() = id` |
| Indexes | 14 across the 6 tables |
| `supabase_migrations.schema_migrations` | **empty** (the earlier `202510190001` had rolled back entirely) |
| Row counts | 0 in every table, including `auth.users` |

## 3. Archived migration files

Moved (not deleted, not modified) to `supabase/migrations/archive/`:

| File | Lines | Reason |
|---|---|---|
| `202510190001_initial_careerpilot_schema.sql` | 150 | Rolled back remotely (policy statement failed); encodes a design that contradicts the live schema (`profiles.auth_uid`, `skills.profile_id`) — must never be applied |
| `202510190004_fix_rls_profiles_id.sql` | 8 | Superseded by the new migration; never applied remotely |

The active directory now contains only `202510200001_domain_schema.sql`. `supabase migration repair` was **not** used, and neither file was marked as applied.

## 4. Tables created (17)

`roadmaps`, `roadmap_phases`, `roadmap_milestones`, `roadmap_tasks`, `projects`, `project_skills`, `evidence_items`, `evidence_skills`, `cvs`, `cv_versions`, `saved_roles`, `job_applications`, `interview_sessions`, `profile_certifications`, `profile_languages`, `profile_links`, `profile_career_identity`.

**Verified: 23 public tables total** (6 pre-existing + 17 new).

Ownership column on every table: `profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE` — except `cv_versions`, which is a child of `cvs`. `roadmap_tasks.evidence_id` and `roadmap_tasks.skill_id` are nullable FKs to `evidence_items`/`skills` with `ON DELETE SET NULL`.

## 5. Columns added to `public.profiles` (11, all additive)

`current_title`, `current_position`, `current_company`, `headline`, `professional_summary`, `location`, `timezone`, `preferred_name`, `custom_goal_text`, `years_of_experience` (all `text`, nullable), and `is_public boolean NOT NULL DEFAULT false`.

No existing column was altered, renamed or dropped. `profiles` went from 13 → 24 columns.

**Verified:** `is_public` has `column_default = false` and `is_nullable = NO`. A newly auto-created profile row was observed with `is_public = false` — existing users remain private (fail-closed).

## 6. Indexes created (21)

`idx_roadmap_phases_roadmap_id`, `idx_roadmap_milestones_phase_id`, `idx_roadmap_tasks_milestone_id`, `idx_roadmap_tasks_status`, `idx_projects_profile_id`, `idx_project_skills_skill_id`, `idx_evidence_items_profile_id`, `idx_evidence_items_project_id`, `idx_evidence_skills_skill_id`, `idx_cvs_profile_id`, `idx_cvs_one_active_per_profile` (UNIQUE partial), `idx_cv_versions_cv_id`, `idx_saved_roles_profile_id`, `idx_job_applications_profile_id`, `idx_job_applications_stage`, `idx_interview_sessions_profile_id`, `idx_interview_sessions_created_at`, `idx_profile_certifications_profile_id`, `idx_profile_languages_profile_id`, `idx_profile_links_profile_id`, `idx_profile_career_identity_profile_id`.

Public schema total after migration: **60 indexes**.

## 7. Constraints created (12 verified in `pg_constraint`)

| Constraint | Type | Table |
|---|---|---|
| `roadmaps_profile_id_key` | UNIQUE | `roadmaps` |
| `roadmap_phases_roadmap_phase_key` | UNIQUE | `roadmap_phases` |
| `roadmap_milestones_phase_order_key` | UNIQUE | `roadmap_milestones` |
| `roadmap_tasks_milestone_order_key` | UNIQUE | `roadmap_tasks` |
| `roadmap_tasks_status_check` | CHECK | `roadmap_tasks` |
| `project_skills_pkey` | PK (composite) | `project_skills` |
| `evidence_skills_pkey` | PK (composite) | `evidence_skills` |
| `idx_cvs_one_active_per_profile` | UNIQUE partial index | `cvs` |
| `cv_versions_cv_version_key` | UNIQUE | `cv_versions` |
| `saved_roles_profile_role_key` | UNIQUE | `saved_roles` |
| `job_applications_stage_check` | CHECK | `job_applications` |
| `profile_links_profile_kind_key` | UNIQUE | `profile_links` |
| `profile_career_identity_profile_key` | UNIQUE | `profile_career_identity` |

Status CHECK values: `not_started | in_progress | completed` (tasks) and `saved | applied | screening | interview | technical | final | offer | rejected | withdrawn` (applications).

## 8. Foreign keys + delete behaviour (22 new FKs, all verified)

| Relationship | Delete rule |
|---|---|
| `roadmaps.profile_id` → `profiles` | CASCADE |
| `roadmap_phases.roadmap_id` → `roadmaps` | CASCADE |
| `roadmap_milestones.phase_id` → `roadmap_phases` | CASCADE |
| `roadmap_tasks.milestone_id` → `roadmap_milestones` | CASCADE |
| `roadmap_tasks.skill_id` → `skills` | **SET NULL** |
| `roadmap_tasks.evidence_id` → `evidence_items` | **SET NULL** |
| `projects.profile_id` → `profiles` | CASCADE |
| `project_skills.project_id` → `projects` | CASCADE |
| `project_skills.skill_id` → `skills` | CASCADE |
| `evidence_items.profile_id` → `profiles` | CASCADE |
| `evidence_items.project_id` → `projects` | **SET NULL** |
| `evidence_skills.evidence_id` → `evidence_items` | CASCADE |
| `evidence_skills.skill_id` → `skills` | CASCADE |
| `cvs.profile_id` → `profiles` | CASCADE |
| `cv_versions.cv_id` → `cvs` | CASCADE |
| `saved_roles.profile_id` → `profiles` | CASCADE |
| `job_applications.profile_id` → `profiles` | CASCADE |
| `interview_sessions.profile_id` → `profiles` | CASCADE |
| `profile_certifications/languages/links/career_identity.profile_id` → `profiles` | CASCADE |

**No circular cascades** — the chains are strictly `auth.users → profiles → {roadmaps → phases → milestones → tasks}` and `profiles → projects → evidence_items`; `skills` is a leaf catalogue.

**`job_applications.job_id` is deliberately NOT a foreign key** (the job catalogue is static source code).

## 9. RLS policies (69 created)

RLS enabled on all 17 new tables. Each user-owned table received four policies: SELECT / INSERT / UPDATE / DELETE.

- **Direct-owner tables** (`roadmaps`, `projects`, `evidence_items`, `cvs`, `saved_roles`, `job_applications`, `interview_sessions`, `profile_certifications`, `profile_languages`, `profile_links`, `profile_career_identity`): `auth.uid() = profile_id`.
- **Child tables** resolve ownership through the parent chain: `roadmap_phases` → `roadmaps`; `roadmap_milestones` → `phases` → `roadmaps`; `roadmap_tasks` → `milestones` → `phases` → `roadmaps`; `project_skills` → `projects`; `evidence_skills` → `evidence_items`; `cv_versions` → `cvs`. Each uses `EXISTS (SELECT 1 FROM … WHERE r.profile_id = auth.uid())`.

**Verified:** every one of the 23 public tables has `relrowsecurity = true`.

## 10. Public profile policy

`profiles_select_public` — `FOR SELECT USING (is_public = true)`, SELECT only. The existing owner policies (`profiles_select_own`, `profiles_insert_own`, `profiles_update_own`, `profiles_delete_own`, `Users can insert own profile`, `Users can update own profile`, `Users can view own profile`, `profiles_delete_own`) are **untouched**.

**Verified:** the only `USING (true)` anywhere in `public` is the pre-existing `Authenticated users can view skills` policy on the shared `skills` catalogue — a non-user-owned table, unchanged by this phase. No user-owned table has an open policy.

## 11. Migration history after apply

```
version         | name
202510200001   | domain_schema
```

Exactly one entry. The failed `202510190001` is **not** recorded as applied.

## 12. Verification SQL / results

| Check | Result |
|---|---|
| Public table count | **23** (6 pre-existing + 17 new) — verified via `information_schema.tables` |
| `profiles` column count | **24** (13 + 11 additive) |
| `is_public` default | `false`, `NOT NULL` — verified in `information_schema.columns` |
| FK delete rules | 22 new FKs, all as specified — verified via `information_schema.referential_constraints` |
| RLS enabled | 23/23 tables `relrowsecurity = true` |
| Policy count | 19 pre-existing + 69 new = 88 across `public` |
| Unsafe policies | none on user-owned tables |
| Constraints | 12 verified in `pg_constraint` (UNIQUE / PK / CHECK) |
| Indexes | 21 new; 60 total in `public` |
| Roadmap chain write/read | **PASS** — inserted `roadmap → phase → milestone → task` and read the full 4-level join back correctly (`Task 1 / in_progress / Milestone 1 / Phase 1 / Test Roadmap`) |
| `SET NULL` on project delete | **PASS** — evidence row survived with `project_id` becoming NULL (`has_project: true → false`) |
| `CASCADE` on profile delete | **PASS** — before: `roadmaps 1, tasks 1, evidence 1, profiles 1`; after deleting the profile: `0, 0, 0, 0` |
| Test-data cleanup | temp auth user deleted (HTTP 200); all tables back to 0 rows, including `auth.users` |

**Dry run before apply** (`supabase db push --dry-run`): `Would push these migrations: • 202510200001_domain_schema.sql` — the archived failed migrations were **not** attempted. No `migration repair` was used.

## 13–15. Application verification

- **lint**: PASS (`tsc --noEmit`, no errors)
- **build**: PASS (`✓ 1736 modules transformed`, `✓ built in 9.56s`)
- **audit**: PASS (`npm audit` → 0 vulnerabilities)

No application code was modified to make these pass.

## 16. Git status

- **Branch**: `audit/before-supabase-migration`
- **No commit, no push, no deploy** (as instructed)
- **Changed/untracked files (whole session, all from previously approved phases):**
  - Modified: `.env.example`, `package-lock.json`, `package.json`, `server.ts`, `tsconfig.json`, `src/components/auth/AuthModal.tsx`, `src/components/views/InterviewsView.tsx`, `src/components/views/SettingsView.tsx`, `src/context/CareerContext.tsx`
  - Untracked: `server/` (auth + db modules), `src/lib/`, `supabase/` (migrations + archive), report markdown files, `bun.lock`, `.claude/`
- **This phase (B.3.4) added**: `supabase/migrations/202510200001_domain_schema.sql`, the `supabase/migrations/archive/` directory (2 files moved, contents unchanged), and this report. **No application file was touched in B.3.4.**

## 17. Confirmations

- ✅ **No application code changed** in B.3.4 (`server.ts`, `src/**`, `tsconfig.json`, `package.json` untouched by this phase)
- ✅ **No user data migrated** — no application-data `INSERT`, no import of `.careerpilot_state.json`, no seed data, no demo-user recreation
- ✅ **`.careerpilot_state.json` unchanged** — still `users: ['user-default-1']`, `userStates: ['user-default-1']`; the only temporary test artefacts were removed
- ✅ **No deploy**, **no push**, **no Cloudflare change**, **no GitHub change**
- ✅ **No destructive DDL** — no `DROP`, `TRUNCATE`, `DELETE`, or `DROP COLUMN` in the migration (verified by pattern scan)
- ✅ **No `profiles.auth_uid`**, no `skills.profile_id`
- ✅ **No RLS weakening** — no existing policy was rewritten
- ✅ **No Storage bucket created** (out of scope by instruction) — `cvs.storage_path` exists as a nullable column only; no files uploaded
- ✅ **The five broken localStorage domains** (`secondary_goals`, `career_milestones`, `activities`, `documents`, `cover_letters`) were **not** created — explicitly out of scope
- ✅ **No `supabase migration repair`**, no migration history rewritten, no failed migration marked applied

## 18. Blockers and deviations

**Deviations from the B.3.3 design (both required by PostgreSQL, both benign):**

1. **`roadmap_tasks.evidence_id` FK is deferred.** The B.3.3 design had `evidence_id uuid REFERENCES public.evidence_items(id)` inline, but `roadmap_tasks` is created before `evidence_items`, so an inline FK would fail at creation. The column is created as a plain `uuid` and the FK is added by a separate `ALTER TABLE … ADD CONSTRAINT roadmap_tasks_evidence_id_fkey` immediately after `evidence_items` is created. The resulting constraint, type (`uuid`), and delete rule (`ON DELETE SET NULL`) are identical to the design.
2. **Ownership expression simplified to `auth.uid() = profile_id`.** B.3.3's design spelled out a `profiles` subquery; the live schema already uses `auth.uid() = user_id` / `auth.uid() = id` on the 6 pre-existing tables (because `profiles.id = auth.users.id`). The direct comparison is equivalent, matches the existing convention, and avoids an extra subquery per row. Child tables still resolve ownership through the parent chain as designed.

**Blockers: none.** The schema applied cleanly on the first attempt and passed every verification above.

**Carried-forward items (not blockers for this phase, tracked in B.3.3 §18):**
- The five broken localStorage domains still need their own type audit and tables.
- The demo user (`user-default-1`) still has no Supabase Auth counterpart — a decision is needed before any data import.
- The CV Storage bucket is still not provisioned (`cvs.storage_path` points to a future object).
- `server/db/*` modules for the 17 new tables do not exist yet — the backend still persists only profile/preferences/skills/education/experience.
- The frontend still hydrates from `localStorage`; the server remains a write-only sink for state.

---

**B.3.4 status: COMPLETE — schema applied and independently verified (23 tables, 11 additive columns, 21 indexes, 12 constraints, 22 FKs, 69 policies; cascade and SET NULL behaviour proven against a live temporary identity and cleaned up).**
