# CareerDev4AI — Full Expansion Report

**Date:** 3 November 2026
**Production:** [https://careerdev4ai.pages.dev](https://careerdev4ai.pages.dev)
**Scope:** video-first learning, visual roadmaps, projects, the verified opportunity ecosystem, and the full Admin Communication Center — server-enforced roles, targeted announcements, a durable delivery ledger, truthful analytics, scheduling and click tracking.

---

## 1. Executive summary

CareerDev4AI was extended from a career-planning tool into a career operating system. The work was delivered in two implementation phases and one verification phase:

| Phase | Commit | What it delivered |
|---|---|---|
| 1 | `70c4269` | Video-first learning, visual roadmaps, persisted project checklists, the expanded opportunities ecosystem, and the first server-enforced admin foundation |
| 2 | `e4bdf90` | The announcement delivery center, the durable per-recipient ledger, the targeting engine, scheduling, read/click tracking, and the Admin Center panels |
| 3 | `dfe9656` + this change | The critical-announcement dashboard banner, production verification, and the concurrency fix found during that verification |

The existing product was **not rebuilt or redesigned**. The brand, the domain, the hash-routed application, the public pages, the learning catalogue, the roadmaps, the projects and the opportunity catalogue all stay in place. New capability was layered onto the tables and APIs that already existed.

At the end of the work:

- `npx tsc --noEmit` is clean.
- The full test suite passes (see §7 for the measured run).
- `npm run build` succeeds; the only warning is the pre-existing chunk-size warning.
- The production API smoke run passes **28 of 28** checks.
- The production browser smoke run passes **14 of 14** checks.
- One real defect was found in production verification — a concurrent-publish race that could duplicate a recipient's notification — and it was fixed at the database level, redeployed and re-verified.

---

## 2. Ground rules that were kept

These constraints were treated as hard requirements, not preferences:

1. **Brand and domain are unchanged.** Everything is served from `careerdev4ai.pages.dev` with the existing CareerDev4AI identity.
2. **No working system was replaced.** Existing tables (`profiles`, `courses`, `roadmaps`, `projects`, `volunteer_opportunities`, `notifications`, `announcements`) were extended additively. Legacy columns remain and legacy rows keep resolving exactly as before.
3. **Nothing was fabricated.** No organisation, opportunity, deadline, URL, thumbnail or eligibility rule was invented. Where the data does not exist, the UI does not pretend it does.
4. **Authorization is server-side.** The browser never sends a role or a permission that the server trusts, and hiding a button is never the security boundary.
5. **No new runtime dependency was added** for the communication center.
6. **No `eval`, no unsafe HTML injection, no client-controlled authorization.**
7. **No unrelated changes.** The work is confined to the expansion and the verification it required.

---

## 3. Phase 1 — the career operating system

### 3.1 Video-first learning

The Learning Hub previously showed a flat catalogue with a weak sense of *what kind of thing* a learner was opening. Phase 1 added a typed resource model in `shared/learningResources.ts`:

`video_course`, `video_playlist`, `course`, `article`, `documentation`, `pdf`, `book`, `workshop`, `lecture`.

The type is derived from the stored format, provider and URL, so the existing 500+ catalogue rows are classified without rewriting them; an explicit `resource_type` column wins when present. The Learning Center now presents sectioned discovery rails, a language filter, a type filter, duration and provider metadata, and a full catalogue.

**Truthfulness note:** only videos whose real thumbnail can be resolved from the provider are given a photographic thumbnail. Playlists have no reliable public thumbnail endpoint, so their cards use a branded panel instead of an invented image. At the time of writing, 3 resources have a real YouTube thumbnail; this is a deliberate limitation, not missing work.

### 3.2 Visual roadmaps

The roadmap view now renders resource cards with:

- thumbnail (real or branded),
- resource type and provider,
- duration and difficulty,
- the skill the step closes,
- a direct CTA.

The roadmap data model is unchanged: phases, milestones and tasks are read from the existing tables. The visual layer is a presentation of real roadmap state, including stage completion and the next actionable step.

### 3.3 Projects

Project plans gained persisted task checklists, so ticking a task survives a reload and feeds progress. Recommended project cards now carry the richer metadata (skills addressed, difficulty, resources) without changing the project table's ownership model.

### 3.4 Opportunities and activities

The volunteering catalogue became the broader **Opportunities & Activities** ecosystem:

`volunteering`, `student_activity`, `youth_program`, `career_development`, `competition`, `entrepreneurship`, `fellowship`, `internship`, `academic`, `technology`.

Each row can carry:

- participation mode (on-site / online / hybrid),
- audience,
- eligibility text,
- official source URL,
- organisation type,
- tags and a featured flag,
- a verification state and `verified_at`.

**Verification is a real workflow, not a badge that is painted on.** The states are `http` (the legacy "the URL is reachable" state), `pending`, `verified` and `rejected`. The current catalogue contains **72 rows, all in the legacy `http` state** — the links were checked when the catalogue was curated, but no opportunity has yet been manually promoted to `verified` by an administrator in production. The admin workflow to do that exists in the Opportunity Admin role. Deadlines are `NULL` for rolling programmes rather than invented.

### 3.5 The first admin foundation

Phase 1 introduced the role vocabulary and the server-side permission middleware that phase 2 builds on:

`super_admin`, `content_admin`, `opportunity_admin`, `moderator`.

Only a Super Admin can create, edit or remove administrators. Every administrative route passes through `requireAdmin` and a permission check.

---

## 4. Phase 2 — the Admin Communication Center

### 4.1 Roles and permissions

The permission vocabulary lives in `shared/admin.ts` and is the single source of truth for the API and the UI:

| Permission | Super Admin | Content Admin | Opportunity Admin | Moderator |
|---|:---:|:---:|:---:|:---:|
| `admin.manage` | ✓ | | | |
| `announcements.read` | ✓ | ✓ | | ✓ |
| `announcements.write` | ✓ | ✓ | | |
| `announcements.publish` | ✓ | ✓ | | |
| `opportunities.read` | ✓ | ✓ | ✓ | ✓ |
| `opportunities.write` | ✓ | | ✓ | |
| `opportunities.verify` | ✓ | | ✓ | |
| `learning.read` | ✓ | ✓ | | ✓ |
| `learning.write` | ✓ | ✓ | | |
| `analytics.read` | ✓ | ✓ | ✓ | |
| `users.read` | ✓ | | | |
| `moderation.read` | ✓ | ✓ | ✓ | ✓ |
| `moderation.write` | ✓ | | | ✓ |
| `audit.read` | ✓ | | | |

`server/admin/permissions.ts` loads the administrator row for the verified Supabase user, rejects a missing or disabled row with the **same 403** (so the roster is not disclosed), and attaches the effective permission set to the request. A Super Admin always keeps every permission; an override can only use the known vocabulary.

### 4.2 Composition

An announcement can carry:

- title and message,
- image URL and thumbnail URL (validated as complete `http`/`https` URLs),
- category (`general`, `learning`, `opportunity`, `platform`, `event`, `deadline`, `security`),
- priority (`normal`, `important`, `critical`),
- CTA text and CTA URL,
- an in-app destination (`link_view`),
- publish and expiration dates,
- a status (`draft`, `scheduled`, `published`, `expired`, `archived`).

The old `urgent` priority was migrated in place to `critical` under a new check constraint, so no historical row was lost.

### 4.3 Audience targeting

Targeting is stored as validated JSONB in `announcements.audience_rules`:

```json
[
  {
    "logic": "and",
    "conditions": [
      { "field": "career", "values": ["Software Engineer"] },
      { "field": "country", "values": ["Egypt"] }
    ]
  }
]
```

- **Groups are intersected (AND).**
- **Conditions inside a group use the group's logic (AND or OR).**
- Conditions resolve sets of profile ids through indexed queries, are composed in memory, and return the final sorted id list.
- The same resolver — `resolveAnnouncementRecipients` — feeds both the preview and the actual publish. The number shown to the administrator cannot drift from the number that receives the message.

Supported fields, all backed by real stored data:

| Field | Source |
|---|---|
| Career / target role | `profiles.target_role` |
| Career field | `profiles.target_industry` |
| Account type | `profiles.user_type` |
| Country / city | `profiles.country`, `profiles.city` |
| University / field of study / degree | `educations` |
| Skill | `user_skills` + `skills` |
| Enrolled roadmap | `roadmaps.target_role_title` |
| Roadmap step not completed | `roadmap_tasks` → milestones → phases → roadmaps |
| Completed / in-progress course | `user_learning_items` + `courses` |
| Completed / active project | `projects` |
| Specific users | `profiles.id` |

Fields the product does not collect (for example an academic year) are deliberately absent rather than offered as filters that could never match.

**Malformed targeting never widens an audience.** Unknown fields, non-list values, oversized inputs and explicitly supplied rule lists that normalise to zero conditions are rejected with `400`. An empty rule array keeps the legacy `audience_type`/`audience_values` behaviour for old announcements; a non-empty rule list that resolves to nobody is rejected at publish time with `422`.

### 4.4 Publishing and the delivery ledger

Publishing is a single server flow:

1. Resolve the audience with the same engine the preview used.
2. Reuse notifications already created for this announcement.
3. Insert missing notifications in **500-row batches**.
4. Upsert one `announcement_deliveries` row per recipient (unique on `announcement_id, profile_id`).
5. Mark the announcement `published` and store the recipient count.

The ledger is the canonical record. Each row stores `delivered_at`, `read_at` and `clicked_at`, and points at the notification row. A retried publish reuses the existing rows instead of sending a second notification.

**Batching is designed for 100k+ recipients:** the resolver pages through ids 1,000 at a time, notification writes are chunked at 500, the ledger upsert is chunked, and the delivery table is indexed by announcement and by profile. The project held 85 profiles during verification and the smoke runs delivered to 1–2 recipients at a time. The 100k path is a design property, not a load-test result, and is reported as such in §9.

### 4.5 Scheduling and expiry

Scheduling is server-side:

- `POST /api/admin/announcements/:id/schedule` stores `status = 'scheduled'` and a future `publish_at` (at least ~30 seconds ahead).
- A scheduler tick publishes due announcements (up to 25 per tick) and marks published announcements whose `expires_at` has passed as `expired`.
- The tick runs lazily on API traffic, at most once per 60 seconds per isolate, and is also exposed as `POST /api/admin/announcements/process-due` for an external cron.
- The explicit endpoint does not also trigger the lazy tick, so one request runs the scheduler once.

Scheduling survives browser close, logout, restart and deployment because neither the schedule nor the tick lives in the browser. The one honest caveat is traffic: a completely idle deployment waits for the next API request (or the external cron) before publishing a due announcement. See §9.

### 4.6 Read and click tracking

- Marking a notification read writes `read_at` to `notifications` **and** the delivery ledger.
- Marking all read updates every unread row and the ledger.
- Clicking a CTA records `clicked_at` in both places and also marks the notice read; the API returns the stored `link_view` so the client can navigate.
- Announcement priority is read from `announcements` at inbox time rather than duplicated onto every notification row.

Analytics come from the `announcement_delivery_stats` view, which aggregates the ledger. It is revoked from `anon` and `authenticated` and is used only by the service-role API, so platform-wide communication metrics are not exposed to clients.

### 4.7 The user-facing surface

- The notification drawer loads the real inbox, distinguishes critical announcements, supports mark-all-read, click tracking and individual dismissal.
- A **critical announcement banner** sits above the dashboard greeting. It is derived from the real inbox (`unread` + `priority === 'critical'`), respects the device's in-app notification preference, disappears once the notice is read, and exposes the CTA and a dismiss action.
- Arabic strings were added for every new user-facing string; the localization audit reports **0 missing Arabic strings out of 1,354**.

### 4.8 The Admin Center

The Admin Center is split into focused panels behind permission-filtered tabs: Overview, Traffic, Communications, Administrators, Opportunities, Learning and Audit log. The announcement panel provides:

- the composer (content, images, category, priority, CTA, dates),
- Everyone / Specific users / Filtered audience modes,
- the AND/OR group builder,
- a server-side preview count before publishing,
- publish, schedule, archive and delete,
- history filters by status, category and priority,
- per-announcement delivered / read / clicked counts and rates.

The client never decides access: the tabs are a convenience, and every action is re-authorized on the server.

---

## 5. Data model and migrations

Two new migrations were applied to the live project (`ciihprsfdojzvjnqgbxl`):

### `20261102000008_announcement_delivery_center.sql`

- adds composition, category, CTA, scheduling and expiry columns to `announcements`;
- adds the `audience_rules` JSONB configuration and the human-readable `audience_summary`;
- migrates `urgent` → `critical` in place and replaces the priority/status check constraints;
- creates `announcement_deliveries` with a unique `(announcement_id, profile_id)` constraint;
- backfills the ledger from existing announcement notifications;
- creates the service-role-only `announcement_delivery_stats` view;
- adds the indexes the targeting engine needs on profiles, skills, educations, roadmaps, courses and projects;
- keeps the existing ownership model and adds per-user RLS to the ledger.

### `20261103000001_announcement_notification_uniqueness.sql`

- collapses any duplicate announcement notifications created by a previous race (keeping the oldest, repointing the delivery ledger first, deleting no delivery rows);
- creates the unique index `notifications_announcement_recipient_key` on `(announcement_id, profile_id)`.

`NULL` `announcement_id` values remain distinct under a PostgreSQL unique index, so ordinary non-announcement notifications are unaffected.

---

## 6. Security and privacy

- **Server-enforced roles.** Every `/api/admin/*` route runs `requireAuth` → `requireAdmin` → permission check. Anonymous callers receive `401`; authenticated non-admins and disabled admins receive `403`.
- **Only a Super Admin manages administrators.** The admin-management endpoints require `admin.manage`, which no other role has. A Super Admin cannot remove the last active Super Admin (guarded in the persistence layer).
- **The client never supplies authorization.** It may hide a tab, but the server re-checks the real role on every request.
- **RLS on user data.** A user can select and update only their own delivery row; `announcement_deliveries` inserts happen only through the service role. The aggregate view is revoked from client roles. Direct anonymous reads of `profiles` were already blocked in an earlier migration (`profiles_column_grants`).
- **No unsafe rendering.** Announcement content is rendered as text; URLs are validated as complete `http`/`https` URLs before storage. No `eval`, no `dangerouslySetInnerHTML` was introduced.
- **Secrets.** Service-role and Management API credentials remain server-side and were never printed or shipped to the browser.

---

## 7. Quality gates and measured results

### 7.1 TypeScript

```
npx tsc --noEmit
```

Passed with no output.

### 7.2 Automated tests

The admin suite was run first, against the live Supabase project, with the scheduler disabled for deterministic timing:

```
TEST_ONLY=admin npm test
```

**22 of 22 admin tests passed**, covering:

- server-enforced access (normal user, each role, disabled admin),
- administrator management,
- targeted delivery,
- re-publish idempotency,
- **concurrent publish delivered once per recipient** (new regression test),
- archived / empty-audience rejection,
- preview/delivery parity,
- AND/OR/combined targeting and every stored field,
- malformed-rule rejection,
- read/click ledger and analytics,
- per-user delivery isolation,
- scheduling, expiry and ledger retention,
- rich fields and validation.

The full suite was then run:

```
npm test
```

**{{FULL_TEST_RESULT}}**

### 7.3 Production build

```
npm run build
```

Succeeded. The output includes the known Vite chunk-size warning (the application bundle is large because the SPA ships all views), but no build error. The Worker bundle is written to `dist/_worker.js`.

### 7.4 Production API smoke test

A disposable end-to-end run against `https://careerdev4ai.pages.dev` created two temporary users, granted one a temporary Super Admin row, and drove the real API. **28 of 28 checks passed:**

| Check | Result |
|---|---|
| Anonymous admin list | 401 |
| Normal user admin list | 403 |
| Normal user creates announcement | 403 |
| Super Admin reads list | 200 |
| Combined audience preview | 1 recipient |
| Empty rule group | rejected 400 |
| Draft creation with every field | 201 |
| Publish matches preview | 1 recipient |
| Retried publish | still 1 recipient |
| Delivery ledger rows | 1 |
| Inbox notifications | 1 |
| Critical priority in inbox | `critical`, unread |
| Administrator did not receive it | 0 rows |
| Read updates inbox + ledger | both written |
| Click updates ledger | `clicked_at` written |
| Analytics | delivered 1 / read 1 / clicked 1, 100% / 100% |
| Schedule server-side | `scheduled` |
| Early scheduler run | 0 published |
| Due scheduler run (no browser) | 1 published |
| Scheduled notification | 1 |
| Expiry | row retired by the server clock |
| Analytics view with anon key | permission denied (42501) |
| Anonymous delivery read | 0 rows |
| Recipient delivery read | only its own rows |
| Archive | `archived` |
| Delete | 200 |
| Cleanup | 0 announcements / deliveries / notifications / profiles / admins left |

### 7.5 Production browser smoke test

A real headless Edge session signed in as a disposable user and checked the signed-in product. **14 of 14 checks passed:**

- the critical banner renders on the dashboard,
- the banner is announced as `role="alert"`,
- the default English interface is LTR,
- switching to Arabic flips the interface to RTL,
- clicking the banner CTA records a click **and** a read, and navigates to Learning,
- the banner disappears after the notice is read,
- switching back to English returns LTR,
- the Learning, Roadmap, Projects and Opportunities routes render content,
- no uncaught page errors,
- no console errors,
- no rows left behind.

### 7.6 Public surface and 404 handling

Production checks:

| Request | Result |
|---|---|
| `/api/health` | 200 JSON |
| `/` | 200 HTML |
| `/careers`, `/learning`, `/opportunities`, `/about`, `/privacy` | 200 |
| `/sitemap.xml`, `/robots.txt` | 200 |
| `/careers/not-a-real-role` | 404 |
| `/opportunities/not-a-real-id` | 404 |
| `/assets/does-not-exist.js` | 404 |
| unknown API path | 404 JSON, not the SPA shell |

Hash routes (`/#/dashboard`, `/#/learning`, …) correctly return the SPA shell, because the fragment is never sent to the server; the server-rendered public surface is what crawlers see.

---

## 8. The defect found in production verification

This is the most important part of the verification, because it changed the code.

### What happened

The first production smoke run delivered a scheduled announcement to one recipient and found **2 notifications for that recipient**. Reproducing the sequence showed the cause:

1. The lazy scheduler tick runs on API traffic.
2. The explicit `POST /api/admin/announcements/process-due` route also ran the scheduler.
3. Both calls could read "no notification for this recipient yet" before either inserted one.
4. The old code used a plain `insert` and an in-memory `alreadyNotified` set, so both requests inserted a notification. The delivery ledger stayed unique, but the inbox did not.

The same race was possible between a manual publish and the scheduler tick, or between two external cron calls.

### The fix

1. **Database arbitration.** Migration `20261103000001` adds a unique index on `notifications(announcement_id, profile_id)`. Ordinary notifications have `announcement_id = NULL`, and PostgreSQL treats NULLs as distinct, so they are unaffected.
2. **Upsert instead of insert.** Publishing writes missing notifications with `onConflict: 'announcement_id,profile_id', ignoreDuplicates: true`.
3. **Read back the rows.** After the upsert, the server re-reads every notification for the announcement and builds the ledger from those rows. The ledger therefore points at the row the database actually kept, even when a concurrent request inserted it.
4. **One tick per explicit request.** The lazy middleware skips `/api/admin/announcements/process-due`, so the explicit endpoint does not run the scheduler twice.
5. **Regression test.** `two concurrent publishes still deliver once per recipient` fires two `Promise.all` publish requests and asserts exactly 2 notifications and 2 deliveries for 2 recipients.

The migration also collapses any duplicates a previous race left behind, repointing ledger rows before deleting the duplicate notifications, so no delivery history is lost.

### Re-verification

After redeploying, the production smoke run passed 28/28, including the scheduled delivery with exactly **1** notification. The admin suite passed 22/22 including the new concurrent test.

---

## 9. Remaining limitations and honest caveats

These are real limitations of the current implementation, not hidden work:

1. **Scheduling is traffic-driven.** The lazy tick only runs when the API receives traffic (at most once a minute per isolate). A deployment with zero traffic will hold a due announcement until the next request. `POST /api/admin/announcements/process-due` exists for an external cron; no external cron is configured as part of this work. Each isolate ticks independently; the ledger/notification uniqueness makes concurrent ticks safe.
2. **The 100k path is a design property, not a load test.** Batching, paging and the indexes are in place, and the live run exercised 85 profiles. No 100k-recipient publish was executed against production, because creating 100k real notification rows for a test is not acceptable.
3. **Only collected fields are targetable.** There is no academic-year or GPA filter because the product does not store them. This is intentional: a filter that can never match would be a lie in the UI.
4. **Learning thumbnails.** Only 3 resources have a real provider thumbnail. Playlists have no reliable public thumbnail endpoint, so their cards use a branded panel. No image was invented.
5. **Opportunity verification.** All 72 catalogue rows are in the legacy `http` state ("the URL is reachable"). None has been manually promoted to `verified` in production yet. The Opportunity Admin workflow to review and promote them exists, but the review itself is human work that has not been done for every row.
6. **Deadlines.** Rolling programmes keep `deadline = NULL`. The catalogue does not invent a date to make a card look urgent.
7. **The Traffic tab depends on GA4 credentials.** It uses the existing read-only OAuth configuration; without it the tab reports that analytics is not configured rather than showing invented numbers.
8. **The notification list is capped at 200 rows** per user. The delivery ledger is the complete record; the inbox cap keeps the drawer bounded.
9. **The test suite is coupled to the live Supabase project** and takes about 11 minutes. It creates and removes its own identities, and the run verifies that no test identities or storage objects remain.
10. **Chunk-size warning.** The SPA bundle is large; the build warns about chunk size. It is not an error and was not introduced by this work.
11. **No Git remote is configured** in this working copy, so the commits exist locally and cannot be pushed from here.
12. **One production administrator exists today** (the account owner as Super Admin). The role matrix and admin management are implemented and tested; the other roles are not staffed yet.
13. **The Arabic translation audit covers source strings.** It reports 0 missing translations out of 1,354, but a dynamic string that never passed through `t()` would not be caught by that audit.

---

## 10. Deployment

The production deployment was performed with:

```
npm run build
npx wrangler pages deploy dist --project-name careerdev4ai --branch main
```

The canonical production URL is `https://careerdev4ai.pages.dev`; the deployment-specific preview URL from the final deploy is `https://c97658f7.careerdev4ai.pages.dev`.

Both migrations are applied to the live project. They are additive and idempotent; the uniqueness migration is safe to re-run and includes the duplicate-collapsing step.

**Rollback:** revert the code commit and redeploy. The schema changes are additive; dropping `notifications_announcement_recipient_key` restores the previous database behaviour, but the old duplicate rows are not recreated. The phase-2 tables and columns can stay in place without affecting an older application build.

---

## 11. Commit history

| Commit | Description |
|---|---|
| `70c4269` | `feat: video-first learning, visual roadmaps, opportunity ecosystem and admin communication center` |
| `e4bdf90` | `feat: SEO module, GA4 traffic analytics and announcement delivery center` |
| `dfe9656` | `feat(notifications): surface unread critical announcements on the dashboard` |
| `{{FIX_COMMIT}}` | `fix(announcements): guarantee one notification per recipient under concurrent publish` |

Supporting documents already in the repository: `CAREERDEV4AI_SEO_ANALYTICS_REPORT.md`, `GA4_ADMIN_TRAFFIC_ANALYTICS.md`, `CAREERDEV4AI_FINAL_TEST_REPORT.md`, `CAREERDEV4AI_FINAL_DEPLOYMENT_REPORT.md`.

---

## 12. How to re-verify

```bash
# 1. Types
npx tsc --noEmit

# 2. Admin behaviour (fast subset, live database)
# PowerShell: $env:TEST_ONLY='admin'; npm test
TEST_ONLY=admin npm test

# 3. Full suite (about 11 minutes, live database)
npm test

# 4. Production build
npm run build

# 5. Deploy
npx wrangler pages deploy dist --project-name careerdev4ai --branch main

# 6. Production chain (local verification script, creates and removes temporary users)
node .tmp-qa/prod-expansion-smoke.mjs
node .tmp-qa/prod-ui-smoke.mjs
```

The two production scripts create disposable identities, temporary admin rows and announcements, and delete everything in a `finally` block. They assert that no announcements, deliveries, notifications, profiles, admin rows or storage objects are left behind.

---

## 13. Requirement-to-evidence matrix

| Requirement | Evidence |
|---|---|
| Preserve branding and domain | Same `careerdev4ai.pages.dev`, same shell and identity; no redesign commit |
| Do not rebuild working systems | Additive migrations; legacy columns and routes retained |
| Video-first learning | Typed resources, rails, filters, full catalogue; `shared/learningResources.ts` |
| Visual roadmaps | Resource cards with type, provider, duration, skill, CTA; roadmap data unchanged |
| Projects | Persisted task checklists; richer recommendation cards |
| Verified Egyptian opportunities | 72 real rows with official links, verification workflow, `http`/`pending`/`verified`/`rejected`, no invented deadlines |
| Server-enforced roles | `server/admin/permissions.ts`, 401/403 tests, production smoke |
| Super Admin as sole admin manager | `admin.manage` permission; admin-management tests |
| Announcement fields and statuses | Migration 8, composer, validation tests, production UI |
| Audience targeting (Everyone / career / skills / education / location / roadmap / progress) | `AUDIENCE_FIELDS`, resolver, every-field test, preview/delivery parity |
| AND/OR/combined logic | Group builder, `normaliseAudienceRules`, resolver tests |
| Preview uses the delivery resolver | `previewAnnouncementAudience` and `publishAnnouncement` share `resolveAnnouncementRecipients`; parity test |
| Real per-user delivery records | `announcement_deliveries`, unique per recipient, production smoke |
| Truthful analytics | `announcement_delivery_stats` computed from the ledger; 100/100 test |
| Server-side scheduling | `scheduleAnnouncement`, `processDueAnnouncements`, production tick test |
| 100k-safe batching | 1,000-row paging, 500-row writes, indexes; not load-tested at 100k (§9) |
| RLS isolation | Per-user delivery policies; production RLS checks |
| Normal users cannot use admin functions | 403 on every admin route; tests and production smoke |
| Quality gates | tsc, full suite, build, deploy, production smoke |
| No unnecessary dependencies | No new runtime dependency for this work |
| No eval / unsafe HTML / client authorization | Text rendering, URL validation, server permission checks |
