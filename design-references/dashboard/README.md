# Dashboard — visual references

This folder holds the visual references that informed this part of CareerDev4AI.

## Scope

References for the signed-in home screen: the welcome block, readiness, skill overview, roadmap status, learning, projects, applications, interviews, next best action and recent activity.

## What belongs here

A reference is recorded here only when it was actually inspected. For each one, note:

- the original source and the source URL
- the capture date
- the product area it applies to
- what makes the reference effective
- which elements to adapt and which **not** to copy (copyright and trademark)
- how it influenced the CareerDev4AI implementation

## Patterns adopted

- Answer "where am I and what next" before anything else.
- One primary recommendation, with its reason attached.
- Every card leads somewhere; no decorative widgets.
- Real data only — no fabricated progress or metrics.

## References

All captured **2026-11-04**. See the full visual reference index in [`../README.md`](../README.md#visual-reference-index) for why each is effective, what to adapt, and what not to copy.

| Ref | Source URL | Note |
| --- | --- | --- |
| V1 | https://wuzzuftop.com/ | Match card with a labelled match bar and a skills-match percentage |
| V3 | https://emekly.com/ | Single quantified hero object; `font-feature-settings: 'tnum'` counters |
| V8 | https://roadmap.sh/ | Progress rendered on the card itself |
| V6 | https://www.tealhq.com/ | Capability-tile grid, 48px `rounded-full` icon tiles |
| V4 | https://usamif.com/ | "Illustrative example" badge on any demoed figure |

## Current implementation

`src/components/views/DashboardView.tsx`, `src/components/views/ProgressView.tsx`, `src/components/layout/AppShell.tsx` (sidebar + copilot drawer + global search).

## Open work

- Promote a single readiness object — ux-analysis **D1**.
- Match bars for job/skill scores — ux-analysis **D2** + gap **G8**.
- Move getting-started behind progress once data exists — ux-analysis **D3**.
- First real chart — gap **G2**.

## Method

No competitor image is embedded in the product and no protected asset is downloaded into the
repository. References are recorded as links plus written analysis. Where a page could not be
loaded, that is recorded as such rather than filled in from memory.

The shared research these references came from is in [`../research/`](../research/).
