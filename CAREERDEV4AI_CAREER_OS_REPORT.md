# CareerDev4AI — Career Operating System Expansion

**Date:** 4 November 2026
**Production origin:** https://careerdev4ai.pages.dev
**Scope:** Google site-name branding, persisted onboarding, versioned legal consent and access gating, and a real job-description → tailored CV / cover letter / application-package workflow.

This report records what was built, what was verified, and what still needs an operator. It deliberately does not claim that Google has already changed a search result: site-name reprocessing requires a recrawl, which is requested from Search Console and processed on Google's schedule.

---

## 1. What changed

### 1.1 Search identity

| Item | Value |
|---|---|
| Document title | `CareerDev4AI — Turn Your Ambition Into a Career Plan` |
| Canonical | `https://careerdev4ai.pages.dev/` |
| `og:site_name` | `CareerDev4AI` |
| `WebSite.name` | `CareerDev4AI` |
| `WebSite.url` | `https://careerdev4ai.pages.dev/` |
| `WebSite.alternateName` | `["CareerDev4AI", "Career Dev 4AI", "CareerDev4AI Career Platform"]` |
| `Organization.name` | `CareerDev4AI` |
| `Organization.alternateName` | same list |
| Publisher of `WebPage` | `WebSite` named `CareerDev4AI` |

The static homepage carries `Organization`, `WebSite` and `WebPage` JSON-LD. The client publishes the same values on route changes into the blocks marked `data-app-jsonld`, so there is only one set of schemas and no competing site name. The canonical is the home page for every in-app route because the application is one document at one address; a hash fragment is not a separate URL to a crawler.

### 1.2 Persisted onboarding

- `profiles.onboarding_status` is authoritative: `not_started`, `started`, `completed`, `skipped`.
- `profiles.onboarding_step` records the step reached, so a refresh, a logout/login, or a second device resumes rather than restarts.
- `profiles.onboarding_updated_at` records the last change.
- The legacy `onboarding_completed` boolean is kept in sync for older clients, but it no longer decides routing. A skipped user is **not** marked complete.
- `shouldForceOnboarding` forces `not_started` and `started`, and never forces `completed` or `skipped`.
- The guided setup has 15 steps: welcome, direction, goal, target role, skill assessment, skill gap, roadmap, learning, projects & volunteering, CV, jobs, applications & cover letters, AI assistant, progress & next actions, settings & help.
- Skip writes `skipped`; finishing writes `completed`; both survive reload, logout/login and a different device because the state is in the profile row, not local storage.
- Reopen path: **Settings → Getting started → Show me around again**. The dashboard also offers a restart action for users who want it. Reopening sets `started` and step 0, so the tour runs once more and can be skipped or completed again.
- The consent gate is rendered before onboarding, because onboarding is a protected screen too.

### 1.3 Versioned consent and access gating

- One table, `public.user_consents`, one row per acceptance.
- Columns: `user_id`, `terms_version`, `privacy_version`, `status` (`accepted` / `withdrawn`), `source` (`registration` / `reconsent` / `settings`), `accepted_at`, `created_at`.
- A partial unique index makes the same version pair acceptable only once; a new version pair is a new row, and older rows are never overwritten.
- Current versions: Terms `2026-11-04` (operator-approved document) and Privacy `2026-11-03` (existing policy page).
- Registration has an explicit, unchecked checkbox linking `/terms` and `/privacy`; the submit button is disabled until it is checked; the backend rejects an acceptance that is not explicit or that names a different version.
- Registrations that require email confirmation carry the acceptance in user metadata (`consent_accepted`, `terms_version`, `privacy_version`); the first authenticated consent check records it as a real row.
- Enforcement is server-side in `requireAuth`, which every protected route shares. A verified Supabase session is the only identity source; a client-supplied user id is ignored.
  - No token → `401 Unauthorized`.
  - Valid token, no current consent → `403 { error: "Consent required", code: "CONSENT_REQUIRED", termsVersion, privacyVersion }`.
  - Approved Terms missing → `503 LEGAL_CONTENT_UNAVAILABLE` rather than opening the platform silently.
  - Consent check itself failed → `503 CONSENT_CHECK_FAILED`, not a misleading 401.
- Only two authenticated routes are reachable before consent: `GET/POST /api/consent` (to discover and record the acceptance) and `/api/account/delete` (so a user who declines can still leave). Every other protected route, including direct URLs, refreshes, navigation and direct API calls, is gated by the same middleware.
- The client cannot bypass the gate by routing: the gate is a server condition, and all protected API calls return `CONSENT_REQUIRED` until it is satisfied.
- A version change re-gates every user and preserves the earlier record.

### 1.4 The AI job-description workflow

The CV studio now runs a real path from an advertisement to a submission package:

1. **Paste or upload a job description** (TXT, PDF, DOCX; text extraction endpoint).
2. **Extraction** returns only what the advertisement states:
   - role title, company, seniority, location, work arrangement;
   - required skills, preferred skills, technical skills/tools, soft skills;
   - keywords, ATS terms;
   - responsibilities, experience requirements, education requirements, certifications, other qualifications.
   - A field the advertisement does not state is `null` or `[]`. The model prompt forbids guessing; grounding against the pasted text drops a value the advertisement does not support. The deterministic fallback reads explicit labels and bullets and leaves `atsTerms` empty rather than inventing filter terms.
3. **Match report** — real score and its basis:
   - weighted breakdown (core / preferred / mention), matched and missing requirements with evidence from the candidate's own records, ATS keyword gaps, and a plain-language explanation naming what is missing. Repeated terms are counted once, under the most important heading.
4. **Tailored CV** — generated from the candidate's existing records, never from invention:
   - the original document is snapshotted first (`Original before tailoring`) and left untouched;
   - the result is saved as a separate immutable version labelled `Tailored CV — <role>`;
   - applying it is an explicit action, and removed claims are shown to the candidate;
   - the document remains associated with the job description through the package.
5. **Cover letter** — offered after the CV, grounded in the same real data, with preview, edit, regenerate, copy and export-as-text. Saving creates a new letter; it does not overwrite a previous one unless the candidate chooses to.
6. **Application package** — persisted with the real job title, company, match score, analysis, source CV, tailored CV version and cover letter. The UI shows real previews and only actions that work.

### 1.5 Shared AI processing surface

One modal and one request lifecycle are used by job-description analysis, tailored CV generation, cover letter generation, ATS audit, profile summary, interview practice, project advisor and career analysis.

- Centred overlay with backdrop blur, animated icon, title, the real current operation, an indeterminate bar (no fake 0–100%), a status line and a wait message.
- Real stages: preparing, processing/analyzing, generating, saving/finalizing, completed.
- After 15 seconds the modal adds a truthful “Still working…” notice; it does not simulate progress.
- Duplicate submission is prevented by an in-flight guard; the request carries an `AbortSignal`.
- Success state; error state with **Retry** and **Close**, preserving the caller's inputs; no secret or stack trace is shown.
- Keyboard: focus trap, `aria-modal`, `aria-labelledby`, `aria-live` status, Escape only when the operation is not in flight; the scroll lock and reduced-motion behaviour are respected; the layout is responsive and RTL-safe.
- Cancel aborts only the client wait; it does not pretend to cancel server work that has already been committed.

---

## 2. Files changed

### 2.1 SEO / branding

| File | Change |
|---|---|
| `index.html` | exact title, canonical, `og:site_name`, Organization/WebSite/WebPage JSON-LD, alternate names |
| `server/seo/config.ts` | canonical site name and alternate names, production origin |
| `server/seo/jsonld.ts` | Organization/WebSite/WebPage schemas |
| `server/seo/publicPages.ts` | public page forwarding for `/terms` |
| `server/seo/sitemap.ts` | public URLs from the one origin helper |
| `src/lib/seo.ts` | client metadata and JSON-LD parity |
| `tests/seo.test.ts` | site-name, canonical, OG, `alternateName`, `/terms` forwarding assertions |

### 2.2 Consent, onboarding and packages

| File | Change |
|---|---|
| `shared/legal.ts` | Terms/Privacy versions, approved Terms document, consent types and predicates |
| `server/legal.ts` | server-side approval switch |
| `server/db/consents.ts` | persistence, metadata acceptance, cached state, history |
| `server/auth/require-auth.ts` | backend consent gate and two-path allowlist |
| `server/db/applicationPackages.ts` | owner-scoped package persistence |
| `server/db/profile.ts` | onboarding status/step persistence and validation |
| `shared/onboarding.ts` | status vocabulary and routing predicate |
| `src/components/auth/AuthModal.tsx` | unchecked consent checkbox, disabled submit, metadata |
| `src/components/auth/ConsentGate.tsx` | blocking consent screen |
| `src/lib/consentApi.ts`, `src/lib/applicationPackagesApi.ts` | clients |
| `src/context/CareerContext.tsx` | consent hydration, registration consent, onboarding fields |
| `src/App.tsx` | consent gate, onboarding routing, tour host |
| `src/components/views/OnboardingView.tsx` | 15-step persisted tour, skip/resume |
| `src/components/views/SettingsView.tsx` | “Show me around again” reopen path |
| `src/components/views/DashboardView.tsx` | restart onboarding action |
| `supabase/migrations/20261103000002_consent_onboarding_and_packages.sql` | schema + RLS |

### 2.3 AI workflow and shared modal

| File | Change |
|---|---|
| `shared/jobDescription.ts` | extended contract, validation, grounding, scoring, deterministic reader |
| `server/cv/jobDescription.ts` | extraction prompt, analysis, tailored-CV prompt, match loading |
| `src/components/cv/JobDescriptionPanel.tsx` | JD → match → tailored CV → cover letter → package UI; metadata and list sections |
| `src/lib/jobDescriptionApi.ts` | API client and fallback shape |
| `src/components/ai/AIProcessingModal.tsx` | shared accessible modal, truthful slow notice |
| `src/lib/useAIProcessing.tsx` | shared lifecycle, timeout, retry, abort, duplicate guard |
| `src/translations/parts/cv.ts`, `src/translations/parts/applicationWorkflow.ts` | English/Arabic strings |
| `tests/job-description.test.ts` | contract, grounding, scoring, deterministic extraction, prompt tests |
| `tests/application-packages.test.ts` | owner scope and package correctness |
| `tests/ai-processing-contract.test.ts` | lifecycle contract |
| `tests/localization.test.ts` | coverage of the new UI |

### 2.4 Verification and tooling

`tests/consent-gate.test.ts`, `tests/onboarding.test.ts`, `tests/legal.test.ts`, `tests/helpers.ts`, `tests/runner.mjs`, `tests/server-harness.mjs`, `tests/cleanup.mjs`, `package-lock.json`.

---

## 3. Database migrations

### 3.1 `20261103000002_consent_onboarding_and_packages.sql`

Applied to the live project as migration version **20261103135624**.

- `public.user_consents` — new table, FK to `auth.users(id)` with `ON DELETE CASCADE`, version pair, status check, source, timestamps. Index on `(user_id, created_at DESC)` and partial unique index on `(user_id, terms_version, privacy_version) WHERE status = 'accepted'`.
- `public.profiles` — `onboarding_status` (`NOT NULL DEFAULT 'not_started'`, check on the four statuses), `onboarding_step` (`integer NOT NULL DEFAULT 0`), `onboarding_updated_at`. Existing rows backfilled from `onboarding_completed`; the legacy boolean is retained.
- `public.application_packages` — job title, company, job description, analysis JSON, match analysis JSON, match score with `0..100` check, language, source CV, tailored CV, tailored CV version, cover letter, timestamps. FKs use `ON DELETE SET NULL` for documents and `ON DELETE CASCADE` for the profile.
- Index on `(profile_id, created_at DESC)`.

### 3.2 `20261103000001_announcement_notification_uniqueness.sql`

Applied to the live project as migration version **20261103221213** (delivery-uniqueness fix from the preceding phase). It collapses any duplicate delivery notifications, repoints ledger rows at the keeper, and creates the unique index `notifications_announcement_recipient_key` on `(announcement_id, profile_id)`. PostgreSQL treats NULL `announcement_id` as distinct, so ordinary notifications are unaffected.

### 3.3 RLS verified live

`user_consents`:

- SELECT — `auth.uid() = user_id`
- INSERT — `WITH CHECK (auth.uid() = user_id)`
- No UPDATE or DELETE policy: an acceptance is append-only from the client, and the service role keeps the server path.

`application_packages`:

- SELECT — `auth.uid() = profile_id`
- INSERT — `WITH CHECK (auth.uid() = profile_id)`
- UPDATE — `USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id)`
- DELETE — `USING (auth.uid() = profile_id)`

RLS is enabled on both tables. The browser never receives a service-role key; the server's guarded service client is used only behind `requireAuth`, and profile ids come from the verified token, not the body.

---

## 4. Security verification

- `tests/consent-gate.test.ts` proves:
  - every protected route refuses a user without the current documents (`403 CONSENT_REQUIRED`);
  - a non-explicit acceptance or a mismatched version is rejected;
  - an explicit acceptance is recorded and opens the gate;
  - a version change re-gates the user and keeps the older record;
  - one user's acceptance, or a body-supplied id, cannot unlock another user;
  - an acceptance carried by an email-confirmation registration is honoured.
- `tests/application-packages.test.ts` proves:
  - a package is created under the authenticated profile even when the body names another profile id;
  - another user cannot update it (`404`);
  - an invalid score or a too-short job description is rejected (`400`).
- Cross-user document access is covered by the existing CV, CV-version, storage and roadmap tests, which run against the live database with disposable identities.
- Document generation reads the candidate's records only; grounding removes claims, employers, numbers and links the candidate did not record.

---

## 5. Verification

### 5.1 Type check

```
npm run lint   # tsc --noEmit
```

{{LINT_RESULT}}

### 5.2 Targeted suites

```
TEST_ONLY='consent-gate,seo,legal,onboarding,application-packages' npm test
TEST_ONLY='job-description,localization' npm test
```

{{TARGETED_RESULT}}

### 5.3 Full suite

```
npm test
```

{{FULL_TEST_RESULT}}

### 5.4 Production build

```
npm run build
```

{{BUILD_RESULT}}

---

## 6. Deployment and production smoke

{{DEPLOY_RESULT}}

---

## 7. Remaining operator / content actions

1. **Request a recrawl in Google Search Console** for `https://careerdev4ai.pages.dev/`, then check the site-name result after Google reprocesses the page. The markup is correct now; the search result will not change until Google recrawls. No one can promise a date.
2. **Finish the legal text.** The published Terms identify the operator-approved document dated 4 November 2026, but section 14 still says the governing law and dispute-resolution arrangements “must be specified in the final legally approved version”, and section 15 refers to the published contact channels rather than naming an address. Supply the approved wording and bump `TERMS_VERSION`, which will re-gate every user exactly as designed.
3. **Re-authorise GA4** if the Admin traffic panel is required. The existing integration reports `invalid_grant` / `invalid_client` / missing `analytics.readonly` scope in the server log; this is a pre-existing credential issue, not a regression of this work.
4. **AI provider key.** The workflow degrades to the deterministic reader and a measured score when no model is configured. A real extraction and letter generation need `GEMINI_API_KEY` in the deployment environment.
5. **Review the consent rows** once real users have accepted, and keep the history. Do not delete old rows when a version changes.

---

## 8. Requirement-to-evidence matrix

| Requirement | Evidence |
|---|---|
| Google sees `CareerDev4AI` | static + client `Organization`/`WebSite` JSON-LD, `og:site_name`, title; SEO test asserts all three |
| Canonical is the production origin | `<link rel="canonical" href="https://careerdev4ai.pages.dev/" />`; route metadata test |
| No competing names | alternate list starts with the canonical name; one origin helper; test compares static and client schema |
| Onboarding persists everywhere | `profiles.onboarding_status/step`, server PATCH validation, resume from persisted step |
| Skip is respected | `skipped` is not forced; legacy boolean stays false; test |
| Reopen path | Settings “Show me around again” (and dashboard restart) |
| Registration consent | unchecked checkbox, disabled submit, metadata, backend validation |
| Consent persisted | `user_consents` row per acceptance, versions, timestamp, status, source |
| Access gated backend-side | `requireAuth` 403 `CONSENT_REQUIRED`; only `/api/consent` and `/api/account/delete` exempt |
| Re-consent on version change | version comparison + history retained; test |
| Real JD extraction | model prompt + grounding; optional fields empty when unstated; deterministic fallback |
| Tailored CV is real and safe | source records, original snapshot, separate immutable version, explicit apply |
| Match report is real | measured score, breakdown, evidence, missing list, ATS gaps, explanation |
| Cover letter workflow | offered after CV, preview/edit/regenerate/copy/export, new row on save |
| Package is real | persisted title, score, analysis, document links, working actions |
| Shared modal | one `AIProcessingModal` + `useAIProcessing`; stages, slow notice, ARIA, retry, abort |
| Cross-user access fails | RLS policies + tests for packages, CVs, versions, storage, roadmap |
| No production data destroyed | additive migrations, no resets, no drops, no auth replacement |
| No invented content | grounding and deterministic readers leave unknowns empty; tests |
