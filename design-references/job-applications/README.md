# Job Applications

Job matching, the pipeline, and application tracking.

## What belongs here

- The job list and its filters.
- The match score and its breakdown.
- The application pipeline: list view, **Kanban board**, and funnel.
- Stage model, transitions, and what a card shows (company, role, deadline, next action).
- Application packages: CV variant, cover letter, notes (`server/db/applicationPackages.ts`, `server/db/coverLetters.ts`).
- Follow-up and reminder surfaces.
- Activity timeline per application.

## Current implementation

`src/components/views/JobsView.tsx`, `src/components/views/ApplicationsView.tsx`.
Engine: `server/db/jobApplications.ts`, `server/db/applicationPackages.ts`, `server/db/coverLetters.ts`, `server/db/savedRoles.ts`, `server/db/bookmarks.ts`, `server/db/activities.ts`, `shared/opportunities.ts`, `shared/skillMatching.ts`.

**Verified gap:** the stages are persisted, but the view is a **stage-based list, not a board**. No Kanban projection, no funnel, no per-application next-action date.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V18 | https://github.com/aniisabihi/NextRole | The de-facto spec: keyboard-operable Kanban, transition matrix, "Showing N of M" banner, `aria-pressed` filters, 44px targets |
| V5 | https://www.careerflow.ai/ | Job Tracker, job autofill, networking tracker, per-item badges |
| V6 | https://www.tealhq.com/ | "One email template per job stage" — a simple, legible reminder model |
| V19 | https://github.com/AlexSilka/application-tracker | Conversion funnel over an append-only event timeline |
| V20 | https://github.com/arish-tayalan/job-tracker | Kanban + interview log + follow-up flag on open applications |
| V1 | https://wuzzuftop.com/ | Match bar and per-country job data |

## Design rules

- **Drag-to-change-stage is not the only way.** Every board action must also be reachable from a "Move to" menu — keyboard and touch both.
- The list view remains the **source of truth**; the board is a projection over the same records. Never let a drag mutate data that the list disagrees with.
- A card shows: company, role, stage, deadline, next action, and the CV variant's match score.
- Deadlines are a distinct visual role — not the danger red (that means failure). Use `--color-warning` for "due soon" and `--color-danger` only for overdue-and-stale.
- Filters report what is shown relative to what is loaded, and say so.

## Open work

- Kanban board + funnel — gap **G1**.
- CV variant bound to the application — gap **G19**.
- Per-application next action and reminder — gap **G17**.
- Match bar on every job card — gap **G8**.
