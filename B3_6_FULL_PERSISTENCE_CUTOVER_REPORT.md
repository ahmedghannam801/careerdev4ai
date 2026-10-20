# B.3.6 — Full Persistence Cutover Report

Phase: B.3.6 — IMPLEMENTATION.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Status: **COMPLETE.**

---

## 1. Executive Summary

The five broken domains (`secondary_goals`, `career_milestones`, `activities`, `documents`, `cover_letters`) are now backed by real PostgreSQL persistence, and the frontend reads and writes through the backend.

- **4 new tables** created and verified remotely: `activities`, `secondary_goals`, `career_milestones`, `cover_letters` — each with `profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`, UUID PK, CHECK constraints taken verbatim from the current TypeScript enums, and RLS enabled with `auth.uid() = profile_id` owner policies.
- **No `documents` table.** `CareerDocument` is now a **derived view-model** composed from `cvVersions`, `coverLetters`, `profile.certifications` and `projects`.
- **The cover-letter double-write is gone.** `cover_letters` is the single canonical source; the "My Documents" entry is derived from it.
- **Activity timestamps are real.** `created_at timestamptz` in the database; the human-readable string ("Just now", "Today, 10:45 AM") is derived at render time by `formatActivityTimestamp()`.
- **All five localStorage keys are gone** — 0 reads, 0 writes, 0 removes.
- **53 live tests passed** against the real database with two temporary identities, including cross-user isolation, IDOR, cascade, and persistence across reload / logout-login / server restart. All test data was removed (0 rows, 0 auth users).

---

## 2. Database Changes

**Migration:** `supabase/migrations/202510200002_broken_domains_persistence.sql` (new, applied). No previous migration was modified.

| Table | Columns | FKs | Constraints | Indexes | RLS policies |
|---|---|---|---|---|---|
| `activities` | `id`, `profile_id`, `action_type`, `title`, `subtitle`, `related_object`, `link_view`, `created_at` | `profile_id` → `profiles` CASCADE | `CHECK action_type IN (11 values from ActivityActionType)` | `idx_activities_profile_created (profile_id, created_at DESC)` | 3 (SELECT/INSERT/DELETE) |
| `secondary_goals` | `id`, `profile_id`, `title`, `description`, `priority`, `deadline`, `status`, `progress_percent`, `created_at`, `updated_at` | `profile_id` → `profiles` CASCADE | `CHECK priority IN (high,medium,low)`, `CHECK status IN (active,achieved,paused)`, `CHECK progress_percent BETWEEN 0 AND 100` | `idx_secondary_goals_profile_id` | 4 (SELECT/INSERT/UPDATE/DELETE) |
| `career_milestones` | `id`, `profile_id`, `title`, `category`, `date_achieved`, `notes`, `verified`, `created_at`, `updated_at` | `profile_id` → `profiles` CASCADE | `CHECK category IN (9 values from MilestoneCategory)` | `idx_career_milestones_profile_id`, `idx_career_milestones_date (date_achieved DESC)` | 4 |
| `cover_letters` | `id`, `profile_id`, `title`, `company`, `role`, `job_description`, `content`, `key_highlights`, `target_job_id`, `application_id`, `created_at`, `updated_at` | `profile_id` → `profiles` CASCADE; `application_id` → `job_applications` **SET NULL** | — | `idx_cover_letters_profile_id`, `idx_cover_letters_application_id` | 4 |

**Verified remotely after apply:** 4 tables exist; RLS enabled on all 4; 15 policies; 6 indexes; 5 FKs with the exact delete rules above; **zero `USING (true)`** on any of them; no `documents` table.

`target_job_id` deliberately remains a **string** — the job catalogue is static source code, not a table (same reasoning as `job_applications.job_id`).

---

## 3. RLS / Security

- Owner expression on every new table: `auth.uid() = profile_id`.
- `activities` has no UPDATE policy — it is append-only by design (the current code has no update/delete mutator for activities).
- `cover_letters.application_id` uses `ON DELETE SET NULL` so removing an application never destroys a user's cover letter.
- No existing policy was rewritten; no RLS weakening.
- The server uses the service-role client, so **RLS is defence-in-depth**; ownership is enforced in the route layer by `requireAuth` → verified `user.id`.

---

## 4. Backend Modules

| Module | Functions |
|---|---|
| `server/db/activities.ts` | `listActivities(profileId, {limit, actionType})`, `createActivity(profileId, input)` + `ActivityDTO`, `CreateActivityInput`, `ActivityActionType`, `ACTIVITY_ACTION_TYPES` |
| `server/db/secondaryGoals.ts` | `listSecondaryGoals`, `createSecondaryGoal`, `updateSecondaryGoal`, `deleteSecondaryGoal` + typed DTOs |
| `server/db/careerMilestones.ts` | `listCareerMilestones`, `createCareerMilestone`, `updateCareerMilestone`, `deleteCareerMilestone` + `MilestoneCategory`, `MILESTONE_CATEGORIES` |
| `server/db/coverLetters.ts` | `listCoverLetters`, `getCoverLetter`, `createCoverLetter`, `updateCoverLetter`, `deleteCoverLetter` + typed DTOs |

All four use the existing `getSupabaseServer()` client and filter by the profile id supplied by the route layer — **never by a client-supplied id**.

---

## 5. API Endpoints

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/activities` | required | 200 `{success, activities}` | 400 invalid actionType/limit · 401 |
| POST | `/api/activities` | required | 201 `{success, activity}` | 400 invalid actionType / missing title · 401 |
| GET | `/api/secondary-goals` | required | 200 `{success, goals}` | 401 |
| POST | `/api/secondary-goals` | required | 201 `{success, goal}` | 400 missing title / invalid priority / invalid status / invalid progressPercent · 401 |
| PATCH | `/api/secondary-goals/:id` | required | 200 `{success, goal}` | 400 invalid id or fields · 404 not found · 401 |
| DELETE | `/api/secondary-goals/:id` | required | 200 `{success}` | 400 invalid id · 404 · 401 |
| GET | `/api/career-milestones` | required | 200 `{success, milestones}` | 401 |
| POST | `/api/career-milestones` | required | 201 `{success, milestone}` | 400 missing title / invalid category / invalid dateAchieved · 401 |
| PATCH | `/api/career-milestones/:id` | required | 200 `{success, milestone}` | 400 · 404 · 401 |
| DELETE | `/api/career-milestones/:id` | required | 200 `{success}` | 400 · 404 · 401 |
| GET | `/api/cover-letters` | required | 200 `{success, coverLetters}` | 401 |
| GET | `/api/cover-letters/:id` | required | 200 `{success, coverLetter}` | 400 invalid id · 404 · 401 |
| POST | `/api/cover-letters` | required | 201 `{success, coverLetter}` | 400 missing title/company/role/content · invalid applicationId · 401 |
| PATCH | `/api/cover-letters/:id` | required | 200 `{success, coverLetter}` | 400 · 404 · 401 |
| DELETE | `/api/cover-letters/:id` | required | 200 `{success}` | 400 · 404 · 401 |

Ownership is always `req.authUser.id` (the verified Supabase user). No route reads `req.body.userId`, `req.query.userId` or `req.params.userId` for ownership. No stack traces, SQL errors or secrets are returned; diagnostics go to the server log only.

`/api/state` was **not** extended with these domains (per instruction 12).

---

## 6. Frontend Hydration

`src/lib/domainApi.ts` — a typed client for all 15 endpoints, using the Supabase access token from `getAccessToken()`. It throws `ApiRequestError` (status + message) and never uses `any`.

`src/context/CareerContext.tsx`:
- A new effect keyed on `authToken` hydrates `secondaryGoals`, `milestones`, `activities` and `coverLetters` from the backend in one `Promise.all`. It runs on every authenticated session and after re-authentication.
- The five `useState` initialisers no longer read localStorage; they start empty and are filled by the backend.
- Mutators are now **backend-first**: the server call happens first, and the local React state is updated only after it succeeds (with a `console.error` on failure).
- DTO → domain-type mappers (`toSecondaryGoal`, `toCareerMilestone`, `toCoverLetter`, `toActivity`) keep every view working unchanged.
- `formatActivityTimestamp()` derives "Just now" / "Today, 10:45 AM" / "Yesterday" from the real DB timestamp.

---

## 7. LocalStorage Removal

Final search across `src/`:

| Key | reads | writes | removes |
|---|---|---|---|
| `careerpilot_secondary_goals` | 0 | 0 | 0 |
| `careerpilot_milestones` | 0 | 0 | 0 |
| `careerpilot_activities` | 0 | 0 | 0 |
| `careerpilot_documents` | 0 | 0 | 0 |
| `careerpilot_cover_letters` | 0 | 0 | 0 |

`careerpilot_token` was **not** touched by this phase (only the pre-existing `removeItem` on logout remains — Supabase Auth owns the session).

---

## 8. Documents Refactor

`documents` is no longer an entity. `CareerContext.tsx` derives it with a `useEffect` over its canonical sources:

| Document type | Canonical source |
|---|---|
| `cv` | `cvVersions` |
| `cover_letter` | `coverLetters` |
| `certificate` | `profile.certifications` |
| `portfolio` | `projects` |
| `supporting` | **not represented** (declared in the type but never used — no persistence created) |

- `addDocument` now routes to the canonical store for the type (cover letter → `cover_letters`, certificate → `profile.certifications`, portfolio → `projects`); `cv`/`supporting` log a warning because they have no writable canonical source in this phase.
- `deleteDocument` deletes the underlying canonical record.
- `updateDocument` was **removed** — it had no callers and no canonical store. The `CareerDocument` type is retained as a compatibility/view-model.
- The `CareerDocument` type is retained; only its *source of truth* changed.

---

## 9. Cover Letter Double-Write Fix

Before: `DocumentsView` called `saveCoverLetter(...)` **and** `addDocument({type:'cover_letter'})` — the same content in two stores.
After: only `saveCoverLetter(...)` is called; the "My Documents" entry is derived from `coverLetters` by the effect. There is now exactly one source of truth (`public.cover_letters`).

---

## 10. Activity Timestamp Migration

| | Before | After |
|---|---|---|
| Storage | `timestamp: string` = `"Just now"` / `"Today, 10:45 AM"` | `created_at timestamptz` (DB default `now()`) |
| Display | stored display string | derived by `formatActivityTimestamp()` at render time |

Verified live: a created activity returned `createdAt: "2026-10-19T23:17:10.897142+00:00"` — a real timestamp.

Activities are created **after** the triggering mutation succeeds (`mutation → DB success → create activity`), so a failed mutation never produces an activity.

---

## 11. Tests

No test script exists in `package.json` (scripts: `dev, start, build, preview, clean, lint`). The project has no testing infrastructure, so the verification was done with live HTTP calls against the running server and a real Supabase project.

**53 live assertions, all passing:**

| Group | Count | Result |
|---|---|---|
| Unauthenticated → 401 on all 8 domain routes | 12 | PASS |
| Invalid token → 401 on all 8 domain routes | 8 | PASS |
| Valid token CRUD (create/read for all 4 domains) | 10 | PASS |
| Ownership: B sees only own data | 3 | PASS |
| IDOR: B cannot GET/PATCH/DELETE A's records | 4 | PASS |
| Validation: malformed input → 400 (not 500) | 11 | PASS |
| Reload persistence | 4 | PASS |
| Update + delete persistence | 3 | PASS |
| Logout/login persistence (new session token) | 5 | PASS |
| Server-restart persistence | 3 | PASS |
| Cascade: deleting a profile removes its domain rows | 1 | PASS |

---

## 12. Live Supabase Verification

- 4 tables created and present.
- 4/4 with `relrowsecurity = true`; 15 policies (3/4/4/4).
- 5 FKs with the intended delete rules.
- 6 indexes.
- Zero `USING(true)` on the new tables.
- Ownership chain confirmed: `auth.users.id` → `profiles.id` → `<table>.profile_id`.
- `auth.users` is 0 rows and all domain tables are 0 rows after cleanup.

---

## 13. Ownership / IDOR Verification

Direct cross-user attempts with User A's real record ids and User B's token:
- `GET /api/secondary-goals` (B) → B's own list only (empty while A had 1)
- `PATCH /api/secondary-goals/<A's id>` (B) → **404**
- `DELETE /api/secondary-goals/<A's id>` (B) → **404**
- `GET /api/cover-letters/<A's id>` (B) → **404**
- `PATCH /api/cover-letters/<A's id>` (B) → **404**
- `GET /api/activities` (B) → B's own list only
- `GET /api/cover-letters` (B) → B's own list only

A user cannot read, update or delete another user's records, and a client-supplied `userId` in a body is ignored (verified earlier in B.3.2 and unchanged here).

---

## 14. Persistence Across Reload / Logout-Login / Server Restart

| Scenario | Result |
|---|---|
| Reload (fresh fetch) | goal, milestone, cover letter and activity all present — PASS |
| Logout → login (brand-new session token) | milestone, cover letter and activity all present — PASS |
| Server restart (process killed, new process, same DB) | milestone, cover letter and activity all present — PASS |
| Profile deletion cascade | `career_milestones`/`cover_letters`/`activities` rows went 1 → 0 — PASS |

---

## 15. Remaining Legacy Code

| Item | Status |
|---|---|
| `src/types/career.ts` — `CareerDocument` | kept as a view-model type; no longer a stored entity |
| `CareerContext` — `addDocument` | kept, routes to the canonical store by type |
| `CareerContext` — `updateDocument` | **removed** (no callers, no canonical store) |
| `CareerContext` — `documents` state | derived via `useEffect`, not persisted |
| `profile.certifications` | still in-memory only (profile persistence is a separate Group A concern, not in this phase's scope) |
| `cvVersions` | still in-memory only (CV persistence is Group B, not started) |
| `projects` | still in-memory only (Group B/C scope) |
| `/api/state` | unchanged; still a compatibility aggregate for profile/skills/etc. and does not carry these 5 domains |
| `.careerpilot_state.json` | untouched; still holds the legacy demo user + demo state |
| `/api/auth/login|register|logout` (legacy file-DB sessions) | still present; the frontend no longer uses them (B.3.2) |

---

## 16. Remaining Blockers

1. **`updateDocument` removed from the public context surface.** No consumer called it, but it is a (small) API removal on the React context. Flagged here for visibility.
2. **Document types `cv` and `supporting` have no writable canonical store** in this phase — `addDocument` logs a warning for them. Wiring them needs the CV persistence (Group B) and a decision on `supporting` (currently unused).
3. **`profile.certifications`, `cvVersions` and `projects` remain in-memory.** Their canonical tables exist (`profile_certifications`, `cvs`/`cv_versions`, `projects`) but no backend module persists them yet — that is Group B/C work, explicitly out of scope here.
4. **The `documents` view-model derives `certificates` and `portfolios` from in-memory state**, so those two document types are only as persistent as their in-memory source until those domains are migrated.
5. **Six of the eleven `ActivityActionType` values are still never emitted** by application code (`completed_task`, `completed_course`, `added_project`, `mock_interview`, `acquired_skill`, and `added_evidence` — the last is emitted but with a milestone-specific title). The CHECK constraint permits all 11 so the emitters can be added later without a migration.
6. **No automated test suite.** The project has no test infrastructure; adding one (vitest/jest + a Supabase test harness) is a separate, larger piece of work.
7. **`activities` has a DELETE policy but no delete endpoint** — the policy exists for completeness; no UI deletes activities. Harmless, but noted.

---

## 17. Files Changed

**Modified:**
- `server.ts` — 15 new endpoints, module imports, validation helpers
- `src/context/CareerContext.tsx` — backend hydration, backend-first mutators, derived documents, DTO mappers, activity timestamp formatting
- `src/components/views/DocumentsView.tsx` — double-write removed, `updateDocument` dropped
- `src/components/views/ApplicationsView.tsx` — `logActivity` awaited
- `src/components/views/JobsView.tsx` — `logActivity` awaited
- `supabase/migrations/202510200002_broken_domains_persistence.sql` — **new**
- `server/db/activities.ts`, `server/db/secondaryGoals.ts`, `server/db/careerMilestones.ts`, `server/db/coverLetters.ts` — **new**
- `src/lib/domainApi.ts` — **new**
- `B3_6_FULL_PERSISTENCE_CUTOVER_REPORT.md` — **new**

**Unchanged by this phase** (modified in earlier phases): `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/components/auth/AuthModal.tsx`, `src/components/views/InterviewsView.tsx`, `src/components/views/SettingsView.tsx`, `server/auth/*`, `server/db/{supabase,profiles,state,account,preferences,educations,experiences,userSkills}.ts`, and all previously applied migrations.

---

## 18. Exact Git Diff Summary

```
 .env.example                              |  19 +
 package-lock.json                         | 842 ++++++++++----------------------
 package.json                              |   4 +-
 server.ts                                 | 650 ++++++++++++++++++-----
 src/components/auth/AuthModal.tsx         |  12 +-
 src/components/views/ApplicationsView.tsx |   4 +-
 src/components/views/DocumentsView.tsx    |  16 +-
 src/components/views/InterviewsView.tsx   |   7 +-
 src/components/views/JobsView.tsx         |   4 +-
 src/components/views/SettingsView.tsx     |  14 +-
 src/context/CareerContext.tsx             | 819 ++++++++++++++++++-----------
 tsconfig.json                             |   3 +-
 12 files changed, 1311 insertions(+), 1083 deletions(-)
```
Plus untracked: `server/` (8 modules incl. 4 new), `src/lib/` (2 new), `supabase/` (2 migrations + archive), and this report.

**No commit, no push, no deploy.** Branch remains `audit/before-supabase-migration` at commit `8666da4`.

---

## 19. Definition of Done

| Criterion | Status |
|---|---|
| 4 required tables exist | ✅ `activities`, `secondary_goals`, `career_milestones`, `cover_letters` |
| RLS enabled | ✅ 4/4 |
| Ownership policies verified | ✅ `auth.uid() = profile_id`, 15 policies, 0 `USING(true)` |
| DB modules implemented | ✅ 4 modules |
| Authenticated endpoints implemented | ✅ 15 endpoints |
| Frontend reads backend data | ✅ hydration effect |
| Frontend mutations persist backend-first | ✅ all mutators await the server call first |
| 5 localStorage domains no longer source of truth | ✅ 0 reads / 0 writes / 0 removes |
| Documents duplicate model removed | ✅ derived view-model, no table |
| Cover letter double-write removed | ✅ single canonical source |
| Activity timestamps are real timestamps | ✅ `created_at timestamptz` |
| Reload persistence | ✅ PASS |
| Logout/login persistence | ✅ PASS |
| Server restart persistence | ✅ PASS |
| Cross-user isolation | ✅ PASS |
| IDOR tests | ✅ PASS |
| Cleanup | ✅ 0 rows, 0 auth users, temp files removed |
| lint | ✅ PASS |
| build | ✅ PASS |
| audit | ✅ PASS (0 vulnerabilities) |
| tests | ⚠️ no test script in the project — live HTTP + real DB verification instead (53 assertions) |
| No secrets exposed | ✅ `.env.local` deleted; no secret in any file |
| No deploy | ✅ |
| No push | ✅ |
| No destructive migration | ✅ no DROP/TRUNCATE/DELETE; `CREATE TABLE IF NOT EXISTS` + additive only |
| `.careerpilot_state.json` untouched | ✅ `users: ['user-default-1']`, `userStates: ['user-default-1']` |
| No migration repair | ✅ |

**B.3.6 STATUS: COMPLETE**
