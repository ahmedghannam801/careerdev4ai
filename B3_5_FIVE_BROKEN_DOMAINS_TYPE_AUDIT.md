# B.3.5 — Five Broken Domains: Type Audit

Phase: B.3.5 — AUDIT + TYPE/CONTRACT DESIGN ONLY.
Scope: `secondary_goals`, `career_milestones`, `activities`, `documents`, `cover_letters`.
Status: **COMPLETE.**

**No schema change, no migration, no RLS change, no `server.ts` change, no `server/db/*` module, no React/component/state change, no localStorage key added/removed/renamed, no data moved, no deploy, no push, `.careerpilot_state.json` untouched.** The only file written by this phase is this report.

---

## 1. Executive Summary

All five domains are **read-only broken persistence**, confirmed by exhaustive search:

| Finding | Evidence |
|---|---|
| **Zero writes, one read each** | `setItem` count = 0 and `getItem` count = 1 for every one of the five keys |
| **Never reaches the backend** | None of the five appear in the `POST /api/state` payload (`CareerContext.tsx:1388-1401`) |
| **Mutations exist but die on reload** | Every domain has working in-memory mutators (`addSecondaryGoal`, `addMilestone`, `logActivity`, `addDocument`/`updateDocument`/`deleteDocument`, `saveCoverLetter`/`deleteCoverLetter`) exposed on the context — but the result is only ever held in React state |
| **Fallback is demo seed data** | Each initialiser falls back to a hardcoded array (`sg-1`, `ms-1`, `act-1`, `doc-1`, `cl-1` style ids) — a user who adds an item sees it until refresh, then sees the demo data again |
| **Two of the five are duplicates of existing concepts** | `documents` overlaps `cvs`/`cv_versions` and `cover_letters`; `career_milestones` is a *different* concept from roadmap milestones |
| **One double-write exists** | Saving a cover letter writes **both** a `CoverLetter` and a `CareerDocument(type:'cover_letter')` |
| **One dead field** | `CareerDocument.fileUrl` is never populated anywhere in the codebase |
| **No Storage dependency** | No `storage`, `blob`, `FileReader` or upload call anywhere in `src/` — `documents` is metadata only |

**Schema impact: 4 new tables required** (`secondary_goals`, `career_milestones`, `activities`, `cover_letters`), and **1 domain (`documents`) is a duplicate that should be resolved rather than persisted**. `career_milestones` and `secondary_goals` are genuinely distinct concepts, not duplicates.

**All five domains currently have zero Supabase target.** Nothing in B.3.4's 23 tables represents them.

---

## 2. Domain Inventory

| Domain | Current Source | Type | Persistence | Owner | Schema Target | Status |
|---|---|---|---|---|---|---|
| `secondary_goals` | `localStorage['careerpilot_secondary_goals']` | `SecondaryCareerGoal` | **READ_ONLY_BROKEN** | user (implicit, none enforced) | none | Needs new table |
| `career_milestones` | `localStorage['careerpilot_milestones']` | `CareerMilestoneItem` | **READ_ONLY_BROKEN** | user (implicit) | none | Needs new table (distinct from roadmap milestones) |
| `activities` | `localStorage['careerpilot_activities']` | `UserActivityItem` | **READ_ONLY_BROKEN** | user (implicit) | none | Needs new table (append-only feed) |
| `documents` | `localStorage['careerpilot_documents']` | `CareerDocument` | **READ_ONLY_BROKEN** | user (implicit) | overlaps `cvs`, `cv_versions`, `cover_letters` | **Duplicate — resolve, do not mirror** |
| `cover_letters` | `localStorage['careerpilot_cover_letters']` | `CoverLetter` | **READ_ONLY_BROKEN** | user (implicit) | none (closest: `saved_roles`, `job_applications`) | Needs new table |

---

## 3. Detailed Findings

### 3.1 `secondary_goals`

**Type source:** `src/types/career.ts:465` — `export interface SecondaryCareerGoal`.
**State:** `CareerContext.tsx:802` — `useState<SecondaryCareerGoal[]>`.
**Context surface:** `CareerContext.tsx:124` (value), `:125-127` (`addSecondaryGoal`, `updateSecondaryGoal`, `deleteSecondaryGoal`).

- **Are they independent goals?** Yes — a second tier of goals beneath the profile's primary `careerGoal`.
- **Linked to profile?** Only by display: `MyCareerView.tsx:346` renders them under "Calibrate primary targets and secondary tactical goals". There is **no FK or id** in the type linking a goal to a profile, role, or roadmap.
- **Linked to roadmap?** **No.** No field references a roadmap, phase, or task.
- **Fields:** `id`, `title`, `description`, `priority` (high|medium|low), `deadline`, `status` (active|achieved|paused), `progressPercent`.
- **Ordering / priority / status?** Priority is an enum; status is an enum; there is **no numeric ordering field** — ordering is by array position only.
- **Ownership:** implicit — the array lives in the provider; nothing enforces per-user isolation.
- **Timestamps:** `deadline` only. **No `createdAt`/`updatedAt`.**
- **Relationships to other domains:** `addSecondaryGoal` calls `logActivity({actionType:'goal_updated'})` → produces an `activities` entry.

### 3.2 `career_milestones`

**Type source:** `src/types/career.ts:456` — `export interface CareerMilestoneItem`.
**State:** `CareerContext.tsx:849` — `useState<CareerMilestoneItem[]>`.
**Context surface:** `CareerContext.tsx:130`, `:131-132` (`addMilestone`, `deleteMilestone`).

- **Independent or roadmap milestones?** **Independent and a different concept.** `roadmap_milestones` (B.3.4) represent *planned forward work* inside a roadmap. `CareerMilestoneItem` represents *achievements already made* ("Graduated Computer Science B.S.", "Joined Meridian Tech Labs as Frontend Developer", "Secured Technical Interview at Vanguard Systems").
- **A UI-only copy of roadmap data?** **No.** The roadmap's milestones are `RoadmapMilestone` (title, description, tasks[], completedTasksCount) with no date and no `verified` flag; `CareerMilestoneItem` has `dateAchieved` and `verified` and no tasks. They are genuinely different types.
- **Relation to `roadmap_milestones` / `roadmap_tasks`?** **None** — no field links them, and the seed ids do not collide (`ms-1`…`ms-6` vs `ms-1-1`, `ms-1-2`).
- **Fields:** `id`, `title`, `category` (`MilestoneCategory`), `dateAchieved`, `notes?`, `verified?`.
- **`MilestoneCategory`:** `internship | project | certification | application | interview | offer | role | promotion | skill`.
- **Ownership:** implicit.
- **Timestamps:** `dateAchieved` only (a `YYYY-MM-DD` string). No created/updated.
- **Relationships:** `addMilestone` calls `logActivity({actionType:'added_evidence', title:'Career Milestone Recorded'})` — note the action type is `added_evidence`, not a milestone-specific type.

### 3.3 `activities`

**Type source:** `src/types/career.ts:488` — `export interface UserActivityItem`.
**State:** `CareerContext.tsx:880` — `useState<UserActivityItem[]>`.
**Context surface:** `CareerContext.tsx:135`, `:136` (`logActivity`).

- **What is it?** An **activity feed / audit trail of user actions**, rendered by `ActivityView.tsx` as a timeline ("Verified log of meaningful milestones, application events, roadmap completions, and evidence uploads").
- **User actions?** Yes — generated by `logActivity` calls across 7 sites: `CareerContext.tsx` (833 `goal_updated`, 868 `added_evidence`, 1000 `document_saved`, 1058 `document_saved`, 1159 `uploaded_cv`), `ApplicationsView.tsx:81` (`applied_job`), `JobsView.tsx:74` (`saved_job`).
- **Roadmap activity?** Partially — `completed_task` and `completed_course` are the "roadmap" filter, but nothing in the code currently *emits* `completed_task` (see §12 open decision).
- **Dashboard timeline?** It is its own view (`ActivityView`), reachable from the app-shell nav, with its own filter set (roadmap / jobs / interviews / skills / documents).
- **`ActivityActionType`:** `completed_task | completed_course | added_project | uploaded_cv | applied_job | mock_interview | acquired_skill | added_evidence | saved_job | goal_updated | document_saved`.
- **Immutable events or editable records?** **Immutable append-only events.** There is no update or delete for activities; `logActivity` only prepends. `ActivityView` has no edit affordance.
- **Fields:** `id`, `timestamp`, `actionType`, `title`, `subtitle`, `relatedObject?`, `linkView?`.
- **Timestamp problem (important):** `timestamp` is a **human-readable display string**, not a machine date — seeds use `'Today, 10:45 AM'` and `'Yesterday, 3:20 PM'`, and `logActivity` hardcodes `timestamp: 'Just now'`. There is **no ISO date field**, so a persisted feed could not be ordered or filtered by date without adding one.
- **Relationships:** `linkView` is a string route hint (`'documents'`, `'roadmap'`); `relatedObject` is a free-text label, **not an id** — no FK is possible to other domains from the current shape.
- **Ownership:** implicit.

### 3.4 `documents`

**Type source:** `src/types/career.ts:512` — `export interface CareerDocument`.
**State:** `CareerContext.tsx:935` — `useState<CareerDocument[]>`.
**Context surface:** `CareerContext.tsx:140-142` (`addDocument`, `updateDocument`, `deleteDocument`).

- **Actual document types:** `'cv' | 'cover_letter' | 'certificate' | 'portfolio' | 'supporting'`.
- **Does it include CVs?** Yes — `type: 'cv'`, and `DocumentsView.tsx:52/102` creates them.
- **Certificates / portfolios / supporting?** Yes — the seed contains `doc-3` (certificate) and `doc-4` (portfolio). `'supporting'` is declared in the type but **never used** in any seed or creation path.
- **Generated documents?** Yes — `doc-2` is a generated cover letter.
- **Difference vs `cvs` / `cv_versions`?** `cvs`/`cv_versions` (B.3.4) model the *structured CV document and its version snapshots* (`profile_json`, `ats_analysis`). `CareerDocument` is a **flat catalogue entry** — a name, a type tag, a size string, a privacy flag. A CV appears in **both** models: as a `cvs` row (structured) and as a `CareerDocument(type:'cv')` (a listed file). They are the same user concept stored twice.
- **File/blob reference?** `fileUrl?: string` — **never populated anywhere in `src/`** (verified: zero assignments). The document record can therefore never point at a real file today.
- **Storage dependency?** **None.** No `storage`, `blob`, `FileReader` or upload call exists in `src/`. `format` is a label (`'pdf' | 'docx' | 'txt' | 'link'`), `size` is a display string (`'142 KB'`).
- **Privacy field?** Yes — `isPublic: boolean` (required). The seed sets `doc-1/3/4` public and `doc-2` private. **`documents` is not exposed on the public profile** (`ProfileView.tsx` has no reference to it), so the flag currently has no effect.
- **Metadata only or content?** Metadata plus an optional `contentPreview?: string` (a short excerpt typed by the user in the form, or the first 200 chars of a cover letter).

**Relationship IDs are real and resolvable:** `relatedRoleId: 'frontend-engineer'` → `TARGET_ROLES`; `relatedApplicationId: 'app-1'` → the `applications` seed; `CoverLetter.targetJobId: 'job-fe-01'` → `JOBS_CATALOG`; `CoverLetter.applicationId: 'app-1'` → the `applications` seed. These are **string references, not foreign keys**, and the referenced entities are themselves unpersisted.

### 3.5 `cover_letters`

**Type source:** `src/types/career.ts:498` — `export interface CoverLetter`.
**State:** `CareerContext.tsx:1016` — `useState<CoverLetter[]>`.
**Context surface:** `CareerContext.tsx:143`, `:144-145` (`saveCoverLetter`, `deleteCoverLetter`).

- **Generated text?** Yes — `content: string` is the letter body. `generateAiCoverLetter` (line 1068) calls `POST /api/generate-cover-letter` and returns `{ coverLetter, keyHighlights }`; `saveCoverLetter` then persists the text locally.
- **Linked to a saved role or job application?** **To a job application** — `applicationId?: string` (`'app-1'` in the seed) and `targetJobId?: string` (`'job-fe-01'`). There is **no** `roleId` field, so it does **not** link to `saved_roles` — the `saved_roles` table (B.3.4) has no counterpart here.
- **Target job/company/title?** Yes — `company`, `role`, optional `jobDescription`, plus `title` (a display label, e.g. "Vanguard Systems — Frontend Engineer").
- **Versions?** **No.** `saveCoverLetter` updates the existing record in place (mutating `content` and bumping `updatedAt`) — there is no version history, unlike CVs which have `cv_versions`.
- **Generated vs edited state?** **Not tracked.** The type has no `isEdited`/`source` flag — once a generated letter is saved it is indistinguishable from a hand-written one.
- **Timestamps?** Yes — `createdAt`, `updatedAt` (both `YYYY-MM-DD` strings).
- **Double-write (verified):** `DocumentsView.tsx:132` calls `saveCoverLetter(...)` **and** `DocumentsView.tsx:142` calls `addDocument({ type:'cover_letter', ... })` for the same letter — the same content lands in two separate stores.
- **`keyHighlights: string[]`** — the AI response's highlights array, stored alongside the letter.

---

## 4. Exact Current Types

Reproduced verbatim from `src/types/career.ts` (no fields added, removed or renamed).

```ts
// src/types/career.ts:465
export interface SecondaryCareerGoal {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  deadline: string;
  status: 'active' | 'achieved' | 'paused';
  progressPercent: number;
}

// src/types/career.ts:456
export interface CareerMilestoneItem {
  id: string;
  title: string;
  category: MilestoneCategory;
  dateAchieved: string;
  notes?: string;
  verified?: boolean;
}

// src/types/career.ts:488
export interface UserActivityItem {
  id: string;
  timestamp: string;
  actionType: ActivityActionType;
  title: string;
  subtitle: string;
  relatedObject?: string;
  linkView?: string;
}

// src/types/career.ts:512
export interface CareerDocument {
  id: string;
  name: string;
  type: 'cv' | 'cover_letter' | 'certificate' | 'portfolio' | 'supporting';
  format: 'pdf' | 'docx' | 'txt' | 'link';
  size: string;
  updatedAt: string;
  createdAt: string;
  relatedRoleId?: string;
  relatedApplicationId?: string;
  isPublic: boolean;
  fileUrl?: string;
  contentPreview?: string;
}

// src/types/career.ts:498
export interface CoverLetter {
  id: string;
  title: string;
  company: string;
  role: string;
  jobDescription?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  keyHighlights: string[];
  targetJobId?: string;
  applicationId?: string;
}
```

Enums:
```ts
export type MilestoneCategory =
  | 'internship' | 'project' | 'certification' | 'application'
  | 'interview' | 'offer' | 'role' | 'promotion' | 'skill';

export type ActivityActionType =
  | 'completed_task' | 'completed_course' | 'added_project' | 'uploaded_cv'
  | 'applied_job' | 'mock_interview' | 'acquired_skill' | 'added_evidence'
  | 'saved_job' | 'goal_updated' | 'document_saved';
```

**Type conflicts: none.** Each of the five interfaces is declared exactly once, in `src/types/career.ts`. There is no competing definition anywhere in `src/`. No `any` is used in any of the five types.

**Adjacent type (for contrast only, not one of the five):** `CareerGoal` (`src/types/career.ts:8`) is a *string union* (`get_first_job | get_internship | switch_career | get_promoted | become_specialist | become_manager | build_portfolio | freelance | explore_careers | custom`) — the primary goal enum stored on the profile, categorically different from `SecondaryCareerGoal`.

---

## 5. Lifecycle Findings

| Domain | Create | Read | Update | Delete | Persist | Reload |
|---|---|---|---|---|---|---|
| `secondary_goals` | `addSecondaryGoal` (`:829`), id `sg-${Date.now()}` | `MyCareerView:390`, `GlobalSearchModal:37` | `updateSecondaryGoal` (`:840`) | `deleteSecondaryGoal` (`:845`) | **NONE** | demo seed `sg-1`, `sg-2` |
| `career_milestones` | `addMilestone` (`:864`), id `ms-${Date.now()}` | `MyCareerView:499` | **none** | `deleteMilestone` (`:876`) | **NONE** | demo seed `ms-1`…`ms-6` |
| `activities` | `logActivity` (`:925`), id `act-${Date.now()}`, timestamp `'Just now'` | `ActivityView:49-50`, filter at `:50-55` | **none** (append-only) | **none** | **NONE** | demo seed `act-1`… |
| `documents` | `addDocument` (`:991`), id `doc-${Date.now()}` | `DocumentsView`, `GlobalSearchModal:60` | `updateDocument` (`:1007`) | `deleteDocument` (`:1011`) | **NONE** | demo seed `doc-1`…`doc-4` |
| `cover_letters` | `saveCoverLetter` (`:1043`), id `cl-${Date.now()}` | `DocumentsView:217` (`coverLetters.length`), `GlobalSearchModal` | `saveCoverLetter` (update branch, `:1044`) | `deleteCoverLetter` (`:1066`) | **NONE** | demo seed `cl-1` |

**Every domain: Create → Read → Update → Delete happen; Persist and Reload do not.**

---

## 6. LocalStorage Findings

| Key | Read sites | Write sites | Serialization | Default | Survives reload? | Status |
|---|---|---|---|---|---|---|
| `careerpilot_secondary_goals` | `CareerContext.tsx:803` | **0** | `JSON.parse` of a `SecondaryCareerGoal[]` | 2 seeded goals (`sg-1`, `sg-2`) | **No** (never written) | **READ_ONLY_BROKEN** |
| `careerpilot_milestones` | `CareerContext.tsx:850` | **0** | `JSON.parse` of a `CareerMilestoneItem[]` | 6 seeded milestones (`ms-1`…`ms-6`) | **No** | **READ_ONLY_BROKEN** |
| `careerpilot_activities` | `CareerContext.tsx:881` | **0** | `JSON.parse` of a `UserActivityItem[]` | seeded activities with display-string timestamps | **No** | **READ_ONLY_BROKEN** |
| `careerpilot_documents` | `CareerContext.tsx:936` | **0** | `JSON.parse` of a `CareerDocument[]` | 4 seeded documents (`doc-1`…`doc-4`) | **No** | **READ_ONLY_BROKEN** |
| `careerpilot_cover_letters` | `CareerContext.tsx:1017` | **0** | `JSON.parse` of a `CoverLetter[]` | 1 seeded letter (`cl-1`) | **No** | **READ_ONLY_BROKEN** |

**Empty/null behaviour:** each initialiser does `if (saved) { try { return JSON.parse(saved) } catch {} }` and falls through to the demo seed. A malformed or empty value is swallowed by the empty `catch` and the demo data is used — the user never sees an error.

**Migrated to backend?** **No** — not one of the five appears in the `POST /api/state` payload (`CareerContext.tsx:1388-1401`: `profile, targetRole, savedRoles, skills, roadmapPhases, projects, evidenceItems, activeCV, cvVersions, applications, interviewSessions, settings`).

---

## 7. Schema Mapping (against the 23 tables created in B.3.4)

| Domain | A. Existing target | B. Partial target | C. No target | D. Duplicate concept | Notes |
|---|---|---|---|---|---|
| `secondary_goals` | — | `profiles.career_goal` holds the *primary* goal only | **No target** | — | No table can hold priority/status/deadline/progressPercent |
| `career_milestones` | — | — | **No target** | **Partially** — distinct from `roadmap_milestones` (planned work) but the word "milestone" collides | Needs its own table; `roadmap_milestones` cannot hold `dateAchieved`/`verified`/`category` |
| `activities` | — | — | **No target** | — | Append-only feed; no existing table is an event log |
| `documents` | `cvs` (+`cv_versions`) | `cover_letters` (to be created) | — | **YES — duplicate** | `documents.type='cv'` duplicates `cvs`; `documents.type='cover_letter'` duplicates `cover_letters`; `certificate` duplicates `profile_certifications`; `portfolio` duplicates `projects`; `supporting` is unused |
| `cover_letters` | — | `saved_roles` (role catalogue), `job_applications` (target company/role) | **No target** (for the letter body) | — | `saved_roles` stores a *role bookmark*; `job_applications` stores pipeline state. Neither holds `content`/`keyHighlights` |

### Required additions if all five were persisted
- **3 new tables** for the genuinely new concepts: `secondary_goals`, `career_milestones`, `activities`
- **1 new table** for `cover_letters`
- **`documents`**: no new table — it should be **decomposed** into the existing `cvs`/`cv_versions`/`cover_letters`/`profile_certifications`/`projects` tables, with the `CareerDocument` UI shape kept as a client-side projection
- **0 changes to the 23 existing tables**; `cover_letters` would reference `job_applications(id)` and `saved_roles` via string columns mirroring the current `applicationId` / `targetJobId` fields (both are already string references, not FKs, in the current code)

---

## 8. Duplicate / Overlap Analysis

**`career_milestones` vs `roadmap_milestones` vs `roadmap_tasks`**
- `roadmap_milestones` = planned forward work inside a roadmap (`title`, `description`, `tasks[]`, `completedTasksCount`). No date, no `verified`, no `category`.
- `roadmap_tasks` = the executable unit (`status`, `deadline`, `skillId`, `evidenceId`).
- `CareerMilestoneItem` = **achieved, dated, optionally verified life events** (`dateAchieved`, `verified`, `category`).
- **Verdict: NOT a duplicate.** Three different concepts; seed ids do not collide (`ms-1` vs `ms-1-1`). A separate table is required; naming it `career_milestones` (not `milestones`) avoids ambiguity with the roadmap tables.

**`documents` vs `cvs` vs `cv_versions`**
- `cvs` = a CV document owned by a user, with `storage_path` and `is_active`.
- `cv_versions` = immutable snapshots with `profile_json` + `ats_analysis`.
- `CareerDocument(type:'cv')` = a *listing* of a CV by name/size/format.
- **Verdict: DUPLICATE for the `cv` and `cover_letter` types.** `CareerDocument` also duplicates `profile_certifications` (type `'certificate'`) and `projects` (type `'portfolio'`). Only `type:'supporting'` has no counterpart — and it is never used, so it can be dropped rather than migrated.

**`cover_letters` vs `saved_roles` vs `job_applications`**
- `saved_roles` = a bookmarked **role** (`role_id`, `title`, `category`, `level`, `payload_json`).
- `job_applications` = pipeline state for a specific application (`company`, `role`, `stage`, `notes`, `next_action`).
- `CoverLetter` = the **letter body** for a target (`content`, `keyHighlights`, `company`, `role`, `applicationId`, `targetJobId`).
- **Verdict: NOT a duplicate.** A cover letter is a document body; the other two are metadata. Note the asymmetry: `cover_letters` links to `job_applications` but **not** to `saved_roles` — a letter saved against a role has no place to point.

**`activities` vs roadmap progress vs dashboard timeline**
- Roadmap progress is **derived** from `roadmap_tasks.status` — there is no progress table (deliberately rejected in B.3.3).
- `activities` is a **user-action event log** with a typed `actionType`; it is a *history*, not a *state*.
- **Verdict: NOT a duplicate of progress.** But the `completed_task` / `completed_course` / `acquired_skill` / `added_project` / `mock_interview` action types are **not currently emitted** by any code path — only `goal_updated`, `added_evidence`, `document_saved`, `uploaded_cv`, `applied_job`, `saved_job` are. An activity feed that records only 6 of its 11 declared event types is incomplete.

**`secondary_goals` vs roadmap vs `profile.careerIdentity`**
- `profile.careerGoal` = a single enum-tagged primary goal.
- `profile.careerIdentity` = a 7-field narrative (who you are, where you're going, why…).
- `roadmaps` = the generated plan of work.
- `SecondaryCareerGoal` = discrete, dated, prioritized, percentage-tracked **sub-goals**.
- **Verdict: NOT a duplicate.** A distinct tier between the primary goal and the roadmap, with no existing representation.

---

## 9. Data Loss Risks

| Event | `secondary_goals` | `career_milestones` | `activities` | `documents` | `cover_letters` |
|---|---|---|---|---|---|
| **Browser refresh** | LOST | LOST | LOST | LOST | LOST |
| **Logout / login** | LOST | LOST | LOST | LOST | LOST |
| **Browser cache clear** | LOST | LOST | LOST | LOST | LOST |
| **Device change** | LOST | LOST | LOST | LOST | LOST |
| **Server restart** | LOST (never sent to the server) | LOST | LOST | LOST | LOST |

**Additional specific risks:**

1. **Silent loss.** No error, no warning — the demo seed simply reappears. A user who records a milestone watches it vanish and sees the demo's "Graduated Computer Science B.S." instead, with no indication anything was lost.
2. **The activity feed is the most damaging loss** — it is written by *other* domains (`addSecondaryGoal`, `addMilestone`, `addDocument`, `saveCoverLetter`, `ApplicationsView`, `JobsView`, CV duplication). Losing it also loses the *record* that those other actions happened.
3. **Cover letters lose AI output.** `generateAiCoverLetter` returns real Gemini content; `saveCoverLetter` stores it only in memory. Regenerating costs another AI call and may return different text.
4. **`documents` never had a file.** `fileUrl` is never populated and no Storage bucket exists — the CV the user "uploaded" is parsed in memory and discarded (confirmed in B.3.3 §6). So even the *seeded* documents are fiction, and a user-added document is a name with no file.
5. **Non-atomic double-write.** Saving a cover letter writes to `coverLetters` and `documents` in two separate `setState` calls. If the process dies between them, the two stores diverge.
6. **No cross-device continuity.** Everything a user builds in the app lives only on that device, in that browser.

---

## 10. Recommended Persistence Strategy (proposal only — nothing implemented)

| Domain | Strategy | Rationale |
|---|---|---|
| `secondary_goals` | **New table required** | No existing table holds priority/status/deadline/progress |
| `career_milestones` | **New table required** | Distinct concept from roadmap milestones; needs `date_achieved`, `verified`, `category` |
| `activities` | **New table required** | Append-only event log; no existing table serves as one |
| `cover_letters` | **New table required** | Holds a document body; `saved_roles`/`job_applications` are metadata only |
| `documents` | **Resolve, do not mirror** | Decompose into `cvs`/`cv_versions` (cv), `cover_letters` (cover_letter), `profile_certifications` (certificate), `projects` (portfolio). Drop the unused `'supporting'` type. Keep the `CareerDocument` shape as a **client-side projection** over those tables so the UI contract is unchanged. |

### Proposed table contracts (design only — no migration created)

**`public.secondary_goals`**
- PK `id uuid`; owner `profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
- Columns: `title text NOT NULL`, `description text`, `priority text NOT NULL DEFAULT 'medium'`, `deadline date`, `status text NOT NULL DEFAULT 'active'`, `progress_percent int NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptZ NOT NULL DEFAULT now()`
- CHECK `priority IN ('high','medium','low')`; CHECK `status IN ('active','achieved','paused')`; CHECK `progress_percent BETWEEN 0 AND 100`
- Index: `idx_secondary_goals_profile_id`; optional UNIQUE `(profile_id, title)`
- RLS: `auth.uid() = profile_id` for SELECT/INSERT/UPDATE/DELETE

**`public.career_milestones`**
- PK `id uuid`; owner `profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
- Columns: `title text NOT NULL`, `category text NOT NULL`, `date_achieved date NOT NULL`, `notes text`, `verified boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`
- CHECK `category IN ('internship','project','certification','application','interview','offer','role','promotion','skill')`
- Index: `idx_career_milestones_profile_id`; index on `date_achieved DESC` for timeline order
- RLS: `auth.uid() = profile_id` for all four commands

**`public.activities`**
- PK `id uuid`; owner `profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
- Columns: `action_type text NOT NULL`, `title text NOT NULL`, `subtitle text`, `related_object text`, `link_view text`, `occurred_at timestamptz NOT NULL DEFAULT now()`, `created_at timestamptz NOT NULL DEFAULT now()`
- CHECK `action_type IN ('completed_task','completed_course','added_project','uploaded_cv','applied_job','mock_interview','acquired_skill','added_evidence','saved_job','goal_updated','document_saved')`
- Index: `idx_activities_profile_id`; index on `occurred_at DESC`
- **Deviation from the current type that must be decided:** the current `timestamp: string` is a display string (`'Just now'`, `'Today, 10:45 AM'`). A persisted feed needs a real timestamp. Proposed: store `occurred_at` and keep `timestamp` as a **derived display value** computed on read (or keep both, with `timestamp` populated by the client for exact display parity). This is an open decision, not a settled change.
- RLS: `auth.uid() = profile_id` for all four commands

**`public.cover_letters`**
- PK `id uuid`; owner `profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
- Columns: `title text NOT NULL`, `company text NOT NULL`, `role text NOT NULL`, `job_description text`, `content text NOT NULL`, `key_highlights jsonb NOT NULL DEFAULT '[]'::jsonb`, `target_job_id text`, `application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL`, `created_at`, `updated_at`
- Index: `idx_cover_letters_profile_id`; index on `application_id`
- Note: `target_job_id` stays a **string** — the job catalogue is static source code, not a table (same reasoning as `job_applications.job_id`)
- RLS: `auth.uid() = profile_id` for all four commands

**Schema change total:** 4 new tables, 0 changes to the existing 23, 0 new columns on `profiles`.

---

## 11. Proposed API Contracts (proposal only — nothing implemented)

All routes: `Authorization: Bearer <Supabase JWT>` required; ownership derived from the verified token only; a client-supplied `profileId`/`userId` is ignored.

| Method | Path | Purpose | Request | Response | Idempotent? |
|---|---|---|---|---|---|
| GET | `/api/secondary-goals` | list | — | `{ success, goals: SecondaryCareerGoal[] }` | yes (read) |
| POST | `/api/secondary-goals` | create | `{ title, description, priority, deadline, status, progressPercent }` | `{ success, goal }` | no |
| PATCH | `/api/secondary-goals/:id` | update | partial goal fields | `{ success, goal }` | no |
| DELETE | `/api/secondary-goals/:id` | delete | — | `{ success }` | yes |
| GET | `/api/career-milestones` | list | — | `{ success, milestones: CareerMilestoneItem[] }` | yes |
| POST | `/api/career-milestones` | create | `{ title, category, dateAchieved, notes?, verified? }` | `{ success, milestone }` | no |
| DELETE | `/api/career-milestones/:id` | delete | — | `{ success }` | yes |
| GET | `/api/activities` | list (newest first) | `?limit=&actionType=` | `{ success, activities: UserActivityItem[] }` | yes |
| POST | `/api/activities` | append an event | `{ actionType, title, subtitle, relatedObject?, linkView? }` | `{ success, activity }` | no (append-only) |
| GET | `/api/cover-letters` | list | — | `{ success, coverLetters: CoverLetter[] }` | yes |
| POST | `/api/cover-letters` | create | `{ title, company, role, jobDescription?, content, keyHighlights, targetJobId?, applicationId? }` | `{ success, coverLetter }` | no |
| PATCH | `/api/cover-letters/:id` | update | partial fields | `{ success, coverLetter }` | no |
| DELETE | `/api/cover-letters/:id` | delete | — | `{ success }` | yes |

**Deliberately NOT proposed:**
- **No bulk endpoint.** A single `POST /api/state`-style aggregate would repeat the write-amplification problem already identified in B.3.3 §18.
- **No `PUT /api/activities` or `DELETE /api/activities`.** The feed is append-only by design.
- **No `PUT /api/career-milestones`.** There is no update mutator in the current code — adding one would invent functionality.
- **No `documents` endpoints.** That domain is to be resolved into existing tables, not mirrored.
- **No `GET /api/documents`.** The `CareerDocument` list is derivable by unioning `cvs` + `cover_letters` + `profile_certifications` + `projects`; a dedicated table would duplicate data.

**Storage note:** `documents.fileUrl` implies file storage that does not exist. Persisting it requires a Supabase Storage bucket — a separate, explicitly approved configuration step (as deferred in B.3.3 §18 and B.3.4 §18). It is **not** part of this proposal.

---

## 12. Open Decisions / Blockers

1. **`activities.timestamp` is a display string, not a date.** The current type stores `'Just now'` / `'Today, 10:45 AM'`. A persisted, sortable feed requires a real timestamp column. **Decide:** store `occurred_at` and derive the display string, or store both. This changes the type and cannot be decided from the code alone.
2. **`documents` — resolve or persist?** The recommendation is to decompose it into existing tables and keep the `CareerDocument` shape as a client-side projection. But that changes how `DocumentsView` and `GlobalSearchModal` read their data — a frontend change in a later phase. **Needs explicit approval of the resolution strategy before any table work.**
3. **The double-write must be resolved.** Saving a cover letter currently writes `coverLetters` *and* `documents`. Persisting both would encode the duplication permanently. **Decide:** drop the `documents` write, or keep a projected document entry derived from `cover_letters`.
4. **`CareerMilestoneItem` has no update path** and `UserActivityItem` has no delete path. Confirm these are intentional (create-only / append-only) before fixing the schemas — otherwise the API contracts above would need extending.
5. **`MilestoneCategory` includes `'promotion'`, `'offer'`, `'skill'`, `'application'`** — categories that overlap with `job_applications.stage` and `user_skills`. Whether a milestone is a duplicate of an application event for those categories is a product decision, not a code one.
6. **Six of the eleven `ActivityActionType` values are never emitted** (`completed_task`, `completed_course`, `added_project`, `mock_interview`, `acquired_skill`, and `added_evidence` — the last one is emitted but with the *title* "Career Milestone Recorded"). Either the emitters are missing or the enum is aspirational. The schema CHECK should be constrained to the types actually used, or the emitters should be added.
7. **`'supporting'` document type is declared but never used** — it needs no representation in the schema.
8. **The demo seed data for all five domains is the same "Sarah Jenkins" scenario** as the rest of the app. When these become PostgreSQL-backed, the seed arrays become the fallback for an unauthenticated visitor — a decision is needed on whether a seeded demo profile should exist in the database.
9. **No Storage bucket exists**, so `documents.fileUrl` and any real document file remain unresolvable regardless of the schema work.

---

## 13. B.3.6 Implementation Order (proposed)

**Prerequisite — B.3.6.0: resolve the open decisions above.** Decisions 1, 2 and 3 change the design; implementing the tables first would likely mean reworking them.

1. **B.3.6.1 — `server/db/activities.ts` + `/api/activities`**
   Smallest surface, append-only, no update/delete, and it is the domain that *other* domains write into — getting the emitter pattern right first benefits everything else.

2. **B.3.6.2 — `server/db/secondaryGoals.ts` + `/api/secondary-goals`**
   Full CRUD, no external dependencies, no relationship ambiguity.

3. **B.3.6.3 — `server/db/careerMilestones.ts` + `/api/career-milestones`**
   Create/delete only, mirroring the existing mutators. Must be named to avoid confusion with `roadmap_milestones`.

4. **B.3.6.4 — `server/db/coverLetters.ts` + `/api/cover-letters`**
   Depends on `job_applications` existing for the `application_id` FK, and on decision 3 (the double-write).

5. **B.3.6.5 — resolve `documents`**
   After the four tables above exist, the `CareerDocument` list can be composed from `cvs` + `cover_letters` + `profile_certifications` + `projects`. This is the step that removes the duplication, and it is partly a frontend change.

6. **B.3.6.6 — frontend wiring**
   Move the five `useState` initialisers to hydrate from the new endpoints, and add the corresponding `setItem` calls (or drop the localStorage keys entirely once the server is authoritative — which is the cleaner end state, and the natural conclusion of the B.3.1 → B.3.6 arc).

7. **B.3.6.7 — legacy localStorage migration + key removal**
   Offer the user an import of their local copy (server wins by default, per B.3.3 §13), then remove the five read-only keys.

---

## 14. Scope & Verification

- **Schema changes: NONE** · **Migrations created: NONE** · **RLS changes: NONE**
- **`server.ts` changes: NONE** · **`server/db/*` changes: NONE** · **`src/**` changes: NONE**
- **localStorage keys: NONE added, removed or renamed** · **`.careerpilot_state.json`: unchanged**
- **Deploy: NONE** · **Push: NONE** · **Commit: NONE**
- **Modified files: this report only** (`B3_5_FIVE_BROKEN_DOMAINS_TYPE_AUDIT.md`)

**Verification run (read-only, nothing broken):**

| Command | Result |
|---|---|
| `npm run lint` | **PASS** — `tsc --noEmit`, no errors |
| `npm run build` | **PASS** — `✓ 1736 modules transformed`, `✓ built in 26.63s` |
| `npm audit` | **PASS** — 0 vulnerabilities |
| `npm test` | **Not run — no test script exists** in `package.json` (scripts: `dev, start, build, preview, clean, lint`) |

**Files examined: 37** TypeScript/TSX source files under `src/` (all of them), plus `src/types/career.ts` (571 lines) and `src/context/CareerContext.tsx` (2,230 lines) in depth, plus the 23 live tables from B.3.4 for the mapping.
