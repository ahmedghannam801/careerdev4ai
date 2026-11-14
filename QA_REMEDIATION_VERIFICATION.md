# CareerDev4AI — November 2026 QA Remediation Verification

**Scope:** the November 2026 Comprehensive QA Report (`BUG-01`–`BUG-30`), the UI polish
items (`UI-01`–`UI-06`), the New Dashboard Layout Redesign, the Centralized Career Data
Architecture, the token-economy rules, and the automated functional integration tests
(`FT-01`–`FT-08`).

**Date:** 20 November 2026

---

## 1. Release gates

| Gate | Command | Result |
| --- | --- | --- |
| Type safety | `npm run lint` (`tsc --noEmit`) | **Pass — 0 errors** |
| Full test suite | `npm test` | **Pass — 1590 passed, 0 failed, 2 skipped**, 369 suites, 95 test files |
| Localisation parity | `tests/localization.test.ts` | **Pass — 2295/2295 source strings (100%)**, EN + AR, no empty Arabic |
| Production build | `npm run build` | **Pass — exit 0**, `dist/` + `dist/_worker.js` (4.20 MiB), bundle-auth check passed (4 sign-in methods carried) |

Two of the 95 registered test files are skipped by design (`coverage.test.ts`: "the AI
routes fail honestly when no model is available" — the test server *has* a model
configured, so the no-model contract does not apply). The build emits the pre-existing
>600 kB chunk-size advisory; it is not an error and was present before this work.

### A runner defect found and fixed during this pass

`tests/runner.mjs` keeps an explicit list of the test files the suite runs. The eleven
new suites written for this report were **not in that list**, so `npm test` was silently
skipping every one of them — including `FT-01`–`FT-08`. The files are now registered
(with the reason each one exists, in the runner's own comment style), and the full run
above executes them.

To prove the coverage is complete, the 95 registered files were partitioned into eight
chunks and every file was run; the result was **95/95 files, 1590 passed, 0 failed**,
which is the same total the single full run reports.

---

## 2. `BUG-01`–`BUG-30`

| ID | Requirement | Files | Proof | Result |
| --- | --- | --- | --- | --- |
| BUG-01 | One identity and one avatar across every page | `shared/identity.ts`, `src/components/layout/AppShell.tsx`, `src/context/CareerContext.tsx`, `src/components/views/ProfileView.tsx` | `tests/identity.test.ts` (12) | Pass |
| BUG-02 | One metrics engine for readiness, progress and gaps | `shared/careerMetrics.ts`, `src/components/career/MetricCard.tsx`, `src/components/views/DashboardView.tsx` | `tests/career-metrics.test.ts` (33) | Pass |
| BUG-03 | Every metric explains itself (definition + formula + the candidate's own arithmetic) | `shared/careerMetrics.ts` (`METRIC_EXPLANATIONS`, `explainMetric`), `src/components/career/MetricCard.tsx` | `tests/career-metrics.test.ts` | Pass |
| BUG-04 | The roadmap may never call a core skill covered while a gap for it is open | `shared/careerMetrics.ts`, `src/components/views/RoadmapView.tsx` | `tests/roadmap-gap-sync.test.ts` (5) | Pass |
| BUG-05 | Duplicate summary paragraphs are removed | `shared/cvDocument.ts`, `shared/cvProjection.ts` | `tests/cv-projection.test.ts` (34) | Pass |
| BUG-06 | One canonical name per skill; merged names read canonically (`SQL`+`SQL Fundamentals`→`SQL`; `Microsoft Excel`+`Excel / Spreadsheets Modeling`→`Microsoft Excel & Spreadsheets Modeling`) | `shared/cvCanonical.ts`, `shared/cvProjection.ts` | `tests/cv-canonical.test.ts` (23) | Pass |
| BUG-07 | Target opportunity type (internship / full-time entry / both) | `shared/careerIdentity.ts`, `src/components/career/CareerGoalRolePanel.tsx`, `server/db/profile.ts`, `app.ts`, `src/lib/roadmapApi.ts`, `supabase/migrations/20261120000001_target_opportunity_and_headline.sql` | `tests/career-identity-opportunity.test.ts` (13) | Pass |
| BUG-08 | The Learning Hub only recommends what fits the target role and the open gaps | `server/learning/recommendation.ts` | `tests/learning-access.test.ts` (19), `tests/recommendation-relevance.test.ts` | Pass |
| BUG-09 | Honest pricing tier per resource — four tiers: `100% Free`, `Free Audit (Certificate Paid)`, `Free Trial / Limited`, `Paid Subscription` | `shared/learningAccess.ts`, `src/components/learning/CourseCard.tsx`, `src/components/views/LearningCenterView.tsx` | `tests/learning-access.test.ts` | Pass |
| BUG-10 | "Free only" keeps only resources whose core learning content can be completed for nothing; a limited/trial/paid resource and an unknown one are excluded | `shared/learningAccess.ts` (`isFreeOnlyEligible`), `server/learning/recommendation.ts`, `src/components/views/LearningCenterView.tsx` | `tests/learning-access.test.ts` | Pass |
| BUG-11 | The same opportunity is never shown twice | `shared/opportunityMatching.ts`, `src/components/volunteer/VolunteerOpportunities.tsx` | `tests/opportunity-matching.test.ts` (20) | Pass |
| BUG-12 | Expired opportunities are never offered | `shared/opportunityMatching.ts` (`isExpired`, `opportunityListing`) | `tests/opportunity-matching.test.ts` | Pass |
| BUG-13 | Organisation career pages are separated from real openings | `shared/opportunityMatching.ts` (`isOrganizationDirectory`), `src/components/volunteer/VolunteerOpportunities.tsx` | `tests/opportunity-matching.test.ts` | Pass |
| BUG-14 | Evidence passes through named validation stages (project completion → evidence submission → skill validation → skill mastery) and named validation states | `shared/assessment.ts` (`EVIDENCE_STAGES`, `SKILL_VALIDATION_STATES`), `shared/skillEvidence.ts` | `tests/assessment.test.ts` (15) | Pass |
| BUG-15 | Every assessment is logged as an attempt | `shared/assessment.ts` (`AssessmentAttempt`, `describeAttempt`) | `tests/assessment.test.ts` | Pass |
| BUG-16 | A knowledge check alone cannot reach 5/5 — the diagnostic ceiling is 4/5; 5/5 "Verified Mastery" needs practical proof (project, certificate or work experience) | `shared/assessment.ts` (`DIAGNOSTIC_CEILING`, `VERIFIED_MASTERY_LEVEL`), `shared/skillEvidence.ts` | `tests/assessment.test.ts`, `tests/functional-flows.test.ts` (FT-02) | Pass |
| BUG-17 | The roadmap time breakdown is additive and honest | `shared/roadmapTimeBreakdown.ts`, `src/components/views/ProgressView.tsx` | `tests/progress-measurement.test.ts` (21) | Pass |
| BUG-18 | A course never appears on two shelves | `shared/learningAccess.ts` (`dedupeAcrossShelves`), `src/components/views/LearningCenterView.tsx` | `tests/learning-access.test.ts` | Pass |
| BUG-19 | Completion pace and weeks are estimated and shown | `shared/learningAccess.ts` (`estimatedCompletionWeeks`, `completionPaceLabel`), `src/components/learning/CourseCard.tsx` | `tests/learning-access.test.ts` | Pass |
| BUG-20 | Every skill level states where it came from (Direct Assessment / Self-Reported / AI-Estimated from CV / Project Evidence …) | `shared/assessment.ts` (`SKILL_LEVEL_SOURCES`), `src/components/views/SkillAssessmentView.tsx` | `tests/assessment.test.ts` | Pass |
| BUG-21 | The project advisor distinguishes recommending projects from checking existing ones | `src/components/projects/ProjectAiPanel.tsx`, `shared/projectRecommendation.ts` | `tests/project-recommendation.test.ts` (48, incl. "checking an existing project"), `tests/project-advisor-ai.test.ts` (5) | Pass |
| BUG-22 | The Progress page says "Shipped Projects" | `src/components/views/ProgressView.tsx` | `tests/progress-measurement.test.ts` | Pass |
| BUG-23 | Interview Readiness % is derived from the mock interview sessions, so it cannot disagree with the Interviews page | `shared/interviewReadiness.ts`, `src/components/views/ProgressView.tsx`, `src/components/views/InterviewsView.tsx` | `tests/interview-readiness.test.ts` (12), FT-05 | Pass |
| BUG-24 | The gap badge names the specific skill it closes | `shared/opportunityMatching.ts` (`matchedGapSkills`), `src/components/volunteer/VolunteerOpportunities.tsx` | `tests/opportunity-matching.test.ts` | Pass |
| BUG-25 | The action fits the kind of opportunity (apply / join / enrol / track / record volunteering) | `shared/opportunityMatching.ts` (`opportunityCta`), `src/components/volunteer/VolunteerOpportunities.tsx` | `tests/opportunity-matching.test.ts` | Pass |
| BUG-26 | Education records are merged; empty experience entries are dropped | `shared/cvDocument.ts`, `shared/cvProjection.ts` | `tests/cv-projection.test.ts` | Pass |
| BUG-27 | Profile completeness names what is missing | `shared/profileCompleteness.ts`, `src/components/views/ProfileView.tsx` | `tests/qa-scenarios.test.ts` (29) | Pass |
| BUG-28 | A student is asked when they graduate | `shared/careerIdentity.ts` | `tests/career-identity-opportunity.test.ts` | Pass |
| BUG-29 | The professional headline is not the job title | `shared/careerIdentity.ts`, `src/components/career/CareerGoalRolePanel.tsx`, `server/db/profile.ts` | `tests/career-identity-opportunity.test.ts` | Pass |
| BUG-30 | The jobs page has real loading, error, empty and results states, with "Try again", external board links and "Clear filters" | `src/components/views/JobsView.tsx` | `tests/jobs.test.ts` (36) | Pass |

---

## 3. `UI-01`–`UI-06`

| ID | Requirement | Files | Proof | Result |
| --- | --- | --- | --- | --- |
| UI-01 | "Recommend projects for me" and "Check my existing projects" are two clearly explained, separate actions | `src/components/projects/ProjectAiPanel.tsx` | `tests/project-advisor-ai.test.ts`, `tests/project-recommendation.test.ts` | Pass |
| UI-02 | A skill-appropriate visual, or a clean unified category badge when no picture belongs to that skill — never one generic photograph for everything | `src/lib/imageAssets.ts` (`getSpecificIndustryVisual`), `src/components/views/SkillAssessmentView.tsx` | `tests/assessment-visuals.test.ts` (4) | Pass |
| UI-03 | Profile ↔ CV bidirectional sync — an edit in either view reaches the other | `src/components/cv/studio/CvDataManager.tsx`, `src/context/CareerContext.tsx`, `shared/cvProjection.ts` | `tests/cv-projection.test.ts`, FT-01, FT-07 | Pass |
| UI-04 | The Projects empty state states the Role Readiness impact, with "+ Add Your First Project" | `src/components/views/ProjectsView.tsx` | `tests/project-recommendation.test.ts`; label parity via `tests/localization.test.ts` | Pass |
| UI-05 | The Documents empty state states the Role Readiness impact, with "Open CV Studio to Save a Snapshot" | `src/components/views/DocumentsView.tsx` | `tests/cv-studio.test.ts` (46), `tests/cv-projection.test.ts`; label parity via `tests/localization.test.ts` | Pass |
| UI-06 | The Evidence empty state states the Role Readiness impact, with "+ Submit Skill Evidence" | `src/components/views/EvidenceView.tsx` | `tests/skills.test.ts`, `tests/assessment.test.ts`; label parity via `tests/localization.test.ts` | Pass |

The UI-01 and UI-04/05/06 items are presentation-layer changes. They are covered by the
logic suites that drive the same code paths, by `tsc --noEmit` (0 errors) and by the
localisation gate (every new label exists in English and Arabic). The exact rendered
labels are asserted by the localisation test rather than by a dedicated DOM assertion.

---

## 4. New Dashboard Layout Redesign (Part 3)

Five sections, all reading from the one metrics engine so no two surfaces can disagree.

| Element | Files | Proof | Result |
| --- | --- | --- | --- |
| The five-stage journey on one line — Profile → Assessment → Learning → Projects → Apply | `src/components/career/CareerJourneyStepper.tsx`, `shared/careerMetrics.ts` (`CAREER_JOURNEY_STAGES`) | `tests/career-metrics.test.ts`, `tests/roadmap-gap-sync.test.ts` | Pass |
| The metric cards, each with an explanation popover | `src/components/career/MetricCard.tsx`, `src/components/views/DashboardView.tsx` | `tests/career-metrics.test.ts` | Pass |
| The current stage and the overall completion | `shared/careerMetrics.ts` (`determineCurrentStage`, `computeStageProgress`) | `tests/career-metrics.test.ts` | Pass |
| The gap list, with the reason each gap is critical | `shared/careerMetrics.ts` (`gapReason`, `isCriticalGap`) | `tests/career-metrics.test.ts`, `tests/roadmap-gap-sync.test.ts` | Pass |
| The translated copy | `src/translations/parts/dashboard.ts` | `tests/localization.test.ts` (100%) | Pass |

---

## 5. Token economy (Part 4)

No regression. The rules are asserted by three suites.

| Rule | Proof | Result |
| --- | --- | --- |
| The daily claim is exactly **+2** tokens | `tests/token-economy.test.ts` (5), `tests/credits-referrals-birthday.test.ts` (25) | Pass |
| A premium CV template unlock is exactly **5** tokens | `tests/token-economy.test.ts`, `tests/cv-templates.test.ts` (45) | Pass |
| A token is spent **only** on an explicit AI generation, after a valid response; a failed generation is refunded | `tests/token-deduction-contract.test.ts` (20) | Pass |
| Tokens are **never** spent on manual edits, "Fill from my records", a profile or settings save, a skill sync, or a page load | `tests/token-deduction-contract.test.ts` (the route table is scanned so no passive action can be priced like an AI action) | Pass |
| A duplicate request is charged once, and the ledger key is derived from the content of the request | `tests/token-deduction-contract.test.ts` | Pass |

---

## 6. `FT-01`–`FT-08` — automated functional integration tests

All eight live in `tests/functional-flows.test.ts` (21 tests). They exercise the real
shared modules the browser and the server run — no mocks — so a change that breaks a
journey breaks a test.

| ID | Journey | Tests | Result |
| --- | --- | --- | --- |
| FT-01 | The CV Studio integration — the records come in, and come in once; the candidate's certificate is kept | 2 | Pass |
| FT-02 | The assessment integration — the attempt is recorded and every surface moves together; the level is capped at 4 without practical proof | 2 | Pass |
| FT-03 | The evidence validation — every stage and every validation state is named; a skill is not mastered until the evidence is verified | 3 | Pass |
| FT-04 | The job application pipeline — the four stages are kept; a saved job is never counted as an active application | 2 | Pass |
| FT-05 | The interview session — readiness is measured from the sessions alone; no penalty for having no applications; the portfolio target is at least two | 3 | Pass |
| FT-06 | The documents snapshot — every snapshot is kept; the count grows | 2 | Pass |
| FT-07 | The settings synchronisation — one identity is derived from the profile wherever it was changed; no stale data when the target role changes | 2 | Pass |
| FT-08 | The live jobs filters — each filter reads on its own, they combine, nonsense falls back to the defaults, an expired posting is never shown | 4 | Pass |
| — | The scenarios share one set of rules — a near-duplicate skill is folded the same way everywhere | 1 | Pass |

---

## 7. New files added

| File | Purpose |
| --- | --- |
| `shared/identity.ts` | The one place the display name, the initials and the avatar are resolved |
| `shared/careerMetrics.ts` | The metrics engine: readiness, progress, gaps, journey stages, metric explanations |
| `shared/interviewReadiness.ts` | Interview readiness, measured from the mock interview sessions |
| `shared/cvCanonical.ts` | The canonical skill-naming engine |
| `shared/learningAccess.ts` | The four access tiers, the free-only rule, certificate badges, pace estimates |
| `shared/opportunityMatching.ts` | Opportunity relevance, deduplication, listing kind and per-kind actions |
| `shared/assessment.ts` | The rubric, the scoring ceiling, the scope, the level sources, the attempt log, the evidence stages |
| `src/components/career/MetricCard.tsx` | The metric card and its explanation popover |
| `src/components/career/CareerJourneyStepper.tsx` | The compact five-stage journey |
| `supabase/migrations/20261120000001_target_opportunity_and_headline.sql` | `profiles.target_opportunity_type` (nullable, CHECK-constrained; NULL is read as "both") |
| `tests/identity.test.ts`, `tests/career-metrics.test.ts`, `tests/roadmap-gap-sync.test.ts`, `tests/interview-readiness.test.ts`, `tests/cv-canonical.test.ts`, `tests/learning-access.test.ts`, `tests/opportunity-matching.test.ts`, `tests/career-identity-opportunity.test.ts`, `tests/assessment.test.ts`, `tests/assessment-visuals.test.ts`, `tests/functional-flows.test.ts` | The new suites, all registered in `tests/runner.mjs` |

`tests/cv-projection.test.ts` was extended with seven canonicalization cases.

The migration reuses the existing `profiles.headline` column as the professional
headline rather than adding a redundant one; `target_opportunity_type` is the only
column added. NULL means "not chosen" and is read as "both", so it never narrows a
search or claims an unstated preference.

---

## 8. Production deployment

**Deployed.** `npm run cf:deploy` (`npm run build` + `wrangler pages deploy dist
--project-name careerdev4ai --branch main`).

| | |
| --- | --- |
| Deployment id | `79ae2c29-8ffe-48a6-a030-58bf0b1b1cf0` |
| Environment | Production, branch `main` |
| Deployment URL | <https://79ae2c29.careerdev4ai.pages.dev> |
| Production alias | <https://careerdev4ai.pages.dev> |
| Source commit | `97052d5` (the working tree carries the uncommitted changes of this remediation) |
| Build | `dist/` + `dist/_worker.js` (4.20 MiB); bundle-auth check passed (4 sign-in methods carried) |

### The database was already in place

The production Pages project and the test environment resolve to the **same**
Supabase project (`ciihprsfdojzvjnqgbxl`) — `.env`, `.env.test` and the
`supabase-local` MCP target all point at it — so the migration
`20261120000001_target_opportunity_and_headline.sql` was already applied to the
production database before the deploy. `information_schema` confirms
`profiles.target_opportunity_type` (text, nullable) next to `headline` and
`expected_graduation_year`.

All thirteen Pages secrets are present and encrypted (including
`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY` and the
GA4 credentials), and the three plain-text variables in `wrangler.jsonc` match
the `.env` values, so the deploy cleared nothing.

### Post-deployment verification

| Check | Result |
| --- | --- |
| `GET /api/health` on the production alias | `status: ok`, model configured (Gemini + OpenRouter) |
| The production alias serves the new bundle | HTML references `/assets/index-AfbB3RAA.js` — the same entry chunk the local build produced |
| `scripts/probe-career-target-production.mjs` against the live site | **All 19 checks PASS** — a new account has no invented target role, the role, track and experience level are stored and re-read, the database holds them, an invalid level is refused with 400 and the stored value is left alone |
| A production probe of the two new profile fields | **All 10 checks PASS** — a new account states no opportunity type; `internship` and `full_time_entry` are accepted, stored and re-read; the professional headline round-trips; the database holds both; an unknown opportunity type is refused with 400 and does not overwrite the stored value |

Both probes create a real account, exercise it, and remove it afterwards.

### Note on the previous deployment

The deployment immediately before this one (`ce0f7317`, same source commit `97052d5`)
is recorded by Cloudflare with the status **Failure**, which is why the live site was
still serving the older commit `aa2ded2` when this pass began. The deploy run here
succeeded on the first attempt; the earlier failure was not reproduced.
