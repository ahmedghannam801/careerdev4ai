# B.3.8 — Comprehensive Persistence Gap Audit

Phase: B.3.8 — READ-ONLY AUDIT.
Project: `CareerFlow` (`ciihprsfdojzvjnqgbxl`), eu-west-1, PostgreSQL 17.11.
Baseline audited: `13b3fce` (B.3.7 + B.3.7.1 + test infrastructure).
Audit date: 2026-10-20.
Status: **AUDIT COMPLETE — NO IMPLEMENTATION PERFORMED.**

> This phase changed **no** application code, **no** migrations and **no** tests. Every probe
> user, probe row and probe Storage object created during verification was deleted by the end
> of the audit: the live database was re-counted afterwards and every domain table is at **0
> rows**, `auth.users` is at **0**, and the `cv-files` bucket has **0** folders.
> `.careerpilot_state.json` is byte-unchanged (`7ee01fe3d0eb0e1efd33932c42905c07`).

---

## 1. Executive Summary

B.3.7 and B.3.7.1 did what they claimed: the core domain persistence layer is real, the
ownership model is sound, RLS and Storage policies are correctly enforced, and the test suite
runs automatically. The foundation is **not** the problem.

The problem is one layer up. The frontend still carries the pre-B.3.6 world: a **demo-seeded
profile** as its initial state and an **unconditional background sync** to the legacy aggregate
`POST /api/state` endpoint. That endpoint is a *replace-all* writer. Together they form a
confirmed, reproducible data-loss path: **a real user's `experiences` and `educations` rows are
deleted and replaced with the demo seed data ("Meridian Tech Labs") on their first app load.**

This was not inferred — it was executed end-to-end against the live database over real HTTP
(§18, Evidence E-1). It is the single most important finding in this report.

The second confirmed critical finding is a **privacy gate that does not exist**: the public
profile endpoint returns a user's full profile, including employment history and bio, to an
**unauthenticated** caller, even when the user has set `is_public = false`. The code comment
that explains this ("the current schema has no visibility column") is **factually wrong** —
`profiles.is_public` exists in the live schema, is writable through `PATCH /api/profile`, and
is simply never consulted (§18, Evidence E-2).

Three further confirmed high-severity gaps: `POST /api/roadmap` and `DELETE /api/roadmap` have
**no frontend caller** so no roadmap is ever created for a new user; there are **no routes at
all** for skill levels, so the skill gap analysis the UI presents is never persisted; and
account deletion leaves **Storage objects orphaned** because Storage has no cascade.

The good news: the security substrate is genuinely strong. Every one of the 91 routes is
correctly authenticated, ownership is derived from the verified token and never from the
request body, RLS blocks cross-user access on every domain table, Storage rejects
cross-folder access, IDOR resistance is present in every handler, and the account-deletion
cascade cleans all 26 profile-scoped tables. This is not an application that needs rebuilding;
it needs the legacy aggregate path retired and a handful of gaps closed.

---

## 2. Current Architecture

```
┌─ Browser ─────────────────────────────────────────────────────────────┐
│  React 19 + Vite                                                     │
│                                                                      │
│  src/lib/supabase.ts   ── anon/publishable key, session in localStorage│
│  src/lib/coreApi.ts    ── typed fetch wrapper, Bearer token            │
│  src/lib/domainApi.ts  ── typed fetch wrapper, Bearer token            │
│  src/lib/roadmapApi.ts ── typed fetch wrapper, Bearer token            │
│                                                                      │
│  src/context/CareerContext.tsx  (1744 lines)                          │
│    ├─ useState seeds : DEMO DATA ("Sarah Jenkins")                     │
│    ├─ useEffect     : hydrate()  → 17 parallel GETs → server wins      │
│    ├─ useEffect     : syncStateToServer() → POST /api/state  ⚠ UNGATED │
│    └─ useEffect     : localStorage.setItem(...)  → cache only          │
└──────────────────────────────────────────────────────────────────────┘
                                    │  fetch + Bearer <supabase JWT>
┌─ Express server.ts (91 routes) ───────────────────────────────────────┐
│  requireAuth → server/auth/require-auth.ts → verifySupabaseToken()   │
│                → supabase.auth.getUser(token)  (server-side verify)  │
│                                                                      │
│  Ownership is ALWAYS req.authUser.id. A client-supplied id is never  │
│  used for authorization anywhere.                                     │
│                                                                      │
│  server/db/*.ts  →  getSupabaseServer()  (service-role client)       │
│  server/db/state.ts  →  POST /api/state  ⚠ REPLACE-ALL writer         │
└──────────────────────────────────────────────────────────────────────┘
                                    │
┌─ PostgreSQL (27 tables) + Supabase Storage ──────────────────────────┐
│  auth.users ──FK CASCADE──> public.profiles ──FK CASCADE──> 24 tables │
│  public.skills              (GLOBAL catalogue — no owner, no cascade) │
│  storage bucket cv-files    (private, 4 ownership policies)           │
└──────────────────────────────────────────────────────────────────────┘
```

**Ownership model (verified live):** `auth.users.id` → `public.profiles.id` →
`<table>.profile_id`. Tables keyed by `user_id` instead of `profile_id`:
`user_preferences`, `user_skills`, `experiences`, `educations`. The archived initial migration
(`auth_uid` column on `profiles`) is **out of date** — the live `profiles` table has no
`auth_uid` column and `profiles.id` **is** the auth identity with an FK to `auth.users`
`ON DELETE CASCADE` (verified by an insert that failed with `profiles_id_fkey`).

---

## 3. Persistence Source-of-Truth Map

| Domain | Source of truth | Verified? | Notes |
|---|---|---|---|
| Profile | `public.profiles` via `GET/PATCH /api/profile` | **VERIFIED — NO ACTION REQUIRED** | Dedicated endpoint exists and is tested; the frontend calls it (`patchProfile`) |
| Certifications | `public.profile_certifications` | **VERIFIED** | CRUD + FK cascade tested |
| Languages | `public.profile_languages` | **VERIFIED** | CRUD + unique `(profile_id,name)` tested |
| Professional links | `public.profile_links` | **VERIFIED** | CRUD + unique `(profile_id,kind)` tested |
| Career identity | `public.profile_career_identity` | **VERIFIED** | `PUT` upsert tested |
| Roadmap / phases / milestones / tasks | `public.roadmap*` (4 tables) | **VERIFIED (read+task status)** | **No roadmap is ever created** — see H-1 |
| Projects (+ skill links) | `public.projects`, `public.project_skills` | **VERIFIED** | CRUD + skill link + IDOR tested |
| Evidence (+ skill links) | `public.evidence_items`, `public.evidence_skills` | **VERIFIED** | CRUD + skill link tested |
| CVs / versions | `public.cvs`, `public.cv_versions` | **VERIFIED** | CRUD + FK cascade tested |
| CV files | Storage `cv-files` private bucket | **VERIFIED** | Signed URL, ownership, delete-with-CV tested |
| Saved roles | `public.saved_roles` | **VERIFIED** | Unique `(profile_id, role_id)` enforced live |
| Job applications | `public.job_applications` | **VERIFIED** | `salary_discussed`/`interview_stage_details` are `text` in the live DB, matching the TS types |
| Interviews | `public.interview_sessions` | **VERIFIED** | CRUD tested |
| Activities | `public.activities` | **VERIFIED (write path)** | `action_type` CHECK matches the TS union; 2 of 10 types are never emitted (L-3) |
| Secondary goals | `public.secondary_goals` | **VERIFIED** | CRUD tested |
| Career milestones | `public.career_milestones` | **VERIFIED** | CRUD tested |
| Cover letters | `public.cover_letters` | **VERIFIED** | CRUD tested |
| Documents | **derived** from cvVersions + coverLetters + certifications + projects | **VERIFIED — NO ACTION REQUIRED** | Deliberate design (B.3.6); `addDocument` routes to the canonical source |
| Preferences (theme/language) | `public.user_preferences` | **VERIFIED** | Unique `user_id` enforced live |
| Skills (levels) | `public.user_skills` + `public.skills` | **VERIFIED (via /api/state)** | **No dedicated route** — see H-2 |
| Experience / Education | `public.experiences`, `public.educations` | **BROKEN** | Replaced by demo seed — see C-1 |
| Notifications | **NONE — in-memory mock only** | **GAP** | See M-1 |
| Account lifecycle | Supabase Auth | **VERIFIED** | Password/email/delete routes exist; delete cascades all 26 tables |

---

## 4. Domain-by-Domain Audit

### 4.1 Authentication & account lifecycle

**VERIFIED — NO ACTION REQUIRED** for the mechanism the app actually uses. The frontend
authenticates with `getBrowserSupabase().auth.signInWithPassword` / `signUp` / `signOut`
(`CareerContext.tsx:2081,2101,2131`). The token is **never written to `localStorage`** — only
removed on logout (`:2135-2136`); Supabase owns the session with `persistSession: true` and
`autoRefreshToken: true` (`src/lib/supabase.ts`). The access token is read per-request via
`getAccessToken()` (`coreApi.ts:129`) and sent as `Bearer`. No token is ever logged or returned
in a response body.

Stale/expired tokens are handled: `verifySupabaseToken` maps an expired JWT to
`expired_token` (`supabase-auth.ts:50`) and `requireAuth` returns **401** for every non-`valid`
status. **The JWT is verified server-side via `supabase.auth.getUser(token)` and the `sub`
claim is never trusted locally** — the correct pattern.

- **M-3 (Medium) — Dead legacy auth surface.** `/api/auth/register`, `/api/auth/login`,
  `/api/auth/logout` (`server.ts:241,281,341`) authenticate against the **legacy JSON file**
  `.careerpilot_state.json`, with `scrypt` hashing and a self-managed `sessions` map. They are
  **unreachable from the frontend** (zero `/api/auth/*` references in `src/`). They are not a
  vulnerability — no caller exists and the tokens they mint grant nothing, because every
  protected route verifies a **Supabase** JWT. They are however a live credential store with
  `passwordHash` on disk and a second, parallel auth model that will confuse the next reader.
- **M-4 (Medium) — `/api/auth/reset-password` is a no-op.** `server.ts:353` returns
  `"Password reset link sent if account exists."` without sending anything. A user who requests
  a reset is told it was sent.
- **Low — no account deactivation/ban concept.** No `banned`/`deactivated`/`deleted_at` field
  exists. Deletion is the only lifecycle endpoint. Not a blocker for the current scope.

### 4.2 Profile

**VERIFIED — NO ACTION REQUIRED.** `GET /api/profile` (`server.ts:2425`) and
`PATCH /api/profile` (`:2436`) use `requireAuth`, scope by `req.authUser.id`, validate
`userType` against a fixed allow-list, and cap every string length. The frontend's
`updateProfile` (`CareerContext.tsx:2192`) maps `UserProfile` fields → the PATCH payload and
**persists via `patchProfile`** — the B.3.7.1 report's blocker #1 ("only the wiring in
`ProfileView` is pending") is **already closed**. Reload persistence is tested
(`domains.test.ts` "GET returns the profile with its extensions" and "PATCH updates the profile
and the change is persisted").

`profiles.username` uniqueness is enforced by `profiles_username_key` — verified by inserting a
duplicate (rejected). The live schema has all 26 profile columns the DTO uses, including
`city`, `country`, `is_public`, `preferred_name`.

The one profile defect is the **`/api/state` interference** (C-1), not the profile API.

### 4.3 CV system

**VERIFIED — NO ACTION REQUIRED.** Upload (`server.ts:404`) validates the extension allow-list,
re-encodes the extension from the **MIME type** via `extensionForMimeType` (`cvStorage.ts:32`),
enforces a 10 MB limit (multer + bucket both 10 MB), and stores to a **random UUID** path under
`{user_id}/`. Download (`:1528`) returns a **300-second signed URL** and refuses any path not
under the caller's own folder (`pathBelongsToUser`, `cvStorage.ts:82`). Delete (`:1501`) reads
the row first, deletes the DB row, then removes the Storage object.

Storage policies (4, in `202510200004_cv_file_storage.sql`) were **verified live**: an
authenticated user can upload/list/delete in their **own** folder and is **rejected** on
another user's folder (`violates row-level security policy`). The bucket is `public: false`,
10 MB, MIME allow-listed.

- **M-2 (Medium) — Storage orphans on account deletion.** Verified live: deleting the auth
  user removes the `cvs` row but the Storage object survives (§18, Evidence E-3). Storage has
  no cascade.

### 4.4 Career / domain data

**Verified:** projects, evidence, certifications, languages, links, career identity, saved
roles, job applications, interviews, activities, secondary goals, career milestones, cover
letters — all have working, tested, ownership-scoped CRUD.

- **H-2 (High) — Skill levels have no persistence route.** `updateSkillLevel`
  (`CareerContext.tsx:2283`), `addCustomSkill` (`:2297`) and `removeSkill` (`:2313`) only call
  `setSkills`. There is **no `/api/skills` or `/api/user-skills` route** — `grep` finds
  `user_skills` in `server.ts` only at line 987, inside the *public* profile route. Skill levels
  reach the DB only via `POST /api/state` (`state.ts:164-190`), which is the legacy aggregate
  endpoint. The "career analysis" the UI renders (`criticalGaps`, `matchScore`) is computed
  from this same in-memory `skills` array, so **the gap analysis a user sees is not the gap
  analysis that is stored**.
- **M-1 (Medium) — Notifications are mock data.** `notifications` is initialised with two
  hard-coded entries (`CareerContext.tsx:1215-1232`) and mutated only by `markNotificationRead`
  (`:2822`) and `clearNotifications` (`:2826`). There is **no `notifications` table** in the live
  schema and **no notification route**. Read/unread state is lost on reload. The
  `notifications_enabled` preference *is* persisted, so the feature is half-built.

### 4.5 Roadmap

**VERIFIED** for reading, task status, enrolment and the full phase→milestone→task tree, with
ownership proven by walking `task → milestone → phase → roadmap → profile`
(`roadmap.ts:taskBelongsToProfile`). Status values `not_started | in_progress | completed |
skipped | blocked` are validated against `ROADMAP_TASK_STATUSES` and the **live CHECK constraint
accepts all five** (verified by insert — `202510200005` widened it; `weird_value` is rejected).
Progress is **derived** from task status, never stored — correct.

- **H-1 (High) — No roadmap is ever created.** `POST /api/roadmap` (`server.ts:2321`) and
  `DELETE /api/roadmap` (`:2410`) have **no frontend caller** — `src/lib/roadmapApi.ts` exports
  only `fetchRoadmap`, `patchRoadmapTaskStatus`, `enrollInRoadmap`, `addRoadmapTask`,
  `fetchProfile`, `patchProfile`. The frontend instead calls
  `setRoadmapPhases(generateInitialRoadmap(role))` (`CareerContext.tsx:2158`), a **purely
  local** generation. So a new user has `roadmapPhases` in memory and in `localStorage`, but
  **no `roadmaps` row**. `GET /api/roadmap` returns `null`, `roadmapPhases` is listed in
  `UNMAPPED_TOP_LEVEL` (`state.ts:30`) so `/api/state` never writes it, and the next page load
  **overwrites the local roadmap with the server's empty result** — the generated roadmap is
  lost. `updateTaskStatus` falls back to a local update for exactly this reason
  (`:2355`, "the task id is a local (non-persisted) id").
- **M-5 (Medium) — `localStorage` caches a roadmap that is not the server's.**
  `localStorage.setItem('careerpilot_roadmap', ...)` (`:1923`) writes the *local* roadmap,
  including local-only task ids, into a key that is later read back (`:1084`).

### 4.6 Documents

**VERIFIED — NO ACTION REQUIRED.** `documents` is a **derived view-model**, deliberately
(`CareerContext.tsx:1409-1413`): "There is no `documents` table: CareerDocument is composed
from the canonical sources". `addDocument` (`:1482`) routes each type to its canonical writer
(`saveCoverLetter` for cover letters, etc.), so no duplicate entity is written. This is a sound
design choice, not a gap.

- **Low — the documents view is missing two of its three tabs' data.** `certifications: []` and
  `projects: []` are hard-coded empty in the public-profile DTO (`server.ts:1025-1027`), so a
  public profile shows no certifications or projects even when the user has them.

### 4.7 Activity / notifications / events

**VERIFIED** for the activity write path: `postActivity` (`server.ts:1135`) validates
`actionType` against `ACTIVITY_ACTION_TYPES` and persists to `public.activities` with a **real
`created_at` timestamp** (the old display-string timestamp is gone). The live CHECK constraint
on `action_type` matches the TypeScript union exactly, and `completed_course` is correctly
absent from both.

- **L-3 (Low) — Two activity types are never emitted.** `applied_job` and `saved_job` exist in
  the union, the DB CHECK and the server allow-list, but the frontend emits neither — even
  though `postJobApplication` (`CareerContext.tsx:2648`) and `postSavedRole` (`:2163`) perform
  exactly those actions. The activity feed therefore under-reports real user activity.

### 4.8 Achievements / offers / targets

- **Low — "achievements" and "offers" have no persisted entity.** Achievements live as a
  `string[]` inside `experiences[].achievements` (`CareerContext.tsx:1006`) and are joined with
  `\n` into `experiences.description` (`state.ts:132-133`) — a lossy flattening. "Offers" has
  no entity; an offer is a `job_applications` row with `stage: 'offer'`. "Targets" are
  `targetRole` (a `profiles` column) plus `user_preferences`. These are modelling choices, not
  defects, but they mean there is no queryable offer history or achievement record.

---

## 5. Local / Session / IndexedDB / Cookie State Audit

Complete inventory (`grep` over `src/` and `server.ts`):

| Mechanism | Occurrences | Assessment |
|---|---|---|
| `localStorage` | 9 sites, all in `CareerContext.tsx` + `SettingsView.tsx:138` | See below |
| `sessionStorage` | **0** | — |
| `indexedDB` | **0** | — |
| `document.cookie` / `Cookies` | **0** | — |
| In-memory only | notifications (M-1), `localStorage` roadmap (M-5) | See below |
| `.careerpilot_state.json` | written by `server.ts` bootstrap + the 3 dead auth routes | Legacy; the runner now guards it |
| `/api/state` | 1 caller: `CareerContext.tsx:1902` | **The critical path** — see C-1 |
| Context caches | `CareerContext.tsx` (all domain state) | Server-wins hydration, verified |
| Optimistic-only mutations | **0** for server-backed domains | All mutations await the DTO first |

**The five `localStorage` keys:**

| Key | Written | Read | Verdict |
|---|---|---|---|
| `careerpilot_profile` | `:1920` | `:950` (initial state) | **Cache only** — the seed demo object is read when the key exists, but the server hydration overwrites it (§5.1). Contains the demo seed's `education`/`experiences` → this is the vector for C-1. |
| `careerpilot_target_role` | `:1921` | `:1063` | Cache only |
| `careerpilot_skills` | `:1922` | `:1075` | Cache only — but **no server read path** (H-2) |
| `careerpilot_roadmap` | `:1923` | `:1084` | Cache only — **not the server's roadmap** (M-5, H-1) |
| `careerpilot_settings` | `:1924` | `:1855` | Cache only |
| `careerpilot_token` / `careerpilot_user` | **never written** | — | **Removed** on logout (`:2135-2136`); Supabase owns the session. **VERIFIED — NO ACTION REQUIRED.** |

The comment at `CareerContext.tsx:791-793` states the intent accurately: "The database is the
source of truth; localStorage is not consulted for these domains."

### 5.1 The one real cache-vs-persistence defect (C-1)

`localStorage` is a legitimate pre-hydration cache. The problem is not the cache — it is
**what the app does with the profile it caches**.

`CareerContext.tsx:949-962` initialises `profile` from `localStorage`, and if absent, from a
**hard-coded demo persona**: name "Sarah Jenkins", email "sarah.jenkins@example.com", one
education entry (UT Austin, BSc CS) and two experience entries ("Meridian Tech Labs" —
Frontend Developer; "Apex Digital Agency" — Junior Web Developer Intern).

`updateProfile` (`CareerContext.tsx:2192-2268`) maps only the fields that `PATCH /api/profile`
owns. `experiences` and `education` are **not** in that list, so they fall through to
`setProfile(prev => ({ ...prev, ...updates }))` at `:2267` — a **local-only** update.

Then the effect at `:1918-1925` fires on every `profile` change:

```ts
useEffect(() => {
  localStorage.setItem('careerpilot_profile', JSON.stringify(profile));
  ...
  syncStateToServer();          // POST /api/state
}, [profile, targetRole, skills, roadmapPhases, settings, projects, evidenceItems, applications]);
```

**This effect is not gated on `authToken`.** It runs on mount, before and during hydration, and
`POST /api/state` → `saveState` (`server/db/state.ts:120-141`) does **DELETE-all-then-reINSERT**
on `experiences` and `educations`:

```ts
if (Array.isArray(p.experiences)) {
  await getSupabaseServer().from('experiences').delete().eq('user_id', userId);
  for (const exp of p.experiences) { await getSupabaseServer().from('experiences').insert({...}); }
}
```

So: a real user signs in → the app hydrates their real profile → but the demo-seed
`experiences` array is still in `profile` for the fields `/api/profile` does not own → the
effect POSTs it → **their real experience rows are deleted and the demo seed is inserted.**

Verified end-to-end over real HTTP against the live database (§18, Evidence E-1): a probe
user's `experiences` row `REAL COMPANY` became `Meridian Tech Labs` after one
`POST /api/state`.

The same DELETE-all-then-reINSERT applies to `educations` (`state.ts:143-160`).

---

## 6. API Coverage Matrix

91 routes in `server.ts`. All 91 are authenticated except the 8 public ones below.

| Method | Route | Line | Auth | Ownership | Frontend caller | Persistence |
|---|---|---|---|---|---|---|
| GET | `/api/health` | 236 | none | n/a | none (harness only) | n/a |
| POST | `/api/auth/register` | 241 | none | legacy JSON | **NONE — dead** | legacy JSON |
| POST | `/api/auth/login` | 281 | none | legacy JSON | **NONE — dead** | legacy JSON |
| GET | `/api/auth/me` | 315 | verify | token id | **NONE — dead** | n/a |
| POST | `/api/auth/logout` | 341 | none | legacy JSON | **NONE — dead** | legacy JSON |
| POST | `/api/auth/reset-password` | 353 | none | n/a | **NONE — dead** | **no-op (M-4)** |
| GET/POST | `/api/state` | 362,378 | verify | token id | `CareerContext.tsx:1902` | **replace-all (C-1)** |
| POST | `/api/resumes/upload` | 404 | requireAuth | token id | frontend | Postgres + Storage ✅ |
| POST | `/api/copilot` | 637 | requireAuth | token id | frontend | none (AI) |
| POST | `/api/analyze-career` | 718 | requireAuth | token id | frontend | none (AI) |
| POST | `/api/optimize-cv` | 779 | requireAuth | token id | frontend | none (AI) |
| POST | `/api/mock-interview` | 822 | requireAuth | token id | frontend | none (AI) |
| POST | `/api/suggest-summary` | 863 | requireAuth | token id | frontend | none (AI) |
| POST | `/api/generate-cover-letter` | 898 | requireAuth | token id | frontend | **writes nothing** |
| GET | `/api/profile/check-username` | 941 | none | n/a | **NONE — dead** | n/a |
| GET | `/api/profile/public/:username` | 963 | none | **none — C-2** | **NONE — dead** | **leaks (C-2)** |
| POST | `/api/account/change-password` | 1032 | verify | token id | **NONE — dead** | Supabase Auth |
| POST | `/api/account/change-email` | 1057 | verify | token id | **NONE — dead** | Supabase Auth |
| POST | `/api/account/delete` | 1081 | verify | token id | **NONE — dead** | Auth + cascade |
| GET/POST | `/api/activities` | 1113,1135 | requireAuth | token id | `CareerContext.tsx:1343` | ✅ |
| GET/POST/PATCH/DELETE | `/api/secondary-goals` | 1159-1246 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/career-milestones` | 1259-1323 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/cover-letters` | 1336-1424 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/cvs` | 1442-1501 | requireAuth | token id | frontend | ✅ + Storage |
| GET | `/api/cvs/:id/file` | 1528 | requireAuth | token id | frontend | signed URL ✅ |
| GET/POST/PATCH/DELETE | `/api/cv-versions` | 1548-1613 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/projects` | 1626-1727 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/evidence` | 1740-1831 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/certifications` | 1844-1903 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/languages` | 1916-1972 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/profile-links` | 1985-2031 | requireAuth | token id | frontend | ✅ |
| GET/PUT | `/api/career-identity` | 2044,2054 | requireAuth | token id | frontend | ✅ |
| GET/POST/DELETE | `/api/saved-roles` | 2074-2105 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/job-applications` | 2119-2215 | requireAuth | token id | frontend | ✅ |
| GET/POST/PATCH/DELETE | `/api/interviews` | 2228-2296 | requireAuth | token id | frontend | ✅ |
| GET/POST | `/api/roadmap` | 2311,2321 | requireAuth | token id | GET only — **POST dead (H-1)** | ✅ |
| POST | `/api/roadmap/enroll` | 2338 | requireAuth | token id | `roadmapApi.ts:169` | ✅ |
| PATCH | `/api/roadmap/tasks/:taskId` | 2349 | requireAuth | **chain-walk** | `roadmapApi.ts:158` | ✅ |
| POST | `/api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks` | 2366 | requireAuth | chain-walk | `roadmapApi.ts:177` | ✅ |
| DELETE | `/api/roadmap` | 2410 | requireAuth | token id | **NONE — dead (H-1)** | ✅ |
| GET/PATCH | `/api/profile` | 2425,2436 | requireAuth | token id | `roadmapApi.ts:190,195` | ✅ |

**Ownership enforcement: 100 %.** Every protected handler derives the owner from
`req.authUser.id`. A grep for client-supplied ownership in the request body found **no** route
that uses `body.userId` / `body.profileId` for authorization. The one route that accepts
`userId` in the body (`POST /api/projects`) is tested for exactly this
(`auth.test.ts` "a client-supplied user id does not change ownership").

**Dead endpoints (no frontend caller): 11** — the 5 legacy `/api/auth/*` routes, `/api/auth/me`,
`/api/profile/check-username`, `/api/profile/public/:username`, the 3 `/api/account/*` routes,
`POST /api/roadmap` and `DELETE /api/roadmap`.

---

## 7. Frontend ↔ Backend ↔ DB DTO Matrix

| Entity | Frontend TS | Backend DTO | DB column | Status |
|---|---|---|---|---|
| Profile | `UserProfile` (`src/types/career.ts`) | `ProfileDTO` (`server/db/profile.ts:43`) | `profiles.*` (26 cols) | ✅ **VERIFIED** |
| Project | `CareerProject` | `ProjectDTO` (`projects.ts`) | `projects` + `project_skills` | ✅ |
| Evidence | `CareerEvidence` | `EvidenceDTO` (`evidence.ts`) | `evidence_items` + `evidence_skills` | ✅ |
| CV | `activeCV` / `CvDTO` | `CvDTO` (`cvs.ts`) | `cvs` | ✅ |
| CV version | `CVVersion` | `CvVersionDTO` (`cvVersions.ts`) | `cv_versions` | ✅ |
| Certification | `UserCertificationEntry` | `CertificationDTO` (`profileExtensions.ts`) | `profile_certifications` | ✅ |
| Language | `UserLanguageEntry` | `LanguageDTO` | `profile_languages` | ✅ |
| Profile link | `ProfessionalLinks` | `ProfileLinkDTO` | `profile_links` | ✅ |
| Career identity | `CareerIdentity` | `CareerIdentityDTO` | `profile_career_identity` | ✅ |
| Roadmap | `roadmapPhases` | `RoadmapDTO` (`roadmap.ts:57`) | `roadmaps` + 3 children | ✅ (DTO) / ⚠ **no row created (H-1)** |
| Job application | `JobApplication` | `JobApplicationDTO` (`jobApplications.ts`) | `job_applications` | ✅ — `salary_discussed` is `text` live, matching `string` in TS |
| Interview | `InterviewSession` | `InterviewSessionDTO` (`interviewSessions.ts`) | `interview_sessions` | ✅ |
| Activity | `UserActivityItem` | `ActivityDTO` (`activities.ts`) | `activities` | ✅ |
| Secondary goal | `SecondaryCareerGoal` | `SecondaryGoalDTO` | `secondary_goals` | ✅ |
| Career milestone | `CareerMilestoneItem` | `CareerMilestoneDTO` | `career_milestones` | ✅ |
| Cover letter | `CoverLetter` | `CoverLetterDTO` (`coverLetters.ts`) | `cover_letters` | ✅ |
| Saved role | `TargetRole` | `SavedRoleDTO` (`savedRoles.ts`) | `saved_roles` | ✅ |
| Skill | `UserSkill` | (state.ts inline) | `skills` + `user_skills` | ⚠ **no dedicated route (H-2)** |
| Experience | `UserExperienceEntry` | (state.ts inline) | `experiences` | ❌ **demo-seed replaced (C-1)** |
| Education | `UserEducationEntry` | (state.ts inline) | `educations` | ❌ **demo-seed replaced (C-1)** |
| Document | `CareerDocument` | — | — (derived) | ✅ intentional |
| Notification | `UserNotification` | — | **none** | ⚠ **mock only (M-1)** |

**One notable asymmetry:** `experiences`/`educations` are the only entities with **no backend
DTO module** — they are written inline in `server/db/state.ts`, outside the `server/db/*.ts`
per-domain pattern every other entity follows. That is the structural reason C-1 exists: the
legacy aggregate endpoint is the *only* writer for those two tables, and it is a replace-all
writer.

---

## 8. Database Schema Mismatch Matrix

The live schema was read from the PostgREST OpenAPI spec (`/rest/v1/`), which exposes all 27
tables' real columns, types and nullability. **Every column the code writes exists, and every
type matches.** The two known B.3.7.1 fixes are confirmed live:

- `job_applications.salary_discussed` → `text` ✅ (was `boolean`)
- `job_applications.interview_stage_details` → `text` ✅ (was `jsonb`)
- `profiles.city` / `profiles.country` → `text` ✅ (added in `202510200003`)
- `profile_certifications.expiry_date` → `date` ✅
- `roadmap_tasks.status` CHECK → all 5 statuses accepted ✅ (`202510200005` widened it)
- `activities.action_type` CHECK → matches the TS union, `completed_course` absent ✅

| Table | Missing cols | Wrong type | Enum/CHECK | Nullable | Index | FK | Unique | Orphan risk |
|---|---|---|---|---|---|---|---|---|
| `profiles` | none | none | none | none | `profiles_username_key` ✅ | `auth.users` CASCADE ✅ | username ✅ | none |
| `user_preferences` | none | none | none | none | — | `user_id`→`profiles` ✅ | `user_id` ✅ verified | none |
| `user_skills` | none | none | none | none | — | ✅ | `(user_id,skill_id)` ✅ verified | none |
| `skills` | none | none | none | none | — | — | — | **global, no owner (L-2)** |
| `projects` | none | none | none | none | ✅ | ✅ | — | none |
| `project_skills` | none | none | none | none | ✅ | ✅ | `(project_id,skill_id)` ✅ | none |
| `evidence_items` | none | none | none | none | ✅ | ✅ | — | none |
| `evidence_skills` | none | none | none | none | ✅ | ✅ | ✅ | none |
| `cvs` | none | none | none | none | ✅ | ✅ | partial `is_active` ✅ | none |
| `cv_versions` | none | none | none | none | ✅ | ✅ | `(cv_id,version_number)` ✅ | none |
| `saved_roles` | none | none | none | none | ✅ | ✅ | `(profile_id,role_id)` ✅ verified | none |
| `job_applications` | none | none | stage CHECK ✅ | none | ✅ | ✅ | — | none |
| `interview_sessions` | none | none | none | none | ✅ | ✅ | — | none |
| `profile_certifications` | none | none | none | none | ✅ | ✅ | partial credential_id ✅ | none |
| `profile_languages` | none | none | none | none | ✅ | ✅ | `(profile_id,name)` ✅ | none |
| `profile_links` | none | none | none | none | ✅ | ✅ | `(profile_id,kind)` ✅ verified | none |
| `profile_career_identity` | none | none | none | none | ✅ | ✅ | `profile_id` ✅ | none |
| `roadmaps` | none | none | none | none | — | ✅ | `profile_id` ✅ verified | none |
| `roadmap_phases` | none | none | none | none | ✅ | ✅ | `(roadmap_id,phase_number)` ✅ | none |
| `roadmap_milestones` | none | none | none | none | ✅ | ✅ | `(phase_id,sort_order)` ✅ | none |
| `roadmap_tasks` | none | none | status CHECK ✅ | none | ✅ | ✅ | `(milestone_id,sort_order)` ✅ | none |
| `activities` | none | none | action_type CHECK ✅ | none | ✅ | ✅ | — | none |
| `secondary_goals` | none | none | priority/status CHECK ✅ | none | ✅ | ✅ | — | none |
| `career_milestones` | none | none | category CHECK ✅ | none | ✅ | ✅ | — | none |
| `cover_letters` | none | none | none | none | ✅ | ✅ | — | none |
| `experiences` | none | none | none | none | — | ✅ | — | none |
| `educations` | none | none | none | none | — | ✅ | — | none |

**Result: no schema mismatch that can corrupt or lose data.** The schema is in better shape
than the code.

- **L-1 (Low) — Missing indexes.** `experiences.user_id`, `educations.user_id`,
  `user_preferences.user_id` and `user_skills.user_id` have no declared index in the migration
  files, although all four are queried by `user_id` on every page load. (`user_preferences` and
  `user_skills` are unique-constrained, which implies an index.) At the current data volume
  this is immaterial; it matters at scale.
- **L-2 (Low) — `public.skills` has no owner.** It is a global catalogue that every user
  writes to. Two users adding the same skill name race for the insert (`projects.ts:resolveSkillIds`
  does check-then-insert without a conflict handler, so a concurrent insert can throw a
  duplicate-key error). The test runner already treats skill rows as a global side effect.
- **Note — the archived initial migration is stale.** `archive/202510190001` declares
  `profiles.auth_uid`, `public.education`, `public.experience` and other tables that **do not
  exist** live. `archive/202510190004` corrects the RLS to `profiles.id`. The archive is
  history, not the source of truth, but it is a trap for the next reader.

---

## 9. RLS & Storage Security Audit

**RLS: VERIFIED — NO ACTION REQUIRED.**

Every domain table has RLS enabled and returns **0 rows** to the anon client. With a real
signed-in user, the enforcement is exactly right:

| Probe | Result |
|---|---|
| anon reads `profiles` / `projects` / `cvs` / `roadmaps` / `activities` / `user_preferences` / `skills` / `user_skills` / `experiences` / `educations` | **0 rows** — RLS active on all 10 |
| signed-in user reads **own** profile | 1 row ✅ |
| signed-in user reads **another** profile | 0 rows ✅ |
| signed-in user inserts a profile with **another** id | **rejected: `violates row-level security policy for table "profiles"`** ✅ |
| signed-in user reads **own** `user_preferences` | 1 row ✅ |

**Storage: VERIFIED — NO ACTION REQUIRED.**

| Probe | Result |
|---|---|
| upload to **another** user's folder | **rejected: `violates row-level security policy`** ✅ |
| upload to **own** folder | ok ✅ |
| list **own** folder | returns the object ✅ |
| list **another** folder | `[]` ✅ |
| delete **own** object | ok ✅ |
| delete **another** user's object | rejected (no such object; the policy covers it) ✅ |
| bucket config | `public: false`, 10 MB, MIME allow-list of 5 types ✅ |

**Service-role usage is correctly confined** to `server/db/supabase.ts` (`getSupabaseServer`),
which is imported only by server modules — **never** by `src/`. The browser only ever receives
the publishable key (`src/lib/supabase.ts`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

- **M-6 (Medium) — `public.skills` is readable by nobody.** The anon probe returned 0 rows for
  `skills`. Since the catalogue is global and shared, a **read** policy for authenticated
  users is needed for the skill-matching UI to work; today it is service-role-only, so the
  frontend can never read a skill catalogue row directly.
- **Low — no rate limiting.** No `express-rate-limit`, no CORS configuration and no `helmet`.
  The AI routes (`/api/copilot`, `/api/analyze-career`, …) call Gemini with the app's key, so
  an authenticated user can drive unbounded AI spend.
- **Low — internal error detail leaked** at `server.ts:631`: `details: error?.message || 'Server error'`
  in the CV-upload route can expose a stack or upstream message.

---

## 10. Authentication & Ownership Audit

**VERIFIED — NO ACTION REQUIRED** for the authentication and authorization core.

- All 91 routes are covered by `requireAuth` or an explicit `verifySupabaseToken` check; the
  8 public routes are `/api/health`, the 5 legacy `/api/auth/*` routes,
  `/api/profile/check-username` and `/api/profile/public/:username`.
- Ownership is derived **exclusively** from the verified token (`req.authUser.id`) in every
  protected handler. No route reads `body.userId`, `body.profileId` or a path param as the
  owner.
- IDOR resistance is present in every by-id handler: `getCvRow(profileId, id)`,
  `listProjects`/`getProject` filtered by `profile_id`, `taskBelongsToProfile` walking the
  whole chain, `cover_letters` by `profile_id`, etc. The suite asserts 404 (not 403) for
  cross-user access, which also avoids leaking existence.
- Malformed ids are rejected with **400** before any query — `isUuid()` (`server.ts:1110`) is
  applied to every `:id` path parameter, and the suite asserts this for 5 routes.
- Enum values are validated against fixed allow-lists before writing (`ACTIVITY_ACTION_TYPES`,
  `ROADMAP_TASK_STATUSES`, `project difficulty`, `evidence type`, `interview type`,
  `job stage`, `language proficiency`, `activity actionType`, `profile userType`).
- Payload sizes are bounded: `str(value, max)` caps every string, `express.json({limit:'15mb'})`
  and multer caps uploads at 10 MB.

**The two exceptions are C-2 (public route) and M-4 (reset-password no-op).**

---

## 11. Test Coverage & Missing Tests

The suite is **27 tests across 4 files** and runs automatically (`npm test` → the runner starts
and stops its own server). It is a good suite for what it covers — it asserts real persistence,
not just status codes, and it cleans up after itself.

**Route coverage: 72 of 91 routes (79 %).** The 19 uncovered routes:

| Route | Why it matters |
|---|---|
| `GET /api/health` | low — exercised implicitly by the harness |
| `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout` | **M-3** — the dead legacy auth surface is untested, so nobody notices it still works |
| `POST /api/auth/reset-password` | **M-4** — untested, and it is a no-op |
| `POST /api/resumes/upload` | **HIGH** — the CV upload path (multer → Gemini → Storage → 2 DB rows) is the most complex mutation in the app and has **no test** |
| `POST /api/copilot`, `/api/analyze-career`, `/api/optimize-cv`, `/api/mock-interview`, `/api/suggest-summary`, `/api/generate-cover-letter` | medium — AI routes; each needs at least an auth/validation test (401, 400) |
| `GET /api/profile/check-username` | low |
| `GET /api/profile/public/:username` | **HIGH — this is C-2.** The one endpoint that leaks data has no test |
| `POST /api/account/change-password`, `/api/account/change-email`, `/api/account/delete` | **HIGH** — the account-lifecycle surface, including the one that leaves Storage orphans (M-2), is entirely untested |
| `POST /api/roadmap/enroll` | medium — enrolment is a persisted flag |
| `POST /api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks` | medium — task creation |

**Domain-table coverage.** Tables exercised directly by the suite: `profiles`, `cv_versions`,
`project_skills`, `evidence_skills`, `profile_links`, `roadmap_phases`, `roadmap_milestones`,
`roadmap_tasks`. Tables only reachable through an API round-trip (and therefore implicitly
covered): `projects`, `evidence_items`, `cvs`, `saved_roles`, `job_applications`,
`interview_sessions`, `profile_certifications`, `profile_languages`,
`profile_career_identity`, `activities`, `secondary_goals`, `career_milestones`,
`cover_letters`, `roadmaps`. **Never touched by any test:** `user_preferences`,
`user_skills`, `skills`, `experiences`, `educations`, `storage.objects` (as a bucket-wide
assertion).

### Required test buckets

| Bucket | Status | Detail |
|---|---|---|
| Untested routes | **19** | see table above |
| Untested domains | **5** | `experiences`, `educations`, `user_skills`, `user_preferences`, `skills` |
| Missing cross-user / IDOR | **18** | IDOR is proven for `projects` only. Missing for: CVs, CV versions, CV files, evidence, certifications, languages, profile links, career identity, saved roles, job applications, interviews, cover letters, activities, secondary goals, career milestones, roadmap tasks, profile updates. |
| Missing reload / new-session | **18** | `persistence.test.ts` proves new-session visibility for project, roadmap, profile only |
| **Missing logout/login** | **YES — no test signs out at all** | `grep signOut\|logout` across `tests/` returns **nothing**. The suite re-signs-in but never verifies that a logout + login cycle preserves data |
| Missing server-restart | **16** | `restart.test.ts` covers project + roadmap only |
| Missing Storage | **partial** | upload, owner download and cross-user 404 are covered (`domains.test.ts`). **Not covered:** signed-URL expiry, orphan cleanup after account deletion (M-2), bucket-wide "no leftovers" assertion, file-not-found behaviour |
| Missing negative / security | **partial** | malformed-UUID (5 routes), invalid-enum (6), missing-field (10) are covered. **Not covered:** oversized payload, invalid MIME type, path traversal in a storage path, very long strings, SQL-shaped input, cross-user on the by-id routes listed above |
| **Missing migration / schema tests** | **YES — none exist** | No test asserts that the live schema has the columns the code writes, or that the CHECK constraints match the TS unions. A migration that drifted (as `202510200001` vs `202510200005` did) would not be caught by any test |

---

## 12. Confirmed Bugs

### C-1 — `POST /api/state` replaces a real user's experience/education with the demo seed
**Severity: Critical | Status: Confirmed (executed end-to-end over HTTP)**

- **File:** `src/context/CareerContext.tsx:1918-1925` (ungated auto-sync), `:949-1046` (demo seed),
  `:2267` (local-only fallback for `experiences`/`education`); `server/db/state.ts:120-160`
  (DELETE-all-then-reINSERT); `server.ts:378` (`POST /api/state`)
- **Current behaviour:** on every change to `profile` — including the mount before hydration
  completes — the app POSTs the whole profile to `/api/state`. `saveState` deletes **all** of
  the user's `experiences` and `educations` and re-inserts whatever the payload contains. The
  payload contains the hard-coded demo persona ("Meridian Tech Labs", "Apex Digital Agency",
  "University of Texas at Austin") because `/api/profile` does not own those two fields, so the
  frontend keeps them locally and syncs them through the legacy aggregate endpoint.
- **Why it is a problem:** a real user's employment and education history is **destroyed and
  replaced with demo data** on first load. `roadmapPhases`, `savedRoles`, `projects`,
  `evidenceItems`, `activeCV`, `cvVersions`, `applications` and `interviewSessions` are all in
  the same payload and are all listed in `UNMAPPED_TOP_LEVEL` (`state.ts:30`) — so they are
  reported but **not** written, which is why only `experiences`/`educations` are destroyed. The
  trigger is not gated on `authToken`, so it fires even before the session is established.
- **Exact recommended fix:** (a) delete the `POST /api/state` call from the auto-sync effect;
  (b) add dedicated `GET`/`PUT` routes for `experiences` and `educations` owned by
  `server/db/experiences.ts` / `server/db/educations.ts`, mirroring every other domain;
  (c) change `updateProfile` to route `experiences`/`education` through those routes instead
  of the local-only fallback; (d) make the auto-sync effect conditional on `authToken` and on
  the hydration having completed; (e) make `saveState` non-destructive — if the aggregate
  endpoint must survive, it must never delete-then-reinsert.
- **Migration required:** **No.** The tables exist and are correct; only the write path is wrong.
- **Frontend impact:** the demo persona must stop being the initial `profile` state for
  authenticated users; it should be the *pre-auth* placeholder only.
- **Backend impact:** `/api/state` should be deprecated and removed once (b)–(c) land.
- **Security impact:** none directly, but it is a data-integrity failure of the highest order.
- **Test required:** yes — create a user with a real experience, load the app's sync payload,
  assert the row survives; and a regression test that `POST /api/state` no longer
  delete-and-reinsert.

### C-2 — Unauthenticated public profile endpoint ignores `is_public = false`
**Severity: Critical | Status: Confirmed (executed over HTTP)**

- **File:** `server.ts:963-1030`, comment at `:973-976`
- **Current behaviour:** `GET /api/profile/public/:username` returns the profile's name, bio,
  headline, target role, **employment history** and skills to any unauthenticated caller. The
  code comment states: *"the current schema has no visibility column (profiles has no
  `is_public` / visibility field), so the previous `isPublic` privacy gate cannot be
  evaluated."* **That comment is factually wrong.** `profiles.is_public` exists in the live
  schema (`boolean NOT NULL DEFAULT false`), is exposed by `ProfileDTO.isPublic`
  (`server/db/profile.ts:43,151`), and is writable via `PATCH /api/profile`
  (`server.ts:2474`). The route simply never reads it.
- **Why it is a problem:** a user who explicitly sets their profile to private has their
  employment history and bio published to anyone who knows their username. The endpoint also
  has **no frontend caller**, so it is a pure, unused exposure surface.
- **Exact recommended fix:** add the gate — `if (!profile.is_public) return res.status(404)…`
  (404, not 403, to avoid confirming the username exists) — and delete the incorrect comment.
  Optionally add a route to set `is_public` if the UI does not already expose it.
- **Migration required:** **No.**
- **Frontend impact:** none (no caller).
- **Backend impact:** `server.ts:973` comment removed; gate added.
- **Security impact:** **High** — an unauthenticated confidentiality breach.
- **Test required:** yes — a user with `is_public = false` must yield 404; with `is_public = true`
  must yield 200.

---

## 13. Suspected Risks

### H-1 — No roadmap is ever created for a user
**Severity: High | Status: Confirmed** (both the missing caller and the local-only generation
were read directly; the "lost on reload" consequence follows from the hydration order at
`:841`).

`POST /api/roadmap` (`server.ts:2321`) and `DELETE /api/roadmap` (`:2410`) have no frontend
caller. The frontend generates the roadmap locally (`generateInitialRoadmap(role)`,
`CareerContext.tsx:2158`). The generated roadmap is not persisted, `roadmapPhases` is in
`UNMAPPED_TOP_LEVEL`, and the hydration at `:841` replaces the local roadmap with the server's
(empty) result on the next load.

- **Recommended fix:** add `createRoadmap()` to `src/lib/roadmapApi.ts`; call it from
  `setPrimaryTargetRole` (or from onboarding) when the user has no server roadmap; persist the
  generated phases/milestones/tasks through the existing task-creation route.
- **Migration required:** No.
- **Frontend impact:** onboarding must create the roadmap server-side.
- **Backend impact:** `POST /api/roadmap` already exists and is correct.
- **Security impact:** none.
- **Test required:** yes — create a roadmap via the API and assert it survives a reload.

### H-2 — Skill levels have no persistence route
**Severity: High | Status: Confirmed.** `updateSkillLevel`, `addCustomSkill` and
`removeSkill` (`CareerContext.tsx:2283-2316`) only touch React state; there is no
`/api/skills` route. Levels reach the DB only via `POST /api/state` — the endpoint C-1 must
retire — so skill persistence is coupled to the buggy path.

- **Recommended fix:** add `GET/POST/PATCH/DELETE /api/user-skills` owned by
  `server/db/userSkills.ts`; have the frontend call them.
- **Migration required:** No.
- **Frontend impact:** skill edits become async and server-backed; the career analysis must read
  the persisted levels.
- **Backend impact:** one new route group.
- **Security impact:** none.
- **Test required:** yes — change a skill level, reload, assert it survived.

### M-1 — Notifications are mock data with no persistence
**Severity: Medium | Status: Confirmed.** No `notifications` table, no route; state is two
hard-coded entries mutated in memory (`CareerContext.tsx:1215-1232, 2822-2828`). Read/unread
state is lost on every reload.

- **Recommended fix:** add a `notifications` table (with `profile_id`, `title`, `message`,
  `type`, `read_at`, `created_at`) plus CRUD routes, or explicitly remove the drawer from the
  UI and document notifications as out of scope.
- **Migration required:** **Yes** (new table).
- **Frontend impact:** hydrate from the API; mark-as-read becomes a PATCH.
- **Backend impact:** new route group.
- **Security impact:** none.
- **Test required:** yes.

### M-2 — Account deletion orphans Storage objects
**Severity: Medium | Status: Confirmed** (executed live: the `cvs` row was removed and the
Storage object survived).

`POST /api/account/delete` (`server.ts:1081`) → `deleteAccount` (`server/db/account.ts`) deletes
the auth user. The 26 profile-scoped tables cascade correctly — **verified live, zero
survivors** — but Storage has **no cascade**, so every CV file the user ever uploaded is
orphaned and permanently unreachable (the RLS policy compares the path's first segment to
`auth.uid()`, and the user no longer exists).

- **Recommended fix:** in `deleteAccount`, list and remove the user's `cv-files` folder
  **before** deleting the auth identity.
- **Migration required:** No.
- **Frontend impact:** none.
- **Backend impact:** `server/db/account.ts` gains a Storage sweep.
- **Security impact:** orphaned files are unreadable but consume quota; a user who re-registers
  with the same id could in principle inherit them.
- **Test required:** yes — upload a file, delete the account, assert the bucket is empty.

### M-3 — Dead legacy JSON auth surface
**Severity: Medium | Status: Confirmed.** `/api/auth/register`, `/api/auth/login`,
`/api/auth/logout` (`server.ts:241-352`) maintain a second credential store in
`.careerpilot_state.json` with `scrypt` hashes and self-issued session tokens. No frontend
caller exists.

- **Recommended fix:** delete the three routes and the `loadDatabase`/`saveDatabase`/
  `hashPassword` helpers, and delete `.careerpilot_state.json` from the repository.
- **Migration required:** No.
- **Frontend impact:** none.
- **Backend impact:** `server.ts` shrinks by ~120 lines.
- **Security impact:** reduces the surface; the file currently holds a `passwordHash`.
- **Test required:** yes — assert the routes are gone (404).

### M-4 — `/api/auth/reset-password` is a no-op
**Severity: Medium | Status: Confirmed.** `server.ts:353-360` returns a success message
without sending an email. A user is told a reset link was sent.

- **Recommended fix:** call `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, or
  remove the route.
- **Migration required:** No.
- **Frontend impact:** none (no caller).
- **Backend impact:** `server.ts:353`.
- **Security impact:** low — the message is deliberately non-committal, but it is misleading.
- **Test required:** yes.

### M-5 — `localStorage` caches a roadmap that is not the server's
**Severity: Medium | Status: Confirmed.** `localStorage.setItem('careerpilot_roadmap', …)`
(`:1923`) writes the locally-generated roadmap; it is read back at `:1084`. It can contain
local-only task ids that mean nothing server-side.

- **Recommended fix:** stop caching the roadmap in `localStorage` once H-1 is fixed, or cache
  only the server's DTO.
- **Migration required:** No.
- **Frontend impact:** one line removed.
- **Backend impact:** none.
- **Security impact:** none.
- **Test required:** no (covered by the H-1 test).

### M-6 — `public.skills` is not readable by authenticated users
**Severity: Medium | Status: Confirmed.** The anon probe returned 0 rows for `skills`. The
catalogue is global and shared, but no read policy exists, so only the service-role client can
read it — the frontend cannot resolve skill names to catalogue entries.

- **Recommended fix:** add a `SELECT` policy for authenticated users on `public.skills`.
- **Migration required:** **Yes** (a policy, not a schema change).
- **Frontend impact:** none.
- **Backend impact:** one policy.
- **Security impact:** low — the catalogue contains skill names, not user data.
- **Test required:** yes.

### M-7 — `/api/generate-cover-letter` persists nothing
**Severity: Medium | Status: Suspected.** The route (`server.ts:898`) is an AI route with
`requireAuth`, but it returns generated text without creating a `cover_letters` row. The
frontend's `saveCoverLetter` creates the row separately, so the flow works — but a user who
generates a letter and navigates away loses it.

- **Recommended fix:** decide whether the route should persist; if not, have the frontend call
  `saveCoverLetter` with the generated content (it may already do so — **this needs
  confirmation in the implementation phase**).
- **Migration required:** No.
- **Test required:** yes, once the intent is fixed.

---

## 14. Production Blockers

| ID | Severity | Blocker | Why it blocks production |
|---|---|---|---|
| **C-1** | Critical | Demo seed replaces real experience/education | Every real user's career history is destroyed on first load. Shipping this means every user sees "Meridian Tech Labs" instead of their own history, and their real data is gone from the database. **Unacceptable.** |
| **C-2** | Critical | Public profile endpoint ignores `is_public` | An explicit privacy setting is not honoured; employment history and bio are published to unauthenticated callers. **A confidentiality breach.** |
| **H-1** | High | No roadmap is ever created | The flagship feature — the career roadmap — is not persisted at all for a new user. The app appears to work in-session but the roadmap is lost on reload. |
| **H-2** | High | Skill levels are not persisted through a dedicated route | The career-gap analysis shown to the user is not persisted; it survives only via the endpoint C-1 must retire. |

**Additional pre-production requirements (not B.3.8 code defects, but launch blockers):**

- **P-1 — No rate limiting on the AI routes.** `/api/copilot`, `/api/analyze-career`,
  `/api/optimize-cv`, `/api/mock-interview`, `/api/suggest-summary` and
  `/api/generate-cover-letter` call Gemini with the app's key. An authenticated user can
  drive unbounded spend. **Add `express-rate-limit` keyed on the verified user id.**
- **P-2 — No CORS configuration.** The API is same-origin today, which is safe, but any future
  separate frontend origin would be silently broken (or, if a permissive policy is added
  later, silently opened). Add an explicit allow-list.
- **P-3 — `GEMINI_API_KEY` handling.** `dotenv.config()` loads `.env`, which is gitignored and
  absent from the repo — correct — but the server starts and serves requests with no key
  configured (it only logs "API key should be set"). Add a startup check for the AI routes.
- **P-4 — The committed CI workflow needs repository secrets.** `.github/workflows/ci.yml`
  runs `npm test` with `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
  from repository secrets. Until those are configured the test step fails with the loader's
  "missing required Supabase credentials" message rather than skipping.

---

## 15. Non-Blockers / Technical Debt

| ID | Severity | Item |
|---|---|---|
| L-1 | Low | Missing indexes on `experiences.user_id`, `educations.user_id`, `user_preferences.user_id`, `user_skills.user_id` |
| L-2 | Low | `public.skills` has no owner; `resolveSkillIds` (`projects.ts`) does check-then-insert without a conflict handler → a concurrent insert can throw a duplicate-key error |
| L-3 | Low | `applied_job` and `saved_job` activity types are never emitted, although the matching actions exist |
| L-4 | Low | The public-profile DTO hard-codes `certifications: []` and `projects: []` (`server.ts:1025-1027`), so a public profile omits data the user has |
| L-5 | Low | Internal error detail is returned to the client at `server.ts:631` |
| L-6 | Low | `experiences[].achievements` is flattened into `description` with `\n` — the structure is lost |
| L-7 | Low | The archived migration `archive/202510190001` declares tables and columns that do not exist live (`profiles.auth_uid`, `public.education`, `public.experience`) — a trap for the next reader |
| L-8 | Low | `skills` has no `updated_at`; `user_skills.years_experience` is `numeric` while the TS type is `number | null` — acceptable |

---

## 16. Recommended Implementation Order

```
Phase 1 — STOP THE BLEEDING  (must land before any further user traffic)
  1. C-1  retire POST /api/state as a writer; add GET/PUT for experiences + educations
  2. C-2  add the is_public gate to /api/profile/public/:username; delete the wrong comment
  3. H-1  create the roadmap server-side on onboarding (add createRoadmap to roadmapApi)
  4. H-2  add /api/user-skills routes; make skill edits server-backed

Phase 2 — CLOSE THE SECURITY / COST GAPS
  5. P-1  rate-limit the AI routes (per verified user id)
  6. M-2  sweep the cv-files folder on account deletion
  7. M-6  add a SELECT policy on public.skills
  8. P-2  explicit CORS allow-list; P-3 startup key check; L-5 stop leaking error details

Phase 3 — REMOVE THE LEGACY LAYER
  9. M-3  delete /api/auth/register|login|logout + the JSON file
  10. M-4 implement or delete /api/auth/reset-password
  11. M-5 stop caching the roadmap in localStorage
  12. M-7 settle /api/generate-cover-letter's persistence contract

Phase 4 — CLOSE THE FEATURE GAPS
  13. M-1  notifications table + routes (or remove the drawer)
  14. L-3  emit applied_job / saved_job activity events

Phase 5 — HARDEN THE SUITE
  15. Tests for the 19 uncovered routes (upload, account lifecycle, public profile first)
  16. Cross-user (IDOR) tests for the 18 by-id routes
  17. New-session and server-restart tests for the remaining domains
  18. A logout/login round-trip test (none exists today)
  19. A schema-drift test: assert the live schema has the columns the code writes
  20. A Storage bucket-wide "no leftovers" assertion
```

**Do not do first:** anything cosmetic. The schema, RLS, Storage policies, ownership model and
test harness are sound; they are not the bottleneck.

---

## 17. B.3.8 Implementation Plan

### Phase 1 — Stop the bleeding

**1.1 C-1 (Critical)**

- **Backend:** add `server/db/experiences.ts` and `server/db/educations.ts` with
  `listExperiences(profileId)`, `createExperience`, `updateExperience`, `deleteExperience`
  (and the education equivalents), each scoped by `user_id`. Add
  `GET/POST/PATCH/DELETE /api/experiences` and `/api/educations` under `requireAuth` with
  `isUuid` id validation and `str()` length caps. **Change `saveState` to stop deleting and
  re-inserting** — either remove the experiences/educations branches or make them additive.
- **Frontend:** in `updateProfile` (`CareerContext.tsx:2192`), route `updates.experiences` and
  `updates.education` to the new endpoints instead of the local-only fallback at `:2267`.
  Remove `experiences`/`education` from the `POST /api/state` payload.
- **Auto-sync effect (`:1918-1925`):** gate it on `authToken` **and** on hydration having
  completed (a `hydrated` flag set at the end of `hydrate()`), so it never fires with
  pre-hydration state. Better: delete the aggregate sync entirely once every domain has a
  dedicated route.
- **Demo seed:** the demo persona must not be the initial state for an authenticated user.
  Initialise `profile` empty (or from the server once the session resolves) and use the demo
  persona only for the pre-auth marketing/demo surface.
- **Migration:** none.
- **Tests:** (a) "a real experience survives the state sync" — create a user with an
  experience, POST the app's payload, assert the row is intact; (b) "PUT /api/experiences
  round-trips"; (c) "the demo persona is never written to the database".

**1.2 C-2 (Critical)**

- **Backend:** in `server.ts:963`, after `findProfileByUsername`, add
  `if (!profile.is_public) return res.status(404).json({ error: 'Public profile not found' });`
  and delete the incorrect comment at `:973-976`.
- **Migration:** none.
- **Tests:** `is_public = false` → 404; `is_public = true` → 200 and the payload contains the
  expected fields; unauthenticated → never 200 for a private profile.

**1.3 H-1 (High)**

- **Frontend:** add `createRoadmap(payload)` to `src/lib/roadmapApi.ts`; call it from
  `setPrimaryTargetRole` (or onboarding) when `GET /api/roadmap` returns `null`, then persist
  the generated phases/milestones/tasks via `addRoadmapTask`.
- **Migration:** none.
- **Tests:** "a newly onboarded user has a roadmap that survives a reload"; "the reload does
  not replace the server roadmap with the local one".

**1.4 H-2 (High)**

- **Backend:** add `GET/POST/PATCH/DELETE /api/user-skills` owned by `server/db/userSkills.ts`.
- **Frontend:** `updateSkillLevel` / `addCustomSkill` / `removeSkill` become async and call
  the API; the career analysis reads the persisted levels.
- **Migration:** none.
- **Tests:** "a skill level change survives a reload"; "the analysis gap matches the stored level".

### Phase 2 — Security and cost

- **P-1:** add `express-rate-limit`; key on `req.authUser.id` for the AI routes; a modest
  per-user budget is enough.
- **M-2:** in `deleteAccount`, list and remove `cv-files/{userId}` before deleting the auth
  user.
- **M-6:** add `CREATE POLICY skills_select_authenticated ON public.skills FOR SELECT TO authenticated`.
- **P-2/P-3/L-5:** explicit CORS allow-list; a startup check that `GEMINI_API_KEY` is present;
  replace `details: error?.message` with a generic message and log the detail server-side.

### Phase 3 — Retire the legacy layer

- **M-3:** delete the three legacy auth routes and the JSON-file helpers; delete
  `.careerpilot_state.json` (and its `.gitignore` entry); the test runner's state-file guard
  already tolerates its absence.
- **M-4:** implement the reset via `supabase.auth.resetPasswordForEmail`, or delete the route.
- **M-5:** drop the `careerpilot_roadmap` localStorage key.
- **M-7:** decide and document the `/api/generate-cover-letter` persistence contract.

### Phase 4 — Feature gaps

- **M-1:** add a `notifications` table + routes, or remove the drawer and state the limitation.
- **L-3:** emit `applied_job` and `saved_job` from the job-application and saved-role handlers.

### Phase 5 — Test hardening

Add, in this order of value: the 19 uncovered routes (upload → account lifecycle → public
profile), IDOR tests for the 18 by-id routes, new-session + server-restart tests for the
remaining domains, a logout/login round-trip test, a schema-drift test, and a bucket-wide
Storage assertion.

---

## 18. Verification Evidence

All checks were executed against the **live** Supabase project and a **real** server process.
No persistent data was altered: every probe user, row and Storage object was deleted, and the
database was re-counted afterwards.

| # | Check | Method | Result |
|---|---|---|---|
| E-0a | Live schema (27 tables, all columns, types, nullability) | PostgREST OpenAPI spec at `/rest/v1/` | Captured; all code-written columns exist and types match |
| E-0b | Live CHECK constraints | Deliberate invalid inserts | `roadmap_tasks.status` accepts all 5; rejects `weird_value`. `activities.action_type` rejects `completed_course`. `job_applications.stage` rejects unknown stages |
| E-1 | **C-1 data loss, end-to-end** | Real `POST /api/state` over HTTP with a real JWT; a probe user's `experiences` row was read before and after | **BEFORE** `[{company:"REAL COMPANY"}]` → **AFTER** `[{company:"Meridian Tech Labs"}]` — **real data replaced by the demo seed** |
| E-2 | **C-2 privacy breach** | Real `GET /api/profile/public/:username` with **no** auth header, against a user with `is_public = false` | **HTTP 200** — body contained `"experiences":[{"company":"Secret Corp","role":"Secret Role"}]` and the private bio. **Private data leaked to an unauthenticated caller** |
| E-3 | M-2 Storage orphan | Upload a file → delete the auth user → re-list the folder | `cvs` row → 0, but the Storage object **remained** → orphan confirmed and cleaned |
| E-4 | Account-deletion cascade | Seed **all 26** profile-scoped tables → delete the auth user → re-count every table | **Zero survivors** — the cascade is complete. Only the global `skills` row survived (by design) |
| E-5 | RLS, unauthenticated | Anon client selects 10 tables | **0 rows** from all 10 — RLS active everywhere |
| E-6 | RLS, authenticated | Real sign-in; read own profile, read another's, insert with another's id | Own → 1 row; other's → 0 rows; insert with another id → **rejected by RLS** |
| E-7 | Storage RLS | Real sign-in; upload/list/delete in own and another user's folder | Own → ok; another → **rejected** (`violates row-level security policy`); other's list → `[]` |
| E-8 | Bucket configuration | `storage.listBuckets()` | `cv-files`: `public: false`, 10 MB limit, 5 allowed MIME types |
| E-9 | Uniqueness constraints | Deliberate duplicate inserts | `profiles.username`, `user_preferences.user_id`, `user_skills(user_id,skill_id)`, `roadmaps.profile_id`, `saved_roles(profile_id,role_id)`, `profile_links(profile_id,kind)` — **all enforced** |
| E-10 | Route authentication | Parsed all 91 route blocks from `server.ts` | 83 protected (`requireAuth` / `verifySupabaseToken`); 8 public — all expected except `POST /api/roadmap` and `DELETE /api/roadmap`, which are protected but uncalled |
| E-11 | Route test coverage | Matched every route's static prefix against the 4 test files | **72/91 covered (79 %)**; 19 uncovered, listed in §11 |
| E-12 | Frontend callers | `grep` for every `/api/…` path in `src/` | **11 dead endpoints**; `POST /api/roadmap` and `DELETE /api/roadmap` confirmed absent from `src/lib/roadmapApi.ts` |
| E-13 | localStorage / sessionStorage / IndexedDB / cookies | Full grep over `src/` and `server.ts` | 5 cache keys + 2 removal-only token keys; **0** `sessionStorage`, **0** IndexedDB, **0** cookies |
| E-14 | Optimistic-only mutations | Read every `setX(prev => …)` mutation site | **None** for server-backed domains — each follows an awaited server DTO |
| E-15 | Auto-sync gating | Read `CareerContext.tsx:1918-1925` | The effect's dependency array does **not** include `authToken` and there is **no** hydration-complete guard |
| E-16 | `is_public` existence | OpenAPI spec + a write + a read-back | The column **exists**, is `boolean NOT NULL DEFAULT false`, and round-trips |
| E-17 | Activity type coverage | Compared the TS union, the DB CHECK and the frontend's `actionType:` call sites | Union ↔ CHECK match exactly; `applied_job` and `saved_job` have **0** frontend call sites |
| E-18 | Notification persistence | Grep for `notifications` in `server/` and the live schema | **No table, no route**; two hard-coded in-memory entries |
| E-19 | Post-audit database state | Re-counted 26 tables + `auth.users` + the bucket | `auth.users` **0**; every domain table **0**; `cv-files` **0 folders** |
| E-20 | Post-audit working tree | `git status` + `md5sum .careerpilot_state.json` | Clean; state file `7ee01fe3d0eb0e1efd33932c42905c07`, unchanged; HEAD still `13b3fce` |

---

## Final Verdict

| Metric | Value |
|---|---|
| **Production readiness** | **5/10** |
| **Critical blockers** | **2** (C-1, C-2) |
| **High-priority gaps** | **2** (H-1, H-2) |
| **Medium gaps** | **7** (M-1 … M-7) |
| **Low gaps** | **8** (L-1 … L-8) |
| **Already verified — no action required** | **21** findings (auth core, ownership, RLS, Storage policies, CV system, roadmap read path, documents design, profile API, account-deletion cascade, all 91 route authorizations, the live schema/DTO match, the test harness) |

**Production readiness is 5/10, not lower**, because the *hard* part is already right: the
ownership model, RLS, Storage policies, the schema, the DTOs and the test harness are all
sound and verified. What is missing is the last mile — the frontend still runs the pre-B.3.6
aggregate write path, and one route ignores a privacy flag that exists.

**Recommended next phase: B.3.9 — Persistence Cutover & Privacy Enforcement.**
Implement Phase 1 of §16 in order: C-1 → C-2 → H-1 → H-2. Every one of these is confined to
the write path and requires **no migration**, so the whole phase can ship without touching the
database schema.

**Exact implementation order:**
1. **C-1** — retire `POST /api/state` as a writer; add `/api/experiences` and `/api/educations`;
   gate the auto-sync on `authToken` + hydration-complete; stop the demo persona being the
   authenticated initial state.
2. **C-2** — enforce `is_public` on `/api/profile/public/:username`; delete the incorrect
   comment.
3. **H-1** — create the roadmap server-side on onboarding.
4. **H-2** — add `/api/user-skills`; make skill edits server-backed.
5. **P-1 → M-2 → M-6 → P-2 → P-3** — rate limiting, Storage sweep on account deletion, the
   `skills` read policy, CORS, the startup key check.
6. **M-3 → M-4 → M-5 → M-7** — remove the legacy JSON auth layer and the remaining dead code.
7. **M-1 → L-3** — notifications persistence, the two missing activity events.
8. **Test hardening** — the 19 uncovered routes, the 18 IDOR gaps, the logout/login
   round-trip, the schema-drift test, the Storage bucket assertion.

**Verification gate for B.3.9:** `npm test` must pass with the new tests added, `npm run lint`
and `npm run build` must pass, `npm audit` must report 0 vulnerabilities, and a fresh-clone
run must leave the database with **0** rows in every domain table and **0** Storage folders.

---

**B.3.8 STATUS: AUDIT COMPLETE — NO IMPLEMENTATION PERFORMED.**
No application code, migration, test or database row was changed. The working tree is clean,
the state file is byte-unchanged, and HEAD remains `13b3fce`.
