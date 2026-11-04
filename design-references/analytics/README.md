# Analytics — visual references

This folder holds the visual references that informed this part of CareerDev4AI.

## Scope

References for progress measurement and the admin traffic panel: score composition, trend charts, and the boundary between a user’s own data and platform-wide reporting.

## What belongs here

A reference is recorded here only when it was actually inspected. For each one, note:

- the original source and the source URL
- the capture date
- the product area it applies to
- what makes the reference effective
- which elements to adapt and which **not** to copy (copyright and trademark)
- how it influenced the CareerDev4AI implementation

## Patterns adopted

- A score is meaningless without its breakdown beside it.
- Charts state the unit and the window.
- Unavailable data is shown as unavailable, never estimated.

## References

All captured **2026-11-04**. See the full visual reference index in [`../README.md`](../README.md#visual-reference-index) for why each is effective, what to adapt, and what not to copy.

| Ref | Source URL | Note |
| --- | --- | --- |
| V11 | https://www.ncsc.org/sites/default/files/media/document/Dashboard-Design-Guide_0.pdf | Chart craft: no gridlines, zero-based axes, no 3D, label the marks, colour means one thing only |
| V12 | https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/designing_accessible_dashboards.html | 3:1 for visualisations, 4.5:1 for text, text alternative for every chart |
| V19 | https://github.com/AlexSilka/application-tracker | Conversion funnel over an append-only event timeline; CSS tokens, no UI kit |
| V20 | https://github.com/arish-tayalan/job-tracker | The minimum viable metric set: totals, interview rate, status breakdown, per-week applications |
| V10 | https://ui.shadcn.com/docs/theming | The `chart-1..5` semantic role names to adopt |
| V22 | https://www.saasui.design/best-saas-dashboard-ui-inspiration | Real shipped analytics screens by type, including empty states |

## Current implementation

`src/components/views/ProgressView.tsx` computes roadmap %, mastered skills, completed projects and active applications, and renders **progress bars only**. `server/analytics/ga4.ts` collects site traffic for the admin surface; `shared/analyticsEvents.ts` defines the event vocabulary.

**Verified gap:** `package.json` contains no charting dependency, and a search of `src/` for `recharts|Chart|donut|sparkline` returns no chart usage.

## Open work

- Install a charting dependency and build **one** chart (applications funnel) — gap **G2**.
- Establish the `--chart-1..5` token pair in `:root` and `.dark` — `research/visual-decisions.md` §11.

## Method

No competitor image is embedded in the product and no protected asset is downloaded into the
repository. References are recorded as links plus written analysis. Where a page could not be
loaded, that is recorded as such rather than filled in from memory.

The shared research these references came from is in [`../research/`](../research/).
