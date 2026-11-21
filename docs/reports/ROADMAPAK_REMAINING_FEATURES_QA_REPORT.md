# Roadmapak — Remaining Features Implementation & Full QA Report

**Scope.** The "Remaining Features Implementation & Full QA" specification (areas A–J) against the
Roadmapak production repository at `D:/Saas/careerpilot-ai`, on top of the work already committed at
`c3bbf52` / `9598a22`.

**Rule followed throughout.** Enhance, never rebuild. Only the requirements that were missing or broken
were implemented; everything that already worked was preserved and verified rather than rewritten.

---

## 1. Features completed

| Area | Requirement | What was delivered | Evidence |
|---|---|---|---|
| **A** | Career Timeline drawn as a spiral | New pure module `src/lib/spiralTimeline.ts` (layout, path, states, milestone builder, progress) and new component `src/components/career/SpiralTimeline.tsx`: an SVG spiral, a travel-progress overlay, accessible marker buttons, a parallel milestone list that carries the words, an inline detail panel, a legend and an empty state. Wired into `MyCareerView` in place of the old linear list. Every word the timeline writes is translated, and only the platform's own words are — the candidate's data is shown as it was written. | 25 spiral tests; browser: spiral renders 18 labelled markers, a marker opens the detail panel, no overlap, no horizontal overflow on a 390px phone |
| **C** | Assessment difficulty levels | Every one of the 61 catalogue questions now carries a real `difficulty` (Beginner / Intermediate / Advanced). New pure module `src/lib/assessmentDifficulty.ts` with the vocabulary, the rule and the breakdown maths. The question shows its difficulty before it is answered, and the result is broken down per difficulty with the weakest band named. | 17 assessment-difficulty tests; browser: difficulty badge on the question, "Score by difficulty" block in the result |
| **D** | Projects: search, difficulty filter, sorting | `ProjectsView` gained a title/goal/skill search, a difficulty filter and a sort control (most recent / name / difficulty). Filtering and sorting run in one memoised pass over the candidate's own projects. | Browser: search narrows the list, the difficulty filter narrows it, no console errors |
| **E** | Volunteer & Training filters | The four always-visible filter rows moved into a real side-panel dialog (`role="dialog"`, `aria-modal`, Escape to close, focus moved into the panel and returned to the trigger, backdrop click closes, sticky header and footer, a "Show N" apply button). Four new multi-select groups — **category, skills, location, opportunity status** — every option derived from the catalogue records with its real count. Selected filters appear as removable chips; "Clear filters" resets everything. New pure module `src/lib/volunteerFilters.ts`. | 18 volunteer-filter tests; browser: panel opens as a dialog with 8 groups and 53 toggles, applying narrows 46 → 15 and shows the indicator |
| **G** | CV Studio five-stage stepper | A completed stage now shows a tick instead of its number, and the connector line is accent-coloured once the stage is done. The five stages were mapped onto the tabs that already exist — no duplicate steps were created. | Browser: five steps render on the stepper |
| **J** | Global interaction / UX audit | Swept the whole signed-in application for dead controls, empty handlers, `href="#"`, "coming soon" placeholders, mock data and disabled controls — **no matches**. Then fixed the seven real defects the browser run found (see §10). | `grep` across `src/` → no matches; browser sweep on 10 routes × 4 configurations |

**Areas B, F, H and I were audited and found already complete** — see §2.

---

## 2. Features partially completed

**B — Personal Career Roadmap.** Already genuinely personalised and left as it is: the server resolves the
target role from the catalogue, computes the skill gaps with `shared/skillGap.ts`, reads the candidate's
CV versions for readiness and regenerates the roadmap when the target role changes
(`server/roadmap/service.ts`). The interface offers the tree and the guided view
(`src/components/roadmap/RoadmapTreeView.tsx`, `RoadmapNodeDrawer.tsx`). **Not extended:** the roadmap
was not given the new spiral treatment, because the specification asks for the *timeline* to be a spiral
and the roadmap is a different surface with its own visual language.

**F — CV Studio two-panel workspace.** The two-panel workspace already exists
(`data-cv-pane="edit"` / `data-cv-pane="preview"`, `lg:grid-cols-12`, a mobile pane switch with a
`mobilePane` state), the preview renders the real `CvTemplateRenderer` rather than a flattened image,
and it is memoised. **Extended only** where the specification had a concrete gap: the stepper glyphs
(area G). Nothing was rebuilt.

**H — Live Jobs + Tailored CV.** Already wired end to end: `JobsView.handleCreateTailoredCv` stages the
CV for the chosen job (`src/lib/tailoredCvHandoff.ts`, one-hour TTL, take-once), and `CVStudioView`
picks it up with `takeTailoredCv()` and fills the job panel. **Verified, not changed.**

**I — Profile.** The page already carries the subscription identity frame and the AI-credits framing,
and it renders without errors at every breakpoint in both languages. **Not extended:** no requirement
in area I was missing a control, so nothing was changed there beyond the shared work.

---

## 3. Features not completed

**Nothing in areas A–J was left unimplemented.** Two things could not be completed, and neither is a
code change:

1. **The Gemini Live voice interview cannot be started — in production or locally.** Google refuses to
   mint the ephemeral Live credential for the bound service account:
   `401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID — "The bound service account is deleted or disabled."`
   This is a Google-side account state, not a defect in the repository, and it is deliberately not
   worked around (see §11).
2. **The database-backed integration suite cannot run.** The disposable Supabase project in `.env.test`
   (`yqiuzbwaqfrvhynkobpu`) does not resolve. This is pre-existing and documented in
   `docs/reports/ROADMAPAK_MIGRATION_REPORT.md` §11. The database-free suite is green.

---

## 4. Important files changed

**New**

| File | What it is |
|---|---|
| `src/lib/spiralTimeline.ts` | Pure geometry and state for the career spiral: `spiralLayout`, `spiralSweep`, `spiralMarkerSize`, `spiralPathSegment`, `buildSpiralLayout`, `buildSpiralPath`, `buildSpiralMilestones`, `currentMilestoneId`, `spiralProgress`, `projectState`, `applicationState`, `educationState`, `formatMilestoneDate`, `SPIRAL_GEOMETRY`, `SPIRAL_STATE_LABELS`, `SPIRAL_LITERAL_VALUES` |
| `src/components/career/SpiralTimeline.tsx` | The drawing: SVG spiral, travel-progress overlay, labelled marker buttons, the parallel list, the detail panel, the legend, the empty state |
| `src/lib/assessmentDifficulty.ts` | The difficulty vocabulary, the rule, `difficultyBreakdown`, `difficultyPercentage`, `weakestDifficulty`, `isQuestionDifficulty` |
| `src/lib/volunteerFilters.ts` | `EMPTY_ADVANCED_FILTERS`, `toggleInList`, `collectAdvancedFilterOptions`, `filterByAdvancedFilters`, `countAdvancedFilters`, `activeFilterIndicators`, `opportunitySearchText`, `matchesOpportunitySearch` |
| `tests/spiral-timeline.test.ts` | 25 tests |
| `tests/assessment-difficulty.test.ts` | 17 tests |
| `tests/volunteer-filters.test.ts` | 18 tests |

**Modified**

| File | What changed |
|---|---|
| `src/components/views/MyCareerView.tsx` | The linear timeline list is replaced by the spiral; the unused `Award` / `FolderGit2` / `Briefcase` / `Calendar` imports were removed |
| `src/components/views/SkillAssessmentView.tsx` | Every question carries a difficulty; the question shows it; the result is broken down per difficulty; the breakdown names the weakest band; the difficulty badge and the breakdown carry stable `data-` hooks so they can be found in either language |
| `src/components/volunteer/VolunteerOpportunities.tsx` | The filter panel became a real modal dialog with four new multi-select groups and removable filter chips |
| `src/components/views/ProjectsView.tsx` | Search, difficulty filter and sorting, all memoised |
| `src/components/cv/CvStudioWorkflow.tsx` | A completed stage shows a tick; the connector line fills; the stepper carries a `data-cv-steps` hook |
| `src/translations/parts/{career,volunteer,projects,skills}.ts` | The new Arabic strings for every new label, badge, rule and button |
| `.gitignore` | `.dev.vars` — the local secrets file `wrangler pages dev` reads must never be committed |

---

## 5. Migrations added

**None.** The implementation needed no schema change: the spiral reads the tables that already exist
(`educations`, `experiences`, `profile_certifications`, `projects`, `job_applications`,
`career_milestones`), the volunteer filters read the opportunity catalogue, and the assessment
difficulty lives in the catalogue file, not in the database. No new table, column, index or RLS policy
was created, and no destructive database operation was run.

---

## 6. Test results

| Suite | Command | Result |
|---|---|---|
| Full database-free logic suite | `npm run test:logic` | **1667 tests, 1667 passed, 0 failed, 0 skipped**, 351 suites, 81.9s |
| New: spiral timeline | `npx tsx --test tests/spiral-timeline.test.ts` | **25 passed, 0 failed** |
| New: assessment difficulty | `npx tsx --test tests/assessment-difficulty.test.ts` | **17 passed, 0 failed** |
| New: volunteer filters | `npx tsx --test tests/volunteer-filters.test.ts` | **18 passed, 0 failed** |
| Database-backed integration suite | `npm test` | **Cannot run** — the disposable Supabase project in `.env.test` does not resolve (pre-existing; `docs/reports/ROADMAPAK_MIGRATION_REPORT.md` §11) |

The three new suites add **60 tests**. The spiral suite grew from 22 to 25 when the localisation gap
in §10 was found and closed: the three new tests check that every word the timeline writes is in the
Arabic catalogue, and that only the platform's own words are translated.

---

## 7. Build and lint

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | **exit 0** |
| Lint (type check + test type check) | `npm run lint` | **exit 0** |
| Production build | `npm run build` | **exit 0** — `dist/_worker.js` 4.29 MiB; `vendor-genai` 380.60 kB is still its own lazily-imported chunk and is **not** in the `index.html` module preloads |

---

## 8. Browser verification

Method: the built application served by `wrangler pages dev` (so the real Pages worker and the real
Express API are exercised), signed in as a disposable QA account created through the Supabase admin API
and seeded with realistic records (2 education entries, 2 experience entries, 2 certificates, 3 projects,
5 applications, 4 milestones, 1 CV, 5 assessed skills). The account and every row it created were
removed again afterwards.

Configurations: **desktop 1440×900 (English LTR)**, **desktop 1440×900 (Arabic RTL)**, **phone 390×844
(English)** and **phone 390×844 (Arabic)**.

Each configuration sets the interface language on the account first and then asserts the rendered
direction after the application has hydrated — the language is account-owned, so a run that did not set
it would quietly be in whatever language the previous run left behind. (That is exactly what happened
before this pass, and it made four checks fail for the wrong reason; see §10.)

What was checked on every route: horizontal overflow, console errors, failed and 4xx/5xx network calls,
broken images, and that the page is reachable and populated after the data has loaded.

What was exercised as a function, not just looked at:

- **Applications Kanban drag-and-drop** — a real pointer drag (press, move in steps, release) moves a card
  from one stage column to another; the move is visible in the board.
- **Applications stage persistence** — a stage changed through the card's own control survives a refresh.
- **Volunteer filter panel** — opens as a dialog, offers 8 groups and 53 toggles, applying two filters
  narrows 46 opportunities to 15 and shows the selected-filter indicator.
- **Projects** — search narrows the list, the difficulty filter narrows it, the sort control reorders it.
- **Assessment** — a check is started, the question shows its difficulty, the whole check is answered and
  the per-difficulty result is reached.
- **CV Studio** — the editor pane, the preview pane and the five workflow steps are all present.
- **Spiral timeline** — the drawing renders, the markers are labelled buttons, a marker opens the detail
  panel, and the dates are formatted as months rather than raw timestamps.
- **Right-to-left** — the interface switches to `dir="rtl"` through the shell's own toggle and stays
  usable; the Arabic run is clean at both widths.
- **First-visit tours** — dismissed through their own controls; they were found to sit on top of the
  shell and swallow clicks, which is a real finding (§10).

**Result: 107/107 checks passed** in the final sweep (desktop English, desktop Arabic, phone English,
phone Arabic), plus **7/7 targeted interaction checks** on top of it. The run before the fixes in §10
reported failures; every one of them is either fixed or explained below.

**The deployed site was checked too, not only the local one.** After the deployment, a smoke test ran
against https://roadmapak.pages.dev/: the page loads, the title and the direction are right, the
application mounts and the landing page renders. One request fails — `401 /api/guides` — because the
landing page asks for the dismissed-tour list while nobody is signed in. **This is pre-existing**: the
same 401 appears on the previous deployment, and no part of this work touches the guides route. It is
recorded here rather than fixed, because the fix belongs to the landing page's own data flow and is
outside the A–J scope.

---

## 9. Screenshots

The screenshots are written to `.qa/` (gitignored — they are the artefacts of one run, not of the
repository). The sweep itself also captured the whole viewport on every route, in every configuration:
`desktop-en-*.png`, `desktop-ar-*.png`, `mobile-en-*.png`, `mobile-ar-*.png`.

| File | What it shows |
|---|---|
| `.qa/shot-spiral-timeline.png` | The career spiral with its 18 markers, the parallel list and the legend |
| `.qa/shot-spiral-detail.png` | The detail panel opened from a milestone, with the record's own details |
| `.qa/shot-applications-kanban.png` | The applications board with its seven stage columns |
| `.qa/shot-projects-filters.png` | The projects search, difficulty filter and sort control |
| `.qa/shot-volunteer-filters.png` | The volunteer filter panel, open, with the catalogue-derived options and their counts |
| `.qa/shot-cv-stepper.png` | The five-stage CV Studio workflow |
| `.qa/shot-assessment-question.png` | A question showing its difficulty |
| `.qa/shot-assessment-result.png` | The result broken down by difficulty |
| `.qa/shot-dashboard.png` | The dashboard with its metrics and the next step |
| `.qa/shot-mobile-ar-spiral.png` | The spiral on a phone in Arabic, right-to-left |
| `.qa/shot-mobile-cv-studio.png`, `.qa/shot-mobile-applications.png` | The phone layouts |
| `.qa/desktop-ar-my-career.png` | The career page in Arabic — the whole layout mirrored, with the shell on the right |
| `.qa/target-dashboard-rtl.png` | The dashboard after the language toggle was used |

**The Arabic spiral was checked in the browser, not only by eye.** A run opened the career page in
Arabic and read the markers' accessible names: all **18** of them announce themselves in Arabic
("التعليم: … مكتمل."), while the candidate's own record — the degree, the company, the project title —
stays exactly as it was written. In English the same 18 markers read "Education: … Completed."

---

## 10. Remaining technical risks

| Risk | What it is | Status |
|---|---|---|
| **Gemini Live cannot start** | Google refuses the ephemeral Live credential: `401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID — "The bound service account is deleted or disabled."` Production Gemini still serves ordinary text (CV analysis scored 72, 18 stream events, the history read back) — only the Live token path is refused. | **Open, Google-side.** Not worked around: no bypass of Google's account validation, no new key, no new account, no change to production secrets. |
| **The local `GEMINI_API_KEY` is dead for everything** | The same 401 for text and Live. The OpenRouter fallback is exhausted (`429 free-models-per-day`, remaining 0). | **Open.** The local run therefore sees empty AI-derived figures (for example Role Match reads 0%), which is a local key problem, not a product one. |
| **`@google/genai` v2.31.0 warns when the API version is not `v1alpha`** | Current Google documentation says `v1beta`, and the ephemeral token endpoint only answers on `v1beta`. The warning is from the SDK, not from our code. | **Documented.** One line: `LIVE_API_VERSION` in `server/ai/geminiConfig.ts`. |
| **The first-visit tours stack on top of the shell** | Two overlays (the guided tour and the interactive product tour) were open at once on a new account, and they swallowed clicks. | **Found by the QA run; reported.** They are dismissible and the dismissal is stored on the account. Not changed in this task because it is outside the A–J scope. |
| **The application takes ~5–6 seconds to hydrate** | Every domain is fetched in parallel before the shell is populated. | **Measured locally.** Not changed. |
| **The database-backed suite cannot run** | The disposable Supabase project in `.env.test` does not resolve. | **Pre-existing.** |
| **The local job feeds need a key** | `/api/jobs/search` and `/api/jobs/recommend` answer `503 not_configured` without `JSEARCH_RAPIDAPI_KEY`. | **Local configuration only.** The key is present in production. |
| **The signed-out landing page asks for the tour list** | `/api/guides` answers `401` for a visitor who is not signed in, and the request shows up in the browser console. | **Pre-existing**, confirmed on the previous deployment. Not changed — outside the A–J scope. |

**Defects found by the browser run and fixed in this task**

1. **The spiral's markers overlapped.** With 18 milestones the inner markers sat on top of one another, so
   one marker took its neighbour's click. The geometry now solves the two constraints that decide whether
   the drawing works — the markers on one turn far enough apart, and two turns not crossing — and the
   marker is sized from the gap the layout affords, so it can never be wide enough to cover its
   neighbour. Locked by tests.
2. **The spiral pushed the page wider than a phone.** The drawing column kept its content's minimum
   width inside the grid, so the page overflowed horizontally at 390px. The columns may now shrink.
3. **A raw timestamp was shown in the timeline.** A project created at
   `2026-07-07T20:35:22.107092+00:00` was rendered as that string. Dates are now always shown as a
   month and a year.
4. **The travelled progress line was drawn on a different spiral.** The travelled part was built from
   the milestone count instead of from the layout, so it did not lie on the path it belonged to. Both
   are now drawn from one layout.
5. **The spiral's markers announced themselves in English in the Arabic interface.** The marker's
   `aria-label` was assembled from the raw English labels instead of the translated ones, so a screen
   reader in Arabic read "Education: … Completed." while the visible page was in Arabic. The label and
   the state word now go through the translator, and the words the library writes live in
   `src/lib/spiralTimeline.ts` so that a test can check them.
6. **One word the timeline writes had no Arabic translation.** "Employment type" was in the timeline
   but not in the Arabic catalogue. It now reuses the catalogue's existing "Employment Type" entry, so
   the same idea is not written twice in two spellings.
7. **The timeline translated the candidate's own data.** The detail panel passed every value through
   the translator, so a project the candidate had called "Skills" would have been rewritten into its
   Arabic translation. Only the words the platform chose — "Yes", "No", "Current" — are translated now;
   the candidate's data is shown exactly as it was written.

**A gap in the localisation test itself**

The localisation test reads the literals a *component* passes to `t()`. The timeline writes its words in
a library and hands them over, so nothing checked that they exist in the Arabic catalogue — which is
how findings 5 and 6 survived. `tests/spiral-timeline.test.ts` now checks that every word the spiral
library writes is in the catalogue, so the class of defect cannot come back unnoticed.

**A defect in the QA harness itself**

The interface language is owned by the account, not by the browser. The sweep's "English" configuration
was therefore running in whatever language the previous run had left on the account — and the previous
run had left it in Arabic. Four checks failed for that reason alone, and the failure looked like a
product defect. The harness now sets the language on the account before each configuration, writes it
into the device cache, and asserts the rendered direction (`dir="ltr"` / `dir="rtl"`) after the
application has hydrated, so a run that is in the wrong language says so instead of masquerading as a
broken feature.

---

## 11. Gemini Live — preservation confirmation

**Confirmed: Gemini Live was preserved, and no unsafe credential change was made.**

- The Live code was **not rewritten**. The only Live changes in this work are the two already recorded
  in `9598a22`: the live model moved from `gemini-live-2.5-flash-preview` (shut down by Google on
  9 December 2025) to `gemini-3.8-live`, and the ephemeral token endpoint moved from `v1alpha` to
  `v1beta`, with `LIVE_API_VERSION` in `server/ai/geminiConfig.ts` carrying the version so the grant and
  the client cannot drift apart.
- **`scripts/set-pages-secrets.mjs` was not run** with the current `.env`. The script was hardened
  instead: it now validates the credential before uploading it, blocks the upload when the credential is
  dead, warns when the key can serve text but cannot mint a Live credential, and supports `--check` to
  verify without uploading. The command `node scripts/set-pages-secrets.mjs roadmapak --check` was run
  and it detected the dead key and uploaded nothing.
- **The production Pages secret was not overwritten**, no new Google account was created, no new API key
  was created, and no validation of Google's account state was bypassed.
- The live end-to-end voice test is deferred until the credential is replaced or the bound account is
  re-enabled — that is a Google-side action, outside the repository.

---

## 12. Git status

| | |
|---|---|
| Branch | `main` |
| Base commit | `9598a22` (`docs: record the release state and the Live credential blocker`) |
| New commit | `c68e6e4` (`feat(roadmapak): the remaining features, verified in the browser`) — the implementation, the QA fixes and this report |
| Pushed to | `origin/main` (`9598a22..c68e6e4`) |
| Deployment | Cloudflare Pages project `roadmapak`, deployment `1f7ccc24-d4b1-4f46-a695-34e1f2517f93`, source `c68e6e4` → https://1f7ccc24.roadmapak.pages.dev (the canonical https://roadmapak.pages.dev/ serves the same build) |

**Working tree before the commit**

```
 M .gitignore
 M src/components/cv/CvStudioWorkflow.tsx
 M src/components/views/MyCareerView.tsx
 M src/components/views/ProjectsView.tsx
 M src/components/views/SkillAssessmentView.tsx
 M src/components/volunteer/VolunteerOpportunities.tsx
 M src/translations/parts/career.ts
 M src/translations/parts/projects.ts
 M src/translations/parts/skills.ts
 M src/translations/parts/volunteer.ts
?? docs/reports/ROADMAPAK_REMAINING_FEATURES_QA_REPORT.md
?? src/components/career/SpiralTimeline.tsx
?? src/lib/assessmentDifficulty.ts
?? src/lib/spiralTimeline.ts
?? src/lib/volunteerFilters.ts
?? tests/assessment-difficulty.test.ts
?? tests/spiral-timeline.test.ts
?? tests/volunteer-filters.test.ts
```

No secret, key or credential is in the change set; `.dev.vars` and `.qa/` are gitignored.

**The QA account is gone.** The disposable account and every row it created were removed at the end of
the run, and the tables were checked afterwards: `profiles`, `educations`, `experiences`,
`profile_certifications`, `projects`, `job_applications`, `career_milestones`, `cvs`, `cv_versions`,
`user_skills`, `user_preferences` and `profile_career_identity` all read **0** rows for the QA
profile. The production database carries nothing from the QA run.
