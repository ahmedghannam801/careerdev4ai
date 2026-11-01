# Platform Audit — What Was Broken and How It Was Fixed

**Audit date:** 2026-11-01
**Scope:** the whole CareerPilot AI platform — `app.ts` API (81 routes), `src/` React
frontend (21 views), `server/` domain modules, `shared/` engines, `worker/`, and the
`supabase/migrations/` schema against the live database (`ciihprsfdojzvjnqgbxl`).
**Method:** source reading with file:line evidence, live-database inspection
(`information_schema`, `pg_policies`, `pg_class`, `storage.buckets`), and the
repository's own 534-test suite.

Every change below is additive or corrective. **No user row was deleted, no table was
dropped, and no production data was invented.** The single migration applied to the
live database is `20261101000001_certificate_details_and_skills.sql`, which adds one
nullable column and one new join table.

---

## 1. Certificates could not carry a description or the skills they produced

### What was broken

The platform spec requires every certificate to carry a description and the skills
or tools it gained. Neither existed anywhere in the stack:

| Layer | Before | Evidence |
|---|---|---|
| Database | `profile_certifications` had `name, issuer, issue_date, expiry_date, url, credential_id` — no `description`, no skill link | `supabase/migrations/202510200001_domain_schema.sql` |
| Server DTO | `CertificationDTO` had no `description` and no skills | `server/db/profileExtensions.ts:21` |
| Client type | `UserCertificationEntry` had no `description`, no `skills` | `src/types/career.ts:601` |
| Profile → CV | The CV source was built with a hardcoded empty description: `description: ''` | `src/context/CareerContext.tsx:2399` |
| CV projection | `certificationDetails` carried only id/name/issuer/issueDate/description | `shared/cvProjection.ts:304` |

The result was that a certificate's description could never be written, so it could
never reach the CV — the field existed in the CV layer and was always empty.

### How it was fixed

1. **Migration** `supabase/migrations/20261101000001_certificate_details_and_skills.sql`
   - `ALTER TABLE public.profile_certifications ADD COLUMN IF NOT EXISTS description text`
   - New table `public.profile_certification_skills (certification_id, skill_id, skill_name)`
     mirroring the existing `project_skills` / `evidence_skills` pattern, so a skill
     name cannot drift between a project, a piece of evidence and a certificate.
   - RLS enabled with four owner-scoped policies that resolve the owner through
     `profile_certifications.profile_id = auth.uid()`.
   - **Applied to the live database and verified** — the column and the table exist.

2. **Server** `server/db/profileExtensions.ts` — `CertificationDTO` gains
   `description` and `skills`. New `skillsForCertifications`, `resolveSkillIds` and
   `replaceCertificationSkills` helpers. `createCertification` and
   `updateCertification` write the description and replace the skill links.

3. **Ownership on skill-only updates** — `updateCertification` now resolves the
   owning row *before* touching the child table. Without that check a PATCH carrying
   only `skillNames` for another user's certificate id would have rewritten that
   user's links, because the parent row itself is never touched by a skill-only
   update. `server/db/profileExtensions.ts`.

4. **Client** — `src/lib/coreApi.ts` (`description`, `skillNames` on POST and PATCH),
   `src/types/career.ts`, `src/lib/roadmapApi.ts`, `src/context/CareerContext.tsx`
   (mapper, hydration, reconcile and CV-source mapping).

5. **Shared CV layer** — `shared/cvDocument.ts` (`CvSourceCertification` and the
   document builder), `shared/cvProjection.ts` (the record → document merge),
   `server/cv/buildCv.ts` (`BuiltCvCertification`).

6. **Interface** `src/components/views/ProfileView.tsx` — the certificate card now
   shows the description and the skill chips, and the modal has a Description field
   and a comma-separated "Skills & Tools Gained" field.

**Behaviour now:** a change to a certificate in the profile reaches the CV on its own.
Nothing has to be retyped in the CV editor.

---

## 2. A certificate could not be edited, and had no expiry-date input

### What was broken

The certificate card had a **delete** button and no **edit** button — a certificate
could be created and removed but never corrected. Separately, the modal had no
**expiry date** field, even though the spec lists "Expiration date if applicable" as
a required certificate field, the column existed in the database
(`expiry_date`, added by `202510200003_core_domain_completion.sql`), and the server
validated it.

A user who entered the wrong issue date, or who wanted to record that a certificate
had expired, had no way to do either.

### How it was fixed

- Added an edit button to each certificate card (`src/components/views/ProfileView.tsx`)
  that loads the record into the form.
- Added an **Expiry Date** input to the modal, with the placeholder "Leave blank if it
  never expires".
- The modal title now reads "Edit Professional Certification" when editing.
- The form state and the reset path were extended to carry `description` and `skills`.

---

## 3. The CV importer turned CV sentences and contact details into certificates

### What was broken

This was the most damaging defect found, because it puts **false claims on a user's
CV**. The old parser accepted every line in the certifications section as a
certificate name, subject only to a length check and a heading check.

The live database shows what that produced. Of 106 certificate rows, 105 have no
issue date, and the names include:

| Imported as a "certificate" | What it actually is |
|---|---|
| `KEY ACHIEVEMENTS` | a section heading |
| `Automation.` | the end of a bullet |
| `AI) serving 200+ active members.` | a mid-sentence fragment |
| `Led 15+ community workshops reaching 200+ participants as cross-functional volunteer team supervisor.` | an achievement bullet |
| `Eliminated 100% of manual certificate creation through the automated Digital Certificate Engine.` | an achievement bullet with a metric |
| `(+20)-1094736652\| Ashmoun, Menoufia` | a phone number and a city |
| `\| Portfolio: yasminnazih-portfolio.vercel.app` | a link |
| `\| View PDF \| Independent Project` | a UI fragment |
| `OSPF, VLANs, Inter-VLAN Routing, STP, EtherChannel, DHCP, DNS, NAT/PAT, HTTP, FTP` | a bare skills list |
| `Skills: Incident response lifecycle, digital forensics methodology, cybersecurity operations. ID: 6IQXT6UDGUX6` | a skills line |

A user who imports their CV was shown a list of credentials they never earned, and
could import them onto their profile.

Import is **additive with de-duplication** — a name that already exists is skipped,
never replaced — so the junk rows never healed themselves. Re-importing with the old
parser would have added more, not fewer.

### How it was fixed

`server/cv/parseStructuredCv.ts` — the parser now decides what a qualification is
before it records one:

- **A qualification is a noun phrase.** Lines ending in `.`, `!` or `?`, lines
  containing a percentage, and lines opening with a past-tense verb are rejected.
- **Contact information is never a certificate.** Phone numbers, email addresses and
  URLs are rejected, both as the whole line and as the name part.
- **Known non-certificates are rejected**: "View PDF", "Portfolio…", "Skills:…",
  "Key Achievements", section headings.
- **Structure is recognised.** The line is split on the separators the CV actually
  used (a column bar, an en/em dash), and the facts are read out of it:
  - the **first** part is the name — nothing after it can become the name, so
    "Google Data Analytics Professional Certificate" stays a name and is never turned
    into a claim that Google issued it;
  - a distinct part that names an issuing body becomes the **issuer**;
  - a month-and-year or a bare year becomes the **issue date**;
  - a comma-separated list of short tool names becomes the **skills**;
  - a `Student ID:` / `Credential ID:` becomes the **credential identifier**;
  - anything else becomes the **description**.
- **A line must earn its place.** A candidate is scored on certificate wording, an
  issuing body, a date, structure and tools; below the bar the line is dropped.

`tests/certificates.test.ts` locks this in with nine behavioural tests.

**Not changed:** the 106 existing rows were deliberately left alone. They belong to
real users, and the brief was to preserve existing records. Because certificates are
now editable, a user can correct their own list; the fix prevents new junk and makes
the old junk correctable.

---

## 4. Skill gaps ignored the evidence the platform already holds

### What was broken

The spec requires skill gaps to be calculated from the target role's requirements,
the user's actual skills **and verified evidence**, and states that a required skill
must not be treated as owned without evidence.

The gaps were computed from the candidate's self-ratings alone:

```ts
// server/roadmap/service.ts — before
const skills = await getUserSkills(profileId);
const ratedSkills = skills.map((row) => ({ name: row.skill?.name ?? '', level: row.proficiency ?? 1 }));
const gaps = computeSkillGaps(requirements, ratedSkills);
```

`shared/skillGap.ts` had no notion of evidence. Meanwhile the platform *did* hold the
evidence — `project_skills`, `course_skills`, `evidence_skills` — and read none of it
when working out a gap.

Two concrete consequences:

1. A skill the candidate had actually earned — a completed course, a project they
   built — did **not** close the gap unless they also went and rated it by hand.
2. The interface advertises proof it did not have. `UserSkill.evidenceIds` was
   hardcoded to `[]` in three places (`src/context/CareerContext.tsx:1489`,
   `src/components/views/SkillsCenterView.tsx:76`, `src/context/CareerContext.tsx:4797`),
   so the **"Verified"** badge could never render and the
   **"verified with evidence"** counter in `src/components/views/CareerAnalysisView.tsx:78`
   always read zero.

### How it was fixed

- **New module** `server/db/skillEvidence.ts` — reads the four kinds of record that
  show what the candidate has done and reports the level each supports:
  evidence item → 4, project → 3, completed course → 2, certificate → 2. Each read
  is independent, so a failure in one does not hide the others.
- **Gap engine** `shared/skillGap.ts` — `computeSkillGaps` takes an optional
  `evidenceLevels` map. The effective level is `max(claimed, evidence)`: **evidence
  raises a skill and never lowers one**, so a candidate is not punished for a stale
  rating, and doing the work counts even when the rating was never updated. Each gap
  now carries `verified` and `verifiedLevel`.
  The parameter is optional, so every existing caller keeps its previous behaviour.
- **Server** `server/roadmap/service.ts` — the gap summary now reads the evidence.

**What was deliberately not done.** Making an unevidenced claim *fail* to close a gap
would have been the strictest reading of the spec, but it was rejected on the
production data: `evidence_items` holds **0 rows** and `user_skills` holds 476 rows
across 40 users. That change would have collapsed every existing user's readiness
score to near zero. Evidence is therefore implemented as a positive signal that
raises a skill, and the strict requirement is recorded as an open item in the QA
report rather than silently applied.

---

## 5. Seven RTL defects that did not flip with the language

### What was broken

The app is bilingual and Arabic-first; `src/context/CareerContext.tsx:2309` sets
`dir="rtl"` on the root as soon as the account's language says so, and the codebase
overwhelmingly uses logical properties (`ps-`, `pe-`, `ms-`, `me-`), which flip
automatically. The remaining physical utilities did not:

| Location | Problem |
|---|---|
| `src/components/copilot/CopilotDrawer.tsx:38` | The drawer is positioned at `end-0` (correct, flips) but carries `border-l` — in Arabic the border sat on the outer edge, away from the content |
| `src/components/notifications/NotificationsDrawer.tsx:24` | Same defect |
| `src/components/layout/AppShell.tsx:154` | The sidebar uses `border-r`; in RTL the flex row reverses and the sidebar moves to the right, putting the border on the outside |
| `src/components/views/ApplicationsView.tsx:231` | `<table className="w-full text-left">` — table text hardcoded to the left |
| `src/components/views/ApplicationsView.tsx:238` | The Actions column header used `text-right` |
| `src/components/views/ApplicationsView.tsx:265` | The Actions cell used `text-right` |
| `src/components/views/DashboardView.tsx:213` | A clickable card used `text-left` |

### How it was fixed

`border-l` → `border-s` (the drawers sit at the end edge, so the divider belongs on
the start edge), `border-r` → `border-e` (the sidebar's divider belongs on its end
edge), and `text-left` / `text-right` → `text-start` / `text-end`.

---

## 6. Three fixed-width grids that broke on a phone

### What was broken

The codebase is careful about responsive grids — 33 grid declarations were checked
and 30 of them are responsive. Three were not, and all three break at 320 px:

| Location | Problem |
|---|---|
| `src/components/cv/CVImportModal.tsx:235` | A 3-column tab switcher with an icon and a label per tab, inside a modal that is 240 px of usable width at 320 px. The buttons needed ~104 px each and had ~75 px. |
| `src/components/views/SettingsView.tsx:627` | 3 columns for `focused` / `balanced` / `comprehensive` — "comprehensive" alone needs ~85 px of a ~91 px column. |
| `src/components/views/OnboardingView.tsx:492` | 3 stat tiles with no `min-w-0`, so a long value could not shrink. |

### How it was fixed

- The import modal's tab row became a horizontally scrollable flex row with
  `min-w-[5.5rem]` per tab, `whitespace-nowrap` labels and `shrink-0` icons. Nothing
  is clipped and nothing is truncated.
- The settings level buttons got `px-1 sm:px-2` and `text-[11px] sm:text-xs`.
- The onboarding stat tiles got `p-2 sm:p-3` and `min-w-0`.

---

## 7. Two views rendered a blank area instead of an empty state

### What was broken

`src/components/ui/EmptyState.tsx` exists and is well designed — it names what is
missing, says what to do next, and can offer the one action that fills it. It was
used in **2 of 21 views**.

Two views that can legitimately be empty rendered nothing at all:

- `src/components/views/ProjectsView.tsx` — `filteredProjects.map(...)` inside a bare
  grid. A user with no projects saw a filter bar and blank space.
- `src/components/views/EvidenceView.tsx` — `filtered.map(...)` with no length check
  anywhere in the file.

### How it was fixed

Both now render the shared `EmptyState`, distinguishing "you have none" from "you
have none *with this filter*", and offering the action that resolves it
("Add your first project" / "Add your first evidence") — which opens the modal the
view already had.

---

## 8. A test asserted the old certificate contract

### What was broken

`tests/cv-pipeline.test.ts` asserted the exact shape of `certificationDetails`. The
parser now legitimately produces three more fields, so the assertion failed with
`actual: [...], expected: [...]`.

### How it was fixed

The test was extended to the new contract rather than weakened — the old assertion
still checks the same three fields, and the three new ones are now pinned too.

---

## Files changed

| Area | Files |
|---|---|
| Schema | `supabase/migrations/20261101000001_certificate_details_and_skills.sql` *(new)* |
| Server | `server/db/profileExtensions.ts`, `server/db/skillEvidence.ts` *(new)*, `server/cv/parseStructuredCv.ts`, `server/cv/buildCv.ts`, `server/roadmap/service.ts`, `app.ts` |
| Shared | `shared/skillGap.ts`, `shared/cvDocument.ts`, `shared/cvProjection.ts` |
| Client | `src/context/CareerContext.tsx`, `src/lib/coreApi.ts`, `src/lib/roadmapApi.ts`, `src/types/career.ts` |
| Views | `ProfileView`, `ProjectsView`, `EvidenceView`, `ApplicationsView`, `DashboardView`, `OnboardingView`, `SettingsView`, `CVImportModal`, `AppShell`, `CopilotDrawer`, `NotificationsDrawer` |
| Translations | `src/translations/parts/profile.ts`, `src/translations/parts/projects.ts` |
| Tests | `tests/certificates.test.ts` *(new)*, `tests/cv-pipeline.test.ts`, `tests/runner.mjs` |

**716 insertions, 59 deletions across 27 modified files, plus 3 new files.**
