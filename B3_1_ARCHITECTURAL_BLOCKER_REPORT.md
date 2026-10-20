# B.3.1 — ARCHITECTURAL BLOCKER REPORT

Phase: B.3.1 — AUDIT + PLAN ONLY. No database, `src/`, `server.ts`, migration, or RLS changes made.

---

## 1. Current Authentication

**Exact current flow (verified in source):**

1. **Sign up** — `POST /api/auth/register` (`src/context/CareerContext.tsx:1542`)
   - Body `{ name, email, password }`
   - Server (`server.ts:111`) validates presence, checks email uniqueness in the JSON file, generates `id = user-${Date.now()}` (**not a UUID**), hashes the password with a per-user salt (`crypto.randomBytes(16)`, `hashPassword`), creates a 32-byte hex session token, stores `currentDb.sessions[token] = newUser.id`.
   - Response `{ success, token, user: { id, name, email } }`; the frontend stores `careerpilot_token` + `careerpilot_user` in `localStorage`.

2. **Sign in** — `POST /api/auth/login` (`src/context/CareerContext.tsx:1521`)
   - Body `{ email, password }`; server looks the user up in the JSON file, compares the salted hash, issues a new 32-byte hex token, stores it in `currentDb.sessions`.
   - Same response/storage shape as register.

3. **Token creation** — `crypto.randomBytes(32).toString('hex')` in `server.ts`; stored only in `.careerpilot_state.json`.

4. **Token storage (frontend)** — `localStorage['careerpilot_token']` and `localStorage['careerpilot_user']` (`CareerContext.tsx:1530-1531`, `1552-1553`).

5. **Token read** — `CareerContext.tsx:389-390`:
   ```ts
   const [authToken, setAuthToken] = useState<string | null>(() => {
     return localStorage.getItem('careerpilot_token') || 'demo-session-token-123';
   });
   ```
   **A hardcoded fallback token `'demo-session-token-123'` is used when nothing is stored.** The seeded JSON file contains that exact token mapped to `user-default-1`, so an unauthenticated visitor is silently treated as the demo user.

6. **Token refresh** — **none**. There is no refresh, no expiry, and no rotation. Tokens live in `localStorage` until logout.

7. **Sign out** — `POST /api/auth/logout` (`CareerContext.tsx:1563`) sends the token; the server deletes the session entry; the frontend clears `careerpilot_token`/`careerpilot_user`.

8. **Every API request that sends the token** (7 of 16 `fetch` calls):
   | Site | Endpoint |
   |---|---|
   | `CareerContext.tsx:1079` | `GET /api/profile/check-username` |
   | `CareerContext.tsx:1349` | `POST /api/state` |
   | `CareerContext.tsx:1563` | `POST /api/auth/logout` |
   | `SettingsView.tsx:72` | `POST /api/account/change-password` |
   | `SettingsView.tsx:101` | `POST /api/account/change-email` |
   | `SettingsView.tsx:129` | `POST /api/account/delete` |
   | `CareerContext.tsx:1081` | (second token header, AI call) |

9. **Requests that send NO token** (9): `/api/auth/reset-password`, `/api/mock-interview`, `/api/generate-cover-letter`, `/api/suggest-summary`, `/api/auth/login`, `/api/auth/register`, `/api/analyze-career`, `/api/resumes/upload`, `/api/optimize-cv`, `/api/copilot`.
   **None of the AI/CV endpoints verify a token server-side** — they are completely unauthenticated. This is a pre-existing finding that directly affects Groups B–F.

10. **Frontend auth state/context** — `CareerContext.tsx` holds `authToken`, `currentUser`, and exposes `login`, `register`, `logout` (lines ~1521-1570). `src/components/auth/AuthModal.tsx` drives the modal UI and calls the reset-password endpoint.

11. **Components depending on the legacy session model** — `AuthModal.tsx`, `SettingsView.tsx` (3 account calls), `CareerContext.tsx` (all state sync + auth actions), and `AppShell.tsx` / `App.tsx` via the context.

---

## 2. Supabase Auth Target

**Target flow (design only — not implemented):**

| Concern | Target behaviour |
|---|---|
| Client | `@supabase/supabase-js` browser client (`supabase.auth.*`), `persistSession: true` (Supabase stores the session in `localStorage` under its own key) |
| Sign up | `supabase.auth.signUp({ email, password })` → user row in `auth.users`; server-side trigger creates the `public.profiles` row (id = `auth.users.id`) |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` → session with `access_token` + `refresh_token` |
| Token storage | Managed by the Supabase client (not `careerpilot_token`); `getSession()`/`onAuthStateChange` expose the token |
| Token refresh | Automatic — the client refreshes on expiry and emits `TOKEN_REFRESHED`; no app code needed |
| Session persistence | Automatic; the client restores the session on page load (`getSession()` → `isAuthenticated`) |
| Authenticated API requests | `Authorization: Bearer <supabase access_token>` on every `/api/*` call, sourced from `supabase.auth.getSession()` — never from `localStorage['careerpilot_token']` |
| `/api/auth/me` | Server verifies the JWT via `supabase.auth.getUser(token)` → returns `auth.users.id` + `public.profiles` row. (Already implemented in B.3 Group A.) |
| Password change | `supabase.auth.updateUser({ password })` for the new password; re-authentication via `signInWithPassword` for the current one. Server route `/api/account/change-password` already implements the server-side equivalent. |
| Email change | `supabase.auth.updateUser({ email })` — Supabase sends a confirmation to the new address; the change applies only after the user confirms. Server route already implemented via admin API. |
| Account deletion | `supabase.auth.signOut()` + server route `/api/account/delete` (already implemented via admin API, target = verified user only). |
| Authorization | Server derives identity **only** from the verified JWT (`auth.uid()` semantics). Client-supplied user ids are ignored. Already implemented for all Group A routes. |

**Backend identity model (already in place):** `Authorization: Bearer <jwt>` → `verifySupabaseToken()` → `supabase.auth.getUser()` → `user.id` → `profiles.id` (FK `profiles_id_fkey` → `auth.users(id) ON DELETE CASCADE`).

---

## 3. Frontend Compatibility Gap

**Exact files that must change (all under `src/`, currently untouched):**

| File | Line(s) | Required change |
|---|---|---|
| `src/context/CareerContext.tsx` | 389-390 | Replace the `localStorage['careerpilot_token']` / `'demo-session-token-123'` fallback with the Supabase session accessor. The hardcoded demo-token fallback must be removed. |
| `src/context/CareerContext.tsx` | 1521-1535 (`login`) | Replace `fetch('/api/auth/login')` with `supabase.auth.signInWithPassword`; keep the same public signature/return shape `{ success }` / `{ success, error }` so callers are unaffected. |
| `src/context/CareerContext.tsx` | 1542-1558 (`register`) | Replace `fetch('/api/auth/register')` with `supabase.auth.signUp`. |
| `src/context/CareerContext.tsx` | 1563-1571 (`logout`) | Replace `fetch('/api/auth/logout')` with `supabase.auth.signOut`. |
| `src/context/CareerContext.tsx` | 1081, 1353, 1565 | All `Authorization` headers must carry the Supabase access token, obtained from `supabase.auth.getSession()` (not `authToken` state). |
| `src/context/CareerContext.tsx` | 411-560, 757-971, 1305 | State restore from `localStorage` — decide per-field whether to keep local hydration or hydrate from the server once Group A/B persistence is complete. |
| `src/components/auth/AuthModal.tsx` | 46 | `POST /api/auth/reset-password` — should become `supabase.auth.resetPasswordForEmail`. |
| `src/components/views/SettingsView.tsx` | 72, 101, 129 | The three account calls already work against the migrated backend; they only need the Supabase token instead of `authToken`. |

**Not affected:** `InterviewsView.tsx` and the other AI/CV callers send no token today; they will need one for Groups B–F regardless.

**New runtime dependency:** `@supabase/supabase-js` in the browser bundle. It is already installed (as a dependency for the server) and tree-shakes to a browser-safe client — the same package serves both, with different keys (publishable/anon key in the browser, service-role key server-side only).

**Required browser-side env var:** the publishable/anon key. **The service-role key must never be exposed to the browser.**

---

## 4. `/api/state` Complete Field Mapping

**Current source:** `POST /api/state` from `src/context/CareerContext.tsx:1349` with body `{ profile, targetRole, savedRoles, skills, roadmapPhases, projects, evidenceItems, activeCV, cvVersions, applications, interviewSessions, settings }`.

**Important:** the frontend **never calls `GET /api/state`**. State is restored from `localStorage` (7 keys: `careerpilot_profile`, `careerpilot_roadmap`, `careerpilot_settings`, `careerpilot_skills`, `careerpilot_target_role`, plus `careerpilot_token`/`careerpilot_user`). The server endpoint is a **write-only sink** today; `GET /api/state` exists in the backend but has no consumer.

| State Field | Current Source | PostgreSQL Target | Exists? | Used By Frontend? | Required? | Action |
|---|---|---|---|---|---|---|
| `profile.name` | `UserProfile.name` | `public.profiles.full_name` | Yes | Yes | Yes | Map |
| `profile.preferredName` | `UserProfile` | — | No | Yes (display) | No (cosmetic) | Report as unmapped; add column or accept loss |
| `profile.email` | `UserProfile.email` | `auth.users.email` (read-only) | Yes (auth) | Yes | Yes | Source from Auth, not state |
| `profile.phone` | `UserProfile.phone` | `public.profiles.phone` | Yes | Yes | Yes | Map |
| `profile.avatarUrl` | `UserProfile.avatarUrl` | `public.profiles.avatar_url` | Yes | Yes | Yes | Map |
| `profile.currentTitle` | `UserProfile.currentTitle` | — (closest: `profiles.target_role`) | Partial | Yes | Yes | Map to `target_role` or add `current_title` |
| `profile.currentPosition` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.currentCompany` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.yearsOfExperience` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.industry` | `UserProfile.industry` | `public.profiles.target_industry` | Yes | Yes | Yes | Map |
| `profile.location` | `UserProfile.location` | — | No | Yes | Medium | Report |
| `profile.country` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.city` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.timezone` | `UserProfile` | — | No | Yes | Low | Report |
| `profile.preferredLanguage` | `UserProfile` | `public.user_preferences.language` | Partial | Yes | Low | Map to preferences |
| `profile.headline` | `UserProfile` | — | No | Yes | Medium | Report |
| `profile.bio` | `UserProfile.bio` | `public.profiles.bio` | Yes | Yes | Yes | Map |
| `profile.professionalSummary` | `UserProfile` | — | No | Yes | Medium | Report |
| `profile.username` | `UserProfile.username` | `public.profiles.username` (UNIQUE) | Yes | Yes | Yes | Map |
| `profile.isPublic` | `UserProfile.isPublic` | — | No | Yes (declared) | Medium | **No column — see §7** |
| `profile.careerState` | `UserProfile.careerState` | `public.profiles.user_type` (CHECK student\|graduate\|working\|career_shift) | Partial | Yes | Medium | Map with value normalisation |
| `profile.careerGoal` | `UserProfile.careerGoal` | `public.profiles.career_goal` | Yes | Yes | Yes | Map |
| `profile.customGoalText` | `UserProfile` | — | No | Yes | Medium | Report |
| `profile.onboardingCompleted` | `UserProfile` | `public.profiles.onboarding_completed` | Yes | Yes | Yes | Map |
| `profile.education[]` | `UserEducationEntry[]` | `public.educations` (institution, degree, field_of_study, start_date, end_date, is_current, description) | Yes | Yes | Yes | Map (currently mapped) |
| `profile.experiences[]` | `UserExperienceEntry[]` | `public.experiences` (company, job_title, location, start_date, end_date, is_current, description, employment_type) | Yes | Yes | Yes | Map (currently mapped) |
| `profile.certifications[]` | `UserCertificationEntry[]` | — | No | Yes | Medium | **New table needed** |
| `profile.languages[]` | `UserLanguageEntry[]` | — | No | Yes | Low | Report |
| `profile.links` | `ProfessionalLinks` | — | No | Yes | Medium | **New table needed** |
| `profile.careerIdentity` | nested object (7 string fields) | — | No | Yes | Medium | **New table needed** |
| `targetRole` | `TargetRole` (16 fields) | `public.profiles.target_role` (title only) | Partial | Yes | Yes (title) | Map title; the other 15 fields (overview, responsibilities, requiredSkills, preferredSkills, tools, salaryRange, careerProgression, relatedRoles, …) have no target | Report; these are static catalog data, better served from a `roles` catalog table than per-user |
| `savedRoles[]` | `TargetRole[]` (2) | — | No | Yes | Medium | **New table needed** (or catalog) |
| `skills[]` | `CareerSkill[]` (10) | `public.skills` + `public.user_skills` (proficiency, years_experience) | Yes | Yes | Yes | Map (currently mapped) |
| `roadmapPhases[]` | `RoadmapPhase[]` (6: id, phaseNumber, title, description, milestones[], isUnlocked) | — | No | Yes | **Yes** | **New tables needed** (roadmap, phases, milestones, tasks) |
| `roadmapPhases[].milestones[]` | `RoadmapMilestone[]` (id, title, description, tasks[], completedTasksCount) | — | No | Yes | Yes | **New tables needed** |
| `roadmapPhases[].milestones[].tasks[]` | `RoadmapTask[]` (id, title, description, status, skillId, skillName, deadline, resourceId, resourceTitle, evidenceId, estimatedHours) | — | No | Yes | Yes | **New tables needed** |
| `projects[]` | `CareerProject[]` (4: id, title, goal, description, difficulty, skills[], tasks[], deliverables[], status, repositoryUrl, demoUrl, documentation, createdAt, completedAt) | — | No | Yes | Yes | **New table needed** |
| `evidenceItems[]` | `EvidenceItem[]` (2: id, title, type, description, url, skillNames[], projectId, verified, dateAdded) | — | No | Yes | Yes | **New table needed** |
| `activeCV` | `CVProfile` (11) | — | No | Yes | Yes | **New table needed** (links to `cv_versions`) |
| `cvVersions[]` | `CVVersion[]` (1: id, name, targetRoleTitle, createdAt, profile, atsAnalysis) | — | No | Yes | Yes | **New tables needed** (`cvs`, `cv_versions`) |
| `applications[]` | `JobApplication[]` (2: id, jobId, company, role, location, workMode, stage, appliedDate, lastUpdated, nextAction, nextActionDate, notes, salaryDiscussed, interviewStageDetails) | — | No | Yes | Yes | **New table needed** |
| `interviewSessions[]` | `MockInterviewSession[]` (1: id, roleTitle, type, question, userAnswer, aiFeedback, createdAt) | — | No | Yes | Yes | **New table needed** |
| `settings.language` | `UserSettings.language` | `public.user_preferences.language` | Yes | Yes | Yes | Map |
| `settings.theme` | `UserSettings.theme` | `public.user_preferences.theme` | Yes | Yes | Yes | Map |
| `settings.emailAlerts` | `UserSettings.emailAlerts` | `public.user_preferences.notifications_enabled` (approx) | Partial | Yes | Low | Report — one boolean for 4 flags |
| `settings.roadmapReminders` | `UserSettings` | — | No | Yes | Low | Report |
| `settings.interviewReminders` | `UserSettings` | — | No | Yes | Low | Report |
| `settings.weeklyProgressSummary` | `UserSettings` | — | No | Yes | Low | Report |
| `settings.allowAiContextLearning` | `UserSettings` | — | No | Yes | Medium | Report — privacy-relevant, should be persisted |

**Summary:** 19 of the 12 top-level groups have a complete target; **8 domains have no target at all** (`roadmapPhases`+milestones+tasks, `projects`, `evidenceItems`, `activeCV`, `cvVersions`, `applications`, `interviewSessions`, `savedRoles`), plus 19 profile fields and 4 settings fields. The B.3 implementation returns these in an `unmappedFields` array and logs them — nothing is silently dropped.

---

## 5. Existing PostgreSQL Schema (authoritative)

Verified by direct SQL against `ciihprsfdojzvjnqgbxl`. **Only 6 tables exist in `public`:**

| Table | Columns | Keys / constraints |
|---|---|---|
| `public.profiles` | `id` uuid, `full_name` text, `username` text, `avatar_url` text, `phone` text, `bio` text, `user_type` text, `career_goal` text, `target_role` text, `target_industry` text, `onboarding_completed` bool, `created_at` timestamptz, `updated_at` timestamptz | PK `profiles_pkey(id)`; **FK `profiles_id_fkey` → `auth.users(id) ON DELETE CASCADE`**; UNIQUE `profiles_username_key(username)`; CHECK `user_type IN ('student','graduate','working','career_shift')`; indexes: `profiles_pkey`, `profiles_username_key`, `idx_profiles_user_type` |
| `public.user_preferences` | `user_id` uuid, `theme` text, `language` text, `notifications_enabled` bool, `created_at`, `updated_at` | FK `user_id` → `profiles.id` |
| `public.user_skills` | `id` uuid, `user_id` uuid, `skill_id` uuid, `proficiency` int, `years_experience` numeric, `created_at`, `updated_at` | FK `user_id` → `profiles.id`; FK `skill_id` → `skills.id`; UNIQUE `(user_id, skill_id)` |
| `public.skills` | `id` uuid, `name` text, `category` text, `description` text, `created_at` | catalog (no owner) |
| `public.educations` | `id` uuid, `user_id` uuid, `institution` text, `degree` text, `field_of_study` text, `start_date` date, `end_date` date, `is_current` bool, `description` text, `created_at`, `updated_at` | FK `user_id` → `profiles.id` |
| `public.experiences` | `id` uuid, `user_id` uuid, `company` text, `job_title` text, `employment_type` text, `start_date` date, `end_date` date, `is_current` bool, `location` text, `description` text, `created_at`, `updated_at` | FK `user_id` → `profiles.id` |

- **RLS:** enabled on all 6. Policies use `auth.uid()` — e.g. `profiles`: SELECT/INSERT/UPDATE/DELETE on `auth.uid() = id`.
- **Storage:** `storage` schema present (default Supabase buckets infrastructure).
- **`supabase_migrations.schema_migrations` is EMPTY** — migration `202510190001` was rolled back entirely (transactional DDL) when its policy statement failed. The 6 tables above are the project's pre-existing schema, not artifacts of that migration.
- All tables currently hold **0 rows**; `auth.users` holds **0 rows**.

---

## 6. Missing Domain Tables (proposed — justified by actual app behaviour)

Only tables required by functionality the app actively implements:

| Table | Purpose | PK | Owner | Key columns | FKs | Uniqueness | On delete | RLS | Service-role server access |
|---|---|---|---|---|---|---|---|---|---|
| `public.roadmaps` | One roadmap per user | `id` uuid | `user_id` → `profiles.id` | `title`, `status`, `progress_pct`, `generated_at`, `updated_at` | `user_id` | UNIQUE(`user_id`) | CASCADE | Yes | Yes |
| `public.roadmap_phases` | Ordered phases of a roadmap | `id` uuid | `roadmap_id` | `phase_number` int, `title`, `description`, `is_unlocked` bool, `sort_order` int | `roadmap_id` | UNIQUE(`roadmap_id`, `phase_number`) | CASCADE | Yes | Yes |
| `public.roadmap_milestones` | Milestones within a phase | `id` uuid | `phase_id` | `title`, `description`, `completed_tasks_count` int | `phase_id` | — | CASCADE | Yes | Yes |
| `public.roadmap_tasks` | Tasks within a milestone (progress unit) | `id` uuid | `milestone_id` | `title`, `description`, `status`, `skill_id` → `skills.id`, `deadline` date, `evidence_id`, `estimated_hours` int, `completed` bool | `milestone_id`, `skill_id` | — | CASCADE | Yes | Yes |
| `public.projects` | User portfolio projects | `id` uuid | `user_id` → `profiles.id` | `title`, `goal`, `description`, `difficulty`, `status`, `repository_url`, `demo_url`, `documentation`, `created_at`, `completed_at` | `user_id` | — | CASCADE | Yes | Yes |
| `public.project_skills` | Project↔skill link | `id` uuid | `project_id` | `skill_id` → `skills.id` | `project_id`, `skill_id` | UNIQUE(`project_id`,`skill_id`) | CASCADE | Yes | Yes |
| `public.evidence_items` | Evidence supporting a skill | `id` uuid | `user_id` → `profiles.id` | `title`, `type`, `description`, `url`, `verified` bool, `date_added` date, `project_id` → `projects.id` | `user_id`, `project_id` | — | CASCADE | Yes | Yes |
| `public.evidence_skills` | Evidence↔skill link | `id` uuid | `evidence_id` | `skill_id` → `skills.id` | `evidence_id`,`skill_id` | UNIQUE pair | CASCADE | Yes | Yes |
| `public.cvs` | Active CV document | `id` uuid | `user_id` → `profiles.id` | `name`, `target_role_title`, `is_active` bool, `created_at` | `user_id` | — | CASCADE | Yes | Yes |
| `public.cv_versions` | Immutable CV snapshots | `id` uuid | `cv_id` | `version` int, `profile_json` jsonb, `ats_analysis` jsonb, `created_at` | `cv_id` | UNIQUE(`cv_id`,`version`) | CASCADE | Yes | Yes |
| `public.saved_roles` | Roles the user bookmarked | `id` uuid | `user_id` → `profiles.id` | `role_id` text, `title`, `category`, `level`, `payload_json` jsonb, `saved_at` | `user_id` | UNIQUE(`user_id`,`role_id`) | CASCADE | Yes | Yes |
| `public.job_applications` | Application tracking | `id` uuid | `user_id` → `profiles.id` | `job_id` text, `company`, `role`, `location`, `work_mode`, `stage`, `applied_date` date, `last_updated`, `next_action`, `next_action_date` date, `notes`, `salary_discussed` bool, `interview_stage_details` jsonb | `user_id` | — | CASCADE | Yes | Yes |
| `public.interview_sessions` | Mock interview records | `id` uuid | `user_id` → `profiles.id` | `role_title`, `type`, `question`, `user_answer`, `ai_feedback`, `created_at` | `user_id` | — | CASCADE | Yes | Yes |
| `public.profile_certifications` | Certification entries | `id` uuid | `user_id` → `profiles.id` | `name`, `issuer`, `issue_date` date, `url`, `credential_id` | `user_id` | — | CASCADE | Yes | Yes |
| `public.profile_links` | Professional links | `id` uuid | `user_id` → `profiles.id` | `kind` text, `label`, `url` | `user_id` | UNIQUE(`user_id`,`kind`) | CASCADE | Yes | Yes |
| `public.profile_career_identity` | Career identity narrative | `id` uuid | `user_id` → `profiles.id` | `who_you_are`, `where_youre_going`, `why`, `what_youre_missing`, `what_youre_building`, `how_youre_presenting`, `where_applying` | `user_id` | UNIQUE(`user_id`) | CASCADE | Yes | Yes |

**Deliberately not proposed:** a `roles` catalog table (the 15 `targetRole` non-title fields are static product data already in `src/data/rolesData.ts`, not per-user state), and separate tables for `profile.currentTitle`/`location`/`headline` — these are single-value fields that can be added to `profiles` as columns.

**Suggested column additions to `public.profiles`** (existing table, additive only): `current_title`, `headline`, `location`, `professional_summary`, `is_public` bool default false, `custom_goal_text`, `preferred_name`, `career_identity` (or the dedicated table above), `years_of_experience`, `timezone`.

---

## 7. Public Profile Privacy

**Current implementation (post-B.3):** `GET /api/profile/public/:username` looks up `profiles` by `username`, then joins `experiences`, `educations`, `user_skills`/`skills`, and returns the same response shape as before: `{ success, profile: { name, preferredName, headline, bio, avatarUrl, location, targetRole, careerState, experiences[], education[], certifications[], skills[], projects[], links{} } }`.

**What it currently exposes:** name, preferred name, headline, bio, avatar URL, location, target role, career state, experience history, education history, certifications, skills, projects, links.

**What `isPublic` previously controlled:** the pre-migration implementation (from `.careerpilot_state.json`) returned **HTTP 403 "This profile is private"** whenever `state.profile.isPublic` was false. The 403 gate ran *before* any data was assembled, so private profiles leaked nothing.

**Frontend usage:** **none**. `grep` across `src/` finds no caller of `/api/profile/public/:username`. The `isPublic` flag in the frontend (`DocumentsView.tsx`) belongs to **documents**, not profiles — `UserProfile.isPublic` is declared in the type but never set or read by any view.

**Any public profile feature depending on it:** no active feature. It is a dormant endpoint.

**Minimum representation to preserve existing privacy behaviour:** one nullable boolean column on `public.profiles`:
```sql
ALTER TABLE public.profiles ADD COLUMN is_public boolean NOT NULL DEFAULT false;
```
with a `profiles_select_public` policy (`is_public = true`) and the endpoint returning 403 when `is_public` is false. This is **additive** — it creates no new table, drops nothing, and leaves all existing rows private by default (fail-closed). Without it the endpoint cannot reproduce the previous privacy gate; exposing rows with unknown visibility would be the opposite of fail-closed.

**Do not expose private profile data as a workaround** — the current code already avoids that by returning only columns that exist, and the recommended fix restores the 403 gate.

---

## 8. Migration Plan

**Phase 1 — Auth migration (frontend → Supabase Auth)**
- Add a browser Supabase client in `src/lib/supabase.ts` using the **publishable/anon key only** (new env var, e.g. `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — the service-role key is never used in the browser).
- Rewire `CareerContext.tsx`: `login` → `signInWithPassword`, `register` → `signUp`, `logout` → `signOut`, token source → `supabase.auth.getSession()`; remove the `'demo-session-token-123'` fallback.
- Rewire `AuthModal.tsx` reset-password → `supabase.auth.resetPasswordForEmail`.
- Update the 7 token-bearing call sites to read the Supabase session token.
- Backend: keep the existing legacy session routes (`/api/auth/login`, `/api/auth/register`, `/api/auth/logout`) alive for a deprecation window so nothing breaks mid-cutover; add Supabase-compatible paths where needed.
- **Rollback:** revert `src/` — the legacy routes still work.
- **Risk:** the seeded demo user (`user-default-1` / `demo-session-token-123`) has no Supabase Auth counterpart. The demo experience must be re-created as a Supabase user or the demo entry point must be adjusted.

**Phase 2 — State/domain schema migration (new migration files)**
- Additive migration: the 17 new tables in §6 + the additive columns on `profiles` (§7, §6).
- Apply RLS + policies on every new table, modelled on the existing verified pattern (`auth.uid()`-based, child tables via `user_id` → `profiles.id`).
- `supabase_migrations` history is currently empty, so the previously-failed `202510190001` must **not** be replayed — it should be replaced with a corrected migration (or left out of the new numbering with the failed one removed from the local migrations folder and the history left untouched).
- **Rollback:** the new tables/columns are additive; dropping them restores the prior state.

**Phase 3 — Backend cutover**
- Extend `server/db/` with modules for the new tables; extend `server/db/state.ts` to map the remaining fields (roadmap, projects, evidence, CVs, applications, interviews, saved roles).
- Remove the `unmappedFields` reporting once every field has a target.
- `GET /api/state` gains a real consumer when the frontend starts hydrating from the server.
- **Rollback:** the legacy JSON file remains on disk and readable.

**Phase 4 — Frontend cutover**
- Hydrate state from `GET /api/state` (or per-domain endpoints) instead of `localStorage`, keeping local hydration as a cache/fallback.
- Add the `is_public` toggle to the profile UI.
- **Rollback:** `localStorage` hydration remains available as a fallback flag.

**Phase 5 — End-to-end verification**
- Re-run the live test suite (sign up → sign in → profile read/write → state round-trip → roadmap write → progress update → job applications → account change/delete) against a temporary test identity; verify ownership isolation; verify persistence across restart; verify the legacy JSON file is untouched; verify RLS remains enabled and no `USING(true)` on user-owned tables.
- Confirm lint / build / audit pass.

**Phase 6 — Legacy JSON retirement (only after explicit approval)**
- Requires a separate, explicit go-ahead. Steps: verify no endpoint still reads `.careerpilot_state.json`; import the `user-default-1` demo state into PostgreSQL (or discard it deliberately); remove the file and its readers; keep the file backed up outside the repo until satisfied.

**Preserved throughout:** existing Supabase users and profiles (currently zero, but the FK cascade and RLS are untouched by additive migrations); existing frontend behaviour until Phase 4 (the legacy session routes stay live through Phase 3); the legacy `.careerpilot_state.json` file (never deleted, never overwritten — it was left byte-identical except for removing my own test residue from the `default` key); current Supabase data (0 rows, no destructive DDL); authentication security (the verified JWT remains the only identity source; client-supplied ids stay ignored).

---

## 9. Data Risks

1. **Demo user has no Auth counterpart** — the seeded `user-default-1` uses a custom token, not a Supabase user. Phase 1 will either require re-creating it in Supabase Auth or dropping the silent demo fallback.
2. **Silent demo fallback** — `'demo-session-token-123'` grants unauthenticated access to the demo user's data. It must be removed; until then, "unauthenticated" is not really enforced in the UI.
3. **Write-only state endpoint** — the frontend never reads state back from the server, so PostgreSQL currently holds a shadow copy. If a user clears localStorage, their server-side state is not returned anywhere. Phase 4 must add hydration, otherwise the migration delivers no user-visible benefit and risks silent divergence between the two copies.
4. **Lossy mapping** — 19 profile fields, 4 settings fields, and 8 whole domains have no target. If Phase 2 omits them, data sent by the frontend is discarded (currently reported via `unmappedFields`, not silently).
5. **`targetRole`'s 15 non-title fields** are static catalog content, not user data. Persisting them per user duplicates `src/data/rolesData.ts` and risks two sources of truth.
6. **Unauthenticated AI/CV endpoints** — `/api/copilot`, `/api/analyze-career`, `/api/optimize-cv`, `/api/mock-interview`, `/api/suggest-summary`, `/api/generate-cover-letter`, `/api/resumes/upload` accept unauthenticated requests today. They are an open cost/quota exposure and will need the Supabase token in Groups B–F.
7. **Migration-history inconsistency** — `supabase/migrations/202510190001` exists locally, is listed remotely, but rolled back (empty `supabase_migrations` table). Left as-is, it will keep failing any future `supabase db push`. It must be corrected in a later, approved phase.
8. **Deletion cascade** — `profiles_id_fkey` is `ON DELETE CASCADE`, so deleting a profile removes educations/experiences/preferences/skills-links. New tables must use the same deliberate cascade, and audit/analytics tables (if ever added) must use `SET NULL`.
9. **Service-role bypasses RLS** — all server writes use the service-role key, so RLS is a defence-in-depth layer for any future direct client access, not the enforcement point. Ownership enforcement lives in server code.
10. **Test residue in the legacy file** — the old unauthenticated `POST /api/state` path wrote a `default` userState during my HTTP testing. It has been removed; `user-default-1` (the pre-existing demo state) is untouched.

---

## 10. Git Status

- **Branch:** `audit/before-supabase-migration`
- **Working tree:** modified — `.env.example`, `package-lock.json`, `package.json`, `server.ts`, `tsconfig.json`; untracked — `server/` (new), `supabase/` (new), and 9 report markdown files.
- **Commits:** one — `8666da4 chore: establish pre-migration baseline` (52 files, no secrets).
- **No commit, no push, no tag, no remote change** performed in this phase.

---

## 11. Scope

- B.3 Group A: **PARTIAL**
- B.3.1: **AUDIT / PLAN ONLY**
- Group B: NOT STARTED
- Group C: NOT STARTED
- Group D: NOT STARTED
- Group E: NOT STARTED
- Group F: NOT STARTED
- B.4: NOT STARTED
- deployment: NOT DONE
- push: NOT DONE
- Database modifications: NONE
- `src/` modifications: NONE
- `server.ts` modifications: NONE (in this phase)
- Migrations created: NONE
- RLS changes: NONE
- `.careerpilot_state.json`: retained on disk; my own test residue removed; pre-existing demo state intact
