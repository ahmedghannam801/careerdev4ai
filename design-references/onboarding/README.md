# Onboarding — visual references

This folder holds the visual references that informed this part of CareerDev4AI.

## Scope

References for registration and the personalised onboarding wizard: persona selection, progress indication, save-and-resume, back navigation and skip behaviour.

## What belongs here

A reference is recorded here only when it was actually inspected. For each one, note:

- the original source and the source URL
- the capture date
- the product area it applies to
- what makes the reference effective
- which elements to adapt and which **not** to copy (copyright and trademark)
- how it influenced the CareerDev4AI implementation

## Patterns adopted

- One decision per step, with a visible reason the step exists.
- Progress that shows where the user is and what is left.
- Optional steps are genuinely optional and say so.
- No step asks for information the product will not use.

## References

All captured **2026-11-04**. See the full visual reference index in [`../README.md`](../README.md#visual-reference-index) for why each is effective, what to adapt, and what not to copy.

| Ref | Source URL | Note |
| --- | --- | --- |
| V7 | https://www.careerexplorer.com/ | 01/02/03 stepper with a persistent progress bar; staged question model |
| V4 | https://usamif.com/ | Intent-routed entry; `role="status"` feedback; "not a live AI conversation" honesty |
| V2 | https://mafeshsho8l.com/ | `/try` — real value before signup, with the free limit stated up front |
| V1 | https://wuzzuftop.com/ | Chat-first hero CTA into the AI assistant |
| V5 | https://www.careerflow.ai/ | Free-utility ladder that warms a user before signup |

## Current implementation

`src/components/views/OnboardingView.tsx`, `shared/onboarding.ts`, `shared/targetRoleSelection.ts`, `src/translations/parts/onboarding.ts`.

## Open work

- Numbered stepper + progress bar — ux-analysis **P3**.
- Intent-routed branching — ux-analysis **O2**.
- Conversational entry via the copilot — ux-analysis **O4**.
- `role="status"` announcement of AI results — ux-analysis **O5**.

## Method

No competitor image is embedded in the product and no protected asset is downloaded into the
repository. References are recorded as links plus written analysis. Where a page could not be
loaded, that is recorded as such rather than filled in from memory.

The shared research these references came from is in [`../research/`](../research/).
