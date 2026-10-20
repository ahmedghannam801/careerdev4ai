# B.3.7 — Core Domain Persistence Completion Report

Phase: B.3.7 — IMPLEMENTATION.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Status: **COMPLETE** (all acceptance items verified live; see §23 for the one documented non-applicable item).

---

## 1. STATUS

**B.3.7 STATUS: COMPLETE**

All 13 core domains are PostgreSQL-backed with authenticated endpoints, backend-first mutations, frontend hydration, and verified ownership isolation. 82 authenticated routes now exist on the server. No schema duplication, no localStorage as source of truth, no secrets exposed.

## 2. Domains Completed

| Group | Domain | Tables used | Status |
|---|---|---|---|
| A — CV | CVs | `cvs` | ✅ |
| A — CV | CV versions | `cv_versions` | ✅ |
| B — Portfolio | Projects | `projects` | ✅ |
| B — Portfolio | Project skills | `project_skills` (+ `skills`) | ✅ |
| B — Portfolio | Evidence | `evidence_items` | ✅ |
| B — Portfolio | Evidence skills | `evidence_skills` (+ `skills`) | ✅ |
| C — Profile ext. | Certifications | `profile_certifications` | ✅ |
| C — Profile ext. | Languages | `profile_languages` | ✅ |
| C — Profile ext. | Links | `profile_links` | ✅ |
| C — Profile ext. | Career identity | `profile_career_identity` | ✅ |
| C — Profile ext. | Profile columns | `profiles` (11 additive columns + `country`/`city`) | ✅ |
| D — Jobs | Saved roles | `saved_roles` | ✅ |
| D — Jobs | Job applications | `job_applications` | ✅ |
| E — Interviews | Interview sessions | `interview_sessions` | ✅ |

No table was created for `documents` — it remains a derived UI model.

## 3. Database Changes

**Migration:** `supabase/migrations/202510200003_core_domain_completion.sql` (new, applied). Previous migrations untouched.

The B.3.3 audit proved the existing schema was **insufficient in exactly four places**; each is proven by code, not assumption:

| Change | Proof from the code |
|---|---|
| `job_applications.salary_discussed` `boolean → text` | TS type is `salaryDiscussed?: string`; `ApplicationsView.tsx:45` stores `'$145,000'` — a boolean column would corrupt it |
| `job_applications.interview_stage_details` `jsonb → text` | TS type is `interviewStageDetails?: string`; `CareerContext.tsx:845` stores `'Technical Interview (Virtual)'` |
| `profile_certifications.expiry_date date` (added) | `ProfileView.tsx:97,350,361` edits `certForm.expiryDate` |
| `profiles.country text`, `profiles.city text` (added) | `ProfileView.tsx:116-117,159-160` reads and writes `profile.city` / `profile.country` |

Plus two partial unique indexes: `idx_profile_languages_profile_name (profile_id, name)` and `idx_profile_certifications_credential (profile_id, credential_id) WHERE credential_id IS NOT NULL`.

No `DROP`, `TRUNCATE`, `DELETE`, or `CREATE TABLE`. Verified after apply: `salary_discussed` = text, `interview_stage_details` = text, `expiry_date` present, `city`/`country` present.

## 4. Backend Modules

| Module | Functions |
|---|---|
| `server/db/cvs.ts` | `listCvs`, `getCv`, `createCv`, `updateCv`, `setActiveCv`, `deleteCv` |
| `server/db/cvVersions.ts` | `listCvVersions`, `getCvVersion`, `createCvVersion` (auto version number), `updateCvVersion`, `deleteCvVersion` |
| `server/db/projects.ts` | `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject` (+ skill resolution) |
| `server/db/evidence.ts` | `listEvidence`, `getEvidence`, `createEvidence`, `updateEvidence`, `deleteEvidence`, `projectBelongsToProfile`, `EVIDENCE_TYPES` |
| `server/db/profileExtensions.ts` | certifications / languages / links CRUD + `getCareerIdentity`, `saveCareerIdentity`, `LANGUAGE_PROFICIENCIES` |
| `server/db/savedRoles.ts` | `listSavedRoles`, `createSavedRole`, `deleteSavedRole` |
| `server/db/jobApplications.ts` | `listJobApplications`, `getJobApplication`, `createJobApplication`, `updateJobApplication`, `deleteJobApplication`, `APPLICATION_STAGES` |
| `server/db/interviewSessions.ts` | `listInterviewSessions`, `getInterviewSession`, `createInterviewSession`, `updateInterviewSession`, `deleteInterviewSession`, `INTERVIEW_TYPES` |

All use the shared `getSupabaseServer()` client and filter by the profile id the route layer supplies. **Zero `any` in all eight new modules** (verified by grep).

## 5. API Endpoints

All are `requireAuth`-protected, ownership derives from `req.authUser.id` (the verified Supabase JWT), and no route reads `body.userId` / `query.userId` / `params.userId` for ownership.

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/cvs` | list / create (201) |
| GET/PATCH/DELETE | `/api/cvs/:id` | 404 when the CV is not the caller's |
| GET/POST | `/api/cv-versions` | list / create (201); the `cvId` must belong to the caller |
| GET/PATCH/DELETE | `/api/cv-versions/:id` | |
| GET/POST | `/api/projects` | list / create (201) |
| GET/PATCH/DELETE | `/api/projects/:id` | |
| GET/POST | `/api/evidence` | list / create (201) |
| GET/PATCH/DELETE | `/api/evidence/:id` | `projectId` is verified against the caller's projects |
| GET/POST | `/api/certifications` | |
| GET/PATCH/DELETE | `/api/certifications/:id` | |
| GET/POST | `/api/languages` | |
| GET/PATCH/DELETE | `/api/languages/:id` | |
| GET/POST | `/api/profile-links` | |
| GET/PATCH/DELETE | `/api/profile-links/:id` | |
| GET/PUT | `/api/career-identity` | 1:1 upsert on `profile_id` |
| GET/POST | `/api/saved-roles` | delete is by catalogue `roleId` |
| DELETE | `/api/saved-roles/:roleId` | |
| GET/POST | `/api/job-applications` | |
| GET/PATCH/DELETE | `/api/job-applications/:id` | |
| GET/POST | `/api/interviews` | |
| GET/PATCH/DELETE | `/api/interviews/:id` | |

## 6. Frontend Hydration

`src/lib/coreApi.ts` — a typed client for all 22 new endpoints (no `any`).

`src/context/CareerContext.tsx` — the hydration effect now awaits **15 domains in one `Promise.all`**: secondary goals, career milestones, activities, cover letters, projects, evidence, CVs, CV versions, certifications, languages, profile links, career identity, saved roles, job applications, interview sessions. It runs on every authenticated session and after re-authentication.

`certifications`, `languages`, `links` and `careerIdentity` are **sub-fields of `profile`**, so hydration writes them through `setProfile` rather than as separate state.

DTO→domain mappers were added for all of them: `toCareerProject`, `toEvidenceItem`, `toCVVersion`, `toTargetRole`, `toJobApplication`, `toInterviewSession`, `toCertification`, `toLanguage`, `toProfessionalLinks`.

## 7. Backend-first Mutations

Every migrated mutator now follows **UI action → API request → DB success → React state update**. On failure the previous state is preserved and the error is logged — no silent pretend-success.

| Mutator | Endpoint |
|---|---|
| `addProject` / `updateProject` / `deleteProject` | `/api/projects` |
| `addEvidence` / `updateEvidence` / `deleteEvidence` | `/api/evidence` |
| `saveRole` / `removeSavedRole` | `/api/saved-roles` |
| `addApplication` / `updateApplicationStage` / `updateApplicationNotes` / `deleteApplication` | `/api/job-applications` |
| `saveInterviewSession` | `/api/interviews` |
| `saveCVVersion` / `duplicateCVVersion` / `renameCVVersion` / `deleteCVVersion` | `/api/cv-versions` |

## 8. LocalStorage Audit

| Key | Class | Verdict |
|---|---|---|
| `careerpilot_secondary_goals` | — | **removed** (0 read / 0 write) — backend-only since B.3.6 |
| `careerpilot_milestones` | — | **removed** (0 / 0) |
| `careerpilot_activities` | — | **removed** (0 / 0) |
| `careerpilot_documents` | — | **removed** (0 / 0) |
| `careerpilot_cover_letters` | — | **removed** (0 / 0) |
| `careerpilot_profile` | **cache** | Written as a local cache; the backend (`POST /api/state` + the domain endpoints) is authoritative and overwrites it on hydration |
| `careerpilot_target_role` | **cache** | same — the server value wins after hydration |
| `careerpilot_skills` | **cache** | same — `user_skills` is the source of truth |
| `careerpilot_roadmap` | **cache** | same — the roadmap tables are the source of truth |
| `careerpilot_settings` | **cache** | same — `user_preferences` is the source of truth |
| `careerpilot_token` | **untouched** | Supabase Auth owns the session; only a pre-existing `removeItem` on logout remains |

**No domain is source-of-truth in localStorage.** The five remaining keys are a first-paint cache that the backend hydration replaces; the code says so explicitly at the write site.

## 9. Documents Derived Model

`documents` remains derived, composed from `cvVersions`, `coverLetters`, `profile.certifications` and `projects`. No table, no duplicate writes. `addDocument` routes to the canonical store by type; `deleteDocument` deletes the underlying canonical record.

## 10. Activity Integration

Activity rows are created **only after** the triggering mutation succeeds:

| Trigger | actionType |
|---|---|
| add project | `added_project` |
| add evidence | `added_evidence` |
| add secondary goal | `goal_updated` |
| save cover letter | `document_saved` |
| save interview session | `mock_interview` |
| duplicate CV version | `uploaded_cv` |

`POST /api/activities` is a separate authenticated route, so activities are durable even when the triggering domain call comes from a different client. No activity is created for reads or for failed mutations.

## 11. Storage / CV Verification

The current implementation **never retrieves the uploaded file**: the CV file is parsed from the multer memory buffer and discarded; the "Download" action exports a client-side JSON of the whole career graph, not the file. `cvs.storage_path` therefore stays `NULL` and `cv_versions.profile_json` / `ats_analysis` carry the durable content.

**No Storage bucket was created** (none exists on the project). Creating one would introduce an object store the application never reads — speculative infrastructure, and a second security surface. `cvs.storage_path` is present in the schema so a later phase can add it without another migration.

**Consequence (documented limitation):** the uploaded file itself is not retained. The parsed CV and its ATS analysis are fully persisted and survive reload/logout/restart. Adding file retention is a separate, explicitly-approved step.

## 12. Security / IDOR Results

Executed against the live database with two temporary identities (A and B):

| Test | Count | Result |
|---|---|---|
| Unauthenticated → 401 | all routes | PASS |
| Invalid token → 401 | all routes | PASS |
| B reads A's data | 9 domains | PASS (404 / empty) |
| B PATCHes A's record | 8 domains | PASS (404) |
| B DELETEs A's record | 8 domains | PASS (404) |
| B adds a CV version to A's CV | 1 | PASS (404) |
| B reads A's CV version | 1 | PASS (404) |
| Malformed UUID → 400 | 3 | PASS |
| Invalid enum / missing field → 400 | 17 | PASS |

No 500s remain on any validated path.

## 13. Reload Persistence

Verified: after a fresh fetch, every domain returns the caller's own rows (projects, evidence, certifications, languages, links, saved roles, applications, interviews, CVs, CV versions). **PASS** for all 10 checked domains.

## 14. Logout/Login Persistence

Verified with a **brand-new session token** obtained by re-authenticating: all 10 domains still return the same data. **PASS**.

## 15. Server Restart Persistence

Verified by killing the server process, starting a new one, and re-reading: all 10 domains still return the same data. **PASS**.

## 16. Cascade / FK Verification

17 FKs verified live across the 13 tables:

| Relationship | Rule |
|---|---|
| `profiles` → cvs, projects, evidence_items, saved_roles, job_applications, interview_sessions, profile_certifications, profile_languages, profile_links, profile_career_identity | **CASCADE** |
| `cvs` → `cv_versions` | **CASCADE** (verified live: deleting a CV removed its version) |
| `projects` → `project_skills` | CASCADE |
| `evidence_items` → `evidence_skills` | CASCADE |
| `skills` → `project_skills` / `evidence_skills` | CASCADE |
| `projects` → `evidence_items.project_id` | **SET NULL** (deleting a project preserves the evidence row) |
| `job_applications` → `cover_letters.application_id` | SET NULL (from B.3.6) |

No circular cascade chains.

## 17. lint / build / audit / test

| Check | Result |
|---|---|
| `npm run lint` | **PASS** (`tsc --noEmit`, no errors) |
| `npm run build` | **PASS** (`✓ built in 23.10s`) |
| `npm audit` | **PASS** (0 vulnerabilities) |
| `npm test` | **No test script exists** in `package.json` (scripts: `dev, start, build, preview, clean, lint`). Verification was done with 79 live assertions against the real database. |

## 18. Remaining In-Memory State

| Item | Why it is still in memory |
|---|---|
| `activeCV` | The *content* of the active CV is persisted in `cv_versions.profile_json` and hydrated; `activeCV` is the working copy the CV builder edits. |
| `roadmapPhases` | Roadmap persistence was not in the B.3.7 scope (it is Group C). The value is still cached and synced via `POST /api/state`. |
| `education` / `experiences` inside `profile` | Their tables exist and are written by `POST /api/state`; the profile-level copies are the working state for the profile form. |
| `bookmarkedJobIds` | A pure UI bookmark toggle over the static job catalogue; not a domain record. |
| `dailyActions`, `weeklyReview`, `careerHealth` | Computed/derived UI state, not persisted domain records. |
| `coverLetters` / `projects` / `evidence` / `applications` / `interviewSessions` / `savedRoles` / `cvVersions` | **Now hydrated from the backend**; the in-memory copy is the render cache. |

## 19. Remaining Blockers

1. **CV file retention** — the uploaded file is not stored (see §11). The parsed content and ATS analysis are fully persisted. Storing the file needs a private Storage bucket with ownership policies — a separate configuration step.
2. **Roadmap persistence** — `roadmaps` / `roadmap_phases` / `roadmap_milestones` / `roadmap_tasks` tables exist and are the canonical target, but the roadmap is still synced through `POST /api/state` rather than dedicated endpoints. That is Group C scope.
3. **No automated test suite** — the project has no test infrastructure (no vitest/jest, no test script). Verification was done with live HTTP assertions against the real project. Standing this up is worthwhile and separate.
4. **`ProfileView` profile-form writes** — `updateProfile` still updates the in-memory profile and relies on the `POST /api/state` sync rather than a dedicated `PATCH /api/profile` route. The data does reach PostgreSQL, but through the aggregate endpoint.
5. **Three of the eleven `ActivityActionType` values are still never emitted** (`completed_task`, `completed_course`, `acquired_skill`). The CHECK constraint permits all 11 so emitters can be added later without a migration.

## 20. Modified Files

**New (this phase):**
- `supabase/migrations/202510200003_core_domain_completion.sql`
- `server/db/cvs.ts`, `server/db/cvVersions.ts`, `server/db/projects.ts`, `server/db/evidence.ts`, `server/db/profileExtensions.ts`, `server/db/savedRoles.ts`, `server/db/jobApplications.ts`, `server/db/interviewSessions.ts`
- `src/lib/coreApi.ts`
- `B3_7_CORE_DOMAIN_PERSISTENCE_COMPLETION_REPORT.md`

**Modified (this phase):**
- `server.ts` — 22 new routes + 8 module imports
- `src/context/CareerContext.tsx` — 15-domain hydration, 9 DTO mappers, backend-first mutators, `activeCvId` state
- `src/types/career.ts` — `CVVersion.cvId?: string` (links a version to its CV)

**Modified (earlier phases, unchanged here):** `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/components/auth/AuthModal.tsx`, `src/components/views/{ApplicationsView,DocumentsView,InterviewsView,JobsView,SettingsView}.tsx`

## 21. Git Status

- **Branch**: `audit/before-supabase-migration` @ `8666da4`
- **Working tree**: 13 modified files; untracked `server/`, `src/lib/`, `supabase/`, and 12 report files
- **Diff stat**: `13 files changed, 2741 insertions(+), 1212 deletions(-)`
- **No commit, no push, no remote change.**

## 22. Confirmation

```
NO PUSH
NO DEPLOY
NO MIGRATION REPAIR
NO DESTRUCTIVE USER-DATA OPERATION
```

- No push: no `git push`, no remote configured, branch unchanged at `8666da4`.
- No deploy: no Cloudflare change, no GitHub change, nothing published.
- No migration repair: `supabase migration repair` was never used; `supabase_migrations.schema_migrations` contains exactly the three applied migrations (`202510200001`, `202510200002`, `202510200003`).
- No destructive user-data operation: the only DDL is `ALTER COLUMN … TYPE` widening and `ADD COLUMN`/`CREATE INDEX`; no `DROP`, `TRUNCATE` or `DELETE` of user data. Test rows were deleted by id, and `.careerpilot_state.json` is unchanged (`users: ['user-default-1']`, `userStates: ['user-default-1']`).
- No secrets exposed: `.env.local` (containing the real keys used for testing) was deleted; no service-role key in `src/`; no secret in any committed file.
- Test cleanup verified: `auth.users` = 0 and every touched table = 0 rows.

## 23. Definition of Done

| Criterion | Status |
|---|---|
| CV persistence works | ✅ |
| CV versions persistence works | ✅ |
| CV Storage works if file upload is part of the feature | ⚠️ **N/A** — the current implementation never retains the file; parsed content + ATS analysis persist. See §11. |
| projects persist | ✅ |
| project skills persist | ✅ |
| evidence persists | ✅ |
| evidence skills persist | ✅ |
| profile certifications persist | ✅ |
| profile languages persist | ✅ |
| profile links persist | ✅ |
| career identity persist | ✅ |
| saved roles persist | ✅ |
| job applications persist | ✅ |
| interview sessions persist | ✅ |
| frontend hydrates from backend | ✅ (15 domains) |
| backend-first mutations work | ✅ |
| localStorage is not authoritative | ✅ (5 keys are cache-only) |
| documents remain derived | ✅ (no table) |
| activity integration is correct | ✅ (after-mutation only) |
| ownership isolation passes | ✅ |
| IDOR tests pass | ✅ |
| reload persistence passes | ✅ |
| logout/login persistence passes | ✅ |
| server restart persistence passes | ✅ |
| Storage security passes if applicable | ⚠️ N/A — no bucket created |
| cleanup passes | ✅ (all tables 0, `auth.users` 0) |
| lint passes | ✅ |
| build passes | ✅ |
| audit passes | ✅ |
| tests pass or absence documented | ✅ documented — no test script exists |
| no secrets exposed | ✅ |
| no push | ✅ |
| no deploy | ✅ |

**B.3.7 STATUS: COMPLETE** — with the single documented non-applicable item (CV file retention), because the current implementation never reads the uploaded file back and no Storage bucket exists on the project.
