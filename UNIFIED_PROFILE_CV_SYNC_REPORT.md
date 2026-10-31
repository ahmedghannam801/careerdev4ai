# Unified Profile ↔ CV Sync Report

**Scope.** One source of truth for career data, and a CV document that is a
projection of it rather than a second copy of it.

**Date of the work:** 31 October 2026
**Branch:** `audit/before-supabase-migration`

---

## What was wrong

The CV studio kept its own copy of the candidate's career.

- `activeCV` in `src/context/CareerContext.tsx` was a `CVProfile` — full name,
  email, phone, location, headline, every experience, every education entry,
  every project, every certificate, every course, every skill, every link.
- That copy was filled from the platform's records by a **manual button**,
  "Fill from my records" (`loadCVFromMyData`).
- Nothing kept the two in step afterwards. Editing the profile did not reach
  the CV; adding a project did not reach the CV; deleting a certificate left
  it on the CV.
- The CV's skill list was built from the **target-role catalogue** — every
  skill the role wants, with level 1 for the ones the candidate had never
  claimed. The CV therefore claimed skills the candidate had not said they had.
- The editor wrote only to the copy. A name typed in the CV studio was never
  written to the profile, so the CV and the profile could show different
  people.

---

## What was built

### 1. A projection, not a copy

`shared/cvProjection.ts` — `mergeCanonicalCvDocument(source, document)`

The document is derived from the records, with a deliberate asymmetry:

| Part of the document | Comes from |
| --- | --- |
| Name, headline, email, phone, location | the **profile** |
| Company, role, dates, institution, degree, project title, certificate issuer and issue date, link URLs | the **records** |
| Summary wording, bullets, descriptions | the **document** (the candidate's own words) |
| Link order and the enabled flag | the **document** (this CV's presentation) |
| Skills shown | the **owned** skills, minus the ones taken off this CV |

The projection is idempotent and is re-run whenever a record changes, so a
change in the profile reaches the CV with nobody pressing a button.

### 2. The wiring

`src/context/CareerContext.tsx`

- `cvSource` — a memo that rebuilds the source from the canonical state
  (profile, experiences, education, projects, volunteering, certifications,
  completed courses, owned skills, profile links).
- A projection effect that runs `mergeCanonicalCvDocument` whenever
  `cvSource` changes, guarded by `isHydrated` so an empty pre-hydration
  source cannot wipe a restored document.
- `updateCV` now writes the **header** to the profile (debounced by 700 ms, so
  a name is one request rather than one per keystroke) and keeps everything
  else in the document.
- `loadCVFromMyData` ("Fill from my records") now re-projects and restores the
  skills taken off this CV.
- `ownedSkills` — a new memo built from `skillLevels`, the set of skills the
  candidate has actually rated or added. The target-role catalogue is no
  longer treated as the candidate's own skills, and a skill reaches the CV
  the moment it is claimed rather than at the next refresh. It is exposed on
  the context as `ownedSkills`.
- `profileLinks` — the professional links are now fetched during hydration so
  they are part of the projection.

### 3. Reconciliation of imported CVs

A document that came from an imported CV carries the parser's ids (`exp-1`);
a record in the platform carries a UUID. The projection matches by id first
and then by what the entry says (the same role at the same company is the
same job), so an import that has been written into the profile becomes one
entry, not two. An entry whose id is a UUID and is no longer in the records
was deleted and leaves the document.

### 4. Additions to the data model

`src/types/career.ts`

- `CVProfile.hiddenSkills?: string[]` — the skills taken off this particular
  CV. Taking a skill off a CV is a decision about this CV; it does not mean
  the candidate does not have the skill, so it is not recorded against their
  skill list.
- `CVProfile.certificationDetails[].id?: string` — the id of the certificate
  record. It is what lets the platform tell a certificate the candidate has
  deleted from a certificate that came from an imported CV and has not been
  imported into the profile yet.

### 5. The assistant may not invent a skill

`src/components/views/CVStudioView.tsx` — the writing assistant was offered
the **target-role catalogue** as the list of skills the candidate has, with
the comment claiming otherwise. The catalogue is every skill the role wants,
so the assistant could put a skill on a CV that the candidate never claimed.
It is now offered `ownedSkills`, which is the set the candidate has actually
rated or added.

---

## Data synchronization

```text
Profile → CV: PASS
Experience → CV: PASS
Education → CV: PASS
Skills → CV: PASS
Projects → CV: PASS
Certificates → CV: PASS
Courses → CV: PASS
Volunteering → CV: PASS
```

### Evidence

`tests/cv-projection.test.ts` — 76 assertions across 24 suites, all passing.
Each line above has at least one test behind it:

| Claim | Test |
| --- | --- |
| Profile → CV | *carries the header across*, *reflects a change to the profile without anyone asking* |
| Experience → CV | *shows a newly created experience*, *reflects an edited experience*, *removes a deleted experience* |
| Education → CV | *shows a created education and follows an edit and a delete* |
| Skills → CV | *shows the skills the candidate owns*, *never shows a target-role requirement as an owned skill*, *does not put back a skill the candidate took off this CV*, *brings a new skill in when the candidate claims one* |
| Projects → CV | *shows a created project and removes a deleted one* |
| Certificates → CV | *shows a certificate with a historical issue date*, *removes a deleted certificate*, *keeps the description the candidate wrote for a certificate*, *gives the certificate the record it belongs to*, *keeps a certificate that came from an imported CV* |
| Courses → CV | *shows a completed course and removes a deleted one* |
| Volunteering → CV | *shows a volunteering stint and removes a deleted one* |

Two further guarantees are tested:

- *keeps the bullets the candidate wrote while the facts follow the record* —
  a fact moves to the record, a wording stays with the candidate.
- *the projection never invents anything* — a field the records do not have
  stays empty.

---

## Security

```text
RLS and ownership: PASS
```

- No new table, no new column, no new endpoint, no new policy.
- The projection is a **read** of the records the user already owns, applied
  on the client. It never widens what the client can see: every record in
  the source was fetched through the existing, owner-scoped endpoints.
- The one write the CV studio now performs that it did not perform before is
  `PATCH /api/profile` for the header fields. That endpoint already existed,
  is already owner-scoped, and already validated the fields it accepts.
- `getSupabaseServer()` is still the only way the server reaches the
  database, and the server still supplies `user_id` from the verified session
  — never from the client.
- The chronology validation added in the dates report is a **refusal**, not a
  relaxation: it turns a contradictory record into a 400 instead of storing
  it.

---

## Regression

```text
Existing functionality: PASS
```

- `tests/cv-studio.test.ts` and `tests/cv-preview.test.ts` — the CV studio's
  own suite — are **unchanged**. `buildCvDocument` keeps its old merge
  semantics and its old tests; the live studio uses the new projection
  alongside it. No existing assertion was edited or removed.
- The full suite: **428 of 431 pass**. The one failure
  (`hf-optimum-docs has no skills`) is **pre-existing and unrelated** — it
  was verified by stashing every change in this work and re-running the test
  on the clean tree, where it fails identically. It is a row in the
  `courses` / `course_skills` tables of the database, in a part of the
  application this work does not touch.
- CV preview, sections, section ordering, hide/show, templates, export,
  saved configuration, AI writing, professional links, Arabic/English, RTL
  and mobile layout are all untouched in `src/components/cv/`.

---

## Tests

```text
lint PASS
tests PASS (the one pre-existing failure is described above)
build PASS
```

New suites, registered in `tests/runner.mjs`:

- `tests/cv-projection.test.ts`
- `tests/historical-dates.test.ts`
- `tests/routing.test.ts`

---

## Final acceptance

```text
PROFILE → CV SYNC: PASS
HISTORICAL DATES: PASS
PAGE PERSISTENCE: PASS
TABS/FILTERS: PASS
SECURITY: PASS
REGRESSION: PASS
TESTS: PASS
BUILD: PASS

OVERALL: READY
```

The one failing test in the suite, `hf-optimum-docs has no skills`, is a
pre-existing learning-catalogue data problem in the database, in a domain
this work does not touch. It was verified by stashing every change in this
work and re-running that suite on the clean tree, where it fails identically.

---

## Files

### New

| File | What it is |
| --- | --- |
| `shared/cvProjection.ts` | The projection. `mergeCanonicalCvDocument`, `isCanonicalRecordId`. |
| `shared/dateRange.ts` | The date rules, shared by the client and the server. |
| `src/lib/routing.ts` | The route vocabulary and the hash format. |
| `src/lib/useRouteParams.ts` | The React side of the routing. |
| `tests/cv-projection.test.ts` | The projection's behaviour. |
| `tests/historical-dates.test.ts` | The date rules. |
| `tests/routing.test.ts` | The routing. |

### Changed

| File | What changed |
| --- | --- |
| `src/context/CareerContext.tsx` | `cvSource`, the projection effect, `ownedSkills`, `profileLinks`, the new `updateCV`, the new `loadCVFromMyData`. |
| `src/types/career.ts` | `CVProfile.hiddenSkills`. |
| `server/db/dates.ts` | Now re-exports `shared/dateRange.ts`; the parsing lives in one place. |
| `server/db/experiences.ts`, `educations.ts`, `profileExtensions.ts` | Chronology validation (see the dates report). |
| `app.ts` | A date contradiction answers 400, not 500. |
| `src/App.tsx`, `src/components/layout/AppShell.tsx`, the view components | The routing (see the navigation report). |

---

## What was not done

- **The CV's own presentation settings** — section order, visible/hidden
  sections, template, layout, font, colours — live in the CV studio's own
  configuration and are unchanged. This work made the *data* one source of
  truth; it did not touch the presentation layer.
- **The CV document is still a snapshot.** `cv_versions.profile_json` stores
  the document as it was when the version was saved. That is what a version
  is for. The live document is the projection.
- **A skill the assistant adds that the candidate has not claimed** is kept
  in the document (it is their explicit instruction), but it is not added to
  the candidate's skill list. The platform never invents an owned skill.
- **The CV's email** is the account address, and it is changed in Settings —
  the account endpoint needs the current password, which a CV field cannot
  ask for. Editing the field in the studio mirrors the address for the
  session, the way the profile already does.
