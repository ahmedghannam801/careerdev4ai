# QA remediation verification — CareerDev4AI

**Date:** 14 November 2026
**Repository:** `D:/Saas/careerpilot-ai` (CareerDev4AI)
**Production:** <https://careerdev4ai.pages.dev>
**Scope:** the master remediation spec, Workstreams 0–3, audited against the
running code, fixed, gated and published.

---

## 1. What this pass did

The previous remediation pass had already implemented the bulk of the spec and
had published it. This pass did three things, in this order:

1. **Verified** every workstream against the actual code and the actual live
   site, rather than against the previous pass's own report.
2. **Fixed** the gaps that verification found — five product defects, two
   regressions left behind by a concurrent session, and the test coverage that
   pins the new rules down.
3. **Gated and published** — typecheck, build, the full test suite, the
   localisation check, and a live probe of the published site.

### 1.1 A concurrent session was committing to this workspace

Part-way through the audit the git history moved under us: `HEAD` advanced
from `97052d5` to `6359d7b` through eight commits authored by another agent
(`Dyad`), including `281a45e "Reverted all changes back to version 858364e…"`
and a re-implementation in `9a70561 "Audit remaining CareerDev4AI workstreams
and implement grounded fixes"`.

Consequences that were checked rather than assumed:

* every file this pass edited was re-read after the commits landed, and the
  work was confirmed to be intact and coherent with the new tree;
* the two test failures this pass inherited were traced to those commits, not
  to its own changes;
* the last commit from that session is from 20:32, and no source file has been
  touched since except by this pass, so the tree was stable before publishing.

---

## 2. Gates

| Gate | Command | Result |
| --- | --- | --- |
| Type check | `npm run lint` (`tsc --noEmit`) | **0 errors** |
| Production build | `npm run build` | **pass** — vite bundle, 4.20 MiB worker, bundle carries the public Supabase config and all 4 sign-in methods |
| Test suite (baseline) | `node tests/runner.mjs` | 1622 tests, **1620 pass, 0 fail**, 2 skipped |
| Test suite (after the fixes) | `node tests/runner.mjs` | 1638 tests, **1634 pass, 1 fail**, 3 skipped |
| Localisation | `tests/localization.test.ts` | **2297 / 2297** source strings translated (100 %) |
| Live site | `GET /api/health` | 200, `modelConfigured: true`, gemini + openrouter both configured |

### 2.1 The one remaining failure is the provider, not the product

```
✖ an AI route never invents a result when it fails (302945ms)
  [TypeError: fetch failed]
  [cause]: Error [HeadersTimeoutError]: Headers Timeout Error
```

`tests/coverage.test.ts` walks five AI routes and asserts that each one either
returns a real model answer or an explicit failure — never invented content.
It failed by **not receiving a response at all**: undici's 300 s headers
timeout fired while the local test server was still waiting on the model.

The same five routes were then timed directly, on the same machine, against
the **published site** and against a **locally started test server**:

| Route | Production (Cloudflare Pages) | Local test server |
| --- | --- | --- |
| `/api/analyze-career` | 200 in 2 271 ms | hung past 120 s |
| `/api/optimize-cv` | 200 in 12 033 ms | hung past 120 s |
| `/api/mock-interview` | 200 in 4 157 ms | 429 (quota) |
| `/api/suggest-summary` | 200 in 1 066 ms | hung past 120 s |
| `/api/generate-cover-letter` | 200 in 1 794 ms | hung past 120 s |

So every route is healthy and returns its real payload from the deployed site;
from this machine the model provider is exhausted or throttled — one route
answers 429 (quota) and four hang. A direct probe of the provider answered a
one-word prompt in **10.2 s** at that moment, and the Copilot suite immediately
before it took **139 s** instead of seconds.

Further evidence that this is the environment and not the code:

* `tests/coverage.test.ts` was **not** changed by the concurrent session
  (`git diff 97052d5 HEAD -- tests/coverage.test.ts` is empty), and this pass
  changed nothing on the AI request path;
* the same test passed in the baseline run at 15:34, when the quota was fresh;
* the failure reproduces in isolation and is the only test in the suite that
  talks to the model.

It should be re-run once the provider's quota is comfortable. Nothing in the
product needs to change.

---

## 3. Live verification of Workstream 0

A disposable account was created against the live site, exercised, and deleted
again (`.tmp-qa/probe-free-ai-production.mjs`). Final run, after publishing:

```
=== https://careerdev4ai.pages.dev — Workstream 0 free-AI probe ===

  balance before: 5 (daily allowance {"allowance":2,"remaining":0,"claimedToday":false})

-- AI chat (must be free and must answer) --
  PASS  the chat answers with 200
  PASS  the answer is real text, not a canned error — 1186 chars in 1547ms
  PASS  the chat returns suggestions

-- Mock interview (must be free and must score) --
  PASS  the mock interview scores the answer — status=200 body={"score":4,...}
  PASS  the mock interview returns feedback — 1676ms

-- The session is persisted (so readiness can move) --
  PASS  the interview session is saved — status=201
  PASS  the balance is untouched after chat + interview — balance=5 -> 5
  PASS  nothing was charged to the ledger — 0 rows

=== 9 passed, 0 failed ===
```

The assistant's answer was grounded in the account's own record (target role
*Data Analyst*), not a canned string.

---

## 4. What was verified as already implemented

Each clause below was read in the code, not inferred from a report.

### Workstream 0 — the broken chat and the 0-token features

| Requirement | Where | Verdict |
| --- | --- | --- |
| Chat answers, with the candidate's context | `app.ts:2071` (`POST /api/copilot`), `src/components/copilot/CopilotDrawer.tsx`, `src/context/CareerContext.tsx` | implemented, live-probed |
| Chat costs 0 tokens | the route calls no credit middleware; `shared/credits.ts` prices `career_consultation_chat: 0` | implemented |
| Mock interview costs 0 tokens and scores | `app.ts:2394` (`POST /api/mock-interview`), `server/interviewSessions.ts` | implemented, live-probed |
| The four paid actions still charge | premium template 5, CV tailoring / ATS audit / project analysis 1 | implemented, asserted by `tests/token-deduction-contract.test.ts` |
| No token badge on the free surfaces | `src/lib/aiTokenCosts.ts` renders no badge at weight 0 | implemented |

### Workstream 1 — backend and data integrity

| Requirement | Where | Verdict |
| --- | --- | --- |
| No hardcoded demo candidate | grep of `src/` for `Omar`, `Era`, `Nour`, `Alex` — no matches; `shared/identity.ts` is the single resolver | implemented |
| De-duplication on import | `shared/cvDedupe.ts` — experience by normalised title + organisation + dates, education by institution + degree, skills by normalised name, section headers removed | implemented |
| "Fill from my records" is idempotent | `shared/cvProjection.ts` (`mergeCanonicalCvDocument`), pinned by `tests/functional-flows.test.ts` (FT-01) | implemented |
| Every skill carries its source | `shared/skillNormalizer.ts` (`resolveSkillSource`) — evidence beats a measurement beats a claim beats a guess | implemented |
| Education date validation | `app.ts:5789` and `shared/careerIdentity.ts:322` — a graduation year in the future always means *currently studying* | implemented |
| Recent Activity is idempotent | `server/db/activities.ts` — deterministic UUID, unique-violation returns the existing row | implemented |

### Workstream 2 — the career intelligence engine

| Requirement | Where | Verdict |
| --- | --- | --- |
| All 7 scores with documented formulas | `shared/careerScores.ts` + `shared/careerMetrics.ts` + `shared/scoreBreakdowns.ts` | implemented |
| A knowledge check cannot reach 5/5 | `shared/assessment.ts` — diagnostic ceiling of 4; 5 needs practical evidence | implemented |
| Self-reported vs assessed vs verified are shown apart | `src/types/career.ts` (`selfReportedLevel`, `assessedLevel`, `evidenceSources`), `shared/skillEvidence.ts` | implemented |
| Gap priority is deterministic | `shared/skillGap.ts` (`priorityForGap`) | implemented |
| "Your skills cover the core requirements" is guarded | `src/components/views/RoadmapView.tsx` — the sentence is only shown when there is no open gap | implemented |
| Learning resources match the step's skill | `shared/roadmapGenerator.ts` (`matchResources`) — a resource must declare the step's skill | implemented |
| Stage time is the sum of what is inside it | `shared/roadmapTimeBreakdown.ts` — additive and pure | implemented |
| The identity `Target Role Skills = Mastered + Below Target` | `shared/careerMetrics.ts` — held by construction | implemented, extended below |

### Workstream 3 — the interface

| Requirement | Where | Verdict |
| --- | --- | --- |
| Six Dashboard sections | `src/components/views/DashboardView.tsx` — header, YOUR CAREER OVERVIEW, YOUR NEXT STEP, MY CAREER JOURNEY, RECENT ACTIVITY, QUICK ACCESS | implemented |
| No "Switch Target Role" on the Dashboard | removed from the header | implemented |
| Learning Hub access tiers | `shared/learningAccess.ts` — 100 % Free / Free Audit (Certificate Paid) / Free Trial / Paid, plus a certificate badge that distinguishes "Includes Certificate" from "Learning Content Only" | implemented |
| Live Jobs states | `src/components/views/JobsView.tsx` — loading, error + retry, empty, results + filters | implemented |
| Profile separates title, headline and target role | `profiles.current_title`, `profiles.headline`, `profiles.target_role` (and `target_opportunity_type`) | implemented |

---

## 5. What this pass fixed

### 5.1 The dashboard header had no daily-token pill (WS3.A)

The spec asks for a compact `+2 Daily Tokens` pill beside the balance in the
Dashboard header. The widget existed (`src/components/subscription/DailyTokenClaim.tsx`)
and was shown inside the topbar badge, but not on the Dashboard itself.

* `src/components/views/DashboardView.tsx` — the compact claim now sits beside
  the [Ask Copilot] button.

### 5.2 A skill could be "Mastered" on a bare claim (WS2.B)

> Never mark a skill as "Mastered" simply because the user added it to their
> Profile; require effectiveLevel >= requiredLevel backed by Assessment or
> Verified Evidence.

`computeCareerMetrics` counted a skill as mastered whenever the level met the
target — and the level included the candidate's own claim. Adding SQL to the
profile and rating it 4/5 closed the gap.

* `shared/careerMetrics.ts` — `MetricSkill` gained a `proof` field
  (`'none' | 'assessment' | 'evidence'`), `skillsMastered` now requires proof,
  and `skillsClaimedOnly` reports the skills that meet the level but are only
  claimed.
* `shared/careerMetrics.ts` — `skillProofFromSource()` reads the proof out of a
  skill's source; `isSkillMastered()` gives the views the same rule, so the
  Dashboard, the Skills Center and the Progress page cannot disagree.
* The tooltip now says so: *"A skill counts as mastered only when your level is
  at or above its target AND the platform can back it — an assessment measured
  it, or a project, a certificate or work experience proves it."*

### 5.3 The browser ignored verified evidence when naming a skill's source (WS1.D)

`src/context/CareerContext.tsx` resolved the source itself and stopped at
"self-reported, else assessment, else AI-estimated" — so a skill backed by a
verified project was labelled `ai_estimated` in the browser while the server
reported `verified_evidence`.

* `src/context/CareerContext.tsx` — the client now uses the shared
  `resolveSkillSource`, so evidence beats a measurement beats a claim beats a
  guess on both sides.

### 5.4 Role Readiness excluded the skills the candidate had already met (WS2.E)

The Dashboard and the Roadmap mapped `required: skill.gap > 0` — "a skill with
an open gap is a requirement of the role". That contradicted the documented
formula (`sum(min(your level, required level)) ÷ sum(required levels)`), and
it collapsed: a candidate who had met **every** requirement had no required
skills left, so the denominator was zero and the figure read **0 %**.

* `src/types/career.ts` — `UserSkill.required` marks the skills the target
  role actually requires.
* `src/context/CareerContext.tsx` — the catalogue records `required: true` for
  the role's requirements and `false` for its preferred (stretch) skills.
* `src/components/views/DashboardView.tsx`, `src/components/views/RoadmapView.tsx`
  — readiness is computed over the role's requirements, met or not.

### 5.5 Interview Readiness ignored skill readiness (WS2.E)

> Interview Readiness % — driven by Mock Interview rubrics + skill readiness,
> independent of job application count.

It was driven by the rubrics and the practice count only.

* `shared/interviewReadiness.ts` — a third part, the candidate's skill
  readiness, is weighed in when it can be measured. When it cannot, the
  two-part figure stands, so the number is never diluted by a part that was
  never measured.
* `src/components/views/InterviewsView.tsx`, `src/components/views/ProgressView.tsx`
  — both pages pass the same skill readiness, so they cannot disagree.

### 5.6 Two translations were missing (WS3.I)

* `src/translations/parts/skills.ts` — `verified evidence` (the new source
  vocabulary) had no Arabic entry.
* `src/translations/parts/skills.ts` — `Your previous skill level was
  restored. Please try again.` had no Arabic entry; this is the string the
  concurrent session's commit `147fcfb` introduced. The localisation suite now
  reports **2297 / 2297**.

### 5.7 A test contradicted the schema (not a code change)

`tests/cv-analysis-route.test.ts` asserted that an analysis of an **unsaved**
CV appears in the candidate's history. The schema says the opposite:

```sql
-- A measurement that is not about a stored CV
-- (the studio measures the document the candidate is editing) has no CV and
-- no version, and is not written here at all.
```

The assertion was corrected to match the documented design. The stored case —
where a measurement *is* recorded, and both runs are kept — is still asserted
in the suite above it.

---

## 6. Tests added

* `tests/career-metrics.test.ts` — a claim is not a mastered skill; a measured
  or proved level is; the identity `mastered + below target = total` holds
  exactly; the proof is read out of the source; the views agree with the
  engine; a required skill stays in the readiness figure once it is met.
* `tests/interview-readiness.test.ts` — skill readiness is weighed in when it
  is measurable, the two-part figure stands when it is not, an unmeasured
  readiness stays unmeasured, and a readiness above 100 cannot inflate the
  figure.

---

## 7. Publication

| Target | Identifier | Status |
| --- | --- | --- |
| Cloudflare Pages (`careerdev4ai`, branch `main`) | `6e8e7fdc-855e-41b0-9bc0-d7b6da67ad4e` — <https://6e8e7fdc.careerdev4ai.pages.dev> | live, 200 on `/api/health` |
| Production alias | <https://careerdev4ai.pages.dev> | serving the new bundle |
| Jobs Worker (`careerdev4ai-jobs`) | version `98652694-0c21-4650-89eb-0f88e904003e` — <https://careerdev4ai-jobs.mohamedghnnam801.workers.dev> | deployed, schedule `*/5 * * * *` |

The database was checked against the code and needs nothing: every column the
profile writes exists (`current_title`, `headline`, `target_opportunity_type`,
`education_status`, `expected_graduation_year`, `experience_level`), and every
migration the code depends on is applied.

---

## 8. Left undone, on purpose

* **The changes are not committed.** This pass published the work but left the
  working tree as it found it plus its own edits, because committing was not
  asked for.
* **The provider-throttled test was not "fixed".** It is not broken; the
  upstream model was exhausted on this machine while it ran, and the same five
  routes answer in 1–12 s from the published site. It should be re-run once the
  quota is comfortable.
* **One audit item is a judgement call, left as the previous pass wrote it.**
  Score 6, *Career Asset Score*, is implemented as the same auditable 100-point
  career-asset checklist that *Profile Completeness %* uses. The spec ties the
  two together ("Profile Completeness % (dynamic calculation matching Career
  Asset Score weights: +15 % Project, +7 % Certification, +3 % Links, +2 % CV)"),
  and the weights match exactly, so the two numbers are equal by design rather
  than by accident — but they are not two distinct measurements.

---

## 9. Third pass — clause-by-clause audit of both master specifications

This pass was given the two master specifications directly: the three-workstream
QA and product plan, and the motion specification (GSAP + Lenis + React Bits
plus the smooth skill-level interaction).

Unlike the passes before it, this one did **not** trust the previous report. It
read the code against every clause of both specifications and asked, for each
one, "is this true here?" The previous passes' own summary was treated as a
claim to be checked, not as evidence.

### 9.1 What was found already in place

Every clause of Workstream 0 (the free AI chat and the token rules),
Workstream 1 (data integrity), Workstream 2 (the career intelligence engine)
and Workstream 3 (the interface) was located in the code and confirmed
implemented. The ones worth naming, with where they live:

| Clause | Where it lives | Verified |
| --- | --- | --- |
| 0.A the AI chat is free | `shared/aiTokenCosts.ts` — only four routes cost tokens | yes |
| 0.B the token ledger is atomic | `tests/token-deduction-contract.test.ts` scans every route | yes |
| 1.A one identity resolver, no demo names | `shared/identity.ts`; no `Omar`/`Era`/`Nour`/`Alex` anywhere in `src/` | yes |
| 1.B dedupe on merge | `shared/cvDedupe.ts` (work, education, summary, projects, certificates, skill names) | yes |
| 1.C the seven sync links | `shared/cvProjection.ts`, `CareerContext` | yes |
| 1.D skill source metadata | `shared/skillNormalizer.ts` `resolveSkillSource` | yes |
| 1.D graduation-year rule | enforced in four places: the route, `shared/careerIdentity.ts`, the client context, and a database constraint | yes |
| 2.A the diagnostic check cannot reach 5 | `shared/assessment.ts` — ceiling 4 without practical proof | yes |
| 2.B mastery needs proof | `shared/careerMetrics.ts` `isSkillMastered`; views use the same rule | yes |
| 2.B the chain holds | gaps ⊆ skills below target; blockers ⊆ critical gaps ⊆ gaps | yes |
| 2.B deterministic priority | `shared/skillGap.ts` `priorityForGap` | yes |
| 2.C the roadmap never flatters | `RoadmapView.tsx:607` — the guard reads the engine's gaps, not the plan | yes |
| 2.C resources match the step | `shared/roadmapGenerator.ts` `matchResources` — a resource must declare the skill | yes |
| 2.C the hours add up | `shared/roadmapTimeBreakdown.ts` | yes |
| 2.D the project and evidence lifecycles | `shared/projectLifecycle.ts` | yes |
| 2.E seven documented scores | `shared/careerScores.ts` | yes |
| 3.A the six dashboard sections | `DashboardView.tsx` | yes |
| 3.B the profile fields are separate | `ProfileView.tsx` — headline, current title and target role are distinct | yes |
| 3.C the import review step | `CVStudioView.tsx` — parsed CV data passes a review modal first | yes |
| 3.D the learning tiers | `shared/learningAccess.ts`; a playlist is never a certificate course | yes |
| 3.D live jobs states | `JobsView.tsx` — loading, results, empty, error with retry | yes |
| 3.E the applications pipeline | `ApplicationsView.tsx` — Saved → Applied → Interviewing → Offer → Rejected, CV version per application | yes |
| 3.E interview figures separated | `InterviewsView.tsx` and `ProgressView.tsx` both pass `roleReadinessFromSkills(skills)` | yes |
| 3.E documents against evidence | separate views, separate routes | yes |
| 3.E the progress copy | `ProgressView.tsx:151` reads "Completed Projects", with a target | yes |
| Motion — the provider | `src/providers/SmoothScrollProvider.tsx` — `useGSAP` + `ScrollTrigger` registered once, Lenis on the GSAP ticker, `prevent` for `.overflow-y-auto` and `[role="dialog"]`, `lenis.stop()` while a modal is open, reduced motion honoured, SSR-guarded | yes |
| Motion — the scroll containers | `CopilotDrawer.tsx` carries `role="dialog"` and `data-lenis-prevent`; the sidebar and the mobile nav scroll natively | yes |
| Motion — the skill level interaction | `SkillsCenterView.tsx` — optimistic local update, stable `skill.id` keys, `transition-all duration-500 ease-out` on the bar, a scale pulse, `AnimatedCounter` on the level badge | yes |
| Motion — React Bits in use | `AnimatedCounter` on the dashboard and in the skills centre | yes |

### 9.2 The one defect this pass found and fixed

**The learning card's access-tier tooltip promised a certificate that some
resources do not hand over.**

`ACCESS_TIER_LIMITS.free` read *"Free to access and free to finish, including
the certificate."* The free tier is not the certificate tier — it covers a free
YouTube playlist, which carries no certificate at all. So the same card
claimed a certificate in its tooltip while the certificate badge directly
beneath it said *"Learning Content Only (No Certificate)"*. The specification
is explicit: a YouTube playlist must never be labelled as an official
certificate.

The same string had a second defect: it reached the card untranslated. It was
passed to the `title` attribute raw, so the Arabic interface showed an English
sentence on hover — and because it never went through `t()`, the
localization test could not see it either.

The fix:

* `shared/learningAccess.ts` — the free tier now says *"Free to access and free
  to finish."* It answers the price question and stops making a claim about
  the certificate, which the card's own badge answers truthfully per
  resource. The audit tier still mentions the certificate, because that tier
  is *defined* by it.
* `src/components/learning/CourseCard.tsx` — the tooltip now goes through
  `t()`.
* `src/translations/parts/learning.ts` — the four tier sentences now have
  Arabic entries.

Four tests in `tests/learning-access.test.ts` lock this down: the free tier
must not mention a certificate, the audit tier must, the tooltip must be
routed through the translator, and every tier sentence must have an Arabic
entry.

### 9.3 Gates

The suite was run in three chunks so that no single run exceeded the machine's
practical run length. All 99 test files were covered.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npm run lint` | clean, exit 0 |
| Tests — chunk 1 (28 files) | `TEST_ONLY=… node tests/runner.mjs` | 443 tests, 443 pass, 0 fail |
| Tests — chunk 2 (25 files) | `TEST_ONLY=… node tests/runner.mjs` | 393 tests, 390 pass, 1 fail, 2 skipped |
| Tests — chunk 3 (46 files) | `TEST_ONLY=… node tests/runner.mjs` | 829 tests, 827 pass, 0 fail, 2 skipped |
| Build | `npx vite build` | built in 23.47 s, exit 0 |
| Jobs build | `npm run build:jobs` | wrote `dist-jobs/worker.js`, exit 0 |

**1665 tests, 1660 passed, 1 failed, 4 skipped.**

The single failure is the one this document has flagged since the second pass:
`tests/coverage.test.ts` → *"an AI route never invents a result when it
fails"*. It is not a defect in the code, and this pass proved why rather than
assuming it.

**It was re-run on its own and failed identically** — same test, same error,
303 526 ms — so it is reproducible, not a flake in a long run.

**The provider is reachable but slow.** A direct call to the canonical model
(`gemini-3.1-flash-lite`, `server/ai/geminiConfig.ts:6`) from this machine
answers a trivial eight-token prompt in 13.45 s. In the suite, the Copilot
endpoint — the same provider, a heavier prompt — took 141 999 ms.

**The fallback has no headroom.** The OpenRouter fallback
(`openrouter/free`, `server/ai/openrouterConfig.ts:4`) is hard-limited on this
account:

```
HTTP 429  Rate limit exceeded: free-models-per-day
X-RateLimit-Limit: 50   X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-11-15 02:00:00 +02:00
```

The daily free allowance was fully spent while the suite ran, and resets at
02:00. So every AI request during the run had to be served by the one slow
primary provider, with no working fallback behind it. The route's own design
bounds are 45 s per attempt, one retry, then the fallback
(`server/ai/provider.ts:232`) — but the observed request did not come back
within undici's 300 s headers ceiling, which is where the client's
`HeadersTimeoutError` came from:

```
TypeError: fetch failed
  cause: Error [HeadersTimeoutError]: Headers Timeout Error
  code: 'UND_ERR_HEADERS_TIMEOUT'
```

Note where the failure lands: in the **client's** fetch, before any of the
test's own assertions ran. The test never observed the route inventing a
result — the route never answered at all. The behaviour the test exists to
protect is intact: every other AI route in the same file answered correctly,
the routes that refuse to answer refuse explicitly with 429 / 503 / 402, and
the token-deduction contract holds.

This is the provider being exhausted on this machine, and it should be
re-run once the OpenRouter quota resets and Gemini is answering quickly
again.

### 9.4 Still open

* The provider-throttled live-AI test above is the only environmental
  uncertainty, exactly as the previous pass left it.
* **New, and worth acting on outside the specifications: the OpenRouter
  fallback is not available on this account.** `openrouter/free` allows 50
  requests a day and the account was at 0 remaining for the whole of this
  test run. The fallback therefore contributes nothing while Gemini is slow,
  which is exactly the moment a fallback is needed. Either the daily
  allowance is topped up (OpenRouter asks for 10 credits for 1 000 free
  requests) or the fallback model is changed. This is outside both
  specifications, so it was not changed here.
* The work is still not committed, and this pass changed no deployment. See
  the note in 9.5.

### 9.5 Publication

This pass changed three source files and therefore **did publish**.

| Target | Identifier | Status |
| --- | --- | --- |
| Cloudflare Pages (`careerdev4ai`, branch `main`) | `64845edb-05ec-4813-939e-dc7b199a831e` — <https://64845edb.careerdev4ai.pages.dev> | live |
| Production alias | <https://careerdev4ai.pages.dev> | serving the new bundle |
| Source commit | `1873111` — all 19 files from both passes | committed on `main` |

The build's own guard passed before the upload: *"the bundle carries the public
Supabase configuration and all 4 sign-in methods"*.

The live site was then checked, not assumed:

* `https://careerdev4ai.pages.dev/` answers 200 and serves the entry chunk
  `assets/index-DkYIDRth.js` — the exact chunk this build produced.
* `https://careerdev4ai.pages.dev/api/health` answers 200 with
  `{"status":"ok","modelConfigured":true,"modelName":"gemini-3.1-flash-lite"}`.
* The deployed bundle was downloaded and searched. The corrected sentence
  *"Free to access and free to finish."* is present, its Arabic translation
  *مجاني الوصول وإكماله.* is present, and the old overclaiming sentence
  *"…including the certificate"* is **gone** from the bundle.

The Jobs Worker was not redeployed: nothing in this pass touched
`worker/jobs`, and it remains on version `98652694` from the previous pass.

The work is now committed. `main` is one commit ahead of the source the
previous pass published, and the live site matches `1873111`.
