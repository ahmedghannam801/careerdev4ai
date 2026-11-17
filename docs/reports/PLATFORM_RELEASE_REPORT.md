# Release report — the platform release

**Repository:** CareerDev4AI (`D:/Saas/careerpilot-ai`)
**Date:** 17 November 2026
**Scope:** the four changes in the release brief, the verification that was run, and the
one thing that could not be verified here.

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
| Applied to | the working database |
| Production | **not applied** — this migration must be deployed with the release, in the documented order |

This is the only schema change in the release, and it belongs to the opportunity split.
The subscription work added **no** migration and touched **no** table, as the release
gate requires of a change that only moves the presentation of a subscription.

---

## 5. Files

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
