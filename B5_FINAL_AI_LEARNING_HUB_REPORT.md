# B.5 — AI Learning Hub: Final Report

**Project:** CareerPilot  
**Branch:** `audit/before-supabase-migration`  
**Baseline HEAD:** `2b7147798b4fc3f956b6630fe4caac353245bb53`  
**Scope:** Phase B.5 AI Learning Hub and course-intelligence layer  
**Status:** Implemented, migrated, tested and verified.

---

## 1. What was built

### 1.1 Normalized learning model

Two forward-only migrations were added:

| Migration | Purpose |
| --- | --- |
| `202510220001_learning_hub_schema.sql` | Four tables, indexes, constraints, timestamps and RLS |
| `202510220002_learning_hub_catalog.sql` | 77 verified resources plus skill and role mappings |

Tables:

- `public.courses` — curated catalogue: provider, canonical URL, level, duration, language, availability, format and description.
- `public.course_skills` — `(course_id, skill_name, importance)`, with `skill_name` as the canonical scoring key and an optional `skill_id` link.
- `public.course_roles` — `(course_id, role_slug, relevance_score)` against the application's eight canonical target roles.
- `public.user_learning_items` — owned learning state: `saved`, `in_progress`, `completed`, `dismissed`, progress, timestamps, notes and the recommendation reason shown when the user saved the course.

The catalogue is global read-only reference data. User state is owned through
`auth.users.id → public.profiles.id → user_learning_items.profile_id`.

### 1.2 Curated catalogue

- **77 courses**
- **195 course-skill mappings**
- **183 course-role mappings**
- **19 provider labels**
- DataCamp: **20 courses**, the strongest single provider for Python, SQL, Excel, Power BI, statistics and data analysis
- Coursera specializations and professional certificates: **`paid`**
- Coursera SQL course: **`audit`**
- Udemy: **`paid`**
- edX CS50/AWS courses: **`audit`**
- YouTube courses/playlists: **`youtube_free`**
- DataCamp: **`free_with_limitations`**
- No provider is presented as universally free.

Availability totals in the live catalogue:

| Availability | Count |
| --- | ---: |
| `free` | 26 |
| `free_with_limitations` | 28 |
| `audit` | 6 |
| `paid` | 13 |
| `youtube_free` | 4 |

Live URL audit result: **77 checked, 54 returned 2xx/3xx, 23 returned HTTP 403 from
bot-protection** (20 DataCamp and 3 Udemy). No 404 or 5xx response was observed.
The protected pages were additionally verified through a text proxy during
catalogue construction, including titles and course identity. No URL, provider,
price or availability was invented to fill the catalogue.

### 1.3 Deterministic recommendation engine

`server/learning/recommendation.ts` is a pure module with no database or model
dependency. It scores each course before any AI call:

- skill-gap fit and skill importance
- target-role relevance
- roadmap skill/course matches
- career-goal category fit
- experience-to-level fit
- language
- preferred format
- available weekly time versus course duration
- budget and availability
- saved-course intent
- explicit roadmap/focus-skill boost

Free-only mode excludes `paid` courses entirely. Dismissed courses are always
excluded; completed courses are excluded by default and can be included only by
an explicit engine option. Ties break on role relevance and then title, so the
same input produces the same order.

Every recommendation includes:

- a numeric score and full score breakdown
- matched skills and addressed gaps
- role relevance
- a deterministic explanation
- the catalogue's own URL and availability

### 1.4 AI explanation layer and safe fallback

`server/learning/ai.ts` receives **only the already-ranked candidates**. It is
never the source of courses, IDs, URLs, providers, prices or ranking.

Validation rejects:

- unknown course IDs
- duplicate course IDs
- missing or too-short explanations
- URLs or `www.` links invented by the model
- malformed skill-gap/roadmap fields
- invalid JSON and empty result sets

On timeout, provider error, missing key or invalid output, the deterministic
result is returned unchanged with a truthful fallback reason. The browser does
not receive raw provider error details.

`GEMINI_API_KEY` is not configured in this environment. Live Gemini generation
therefore could not be exercised here. The deterministic path, validator,
invalid-output fallback and timeout fallback are all covered by automated tests.

### 1.5 API

| Route | Access | Behaviour |
| --- | --- | --- |
| `GET /api/learning/catalog` | public | Cacheable catalogue with skills and roles |
| `GET /api/learning/items` | authenticated | The caller's own learning state |
| `POST /api/learning/items` | authenticated | Upsert saved/in-progress/completed/dismissed state |
| `PATCH /api/learning/items/:courseId` | authenticated | Progress and state updates |
| `DELETE /api/learning/items/:courseId` | authenticated | Remove an owned state row |
| `POST /api/learning/recommendations` | authenticated | Deterministic ranking plus optional AI explanations |

The server always uses `req.authUser.id`. A client-supplied `profile_id` is
ignored. Inputs are bounded and enum-checked. The AI route uses the existing
per-user rate limiter.

### 1.6 Persistence and completion semantics

Learning state survives reload and login through Supabase. Status normalization
is centralized in `server/db/learning.ts`:

- `completed` → `progress_percent = 100`, `completed_at` set
- `in_progress` → at least 1%, `started_at` set
- `saved` / `dismissed` → `completed_at` cleared

**Completing a course never writes to `public.user_skills`.** Skill mastery stays
an explicit action in the Skills Center. This is tested directly against the
database.

### 1.7 UI and roadmap integration

- `LearningCenterView.tsx` provides recommendation, saved, in-progress,
  completed and full-catalogue views.
- Cards show provider, real availability, format, level, duration, role fit,
  matched skills, gap addressed and the explanation.
- Users can save, dismiss, start, update progress, complete, remove and open the
  original resource.
- Preference controls cover weekly hours, budget and format.
- AI/fallback status is visible, not hidden.
- `RoadmapView.tsx` shows catalogue learning options for each task's skill gap
  and can save/start a course and begin the task.
- Global search and the dashboard were updated to use the new catalogue state.

---

## 2. Verification evidence

### 2.1 Database migration

`npx supabase db push --linked --dry-run` identified exactly the two new
migrations. They were then applied with:

```text
npx supabase db push --linked
Applying migration 202510220001_learning_hub_schema.sql...
Applying migration 202510220002_learning_hub_catalog.sql...
Finished supabase db push.
```

`npx supabase migration list --linked` now shows both local and remote entries:

```text
202510220001 | 202510220001
202510220002 | 202510220002
```

No destructive operation was run. No table, row or existing B.4 migration was
deleted or reset.

### 2.2 Live schema and RLS verification

Direct read-only queries via `npx supabase db query --linked` confirmed:

- all four tables exist and have `relrowsecurity = true`
- `courses`, `course_skills`, `course_roles` have public `SELECT` policies only
- no client write policy exists on any catalogue table
- `user_learning_items` has owner-scoped `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- the policies use `auth.uid() = profile_id`
- live counts: **77 courses, 195 skills, 183 roles, 20 DataCamp courses, 19 providers**

The automated RLS tests additionally prove:

- user B cannot read user A's learning rows
- user B cannot insert a row with user A's `profile_id`
- user B cannot update or delete user A's row
- anonymous clients cannot read user learning state
- anonymous and authenticated clients cannot write catalogue rows

### 2.3 Automated tests

```text
npm test
tests 140
suites 36
pass 140
fail 0
cancelled 0
skipped 0
duration_ms 228273.9085
PASS
```

This includes **18 new B.5 tests** covering catalogue integrity, provider
availability, deterministic scoring/exclusions/tie-breaking, AI validation and
fallback, persisted state, completion semantics, recommendation authorization
and RLS isolation. The pre-existing B.4 and security suites also pass.

### 2.4 Type checking

```text
npm run lint
tsc --noEmit
```

Passed with no diagnostics.

### 2.5 Production build

```text
npm run build
✓ 1743 modules transformed.
✓ built in 747ms
dist/index.html                   1.47 kB │ gzip:   0.66 kB
dist/assets/index-CPoThEOp.css   57.83 kB │ gzip:   9.98 kB
dist/assets/index-Bqp3vwyJ.js   915.82 kB │ gzip: 217.06 kB
```

Build passed. Existing non-blocking warnings:

- Vite notes that `vite.config.ts` uses `__dirname` and recommends
  `import.meta.dirname`.
- The main JavaScript chunk is above 500 kB after minification.

### 2.6 Dependency security audit

```text
npm audit --omit=dev
found 0 vulnerabilities

npm audit
found 0 vulnerabilities
```

### 2.7 Supabase security advisors

`npx supabase db advisors --linked --type security` reported only pre-existing
project/auth warnings, none on the new B.5 tables:

- mutable `search_path` on `public.storage_object_owner`
- `SECURITY DEFINER` functions `handle_new_user` and `rls_auto_enable` callable
  by `anon`/`authenticated`
- leaked-password protection disabled in Auth

These were not introduced or modified by B.5 and were left unchanged to avoid
scope creep or destructive changes.

---

## 3. Preservation of B.4 work

The working tree already contained uncommitted B.4 changes before this phase.
They were preserved throughout:

- no reset
- no clean
- no stash
- no discard
- no revert
- no amend
- no cherry-pick of the dangling B.5 commits
- no push and no deployment

B.4 files were only edited where the B.5 integration required it (navigation,
global search, dashboard and roadmap context usage). The B.4 implementations,
migrations and tests remain in place and their tests pass.

---

## 4. Known limitations

1. **Live Gemini verification was not possible** because `GEMINI_API_KEY` is not
   present in `.env` or the shell. The server correctly reports
   `aiUsed: false` with a deterministic fallback. With a key configured, the
   same route will attempt Gemini and still validate every returned item.
2. **The catalogue is English-only.** The model supports language scoring, but
   no Arabic-language course was added because a verified Arabic resource was
   not confirmed during this phase.
3. **DataCamp and Udemy block automated HTTP bots with 403.** Their URLs were
   verified through a text proxy and against live course identity, but a direct
   unauthenticated HTTP probe cannot return 200.
4. **No individual Mahara-Tech or ITI course URL was added.** No single verified
   course page was confirmed, so the catalogue omits them rather than inventing
   links.
5. **No live browser E2E run was performed.** The UI passed TypeScript checking
   and a production build; the API and persistence behaviour is covered by the
   integration suite.

---

## 5. Files introduced or materially changed for B.5

New:

- `server/learning/recommendation.ts`
- `server/learning/ai.ts`
- `server/learning/context.ts`
- `server/db/learning.ts`
- `src/types/learning.ts`
- `src/lib/learningApi.ts`
- `supabase/migrations/202510220001_learning_hub_schema.sql`
- `supabase/migrations/202510220002_learning_hub_catalog.sql`
- `tests/b5.test.ts`

Updated for integration:

- `server.ts`
- `src/context/CareerContext.tsx`
- `src/components/views/LearningCenterView.tsx`
- `src/components/views/RoadmapView.tsx`
- `src/components/views/DashboardView.tsx`
- `src/components/layout/GlobalSearchModal.tsx`
- `src/App.tsx`
- `tests/runner.mjs`
- `tests/cleanup.mjs`

The pre-existing `.tmp-qa/` directory was left untouched and is not part of this
commit.
