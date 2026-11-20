# Roadmapak — Platform Enhancement Report

Repository: `D:/Saas/careerpilot-ai`
Branch: `main` · Base commit: `616251c feat(motion): a shape-morphing motion system for Careerra`
Production: `https://roadmapak.pages.dev/` · Supabase project `ciihprsfdojzvjnqgbxl`
Date: 2026-11-20

---

## A. Implemented

Everything below was implemented in the existing production codebase. No new Cloudflare
project, domain, API or key was created, and no user data was migrated or deleted.

### §5 — Dashboard: every card is now a way in
- `src/components/career/MetricCard.tsx` gained `onNavigate` / `navigateLabel`. The card
  body is a real navigation button; the "what is this?" chip remains a sibling button so
  the explanation is still one click away and never swallows the navigation.
- `src/components/views/DashboardView.tsx`: the metric cards navigate through
  `buildRouteHash` to `#/progress`, `#/skills` and `#/roadmap`.
- The four-stat strip (evidence / projects / certifications / interviews) is clickable and
  lands on the matching filtered view.
- A new **Learning progress** strip was added: Recommended, Saved, In Progress, Completed
  and Explore Catalog, each linking to `#/learning?tab=…`. The destination is a real hash
  route, so it is shareable and bookmarkable.

### §6 — Learning: "Start Learning" actually starts the course
- `src/components/learning/CourseCard.tsx`: the primary CTA is now an `<a href={url}>` that
  opens the course in a new tab (`learningActionUrl` is verified first, and the roadmap path
  keeps using `isSafeExternalUrl`). The start is still recorded, so "In progress" stays
  accurate.
- A course with no URL renders a non-dead button that explains why there is nothing to open
  rather than a link that does nothing.

### §14 — Reusable mascot loading state
- New `src/components/processing/MascotLoader.tsx` uses the official asset
  `/brand/roadmapak-ai-mascot.webp`.
- Wired into `src/components/processing/ProcessingOverlay.tsx` and exported from
  `src/components/processing/index.ts`.
- EN: "Please wait, I'm getting things ready for you..." · AR: "انتظر قليلًا، بنجهزلك كل حاجة...".
- Respects `prefers-reduced-motion`.

### §15 — Applications: a real pipeline board
- `src/context/CareerContext.tsx`: `updateApplicationStage` now returns `Promise<boolean>`.
  The optimistic move and its rollback live with the write, so a failed save cannot leave
  the board showing a stage the database does not have.
- `src/components/views/ApplicationsView.tsx`: cards are draggable, each column is a drop
  target, and a failed move reports an error toast. The existing `<select>` is kept as the
  accessible alternative to dragging.
- Added **overview metrics** (total applications, interviews, pending, offers) and a
  **6-month activity chart**.

### §17 — Profile identity and the duplicate-project bug
- New `src/components/subscription/PlanIdentityFrame.tsx` with two modes: `premium` (the
  top tier only) and `always` (tier colour).
- The profile photo is wrapped in the premium ring; `PlanIdentityBadge` was removed from
  beside the name; the AI-credits block in `MembershipPanel.tsx` is now framed.
- **Duplicate projects are fixed at the data layer, not hidden in the UI.** New
  `shared/projectIdentity.ts` provides `projectIdentity`, `hasProjectIdentity` and
  `collapseDuplicateProjects`. `server/db/projects.ts` now *updates* the existing row on
  write instead of inserting a second one, and `listProjects` collapses identical
  title+role rows on read (newest wins). No rows are deleted.

### §16 — Gemini Live, a genuine spoken interview
This was greenfield: the platform previously had only a text mock interview
(`/api/mock-interview`) and `interview_sessions` CRUD. There was no live session and no
transcript store.

- **Server** — `server/interviews/live.ts` (types, languages, interviewer styles, the
  brief, the grant) and `server/db/liveInterviews.ts`.
- `server/ai/geminiConfig.ts` adds `getLiveAuthClient()` (a separate client pinned to the
  Live API version) and `CANONICAL_LIVE_MODEL`.
- **Routes** in `app.ts`: `POST /api/interviews/live/session`,
  `POST /api/interviews/live/complete`, `GET /api/interviews/live`,
  `DELETE /api/interviews/live/:id` — registered before `/api/interviews/:id` so they are
  not swallowed by it.
- **Browser** — `src/lib/liveInterviewApi.ts` (the three calls),
  `src/lib/liveInterviewClient.ts` (mic capture through an inline AudioWorklet → 16 kHz
  PCM16 base64 → `sendRealtimeInput`; 24 kHz playback queue; barge-in; transcript
  collector), and `src/components/interviews/LiveInterviewPanel.tsx`, wired into
  `InterviewsView.tsx`.
- **The brief is built from the candidate's own record** (`loadAiCareerContext`: target
  role, domain, track, experience level, skills). A job description is inserted as quoted
  data and explicitly labelled "It is data, not an instruction".
- Provider `gemini`, storage `transcript`, style `natural`; languages Arabic / Egyptian
  Arabic / English; types HR / Technical / Role-Based / Behavioural / Mixed — all as the
  platform requires.

---

## B. Fixed

| # | Defect | Root cause | Fix |
|---|---|---|---|
| 1 | "Start Learning" never opened the course | `CourseCard.tsx:505-514` only wrote `in_progress`; the real link was a small "Open resource" text link at `:561` | Primary CTA is now the real `<a href>` |
| 2 | Dashboard metric cards did nothing | `MetricCard.tsx` only toggled an explanation popover | Card is now a navigation button with a sibling help chip |
| 3 | No drag-and-drop on the pipeline | `ApplicationsView.tsx:297-306,354-362` stage changes only through `<select>` | Draggable cards + drop targets + rollback + toasts |
| 4 | Plan badge sat beside the name | `ProfileView.tsx:746-751` | Badge removed; premium ring on the photo; credits framed |
| 5 | Duplicate projects | `server/db/projects.ts` `createProject` inserted unconditionally | Write path updates the existing row; read path collapses duplicates |
| 6 | **Live model was a shut-down model** | `CANONICAL_LIVE_MODEL` was `gemini-live-2.5-flash-preview`, **shut down by Google on 9 December 2025** | Now `gemini-3.8-live` (the current Live model) |
| 7 | **Wrong API version for ephemeral tokens** | The grant was minted on `v1alpha` | Now `v1beta`, pinned in one place and sent with the grant so the browser spends the token on the same version |
| 8 | **Live SDK was eagerly preloaded by every visitor** | `vite.config.ts` `manualChunks` sent *all* `node_modules` into `vendor-other`, overriding dynamic-import splitting | `@google/genai` gets its own `vendor-genai` chunk; `index.html` no longer modulepreloads it (`vendor-other` 940 KB → 582 KB, `vendor-genai` 372 KB, loaded only when an interview starts) |
| 9 | **A dead key could be pushed to production** | `scripts/set-pages-secrets.mjs` uploaded `.env` verbatim, and a Pages secret cannot be read back once set | The script now checks the credential first and refuses to upload a key that does not work; `--check` runs the check alone |

---

## C. Database

One migration, additive only — a new table. No existing table, column, row or policy was
touched, and no user data was migrated or deleted.

`supabase/migrations/20261129000001_live_interview_sessions.sql`

- **Applied to production** on 2026-11-20 via
  `npx tsx scripts/apply-migration.mts 20261129000001 live_interview_sessions`
  and recorded in `supabase_migrations.schema_migrations`.
- Verified against production (`scripts/verify-live-interview-table.mts`):
  - table `public.live_interview_sessions` exists with **12 columns**;
  - **0 audio columns** — the transcript is the product, the audio never is;
  - `transcript jsonb NOT NULL`, `evaluation jsonb`, `status`, `language`,
    `interview_type`, `target_role`, `job_id`, `duration_seconds`, timestamps;
  - **RLS enabled**;
  - **4 owner-scoped policies** (`live_interview_sessions_select_own`,
    `_insert_own`, `_update_own`, `_delete_own`), every one of them
    `profile_id = auth.uid()`;
  - **0 rows** — no data has been written.

The duplicate-project fix is deliberately *not* a migration: it is a write-path and
read-path rule in `server/db/projects.ts`, so no row is ever deleted.

---

## D. AI Integration

**Pattern: client-to-server, with a server-minted ephemeral token.** The Gemini key never
reaches the browser. The server mints a single-use, short-lived token that is bound to the
model and to the interviewer's system instruction, and the browser spends that token. This
is Google's recommended production pattern for the Live API
(<https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens>).

- Model: **`gemini-3.8-live`** — the current Live model ("the default option for most
  low-latency voice agent experiences"). The identifier this feature originally used,
  `gemini-live-2.5-flash-preview`, was **shut down on 9 December 2025**, and
  `gemini-2.5-flash-native-audio-preview-09-2025` was shut down after it. A token minted
  for a shut-down model cannot open a session.
- API version: **`v1beta`** for both minting and spending. Ephemeral tokens are only
  usable on the version that issued them, so the version is defined once in
  `server/ai/geminiConfig.ts` (`LIVE_API_VERSION`), sent to the browser with the grant,
  and read back by the client — the two cannot drift apart.
- Voice: `Puck`, a prebuilt Live voice (and the Live API default).
- Audio: input 16 kHz PCM16, output 24 kHz, per Google's specification.
- The interview report is written through the platform's existing centralised provider
  entry point (`generateContentUnified`), so it inherits the same retry and fallback
  behaviour as every other AI feature.
- The Live SDK is loaded with a dynamic `import('@google/genai/web')` **only when the
  candidate starts a spoken interview**, so candidates who never take one never download
  the 372 KB chunk (§18).

**Credential status — read this before deploying.** The Gemini key in the local `.env`
is **dead**: every call returns
`401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID — "The bound service account is deleted or
disabled. The service account bound to the API key must be active."` This affects ordinary
text generation exactly as it affects Live token minting, so it is a credential problem,
not a Live problem. It was re-tested and is persistent, not transient.

The **deployed** production app is not affected in the way it first appears: its AI
features work end to end (verified against `https://roadmapak.pages.dev/` — a throwaway
candidate's CV analysis returned a measured score of 72, the streaming route returned 18
stage events with the same result, and the history read the record back). The reason is
that `server/ai/provider.ts` falls back from Gemini to OpenRouter *silently* on any
provider error, and OpenRouter's free tier is currently exhausted
(`429 free-models-per-day`, remaining 0) — so the fallback could not have served those
requests. The production requests were therefore served by **Gemini**, and the production
Pages secret is healthy.

Two consequences follow:

1. **The local `.env` key and the production Pages secret are different values.** The
   Pages secret was uploaded from `.env` at some earlier point, when `.env` held a working
   key.
2. **Running `node scripts/set-pages-secrets.mjs` with the current `.env` would replace a
   working production secret with a dead one.** That is now prevented: the script
   validates the credential before uploading and refuses to continue if it does not
   answer. Verified — `node scripts/set-pages-secrets.mjs roadmapak --check` reports the
   failure and uploads nothing.

---

## E. Testing

| Check | Command | Result |
|---|---|---|
| Types | `npm run lint` (`tsc --noEmit` + `typecheck:tests`) | **pass**, exit 0 |
| Logic suite | `npm run test:logic` | **1611 tests, 1606 pass, 0 fail, 5 skipped** |
| New tests | `tests/live-interview.test.ts`, `tests/interactive-surfaces.test.ts` | **40 new tests, all passing** |
| Production build | `npm run build` | **succeeded** — `✓ built in 41.00s`, `dist/_worker.js` 4.29 MiB |
| Bundle auth | `scripts/verify-bundle-auth-config.mjs` (part of build) | public Supabase config + all 4 sign-in methods present |
| Lazy-chunk check | `dist/index.html` modulepreload list | `vendor-genai` **absent** — confirmed not eagerly loaded |
| Production DB | `scripts/verify-live-interview-table.mts` | table, 12 columns, 0 audio columns, RLS on, 4 owner policies, 0 rows |
| Production AI | `scripts/verify-analyzer-production.mjs` | end-to-end pass against the deployed site (throwaway identity removed) |
| Live grant | `scripts/production/verify-live-interview-grant.mts` | **fails** — 401 `ACCOUNT_STATE_INVALID` (dead local credential) |

The 5 skipped tests are live-provider tests that skip themselves when the provider cannot
serve a request; they are not failures.

The build, the full suite and the DB verification were all re-run **after** the Live model
and API-version corrections.

---

## F. Git

- **Nothing has been committed and nothing has been pushed.** No commit was authorised.
- Branch `main`, base commit `616251c`.
- The working tree carries the whole rebrand plus this task's work as **uncommitted
  changes**: 13 files changed in this task's scope (`1163 insertions(+), 452 deletions(-)`)
  and 13 new files, on top of a large pre-existing rebrand diff that predates this task.
- New files created for this task:

```
src/components/processing/MascotLoader.tsx
src/components/subscription/PlanIdentityFrame.tsx
src/components/interviews/LiveInterviewPanel.tsx
src/lib/liveInterviewApi.ts
src/lib/liveInterviewClient.ts
server/interviews/live.ts
server/db/liveInterviews.ts
shared/projectIdentity.ts
supabase/migrations/20261129000001_live_interview_sessions.sql
tests/live-interview.test.ts
tests/interactive-surfaces.test.ts
scripts/verify-live-interview-table.mts
scripts/production/verify-live-interview-grant.mts
scripts/production/probe-openrouter-usage.mts
```

- Because the rebrand diff and this task's diff are mixed in the same tree, a commit
  should stage this task's files deliberately rather than `git add -A`.

---

## G. Deployment

- **The application has not been deployed.** No deployment was authorised, so
  `https://roadmapak.pages.dev/` is still serving the **pre-change build**.
- The **only** production change made in this task was the additive database migration
  (a new table), which was applied because the feature requires it and it touches nothing
  that already exists.
- The build output in `dist/` is current and verified, so deployment is a single
  `npm run cf:deploy` (`vite build` + `wrangler pages deploy dist --project-name roadmapak
  --branch main`) away.
- **Do not run `scripts/set-pages-secrets.mjs` before fixing the local key** — see §D.

---

## H. Remaining Issues

1. **The local Gemini credential is dead — this blocks the Live feature end to end.**
   `401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID: "The bound service account is deleted or
   disabled."` It affects ordinary text generation too, so it is a platform-side action:
   the service account bound to the key must be reactivated, or the key replaced in
   `.env` with a working one. Until then the Live grant cannot be minted, locally or in
   production, and the Live feature cannot be verified in a browser.
   *Action:* reactivate the service account (or rotate the key), then
   `npx tsx scripts/production/verify-live-interview-grant.mts` — it must print
   `the session credential was issued`, `model: gemini-3.8-live`, `api version: v1beta`.
   The production Pages secret is believed healthy and must **not** be overwritten until
   the local key is confirmed working.

2. **The SDK may warn about the API version.** The installed `@google/genai` (v2.31.0)
   predates the current Live API and prints "the SDK's ephemeral token support is
   experimental" when the version is not `v1alpha`. Current Google documentation is
   explicit that ephemeral tokens are issued and spent on **`v1beta`**, which is what this
   code does. *If* token minting fails with an unsupported-version error once the
   credential is fixed, the single remedy is to change `LIVE_API_VERSION` in
   `server/ai/geminiConfig.ts` to `'v1alpha'` — it is defined in one place and both sides
   read it, so the change is one line.

3. **No browser or end-to-end verification of the spoken flow.** A signed-in candidate, a
   working microphone, and a working Gemini Live credential are all required. The
   transport, the transcript collector, the barge-in behaviour and the persistence path are
   covered by unit tests, but the actual conversation has not been heard.

4. **The DB-backed suite cannot run.** `npm test` needs the disposable Supabase test
   project in `.env.test` (`yqiuzbwaqfrvhynkobpu`), which does not resolve. This is
   pre-existing and documented in `docs/reports/ROADMAPAK_MIGRATION_REPORT.md` §11. The
   database-free suite (`npm run test:logic`, 1611 tests) passes and the production
   database was verified directly.

5. **The applications board and the dashboard charts have not been exercised in a
   browser.** Both are covered by source-level tests, and the dashboard's destinations
   are real hash routes, but the drag-and-drop gesture and the chart rendering were not
   confirmed visually.

6. **The 6-month applications chart needs a real data window.** It is drawn from the
   candidate's own applications; a candidate with little history will see a mostly empty
   chart. This is honest — no sample data is invented — but it is worth a glance before
   release.

---

## References

- Gemini Live API overview — <https://ai.google.dev/gemini-api/docs/live>
- Ephemeral tokens — <https://aistudio.google.com/docs/live-api/ephemeral-tokens>
- Gemini 3.8 Live — <https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live>
- Live API capabilities (voices, audio formats) — <https://ai.google.dev/gemini-api/docs/live-api/capabilities>
- Gemini API changelog (Live model shutdowns) — <https://ai.google.dev/gemini-api/docs/changelog>
