# B.3.3 — DOMAIN SCHEMA AUDIT REPORT

Phase: B.3.3 — DESIGN / AUDIT ONLY. No migrations created or applied, no schema change, no RLS change, no `src/` or `server.ts` edit, no commit, no push, no deploy.

Source of truth: remote PostgreSQL, project `CareerFlow` (`ciihprsfdojzvjnqgbxl`, eu-west-1, PG 17.11), read via direct SQL.

---

## 1. Current Persistence Architecture

Four persistence layers exist today, none of them authoritative:

| Layer | What it holds | Written by | Read by | PostgreSQL equivalent |
|---|---|---|---|---|
| **`localStorage`** (12 keys) | The real user state: profile, target role, skills, roadmap, settings | `CareerContext` on every state change | `CareerContext` `useState` initialisers only | The target of this phase |
| **React context state** | The same data, in memory | user actions in views | every view | mirrors the above |
| **`.careerpilot_state.json`** | A *shadow copy* of the same payload + a legacy user/session table | `POST /api/state` (old code path) | `loadDatabase()` in the legacy auth routes | Superseded by PostgreSQL |
| **Static catalog modules** | `TARGET_ROLES`, `JOBS_CATALOG`, `LEARNING_RESOURCES`, `PROJECTS_CATALOG`, `interviewBank` | source code | views | None — product data, not user data |
| **Server memory** | Parsed CV text (multer buffer), AI responses | request lifecycle | same request | None — transient |

**Two verified consequences:**

1. The frontend **never** calls `GET /api/state`. It restores everything from `localStorage`. The server copy is written but never read back — PostgreSQL is currently a write-only sink.
2. `POST /api/state` sends the *entire* state object on every change (dependency array at `CareerContext.tsx:1423` covers `profile, targetRole, skills, roadmapPhases, settings, projects, evidenceItems, applications`). A full-document write, not incremental.

**Ownership strategy (chosen):** `profile_id UUID REFERENCES public.profiles(id)`.
Rationale: `profiles.id` is already `auth.users.id` with `ON DELETE CASCADE` (verified FK `profiles_id_fkey`). One hop from `auth.users` to every domain table, so account deletion cascades cleanly through `profiles` without a second identity path. Using `user_id REFERENCES auth.users(id)` on every table would duplicate the identity column 15+ times and create parallel cascade chains. `user_preferences.user_id` and `user_skills.user_id` already point at `profiles.id` in the live schema — so `profile_id` is **consistent with what is already there**.

---

## 2. Complete localStorage Inventory

All 12 keys, with verified writer/reader and classification.

| # | Key | Data structure | Writer | Reader | User-specific? | Must survive device change? | PostgreSQL target | Required? |
|---|---|---|---|---|---|---|---|---|
| 1 | `careerpilot_token` | string (legacy hex) | `login`/`register` | 7 fetch sites | Yes | Until sign-out | Supabase Auth session (not a column) | **Yes** (migrated in B.3.2) |
| 2 | `careerpilot_user` | `UserAccount` JSON | `login`/`register` | `AuthModal` display | Yes | Yes | `public.profiles` | **Yes** |
| 3 | `careerpilot_profile` | `UserProfile` (29 fields) | state-sync effect | `useState` init (`:458`) | Yes | Yes | `public.profiles` + `profile_certifications` + `profile_links` + `profile_career_identity` | **Yes** |
| 4 | `careerpilot_target_role` | `TargetRole` (16 fields) | state-sync effect | `useState` init (`:571`) | Yes | Title yes | `public.profiles.target_role` (title); the other 15 are catalogue | **Yes** (partial) |
| 5 | `careerpilot_skills` | `UserSkill[]` (10) | state-sync effect | `useState` init (`:582`) | Yes | Yes | `public.skills` + `public.user_skills` | **Yes** (exists) |
| 6 | `careerpilot_roadmap` | `RoadmapPhase[]` (6) | state-sync effect | `useState` init (`:591`) | Yes | Yes | `public.roadmaps` + `roadmap_phases` + `roadmap_milestones` + `roadmap_tasks` | **Yes** |
| 7 | `careerpilot_settings` | `UserSettings` (7) | state-sync effect | `useState` init (`:1358`) | Yes | Yes | `public.user_preferences` (theme, language, notifications) | **Yes** (partial) |
| 8 | `careerpilot_milestones` | `CareerMilestoneItem[]` | **none** | `useState` init (`:850`) | Yes | No | `public.career_milestones` (distinct from roadmap milestones) | Medium |
| 9 | `careerpilot_secondary_goals` | `SecondaryCareerGoal[]` | **none** | `useState` init (`:803`) | Yes | No | `public.secondary_goals` | Medium |
| 10 | `careerpilot_activities` | `UserActivityItem[]` | **none** | `useState` init (`:881`) | Yes | No | `public.activities` | Medium |
| 11 | `careerpilot_documents` | `CareerDocument[]` | **none** | `useState` init (`:936`) | Yes | No | `public.documents` + Storage | Medium |
| 12 | `careerpilot_cover_letters` | `CoverLetter[]` | **none** | `useState` init (`:1017`) | Yes | No | `public.cover_letters` | Medium |

**Verified finding — keys 8–12 are read but never written.** Each initialiser reads a key and falls back to a hardcoded demo array. No code path calls `setItem` for them. Consequence: a user who creates a secondary goal, milestone, activity, document or cover letter sees it in the session, and it is **lost on reload**. These are currently broken persistence, not merely unpersisted features.

**Classification:**
- **A. Server-authoritative user data** → keys 2–12 — must move to PostgreSQL.
- **B. Client-only UI preferences/cache** → theme/renderer state is applied client-side from `settings`; a device-local copy may stay as a cache but must not be the source of truth.
- **C. Temporary/session data** → `careerpilot_token` (now Supabase-managed); nothing else qualifies.

---

## 3. Complete `.careerpilot_state.json` Inventory

Single file, 47 KB, one user. Structure: `{ users, sessions, userStates }`.

| Path | Contents | Notes |
|---|---|---|
| `users['user-default-1']` | `{ id, email, name, passwordHash, salt, createdAt }` | `id` is **not a UUID**; `passwordHash`/`salt` are legacy credential material with **no Supabase Auth counterpart** |
| `sessions['demo-session-token-123']` | → `user-default-1` | the hardcoded demo token |
| `userStates['user-default-1']` | the 12-field state payload | `profile` (29 keys), `targetRole` (16), `savedRoles` (2), `skills` (10), `roadmapPhases` (6), `projects` (4), `evidenceItems` (2), `activeCV` (11), `cvVersions` (1), `applications` (2), `interviewSessions` (1), `settings` (7) |

This file is a **snapshot of the same demo data** the frontend hardcodes as initial values — not an independent dataset.

---

## 4. Roadmap Data Model

Verified from `src/context/CareerContext.tsx`, `RoadmapView.tsx`, `ProgressView.tsx`.

Generation: `generateInitialRoadmap(role)` (line 253) returns a **static, hardcoded** structure — it accepts the role but does not use it. It is **not** AI-generated. `setRoadmapPhases(generateInitialRoadmap(role))` runs at line 1655 when the target role changes.

```ts
RoadmapPhase     { id, phaseNumber, title, description, isUnlocked, milestones[] }
RoadmapMilestone { id, title, description, tasks[], completedTasksCount }
RoadmapTask      { id, title, description, status, skillId?, skillName?, deadline?,
                    resourceId?, resourceTitle?, evidenceId?, estimatedHours? }
```

| Field | Consumer | Notes |
|---|---|---|
| `phase.id`, `phaseNumber`, `title`, `description` | `RoadmapView` phase header | ordering via `phaseNumber` |
| `isUnlocked` | `RoadmapView` gating | which phases are visible |
| `milestone.id/title/description` | `RoadmapView` milestone block | |
| `milestone.tasks[]` | `RoadmapView` task list | filtered by unlock state |
| `milestone.completedTasksCount` | `RoadmapView` "N/M Completed" | **derived** — recomputed inside `updateTaskStatus` |
| `task.id` | `updateTaskStatus(task.id, status)` | the mutation key |
| `task.status` | `RoadmapView` checkbox; `ProgressView` progress calc | `not_started` \| `in_progress` \| `completed` |
| `task.deadline` | `RoadmapView` due date | |
| `task.estimatedHours` | `RoadmapView` | |
| `task.skillName` / `skillId` | roadmap ↔ skill linkage | references `public.skills` |
| `task.resourceId` / `resourceTitle` | links to `LEARNING_RESOURCES` catalogue | catalogue reference, not user data |
| `task.evidenceId` | links to `EvidenceItem` | user data → `public.evidence_items` |
| `isEnrolledInRoadmap` | `RoadmapView` | boolean; `enrollInRoadmap()` at line 1786 |

**Progress is derived, never stored:** `RoadmapView.tsx:10-11` and `ProgressView.tsx:17` compute `totalTasks` / `completedTasks` from `task.status`. → **No `roadmap_progress` table** (rejected, §11).

**Multiple roadmaps?** No. `roadmapPhases` is one flat array; `generateInitialRoadmap` replaces it wholesale. No roadmap id, no list. → Model as **one roadmap per profile** (`UNIQUE(profile_id)`).

**Active roadmap?** The enrolled flag is a boolean, not a pointer. → a column on `roadmaps`.

**AI-generated roadmap content?** None — `generateInitialRoadmap` is static; `/api/analyze-career` returns an analysis, not a roadmap.

**Proposed model:** `roadmaps` (1:1 profile) → `roadmap_phases` → `roadmap_milestones` → `roadmap_tasks`.

---

## 5. Project / Evidence Data Model

Verified from `CareerContext.tsx` (`setProjects` 1802/1806/1810, `setEvidenceItems` 1819) and the types.

```ts
CareerProject { id, title, goal, description, difficulty, skills[], tasks[],
                 deliverables[], status, repositoryUrl, demoUrl, documentation,
                 createdAt, completedAt }
EvidenceItem  { id, title, type, description, url, skillNames[], projectId,
                 verified, dateAdded }
```

| Relationship | Evidence | Ownership / model |
|---|---|---|
| project → skills | `CareerProject.skills[]` (names) | many-to-many against the shared `public.skills` catalogue → join table `project_skills` |
| evidence → project | `EvidenceItem.projectId` | **many-to-one** (single id, not an array) → `evidence_items.project_id` |
| evidence → skills | `EvidenceItem.skillNames[]` | many-to-many → join table `evidence_skills` |
| project → task | `CareerProject.tasks[]` | project-local tasks, **not** roadmap tasks — distinct concept → embedded `jsonb` |
| project → deliverable | `CareerProject.deliverables[]` | embedded → `jsonb` |

**Answers to the specific questions:**
- *Are skills reusable?* Yes — `public.skills` is a catalogue, `public.user_skills` the per-user join. Projects and evidence reference the same catalogue.
- *Can evidence belong to multiple projects?* **No** — a single `projectId`.
- *Is evidence displayed publicly?* The public-profile endpoint returns `skills[]` but **not** `evidenceItems[]` — evidence is private to the user.
- *Is evidence used by AI?* `CareerContext.tsx:1086` sends `projects` (title/description/skills) to `/api/generate-cover-letter`; `cvVersions[0].atsAnalysis.missingKeywords` drives a notification at line 1319. Evidence is not sent to AI today, but `task.evidenceId` links roadmap tasks to it.

**Proposed model:** `projects` (+ `project_skills`), `evidence_items` (+ `evidence_skills`).

---

## 6. CV Data Model

Verified from `CareerContext.tsx` (`setActiveCV` 631, `setCvVersions` 679, `duplicateVersion` 1157, `renameVersion` 1167, `deleteVersion` 1172) and `server.ts` (`/api/resumes/upload`).

```ts
CVProfile { fullName, email, phone, location, title, summary, experiences[],
            education[], projects[], skills[], certifications[], languages[] }
CVVersion { id, name, targetRoleTitle, createdAt, profile: CVProfile,
            atsAnalysis?: ATSAnalysis }
```

**Critical verified finding:** CVs are **never persisted**. No `setItem` for any CV key; `careerpilot_documents` and `careerpilot_cover_letters` are read-only keys. `activeCV` and `cvVersions` live only in React state and are sent to `POST /api/state` — where they are **dropped** (they are in the unmapped list). **A user who uploads a CV loses it on reload.**

Separation as required:
- **A. Supabase Storage objects** — the uploaded file. Today it is parsed from a multer **memory buffer** and discarded; nothing is stored. A private bucket (`cvs`) is required.
- **B. PostgreSQL metadata** — `cvs` (name, target role title, storage path, is_active, timestamps) and `cv_versions` (immutable snapshots: `profile_json` jsonb, `ats_analysis` jsonb, version number).
- **C. AI-generated transient output** — the raw `/api/optimize-cv` response is transient → not stored. `atsAnalysis` (score, missing keywords, strengths) is a durable property of a version → jsonb column.

`CVProfile` is a full profile snapshot (experiences, education, skills, certifications, languages) — not a normalised entity. `jsonb` on `cv_versions` is faithful to the actual data and avoids inventing relations the code does not use. `atsAnalysis` is nested inside `CVVersion` → a jsonb column, **not** a table.

**Proposed model:** `cvs` → `cv_versions`; a private Storage bucket for the file.

---

## 7. Jobs / Application Data Model

Verified from `CareerContext.tsx` (`JOBS_CATALOG` import line 47, `useState<JobListing[]>(JOBS_CATALOG)` line 706, `setApplications` 1931/1935/1939/1949, `setSavedRoles` 1660/1665).

```ts
JobListing      { id, title, company, location, workMode, level, salaryRange,
                   description, responsibilities[], requirements[], skillsRequired[],
                   applicationUrl, postedDate }
JobApplication  { id, jobId?, company, role, location, workMode, stage, appliedDate?,
                   lastUpdated?, nextAction?, nextActionDate?, notes?, salaryDiscussed?,
                   interviewStageDetails? }
ApplicationStage = 'saved'|'applied'|'screening'|'interview'|'technical'|'final'|'offer'|'rejected'|'withdrawn'
```

- *Job object structure* — as above.
- *External job IDs* — `JobApplication.jobId` is optional and free-form; `JobListing.id` comes from the **static** `JOBS_CATALOG` (`src/data/jobsData.ts`), e.g. `job-1`.
- *Source/provider* — **none**. There is **no external job API**: grep for `rapidapi`, `jsearch`, `/api/jobs` in `src/` returns nothing, and no `/api/jobs/*` route exists on the server. Jobs are bundled product data.
- *Saved roles* — `savedRoles: TargetRole[]` are bookmarked **career roles** (from `TARGET_ROLES`), not job listings.
- *Ownership* — applications and saved roles are per-user.

**Should external job data be duplicated?** There is no external data. The only job data that is user-specific is the **application record** (stage, notes, salary, next action), which references a catalogue job by `jobId`. → Store `job_applications` (user-owned) and **do not** create a `jobs` table; `job_id` stays a catalogue reference. A `jobs` table becomes justified only if a real provider is added later.

**Proposed model:** `job_applications`, `saved_roles`.

---

## 8. Interview Data Model

Verified from `CareerContext.tsx` (line 739, `setInterviewSessions` 1958) and `InterviewsView.tsx`.

```ts
MockInterviewSession { id, roleTitle, type, question, userAnswer, aiFeedback, createdAt }
```

| Element | Judgement | Reason |
|---|---|---|
| `id`, `roleTitle`, `type`, `createdAt` | **persist** | identifies the session; used for history/score history |
| `question` | **persist** | part of the record; may be AI-generated (not in the catalogue) |
| `userAnswer` | **persist** | user-authored content, the thing worth keeping |
| `aiFeedback` (score, strengths) | **persist** | the durable result of the session |
| session status | **n/a** | no status field exists in the type |
| in-progress session before evaluation | **transient** | no partial-session concept in the code |

The question bank (`src/data/interviewBank.ts`) is catalogue data; `question` is stored because an AI-generated question is not in the catalogue and must stay attributable to its session.

**Proposed model:** `interview_sessions`.

---

## 9. Profile Extension Model

| Field | Existing target | New column/table | Frontend consumer | Backend consumer |
|---|---|---|---|---|
| `name` | `profiles.full_name` | — | `ProfileView`, cover letters | `profiles` |
| `preferredName` | none | `profiles.preferred_name` | `ProfileView` | `profiles` |
| `email` | `auth.users.email` | — (read from Auth) | `SettingsView` | `auth.users` |
| `phone` | `profiles.phone` | — | `ProfileView` | `profiles` |
| `avatarUrl` | `profiles.avatar_url` | — | `ProfileView` | `profiles` |
| `currentTitle` | none (`target_role` is the *target*, not current) | `profiles.current_title` | `ProfileView` | `profiles` |
| `currentPosition`, `currentCompany` | none | `profiles.current_position`, `profiles.current_company` | `ProfileView` | `profiles` |
| `yearsOfExperience` | none | `profiles.years_of_experience` | `ProfileView`, AI prompts | `profiles` |
| `industry` | `profiles.target_industry` | — (reuse) | `ProfileView` | `profiles` |
| `location`, `city`, `country` | none | `profiles.location` (one value is enough) | `ProfileView` | `profiles` |
| `timezone` | none | `profiles.timezone` | `ProfileView` | `profiles` |
| `preferredLanguage` | `user_preferences.language` | — (reuse) | `SettingsView` | `user_preferences` |
| `headline` | none | `profiles.headline` | `ProfileView`, public profile | `profiles` |
| `bio` | `profiles.bio` | — | `ProfileView`, public profile | `profiles` |
| `professionalSummary` | none | `profiles.professional_summary` | `ProfileView`, `/api/suggest-summary` | `profiles` |
| `username` | `profiles.username` (UNIQUE) | — | `ProfileView`, `check-username` | `profiles` |
| `isPublic` | none | **`profiles.is_public` (NOT NULL DEFAULT false)** | `UserProfile.isPublic` (declared, never set) | **public-profile 403 gate** |
| `careerState` | `profiles.user_type` (CHECK) | — (value-normalise) | `ProfileView`, AI | `profiles` |
| `careerGoal` | `profiles.career_goal` | — | `ProfileView` | `profiles` |
| `customGoalText` | none | `profiles.custom_goal_text` | `ProfileView` | `profiles` |
| `onboardingCompleted` | `profiles.onboarding_completed` | — | `OnboardingView` | `profiles` |
| `education[]` | `public.educations` | — | `ProfileView`, CV builder | `educations` |
| `experiences[]` | `public.experiences` | — | `ProfileView`, CV builder | `experiences` |
| `certifications[]` | none | **`public.profile_certifications`** | `ProfileView`, CV builder | new |
| `languages[]` | none | **`public.profile_languages`** | `ProfileView`, public profile | new |
| `links` | none | **`public.profile_links`** | `ProfileView`, public profile | new |
| `careerIdentity` | none | **`public.profile_career_identity`** (1:1) | `ProfileView` | new |

**No duplicate identity field is proposed.** `profiles.id` remains the only identity; `auth_uid` is not introduced.

**Onboarding answers:** the code has `onboardingCompleted: boolean` and `OnboardingView` — there is **no** answers array in the state payload. → `profiles.onboarding_completed` suffices; **no `onboarding_answers` table**.

---

## 10. Proposed Tables

Ownership for all: `profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`, except `cv_versions` (child of `cvs`). All domain tables cascade from `profiles` → `auth.users` via `profiles_id_fkey`. No circular chains: `projects → evidence_items` is one-directional; `skills` is a shared catalogue with no owner.

### 10.1 `public.roadmaps`
- **Purpose**: one roadmap per user
- **Columns**: `id UUID PK DEFAULT gen_random_uuid()`, `profile_id UUID NOT NULL`, `title TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'active'`, `is_enrolled BOOLEAN NOT NULL DEFAULT false`, `target_role_title TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (profile_id)` (one roadmap per user — the code has a single flat array)
- **Indexes**: the unique covers the owner lookup
- **RLS**: required — see the policy table in §10.18

### 10.2 `public.roadmap_phases`
- **Purpose**: ordered phases
- **Columns**: `id UUID PK`, `roadmap_id UUID NOT NULL`, `phase_number INT NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `is_unlocked BOOLEAN NOT NULL DEFAULT true`, `sort_order INT NOT NULL DEFAULT 0`
- **FK**: `roadmap_id → public.roadmaps(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (roadmap_id, phase_number)`
- **Indexes**: `UNIQUE (roadmap_id, phase_number)`; index on `roadmap_id`
- **RLS**: required

### 10.3 `public.roadmap_milestones`
- **Purpose**: milestones within a phase
- **Columns**: `id UUID PK`, `phase_id UUID NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `sort_order INT NOT NULL DEFAULT 0`
- **FK**: `phase_id → public.roadmap_phases(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (phase_id, sort_order)`
- **Indexes**: index on `phase_id`
- **RLS**: required
- **Note**: `completedTasksCount` is **derived** and deliberately NOT stored

### 10.4 `public.roadmap_tasks`
- **Purpose**: tasks within a milestone — the unit of progress
- **Columns**: `id UUID PK`, `milestone_id UUID NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `status TEXT NOT NULL DEFAULT 'not_started'`, `skill_id UUID`, `skill_name TEXT`, `deadline DATE`, `resource_id TEXT`, `resource_title TEXT`, `evidence_id UUID`, `estimated_hours INT`, `sort_order INT NOT NULL DEFAULT 0`
- **FK**: `milestone_id → public.roadmap_milestones(id) ON DELETE CASCADE`; `skill_id → public.skills(id) ON DELETE SET NULL`; `evidence_id → public.evidence_items(id) ON DELETE SET NULL`
- **Constraints**: `CHECK (status IN ('not_started','in_progress','completed'))`; `UNIQUE (milestone_id, sort_order)`
- **Indexes**: index on `milestone_id`; index on `status` for progress queries
- **RLS**: required

### 10.5 `public.projects`
- **Purpose**: user portfolio projects
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `title TEXT NOT NULL`, `goal TEXT`, `description TEXT`, `difficulty TEXT`, `status TEXT`, `repository_url TEXT`, `demo_url TEXT`, `documentation TEXT`, `tasks JSONB NOT NULL DEFAULT '[]'`, `deliverables JSONB NOT NULL DEFAULT '[]'`, `created_at TIMESTAMPTZ DEFAULT now()`, `completed_at TIMESTAMPTZ`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: none beyond PK (the type's `status` is free-form → no CHECK)
- **Indexes**: index on `profile_id`
- **RLS**: required
- **Note**: `tasks`/`deliverables` are embedded arrays in the type → jsonb, not child tables

### 10.6 `public.project_skills`
- **Purpose**: project ↔ skill many-to-many
- **Columns**: `project_id UUID NOT NULL`, `skill_id UUID NOT NULL`, `skill_name TEXT NOT NULL`
- **FK**: `project_id → public.projects(id) ON DELETE CASCADE`; `skill_id → public.skills(id) ON DELETE CASCADE`
- **Constraints**: `PRIMARY KEY (project_id, skill_id)`
- **Indexes**: PK covers the lookup; index on `skill_id`
- **RLS**: required

### 10.7 `public.evidence_items`
- **Purpose**: evidence supporting a skill, optionally linked to a project
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `project_id UUID`, `title TEXT NOT NULL`, `type TEXT`, `description TEXT`, `url TEXT`, `verified BOOLEAN NOT NULL DEFAULT false`, `date_added DATE`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`; `project_id → public.projects(id) ON DELETE SET NULL`
- **Constraints**: none beyond PK. `SET NULL` (not CASCADE) so deleting a project does not destroy the user's evidence record
- **Indexes**: index on `profile_id`; index on `project_id`
- **RLS**: required

### 10.8 `public.evidence_skills`
- **Purpose**: evidence ↔ skill many-to-many
- **Columns**: `evidence_id UUID NOT NULL`, `skill_id UUID NOT NULL`
- **FK**: `evidence_id → public.evidence_items(id) ON DELETE CASCADE`; `skill_id → public.skills(id) ON DELETE CASCADE`
- **Constraints**: `PRIMARY KEY (evidence_id, skill_id)`
- **RLS**: required

### 10.9 `public.cvs`
- **Purpose**: a CV document the user owns
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `name TEXT NOT NULL`, `target_role_title TEXT`, `storage_path TEXT`, `is_active BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: partial unique index `UNIQUE (profile_id) WHERE is_active` — exactly one active CV per user
- **Indexes**: index on `profile_id`; the partial unique covers the active lookup
- **RLS**: required
- **Note**: `storage_path` points at a private Storage object; the file is never in PostgreSQL

### 10.10 `public.cv_versions`
- **Purpose**: immutable CV snapshots with their AI analysis
- **Columns**: `id UUID PK`, `cv_id UUID NOT NULL`, `version_number INT NOT NULL`, `name TEXT NOT NULL`, `target_role_title TEXT`, `profile_json JSONB NOT NULL`, `ats_analysis JSONB`, `created_at TIMESTAMPTZ DEFAULT now()`
- **FK**: `cv_id → public.cvs(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (cv_id, version_number)`
- **Indexes**: index on `cv_id` (the unique covers it)
- **RLS**: required
- **Note**: `profile_json` mirrors the `CVProfile` type exactly; `ats_analysis` mirrors `ATSAnalysis`

### 10.11 `public.saved_roles`
- **Purpose**: career roles the user bookmarked
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `role_id TEXT NOT NULL`, `title TEXT NOT NULL`, `category TEXT`, `level TEXT`, `payload_json JSONB`, `saved_at TIMESTAMPTZ DEFAULT now()`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (profile_id, role_id)` — the code toggles by role id (1660/1665)
- **Indexes**: the unique covers the owner lookup
- **RLS**: required
- **Note**: `payload_json` holds the `TargetRole` catalogue object so the saved copy survives catalogue changes

### 10.12 `public.job_applications`
- **Purpose**: application tracking
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `job_id TEXT`, `company TEXT NOT NULL`, `role TEXT NOT NULL`, `location TEXT`, `work_mode TEXT`, `stage TEXT NOT NULL DEFAULT 'saved'`, `applied_date DATE`, `last_updated DATE`, `next_action TEXT`, `next_action_date DATE`, `notes TEXT`, `salary_discussed BOOLEAN NOT NULL DEFAULT false`, `interview_stage_details JSONB`, `created_at TIMESTAMPTZ DEFAULT now()`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: `CHECK (stage IN ('saved','applied','screening','interview','technical','final','offer','rejected','withdrawn'))` — the type defines exactly this union
- **Indexes**: index on `profile_id`; index on `stage` for pipeline filters
- **RLS**: required
- **Note**: `job_id` is a **reference** to the static catalogue id, not an FK — the catalogue is source code, not a table

### 10.13 `public.interview_sessions`
- **Purpose**: recorded mock-interview sessions
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `role_title TEXT`, `type TEXT`, `question TEXT NOT NULL`, `user_answer TEXT`, `ai_feedback JSONB`, `created_at TIMESTAMPTZ DEFAULT now()`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: none
- **Indexes**: index on `profile_id`; index on `created_at DESC` for history ordering
- **RLS**: required

### 10.14 `public.profile_certifications`
- **Purpose**: certification entries
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `name TEXT NOT NULL`, `issuer TEXT`, `issue_date DATE`, `url TEXT`, `credential_id TEXT`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Indexes**: index on `profile_id`
- **RLS**: required

### 10.15 `public.profile_languages`
- **Purpose**: spoken/written languages
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `name TEXT NOT NULL`, `proficiency TEXT`, `is_primary BOOLEAN NOT NULL DEFAULT false`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Indexes**: index on `profile_id`
- **RLS**: required

### 10.16 `public.profile_links`
- **Purpose**: professional links (LinkedIn, GitHub, portfolio…)
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL`, `kind TEXT NOT NULL`, `label TEXT`, `url TEXT NOT NULL`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (profile_id, kind)` — one link per kind, matching `ProfessionalLinks`
- **Indexes**: the unique covers the owner lookup
- **RLS**: required

### 10.17 `public.profile_career_identity`
- **Purpose**: the 7-field career-identity narrative (1:1 with the user)
- **Columns**: `id UUID PK`, `profile_id UUID NOT NULL UNIQUE`, `who_you_are TEXT`, `where_youre_going TEXT`, `why TEXT`, `what_youre_missing TEXT`, `what_youre_building TEXT`, `how_youre_presenting TEXT`, `where_applying TEXT`
- **FK**: `profile_id → public.profiles(id) ON DELETE CASCADE`
- **Constraints**: `UNIQUE (profile_id)` (1:1)
- **Indexes**: covered by the unique
- **RLS**: required

### 10.18 Additive columns on `public.profiles`
`current_title TEXT`, `current_position TEXT`, `current_company TEXT`, `headline TEXT`, `professional_summary TEXT`, `location TEXT`, `timezone TEXT`, `preferred_name TEXT`, `custom_goal_text TEXT`, `years_of_experience TEXT`, `is_public BOOLEAN NOT NULL DEFAULT false`.

**RLS impact:** `is_public` needs a second, read-only policy so a public profile can be read by an *unauthenticated* visitor: `CREATE POLICY profiles_select_public ON public.profiles FOR SELECT USING (is_public = true)`. Because policies are permissive-OR, this combines with the owner policy to mean "your own row, or any row flagged public". The endpoint must therefore select an **explicit column list**, never `SELECT *`.

**RLS design for every new table** — the owner expression varies by table; the four policies follow one pattern:

| Table | Owner expression | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `roadmaps` | `auth.uid() = (SELECT auth_uid FROM public.profiles WHERE profiles.id = roadmaps.profile_id)` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `roadmap_phases` | via `roadmaps` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `roadmap_milestones` | via `phases` → `roadmaps` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `roadmap_tasks` | via `milestones` → `phases` → `roadmaps` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `projects` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `project_skills` | via `projects` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `evidence_items` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `evidence_skills` | via `evidence_items` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `cvs` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `cv_versions` | via `cvs` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `saved_roles` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `job_applications` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `interview_sessions` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `profile_certifications` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `profile_languages` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `profile_links` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |
| `profile_career_identity` | `profile_id` → `profiles` | USING owner | WITH CHECK owner | USING + WITH CHECK owner | USING owner |

**Service-role caveat (unchanged):** `server/db/supabase.ts` uses the service-role key → **RLS is bypassed on every server write**. The policies are defence-in-depth for any future direct client access; actual enforcement is the server-side ownership check against the verified JWT. Every new `server/db/*` module must filter by the verified `userId` and must never accept a client-supplied owner id.

---

## 11. Tables Rejected

| Rejected | Why |
|---|---|
| `public.jobs` | The app has **no** external job API. `JobListing[]` is a bundled constant from `src/data/jobsData.ts`, never fetched, never persisted. Only the *application* is user data; `job_id` stays a catalogue reference. Reconsider only when a real provider is added. |
| `public.roadmap_progress` | Progress is **derived at render time** (`RoadmapView.tsx:10-11`, `ProgressView.tsx:17`). A stored summary would be a second source of truth that can drift. |
| `public.resume_analysis` | `atsAnalysis` is a nested field of `CVVersion`; a jsonb column is the faithful model. |
| `public.onboarding_answers` | The code has only `onboardingCompleted: boolean`. No answers array exists in the state payload. |
| `public.ai_requests` / `public.ai_usage` | No AI call is persisted by any code path today. |
| `public.audit_logs` | No audit logging exists in the application (and no admin feature exists to audit). |
| `public.linked_accounts` | No LinkedIn OAuth exists in the code. |
| `public.admin_roles` | No admin UI, route, or role check exists. |
| `public.roles` (catalogue) | `TARGET_ROLES` is a static module in `src/data/rolesData.ts`; storing the catalogue would duplicate source code as data. |
| `public.skills`, `public.user_skills`, `public.user_preferences`, `public.educations`, `public.experiences` | Already exist in the live schema. |
| `public.profile_avatar` / separate media table | `profiles.avatar_url` covers it. |

**Additions vs. the B.3.1 list:** `profile_languages` (missed before — `UserProfile.languages[]` had no target), plus `secondary_goals`, `career_milestones`, `activities`, `documents`, `cover_letters` (the five read-only localStorage keys that are lost on reload). `jobs` was removed.

---

## 12. `/api/state` Strategy

**Decision: (C) become a PostgreSQL aggregation layer, then (B) split into domain endpoints — with (A) retained as a compatibility shim during the cutover.**

Reasoning from actual usage:
- The frontend calls `POST /api/state` **today** (one call, whole document). A shim keeps it working during migration.
- The frontend **never** calls `GET /api/state` — there is no consumer to preserve for the GET shape.
- A single monolithic aggregate endpoint is wrong long-term: the roadmap (4 tables) and CV (2 tables + Storage) have different lifecycles from the profile, and a full-document POST rewrites everything on every change.

**Recommended end state:** domain endpoints — `GET/PATCH /api/profile`, `GET/PUT /api/preferences`, `GET/PUT /api/skills`, `GET/PUT /api/roadmap`, `PATCH /api/roadmap/tasks/:id/status`, `GET/POST /api/cvs`, `GET/POST /api/projects`, `GET/POST /api/evidence`, `GET/POST /api/applications`, `GET/POST /api/interviews`, `GET/POST /api/saved-roles`. `POST /api/state` then becomes a **deprecated bulk-import path** used only for the one-time legacy migration, removed in the final phase.

---

## 13. Data Migration Strategy

**Ordering (no data is dropped):**

1. **Demo user → Supabase Auth.** `user-default-1` has a salted password hash and a non-UUID id, and **no** `auth.users` counterpart. Options: (a) create a real Supabase Auth user with a known password and copy the profile data across, or (b) treat the demo data as seed for a demo account. **Do not** migrate the legacy password hash — the formats are incompatible; the user must re-authenticate. **Decision needed.**
2. **One-time import** from `.careerpilot_state.json` → PostgreSQL, in FK order: `profiles` → `skills` → `user_skills` → `educations` → `experiences` → `user_preferences` → `roadmaps` → `phases` → `milestones` → `tasks` → `projects` → `project_skills` → `evidence_items` → `evidence_skills` → `cvs` → `cv_versions` → `saved_roles` → `job_applications` → `interview_sessions` → `profile_*`.
3. **Identity remap.** Every imported row's `profile_id` must be the **new** Supabase Auth user's `profiles.id` — never the legacy `user-default-1` string.
4. **Browser localStorage** — after the server holds the data, each browser still holds a copy. On sign-in the client should **offer** an import (if the local copy is newer or the server row is absent) rather than silently overwrite. Server data wins by default; a mismatch is surfaced to the user, never auto-resolved.
5. **Partial/legacy data** — any field with no target is **reported**, not dropped. `unmappedStateFields()` already does this and must be extended to cover the 5 read-only localStorage domains and the CV domains until their tables exist.
6. **Idempotency** — the import must be re-runnable: use deterministic natural keys (legacy `sk-1`, `phase-1`, `doc-1` → a `legacy_id` column or an upsert on a stable business key) so a partial import can be retried without duplicating rows.

**Verification before cutover:** row counts per table vs. source counts; spot-check every field of one imported profile; confirm no `profile_id` points at a non-existent profile.

---

## 14. Migration History Strategy

**Current state (verified):** `supabase_migrations.schema_migrations` is **empty** — migration `202510190001` was rolled back entirely (PostgreSQL transactional DDL) when its policy statement failed. The 6 live tables are the project's pre-existing schema, not that migration's output. The local folder still contains `202510190001_initial_careerpilot_schema.sql` and `202510190004_fix_rls_profiles_id.sql`, neither of which corresponds to anything in the remote history.

**Problem:** `supabase db push` re-runs `202510190001` and fails at the same statement, blocking every future push.

**Safest procedure (report only — nothing done):**
1. Do **not** delete or rewrite remote migration history — it is destructive, and the history is empty anyway.
2. Do **not** use `supabase migration repair` to fake a version — it would mark a failed migration as applied, hiding the fact that its 16-table schema was never created.
3. **Recommended**: create a **new** migration file with a **fresh, higher timestamp** containing only the §10 tables and the additive `profiles` columns. Because the failed `202510190001` is *not* recorded remotely, the CLI tries to apply it first — so that local file must be **retired locally**, not applied: move `202510190001` and `202510190004` into `supabase/migrations/archive/` (they created nothing remotely; the archive preserves them; do not delete).
4. Verify with `supabase db push --dry-run` first, then confirm `supabase_migrations.schema_migrations` afterwards contains exactly the new migration.

**Note:** the local `202510190001` also encodes a **wrong** design (`profiles.auth_uid`, `skills.profile_id`, …) that contradicts the verified schema. It must not be applied in any form.

---

## 15. Security Model

- **Identity**: `profiles.id = auth.users.id`; the server derives the owner from the verified JWT only. No `auth_uid`, no second identity path, no client-supplied owner id.
- **Service-role**: `server/db/supabase.ts` uses the service-role key → **RLS is bypassed on server writes**. Every new module must filter by the verified `userId` explicitly. RLS is defence-in-depth, not the enforcement point.
- **RLS**: enabled on all 17 new tables with the owner expressions in §10.18. Never `USING (true)` on user-owned data. The only public read is `profiles.is_public = true`, restricted to an explicit column list by the endpoint.
- **Cascade safety**: `profiles → all domain tables` CASCADE so account deletion removes exactly the authenticated user's data. `evidence_items.project_id` is `SET NULL` (deleting a project must not destroy evidence). `roadmap_tasks.skill_id`/`evidence_id` are `SET NULL` (deleting a skill or evidence must not delete a task).
- **No circular cascades**: the chains are strictly `auth.users → profiles → {roadmaps → phases → milestones → tasks}` and `profiles → projects → evidence_items`; `skills` is a leaf catalogue.
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` stay server-side; the browser uses only `VITE_SUPABASE_PUBLISHABLE_KEY`. `GEMINI_API_KEY` stays in `server.ts`.
- **Storage**: CV files go to a **private** bucket; access via short-lived signed URLs, never a public URL.

---

## 16. Rollback Strategy

| Phase | Rollback |
|---|---|
| New tables + columns | Additive only — `DROP TABLE`/`DROP COLUMN` restores the prior state. No data exists before cutover, so dropping loses nothing. |
| Import | The import is a copy — the source (`.careerpilot_state.json` + browser localStorage) is retained until the cutover is verified. Reverting = delete the imported rows, restore the file, redeploy the previous code. |
| Backend cutover | The current working tree is the rollback point. Feature-flag the new endpoints until the frontend cutover is verified. |
| Frontend cutover | Keep the localStorage hydration path behind a flag; flip back if the server read path misbehaves. |
| RLS | Policies are created with `IF NOT EXISTS` semantics and can be dropped independently. |

**Invariant:** no destructive DDL is proposed anywhere in this plan.

---

## 17. Implementation Order

1. **Auth cutover (frontend)** — `CareerContext.tsx` + `AuthModal.tsx` to Supabase Auth; remove the demo fallback. (B.3.2 backend done; frontend half not.)
2. **Migration-history cleanup** — retire the two local files that were never applied, so `db push` is usable again.
3. **Additive `profiles` columns** (+ `is_public` and its public-read policy).
4. **Roadmap tables** → `roadmaps`, `roadmap_phases`, `roadmap_milestones`, `roadmap_tasks` (largest domain; first because the roadmap is the app's centrepiece).
5. **CV tables** → `cvs`, `cv_versions` + the private Storage bucket.
6. **Portfolio tables** → `projects`, `project_skills`, `evidence_items`, `evidence_skills`.
7. **Profile-extension tables** → `profile_certifications`, `profile_languages`, `profile_links`, `profile_career_identity`.
8. **Tracking tables** → `saved_roles`, `job_applications`, `interview_sessions`.
9. **The five broken localStorage domains** → `secondary_goals`, `career_milestones`, `activities`, `documents`, `cover_letters` (types need their own audit pass before the schema migration).
10. **Backend modules** — one `server/db/*.ts` per domain, all owner-filtered by the verified user id.
11. **Domain endpoints** — replace the monolithic `POST /api/state` with per-domain routes; keep `POST /api/state` as a deprecated import path.
12. **Frontend hydration** — read from the server, write through the server; keep localStorage as a cache.
13. **Legacy import** — one-time import of the demo state and any user localStorage data.
14. **Legacy JSON retirement** — only after explicit approval.

---

## 18. Risks / Blockers

1. **Demo user has no Auth counterpart** — `user-default-1` + its salted hash cannot become a Supabase Auth user programmatically; a decision is needed on re-creating the account.
2. **Five domains are already broken** — secondary goals, milestones, activities, documents and cover letters are lost on every reload today. Their types were not fully audited, so their tables are not in §10 yet.
3. **CV data is currently lost on reload** — `activeCV`/`cvVersions` are not persisted anywhere.
4. **`/api/state` write amplification** — every state change rewrites the whole document.
5. **Migration history blocks `db push`** — must be retired locally first (§14).
6. **Public-profile privacy gap** — the endpoint currently serves rows with no visibility check because `is_public` does not exist. It is a dormant route (no frontend consumer), but the flag should land with the additive columns.
7. **Storage bucket provisioning** — a private bucket is needed for CV files; that is a Supabase configuration change, not a migration.
8. **No `is_public` data for existing users** — the column defaults to `false`, so every existing row stays private (fail-closed) until a user opts in.

---

## 19. Git Status

- **Branch**: `audit/before-supabase-migration`
- **Working tree** (uncommitted, from earlier approved phases): `.env.example`, `package-lock.json`, `package.json`, `server.ts`, `tsconfig.json` modified; `src/lib/`, `server/` untracked; report markdown files untracked
- **Commits**: one — `8666da4 chore: establish pre-migration baseline` (52 files, no secrets)
- **This phase**: only this report file was added. **No commit, no push, no deploy.**

---

## 20. Scope

- **B.3.3**: AUDIT / PLAN ONLY — complete
- **B.3.2**: COMPLETE
- **B.3 Group A**: PARTIAL (backend migrated; the unmapped domains remain)
- **Group B**: NOT STARTED · **Group C**: NOT STARTED · **Group D**: NOT STARTED · **Group E**: NOT STARTED · **Group F**: NOT STARTED
- **B.4**: NOT STARTED
- Database changes: NONE · RLS changes: NONE · Migrations created: NONE · `src/` changes: NONE · `server.ts` changes: NONE
- `.careerpilot_state.json`: RETAINED, unmodified
- Commit: NONE · Push: NONE · Deploy: NONE
