# Visual Decisions — CareerDev4AI

**Decision date:** 2026-11-04
**Scope:** The visual language for CareerDev4AI. Implementable as-is.
**Companion documents:** [`competitor-analysis.md`](./competitor-analysis.md) · [`feature-benchmark.md`](./feature-benchmark.md) · [`ux-analysis.md`](./ux-analysis.md)

---

## 0. Brand preservation statement

> **CareerDev4AI's existing brand identity is preserved and is NOT replaced by this document.**

Every existing token in `src/index.css` keeps its current value and its current role. This document **adds** missing roles (spacing, radius, type scale, chart palette, AI surfaces) and **documents** the ones that already exist so they can be implemented consistently. It does **not** re-brand, re-colour, or re-theme the product.

**On the "brand orange" primary:** CareerDev4AI's brand primary is already a warm orange-red, defined as `--color-primary: #B94736` (terracotta). That token stays exactly as it is. It is referred to throughout this document as the **brand orange (terracotta)**. The brief's description of "brand orange as primary accent" is accurate against this token.

**One correction to the brief, stated plainly:** the brief describes "deep navy + charcoal dark surfaces". The implementation has **charcoal** dark surfaces only (`#1C201E`, `#282B29`, `#222623`, `#303531` — a green-leaning charcoal, verified at `src/index.css:113-117`). **There is no navy in the current palette.** Navy is documented in §1.4 below as an *optional, additive* dark surface family (sourced from the WuzzufTop palette, https://wuzzuftop.com/, captured 2026-11-04) — **not** as a replacement. The default dark theme remains charcoal.

**What is already correct and stays:**

| Existing token | Value (light) | Value (dark) | Status |
| --- | --- | --- | --- |
| `--color-primary` | `#B94736` | `#D66A58` | ✅ Preserved — brand orange (terracotta) |
| `--color-ai` | `#5F4F86` | *(inherits)* | ✅ Preserved — restrained violet for AI surfaces |
| `--color-success-strong` | `#4F6B49` | `#A8C5A0` | ✅ Preserved — verified success |
| `--color-danger` | `#B3261E` | `#F08C82` | ✅ Preserved — errors |
| `--color-background` | `#F5F0E8` | `#1C201E` | ✅ Preserved — warm cream / charcoal |
| `--color-surface` | `#FFFFFF` | `#282B29` | ✅ Preserved |
| `--shadow-card` / `--shadow-raised` / `--shadow-overlay` | — | — | ✅ Preserved |

**The AI violet is already correctly scoped.** `src/index.css:54-63` states the rule in the source itself: *"It is an accent role, never a second brand colour: it is never used for a primary call to action."* **This rule is binding and must not be relaxed.**

---

## 1. Colour roles

### 1.1 The role model

Colour is assigned by **role**, never by raw hex, and never by hue name. Components reference roles; roles resolve to values per theme.

| Role | Token | Light | Dark | Used for | Never used for |
| --- | --- | --- | --- | --- | --- |
| **Brand primary** | `--color-primary` | `#B94736` | `#D66A58` | Primary CTA, active nav state, primary progress, brand gradient | Secondary text, body copy |
| **Brand primary hover** | `--color-primary-hover` | `#A33D2E` | `#E07C6A` | Hover/active on primary | — |
| **On primary** | `--color-on-primary` | `#FFFFFF` | `#1C201E` | Text/icon on a filled primary surface | Text on light surfaces |
| **Brand text** | `--color-primary-text` | `#B94736` | `#E58A7A` | Brand-coloured *text* on neutral surfaces, icons | Filled backgrounds |
| **AI** | `--color-ai` | `#5F4F86` | `#A893D4` | AI-assisted surfaces only | Any primary CTA; any user-owned record |
| **AI text** | `--color-ai-text` | `#5F4F86` | `#B7A5DE` | AI labels, AI icons, AI borders | Brand surfaces |
| **AI surface** | `--color-ai-surface` | `#F1EEF8` | `#2A2535` | Background of AI panels | Neutral panels |
| **AI border** | `--color-ai-border` | `#D6CDE9` | `#3E3552` | Border of AI panels | Card borders generally |
| **Verified success** | `--color-success-strong` | `#4F6B49` | `#A8C5A0` | Verified evidence, completed goals, "confirmed" badges | Neutral fills |
| **Success surface** | `--color-success-surface` | `#DDE6D5` | `#2C3829` | Background of success panels/badges | Buttons |
| **Danger** | `--color-danger` | `#B3261E` | `#F08C82` | Errors, destructive actions, failed states | Neutral accents |
| **Warning** | `--color-warning` | `#8A5A0F` | `#F0B872` | Caution, incomplete steps, stale data | Errors |
| **Page surface** | `--color-background` | `#F5F0E8` | `#1C201E` | App background behind all cards | Card fills |
| **Card surface** | `--color-surface` | `#FFFFFF` | `#282B29` | Cards, panels, table rows | Buttons |
| **Secondary surface** | `--color-surface-secondary` | `#F2EEE7` | `#222623` | Nested panels, table header, inactive tabs | Page background |
| **Elevated surface** | `--color-surface-elevated` | `#FFFFFF` | `#303531` | Popovers, dropdowns, modals, sticky footers | Page background |
| **Text primary** | `--color-text` | `#282B29` | *(inherit)* | Headings, body, primary values | Large fills |
| **Text secondary** | `--color-text-secondary` | `#686D76` | *(inherit)* | Supporting copy, metadata, captions | Primary values |
| **Text muted** | `--color-text-muted` | `#656A71` | *(inherit)* | Placeholders, disabled, least-important | Anything the user must read |
| **Border** | `--color-border` | `#E1DDD5` | `#3D433F` | Card and divider hairlines | Focus rings |
| **Border strong** | `--color-border-strong` | `#CBC5B9` | `#545B55` | Inputs, emphasised dividers | Every card border |
| **Focus ring** | *(`--color-primary`)* | `#B94736` | `#D66A58` | `:focus-visible` outline | Decoration |

\* **Resolved.** The dark `--color-ai-surface` was previously `#2C1F1C` — a warm brown-red that did not belong to the violet family and read as a secondary terracotta tint. It has since been corrected to `#2A2535`, a violet-leaning dark surface, and the dark AI set is now fully specified (`--color-ai: #A893D4`, `--color-ai-text: #B7A5DE`, `--color-ai-border: #3E3552`). **No further change required.** Note also that `--color-on-primary` in dark mode is now `#1C201E` (dark text on the light terracotta) rather than `#FFFFFF` — this is the correct pairing for a light primary fill and must not be "corrected" back to white.

### 1.2 Colour proportion rule

Enforced so the AI violet stays "restrained":

- **Brand orange** — up to ~60% of any screen's chromatic weight (CTA, active states, progress).
- **AI violet** — **never more than ~5%** of a screen. AI surfaces only. If a view looks purple, the role has been misused.
- **Green** — verification only. Never decorative.
- **Red** — error only. Never decorative. Never "a warning, in red".
- **Amber/warning** — the correct colour for "caution"; use it instead of red.

> Reference: https://emekly.com/ (captured 2026-11-04) uses a gold accent for exactly one phrase in the hero — a restraint CareerDev4AI should match for `--color-ai`.

### 1.3 Chart palette (NEW — no chart library is currently installed)

Add a five-slot categorical palette that survives greyscale and colour-vision deficiency. Rules:

- **Maximum 5 categorical hues.** One meaning per colour, used consistently across the whole product.
- **Never red + green adjacent as the only distinction** — always pair with a label, shape or pattern.
- **Categorical ≠ semantic.** Success green and danger red are reserved; they are not palette slots.
- **Text on chart ≥ 4.5:1; marks and bars ≥ 3:1** against the plot background.
- **Every chart ships a text alternative** — an `aria-label` summary plus a visually-hidden data list.

Recommended order (light mode; derive the dark set by raising lightness, keeping hue):

| Slot | Role | Light | Dark | Notes |
| --- | --- | --- | --- | --- |
| `chart-1` | Primary series | `#4F6B49` (sage) | `#A8C5A0` | Brand-adjacent, calm |
| `chart-2` | Secondary series | `#5F4F86` (AI violet) | `#8E7FB8` | Reserved feel; do not use for "AI" meaning |
| `chart-3` | Tertiary series | `#B58D47` (gold) | `#D8B26A` | Distinct from danger red |
| `chart-4` | Quaternary series | `#5F6B70` (slate) | `#A7B3B2` | Neutral, good as "other" |
| `chart-5` | Quinary series | `#95594E` (clay) | `#C08878` | Warm, close to brand but distinct |

> Sourced from: WuzzufTop's published palette — teal `#14B8C4`, coral `#FF6B5A`, amber `#FFB84D`, green `#2DBA85`, purple `#9b51e0`, cream `#FAF6EE`, ink `#1A2B3A` (https://wuzzuftop.com/, captured 2026-11-04) — rebalanced toward CareerDev4AI's existing warm-neutral family, and from Teal's palette — teal `#005149`, maroon `#791E3F`, gold `#B58D47`, indigo `#2427AB`, coral `#E84E30` (https://www.tealhq.com/, captured 2026-11-04).

### 1.4 Optional dark surface family (ADDITIVE — not a replacement)

`src/index.css` currently has no navy. If a cooler, more "enterprise" dark theme is ever wanted, add it as a **separate, opt-in theme** that re-points the same surface tokens. Do not replace the charcoal default.

| Token | Charcoal (current, default) | Navy (optional) | Note |
| --- | --- | --- | --- |
| `--color-background` | `#1C201E` | `#0A1F2E` | Navy from WuzzufTop's `--wp--preset--color--night` |
| `--color-surface` | `#282B29` | `#122B3E` | |
| `--color-surface-secondary` | `#222623` | `#0E2537` | |
| `--color-surface-elevated` | `#303531` | `#16344B` | |
| `--color-border` | `#3D433F` | `#1E3A4F` | |

**Reason:** a warm charcoal dark theme paired with a warm cream light theme reads as one coherent brand. A navy dark theme against cream light would read as two different products. If navy is adopted it must be adopted as a *complete* family (all five tokens), not as an accent.

---

## 2. Typography

### 2.1 Font stack (existing — unchanged)

Loaded at `index.html:114-117` and applied at `src/index.css:166`:

| Family | Role | Weights | Why |
| --- | --- | --- | --- |
| **Plus Jakarta Sans** | Latin body + UI | 300–800 + italic 400 | Geometric-humanist; already used by Emekly (https://emekly.com/), i.e. market-appropriate for a career product. |
| **IBM Plex Sans Arabic** | Arabic body + UI | 400–700 | Designed for Arabic; keeps the visual weight of the Latin family without faux-bolding. |
| **JetBrains Mono** | Code, IDs, scores, timestamps | 400–500 | Already present. |

**Fallback order (Arabic):** `'IBM Plex Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif`.
**Fallback order (Latin):** `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`.

> The brief mentions "Plus Jakarta Sans" — verified present. Note the brief did **not** mention IBM Plex Sans Arabic, which is in fact loaded and is the correct Arabic face. This is a strength, not a gap.

### 2.2 Type scale

Tailwind's default scale is in use; the measured distribution across `src/components/views/*.tsx` is `text-xs` 547, `text-sm` 136, `text-base` 61, `text-2xl` 52, `text-3xl` 19, `text-lg` 13, `text-xl` 12, `text-4xl` 3, `text-5xl` 1.

**Keep the scale. Assign each step a fixed role** so hierarchy stops being ad-hoc:

| Step | Size / line-height | Role | Notes |
| --- | --- | --- | --- |
| `text-5xl` | 48 / 56 | Landing-page hero only (1 use today) | Never inside the app |
| `text-4xl` | 36 / 40 | Section title on marketing pages (3 uses) | |
| `text-3xl` | 30 / 36 | Page title (`DashboardView`, `RoadmapView`) | One per screen |
| `text-2xl` | 24 / 32 | Major card title, onboarding step headline | 52 uses — the workhorse of large type |
| `text-xl` | 20 / 28 | Sub-section title | 12 uses |
| `text-lg` | 18 / 28 | Lead paragraph, large metric value | 13 uses |
| `text-base` | 16 / 24 | Body copy, form input | 61 uses |
| `text-sm` | 14 / 20 | **Default UI label** — nav items, table cells, buttons | 136 uses. Most-used interactive size. |
| `text-xs` | 12 / 16 | **Default supporting text** — metadata, captions, helper text | 547 uses. Dominant; expected for a dense app. |
| `text-[10px]` | 10 / 14 | **Eyebrow / label only** — uppercase `tracking-wider` overline | Already used in `DashboardView` for danger labels. Uppercase is Latin-only; see §7.4. |

**Rules**
- Minimum interactive/body size: **12px**; minimum label size: **12px**. Never below.
- **Never** use `text-[10px]` for content a user must read — only for overlines.
- Line height: `leading-relaxed` (1.625) for Arabic body; `leading-normal` for Latin.
- Tabular numerals for all scores, counters and metrics: `font-feature-settings: 'tnum' 1;` — CareerDev4AI animates progress values, and without this the digits visibly jitter. Sourced from Emekly (https://emekly.com/, captured 2026-11-04).
- **Uppercase overlines must be disabled in Arabic** — see §7.4.

---

## 3. Spacing rhythm

Tailwind's 4px base is in use. Measured: `gap-1` 233, `gap-2` 214, `gap-3` 82, `gap-4` 65, `gap-6` 15, `gap-8` 5; `p-3` 78, `p-4` 81, `p-6` 86, `p-2` 24, `p-5` 25, `p-8` 21.

### 3.1 Scale

| Token | Value | Role |
| --- | --- | --- |
| `--space-1` | `0.25rem` | Icon-to-label gap inside a control |
| `--space-2` | `0.5rem` | Gap between tightly related items (badge + text) |
| `--space-3` | `0.75rem` | **Default gap inside a compact group** |
| `--space-4` | `1rem` | **Default gap between cards / between a control and its label** |
| `--space-5` | `1.25rem` | Between a card header and its first content block |
| `--space-6` | `1.5rem` | **Default card padding (dense)** |
| `--space-8` | `2rem` | **Default card padding (standard)** / section gap |
| `--space-10` | `2.5rem` | Between major page sections |
| `--space-12` | `3rem` | Between major page sections (marketing) |
| `--space-14` | `3.5rem` | Landing-page section rhythm only |

### 3.2 Rules

- **Two card paddings only:** `--space-6` (dense — stat tiles, list rows) and `--space-8` (standard — feature cards, panels). Measured `p-6` (86) and `p-4` (81) dominate today; retire ad-hoc `p-3`/`p-5` on cards in favour of these two.
- **Two gaps only inside cards:** `--space-2` (label ↔ value) and `--space-4` (peer blocks).
- **Vertical rhythm:** page sections are separated by `--space-10`; nothing else uses it.
- **Never** hard-code a pixel spacing value in a component.

---

## 4. Radius rules

Measured: `rounded-lg` 280, `rounded-xl` 195, `rounded-2xl` 119, `rounded-full` 56, `rounded-md` 20.

| Token | Value | Applied to | Reason |
| --- | --- | --- | --- |
| `--radius-control` | `0.5rem` (`rounded-lg`) | Buttons, inputs, selects, chips, small cards, icon buttons | 280 uses — the default |
| `--radius-card` | `0.75rem` (`rounded-xl`) | **Standard content cards**, panels, table containers | 195 uses |
| `--radius-panel` | `1rem` (`rounded-2xl`) | Feature panels, hero cards, modal surfaces, large feature blocks | 119 uses |
| `--radius-pill` | `9999px` (`rounded-full`) | Avatars, status pills, filter chips, icon tiles | 56 uses |
| `--radius-md` (`0.375rem`) | — | **Retire.** Only 20 uses; migrate to `--radius-control`. | Removing a token reduces decision cost. |

**Rules**
- One radius per element. Do not mix `rounded-xl` on a card with `rounded-full` chips inside it unless the chips are pills by definition.
- **Nested surfaces must use a smaller radius than their parent** — a `rounded-xl` card containing a `rounded-xl` panel reads as a seam; use `--radius-control` for the inner one.
- Icon tiles: `--radius-pill` (matches Teal's 48px `rounded-full` tiles — https://www.tealhq.com/) or `--radius-control` for square tiles. Pick one per surface and stay consistent.
- **Signature radius (optional, one only):** a `72px` top-left corner on the app footer — Teal does exactly this with `rounded-tl-[72px]` (https://www.tealhq.com/, captured 2026-11-04). One asymmetric radius per product is a signature; two is noise.

---

## 5. Elevation and shadows

Existing tokens are **preserved** (`src/index.css:76-80`):

```css
--shadow-card:    0 1px 2px color-mix(in srgb, var(--color-text) 6%, transparent),
                  0 1px 3px color-mix(in srgb, var(--color-text) 4%, transparent);
--shadow-raised:  0 4px 12px -2px color-mix(in srgb, var(--color-text) 10%, transparent),
                  0 2px 4px -2px color-mix(in srgb, var(--color-text) 6%, transparent);
--shadow-overlay: 0 12px 32px -8px color-mix(in srgb, var(--color-text) 22%, transparent);
```

| Level | Token | Applied to | Blur | Reason |
| --- | --- | --- | --- | --- |
| 0 | *none* | Flat cards, table rows, list items | — | Most cards should be flat. Elevation is earned, not decorative. |
| 1 | `--shadow-card` | Interactive cards, hover-lift targets | 2–3px | Barely-there separation |
| 2 | `--shadow-raised` | Dropdowns, popovers, sticky sub-headers, dragged cards | 12px | "Floating above the page" |
| 3 | `--shadow-overlay` | Modals, the copilot drawer, command palette | 32px | "Above everything" |

**Rules**
- Shadows are derived from `--color-text` via `color-mix`, so they adapt to the theme automatically. **Keep this pattern** — do not hard-code shadow colours.
- **Only one elevated element per screen region.** If a card, a popover and a modal are all raised at once, the hierarchy is wrong.
- **The copilot drawer is level 3**, always.
- Add a level-4 only if a true "always on top" surface (e.g. a toast over a modal) ever ships.

---

## 6. Card anatomy

### 6.1 The standard card

```
┌──────────────────────────────────────────────┐
│  [icon tile]  Title                    [⋯]    │  ← header: icon tile + title + optional action
│                                              │
│  Supporting line, one or two lines max.     │  ← body
│                                              │
│  ──────────────────────────────────────────  │  ← optional divider (--color-divider)
│  Metric    Metric    Metric                 │  ← optional footer row
└──────────────────────────────────────────────┘
   padding: --space-8   radius: --radius-card
   border: 1px solid --color-border
   background: --color-surface
   shadow: --shadow-card (only on interactive cards)
```

**Rules**
- **Title is `text-sm font-semibold`** (matching `DashboardView`'s existing `<h2 className="text-sm font-semibold text-[var(--text-primary)]">`).
- **Supporting line is `text-xs text-[var(--text-secondary)]`** with `leading-relaxed`.
- **Icon tile:** 48px, `--radius-pill` or `--radius-control`, background `--color-surface-secondary` in light and `--color-surface-elevated` in dark, icon in `--color-primary-text`.
- **Divider** is `--color-divider` at `--space-6` inset from the card edges.
- **Maximum one metric row** per card. If a card needs three, it is a dashboard, not a card.
- Interactive cards get `transition` + `hover:-translate-y-0.5` + `hover:shadow-[--shadow-raised]`.

### 6.2 The inset highlight (NEW — recommended)

Emekly's icon tiles carry `inset 0 1px 0 rgba(255,255,255,.12)` — a 1px top highlight that makes a flat tile read as a physical surface (https://emekly.com/, captured 2026-11-04).

**Recommendation:** add this to `--color-surface-elevated` surfaces in dark mode and to primary-coloured icon tiles in both modes. It is the single cheapest perceived-quality improvement available:

```css
/* Applied to icon tiles and elevated cards */
box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12), var(--shadow-card);
```

### 6.3 The match bar (NEW — recommended)

WuzzufTop renders a skill match as a labelled bar (https://wuzzuftop.com/, captured 2026-11-04). This is the standard pattern for **every** score in CareerDev4AI — job match, skill match, CV readiness, roadmap completion.

```
Skills match          92%
┌───────────────────────────────────────────┐
│ ████████████████████████████░░░░░░░░░░░░ │  ← fill: --color-primary
└───────────────────────────────────────────┘
```

**Rules**
- Track: `--color-progress-track` (`#DDE6D5` light / inherit dark).
- Fill: `--color-primary`. Never green — green means *verified*, not *high*.
- **The numeric label is mandatory and must sit outside the bar**, at the inline-end. A bar with no number is decoration.
- Height: 6px desktop, 8px touch.
- The fill must animate from the **inline-start** edge, so it fills right-to-left in Arabic. Use logical properties, not `left: 0`.
- A bar below 40% switches to `--color-warning`; below 20% to `--color-danger`. The numeric label still states the truth.

---

## 7. Arabic RTL mirroring rules

### 7.1 Direction is set once, in the DOM

Already implemented at `src/context/CareerContext.tsx:2465`:

```ts
root.setAttribute('dir', settings.language === 'ar' ? 'rtl' : 'ltr');
```

**This is the correct pattern** — set the attribute on `<html>`, let CSS and the browser mirror everything else. Do not add per-component direction logic.

### 7.2 Use logical properties — never physical

| ❌ Physical | ✅ Logical (Tailwind v4) |
| --- | --- |
| `ml-4` / `margin-left` | `ms-4` / `margin-inline-start` |
| `mr-4` / `margin-right` | `me-4` / `margin-inline-end` |
| `pl-4` / `padding-left` | `ps-4` / `padding-inline-start` |
| `pr-4` / `padding-right` | `pe-4` / `padding-inline-end` |
| `left: 10px` | `inset-inline-start: 10px` |
| `text-align: left` | `text-align: start` |
| `border-l` | `border-s` / `border-inline-start` |

**Reason:** logical properties mirror automatically with zero duplication. CareerDev4AI already uses `text-start` in `AppShell.tsx` (`.text-start` on the logo button) — keep that pattern everywhere.

### 7.3 What to mirror, and what not to

| Mirror ✅ | Do not mirror ❌ |
| --- | --- |
| Sidebar position, nav flow, logo position | Numbers and digits |
| Card grids; the top-right card is the first card in RTL | Phone numbers, emails, URLs |
| Form label alignment, input text alignment | Code snippets, IDs |
| Progress bars and match bars (fill from inline-start) | Brand logos and wordmarks |
| Breadcrumbs, step indicators, steppers | Checkmark, clock, refresh icons |
| Back / next / chevron arrows | Media player controls |
| Stepper "01 / 02 / 03" lane order | Charts with fixed axes (keep, then test) |
| Timeline direction | Circular progress (clockwise everywhere) |
| Drag-and-drop column order | Search icon position |
| Toast and banner entry side | The inside of a number or a code block |

**Directional icons** must be flipped with the `rtl:` variant. CareerDev4AI already does this in `src/components/brand/CareerJourneyVisual.tsx` with `rtl:rotate-180` — keep that pattern and apply it to every directional icon.

> Sources: Mozilla Firefox RTL Guidelines — https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html (captured 2026-11-04); W3C-aligned RTL implementation guide — https://www.webversearena.com/blog/arabic-website-design-rtl-best-practices-2026 (captured 2026-11-04); RTL UI guide — https://dev.to/jubayer910/rtl-ui-design-for-arabic-apps-a-guide-for-uae-teams-3bfd (captured 2026-11-04).

### 7.4 Arabic typography rules

| Rule | Value | Reason |
| --- | --- | --- |
| Arabic font | `IBM Plex Sans Arabic` (already loaded) | Designed for Arabic; avoids faux-bolding |
| Arabic line-height | **1.7 – 2.0** (`leading-relaxed` at minimum) | Arabic glyphs are denser and taller than Latin |
| Arabic letter-spacing | **`0` — never negative, never positive** | Letter-spacing breaks Arabic glyph joining |
| Arabic word-spacing | `0.05em` | Slight extra word spacing improves readability |
| Arabic font-weight floor | **400 minimum** — never below | Thin weights lose stroke contrast at body size |
| Arabic type size | Same `rem` scale, but **Arabic renders optically smaller** — allow +0.5px optical compensation at `text-xs`/`text-sm` | Arabic x-height reads smaller at the same nominal size |
| **Uppercase overlines** | **Disabled in Arabic.** `text-[10px] uppercase tracking-wider` overlines must be suppressed when `dir="rtl"` | Arabic has no case; uppercase has no meaning, and the wide tracking looks broken |

### 7.5 Mixed-direction content (bidi)

Content that CareerDev4AI renders from user input — company names, job titles, certificates, URLs, phone numbers — must be isolated:

```tsx
<span dir="auto">{job.title}</span>          {/* user-controlled free text */}
<bdo dir="ltr">{company.url}</bdo>            {/* a known LTR string */}
```

**Reason:** an Arabic user searching for "Microsoft" or a job titled "Software Engineer" must see it read left-to-right inside right-to-left text, without the punctuation jumping to the wrong end.

### 7.6 RTL content-length budget

Arabic text runs **~20–30% longer** than the English equivalent. Every component that has a fixed-width or truncate-and-ellipsis label must be checked against Arabic at 130% length before shipping. Highest-risk surfaces: nav item labels, button labels, badge text, table column headers, stat tile labels.

---

## 8. Iconography

**Library: Lucide React** — already in use throughout (`AppShell.tsx` imports `Home`, `Compass`, `Layers`, `Award`, `TrendingUp`, `BookOpen`, `FolderGit2`, `HeartHandshake`, `FileText`, `GraduationCap`, `Calendar`, `Target`, `Settings`).

| Rule | Detail |
| --- | --- |
| **Size** | `h-4 w-4` (16px) inline with `text-sm`; `h-5 w-5` (20px) with `text-base`/`text-lg`; `h-3.5 w-3.5` (14px) with `text-xs`. Icons are always optically sized to their text, never to a fixed grid. |
| **Stroke** | Lucide default 2px. Do not override per instance. |
| **In buttons** | Icon is `shrink-0` and sits at the inline-start; the gap to the label is `--space-2`. |
| **Colour** | Icons inherit the text colour of their context. An icon is coloured (`--color-primary-text`, `--color-ai-text`, `--color-danger`) **only** when it carries meaning the text does not. |
| **Icon-only controls** | Must carry an `aria-label`. Never ship an unlabelled icon button. |
| **Decorative icons** | `aria-hidden="true"`, as Emekly does throughout (https://emekly.com/, captured 2026-11-04). |
| **Directional icons** | Flip with `rtl:` (see §7.3). `CareerJourneyVisual.tsx` already uses `rtl:rotate-180`. |
| **Status icons** | Use a **shape + colour** pair, never colour alone: verified = `circle-check`, in-progress = `loader`/`clock`, blocked = `circle-alert`, not-started = `circle`. Sourced from USAM's `circle-check` treatment (https://usamif.com/, captured 2026-11-04). |

---

## 9. Dark vs light surface hierarchy

### 9.1 The four levels

| Level | Token | Light | Dark | Purpose |
| --- | --- | --- | --- | --- |
| **L0 — Page** | `--color-background` | `#F5F0E8` | `#1C201E` | Behind everything |
| **L1 — Card** | `--color-surface` | `#FFFFFF` | `#282B29` | The working surface |
| **L2 — Nested** | `--color-surface-secondary` | `#F2EEE7` | `#222623` | Table headers, inactive tabs, nested panels, code blocks |
| **L3 — Floating** | `--color-surface-elevated` | `#FFFFFF` | `#303531` | Popovers, dropdowns, modals, sticky footers, the copilot drawer |

**Rules**
- **Light mode** ascends in brightness: cream page → white card → (nested *darker* cream) → white floating. The nested level is **darker** than the card in light mode so an inner panel reads as recessed.
- **Dark mode** ascends in lightness: `#1C201E` → `#282B29` → `#222623` → `#303531`. L2 (`#222623`) is **darker** than L1 (`#282B29`) — the same "recessed" logic as light mode. This is intentional and must not be "fixed" to a monotonic ramp.
- **Floating surfaces always use L3**, in both modes, so an overlay is never the same value as a card.
- The sticky `AppShell` header uses `backdrop-blur-xl` over the page background — the one place glass is acceptable (Mafe Sho8l does the same: https://mafeshsho8l.com/).

### 9.2 Contrast requirements

| Element | Minimum | Source |
| --- | --- | --- |
| Body text | **4.5:1** | WCAG 1.4.3 — https://mn.gov/mnit/media/blog/?id=38-716215 |
| Large text (≥18pt / 14pt bold) | 3:1 | WCAG 1.4.3 |
| Chart marks, bars, icons conveying meaning | **3:1** | WCAG 1.4.11 — https://mn.gov/mnit/media/blog/?id=38-716215 |
| Chart text | **4.5:1** | TIBCO accessible-dashboard guidance — https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/designing_accessible_dashboards.html |
| Focus ring | 3:1 against adjacent colour | WCAG 1.4.11 |

**Reason:** all three sources agree on the 4.5:1 / 3:1 split. The focus ring at `src/index.css:201-203` is `2px solid var(--color-primary)` with `2px` offset — that satisfies 1.4.11 provided the primary is not adjacent to a similarly-toned surface.

### 9.3 Print

`--color-print-primary: #B94736` is fixed (not theme-dependent) because the printed CV must stay paper-white in both modes (`src/index.css:82-83`). **Keep this.** Any CV preview surface must use the print tokens, never the theme tokens.

---

## 10. Chart styling (NEW — no chart library installed)

Verified: `package.json` contains no charting dependency, and a search of `src/` for `recharts|Chart|donut|sparkline` returns **no** chart usage. All quantitative display is via progress bars and inline SVG.

**Decision:** adopt a lightweight charting approach. The visual language below applies regardless of the library chosen.

| Element | Rule |
| --- | --- |
| **Palette** | The 5-slot `--chart-1..5` palette in §1.3. Never more than 5 categorical hues on one screen. |
| **Gridlines** | **Remove by default.** Keep at most one horizontal baseline. Heavy grids compete with the data. (NCSC dashboard guide: *"Simplify the charts where possible by removing grid lines, axis lines and borders"* — https://www.ncsc.org/sites/default/files/media/document/Dashboard-Design-Guide_0.pdf) |
| **Axes** | Start comparative axes at **0**. Never truncate a bar axis. |
| **3D** | **Never.** No 3D bars, pies or shadows. (Same source.) |
| **Labels** | Label the marks directly and drop redundant axis labels where there are few points; keep the axis where there are many. (Same source.) |
| **Colour-alone** | **Never.** Every series carries a label, and where two series are adjacent, a shape or pattern difference as well as a colour difference. |
| **Text alternative** | Every chart ships an `aria-label` summary **and** a visually-hidden data list, so the values are reachable by screen reader and by a screen-reader user navigating the table. (TIBCO + UK Analysis Function: https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-testing-dashboards-for-design-and-accessibility/) |
| **Interaction** | If a chart is interactive, it must be keyboard-navigable, show a visible focus/hover state, and offer a downloadable machine-readable data file. |
| **Legends** | Same type of chart → same legend position across the product. |
| **Numbers** | Round to whole numbers unless the exact value matters. Tabular numerals (`font-feature-settings: 'tnum' 1`). |
| **AI charts** | An AI-generated figure carries the AI violet accent on its header and an "AI-generated" marker, so it is never confused with a computed figure. |
| **Dark mode** | Re-derive the chart palette per theme (§1.3). Never reuse light-mode chart colours on a dark surface. |

---

## 11. Token implementation checklist

Everything below is **additive**. No existing token changes value.

```css
/* ---- NEW: spacing (Tailwind v4 @theme inline) ---- */
@theme inline {
  --color-space-1:  var(--space-1);
  --color-space-2:  var(--space-2);
  --color-space-3:  var(--space-3);
  --color-space-4:  var(--space-4);
  --color-space-5:  var(--space-5);
  --color-space-6:  var(--space-6);
  --color-space-8:  var(--space-8);
  --color-space-10: var(--space-10);
  --color-space-12: var(--space-12);
  --color-space-14: var(--space-14);
}

/* ---- NEW: chart palette ---- */
@theme inline {
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
}
```

**Also required (existing tokens, no value change):**

1. Add `--space-1..14` to `:root` (§3.1) and map them into `@theme inline`.
2. Add `--radius-control`, `--radius-card`, `--radius-panel`, `--radius-pill` (§4) and map into `@theme inline` as `--radius-*`.
3. Add `--chart-1..5` to `:root` **and** `.dark` (§1.3).
4. Add `--font-feature-numeric: 'tnum' 1;` and apply to numeric display classes.
5. ~~Fix `--color-ai-surface` in `.dark`~~ — **DONE.** Already corrected to `#2A2535`; the dark AI set is complete (`#A893D4` / `#B7A5DE` / `#2A2535` / `#3E3552`). No action.
6. Add the inset top-highlight to elevated surfaces (§6.2).
7. Add `letter-spacing: 0` and `word-spacing: 0.05em` under `body[dir="rtl"]` (§7.4).
8. Suppress `uppercase` + `tracking-wider` overlines under `[dir="rtl"]` (§7.4).
9. Add `text-[10px]`-equivalent overline suppression and `dir="auto"` on user-content spans (§7.5).

**Do not change:** `--color-primary` and its hover/text variants, `--color-ai` family (except the dark surface fix above), `--color-success*`, `--color-danger*`, `--color-warning`, `--color-background`, `--color-surface*`, `--color-text*`, `--color-border*`, `--shadow-*`, `--color-print-primary`, and the legacy alias block at `src/index.css:88-106`.

---

## 12. One-line summary of the language

> **Warm cream and charcoal surfaces. Brand terracotta-orange for everything the user drives. A single violet for anything the AI touches. Sage green only for what has been verified. Red only for what has failed. Three radii, three shadows, a 4px rhythm, logical properties everywhere, and a `dir` attribute set once on `<html>`.**
