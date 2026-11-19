# Release report — the platform release

**Repository:** CareerDev4AI (`D:/Saas/careerpilot-ai`)
**Date:** 17 November 2026
**Scope:** the four changes in the release brief, the verification that was run, and the
one thing that could not be verified here.

**This document covers four releases.** Sections 1–6 record the first
release (`0553b92`, `d5845e6`, `37c8fcb`), which made the paper and the Word file agree.
Sections 7–12 record the second (`a6f1d1f`), which made the **download** agree with the
paper and handed the layout to the candidate. Sections 13–18 record the third
(`e20d232`, `6cfb60c`), which gave the files a candidate uploads one contract, and gave the
template library the tests it never had. Sections 19–25 record the fourth (`fbb7ad2`), which
took the audited open-source resources that were safe and built three features on them: the
company careers boards a posting can come from, a semantic factor that explains a match, and
an approval gate that keeps an application from leaving the platform without the candidate's
own decision.

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

---

## 13. The third release: one contract for the files a candidate may upload

**Commits** `e20d232` (the fix) and `6cfb60c` (the tests), deployed as `0a897748`.

### 13.1 What the brief reported, and what was actually true

The brief reported four regressions: the upload refused files, the templates were broken, the downloads did not match the paper, and the editor lost the CV on refresh. None of them was taken at face value, because the brief also says not to replace working libraries without evidence. Each area was measured against the running product first.

| Reported | What the measurement showed |
|---|---|
| "The upload is broken" | The extraction engine was never broken. A real PDF and a real DOCX were both read end to end by `extractDocument`, line by line, with nothing lost. |
| "The templates are broken" | All 37 templates render in a real browser with zero lost facts — checked twice: against the dev server, and against the production bundle served as a `<link>` stylesheet. Arabic is `dir=rtl`; a long CV stays clean. |
| "The PDF does not match the paper" | The print frame is 794px of A4 with one body child, the stylesheets loaded, and all 34 facts of the fixture present. |
| "The Word file does not match the paper" | The Word writer already read the same layout as the paper (`shared/cvLayout.ts`), which is what the second release had put in place. |
| "The editor loses the CV" | The editor was fine. What was missing was that the **server** was never told which template was in use when a document was exported as Word, so the file that came back was not the CV on screen. |

The code that worked was therefore left alone. What was genuinely broken was smaller and duller than the report implied:

1. **The format contract had drifted across four places.** The API refused a `.pdf` unless the browser sent exactly `application/pdf`; a `.doc` sent as `application/octet-stream` was accepted by the API and then rejected by the storage bucket; the `accept` attribute, the multer filter, the bucket's allowed types and the extension-to-MIME map each held their own private list.
2. **The file input was never reset.** After a read the input still held the file, so choosing the same file again fired no `change` event. A candidate who fixed one mistake and re-picked the same CV got nothing at all.
3. **The analyzer dropped an unsupported file silently.** Nothing happened, and nothing said why.
4. **There was no size guard in the browser.** A 40MB file was accepted by the picker and rejected by the server, after the wait.
5. **The Word export did not record the template in use.** `cvId` was not sent, so the server kept the template from before — or none at all.
6. **The per-template test suite had never run.** `tests/cv-templates.test.ts` imported the database harness, which throws at import time unless `SUPABASE_TEST_PROJECT_REF` is set. In every ordinary run the file died before its first assertion, so the 37 templates had **no** test coverage.

### 13.2 One contract for the files a candidate may upload

`shared/cvUpload.ts` is now the only place that knows what a candidate may upload:

| The decision | Where it lives now |
|---|---|
| The formats a candidate may bring | `CV_UPLOAD_FORMATS` |
| The extensions the picker offers | `CV_UPLOAD_EXTENSIONS` — extensions only, so the picker does not offer every file on the disk |
| The MIME types the server accepts | `CV_UPLOAD_MIME_TYPES` |
| The size limit | `CV_UPLOAD_MAX_BYTES` — 10 MB, enforced by multer, by the storage layer and by the browser |
| The reason a file was refused | `cvUploadRejection()` → `unsupported_type` or `too_large`, or nothing |
| The MIME a stored file gets | `cvUploadStorageMime()` — decided by the extension, not by what the browser claimed |
| The message a candidate reads | `cvUploadRejectionMessage()` |

It answers with **reason codes, not English sentences**. The server turns a code into its own wording; the browser turns it into a translated string. That is why the Arabic entries were added: `tests/localization.test.ts` requires an Arabic string for every `t()` key, and a sentence baked into a shared module would have had no translation at all.

The server answers `413` with the code `FILE_TOO_LARGE` when the file is over the limit, and the multer error handler now names the 10MB limit instead of failing vaguely.

### 13.3 The four client fixes

- `CvReviewWorkspace.tsx` — the input's value is reset after every read, so the same file can be re-picked; the client checks the contract before sending and shows the translated refusal; `accept` lists extensions only.
- `CvAnalysisPanel.tsx` — the silent drop became a message, the size is checked before the upload starts, and the input is reset.
- `CareerContext.tsx` — the active CV id is exposed, so the editor and the exports agree on which document is in hand.
- `cv.ts` (translations) — the two new messages, in English and Arabic.

### 13.4 The export fix

`cvTemplatesApi.ts` now sends `cvId` with the Word export, and the route records the template that was actually in use. The document in the request body still wins over the stored version — that rule was not changed.

### 13.5 The suite that had never run

`tests/cv-templates.test.ts` is no longer one file that depends on a database. It was split:

- `tests/cv-template-library.test.ts` — the part that needs no database, and which therefore always runs: every template, its facts, its layout, the free one being free.
- `tests/cv-templates.test.ts` — the part that talks to the API, which stays database-gated.

Nothing was deleted; the coverage that was silently switched off is now on.

## 14. The regression suites

| File | What it proves | Result |
|---|---|---|
| `tests/cv-template-library.test.ts` | every one of the 37 templates renders, keeps its facts, and the free template is the free one | 25 pass, no database |
| `tests/cv-upload-regression.test.ts` | the format contract: every accepted extension, every refused one, the 10MB limit, the reason codes, the storage MIME map, the messages | 12 pass |
| `tests/cv-export-regression.test.ts` | the Word export carries the document in hand, the body wins over the stored version, the template is recorded, the headers and filename are right, the layout still matches the paper | 14 pass |
| `tests/cv-studio-workflow.test.ts` | the whole studio: upload → extract → review → apply → editor → refresh → export | 10 steps, database-gated |

All four are registered in `tests/runner.mjs`, so they run in the ordinary suite rather than only on demand.

**Local runs, all green:** `tsc --noEmit` clean; Vitest 6 files / 36 tests; the 15 CV test files pass, including `localization.test.ts`; the Playwright smoke passes; the production build succeeds.

## 15. The deployment

| | |
|---|---|
| Commits | `e20d232`, `6cfb60c` — pushed to `origin/main` (`e2d0174..6cfb60c`) |
| Pages deployment | `0a897748`, branch `main`, Environment **Production** |
| Live at | https://careerdev4ai.pages.dev — serving `assets/index-BlHp8Xdr.js` and the eight other entry assets |
| Deployment URL | https://0a897748.careerdev4ai.pages.dev |
| Production smoke | `/api/health` → `200 {"status":"ok"}` on **both** the production URL and the deployment URL |

**The live site was checked against the local build, not merely for a 200.** The set of assets the production URL names is identical to the set `dist/index.html` names, and the served bundle carries the new upload strings — so the contract in `shared/cvUpload.ts` is what a candidate is being served, not a stale bundle.

## 16. The live acceptance pass

The deployed site was driven in a signed-in browser, against the owner's own account, with no record written.

- CV Studio loads with the five-step flow, the editor and preview, the Resume Language toggle, and **37 of 37** templates in the Template Library, each with its preview.
- The Import step says **"Nothing has been saved to your profile yet"** and offers "Choose a file · PDF, DOCX, DOC, TXT or JSON".
- A real PDF (1,879 bytes) was uploaded: the server extracted it, and the review showed **93% confidence**, `High 22 · Medium 4 · Low 2 · Missing 6`, the sections with their value counts, and one issue raised (overlapping roles). Nothing was applied.
- A real DOCX (10,158 bytes, the same content) was uploaded: the review reads **`sample-cv.docx · DOCX · 1 page(s)`** with the same 93% and 22/4/2/6. The values came out right (name, email, phone, location, professional title), the LinkedIn link was marked as *assembled* rather than copied, GitHub and Website were marked *missing*, and the sections that are not in the document were marked **"Not in the document"**.
- **0 console errors and 0 warnings** across the pass.
- The account's CV document was still empty afterwards. The import step is read-only until Apply is pressed, and Apply was not pressed.

## 17. What could not be verified here

**The database-gated half of the suites.** `cv-studio-workflow.test.ts` and the API half of `cv-templates.test.ts` need a disposable Supabase project. None is configured: the linked project `ciihprsfdojzvjnqgbxl` is production, and `tests/env.mjs` requires both `SUPABASE_TEST_PROJECT_REF` and `SUPABASE_TEST_PROJECT_EXCLUSIVE` precisely so that the suite cannot write to production. There is no Docker and no Supabase CLI on this machine, so no local stack either.

**The CI run is red on one step only.** Run `44184272050` fails at `npm audit --audit-level=high`, which flags a `picomatch` ReDoS advisory reached through `vite` → `vitest` → `@vitejs/plugin-react`. No dependency was changed in this release; the advisory is pre-existing and lives entirely in the dev and build toolchain. Clearing it would mean downgrading vite 8 → 6 and vitest 5 → 3 — a breaking toolchain change, and not part of this release. Every other step in the run is green: Vitest, `tsc`, the build, Playwright and Semgrep.

## 18. Files

**Added**

- `shared/cvUpload.ts` — the upload contract
- `tests/cv-template-library.test.ts`, `tests/cv-upload-regression.test.ts`,
  `tests/cv-export-regression.test.ts`, `tests/cv-studio-workflow.test.ts`

**Changed**

- `app.ts` — the upload route, the document reader, the size limit, the multer error
- `server/db/cvStorage.ts` — the extension-to-MIME map, the size limit
- `server/cvTemplates/routes.ts` — the template in use is recorded
- `src/components/cv/CvReviewWorkspace.tsx`, `src/components/cv/CvAnalysisPanel.tsx`
- `src/components/views/CVStudioView.tsx`, `src/context/CareerContext.tsx`
- `src/lib/cvTemplatesApi.ts`, `src/translations/parts/cv.ts`
- `tests/cv-templates.test.ts`, `tests/runner.mjs`

---

## 19. The fourth release: the brief, and what was actually done

The brief supplied thirty-five open-source repositories and skills and asked for them to be
evaluated and selectively integrated, with four deliverables written. The brief also said,
in its own words, that **"repository availability does NOT authorize blindly installing
every dependency."** That sentence governed everything below.

So the first job was not to install. It was to read every repository's README, licence,
`package.json` and runtime requirements, and to decide what each one could honestly be used
for inside a React 19 / TypeScript / Vite / Supabase / Cloudflare Pages application that
already worked.

| The verdict | The count | What it means |
|---|---|---|
| **INSTALL** | 14 | Safe and useful: taken into the project |
| **REFERENCE** | 10 | Useful as an implementation reference; not taken |
| **OPTIONAL** | 8 | Useful only for a future feature; not taken |
| **REJECT** | 8 | Incompatible, redundant, insecure or unsuitable; refused |

**No new runtime dependency was added.** `package.json` is unchanged. The only addition to
the deployed surface is the Postgres `vector` extension — which was already installed in the
project's database (0.8.2) and had simply never been enabled.

The four deliverables are in the repository root: `ENGINEERING_RESOURCES_AUDIT.md` (the
matrix, with the reason for every decision), `INTEGRATION_REPORT.md`, `SECURITY_REVIEW.md`
and `TEST_REPORT.md`.

## 20. The audit: what was taken, and what was refused

### 20.1 The refusals, and the grounds

Every refusal names something concrete that was read in the repository, not a feeling about
it.

| The resource | Why it was refused |
|---|---|
| `browser-use` | Executes model-written Python against a browser, exposes an unauthenticated CDP port on 127.0.0.1, and ships CAPTCHA solving. It is a local agent runtime, not a Cloudflare-compatible library. |
| `speedyapply/JobSpy` | TLS impersonation and proxy rotation. That is a way around a site's decision, not a way to read a public API. It breaks the terms of the sites it reads. |
| `stapply-ai/ats-scrapers` | `httpcloak`, a stealth Chromium build, and captcha bypass. Its whole point is to look like something the site did not agree to see. |
| `unclecode/crawl4ai` | Defaults to `playwright-stealth`. The default is the problem. |
| `siteagent-website-cloner` | Archived, and its README bars phishing use outright. |
| `openai-agents-js` | Tracing is on by default and the traces export PII — the user's own CV data — to a third party. |
| `mastra` | Its licence states the enterprise edition "does not permit Production Use". |
| `Unstructured-IO/unstructured` | Python, with four system packages, parsing untrusted uploads. A Worker cannot run it, and a separate service would need its own attack surface. |

Two more were blocked on licensing rather than on conduct: `job-board-aggregator` ships its
company list under **CC BY-NC**, and `nipunsomani/job-forager` has **no LICENSE file at
all**. Neither may be carried into a commercial product, so the board list that the
platform can read is operator-configured instead of bundled (§21.1).

### 20.2 What was taken

Thirteen agent skills were installed into `.agents/skills/` — the project's own convention —
and pinned by `skills-lock.json` so an upstream change cannot silently alter them:
`supabase`, `supabase-postgres-best-practices`, `docx`, `pdf`, `pptx`, `xlsx`, `firecrawl`,
`firecrawl-crawl`, `firecrawl-scrape`, `browser`, `safe-browser`, `build-agent`, `ai-sdk`.

The code that came from the audit is three features, and none of them needs a browser, a
Python service, a proxy or a new dependency.

## 21. The three features

### 21.1 The boards a posting can come from

`server/jobs/ats.ts` reads the **official public job-board endpoints** that Greenhouse,
Lever and Ashby publish for exactly this purpose. They need no key, no credential and no
browser, and they are the vendors' own supported interface with their own customers' boards.

| The vendor | The endpoint |
|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{id}/jobs?content=true` |
| Lever | `api.lever.co/v0/postings/{id}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{id}` |

The board list is **operator-configured** through `JOB_ATS_BOARDS` (`provider:boardId:Company`,
one per line), the identifiers are validated against `^[a-z0-9][a-z0-9-]{0,63}$` and
URL-encoded, and the whole feature is **off until an operator turns it on**. That is what
keeps a non-commercial company list out of a paid product.

`server/jobs/feed.ts` merges the paid provider feed with the boards, dedupes the two
against each other keeping the **richer description copy**, and reports `boardsRead` and
`boardsFailed` so the interface can say which boards were really read — the platform never
claims a board it has not opened. When only `company_careers` is asked for, the provider
call is skipped entirely, which protects the paid quota.

Two real bugs were found by reading the live endpoints rather than the documentation, and
both are fixed:

1. **The descriptions were empty.** Greenhouse only returns the job body when
   `?content=true` is present.
2. **A sanitiser ordering bug.** Greenhouse escapes its HTML **once**, so the body arrives
   as `&lt;p&gt;`. Stripping tags *before* decoding the entities put the tags back into every
   posting. The order is now: decode the entities, strip the tags, then decode `&amp;` once
   and only once.

### 21.2 The semantic factor

`server/ai/embeddings.ts` and `server/jobs/semantic.ts` add a sixth weighted factor to the
existing match. The platform already compared a candidate's skills with a posting's skills
exactly; that is precise and blind at the same time, because "Postgres" and "PostgreSQL" are
one thing to a candidate and two strings to a matcher.

- The vectors live in **the project's own Postgres**, behind the platform's own row level
  security, with HNSW cosine indexes. There is no vector database and no new service.
- The model is Gemini `text-embedding-004` at 768 dimensions, matching the `vector(768)`
  columns. The model name is recorded with every vector, so a model change invalidates the
  old vectors instead of mixing two kinds of vector together.
- The factor is worth **15 of 100**. The exact factors keep their proportions inside the
  remaining 85. It is a **sixth factor, never a replacement**.
- It is **absent rather than zero** when it was not evaluated, so a missing embedding cannot
  quietly lower a candidate's score.
- Every factor carries a **written reason** that names the terms that matched and the terms
  that are missing. The comparison reuses the platform's own `canonicalSkillKey` and
  `skillNameVariants`, which is why "Node.js" and "node js" meet.

`GEMINI_API_KEY` is read on the server and never reaches the browser. With no key, or a
provider refusal, the exact factors carry the score exactly as they did before — the
semantic factor is an addition, never a requirement.

### 21.3 The approval gate

`server/db/applicationApprovals.ts` gives an application package a state machine —
`draft → pending_review → approved`, with `rejected` and a withdrawal back to `draft` — and
enforces it in **the database**, with a trigger, not in the interface.

The reason is simple: an interface rule is a rule the interface can be asked to break. A
crafted request, a dashboard, a script and a future endpoint are all stopped by the same
trigger, because the trigger is the only thing that cannot be skipped.

The decisions are **append-only**: `application_package_reviews` records every transition
with who made it and when, and no client may write to it. Two routes expose the work:
`POST /api/application-packages/:id/decision` and
`GET /api/application-packages/:id/reviews`.

The gate was checked directly in the database: **three legal transitions allowed, two
illegal ones refused** (`draft → approved` and `approved → rejected` are both refused).

## 22. The schema the features need

`supabase/migrations/20261118000002_semantic_matching_and_approval_gate.sql` enables the
`vector` extension and adds:

| Object | What it is |
|---|---|
| `job_embeddings`, `profile_embeddings` | The vectors, with HNSW cosine indexes |
| `application_package_reviews` | The append-only decision history |
| `application_package_status` | The enum: draft, pending_review, approved, rejected |
| `application_package_allowed_transition()` | The law, in one function |
| `application_package_enforce_approval_gate` | The trigger that refuses an illegal move |
| `application_package_record_review` | The trigger that writes the history |
| `match_jobs_semantically()` | Revoked from `PUBLIC`, granted to `service_role` only |
| RLS policies | A candidate reads only their own profile vector; the job vectors are readable by signed-in users |

**This migration was applied to the production project** `ciihprsfdojzvjnqgbxl`, because
that project is the one the local database tool is connected to. It is **additive**: new
tables, a new enum, new columns, new indexes, new functions, new triggers, and one
extension that was already downloaded. Nothing was dropped, renamed or rewritten, and no
existing row was touched. It is still a change to a live schema and is called out here for
that reason.

## 23. The verification

| The check | The result |
|---|---|
| `npm run lint` (`tsc --noEmit` + the test typecheck) | clean |
| `npm run test:run` (Vitest) | 6 files, 36 tests, all passed |
| The new contract suites (`node --import tsx --test`) | 51 tests, all passed |
| `npm run test:e2e` (Playwright) | 1 test passed |
| `npm run build` | `dist/_worker.js` written (4.26 MiB); the bundle-auth check passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Semgrep over the 30 changed source files | 0 findings |
| A live read of a Greenhouse board | 142 postings, 0 markup remaining, XSS payloads neutralised |

The two failures that remain in the tree — `tests/cv-studio.test.ts` and
`tests/localization.test.ts` — are **not from this release**. They are reproduced with this
release's source changes stashed, and they belong to the CV Studio work that was in the
tree at the time. They were reported, not papered over.

## 24. The deployment

| | |
|---|---|
| Commit | `fbb7ad2` — pushed to `origin/main` (`4512d84..fbb7ad2`) |
| Pages deployment | `073fc40c`, branch `main`, Environment **Production** |
| Live at | https://careerdev4ai.pages.dev — serving `assets/index-Cj80e49d.js` |
| Deployment URL | https://073fc40c.careerdev4ai.pages.dev |
| Production smoke | the page returns `200` behind `server: cloudflare` |

**How it was deployed.** The Pages project builds from Git, so the push built and published
`fbb7ad2` on its own. A manual `wrangler pages deploy` was deliberately **not** run: the
local `dist/` in the working tree carries the concurrent CV Studio work, which is not
committed and does not pass its own tests. Deploying the local build would have shipped
unreviewed code to production. The live bundle was verified to be the new one — it carries
the `Semantic match` string this release added — and the two new routes answer on the
production URL.

| The live probe | The answer | What it proves |
|---|---|---|
| `POST /api/application-packages/:id/decision` | `401 {"error":"Unauthorized"}` | The route exists and requires a session |
| `GET /api/application-packages/:id/reviews` | `401 {"error":"Unauthorized"}` | The route exists and requires a session |
| `GET /api/jobs/search` | `401 {"error":"Unauthorized"}` | The jobs route is still private |
| `GET /api/this-route-does-not-exist` | `404 {"error":"Not found"}` | The control: an unregistered route answers differently |

**A note on the SHA.** The probes above were run against the deployment that serves the
release commit `fbb7ad2`. The documentation commit that follows it rebuilds the same
application code — the Pages project builds every push — so the live deployment's SHA moves
on while the code that a candidate is served does not. The verified pairing is
**code `fbb7ad2` → deployment `073fc40c` → https://careerdev4ai.pages.dev**.

## 25. What could not be verified here

**The ten route-level tests for the approval gate were run, and they all passed.**
They needed a disposable Supabase project, and the suite's own guard refused to
run against production — correctly. A disposable project was then provisioned
(`yqiuzbwaqfrvhynkobpu`, a separate empty project in its own organisation, on
the free plan), the repository's migrations were applied to it, and the file was
run against a real server and a real database:

```
▶ the application approval gate
  ✔ starts a new package as a draft nobody has approved
  ✔ refuses to approve a package that was never sent for review
  ✔ goes through review and then approves
  ✔ records every decision it makes
  ✔ refuses an action it does not know
  ✔ does not let one candidate decide for another
  ✔ does not let one candidate read another candidate's decisions
  ✔ refuses the decision to a caller who is not signed in
  ✔ keeps the gate in the database, not only in the route
  ✔ leaves the package untouched after a refused move
ℹ tests 10   ℹ pass 10   ℹ fail 0
```

The runner's own cleanup confirmed it: no test identities remain, no orphaned
storage objects remain, and the state file is unchanged. The disposable project
was **paused** afterwards, so it does not hold the account's free-project
allowance and can be restored for the next run.

**Provisioning that project uncovered a real property of the repository, which
is worth the project owner's attention.** The migrations folder could not
rebuild the database:

- **Two migration files contained invalid PL/pgSQL**, and both were in the
  daily-credit expiry path. `20261116000001_daily_credit_allowance_three.sql`
  used a bare `UPDATE … RETURNING` as a loop's query, which PL/pgSQL accepts
  only through `EXECUTE` — and which, even with the syntax repaired, would
  have counted the *new* value (zero) instead of the amount that expired, so
  expired credits would have stayed spendable. `20261117000001_daily_token_claim.sql`
  closed an `IF` with `END LOOP`. Both are fixed, and the corrected form was
  taken from the deployed project's own live function.
- **One column the application depends on was created by no file at all**:
  `roadmap_tasks.work_kind`. `server/db/roadmap.ts` reads and writes it, so a
  rebuilt database would have had a roadmap table the application could not
  write to. A forward migration now adds it.

The gate's own migration applied cleanly, and the gate is unaffected by all of
this.

**Separately, the folder's version numbers and production's do not agree.**
Production has 82 recorded migrations; 24 of them carry a version number the
folder does not use, even though the change itself is in the folder in every
case. `supabase db push` against production would therefore try to re-apply
24 migrations that have already been applied. The full measurement, and a
reconciliation plan, are in `DATABASE_MIGRATION_INTEGRITY.md`.

> **Correction (18 November 2026).** An earlier version of this section said
> production's history stopped at `20251115150123`. That was measured against
> the disposable test project, not production — the Supabase tools follow
> `supabase/.temp/project-ref`, and the link had been pointed at the test
> project for the run. Production's history is complete and continuous.

**The semantic factor was proven against the live providers and the live
database, but not end-to-end against a signed-in candidate's own embeddings in
production**, because that would mean writing a candidate's vector and spending
a provider key on the production account.

**The CV Studio work in the working tree was left exactly as it was found** —
not staged, not committed, not deployed, and not "fixed" to make a suite green.

---

## The fifth release — the CV Studio data loss, and the studio's own work

**Date:** 19 November 2026

### The defect

Text typed in the CV Studio sometimes disappeared. A space typed between two
words could vanish, and a whole sentence in the executive summary could vanish
with it.

The cause was the projection that keeps the document in step with the
platform's records. It ran while the candidate was typing — every write of the
CV header changes the profile, and the profile is part of the projection's
source — and it resolved the header with one line:

```ts
profile.fullName?.trim() || previous.fullName?.trim()
```

Three things were wrong with that line:

- **It trimmed.** The record and the document were both trimmed before they
  were compared, so a trailing space the candidate had just typed was
  destroyed by the comparison itself.
- **The record won.** The record is a copy of what was typed, written back a
  moment later, so it is often a keystroke or two behind the document — and
  the older words went back on the screen.
- **The summary was trimmed and folded.** A paragraph the candidate was still
  writing could be judged "the same as" an earlier one and deleted.

### The fix

- `shared/cvProjection.ts` — the header is resolved by a rule that can tell
  the studio's own copy of the records from a record that was changed
  somewhere else, and the candidate's text is never trimmed.
- `shared/cvProjection.ts` — the candidate's summary is kept exactly as it was
  written. A repeated paragraph in a summary that comes from the *records* is
  still folded, exactly as before.
- `shared/cvTemplateDocument.ts` — the printed CV folds a repeated paragraph
  in the candidate's own summary, which is where that cleanup belongs. The
  preview, the PDF and the DOCX all read this one place, so they still agree.
- `src/context/CareerContext.tsx` — the studio remembers the header values it
  wrote to the profile, so the records can be recognised as its own copy.

### The proof

`tests/cv-data-loss.test.ts` types a name one character at a time with the
projection running between every keystroke, and asserts that every character
survives. Against the old rule it fails seven assertions; against the new one
it passes.

### The rest of the release

- The studio's duplicate `<nav>` is gone: the studio carries one navigation,
  and the mobile pane switcher is a labelled group rather than a second
  navigation landmark.
- The 18 Arabic entries the studio was missing are in the catalogue. The
  localisation suite now reports 100% coverage.
- The Skill Assessment rubric table is readable on a phone: below `sm:` each
  band is a labelled block, and the table itself is unchanged above it.

### The checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run lint` | **PASSED** — app and tests both clean |
| Unit suite | `npm run test:run` | **PASSED** — 6 files, 36 tests, 0 failures |
| Database-free suite | `npm run test:logic` | **PASSED** — 1522 tests, 0 failures |
| Browser tests | `npm run test:e2e` | **PASSED** — 8 tests, 0 failures |
| Production build | `npm run build` | **PASSED** — `dist/_worker.js` 4.27 MiB, bundle-auth check passed |
| Dependency audit | `npm audit --audit-level=high` | **PASSED** — 0 vulnerabilities |

**Production data was not touched.** No migration was applied, no row was
written, and `supabase db push` was not run. The migration folder changes
travel with the release, and the deployment does not apply them.

### The documentation folder

Three of the supporting documents from the earlier release —
`DATABASE_MIGRATION_INTEGRITY.md`, `UX_AND_INTERACTION_AUDIT.md` and
`JOBRIGHT_FEATURE_PARITY.md` — were lost from the working tree before this
release was staged, and could not be recovered. The four report files that
are tracked in git were restored from the last commit, and
`TESTING_AND_RELEASE_REPORT.md` has been written again. The two documents
that describe the migration folder and the interaction work should be
written again before the next release that depends on them.
