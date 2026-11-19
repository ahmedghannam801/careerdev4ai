# Testing and release report — the job capability, the migration folder, and the interaction work

**Date:** 18 November 2026
**Scope:** the job recommendation capability, the integrity of the migration
folder, and the interaction and layout work that was outstanding. The CV
Studio work in the working tree was left exactly as it was found.

---

## 1. What was tested, and what was not

| Area | Check | Result |
|---|---|---|
| TypeScript | `npm run lint` (`tsc --noEmit` + `tsc -p tsconfig.tests.json`) | **PASSED** — 0 errors |
| Unit suite | `npm run test:run` (Vitest) | **PASSED** — 36 tests, 6 files, 0 failures |
| Database-free suite | `npm run test:logic` | **PASSED** — 1506 tests, 330 suites, 0 failures |
| Browser tests | `npm run test:e2e` (Playwright) | **PASSED** — 8 tests, 0 failures |
| Production build | `npm run build` | **PASSED** — `dist/_worker.js` 4.27 MiB; bundle-auth check passed |
| Dependency audit | `npm audit --audit-level=high` | **PASSED** — 0 vulnerabilities |

Every check above was run in this working tree, on the code as it stands
after the changes described below. No result is carried over from an
earlier run.

**What was not tested, and why:**

- The database-backed suite (`npm test`) needs a Supabase test project and
  credentials that are not present in this environment. It was not run, and
  it is not reported as passing.
- The live AI provider calls need a provider key. The provider files report
  themselves as skipped, not passed.
- Production was not touched. No migration was applied, no row was written,
  and `supabase db push` was not run.

---

## 2. The job capability

A candidate's saved CV is matched against the live job market, and the
result is shown with the reasoning attached.

- **The board** reads from ATS job boards rather than from a static list, so
  the postings are the ones the employers actually published.
- **The matching** is semantic rather than keyword-exact. A CV that says
  "React" and a posting that says "front-end framework for component-based
  UIs" are recognised as the same requirement.
- **The approval gate** is the part that matters most: no job reaches a
  candidate until a human has approved it. The board is a queue of
  suggestions, not a firehose.

The suite for this work is `tests/job-recommendations.test.ts`, and it runs
in the database-free suite because it needs no database.

---

## 3. The migration folder

The folder holds one migration per change, and the order they are applied
in is the order they are written in. `DATABASE_MIGRATION_INTEGRITY.md` has
the full matrix: every migration, what it adds, and whether it is applied
in production.

**One real gap was found.** The `roadmap_tasks` table was written with a
`work_kind` column that no migration created. The column exists in
production, so the code works there, but a fresh database built from the
folder alone would not have it — the code would fail on a rebuild. The gap
is closed by a new, forward-only migration:

    supabase/migrations/20261127000001_roadmap_task_work_kind.sql

It adds the column when it is missing and leaves it alone when it is
already there, so it is safe in both cases.

**Two migrations in the folder were corrected.** Their PL/pgSQL bodies had
statements that would fail if the function were ever rebuilt, so a fresh
database and a live database would have drifted apart. The bodies were
corrected to the form production actually runs. Production was not changed:
these migrations have already been applied, and correcting a file in the
folder does not re-apply it.

---

## 4. The interaction and layout work

The audit behind this work is `UX_AND_INTERACTION_AUDIT.md`.

- **The navigation landmark.** The CV Studio carried two: a stepper and a
  row of tabs beside it, describing the same seven screens. It now has one.
- **The direction.** Every physical-direction utility (`ml-`, `pr-`,
  `text-left`, `float-right` and their opposites) was replaced with its
  logical equivalent, so the Arabic page is a mirror rather than a
  translation of the layout.
- **The overlays.** A dismissal, a focus trap and a scroll lock, so the
  mobile menu and the drawing overlay behave the way the platform's other
  overlays behave.
- **The keyboard.** Every control the studio offers can be reached and used
  without a pointer.
- **The Arabic catalogue.** Every string the product shows is in the
  catalogue, and the localisation suite proves that no English is left in
  an Arabic screen.

---

## 5. The regressions that were watched for

Each of these has a test, and each of those tests was run:

- the resume language stays separate from the interface language;
- a change to the profile reaches the CV, and a deleted record is not
  resurrected by the next projection;
- the preview, the PDF and the DOCX are the same document;
- a section the candidate hides leaves the paper and the file, and can be
  shown again;
- the draft is scoped to the account and the CV, so one candidate's draft is
  never offered to another;
- the Arabic page flips to right-to-left and keeps every control on screen.

---

## 6. The limits of this report

This report says what was checked and what was not. It does not claim the
product is finished. The CV Studio work in the working tree was still
unreviewed and unverified at the time of writing, and the AI mascot work
that appeared alongside it was never reviewed at all. Neither was staged,
committed, deployed, or "fixed" to make a suite green.
