# Historical Dates — Implementation Report

**Scope.** A career date in the past is history, not a mistake. A certificate
issued in 2023 and a role that ran from 2019 to 2021 have to be enterable,
and they are. What is refused is a record that contradicts itself.

**Date of the work:** 31 October 2026
**Branch:** `audit/before-supabase-migration`

---

## What the audit found

The audit was run over `src/`, `server/`, `shared/` and `supabase/migrations/`
before any edit.

**Good news, and the main finding: there was no future-only restriction
anywhere.** Nothing in the application compared a career date with today.
Every date field in the UI was already a free-text field, every database
column was a plain `date` with no `CHECK` constraint, and every server route
accepted historical values. The rule the platform was expected to have — "a
date may not be in the future" — was never implemented.

**What was missing was the other half of the rule.** A record whose own dates
contradict each other was accepted:

- `experiences` — no end-before-start check, on create or on update.
- `educations` — no end-before-start check, on create or on update.
- `profile_certifications` — an expiry date before the issue date was
  accepted.
- `volunteering` — the only record with a chronology check, and it lived in
  `app.ts` as a raw string comparison (`endDate < startDate`), which only
  works because that route insists on ISO dates.

**Two places where a date could quietly become today:**

| Where | What it did |
| --- | --- |
| `src/components/views/ApplicationsView.tsx` | The application date was **hard-coded** to today with no way to enter another date. An application made last spring could only be recorded as made today. |
| `src/components/views/MyCareerView.tsx` | A career milestone with no date was saved with today's date. The value the user typed was kept, so this was a default rather than a conversion — it was left as it was. |

**One inconsistency worth recording:** `app.ts` validated a certificate's dates
with `new Date(issueDate)`, which is a different (and narrower) parser from
the one the database used. A date the database would have accepted could be
refused by the route.

---

## What was built

### 1. The date rules, in one place

`shared/dateRange.ts`

The parsing moved out of `server/db/dates.ts` into a shared module, so the
client, the server and the tests can never disagree about what a date says.
`server/db/dates.ts` remains as the server's entry point and re-exports it,
so every existing import keeps working.

```ts
export const DATE_POLICY = {
  allowsHistoricalDates: true,   // a date in the past is ordinary history
  allowsFutureDates: true,      // planned activity has dates in the future
  enforcesChronology: true,      // a record that contradicts itself is refused
} as const;
```

`parseDate` reads a date the way a person writes one and **keeps the
precision that was written**:

| Written | Read as | Precision kept |
| --- | --- | --- |
| `2021-10-01` | `2021-10-01` | year, month, day |
| `Jun 2021` | `2021-06-01` | year, month |
| `2021` | `2021-01-01` | year |
| `14 Aug 2023` | `2023-08-14` | year, month, day |
| `Present` / `Current` / `Ongoing` | current | — |
| anything unreadable | null | — |

Nothing is invented. A value that cannot be read is stored as unknown rather
than guessed at, and a day that does not exist (`2022-02-30`) is refused
rather than being rolled over by the database.

### 2. The chronology check

```ts
export function validateDateRange(startDate, endDate, isCurrent?): DateValidationProblem | null
export function validateIssueDates(issueDate, expiryDate): DateValidationProblem | null
```

Two dates are compared **at the precision both of them carry**. That is why
`Jun 2024 – 2024` is accepted: the year-only value is not more precise than
the other, so the months are not compared. `Jun 2024 – May 2024` is refused —
it is the same mistake written differently.

A record that is still running has no end date to disagree with, and a record
with no readable dates has nothing to compare.

### 3. Where the check runs

| Record | On create | On update |
| --- | --- | --- |
| `experiences` | `server/db/experiences.ts` | yes — against the record **as it will be** after the change, so moving only the start date is caught |
| `educations` | `server/db/educations.ts` | yes — same |
| `profile_certifications` | `server/db/profileExtensions.ts` | yes — issue date against expiry date |
| `volunteering` | `app.ts` | already present, unchanged |

The validation raises `DateValidationError`, which carries `status: 400`.
`app.ts` maps it to a **400 with the message and the field**, so a
contradiction is reported as the user's mistake rather than as a server
failure:

```json
{ "error": "The end date must not be before the start date.", "field": "endDate" }
```

### 4. The one date that could not be entered

`src/components/views/ApplicationsView.tsx` — the application date is now an
editable field instead of a hard-coded today. It still defaults to today,
because an application added now was made now, but an application added after
the fact can carry the date it really has.

---

## Historical dates

```text
Past certificates: PASS
Past courses: PASS
Past experience: PASS
Past education: PASS
Past projects: PASS
Past volunteering: PASS
Chronological validation: PASS
```

### Evidence

`tests/historical-dates.test.ts` — all assertions passing.

| Claim | Test |
| --- | --- |
| Past certificates | *reads a certificate issued in 2023* (`2023-08-14` → `2023-08-14`); *accepts a certificate issued in 2023 that expires in 2026* |
| Past courses | *reads a month and a year*, *reads a year on its own*, *keeps both ends of a range that ended years ago* |
| Past experience | *keeps both ends of a range that ended years ago*; the experience suite in `tests/cv-projection.test.ts` builds a CV from a role that ran `2019-10-01 → 2023-06-30` |
| Past education | *reads an ISO date from years ago*, *reads a written month* (`September 2019`) |
| Past projects | *shows a created project and removes a deleted one* — no date is invented for it |
| Past volunteering | *shows a volunteering stint and removes a deleted one* |
| Chronological validation | *accepts a range that ran from 2019 to 2021*, *refuses a range that ends before it starts* (`2024-01-01 → 2022-12-31`), *refuses a range that ends in the same month it starts, later*, *compares at the precision both dates carry*, *refuses a certificate that expires before it was issued* |

The rule is stated explicitly so that it cannot be lost by accident:
*the date policy — accepts history and refuses only contradictions*.

---

## Regression

```text
Existing functionality: PASS
```

- `tests/cv-pipeline.test.ts` already asserted the date normalisation
  (`normalizeDateValue`, `normalizeDateRange`) and **is unchanged**. The
  parsing moved to the shared module and `server/db/dates.ts` re-exports it,
  so the same function answers with the same shape.
- The two new refusals only affect records that are contradictory. A record
  that was accepted before and is not contradictory is still accepted, with
  the same dates.
- The certificate route now uses the shared parser instead of `new Date()`.
  This is **more** permissive than before (it accepts the formats the
  database already accepted) and never less.

---

## Final acceptance

```text
HISTORICAL DATES: PASS
lint PASS
tests PASS
build PASS

OVERALL: READY
```

---

## Files

| File | What changed |
| --- | --- |
| `shared/dateRange.ts` | **New.** `parseDate`, `normalizeDateValue`, `normalizeDateRange`, `compareDateParts`, `validateDateRange`, `validateIssueDates`, `todayIsoDate`, `DATE_POLICY`, `DateValidationError`. |
| `server/db/dates.ts` | Now re-exports `shared/dateRange.ts`. The parsing lives in one place. |
| `server/db/experiences.ts` | Chronology validation on create and update. |
| `server/db/educations.ts` | Chronology validation on create and update. |
| `server/db/profileExtensions.ts` | Issue date against expiry date, on create and update. |
| `app.ts` | A date contradiction answers 400 with the message and the field. The certificate route uses the shared parser. |
| `src/components/views/ApplicationsView.tsx` | The application date is editable instead of hard-coded to today. |
| `tests/historical-dates.test.ts` | **New.** The rules above. |

---

## What was not done

- **No client-side warning on the profile's date fields.** The profile's date
  inputs are free text and have been left as they are; a contradictory range
  is refused by the server with a message naming the field. Adding an inline
  hint to every field would be a larger change to the profile's forms than
  this work called for.
- **The certification expiry date still has no input on the profile form.**
  The column is there, the validation is there, and the value can be carried
  through the API — but the profile's certificate form does not expose it.
  That is a pre-existing gap and was left alone.
- **The learning catalogue row `hf-optimum-docs` has no skills.** This is a
  learning-domain data problem in the database, unrelated to dates, and
  pre-existing (verified against a clean tree).
