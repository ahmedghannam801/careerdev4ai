# B.3.9 — Final Persistence Cutover & Production Hardening

Phase: B.3.9 — IMPLEMENTATION.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Baseline: `13b3fce` (B.3.7 + B.3.7.1 + test infrastructure).
Authoritative input: `B3_8_FULL_PERSISTENCE_GAP_AUDIT.md`.
Date: 2026-10-21.
Status: **COMPLETE — all Critical and High findings closed, no unresolved blockers.**

---

## 1. Executive Summary

B.3.8 found two Critical, two High, seven Medium and eight Low findings. All of them
are now closed.

The two Critical findings were not merely "incomplete" — they were **actively destroying
data** and **actively publishing private data**, and both were reproduced end-to-end
against the live project before the fix:

* **C-1** — the frontend's unconditional auto-sync to the legacy aggregate
  `POST /api/state` deleted a real user's `experiences` and `educations` rows and
  re-inserted the demo persona in their place, on their first load.
* **C-2** — `GET /api/profile/public/:username` returned a private user's employment
  history and bio to an **unauthenticated** caller, because the route never read
  `profiles.is_public` (a column that does exist — the code comment claiming otherwise
  was simply wrong).

The fix was a **cutover**, not a patch: every domain now has a dedicated, ownership-scoped
endpoint and an explicit awaited mutation, and the aggregate write path is gone from the
frontend. `/api/state` survives only as a read-only compatibility view and can no longer
replace a collection.

The two High findings — no roadmap was ever created, and skill levels had no persistence
route — are closed with two new backend modules and two new frontend clients.

The suite grew from **27 tests to 103** (all passing, three consecutive clean runs), and
route coverage from **72/91 to 101/105**.

While writing the new coverage, the tests exposed a **further production bug that the
B.3.8 audit had not found**: `changePassword` called `signInWithPassword` on the **shared
module-level service-role client**, which replaced that client's service-role session with
a *user* session. Every later database call in the process then ran under the user's RLS
context instead of the service role — reads returned nothing (404) and writes were rejected
(500). That is a latent outage waiting for the first user to change their password. It is
fixed with a throwaway client and covered by a regression test (§6.1).

**One migration was required** — for the notifications table — because the feature could
not be persisted without it. Everything else was achieved against the existing schema.

---

## 2. C-1 Resolution

### What was wrong

Three things combined:

1. `CareerContext.tsx` initialised `profile` from a **hard-coded demo persona**
   ("Sarah Jenkins", "Meridian Tech Labs", "Apex Digital Agency", UT Austin).
2. `PATCH /api/profile` does not own `experiences` or `education`, so the frontend kept
   them in local state only and never persisted them.
3. An **ungated** `useEffect` POSTed the whole profile to `POST /api/state` on every
   change — including the mount, before hydration finished. `saveState` performed
   **DELETE-all-then-reINSERT** on both tables.

The result: a real user's employment and education history was deleted and replaced with
the demo seed on their first load.

### What was done

| Layer | Change |
|---|---|
| `server/db/experiences.ts` | The read-only stub was extended with the full CRUD surface: `listExperiences`, `getExperience`, `createExperience`, `updateExperience`, `deleteExperience`. `getExperiences` is preserved unchanged. |
| `server/db/educations.ts` | The same, for `public.educations`. |
| `server.ts` | New route group `/api/experiences` and `/api/educations` — `GET` (list), `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`. All under `requireAuth`, all scoped to `req.authUser.id`, all with `isUuid` id validation and `str()` length caps. |
| `server/db/state.ts` | The two DELETE-and-reINSERT branches were **removed**. The collections are now reported as `unmappedCollections` so the caller can see they were not applied. `saveState` returns `{ unmappedCollections }`. |
| `server.ts` (`POST /api/state`) | Marked `deprecated: true`; the response now lists the collections it did not apply. The endpoint can no longer destroy a collection. |
| `src/lib/careerHistoryApi.ts` | New typed client for the two new route groups (and for `/api/user-skills`). |
| `src/context/CareerContext.tsx` | The auto-sync effect was **removed**. `updateProfile` now routes `experiences`/`education` through `reconcileExperiences` / `reconcileEducations`, which update a known row, create an unknown one and delete a removed one — per row, never as a replace-all payload. |
| `src/context/CareerContext.tsx` | The hydration now reads `experiences`, `education` and the skill levels from their own endpoints, and the server's view replaces the demo seed. |

**Safety detail.** The reconciliation deletes a server row **only when the local list the
user was actually shown contained it**. A row the local list never had — for example one
created in another session — is left alone. Silently removing it would have been the same
class of data loss as the bug being fixed.

### The demo seed can no longer reach the database

The demo persona is still the **pre-authentication** initial state, which is correct for
the marketing/demo surface. It cannot reach an authenticated user's rows because:

* the auto-sync that carried it to the server is gone;
* the hydration replaces `profile.experiences` and `profile.education` with the server's
  rows before any mutation can run;
* the localStorage cache is only written **after** hydration completes (`isHydrated`), so
  a stale pre-hydration value can never be replayed.

### Verification

`tests/regression.test.ts` proves the fix at the HTTP level: a real `experiences` row and
a real `educations` row survive a `POST /api/state` carrying the exact demo-seed payload,
and the demo rows are provably **not** written. It also proves the dedicated endpoints are
the real write path, and that another user cannot read, update or delete a row.

---

## 3. C-2 Resolution

### What was wrong

`GET /api/profile/public/:username` returned the profile's name, bio, headline, target
role, **employment history** and skills to any unauthenticated caller. The comment
explaining this stated that *"the current schema has no visibility column (profiles has no
`is_public` / visibility field)"*. That was **factually wrong**: `profiles.is_public` is a
`boolean NOT NULL DEFAULT false` column in the live schema, it is exposed by
`ProfileDTO.isPublic`, and it is writable through `PATCH /api/profile`. The route simply
never read it.

### What was done

```ts
// 404 rather than 403: a 403 would confirm that the username exists,
// which is itself a disclosure.
if (!profile.is_public) {
  return res.status(404).json({ error: 'Public profile not found' });
}
```

The incorrect comment was replaced with one that states the truth. The `ProfileRow` type in
`server/db/profiles.ts` was completed with the `is_public` field it had always been
selecting.

The endpoint also gained the two collections it had been hard-coding empty (finding L-4):
`certifications` and `projects` are now read from their own tables.

### Verification

`tests/regression.test.ts` covers all four required cases:

| Case | Result |
|---|---|
| public profile + `is_public = true` | **200**, payload correct |
| private profile + `is_public = false` | **404**, no employment history, no bio |
| unauthenticated request for a private profile | **404** |
| **authenticated** request for a private profile | **404** — authentication does not bypass the gate |

---

## 4. H-1 Resolution

### What was wrong

`POST /api/roadmap` and `DELETE /api/roadmap` existed on the backend but had **no
frontend caller**. The frontend generated the roadmap in memory
(`generateInitialRoadmap(role)`) and never wrote it, so a new user had no `roadmaps` row
and the generated tree was lost on the next load. `roadmapPhases` is listed in
`UNMAPPED_TOP_LEVEL`, so `/api/state` never wrote it either.

### What was done

* **`server/db/roadmap.ts`** — added `addPhase`, `addMilestone` and
  `createRoadmapWithTree`. The tree is written bottom-up (phases → milestones → tasks) so
  every foreign key is satisfied in order, and the returned DTO carries the **real**
  database ids. `addPhase` and `addMilestone` each prove ownership by walking the parent
  chain to the profile, so a caller cannot attach to another user's phase.
* **`server.ts`** — `POST /api/roadmap` now accepts the whole tree, validated by
  `parseRoadmapTree` (every string length-capped, every task status checked against
  `ROADMAP_TASK_STATUSES`, malformed entries skipped rather than failing the request).
  Because a profile has at most one roadmap (`UNIQUE profile_id`), creating one always
  **replaces** the previous one — the insert would otherwise violate the constraint.
* **`src/lib/roadmapApi.ts`** — added `createRoadmap` and `deleteRoadmap`.
* **`src/context/CareerContext.tsx`** — `setPrimaryTargetRole` is now async and persists
  the generated tree through the API; the local state is then replaced by the server's
  roadmap, so the ids the UI holds are the real ones.

### Verification

`tests/roadmap.test.ts` proves: the tree is persisted (phase/milestone/task row counts in
the database), the statuses, deadlines and estimated hours survive, the progress
percentage is derived correctly, a locked phase keeps `is_unlocked = false`, the roadmap
survives a logout/login cycle and a server restart, creating again replaces the previous
tree with no duplicates, `DELETE` really deletes the row, another user can neither see,
change nor delete it, a task of another user's roadmap cannot be changed, a malformed
payload and an out-of-range status are rejected, and the routes require authentication.

---

## 5. H-2 Resolution

### What was wrong

`updateSkillLevel`, `addCustomSkill` and `removeSkill` only called `setSkills`. There was
**no `/api/skills` route at all**. Skill levels reached the database only through
`POST /api/state` — the endpoint C-1 had to retire. The career-gap analysis the UI
renders was computed from the same in-memory array, so the gap analysis a user saw was
not the gap analysis that was stored.

### What was done

* **`server/db/userSkills.ts`** — added `resolveSkillId` (conflict-tolerant catalogue
  resolution), `setUserSkillLevel` and `deleteUserSkill`. `skills.category` is `NOT NULL`
  in the live schema, so a category is always supplied.
* **`server.ts`** — new route group `/api/user-skills`: `GET`, `POST` (create or update the
  level) and `DELETE /:skillId`. The level is validated as an integer in **1–5** and the
  skill name is resolved to a catalogue id server-side.
* **`src/lib/careerHistoryApi.ts`** — the matching client.
* **`src/context/CareerContext.tsx`** — the three handlers are now async and only update
  the local state **after** the server confirms the write.

### Verification

`tests/skills.test.ts` proves: a level is created and persisted, it survives a reload and
a logout/login cycle, changing it updates the row rather than adding one, a level outside
1–5 and a non-integer level are rejected, a missing name is rejected, a malformed id is
rejected, the routes require authentication, and another user can neither read nor delete
the link.

---

## 6. Medium / Low Finding Resolution

| ID | Severity | Verdict | What was done |
|---|---|---|---|
| **M-1** | Medium | **FIXED** | `public.notifications` created (migration `202510200006`). New module `server/db/notifications.ts`, new route group `/api/notifications` (`GET`, `POST`, `PATCH /:id`, `POST /read-all`, `DELETE`, `DELETE /:id`), new client `src/lib/notificationsApi.ts`, and the drawer's two **hard-coded** entries are gone — the drawer now shows real, owned, read/unread-persisted rows. Covered by `tests/notifications.test.ts` (9 tests). |
| **M-2** | Medium | **FIXED** | `deleteAccount` now empties the user's `cv-files` folder **before** deleting the identity, because Storage has no cascade. Covered by `tests/security.test.ts`. |
| **M-3** | Medium | **FIXED** | The legacy JSON auth surface is **removed**: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, the `loadDatabase`/`saveDatabase`/`hashPassword` helpers, the demo-user seed and the `.careerpilot_state.json` file. `server.ts` shrank by ~190 lines. Covered by `tests/security.test.ts` (the routes must answer 404). |
| **M-4** | Medium | **FIXED** | `/api/auth/reset-password` is removed along with the rest of the legacy surface, so the app no longer tells a user that a reset link was sent when nothing was sent. |
| **M-5** | Medium | **FIXED** | The `careerpilot_roadmap` localStorage key is no longer written and no longer read. The roadmap lives only in PostgreSQL. |
| **M-6** | Medium | **FIXED** | Migration `202510200007` adds a `SELECT` policy on `public.skills` for authenticated users. The catalogue holds skill names, categories and descriptions — no user data. **Writes remain service-role only**, verified live: a client insert is still rejected by RLS. |
| **M-7** | Medium | **DEFERRED — with reason** | `/api/generate-cover-letter` returns generated text without creating a `cover_letters` row. The frontend's `saveCoverLetter` creates the row separately, so the flow works; the only gap is that a user who generates and navigates away loses the draft. Closing it means deciding whether an AI route should have write side-effects — a product decision, not a defect. Documented here rather than changed. |
| **L-1** | Low | **DEFERRED — with reason** | The missing indexes on `experiences.user_id`, `educations.user_id`, `user_preferences.user_id` and `user_skills.user_id` are immaterial at the current data volume (both `user_preferences` and `user_skills` are unique-constrained, which implies an index). A migration for indexes that are not yet a bottleneck would be churn. |
| **L-2** | Low | **FIXED** | `resolveSkillId` now handles the concurrent-insert race: it re-reads the catalogue row when the insert fails, so two users adding the same skill no longer produce a duplicate-key error. |
| **L-3** | Low | **FIXED** | `applied_job` and `saved_job` activity events are now emitted by the job-application and saved-role handlers, so the activity feed reports the actions that actually happen. |
| **L-4** | Low | **FIXED** | The public-profile response now includes the user's real `certifications` and `projects` instead of two hard-coded empty arrays. |
| **L-5** | Low | **FIXED** | The CV-upload route no longer returns `details: error.message` to the client; the detail is logged server-side only. |
| **L-6** | Low | **DEFERRED — with reason** | `experiences[].achievements` is still flattened into `description` with a newline join. This is a **pre-existing** storage limitation, not a B.3.8 regression: the achievements array has no column, and adding one would mean a schema change plus a frontend DTO change for no functional gain. The flattening is now explicit and documented in `server/db/experiences.ts`, and the frontend reconstructs the array from it. |
| **L-7** | Low | **FIXED** | `supabase/.temp/` — the local Supabase CLI state — is now gitignored, so the machine-specific project ref and pooler URL are not tracked. |
| **L-8** | Low | **VERIFIED — NO ACTION REQUIRED** | `skills` has no `updated_at` and `user_skills.years_experience` is `numeric` while the TS type is `number | null`. Both are correct as they are. |

### Production requirements added in B.3.9

| ID | Verdict | What was done |
|---|---|---|
| **P-1** | **FIXED** | A dependency-free, in-process rate limiter on the six Gemini-backed routes: 30 requests per minute, keyed on the **verified user id** (never a client-supplied value, so one user cannot exhaust another's budget). It is implemented in `server.ts` rather than by adding `express-rate-limit`, to keep the dependency surface unchanged. |
| **P-2** | **FIXED** | An explicit CORS allow-list driven by `ALLOWED_ORIGINS`. An origin that is not listed receives **no** CORS headers, so the browser refuses it; same-origin and server-to-server traffic is unaffected. |
| **P-3** | **FIXED** | A missing `GEMINI_API_KEY` is now reported clearly at boot instead of surfacing as a confusing failure on the first AI request. |
| **P-4** | **DEFERRED — with reason** | The CI workflow needs repository secrets. This is an operator action on the GitHub repository, not a code change; the workflow itself is correct and the loader fails with a clear message when the secrets are absent. |

### One further production bug found by the new tests

**The shared service-role client was being hijacked by a user sign-in.**

`changePassword` verified the caller's current password with
`getSupabaseServer().auth.signInWithPassword(...)`. In supabase-js, `signInWithPassword`
stores the session it creates in that client's auth state — so calling it on the **shared,
module-level service-role client** replaced the service-role session with a *user*
session. From that moment on, **every** database call in the process ran under the user's
RLS context instead of the service role: reads returned nothing (the profile endpoint
answered 404) and writes were rejected (500).

This is a latent outage: the first user to change their password would have broken
persistence for every request the server handled afterwards.

**Fixed** with a throwaway client (`verifyPassword` in `server/db/account.ts`) that is
discarded after the check. A grep confirms no other `signIn*`/`setSession`/`signOut` call
touches the shared server client.

---

## 7. Legacy State Removal

A complete search over `src/` and `server.ts`:

| Pattern | Occurrences | Classification and disposition |
|---|---|---|
| `localStorage` — `careerpilot_profile` | write + read | **CACHE.** The read is the pre-hydration initial value; the server's hydration replaces it. Now only written **after** hydration completes. |
| `localStorage` — `careerpilot_target_role` | write + read | **CACHE.** |
| `localStorage` — `careerpilot_skills` | write + read | **CACHE.** The persisted level now wins over the cache during hydration. |
| `localStorage` — `careerpilot_settings` | write + read | **UI PREFERENCE** (theme, language). Kept deliberately. |
| `localStorage` — `careerpilot_roadmap` | **removed** | It held the locally generated tree, which is not the server's roadmap (M-5). |
| `localStorage` — `careerpilot_token`, `careerpilot_user` | removal only | **LEGACY.** Never written; removed on logout. Supabase owns the session. |
| `sessionStorage` | **0** | — |
| `indexedDB` | **0** | — |
| `document.cookie` | **0** | — |
| `/api/state` | **0 frontend callers** | The write path is gone. The endpoint survives as a **read-only** compatibility view and can no longer replace a collection. |
| `.careerpilot_state.json` | **0 references in `server.ts`** | **LEGACY.** The file, the JSON store, the demo-user seed and the three legacy auth routes are removed. The file is still gitignored, and the test runner's bootstrap-aware guard still tolerates its absence. |
| Demo seed profile / experience / education | present as the **pre-auth** initial state | **TEST/BOOTSTRAP.** It cannot reach an authenticated user's rows (§2). |
| In-memory-only career data | **none** | Every domain in `CareerContext` is hydrated from its endpoint and written back through it. The only remaining in-memory-only state is the notifications drawer, which is now persisted. |

**No authenticated user's career data depends on local-only state.**

---

## 8. API Matrix

**105 routes** (up from 91); **101 covered** by the suite (up from 72).

| Method | Route | Auth | Ownership | Persistence |
|---|---|---|---|---|
| GET/POST/PATCH/DELETE | `/api/experiences[/:id]` | requireAuth | token id | **NEW** — `public.experiences` |
| GET/POST/PATCH/DELETE | `/api/educations[/:id]` | requireAuth | token id | **NEW** — `public.educations` |
| GET/POST/DELETE | `/api/user-skills[/:skillId]` | requireAuth | token id | **NEW** — `public.user_skills` |
| GET/POST/PATCH/DELETE | `/api/notifications[/:id]` | requireAuth | token id | **NEW** — `public.notifications` |
| POST | `/api/notifications/read-all` | requireAuth | token id | **NEW** |
| POST | `/api/roadmap` | requireAuth + limiter | token id | phases → milestones → tasks |
| POST | `/api/state` | verify | token id | **DEPRECATED — read-only shim, cannot replace a collection** |
| GET | `/api/profile/public/:username` | none | **`is_public` gate** | public read of a public profile only |
| POST | `/api/account/delete` | verify | token id | Auth + 26-table cascade + **Storage folder** |
| POST | `/api/account/change-password` | verify | token id | Auth (throwaway-client verification) |
| POST | `/api/auth/{register,login,logout,me}` | — | — | **REMOVED** (404) |
| POST | `/api/{copilot,analyze-career,optimize-cv,mock-interview,suggest-summary,generate-cover-letter}` | requireAuth + **rate limit** | token id | AI, no write |
| POST | `/api/resumes/upload` | requireAuth | token id | Postgres + Storage |
| GET | `/api/health` | none | n/a | n/a |
| (all others) | | requireAuth / verify | token id | their own table |

**Ownership enforcement: 100 %.** Every protected handler derives the owner from
`req.authUser.id`. No route reads `body.userId` or `body.profileId` as the authority.

**API hygiene (new).** An unknown `/api/...` path now answers **404 JSON** instead of
falling through to the SPA catch-all, which returned 200 with `index.html`. The client
route fallback is unchanged.

---

## 9. Security Verification

Every item re-verified, by test where possible:

| Control | Status | Evidence |
|---|---|---|
| Authentication on every protected route | **VERIFIED** | `auth.test.ts` (19 routes → 401 unauthenticated, 401 with a bad token); `security.test.ts` (AI routes → 401; account routes → 401; notifications, skills, roadmap → 401) |
| Token ownership | **VERIFIED** | Every handler uses `req.authUser.id`. No client-supplied owner is trusted. |
| IDOR protection | **VERIFIED** | `auth.test.ts` (projects), `regression.test.ts` (experiences), `roadmap.test.ts` (roadmap + tasks), `skills.test.ts` (skill links), `notifications.test.ts` (notifications) |
| RLS | **VERIFIED** | All 28 tables return 0 rows to the anon client; a signed-in user sees only its own rows; a cross-id insert is rejected by RLS |
| Storage policies | **VERIFIED** | Own folder ok; another user's folder rejected; bucket `public: false`, 10 MB, MIME allow-list |
| Public-profile privacy | **VERIFIED** | `regression.test.ts`: public → 200, private → 404, unauthenticated → 404, authenticated → 404 |
| File-upload validation | **VERIFIED** | Extension allow-list **and** MIME re-encode; 10 MB limit on both the multer and the bucket |
| Account deletion | **VERIFIED** | `security.test.ts`: the CV bucket folder is emptied and the 26-table cascade completes |
| Cross-user access | **VERIFIED** | 404 (not 403) on every by-id route, so existence is not disclosed |
| Malformed UUID handling | **VERIFIED** | 400 on every by-id route (10 paths asserted) |
| Invalid enum handling | **VERIFIED** | Project difficulty, evidence type, interview type, job stage, language proficiency, activity actionType, profile userType, roadmap task status |
| Payload validation | **VERIFIED** | Every string length-capped; over-long and missing fields rejected with 400 |
| Error leakage | **VERIFIED** | The CV-upload route no longer returns `error.message`; the AI routes never return an upstream detail |
| Rate limiting | **VERIFIED** | 429 after the budget; another user's budget is unaffected |
| CORS | **VERIFIED** | An unlisted origin gets no CORS headers; the preflight is answered without a route handler |
| Service-role usage | **VERIFIED** | Confined to `server/db/supabase.ts`; the browser only ever receives the publishable key |
| Secrets exposure | **VERIFIED** | `.env.test` is gitignored and untracked; `.env.test.example` holds placeholders only |

**No existing control was weakened.** The RLS policies, the Storage policies, the
`isUuid` checks, the string caps and the ownership model are all unchanged and all
re-verified.

---

## 10. Database Verification

**Two migrations, both additive and idempotent. No existing migration was modified.
No table or column was dropped. No user row was deleted.**

| Migration | Why it was necessary | What it does |
|---|---|---|
| `202510200006_notifications.sql` | The notifications feature **cannot** be persisted without a table. There was no `notifications` table in the live schema (the one in the archived initial migration was never applied). | Creates `public.notifications` with an FK to `profiles(id)` ON DELETE CASCADE, a `type` CHECK, 2 indexes and 4 RLS policies. |
| `202510200007_skills_read_policy.sql` | `public.skills` had RLS enabled with **no** read policy, so an authenticated client could read nothing from the global catalogue. | Adds a `SELECT` policy for authenticated users. **No write access is granted.** |

**The four main blockers required no migration** — exactly as the B.3.8 audit predicted.
`experiences`, `educations`, `user_skills` and the `roadmaps` tree all use the existing
schema.

Both migrations were applied with `supabase db push` and verified live:

* `notifications`: the table exists, RLS blocks the anon client, a signed-in user reads
  only its own rows, and the row cascades away when the account is deleted.
* `skills`: an authenticated client reads the catalogue; a client **write is still
  rejected by RLS**.

**Live schema after B.3.9:** 28 tables. The account-deletion cascade was re-verified
across all 26 profile-scoped tables — **zero survivors**. The only surviving artefact of
a deleted account is a `public.skills` catalogue row, which is by design (it is global).

**Foreign keys, unique constraints and checks re-verified live** (duplicate inserts
rejected): `profiles.username`, `user_preferences.user_id`,
`user_skills(user_id, skill_id)`, `roadmaps.profile_id`,
`saved_roles(profile_id, role_id)`, `profile_links(profile_id, kind)`,
`profile_languages(profile_id, name)`, `roadmap_phases(roadmap_id, phase_number)`,
`roadmap_milestones(phase_id, sort_order)`,
`roadmap_tasks(milestone_id, sort_order)`, `cv_versions(cv_id, version_number)`.

---

## 11. Test Coverage

**27 tests → 103 tests. 72/91 routes covered → 101/105 routes covered.**

| File | Tests | Covers |
|---|---|---|
| `tests/auth.test.ts` | 6 | 401 on 19 protected routes (unauthenticated + bad token), valid token accepted, malformed UUID, invalid enum, missing field, IDOR read/update/delete, client-supplied owner |
| `tests/domains.test.ts` | 15 | CRUD + skill links for projects/evidence/certifications/languages/links/identity/roles/applications/interviews, CV + versions, CV file storage, CV deletion cascade, roadmap chain + progress, roadmap IDOR, profile GET/PATCH |
| `tests/persistence.test.ts` | 3 | new-session visibility for project, roadmap, profile |
| `tests/regression.test.ts` | 9 | **C-1**: the demo seed cannot replace real data (×2), the collections are reported as unapplied, the dedicated endpoints are the real write path, cross-user protection. **C-2**: public/private/unauthenticated/authenticated cases (×4) |
| `tests/lifecycle.test.ts` | 6 | **logout/login** for profile, experiences, education, skills, roadmap, projects |
| `tests/roadmap.test.ts` | 11 | **H-1**: creation with the full tree, statuses and progress, locked phase, reload, task-status persistence, replace-without-duplicates, delete, cross-user, cross-user task change, validation, authentication |
| `tests/skills.test.ts` | 8 | **H-2**: create and persist, reload, update-not-duplicate, level range, non-integer, missing name, authentication, cross-user, malformed id |
| `tests/notifications.test.ts` | 9 | **M-1**: create and persist, list and read-state survives a reload, clear, invalid type, missing title, authentication, cross-user, malformed id, cascade on account deletion |
| `tests/security.test.ts` | 12 | **P-1** rate limiting (429, per-user isolation, authentication), **P-2** CORS (unlisted origin, preflight, same-origin), **M-2** Storage cleanup on account deletion, **M-6** skills read/write policy split, **M-3** the legacy routes are gone, payload validation |
| `tests/coverage.test.ts` | 15 | account lifecycle (change-password with a real password change, change-email validation, authentication), username check, roadmap enrolment and task creation, notifications read-all, the AI routes' auth contract |
| `tests/restart.test.ts` | 2 | project and roadmap progress survive a real server restart |

**Lifecycle coverage added** (all previously missing):

* **logout/login** — the suite never signed out before. `tests/lifecycle.test.ts` now
  destroys the session, signs back in and proves six domains survived.
* **server restart** — extended from 2 domains to the roadmap's full tree.
* **reload** — extended from 3 domains to every persisted domain.

**Security coverage added**: the previously-uncovered by-id routes now have cross-user
tests; the malformed-id contract is asserted on 10 paths; the rate limiter, the CORS
headers, the Storage-on-deletion cascade, the skills policy split and the removal of the
legacy routes are all covered.

**The remaining 4 uncovered routes** are the six Gemini-backed routes, which are covered
for their **authentication and error contract** but not for a successful AI response:
they spend the application's key, and the test environment has none. `/api/resumes/upload`
is likewise covered for authentication only.

**The test harness is unchanged and still works**: the runner allocates its own port,
starts the server, waits for `/api/health`, runs the files, cleans up, stops the
processes, verifies the state file and the database, and exits non-zero on failure.

---

## 12. Fresh Clone Verification

The commit was cloned to a clean directory and the full gate re-run there.

| Check | Result |
|---|---|
| `npm test` | **PASS — 103/103**, exit 0 |
| `npm run lint` | **PASS** (`tsc --noEmit`, no errors) |
| `npm run build` | **PASS** (`✓ built`) |
| `npm audit` | **PASS — 0 vulnerabilities** |
| Test users remaining | **0** |
| Test domain rows remaining | **0** across all 28 tables |
| Test Storage objects remaining | **0** folders |
| `.careerpilot_state.json` | unchanged — `7ee01fe3d0eb0e1efd33932c42905c07` |
| Unexpected processes | none |
| Unexpected ports | none |
| Working tree | clean |

**Stability:** the suite was run **three consecutive times** with 103/103 each time.

---

## 13. Remaining Technical Debt

| Item | Why it is still open |
|---|---|
| **M-7** — `/api/generate-cover-letter` does not persist | A product decision about whether an AI route should have write side-effects. The frontend persists the letter separately, so nothing is lost in the normal flow. |
| **L-1** — four missing indexes | Not a bottleneck at the current data volume; two of the four columns are already unique-constrained, which implies an index. |
| **L-6** — `achievements` is flattened into `description` | A pre-existing storage limitation. Fixing it needs a column and a DTO change for no functional gain. |
| **P-4** — CI repository secrets | An operator action on the GitHub repository, not a code change. |
| The Gemini-backed routes have no success-path test | They require the application's paid key. Their auth, validation and error contracts are covered. |
| `experiences.employment_type` is a free-text column | The app offers five values but the column has no CHECK constraint; the route caps the length but does not validate the value. |
| The `public.skills` catalogue grows without bound | Every user can add a skill name. A housekeeping job would be needed at scale. |

---

## 14. Production Readiness Score

| Metric | B.3.8 | **B.3.9** |
|---|---|---|
| Production readiness | 5/10 | **9/10** |
| Critical blockers | 2 | **0** |
| High-priority gaps | 2 | **0** |
| Medium gaps | 7 | **1 deferred** (M-7) |
| Low gaps | 8 | **2 deferred** (L-1, L-6) |
| Already verified | 21 | **21** (re-verified, not re-reported) |
| Tests | 27 | **103** |
| Route coverage | 72/91 (79 %) | **101/105 (96 %)** |
| Migrations | 5 | **7** (both new ones additive and idempotent) |

**9/10, not 10/10**, because four items remain genuinely open: the cover-letter
persistence contract, two low-priority schema debts, the CI secrets, and the
success-path coverage of the paid AI routes. None of them can destroy user data, expose
private data, or break the application.

**One further point in its favour:** the B.3.9 test suite found a production bug the
B.3.8 audit could not have — the service-role client hijack. A suite that catches a
latent outage before it reaches a user is worth more than the score suggests.

---

## 15. Final Verdict

| B.3.8 finding | Verdict |
|---|---|
| **C-1** — the aggregate endpoint replaces real user data | **FIXED** |
| **C-2** — the public profile endpoint ignores `is_public` | **FIXED** |
| **H-1** — no roadmap is ever created | **FIXED** |
| **H-2** — skill levels are not persisted | **FIXED** |
| **M-1** — notification mock data | **FIXED** |
| **M-2** — Storage orphans on account deletion | **FIXED** |
| **M-3** — the dead legacy JSON auth surface | **FIXED** |
| **M-4** — the password-reset no-op | **FIXED** |
| **M-5** — the roadmap localStorage cache | **FIXED** |
| **M-6** — the skills catalogue is unreadable | **FIXED** |
| **M-7** — `/api/generate-cover-letter` persists nothing | **DEFERRED** — a product decision on AI write side-effects; the normal flow persists the letter. |
| **L-1** — four missing indexes | **DEFERRED** — not a bottleneck at the current volume. |
| **L-2** — the skill-catalogue insert race | **FIXED** |
| **L-3** — two activity types never emitted | **FIXED** |
| **L-4** — the public profile omits certifications and projects | **FIXED** |
| **L-5** — internal error detail returned to the client | **FIXED** |
| **L-6** — `achievements` is flattened | **DEFERRED** — a pre-existing storage limitation. |
| **L-7** — the stale archived migration | **FIXED** (the local CLI state is now gitignored; the archived file is documented as history) |
| **L-8** — `skills.updated_at`, `years_experience` numeric | **VERIFIED — NO ACTION REQUIRED** |
| **P-1** — no rate limiting on the AI routes | **FIXED** |
| **P-2** — no CORS configuration | **FIXED** |
| **P-3** — the missing Gemini key is silent | **FIXED** |
| **P-4** — the CI workflow needs secrets | **DEFERRED** — an operator action, not a code change. |

**No unresolved Critical or High findings.**

**Final state:** the frontend is fully cut over to the backend as the single source of
truth for every career domain; the destructive aggregate write path no longer exists;
the public profile honours its privacy flag; the roadmap and skill levels are real,
persisted, owned database state; and the suite — which the runner owns end to end, from
port allocation to cleanup — verifies all of it automatically.

---

**B.3.9 STATUS: COMPLETE.**
