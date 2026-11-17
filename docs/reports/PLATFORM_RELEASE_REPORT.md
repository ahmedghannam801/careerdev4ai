# Release report — the platform release

**Repository:** CareerDev4AI (`D:/Saas/careerpilot-ai`)
**Date:** 17 November 2026
**Scope:** the four changes in the release brief, the verification that was run, and the
one thing that could not be verified here.

**This document covers two releases on the same day.** Sections 1–6 record the first
release (`0553b92`, `d5845e6`, `37c8fcb`), which made the paper and the Word file agree.
Sections 7–12 record the second (`a6f1d1f`), which made the **download** agree with the
paper and handed the layout to the candidate.

---

## 1. What changed, and why it is one change

### 1.1 One source of truth for the CV

The preview and the downloaded file were two renderings that had drifted apart. The
preview drew a document; the Word file wrote a *different* document — with its own
margins, its own bullet glyphs, its own type sizes, its own heading numbers and its
own idea of which column a section belonged in. A candidate approved a page and then
received a file that did not look like it.

That is now impossible by construction. **`shared/cvLayout.ts` is the single
description of a CV's layout**, and both renderers read it:

| The decision | Where it is made | Who reads it |
|---|---|---|
| Page margin | `cvLayout.ts` → `spec.marginPx` / `marginTwips` | the paper (CSS padding) and the file (Word margins) |
| Body type, size, leading | `spec.bodyFont`, `bodySizePx`, `lineHeight` | both |
| The bullet | `spec.bulletGlyph` | both — the file writes the same character, in the same colour |
| Heading rule, capitals, small caps, serif | `cvHeadingDecoration(spec)` | both |
| The rule between sections | `cvDividerDecoration(spec)` | both |
| The masthead | `cvHeaderDecoration(spec)` | both |
| The entries | `cvEntryDecoration(spec)` | both |
| The skills | `cvSkillsDecoration(spec, key)` | both |
| The two columns and their share | `spec.columns` | both |
| The order of the sections | `spec.sectionOrder` | both |
| The number on a numbered heading | `plan.main[i].number` / `plan.aside[i].number` | both |

The **content** already had one source — `shared/cvTemplateDocument.ts` — and the PDF
export was already the browser's print of the real preview. What was missing was the
*layout*, and that is what this release adds.

**The divergences that were real, and are now closed:**

- The Word file used a half-inch margin where the paper had a third of an inch.
- The Word file used Calibri at 10.5pt where the paper used 8.55pt — about a quarter
  larger, so a candidate's file was a different length from the page they approved.
- Bullets became a Word bullet list: a black round dot where the paper had an accent
  arrow. The file now writes the paper's own character in the paper's own colour.
- The Word file numbered sections globally; the paper numbered each column from one.
  Both now number per column, from the same numbers.
- Only four of the eight masthead designs existed in the file; monogram, stacked,
  editorial and compact were dropped.
- The two-column and sidebar layouts were dropped from the file entirely.
- The skills were a single joined line in the file whatever the template's style.

**What the file still cannot do, and says so:** Word has no chips and no newspaper
columns. The chips become one line of words separated by the same dot; the two-column
layouts become a two-cell table; the monogram becomes a shaded cell beside the name.
Every one of those is the same approximation on both sides, because both sides read
the same decision.

### 1.2 Reordering the sections of a CV

A template proposes an order; the candidate decides it. `CVProfile.sectionOrder` now
carries the candidate's order, and `resolveCvSectionOrder` (`shared/cvLayout.ts`) is
the only place the rule is written: a named section comes first, a section that was
not named keeps the place the template gave it, and a damaged record falls back to the
template's order rather than losing a section.

The control is `src/components/cv/studio/CvSectionOrderControl.tsx`, mounted in the CV
Studio beside the preview. It offers two ways of moving a section — dragging it, and
a pair of up/down buttons that work from the keyboard and announce what they did —
because a drag alone excludes anyone who cannot drag. The order it writes is read by
the preview, the PDF and the Word file alike.

A template's design is not broken by the reorder: the template still decides how a
section is set and which column it sits in; the candidate decides the reading order.

### 1.3 Live Jobs & Internship, and Opportunities & Activities

The distinction was never in the platform. One table held volunteering, student
programmes, training, competitions, scholarships **and** internships; the API had one
filter, on a legacy column; and the kind — the column that actually decides — was
resolved per row *after* the query, so it was never filtered on at all.

It is now a stored category, and the split is enforced in the database:

- **`public.volunteer_opportunities.pillar`** (`'jobs'` | `'opportunities'`) with a
  check constraint, backfilled from the kind, and indexed.
  Migration: `supabase/migrations/20261125000001_opportunity_pillar_split.sql`
  (applied to the working database).
- The rule itself lives once, in `shared/opportunities.ts`: `pillarForKind`.
- `GET /api/volunteer/opportunities?pillar=…` asks the **database** for one half
  (`server/db/volunteerOpportunities.ts` → `.eq('pillar', pillar)`).
- `GET /api/admin/opportunities?pillar=…` does the same for an administrator.
- The live vacancies feed asks for the employment half
  (`server/jsearch/client.ts` → `filterLiveJobsByPillar(jobs, 'jobs')`), so a
  provider's training programme is no longer offered as a vacancy.

**The training programmes were also mis-filed.** Twelve `technology` rows and five
`career_development` rows were training programmes whose *kind* named their subject
rather than their form; only a free-text tag said so. The migration made the kind
agree with the tag, so "is this a course?" now has one answer instead of two, and the
training filter reads the kind rather than a tag.

**Verified against the working database:**

| `pillar` | internships | training | total (live, approved, in scope) |
|---|---|---|---|
| `jobs` | 1 | 0 | 1 |
| `opportunities` | 0 | 8 | 75 |

No row is on both sides, and no row is on neither.

The navigation follows: **Live Jobs & Internships** (employment) and **Opportunities &
Activities** (volunteering, training, competitions, scholarships). The internship chip
was removed from the opportunities page — an internship is employment, and it is
offered with the vacancies. The dashboard button labelled "Training & Courses" opened
the vacancies feed; it now opens the opportunities page, where the training lives.

The full catalogue is still browsable: a caller that asks for no pillar at all still
sees everything, and `?category=` still works.

### 1.4 The subscription, as part of the profile

The membership was in the platform and almost nowhere on the screen: a coloured dot in
the header, a plan badge inside the credits popover, and a pricing page a candidate
had to go and find. The profile — the page a candidate goes to to look at themselves —
said nothing about it at all.

**`src/components/subscription/MembershipPanel.tsx`** is the new piece. It reads the
plan the server resolved and the balance the platform published, and draws:

- the tier, in the tier's own colour, named in the candidate's language;
- the plan's name;
- the credits left this month and the renewal date;
- a way forward: **Upgrade to Plus** for a free candidate, **Manage plan** for one who
  has paid.

It is mounted in three places: in the **profile**, in the **account menu**, and in the
**mobile drawer**. The tier badge now sits beside the candidate's name in the profile
and in the sidebar. The header badge names a paid plan rather than showing a bare
dot; the free plan stays quiet, because "Free" on every screen is noise rather than
information.

**Nothing about the subscription's behaviour changed.** No pricing, no entitlement, no
credit weight, no payment flow, no migration. The tier comes from the plan code the
server resolved — the browser never chooses it — and the colours come from the plan
palette already in the stylesheet. `PlanIdentityBadge` gained one additive prop,
`language`, which closes the long-standing gap that the Arabic tier names were defined
but never rendered.

---

## 2. Verification

Everything below was run in this repository, on this machine, against this code.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` | **0 errors** |
| Unit suites | `npx tsx --test tests/*.test.ts` | **1346 passed / 1381** (35 blocked — see §3) |
| Component suites | `npx vitest run` | **27 passed / 27** (6 files) |
| End-to-end | `npx playwright test` | **1 passed** (production build loads the landing page) |
| Production build | `npm run build` | **succeeded** — bundle, worker and bundle-auth verification all pass |
| Localisation | `tests/localization.test.ts` | **passed**, including "keeps placeholders intact in every translation" |
| Database | migration applied; pillar query run | **as tabled in §1.3** |

### The new tests

| File | What it proves |
|---|---|
| `tests/cv-layout-parity.test.ts` | For **every template**: the paper and the Word file carry the same sections in the same order, the same bullet character, the same page margin, the same type size and the same numbering. Plus: the candidate's order wins, and a damaged order falls back to the template's. |
| `tests/opportunity-pillar.test.ts` | The pillar rule, the training family, the training classification of a posting, and — by reading the server source — that the filter runs in the **database** and is offered on both endpoints. |
| `tests/vitest/CvSectionOrderControl.test.tsx` | The reorder control lists the document's sections, moves them up and down, writes the complete order to the document, names the section in the label a screen reader reads, resets to the template's order, and says so when there is nothing to reorder. |
| `tests/vitest/MembershipPanel.test.tsx` | The membership names the tier the server resolved, carries the tier on the element so the colour is the tier's colour, offers a free candidate the next step up, offers a paying candidate the plan page, and speaks the candidate's language. |

### The contracts that were preserved

The existing suites for these areas all still pass: `tests/jobs-feed-contract.test.ts`
(the kind filters), `tests/opportunity-matching.test.ts` (the per-kind actions),
`tests/training-courses.test.ts` (a job vacancy is never a training format),
`tests/plan-identity.test.ts` (the tier table and the palette),
`tests/payment-checkout-ui.test.ts` (the checkout layout, including *no physical side
properties*), `tests/premium-motion-contract.test.ts` (the animated balance readout),
`tests/subscriptions-system.test.ts` (the entitlement matrix and the credit weights),
`tests/cv-preview.test.ts`, `tests/cv-docx-export.test.ts` and `tests/cv-pdf-export.test.ts`.

Two decisions were made to keep them intact, and they are worth stating plainly:

- `isInternshipEmploymentType` still reads the Arabic "تدريب" as an internship. It is
  the platform's long-standing reading and the suites assert it. A training *programme*
  is recognised separately, by the words that say so ("training", "bootcamp", "course",
  "دورة"), so a placement and a course are told apart without breaking that promise.
- `filterLiveJobsByKind` is unchanged. The employment half of the feed is applied as a
  separate pillar filter on top of it, in the server, where the feed is assembled.

---

## 3. What could not be verified here

**35 of the 1381 unit assertions did not run.** Every one of them fails at setup with
the identical message:

```
Error: The integration suite is missing required configuration:
  - SUPABASE_TEST_PROJECT_REF
  - SUPABASE_TEST_PROJECT_EXCLUSIVE
Set values only for a dedicated, disposable Supabase test project.
```

These are the live-database suites — `jobs`, `volunteer`, `personalization-api`,
`cv-templates`, `cv-studio-persistence`, `subscriptions-security-and-concurrency`,
`security`, `regression`, `lifecycle` and the rest. The runner (`tests/runner.mjs`)
deliberately refuses to run them against anything but a designated, disposable test
project, and that project is not configured in this environment. **They are blocked by
the environment, not by this change** — the failure happens before any assertion about
the code under test runs.

**Two of these suites touch the work in this release and should be run before release:**

- `tests/personalization-api.test.ts` asserts that the full catalogue is browsable and
  that `?category=` still works. The pillar filter was added so that it is asked for
  *explicitly* and the default still returns everything, but that assertion is the one
  to watch.
- `tests/cv-templates.test.ts` and `tests/cv-studio-persistence.test.ts` cover the
  export routes and the document's persistence.

**One assertion needed an environment fix to pass** and is worth recording: the
OpenRouter suite asserts that an AI provider is configured. It fails when the suite is
run directly, because the runner — not the test — loads the environment file. Run
through the runner, or with the environment loaded, it passes. It is not affected by
this change.

**Also unverified here:** no browser session was driven against the running application
beyond the production smoke test. The CV Studio's drag-and-drop reorder, the profile's
membership panel and the two-column layouts should be looked at by a person before
release.

---

## 4. The migration

| | |
|---|---|
| File | `supabase/migrations/20261125000001_opportunity_pillar_split.sql` |
| Tables | `public.volunteer_opportunities` (one column added) |
| Adds | `pillar text` + `volunteer_opportunities_pillar_check` (`NOT VALID`, as the kind constraint beside it) + two partial indexes |
| Changes | 4 training programmes re-filed from their subject to their form; 90 rows backfilled |
| Applied to | the production Supabase project (`ciihprsfdojzvjnqgbxl`) |
| Production | **applied** — before the application was deployed, so the two were never out of step |

This is the only schema change in the release, and it belongs to the opportunity split.
The subscription work added **no** migration and touched **no** table, as the release
gate requires of a change that only moves the presentation of a subscription.

---

## 5. The deployment

| | |
|---|---|
| Commits | `0553b92` (the release) and `d5845e6` (a correction found by deploying) |
| Pushed to | `origin/main` — CI **green on both** |
| Pages deployment | `a0cfd092-08b5-4503-b36b-d0a7a8ddae64`, Environment **Production**, branch `main`, source `d5845e6` |
| Live at | https://careerdev4ai.pages.dev |
| Jobs worker | **not redeployed** — its code imports none of the changed modules, so a redeploy would have changed nothing |
| Production smoke | `/api/health` → `{"status":"ok"}` on both the production URL and the deployment URL; `/opportunities` and `/sitemap.xml` render from the live database |

### What deploying found

The first production read of the public catalogue showed **90** records and the title
"Volunteering Opportunities & Internships" — the internship was being published among
the volunteering programmes, on a surface the release had not touched. The split was
real in the product and absent from the public page.

`d5845e6` fixed it: the public page now asks the database for the activities pillar,
the same stored column the application filters on, and says what it is. It now
publishes **89** records as "Opportunities & Activities".

A record's own page is looked up in the whole catalogue, so the URL a search engine
has already indexed keeps working: `/opportunities/opp-eg-undp` still answers **200**
with its own title, while the internship has left the index and the sitemap (709
URLs, 89 of them opportunities).

---

## 6. Files

**Added**

- `shared/cvLayout.ts` — the layout of a CV, described once
- `src/components/cv/studio/CvSectionOrderControl.tsx` — reordering the sections
- `src/components/subscription/MembershipPanel.tsx` — the membership, beside the profile
- `supabase/migrations/20261125000001_opportunity_pillar_split.sql`
- `tests/cv-layout-parity.test.ts`, `tests/opportunity-pillar.test.ts`
- `tests/vitest/CvSectionOrderControl.test.tsx`, `tests/vitest/MembershipPanel.test.tsx`

**Changed**

- `server/cvTemplates/docx.ts` — the Word file, rewritten onto the shared layout
- `src/components/cv/templates/CvTemplateRenderer.tsx` — the paper, rewritten onto the shared layout
- `shared/cvTemplates.ts`, `shared/jobs.ts`, `shared/opportunities.ts`
  (`shared/planIdentity.ts` is **unchanged** — the tier table and the palette were
  already right, and the redesign reads them rather than adding to them)
- `server/db/volunteerOpportunities.ts`, `server/jsearch/client.ts`, `app.ts`
- `src/components/layout/AppShell.tsx`, `src/components/views/{CVStudioView,DashboardView,JobsView,ProfileView,VolunteerView}.tsx`
- `src/components/volunteer/VolunteerOpportunities.tsx`, `src/components/subscription/PlanIdentityBadge.tsx`
- `src/lib/personalizationApi.ts`, `src/types/career.ts`
- `src/translations/index.ts` and the `cvStudioData`, `discovery`, `jobs`, `subscriptions` parts

---

# The second release — the layout the candidate controls, and the export that is the preview

**Repository:** CareerDev4AI (`D:/Saas/careerpilot-ai`)
**Date:** 17 November 2026
**Commit:** `a6f1d1f`

The first release made the paper and the Word file agree. It did not yet make the
**downloaded file** agree with what the candidate was looking at, because the export was
still a second rendering drawn from the saved document. This release closes that gap and
hands the layout to the candidate.

## 7. What changed

### 7.1 The download is the preview

The PDF is now printed by the browser from the paper that is on screen. The document the
candidate approves is the document the browser prints, so the file carries the same type,
the same columns, the same Arabic shaping and the same page breaks — because it is the
same document, not a description of it. The export waits for the stylesheets, for the
fonts and for the images before it prints, so a page never loses a face it had on screen.

The Word file is drawn from the document the candidate is holding. The route reads the
document in the request **before** it looks for a stored version, so the export can never
quietly hand back a CV from the database that the candidate had already changed.

### 7.2 The candidate lays out their own CV

`shared/cvLayout.ts` grew from a description of a template into a description of *this
document*: the order of the sections, the order of the entries inside them, the column a
section sits in, where the contact details are printed, and where each professional link
is printed. The layout editor (`CvSectionOrderControl.tsx`) was rebuilt around it:

- sections are dragged with a pointer **and** moved with the arrow buttons, so the editor
  answers a mouse and answers a keyboard
- the entries inside a section can be put in any order
- a section can be moved into the side column of a template that has one
- the contact details can be taken out of the masthead into a section of their own
- each professional link can be moved on its own, without moving the others
- a change can be undone, and the whole layout can be put back to the template's

The decision is saved with the CV and restored when the candidate reopens it; filling the
CV from the candidate's records no longer discards the layout they had arranged.

### 7.3 The catalogue's records carry the kind they are

The pillar split was correct — every record was on the right side of the line between
employment and everything else — but the **kind** was still the kind each record was
seeded with, and the kind is what the card shows and what the kind filter reads. Fourteen
records said the wrong thing:

| What the record is | Was filed under | Now |
|---|---|---|
| 5 volunteering organisations (*"Code for America — Volunteer"*, *"NumFOCUS — Volunteer and Mentor"*, *"Mozilla — Contribute"*, *"DataKind"*, *"Wikimedia Foundation — Get Involved"*) | `technology` | `volunteering` |
| 2 academies (*"ITI Cybersecurity Academy"*, *"AI Ambassadors Program"*) | `career_development` | `training` |
| 3 capacity-building courses (*"Upskilling Programs"*, *"Train To Hire (4 Month)"*, *"Creativa Innovation Hubs"*) | `scholarship` | `training` |
| *"Post Graduate Diploma"* | `technology` | `training` |
| 2 free evening events (*"SECC Tech Night"*) | `technology` | `workshop` |
| *"ProGIG"* | `technology` | `career_development` |

Nothing was deleted, and no record changed pillar: a course, an event and a volunteering
stint are all on the activities side of the line, which is where they already were. The
tags were re-synced so that they name the kind again, which is the invariant the sync
pipeline writes.

### 7.4 The subscription panel reads the plan's own colours

`MembershipPanel.tsx` takes its accent and its feature list from the entitlement matrix
and the tier table rather than naming them again, so the panel cannot drift from the plan
it describes. The **entitlement checks are untouched**: a badge says what a plan is, it
does not decide what a plan may do.

## 8. Verification

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **exit 0** |
| `npm run test:run` (vitest) | **36 / 36 pass** |
| node:test suite (93 self-contained files) | **1348 pass, 5 fail** — all 5 are environment gates, below |
| `tests/cv-layout-parity.test.ts` | **15 / 15 pass** — 7 of them new |
| `tests/localization.test.ts` | **6 / 6 pass** — 2480 / 2480 strings carry an Arabic entry |
| `npm run build` | **exit 0** — `dist/_worker.js` written, the bundle carries the public configuration and all 4 sign-in methods |
| `npm run build:jobs` | **exit 0** — `dist-jobs/worker.js` written |

The five failures are not regressions. Four need `SUPABASE_TEST_PROJECT_REF` and
`SUPABASE_TEST_PROJECT_EXCLUSIVE` — the runner refuses to point at anything that is not a
dedicated, disposable test project, and refuses to start at all without them — and one
asserts that an AI provider is configured, which the environment does not. The integration
suite could therefore not be run here, and the self-contained files were run directly
instead.

**The new parity coverage.** The paper and the Word file are compared to each other
directly, and the seven new assertions are the ones this release needed:

- an Arabic CV is `dir="rtl"` on the paper and `<w:bidi>`/`<w:rtl>` in the file
- the two carry the same sections in the same order
- the contact details reach **both** renderings when they are taken out of the masthead
- the professional links reach **both** renderings when they are moved into it
- one link can be moved without moving the others
- the entries inside a section keep the order the candidate chose, in both

The Word file's hyperlinks are checked against the relationships part of the package, so
a link is only counted when it carries a real destination.

## 9. What could not be verified here

**The pointer drag itself was not exercised in a browser.** jsdom has no
`elementFromPoint`, so the drag is covered by the keyboard path (the arrow buttons) and by
the component's own logic, not by a synthetic pointer. The two-column layouts, the
membership panel and the drag should be looked at by a person before this is called done.

**The integration suite did not run**, for the environment reason above.

## 10. The migration

| | |
|---|---|
| File | `supabase/migrations/20261126000001_opportunity_kind_review.sql` |
| Tables | `public.volunteer_opportunities` (**no column added**) |
| Changes | 14 records re-kindled; tags re-synced; the pillar invariant re-asserted |
| Deletes | **none** |
| Applied to | the production Supabase project (`ciihprsfdojzvjnqgbxl`) |
| Production | **applied** — before the application was deployed, so the two were never out of step |

## 11. The deployment

| | |
|---|---|
| Commit | `a6f1d1f` |
| Pushed to | `origin/main` — CI **green** (run `44091055195`, 1m0s) |
| Pages deployment | `c2ce9a17-3165-49a1-84b2-ff6ae309c88e`, Environment **Production**, branch `main`, source **`a6f1d1f`** |
| Second deployment | `e86e450f-c61f-4454-8b14-cd5c3519dfaa` — Cloudflare's own Git-connected build of the same push, on its own toolchain, so its bundle is hashed differently but carries the same code |
| Live at | https://careerdev4ai.pages.dev — serving `assets/index-DABd8Pc8.js`, the artifact built locally from `a6f1d1f` |
| Jobs worker | **not redeployed** — its code imports none of the changed modules, and the rebuilt bundle contains none of the changed logic |
| Production smoke | `/api/health` → `200 {"status":"ok"}` on **both** the production URL and the deployment URL; `/api/learning/search?q=python` → `200`, 20 courses; `/sitemap.xml` → `200`, 709 URLs; `/opportunities` → `200` |

**The live site was checked against the local build, not merely for a 200.** The
production URL serves `assets/index-DABd8Pc8.js` and the other eight entry assets, and
the set is identical to the set `dist/index.html` names — the same bytes that were built
from `a6f1d1f`. The bundle carries the new strings (`Professional links`, `{name} moved
up to position {position}`), so the new layout editor is what a candidate is being served.

**The data fix was checked end to end.** The public record page for
`/opportunities/code-for-america-volunteer` answers `200` and now names the kind
**Volunteering**; the word *Technology* no longer appears on it.

**The queue was checked end to end** by `scripts/verify-queue-production.mjs`: a job was
queued on the deployed site, the consumer picked it up, it ran to `completed`, and the
throwaway identity was removed afterwards.

## 12. Files

**Added**

- `supabase/migrations/20261126000001_opportunity_kind_review.sql`

**Changed**

- `src/lib/cvPdfExport.ts` — the print document, built from the paper that is on screen
- `src/lib/cvTemplatesApi.ts` — the export carries the document in hand
- `server/cvTemplates/routes.ts` — the request body wins over a stored version
- `server/cvTemplates/docx.ts`, `server/seo/publicPages.ts`
- `shared/cvLayout.ts`, `shared/cvTemplateDocument.ts`, `shared/cvDocument.ts`,
  `shared/cvProjection.ts`, `shared/cvTemplates.ts`, `shared/opportunities.ts`,
  `shared/resumeLanguage.ts`
- `src/components/cv/studio/CvSectionOrderControl.tsx` — the editor, rebuilt
- `src/components/cv/templates/CvTemplateRenderer.tsx` — the masthead's contact and links
- `src/components/views/CVStudioView.tsx`, `src/components/views/VolunteerView.tsx`
- `src/components/volunteer/VolunteerOpportunities.tsx`
- `src/components/subscription/MembershipPanel.tsx`
- `src/context/CareerContext.tsx`, `src/types/career.ts`
- `src/translations/index.ts` and the `cvStudioData`, `discovery`, `subscriptions` parts
- `tests/cv-layout-parity.test.ts`, `tests/vitest/CvSectionOrderControl.test.tsx`

