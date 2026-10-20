# B.3.7.1 — Core Persistence Hardening & Production Readiness

Phase: B.3.7.1 — IMPLEMENTATION.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Status: **COMPLETE** — every blocker from `B3_7_CORE_DOMAIN_PERSISTENCE_COMPLETION_REPORT.md` §19 is closed and verified live.

---

## 1. STATUS

**B.3.7.1 STATUS: COMPLETE**

| B.3.7 blocker | Resolution |
|---|---|
| 1. CV file retention | ✅ Private Storage bucket `cv-files` + 4 ownership policies; files uploaded, downloadable via short-lived signed URL, deleted with the CV; no orphans |
| 2. Roadmap persistence | ✅ Dedicated `/api/roadmap/*` endpoints; the roadmap tables are the source of truth; progress persists server-side |
| 3. No automated test suite | ✅ `npm test` → 27 tests, 27 pass; the runner starts and stops its own server, so no manually started server is needed (node:test + tsx, no new dependency) |
| 4. Profile depends on aggregate `/api/state` | ✅ Dedicated `GET /api/profile` + `PATCH /api/profile` |
| 5. Three unused `ActivityActionType` values | ✅ `completed_task` and `acquired_skill` wired to real events; `completed_course` removed from types, backend, UI and the DB CHECK |

---

## 2. CV Storage implementation

**Bucket** `cv-files` — `public = false`, `file_size_limit = 10 MB`, MIME allow-list (pdf, doc, docx, txt, json).

**Object path convention:** `{user_id}/{random-uuid}.{ext}`

- The first segment is the owner id, so a policy can compare it to `auth.uid()`.
- The file id is a **random UUID** (`randomUUID()`), never derived from the user id or a counter — paths cannot be guessed or enumerated.
- `server/db/cvStorage.ts` provides `uploadCvFile`, `createCvFileDownloadUrl` (5-minute signed URL), `deleteCvFile`, `listCvFiles`, `pathBelongsToUser`, `extensionForMimeType`.

**Upload flow** (`POST /api/resumes/upload`): the file is validated (MIME allow-list + size limit), stored, then a `cvs` row is created with `storage_path` set and marked active, and a `cv_versions` row holds the parsed CV (`profile_json`) and ATS analysis (`ats_analysis`). The pre-existing parse/analysis flow is unchanged.

**Download** (`GET /api/cvs/:id/file`): returns a short-lived signed URL — but only after the CV row is proven to belong to the caller. Another user's CV id yields **404**, never a URL.

**Deletion**: `DELETE /api/cvs/:id` reads the row first, deletes it (cascading its versions), then removes the stored object — so a deleted CV cannot leave an orphaned file.

## 3. Storage policies

Four policies on `storage.objects`, scoped to `bucket_id = 'cv-files'`, each checking `(storage.foldername(name))[1] = auth.uid()::text` via the helper function `public.storage_object_owner(text)`:

| Policy | Command | Effect |
|---|---|---|
| `cv_files_select_own` | SELECT | read only your own objects |
| `cv_files_insert_own` | INSERT | upload only into your own folder |
| `cv_files_update_own` | UPDATE | modify only your own objects |
| `cv_files_delete_own` | DELETE | remove only your own objects |

`to authenticated` on all four. The bucket is private, so an object is only reachable through an authenticated, policy-checked request.

## 4. Roadmap persistence

The roadmap tables are now authoritative. `server/db/roadmap.ts` loads the full tree (`roadmaps → roadmap_phases → roadmap_milestones → roadmap_tasks`) and derives progress from task status — there is still no separate progress table, by design.

**Ownership is proven by an explicit chain walk** (`taskBelongsToProfile`): task → milestone → phase → roadmap → `profile_id === caller`. A task that does not belong to the caller is not found, so mutations return 404.

**Endpoints** (all `requireAuth`, owner = verified JWT id):

| Method | Path |
|---|---|
| GET / POST | `/api/roadmap` |
| POST | `/api/roadmap/enroll` |
| PATCH | `/api/roadmap/tasks/:taskId` (status → progress) |
| POST | `/api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks` |
| DELETE | `/api/roadmap` |

**Frontend**: `src/lib/roadmapApi.ts` + hydration in `CareerContext` (roadmap + enrollment replaced by the server's copy), and `updateTaskStatus` / `enrollInRoadmap` are now backend-first — the server response replaces the local state.

## 5. Profile API

`GET /api/profile` and `PATCH /api/profile`, backed by `server/db/profile.ts` (`getProfileDto`, `updateProfileDto`).

- The DTO spans `public.profiles` **and** the extension tables (`profile_certifications`, `profile_languages`, `profile_links`, `profile_career_identity`).
- Strict validation: every field has a length bound; `userType` is checked against the DB's CHECK list; `null` is a valid "clear this field" value.
- Ownership: always `req.authUser.id` — a client-supplied id is never read.
- Frontend: `updateProfile` remains the local setter, but hydration now pulls the profile (including certifications, languages, links) from `GET /api/profile`, and the backend's copy wins.

## 6. Automated test suite

**`npm test`** → `node tests/runner.mjs`

No new dependency: Node 24's built-in `node:test` runner + the already-installed `tsx` (loaded through `--import`, so no `npx` and no PATH resolution).

The runner owns the entire lifecycle of a run — it starts and stops its own server, so **no manually started server is ever required**:

| Step | What the runner does |
|---|---|
| 1 | Loads the test environment: process env first, then the gitignored `.env.test`. A missing credential stops the run immediately with the variable names. |
| 2 | Sweeps anything an earlier, interrupted run left behind, so a run always starts from a clean slate. |
| 3 | Asks the OS for a free port and starts **exactly one** API server as a direct child process. |
| 4 | Polls `/api/health` until the server actually answers — the health endpoint is the contract the tests depend on. |
| 5 | Runs the test files with `node --test --test-concurrency=1`, each against that server. |
| 6 | Stops the server and waits until its port is released. |
| 7 | Removes everything the run created, then verifies the database is clean. |
| 8 | Exits non-zero if any test failed. |

| File | Covers |
|---|---|
| `tests/runner.mjs` | the whole run lifecycle: env → pre-sweep → server → tests → stop → cleanup → verification → exit code |
| `tests/env.mjs` | deterministic env loading from the process environment or `.env.test`; fails with a named list of missing variables |
| `tests/server-harness.mjs` | starts/stops the API server, waits for `/api/health`, refuses an occupied port, releases the port on teardown |
| `tests/cleanup.mjs` | removes test identities, profiles, domain rows, Storage objects and the catalogue rows the run created — always by exact identity, never a table-wide delete |
| `tests/helpers.ts` | isolated Supabase test identities (`cp-test-*@example.invalid`), row cleanup by explicit id, HTTP helper |
| `tests/auth.test.ts` | 401 for unauthenticated (19 routes) · 401 for invalid token (19 routes) · valid token accepted · malformed UUID → 400 · invalid enum → 400 (6) · missing field → 400 (10) · IDOR read/update/delete (404) · client-supplied user id does not change ownership |
| `tests/domains.test.ts` | CRUD + skill links for projects/evidence/certifications/languages/links/career-identity/saved-roles/applications/interviews · CV + version persistence with a real timestamp · CV file storage and ownership · CV deletion cascade (FK) · roadmap chain + server-side progress · roadmap IDOR · profile GET/PATCH persistence |
| `tests/persistence.test.ts` | data visible to a later session (project, roadmap, profile) |
| `tests/restart.test.ts` | project and roadmap progress survive a real server restart (process stopped, new process started) on its own port |

**Isolation:** the suite creates only identities whose email starts with `cp-test-` and deletes its own rows by primary key. It never truncates, never drops, and never touches a row it did not create.

**Windows-specific decisions:**

- The server is spawned as `node --import <file:// url to the tsx loader> server.ts` — a *direct* child of the runner. `npx tsx` and `node_modules/.bin/tsx` re-spawn a second Node process, which on Windows can outlive the kill signal and leave an orphaned server holding a port. The loader path is passed as a `file://` URL because Windows rejects a bare absolute path in `--import` (`Received protocol 'd:'`).
- The server runs with `NODE_ENV=production` so it serves the built app instead of booting the Vite dev server, which would add several seconds and open a second websocket port the API tests do not need.
- Ports are allocated by the OS at run time, so a development server, a stale process or a second concurrent run can never collide with the suite. The restart test is given a **second, separate** free port, so restarting it never collides with the shared server.

**Environment:** `.env.test` is gitignored and must never be committed; `.env.test.example` is the committed placeholder template; `.env.example` documents the three required variables. The credentials the suite uses must never be production credentials.


## 7. ActivityActionType resolution

| Value | Verdict | Action |
|---|---|---|
| `completed_task` | **Real event** — `updateTaskStatus` marks a roadmap task complete | Wired: `CareerContext` now logs `completed_task` when a task's status becomes `completed` (and the ActivityView "roadmap" filter now matches it) |
| `acquired_skill` | **Real event** — `addCustomSkill` | Wired: logs `acquired_skill` when a custom skill is added |
| `completed_course` | **Obsolete** — the learning centre only tracks *enrolment* (`toggleResourceEnrollment`); no code path completes a course | Removed cleanly from `src/types/career.ts`, `server/db/activities.ts`, `src/components/views/ActivityView.tsx` **and** the DB CHECK constraint |

The `roadmap_tasks.status` CHECK was also widened from 3 values to the 5 the UI actually offers (`not_started | in_progress | completed | skipped | blocked`) — the DB was narrower than the application type, so a status the RoadmapView picker allows would have been rejected.

## 8. Database changes

Two new migrations; no previous migration was modified.

| Migration | Change |
|---|---|
| `202510200004_cv_file_storage.sql` | Creates the private `cv-files` bucket + `public.storage_object_owner(text)` + 4 storage RLS policies |
| `202510200005_align_status_and_action_types.sql` | Widens `roadmap_tasks.status` CHECK to 5 values; removes `completed_course` from `activities.action_type` CHECK |

Both are additive/superset changes: every existing row stays valid, nothing is deleted.

## 9. Backend changes

**New modules:** `server/db/cvStorage.ts`, `server/db/roadmap.ts`, `server/db/profile.ts`.

**New routes in `server.ts`:** `GET/POST /api/roadmap`, `POST /api/roadmap/enroll`, `PATCH /api/roadmap/tasks/:taskId`, `POST /api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks`, `DELETE /api/roadmap`, `GET/PATCH /api/profile`, `GET /api/cvs/:id/file`.

**Modified:** `POST /api/resumes/upload` now stores the file and creates the `cvs` + `cv_versions` rows; `DELETE /api/cvs/:id` removes the stored file; `PORT` now reads `process.env.PORT` (so a test run never collides with a dev server).

## 10. Frontend changes

- `src/lib/roadmapApi.ts` — typed client for the roadmap + profile endpoints.
- `src/context/CareerContext.tsx` — roadmap and profile hydration from the backend (17 domains total now hydrate), `updateTaskStatus` and `enrollInRoadmap` are backend-first, `addCustomSkill` logs `acquired_skill`, `updateTaskStatus` logs `completed_task`.
- `src/components/views/ActivityView.tsx` — `completed_course` removed from the icon map and the roadmap filter.
- `src/types/career.ts` — `completed_course` removed from `ActivityActionType`.

## 11. API endpoints (this phase)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/roadmap` | required | the caller's roadmap tree + derived progress |
| POST | `/api/roadmap` | required | create a roadmap |
| POST | `/api/roadmap/enroll` | required | enrol in the roadmap |
| PATCH | `/api/roadmap/tasks/:taskId` | required | task status → persisted progress |
| POST | `/api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks` | required | add a task |
| DELETE | `/api/roadmap` | required | delete the roadmap |
| GET | `/api/profile` | required | profile + extensions |
| PATCH | `/api/profile` | required | update profile fields |
| GET | `/api/cvs/:id/file` | required | signed download URL for the caller's own file |

## 12. Security / IDOR results

| Test | Result |
|---|---|
| Unauthenticated on 19 protected routes | 401 ✅ |
| Invalid token on 19 protected routes | 401 ✅ |
| Malformed UUID (5 routes) | 400 ✅ |
| Invalid enum (6 cases) | 400 ✅ |
| Missing required field (10 routes) | 400 ✅ |
| B reads A's project | 404 + absent from B's list ✅ |
| B updates / deletes A's project | 404 ✅ |
| Client-supplied `userId`/`profileId` | ignored — the record belongs to A ✅ |
| B patches A's roadmap task | 404, A's task unchanged in the DB ✅ |
| B reads A's roadmap | null ✅ |
| B requests A's CV file | 404 — no URL issued ✅ |
| B adds a CV version to A's CV | 404 ✅ |

## 13. Persistence results

| Scenario | Result |
|---|---|
| Reload (fresh fetch) | ✅ all domains return the caller's own rows |
| Logout → login (brand-new token) | ✅ project, roadmap and profile all persist |
| Server restart (process killed, new process) | ✅ project and roadmap progress persist — asserted by `tests/restart.test.ts`, which really stops and restarts the server |

## 14. Storage verification

| Check | Result |
|---|---|
| Bucket `cv-files` exists and is private | ✅ `public = false` |
| Ownership policies | ✅ 4 policies, all `auth.uid()`-scoped |
| Objects after the test run | ✅ **0 — no orphaned CV files** |
| Uploaded file lands in the owner's folder | ✅ verified in `tests/domains.test.ts` |
| Another user can obtain the file | ✅ 404 (never a URL) |

## 15. Test results

`npm test`, run from a clean terminal with no server running beforehand:

```
ℹ tests 27
ℹ suites 9
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 90994.4179
```

The runner's own report:

```
[test] starting an isolated server on port <OS-allocated>
[test] server ready at http://127.0.0.1:<port>
… 27 passing …
[test] stopping the test server
[test] cleaning up the data this run created
[test] removed 2 catalogue skill row(s) created by this run
[test] .careerpilot_state.json is unchanged
[test] no test identities remain
[test] no orphaned storage objects remain
[test] PASS
```

**Behaviour verified explicitly:**

| Check | Result |
|---|---|
| `npm test` from a clean terminal, no server running | ✅ 27/27 pass, exit 0 |
| No manually started server required | ✅ the runner starts and stops its own |
| Exit code on a failing test | ✅ exit 1 (verified with a deliberately failing test, which was then removed) |
| Cleanup after a **failing** run | ✅ the sweep still runs; the database ends clean |
| Missing credential | ✅ stops immediately with the three variable names, exit 1 |
| Isolation from a running dev server | ✅ a server on port 3000 did not affect the run |
| Server termination | ✅ the server is a direct child; it does not survive the runner, even on a hard kill |
| Ports | ✅ released after the run; no leftover listener |
| Background Node processes | ✅ none remain |

## 16. Lint / build results

| Command | Result |
|---|---|
| `npm run lint` | **PASS** (`tsc --noEmit`, no errors) |
| `npm run build` | **PASS** (`✓ built in 395ms`) |
| `npm audit` | **PASS** (0 vulnerabilities) |
| `npm test` | **PASS** (27/27) |

## 17. Remaining blockers

1. **Frontend profile-form writes** still go through `updateProfile` (local) + the aggregate `POST /api/state` sync. The data does reach PostgreSQL and `GET /api/profile` is authoritative, but a dedicated `PATCH /api/profile` call from the form would be the next step. The endpoint now exists and is tested; only the wiring in `ProfileView` is pending.
2. **The aggregate `/api/state` still carries `roadmapPhases`.** The roadmap is now authoritative in its own tables and hydrates from them, but the aggregate payload still includes the field. Removing it from the aggregate would be a follow-up cleanup, not a correctness problem (the dedicated endpoints win on hydration).
3. **CI runs the suite but needs project secrets.** `.github/workflows/ci.yml` runs `npm test`, `npm run lint`, `npm run build` and `npm audit --audit-level=high` on Node 24. The test step passes `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from repository secrets; until those secrets are configured on the repository the test step fails with the loader's "missing required Supabase credentials" message rather than skipping.
4. **The test suite needs the Supabase credentials in the environment.** `npm test` requires `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. A `.env.test` loader now exists (`tests/env.mjs`): the runner reads the gitignored `.env.test` from the repository root, falls back to the process environment, and stops with a clear message naming any missing variable. The remaining requirement is that the operator supplies a `.env.test` (or exports the variables) — the values themselves can never be committed.
5. **CV file retention is now real**, but the file is still parsed from the multer buffer and the *parsed* text is not stored separately from `cv_versions.profile_json`.

## 18. Modified files

**New (this phase):**
- `supabase/migrations/202510200004_cv_file_storage.sql`
- `supabase/migrations/202510200005_align_status_and_action_types.sql`
- `server/db/cvStorage.ts`, `server/db/roadmap.ts`, `server/db/profile.ts`
- `src/lib/roadmapApi.ts`
- `tests/helpers.ts`, `tests/auth.test.ts`, `tests/domains.test.ts`, `tests/persistence.test.ts`, `tests/restart.test.ts`
- `B3_7_1_CORE_PERSISTENCE_HARDENING_REPORT.md`

**New (test-infrastructure pass — B.3.7.1 close-out):**
- `tests/runner.mjs` — the test runner that owns the server lifecycle
- `tests/env.mjs` — deterministic `.env.test` loader with a clear failure on a missing credential
- `tests/server-harness.mjs` — server start/stop, health wait, port release
- `tests/cleanup.mjs` — the test-data sweep
- `.env.test.example` — the committed credential template (placeholders only)

**Removed (test-infrastructure pass):** `tests/runner.js` (used `require()` in an ESM package and recursed into `npm run test`), `tests/global-setup.ts` (`node --test-global-setup` mechanism, replaced by the runner), `tests/test-env.ts` (superseded by `tests/env.mjs`), `tests/server-harness.ts` (superseded by `tests/server-harness.mjs`).

**Modified (test-infrastructure pass):** `package.json` — the `test` script now points at `tests/runner.mjs`; `.env.example` — documents the three test variables; `.gitignore` — tracks `.env.test.example` while still ignoring `.env.test` and `supabase/.temp/`; `tests/helpers.ts`, `tests/restart.test.ts` — use the new modules.

**Modified (earlier phases, unchanged here):** `package-lock.json`, `tsconfig.json`, `src/components/auth/AuthModal.tsx`, `src/components/views/{ApplicationsView,DocumentsView,InterviewsView,JobsView,SettingsView}.tsx`

**Modified (this phase):**
- `server.ts` — storage in the upload flow, CV file download route, CV delete cascade, 9 roadmap/profile routes, `PORT` from env
- `src/context/CareerContext.tsx` — roadmap + profile hydration, backend-first roadmap mutators, two new activity events
- `src/components/views/ActivityView.tsx` — `completed_course` removed
- `src/types/career.ts` — `completed_course` removed
- `package.json` — `test` and `test:watch` scripts

**Modified (earlier phases, unchanged here):** `.env.example`, `package-lock.json`, `tsconfig.json`, `src/components/auth/AuthModal.tsx`, `src/components/views/{ApplicationsView,DocumentsView,InterviewsView,JobsView,SettingsView}.tsx`

## 19. Git status

- **Branch**: `audit/before-supabase-migration` @ `8666da4`
- **Working tree**: modified application files, plus untracked `server/`, `src/lib/`, `supabase/`, `tests/`, `.github/` and the report files
- **No commit, no push, no remote change.**

**Secret check (test-infrastructure pass):**

| Path | Git state |
|---|---|
| `.env` | ignored (`.env*`) |
| `.env.test` | **ignored** (`.env.test`) — holds the real credentials, never committed |
| `.env.test.example` | tracked — placeholders only (`https://<project-ref>.supabase.co`, `<publishable or anon key>`, `<service role key>`); verified to contain no JWT-shaped string |
| `.env.example` | tracked — application variables plus a documented block for the three required test variables |
| `supabase/.temp/` | ignored — local CLI state (project ref, password-less pooler URL), machine specific |

The real test credentials live only in the gitignored `.env.test` on the machine running the suite.

## 20. Migration history

```
202510200001  domain_schema
202510200002  broken_domains_persistence
202510200003  core_domain_completion
202510200004  cv_file_storage
202510200005  align_status_and_action_types
```

Exactly the five migrations applied in order. `supabase migration repair` was never used; no migration record was edited or deleted.

## 21. Test-infrastructure result (close-out)

The one remaining B.3.7.1 issue was that `npm test` could not start or stop its own server. It is now closed.

**What was broken**

| Defect | Effect |
|---|---|
| `tests/runner.js` used `require()` in a `"type": "module"` package | `npm test` died immediately with `ReferenceError: require is not defined in ES module scope` |
| `tests/runner.js` then spawned `npm run test` | unbounded recursion even after the `require` was fixed |
| `tests/global-setup.ts` relied on `node --test-global-setup` | the setup ran in a child process that exited when setup finished, so the server it spawned was detached and orphaned — it survived the run and kept holding its port |
| The server was spawned through `npx` / the `tsx` CLI | a wrapper process that on Windows can outlive the kill signal |
| `TEST_API_PORT` was hard-coded to `3111` | a stale server, a dev server or a second concurrent run collided with the suite |
| No `.env.test` loader | a missing credential surfaced as a confusing auth error deep inside a test |
| The teardown deleted only `profiles` + the auth row | Storage objects and the `user_preferences` row survived; the shared `skills` catalogue rows the suite created survived |
| 6 orphaned `cp-test-*` identities, 6 profiles, 6 `user_preferences` rows and 1 orphaned Storage folder | left in the live project by the earlier manual runs |

**What replaced it**

```
npm test
  ↓
tests/runner.mjs                    load env → pre-sweep → allocate ports
  ↓
tests/server-harness.mjs            spawn ONE server (direct child) → poll /api/health
  ↓
node --test --test-concurrency=1    run the four suites against it
  ↓
tests/server-harness.mjs            stop the server → wait for the port
  ↓
tests/cleanup.mjs                   remove identities, rows, Storage objects, catalogue rows
  ↓
verification                        state file unchanged · no identities · no orphans
  ↓
exit code                           0 on success, non-zero on any failure
```

**The requirements, one by one**

| # | Requirement | How it is met |
|---|---|---|
| 1 | Load the required test environment safely | `tests/env.mjs`: process env first, then the gitignored `.env.test`; missing variables stop the run with their names |
| 2 | Start exactly ONE isolated test server | The runner starts one server on an OS-allocated port and passes it to every suite |
| 3 | Wait until `/api/health` is ready | `waitForServer` polls the endpoint until it answers `200` — not a sleep, not a log line |
| 4 | Run all suites against that server | All four files receive `TEST_API_BASE_URL` |
| 5 | Support the restart test without port collisions | The restart test gets a **second** OS-allocated port, freed and re-allocated on each restart |
| 6 | Stop the server after completion | The server is a direct child; the runner stops it in a `finally` block and waits for the port to be released |
| 7 | Clean all test-created users, profiles, domain rows and Storage objects | `tests/cleanup.mjs`, swept before and after the run |
| 8 | Exit non-zero if any test fails | The runner propagates the test runner's exit code (verified: exit 1 with a deliberately failing test) |
| 9 | Never depend on a manually running server | The runner owns the server's whole lifecycle |
| 10 | Never touch production/user data | Only `cp-test-*` identities and rows by explicit id are removed; the `skills` catalogue is swept by a before/after id diff, so a skill that already existed is never touched; `.careerpilot_state.json` is verified byte-unchanged (or, on a fresh checkout, verified to hold only the server's own bootstrap data and then removed again) |

**Deterministic configuration**

- `.env.test` is **gitignored**; `.env.test.example` is the committed placeholder template; `.env.example` documents the three required variables.
- The required variables are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. A missing one stops the run immediately with a message naming it.
- The test credentials must never be production credentials; the service-role key grants full access to the database.

## 22. Test-data cleanup verification
After the final test run, every table the suite touches was re-counted directly:

| Table | Rows |
|---|---|
| `auth.users` | 0 |
| `public.profiles` | 0 |
| `public.skills` / `user_skills` / `project_skills` / `evidence_skills` | 0 |
| `public.projects` / `evidence_items` | 0 |
| `public.cvs` / `cv_versions` | 0 |
| `public.roadmaps` / `roadmap_phases` / `roadmap_milestones` / `roadmap_tasks` | 0 |
| `public.job_applications` / `interview_sessions` / `activities` | 0 |
| `public.secondary_goals` / `career_milestones` / `cover_letters` | 0 |
| `public.profile_certifications` / `profile_languages` / `profile_links` | 0 |
| `storage.objects` (`cv-files`) | **0 — no orphaned files** |

The runner's own sweep runs at the **start** of a run (so a run interrupted earlier never accumulates test accounts) and again at the **end** (so the run cleans up after itself even when a test failed). It removes the storage objects of every test user first — Storage has no cascade, so an object would otherwise outlive its owner — then the `user_preferences` row, the domain rows, the profile and finally the auth identity, which lets the database cascade take the remaining profile-scoped rows. The shared `skills` catalogue has no owner and no cascade, so the runner snapshots it before the run and removes only the rows that are new afterwards — a skill that already existed for a real user is never touched.

The end-of-run verification is explicit: the runner re-reads the auth user list and the bucket listing and fails the run if any test identity or orphaned folder remains.

`.careerpilot_state.json` is unchanged (`users: ['user-default-1']`, `userStates: ['user-default-1']`); the runner compares the file byte-for-byte before and after the run and fails if it changed.

Two cases are handled, because they are genuinely different:

- **The file existed before the run** → it must be byte-identical afterwards. Any change fails the run.
- **The file did not exist before the run** (a fresh checkout) → `server.ts` writes it during its own bootstrap, seeding the single default account. That is normal server startup, not test contamination. The runner checks that the new file contains *only* what the bootstrap creates (`users: ['user-default-1']`, no unexpected user state), then removes it again so the checkout is left exactly as it was found.

The second case was found by running the suite from a pristine clone of the commit: the first version of the check treated "the file appeared" as contamination and failed the run — which would also have failed the committed CI workflow, where the checkout has no state file. The check still fails, with a clear message, when the suite genuinely writes to the file (verified with a deliberate contamination probe).

**Independently re-verified after the final run** (direct reads against the live project, not the runner's own report):

| Table | Rows |
|---|---|
| `auth.users` | 0 |
| `public.profiles` | 0 |
| `public.user_preferences` | 0 |
| `public.skills` / `user_skills` / `project_skills` / `evidence_skills` | 0 |
| `public.projects` / `evidence_items` | 0 |
| `public.cvs` / `cv_versions` | 0 |
| `public.roadmaps` / `roadmap_phases` / `roadmap_milestones` / `roadmap_tasks` | 0 |
| `public.job_applications` / `interview_sessions` / `activities` | 0 |
| `public.secondary_goals` / `career_milestones` / `cover_letters` | 0 |
| `public.profile_certifications` / `profile_languages` / `profile_links` | 0 |
| `storage.objects` (`cv-files`) | **0 — no orphaned files** |

## 23. Confirmation

```
NO PUSH
NO DEPLOY
NO DESTRUCTIVE USER-DATA OPERATION
NO MIGRATION REPAIR
```

- **NO PUSH** — no `git push`, no remote configured, branch unchanged at `8666da4`, nothing committed.
- **NO DEPLOY** — no Cloudflare change, no GitHub change, nothing published.
- **NO DESTRUCTIVE USER-DATA OPERATION** — the only DDL is `CREATE`/`ALTER`/`DROP CONSTRAINT` (constraint replacement, no table or column drops) and policy creation. No `DROP TABLE`, `TRUNCATE` or `DELETE` against user data. The only deletes were of rows the suite itself created, by explicit id: the `cp-test-*` identities, their profile-scoped rows, their Storage objects, and the `skills` catalogue rows the run created (identified by a before/after id diff, so a pre-existing skill is never touched). The 6 orphaned `cp-test-*` identities, 6 profiles and 6 `user_preferences` rows left behind by the earlier manual runs were removed the same way, as was the 1 orphaned Storage folder they had left. `.careerpilot_state.json` is byte-unchanged.
- **NO MIGRATION REPAIR** — `supabase migration repair` was never run; `supabase_migrations.schema_migrations` contains exactly the five applied migrations, in order, with no edited or deleted records.

---

**B.3.7.1 STATUS: COMPLETE** — all five B.3.7 blockers closed, 27/27 automated tests passing automatically from a clean terminal (the runner starts and stops its own server), storage with zero orphans, and no push, deploy, destructive data operation or migration repair.
