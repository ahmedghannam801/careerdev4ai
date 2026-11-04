# Design System

Tokens, component conventions, and the RTL rules that govern everything else.

## What belongs here

- The colour token set and the **role** model (a role, never a raw hex).
- Typography scale, font stack, and the Arabic typography rules.
- Spacing rhythm, radius scale, elevation scale.
- Card anatomy and the shared state components.
- Iconography rules.
- Chart styling.
- Dark vs light surface hierarchy.
- RTL mirroring rules and logical-property usage.
- The token implementation checklist.

## Authoritative document

> **`research/visual-decisions.md` is the spec.** This directory is where component-level conventions, token diffs and new patterns are filed as the design system matures.

## Current implementation

`src/index.css` is the single source of truth for colour, elevation and the theme switch (`.dark` on `<html>`).

Existing and **preserved**:
- Brand primary (terracotta orange) `--color-primary: #B94736` / dark `#D66A58`, with `--color-primary-hover`, `--color-primary-text`, `--color-on-primary`.
- AI accent violet `--color-ai: #5F4F86` with `--color-ai-text`, `--color-ai-surface`, `--color-ai-border` — scoped by an explicit comment in the source as *"an accent role, never a second brand colour"*.
- Verified success `--color-success-strong: #4F6B49`; danger `--color-danger: #B3261E`; warning `--color-warning: #8A5A0F`.
- Surfaces `--color-background` `#F5F0E8` / `#1C201E`, `--color-surface` `#FFFFFF` / `#282B29`, `--color-surface-secondary`, `--color-surface-elevated`, `--color-surface-elevated-alt`.
- Text `--color-text` `#282B29`, `--color-text-secondary` `#686D76`, `--color-text-muted` `#656A71`.
- Borders `--color-border` `#E1DDD5` / `#3D433F`, `--color-border-strong`.
- Elevation `--shadow-card`, `--shadow-raised`, `--shadow-overlay` (all derived from `--color-text` via `color-mix`).
- Print `--color-print-primary`.
- Legacy alias block (`--bg-main`, `--surface-main`, `--text-primary`, `--border-subtle`, `--accent-primary`, …) which resolves to the same semantic values.

Shared UI primitives: `src/components/ui/EmptyState.tsx`, `src/components/ui/Skeleton.tsx`, `src/components/ui/AiLanguageSelector.tsx`, `src/components/ui/CareerPilotAvatars.tsx`.

## Measured conventions (from `src/`)

- **Type:** `text-xs` 547 · `text-sm` 136 · `text-base` 61 · `text-2xl` 52 · `text-3xl` 19 · `text-lg` 13 · `text-xl` 12 · `text-4xl` 3 · `text-5xl` 1.
- **Radius:** `rounded-lg` 280 · `rounded-xl` 195 · `rounded-2xl` 119 · `rounded-full` 56 · `rounded-md` 20 *(retire)*.
- **Gap:** `gap-1` 233 · `gap-2` 214 · `gap-3` 82 · `gap-4` 65 · `gap-6` 15 · `gap-8` 5.
- **Padding:** `p-6` 86 · `p-4` 81 · `p-3` 78 · `p-1` 32 · `p-5` 25 · `p-8` 21 · `p-2` 24 · `p-10` 4.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V10 | https://ui.shadcn.com/docs/theming | Semantic `name`/`name-foreground` pairing; `chart-1..5` role names. **Do not copy the neutrals.** |
| V1 | https://wuzzuftop.com/ | A published palette with names, a 7-step spacing scale, and five named shadow levels |
| V6 | https://www.tealhq.com/ | Radius as a signature; rounded icon tiles; a deliberate high-contrast CTA colour |
| V3 | https://emekly.com/ | The inset top-highlight recipe and the hover-lift + icon-colour-shift pair |
| V9 | https://www.coursera.org/ | CDS token families — the naming discipline to continue |
| V13 | https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html | The mirror / do-not-mirror table |
| V14 | https://www.webversearena.com/blog/arabic-website-design-rtl-best-practices-2026 | Logical properties, Arabic line-height, letter-spacing 0 |
| V12 | https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/designing_accessible_dashboards.html | The 3:1 / 4.5:1 contrast contract |

## Standing rules

1. **The brand-orange primary is preserved.** Nothing in this library replaces it. The AI violet is never a primary CTA.
2. **Colour by role, never by hue name.** A component may only reference a token.
3. **Logical properties everywhere.** `ms-`/`me-`/`ps-`/`pe-`/`inset-inline-*`/`text-start`. No physical left/right.
4. **Direction is set once**, on `<html>`, at `src/context/CareerContext.tsx:2465`.
5. **One radius per element**; nested surfaces use a smaller radius than their parent.
6. **Three shadows, one per elevation level.** Shadows are derived from `--color-text`.
7. **Every empty state names what is missing, says what happens next, and offers the one action that fills it** — already encoded in `src/components/ui/EmptyState.tsx`.
8. **Every skeleton preserves layout and disables its shimmer under reduced motion** — already encoded in `src/components/ui/Skeleton.tsx`.
9. **Uppercase overlines are Latin-only.** Disable in Arabic.
10. **Arabic minimum font-weight is 400.** Arabic letter-spacing is always 0.

## Token checklist

See `research/visual-decisions.md` §11 for the exact CSS to add: `--space-1..14`, `--radius-*`, `--chart-1..5` (light and dark), `--font-feature-numeric`, plus the RTL typography rules.

The dark AI set is already complete and needs no change: `--color-ai: #A893D4`, `--color-ai-text: #B7A5DE`, `--color-ai-surface: #2A2535`, `--color-ai-border: #3E3552`. Note `--color-on-primary` is `#1C201E` in dark mode (dark text on the light terracotta fill) and `#FFFFFF` in light mode — that asymmetry is deliberate.
