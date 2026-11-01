# CareerDev4AI — Rebrand Audit

**Date:** 1 November 2026
**Scope:** User-facing rebrand from `CareerPilot AI` to `CareerDev4AI`, plus the
separate `careerdev4ai` Cloudflare Pages deployment.
**Companion document:** `CAREERDEV4AI_REBRAND_DEPLOYMENT_REPORT.md`
**Supersedes:** branding sections of `PLATFORM_AUDIT_*`, `QA_VERIFICATION_REPORT.md`
and the earlier `CAREERDEV4AI_*` reports. Those files are left untouched as
point-in-time records.

---

## 1. Verdict

| Gate | Result |
| --- | --- |
| Rebrand coverage (user-facing surfaces) | **Complete** — no `CareerPilot` in built HTML or JS bundles |
| `npm run lint` (`tsc --noEmit`) | **Pass** — 0 errors |
| `npm test` | **Pass** — 560 tests, 558 pass, 2 skipped, 0 fail |
| Localisation coverage | **Pass** — 1110/1110 source strings (100%), English + Arabic |
| `npm run build` | **Pass** — exit 0, `dist/` + `dist/_worker.js` produced |
| Commit | `796edc2` — `fix: improve roadmap relevance and learning UX` |
| New deployment `careerdev4ai` | **Live** — <https://careerdev4ai.pages.dev/> |
| Legacy deployment `careerpilot4ai` | **Untouched** — still serving the old build |

The rebrand itself was cosmetic and configuration-only. No route, schema, RLS
policy, Supabase project or stored data was changed. The follow-up pass in
section 9 tightened recommendation relevance and rebuilt the roadmap learning
card hierarchy; both are covered by new regression tests and live verification.

---

## 2. What was rebranded

### 2.1 Translations (single source of truth for UI copy)

| File | Change |
| --- | --- |
| `src/translations/index.ts` | `brandName` (`CareerPilot AI` → `CareerDev4AI`), `heroSubtitle` in English and Arabic |
| `src/translations/parts/appShell.ts` | `CareerDev4AI`, `CareerDev4AI sign in`, `CareerDev4AI Copilot`, `Continue to CareerDev4AI` |
| `src/translations/parts/settings.ts` | settings copy that names the product |
| `src/translations/parts/roadmap.ts` | roadmap copy that names the product |
| `src/translations/parts/profile.ts` | profile copy that names the product |
| `src/translations/parts/cv.ts` | CV copy that names the product |
| `src/translations/parts/career.ts` | `CareerDev4AI is analyzing your graph`, `The CareerDev4AI journey`, `CareerDev4AI brings the journey together.` |

Arabic entries were updated alongside the English ones, so the bilingual
catalogue stays complete. The localisation test enforces this: every `t(...)`
source string must have a non-empty Arabic value with intact placeholders.

### 2.2 Components and views

`AppShell.tsx`, `LandingView.tsx`, `SettingsView.tsx`, `AuthModal.tsx`,
`PasswordRecoveryModal.tsx`, `PublicProfileView.tsx`, `ProfileView.tsx`,
`RoadmapView.tsx`, `CopilotDrawer.tsx`, `CareerJourneyVisual.tsx`,
`BuiltCvPanel.tsx`, `GuidedTour.tsx`, `JobsView.tsx`, `OnboardingView.tsx`,
`Logo.tsx` (alt text and comments), and `CareerPilotAvatars.tsx`
(aria-label only).

These are text, accessible-name and comment edits. Layout, state, API calls and
routing are unchanged.

### 2.3 Document metadata and static assets

| File | Change |
| --- | --- |
| `index.html` | `<title>`, description, `og:*`, `twitter:*`, canonical and `og:url` → `https://careerdev4ai.pages.dev/` |
| `metadata.json` | application name |
| `public/site.webmanifest` | `name` / `short_name` |
| `public/favicon.svg` | `aria-label` |
| `scripts/generate-brand-assets.mjs` | generated asset labels |
| `scripts/generate-android-assets.mjs` | header comment |

The brand artwork itself contains only the mark (orbital arrow, orbit, star) —
no baked-in wordmark — so no image files were regenerated. The PNG filenames
(`careerpilot-icon.png`, `careerpilot-logo.png`) are kept on purpose (see
section 3).

### 2.4 Server-side and AI-facing text

| File | Change |
| --- | --- |
| `app.ts` | AI system prompt names the product as CareerDev4AI |
| `server/ai/careerContext.ts` | prompt context brand string |
| `server/learning/ai.ts` | prompt brand string |
| `server/cv/aiAssist.ts` | prompt brand string |
| `server/cv/jobDescription.ts` | prompt brand string |
| `server.ts` | startup log line |

No model, endpoint, prompt logic or response shape changed — only the product
name the model is told it is speaking for.

### 2.5 Build, deploy and native configuration

| File | Change |
| --- | --- |
| `wrangler.jsonc` | Pages project name → `careerdev4ai` |
| `package.json` / `package-lock.json` | package name → `careerdev4ai`; `cf:*` scripts target `careerdev4ai` |
| `scripts/production/smoke-production.cjs` | default `BASE_URL` → new origin |
| `scripts/production/verify-production-security.cjs` | default target → new origin |
| `capacitor.config.ts` | `appName: 'CareerDev4AI'` (appId unchanged) |
| `android/app/src/main/res/values/strings.xml` | `app_name` and window title only |
| `android/app/src/main/assets/capacitor.config.json` | `appName` (generated file; see note) |
| `.env.android` | `VITE_API_BASE_URL` → `https://careerdev4ai.pages.dev` |
| `.env.example` | example origin |
| `README.md` | title, deploy target, npm script targets, Supabase Auth URLs, legacy note |

> **Note on `android/app/src/main/assets/capacitor.config.json`:** this file is
> generated and is listed in `android/.gitignore`, so the edit is local only.
> The source of truth is `capacitor.config.ts`; the next `npx cap sync` writes
> the same value.

---

## 3. What was deliberately left unchanged

The rebrand targets user-facing identity only. The following identifiers are
load-bearing and were intentionally preserved:

| Identifier | Location | Why it stays |
| --- | --- | --- |
| `ciihprsfdojzvjnqgbxl` | Supabase project ref, CSP `connect-src` | Same database, auth and storage; changing it would mean a new project |
| `com.careerpilot.ai` | `capacitor.config.ts` appId, Android namespace, OAuth deep-link scheme | Changing it creates a different Android app identity and breaks existing installs and redirect URIs |
| `careerpilot_*` localStorage keys | `src/context/CareerContext.tsx` and helpers | Renaming would orphan signed-in users' cached state |
| `.careerpilot_state.json` | test fixture / state file | Referenced by the test runner and cleanup checks |
| `careerpilot-icon.png`, `careerpilot-logo.png` | `public/`, hashed into `dist/assets/` | Asset paths referenced from manifest, HTML and components; renaming adds churn with no user-visible benefit |
| `CareerPilotAvatar`, `CareerPilotAvatars.tsx` | component/export names | Internal symbol names, not rendered text |
| `cp-verify-*` temp identity prefix | verification scripts (deleted) | Historical only |
| Legacy `careerpilot4ai` URLs | `README.md`, `wrangler.jsonc` comment | Documenting the old deployment so nobody deploys over it |

Remaining `CareerPilot` strings in the source are therefore limited to:
internal comments, the identifiers above, historical report titles, migration
header comments, and the legacy-URL documentation in `README.md`.

---

## 4. Verification of the built artifact

Checks run against `dist/` after `npm run build` and re-run against the live
deployment:

| Check | Result |
| --- | --- |
| `dist/index.html` title | `CareerDev4AI — Your Personal Career Operating System` |
| `dist/index.html` canonical | `https://careerdev4ai.pages.dev/` |
| `CareerPilot` in `dist/index.html` | 0 |
| `CareerPilot` across all 6 built JS assets | 0 |
| `CareerDev4AI` across the same assets | 50 occurrences |
| `CareerPilot` in live HTML and live JS | 0 |
| Visible `CareerPilot` text in the running app | none found on any visited page |
| Arabic UI after switching language | `dir="rtl"`, `lang="ar"`, `CareerDev4AI` intact, no old branding |

---

## 5. Quality gates

```
> careerdev4ai@1.0.0 lint
> tsc --noEmit
```
No output, exit 0.

```
> careerdev4ai@1.0.0 test
> node tests/runner.mjs
ℹ tests 560   ℹ pass 558   ℹ fail 0   ℹ skipped 2
[test] PASS
```

The two skips are the pre-existing conditional cases (they only run when
`GEMINI_API_KEY` is absent). The suite starts an isolated API server against the
live database and deletes every identity and storage object it creates.

```
localisation coverage: 1110/1110 source strings (100%)
raw English literals still in the components: 55 (unchanged baseline)
```

```
> careerdev4ai@1.0.0 build
> vite build && node scripts/build-worker.mjs
✓ built in ~40s
```

One non-blocking warning: the largest JS chunk (`index-*.js`) is ~600.7 kB,
just above Vite's 600 kB advisory threshold. This is pre-existing and does not
affect correctness.

---

## 6. Legacy deployment integrity

`careerpilot4ai` was never a deploy target in this pass:

- `wrangler.jsonc` names `careerdev4ai` only.
- All `cf:*` npm scripts pass `--project-name careerdev4ai`.
- The production scripts default to the new origin.
- No `wrangler pages` command was run with `--project-name careerpilot4ai`.

Confirmed after deployment:

| Check | Old deployment |
| --- | --- |
| `https://careerpilot4ai.pages.dev/` | HTTP 200 |
| Title | `CareerPilot AI — Your Personal Career Operating System` (unchanged) |
| `CareerPilot` in HTML | present |
| `CareerDev4AI` in HTML | 0 |
| `/api/health` | 200, model configured |
| Cloudflare "Last Modified" | ~4 hours old at time of check — no new deployment |

---

## 7. Remaining non-blocking issues

1. **OAuth redirect allow-list.** Email/password sign-in was verified end to end
   on the new origin. Google / LinkedIn / GitHub sign-in additionally requires
   `https://careerdev4ai.pages.dev/**` (and the preview wildcard) to be added to
   Supabase Auth → URL Configuration. That is a dashboard step, not a code
   change, and it is documented in `README.md`.
2. **Live Gemini response not exercised.** `/api/health` reports
   `modelConfigured: true` with `gemini-3.1-flash-lite`, and the Copilot drawer
   renders with readiness, quick actions and the prompt input. No live
   completion was generated during this pass because the free tier returned
   `429 RESOURCE_EXHAUSTED` earlier in the session. The configuration and the
   UI path are verified; the model call itself is not.
3. **Mobile viewport.** The redesigned roadmap was measured at true
   `320 / 390 / 768 px` viewports in both LTR and RTL using a same-origin local
   harness (the deployed site sends `X-Frame-Options: DENY`, so it cannot be
   iframed). At every width the page had no horizontal overflow, the six
   Start Learning CTAs were at least 44 px tall, and the stage stepper scrolled
   only inside its own container. Desktop (`1000 px`) was checked on the live
   origin.
4. **Chunk size warning** as noted in section 5 — cosmetic.
5. **AI enrichment fallback.** The live Learning Hub reported
   “AI generation failed; deterministic ranking was used”. This is the designed
   fallback while the free Gemini tier is rate-limited; the deterministic
   relevance gate and ranking are fully exercised and tested.

---

## 8. Working tree state

```
796edc2  fix: improve roadmap relevance and learning UX
         (93 files, 7229 insertions, 1125 deletions — deployed)
ddfba34  docs: record relevance, roadmap UX and deployment verification
         (these two reports)
working tree: clean
```

The commit includes the earlier rebrand/UX work and its reports, the new
relevance-gate regression tests, `shared/learningLinks.ts`, the redesigned
roadmap UI and the Arabic strings. No secret, `.env`, `dist/` or generated
Android asset was committed. No destructive git command (`reset --hard`,
`clean -fd`, `checkout .`) was used at any point.

---

## 9. Follow-up pass — relevance gate and roadmap learning UX

### 9.1 Problem

An HR target role could receive an unrelated SQL course. The old scoring allowed
catalogue category, career goal, language, format, price and the saved flag to
create enough “weak relevance” for a course to enter the list. The roadmap also
mixed learning resources, status and details into one low-contrast card, and its
`Start Learning` action did not reliably open the stored source.

### 9.2 Recommendation relevance gate

`server/learning/recommendation.ts` now treats relevance as a **gate**, not a
weight. When a target role exists, a course is eligible only if at least one of
these is true:

- it carries an explicit tag for the target role (`roleRelevance > 0`);
- it teaches one of the role’s own skills (`roleSkillScore > 0`);
- it closes an open skill gap (`gapScore > 0`);
- it is attached to the current roadmap (`roadmapScore > 0`).

Category/domain, career goal, language, format, price, the saved flag and an
explicit focus skill are ranking signals only; they cannot make an ineligible
course eligible. Without a target role the older, weaker exploration behaviour
is kept so a new user can still browse before choosing a role. Language and
format can reorder relevant courses but cannot resurrect an irrelevant one.

No role-specific exception was hard-coded: SQL is still allowed for Data
Analyst and HR Analyst because it is genuinely one of their role skills, while
HR Specialist rejects a general SQL course through the generic rule.

### 9.3 Roadmap learning hierarchy

`src/components/views/RoadmapView.tsx` now presents each step as:

1. **START HERE** — one obvious next action, its stage and the attached source.
2. **LEARN THIS** — the skill and priority.
3. **WHY THIS MATTERS** — the role-specific reason.
4. **RESOURCE** — the primary learning source with `Start Learning ↗`, plus
   secondary sources.
5. **OUTCOME** — what the step makes the user able to do.
6. **Details / Status** — prerequisites, projects, hours and the status control,
   visually subordinate.

The primary CTA opens the stored URL in a new tab (`target="_blank"`,
`rel="noopener noreferrer"`). `shared/learningLinks.ts` only allows absolute
`http(s)` URLs; a missing or unsafe URL renders an honest “no verified resource
link” message instead of a misleading action. Task status is updated to
`in_progress` on the same click, so existing progress semantics are preserved.

The plan order is now explicit: **START → Foundation → Core Skills → Practice →
Projects → Job Preparation → JOB READY**. Progress, completed tasks,
prerequisites, projects, saved resources, target-role logic, Arabic/English
filtering and persisted roadmap data are all read from the existing state; the
view never regenerates or resets a roadmap.

Resource attachment in `shared/roadmapGenerator.ts` now uses the shared
`skillMatchConfidence` with a `>= 0.8` threshold, replacing the loose
“shares one significant token” match that could attach unrelated material.

### 9.4 Regression tests

New `tests/recommendation-relevance.test.ts` (12 tests, wired into
`tests/runner.mjs`) covers:

- HR role + HR resource → allowed;
- HR role + unrelated SQL resource → rejected and absent from the ranking;
- category, saved flag and focus skill cannot create eligibility;
- Data Analyst + SQL → allowed;
- language/format cannot override relevance;
- a relevant course survives a language/format mismatch;
- next-step selection prefers the HR course;
- stored URL → CTA URL; missing/relative/`javascript:`/`ftp:`/malformed URL →
  no external action;
- roadmap resource attachment only to the gap it teaches;
- no re-created work for a skill already met;
- first stage remains current for a new user.

`tests/b5.test.ts` was updated for the gate. The full suite is now
560 tests / 558 pass / 2 skipped / 0 fail, and localisation is 1110/1110.

### 9.5 Live verification (post-deploy)

| Check | Result |
| --- | --- |
| `GET https://careerdev4ai.pages.dev/` | 200 |
| Deployed `RoadmapView-CCG_F6ay.js` | contains `START HERE`, `LEARN THIS`, `WHY THIS MATTERS`, `RESOURCE`, `OUTCOME`, `Start Learning` |
| Live HR Specialist recommendations | CIPD, BambooHR, Arabic HR course, Excel, Trust/Communication; **0 SQL-like titles** |
| Live Data Analyst recommendations | SQL courses present (legitimate role skills) |
| Live roadmap (HR Specialist, temp user) | 4 phases / 14 tasks; 0 unsafe resource URLs; 0 SQL resources on non-SQL HR tasks |
| Live `Start Learning` hrefs | real stored sources, e.g. `https://ico.org.uk/...`, `https://www.cipd.org/en/knowledge/`, `https://support.bamboohr.com/` |
| CTA shape | `target="_blank"`, `rel="noopener noreferrer"`, 44 px minimum height |
| Stage order | START → Foundation → Core Skills → Practice → Projects → Job Preparation → Final state |
| 320 / 390 / 768 px, LTR and RTL | no page-level horizontal overflow; stepper scrolls inside its own container; CTA ≥ 44 px |
| Legacy `https://careerpilot4ai.pages.dev/` | 200, old build unchanged |
| `/api/health` | 200, model configured |

Temporary verification users were created through the Supabase admin API and
deleted afterwards (HTTP 200). The local dev server and frame-friendly proxy used
for the viewport measurements were stopped; no harness file was added to the
repository.
