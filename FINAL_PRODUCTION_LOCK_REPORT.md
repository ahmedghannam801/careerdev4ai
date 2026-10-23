# Final Production Lock Report

- Date: 2026-10-23
- Repository: `D:\careerpilot-ai`
- Branch: `audit/before-supabase-migration`
- Base commit: `206da6f4e542f9ece4482dd537403446fc46faa8`
- Final commit: `chore: final production lock and release readiness` (the commit that contains this report)

## Final status

**CODE-COMPLETE AND VERIFIED. DEPLOYMENT IS GATED ONLY BY THE EXTERNAL ITEMS BELOW.**

The application code, schema, ownership checks, AI failure behaviour and regression suite
are in a releasable state. No production database change, deployment, push or history
rewrite was performed.

## Verification matrix

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| TypeScript | `npm run lint` (`tsc --noEmit`) | **PASS** | Exit 0, no diagnostics |
| Production build | `npm run build` | **PASS** | Exit 0; 1745 modules; JS 932.51 kB (219.90 kB gzip); CSS 57.43 kB (9.66 kB gzip); hero image emitted as a hashed asset (886.13 kB) |
| Integration suite | `npm test` | **PASS** | 146 tests, 36 suites, 146 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; duration 264992.7727 ms; runner `PASS` |
| Dependency audit | `npm audit --audit-level=high` | **PASS** | 0 vulnerabilities |
| Test isolation | suite teardown | **PASS** | `.careerpilot_state.json` unchanged; no test identities remain; no orphaned Storage objects |
| Whitespace | `git diff --check` | **PASS** | No whitespace errors (CRLF notices only) |

The build emits the standard Vite >500 kB chunk advisory. It is a size warning, not a
build failure.

## Issues fixed in this pass

### Authentication, account and session lifecycle

- Added a working password-reset completion flow. Supabase `PASSWORD_RECOVERY` sessions
  (and the token fragment as a fallback) open a dedicated modal that calls
  `updateUser({ password })`; the user can no longer receive a reset link and get stranded
  without a way to set a new password.
- Registration with email confirmation now keeps the dialog open, switches to sign-in and
  displays the confirmation instruction instead of closing silently.
- Username handling is consistent between client and server: explicit Save, 3–30 character
  feedback, 30-character input cap, server-side `^[a-z0-9_-]{3,30}$` validation, and a
  correct "too short" message from `check-username`.
- Changing the account email now mirrors the accepted address into the session user and
  profile instead of leaving the old address in the UI.
- Account deletion shows inline errors, clears the local Supabase session after success and
  no longer uses blocking `alert()` calls.
- The Security tab no longer displays access-token prefixes/suffixes and no longer claims a
  password hashing algorithm the application does not use.
- The public-profile toggle persists its state, reports failures and requires a username.
- Account routes (`change-password`, `change-email`, `delete`) now run `requireAuth` plus a
  dedicated per-user rate limiter (10 requests/minute), with namespaced limiter keys.

### Data integrity, ownership and security

- Every URL field rendered as a link is validated as an absolute `http(s)` URL at the write
  boundary: project repository/demo URLs, evidence URLs, certification URLs, profile links,
  profile-PATCH links and avatars. `javascript:` and other schemes are rejected with 400.
- The public profile response defensively drops unsafe legacy URL values before serialising
  them, so previously stored data cannot become a stored-XSS vector.
- Added regression coverage proving `javascript:` profile links, certification URLs and
  profile-PATCH links are rejected with 400.
- Added a real read-only public profile viewer at `/#/profile/<username>`, available while
  signed out, backed by the existing `/api/profile/public/:username` endpoint. The endpoint
  continues to return 404 for private and unknown profiles and exposes only opted-in,
  read-only fields.
- Kept the existing Supabase-only identity model, RLS policies, ownership checks and
  cascade behaviour unchanged. Cross-user access tests remain green.
- Corrected the notification type vocabulary mismatch (`skill` vs the persisted
  `achievement`) so persisted notification rows render with the intended icon.

### Honest product surfaces

- Removed the fabricated static job catalogue and the fake Jobs listing UI. The Jobs view
  now builds real searches on LinkedIn, Indeed, Google Jobs and Wellfound from the user's
  target role and location, and points to the persisted Applications pipeline.
- Removed the broken "Add Document" form and fake Download action from Documents. Canonical
  creation stays in CV Studio, Cover Letters, Profile certifications and Projects; the
  derived document list now offers Copy notes where that is the real action.
- Cover-letter generation reports an explicit error when the AI returns no content, instead
  of silently producing an empty editor.
- Removed fabricated live metrics and demo claims from the landing page. The hero image is
  now a Vite import, so it is emitted into the production build instead of referencing
  `/src/assets/...` and 404ing after deployment.
- Aligned Dashboard, Settings and Onboarding copy with the APIs that actually exist.

### Persistence, state and onboarding

- Onboarding now awaits every server write and blocks navigation with a visible alert on
  failure; Back/Continue are disabled while saving.
- Restored `freelance` and `custom` career goals and added the custom-goal text input. The
  custom text is persisted only when non-empty.
- Fixed the cross-user state leak: the auth listener resets all authenticated domains when
  the identity changes or signs out, and a failed session restore no longer leaves the boot
  loader running forever.
- Fixed the Dashboard Copilot button no-op by sharing `copilotOpen`/`setCopilotOpen` through
  `CareerContext`; the shell and dashboard now control the same drawer.
- Device-local AI, notification and privacy preferences now persist across reloads.
  Notification preferences are real drawer filters (including a master in-app switch), and
  AI preference switches disable the matching AI actions instead of being decorative.
- AI writing/recommendation actions are also gated by the Career Graph AI Grounding privacy
  switch. When it is off, the affected AI buttons are disabled with an explanatory note, and
  Learning Hub requests fall back to deterministic recommendations without calling Gemini.
- Settings copy now states that notification delivery is in-app only in this release.

### Packaging and documentation

- Corrected package metadata (`careerpilot-ai`, `1.0.0`, description) and replaced the
  Unix-only `clean` script with a cross-platform Node command.
- Removed unused static data files: `src/data/jobsData.ts`, `src/data/projectsCatalog.ts`,
  `src/data/learningResources.ts`.
- Updated `README.md` and `.env.example` to match the current environment contract, release
  scope and external dependencies.

## Security verification

- Identity comes only from a verified Supabase Auth bearer token; the service-role key is
  server-only and is never sent to the browser.
- No client-supplied user id can select ownership; handlers use `req.authUser.id`.
- RLS and table ownership were not weakened. The existing cross-user tests for profiles,
  roadmaps, applications, skills, storage objects and all other domains pass.
- Public profile reads return 404 for private/unknown users and expose no applications,
  interviews, notes or other private records.
- URL-scheme validation prevents `javascript:`/`data:` stored-XSS through link fields.
- Account operations and AI routes are rate-limited; AI routes remain authenticated.
- CORS remains an allow-list; same-origin is always allowed.
- `.env` and `.env.test` are gitignored. `.env.example` contains names and placeholders only;
  no secret was added to source.

## External dependencies

### EXTERNAL DEPENDENCY — NOT A CODE DEFECT

**Production Supabase migration.** The reviewed baseline and domain migrations are present;
the integration suite runs against a provisioned project that already has the schema. The
migrations have not been applied to the production Supabase project. An operator must apply
`supabase/migrations/*` in filename order (or run `npx supabase db push`) against the target
project before the first production deploy.

### EXTERNAL DEPENDENCY — NOT A CODE DEFECT

**Gemini credentials and quota.** No `GEMINI_API_KEY` is available in this environment, so
live model generation cannot be exercised locally. AI routes return an explicit `503` with
an honest message when the key is absent or the model call fails; no canned AI output is
substituted. The default model (`gemini-3.8-flash`) may be quota-limited on a free-tier key;
provide a paid quota or set `GEMINI_MODEL` to an available model.

### EXTERNAL DEPENDENCY — NOT A CODE DEFECT

**Official branding assets.** The official logo mark, favicon set, web manifest and Open
Graph image have not been supplied. The repository ships a text wordmark and a neutral
favicon. Add the approved assets before launch.

### EXTERNAL DEPENDENCY — NOT A CODE DEFECT

**Supabase Auth email delivery and redirect allow-list.** Confirmation and password-reset
emails depend on the Supabase project's SMTP configuration, sender identity and allowed
redirect URLs. `resetPasswordForEmail` redirects to the app origin, so that origin must be
allow-listed in the Supabase project. This is project configuration, not application code.

### EXTERNAL DEPENDENCY — NOT A CODE DEFECT

**Hosting, HTTPS and secret injection.** Production must run with `NODE_ENV=production`,
serve the built `dist/` behind HTTPS, and inject Supabase/Gemini values through the host's
secret manager. A Content-Security-Policy is not defined in the app yet; add and test one
for the chosen host and any third-party embeds before exposing the site broadly. This is a
deployment-hardening step, not a functional defect in the current code.

## Deployment checklist

1. Apply the migrations to the target Supabase project and verify `GET /api/health`.
2. Configure the host with `NODE_ENV=production`, all Supabase variables, `GEMINI_API_KEY`
   and `ALLOWED_ORIGINS` as needed.
3. Configure Supabase Auth SMTP and allow-list the production origin for confirmation and
   reset links.
4. Run `npm ci`, `npm run lint`, `npm run build` and `npm test` in the release environment.
5. Add official branding assets and an OG image if the launch requires them.
6. Add and test a CSP for the production host.
7. Start with `npm start` and smoke-test sign-up, confirmation, sign-in, password reset,
   onboarding, a persisted write and a public profile link.

## Files changed in the final lock commit

**Modified**

- `.env.example`, `README.md`, `package.json`, `package-lock.json`
- `server.ts`
- `server/db/bookmarks.ts`, `server/db/jobApplications.ts`
- `src/App.tsx`
- `src/components/auth/AuthModal.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/notifications/NotificationsDrawer.tsx`
- `src/components/views/CVStudioView.tsx`
- `src/components/views/CareerAnalysisView.tsx`
- `src/components/views/DashboardView.tsx`
- `src/components/views/DocumentsView.tsx`
- `src/components/views/JobsView.tsx`
- `src/components/views/LandingView.tsx`
- `src/components/views/OnboardingView.tsx`
- `src/components/views/ProfileView.tsx`
- `src/components/views/SettingsView.tsx`
- `src/context/CareerContext.tsx`
- `src/lib/bookmarksApi.ts`
- `src/types/career.ts`
- `tests/domains.test.ts`

**Added**

- `FINAL_PRODUCTION_LOCK_REPORT.md`
- `src/components/auth/PasswordRecoveryModal.tsx`
- `src/components/views/PublicProfileView.tsx`

**Deleted**

- `src/data/jobsData.ts`
- `src/data/learningResources.ts`
- `src/data/projectsCatalog.ts`

## Commit and worktree

- Exactly one final commit is created: `chore: final production lock and release readiness`.
- No reset, rebase, amend, force-push or history rewrite was used.
- Nothing was pushed.
- `.tmp-qa/` is pre-existing untracked QA output and is intentionally excluded from the
  commit.
