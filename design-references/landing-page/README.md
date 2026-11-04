# Public website — visual references

This folder holds the visual references that informed this part of CareerDev4AI.

## Scope

References for the public, pre-registration site: hero composition, the interactive product preview, the feature grid, the trust section, the FAQ, the contact section and the footer.

## What belongs here

A reference is recorded here only when it was actually inspected. For each one, note:

- the original source and the source URL
- the capture date
- the product area it applies to
- what makes the reference effective
- which elements to adapt and which **not** to copy (copyright and trademark)
- how it influenced the CareerDev4AI implementation

## Patterns adopted

- Hero: one promise, one primary action, one real product view beside the copy.
- Product preview: real product state beats a screenshot; the preview must be operable.
- Feature grid: each card names the in-app area it maps to, so the promise is traceable.
- Trust: state how conclusions are reached and what cannot be guaranteed.
- FAQ: answer from the product as it is, including the things it does not do.
- Footer: every entry is a real link with a real destination.

## References

All captured **2026-11-04**. See the full visual reference index in [`../README.md`](../README.md#visual-reference-index) for why each is effective, what to adapt, and what not to copy.

| Ref | Source URL | Note |
| --- | --- | --- |
| V2 | https://mafeshsho8l.com/ | No-account first value, trust row, sticky glass header, EGP pricing |
| V4 | https://usamif.com/ | Skip link, "Illustrative example" badges, `/trust` + `/ai-use` pattern |
| V3 | https://emekly.com/ | Gradient hero, inset-highlight icon tiles, hover lift |
| V5 | https://www.careerflow.ai/ | Badge-driven mega-menu, free-tool ladder, geo-IP pricing |
| V1 | https://wuzzuftop.com/ | RTL-native hero, chat-first CTA, "completely free" badge |
| V9 | https://www.coursera.org/ | CDS token naming, taxonomy nav, credential-as-paywall model |

## Current implementation

`src/components/views/LandingView.tsx`, `src/components/brand/CareerJourneyVisual.tsx`.
Section components: `src/components/landing/` — `ProductPreview.tsx`, `FeatureGrid.tsx`, `TrustSection.tsx`, `FaqSection.tsx`, `ContactSection.tsx`.
Locale strings: `src/translations/parts/landing.ts`; contact data: `shared/contact.ts`.
Public routes are served by `server/seo/publicPages.ts`; structured data by `server/seo/jsonld.ts`.

> **Snapshot note:** the landing surface was under active modification by another agent during this research pass (2026-11-04, 12:58–13:09). The file list above reflects the state at 13:16. Re-verify before acting on it.

## Method

No competitor image is embedded in the product and no protected asset is downloaded into the
repository. References are recorded as links plus written analysis. Where a page could not be
loaded, that is recorded as such rather than filled in from memory.

The shared research these references came from is in [`../research/`](../research/).
