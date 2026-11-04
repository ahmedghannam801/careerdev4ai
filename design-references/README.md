# Design References — CareerDev4AI

A reference library for the visual and UX language of CareerDev4AI.

**Library created:** 2026-11-04
**Research date:** 2026-11-04
**Scope:** research and documentation only. No application source code was modified to produce this library.

> **Code-verification snapshot:** every CareerDev4AI implementation claim in this library was verified against the working tree at **2026-11-04 13:16**. The application was under concurrent modification by another agent during the pass (notably `src/index.css`, `src/components/views/LandingView.tsx`, `src/components/views/SettingsView.tsx`, `src/translations/sourceStrings.ts`, and a new `src/components/landing/` + `shared/contact.ts` + `src/translations/parts/landing.ts`). The token values documented in `research/visual-decisions.md` were re-verified after those edits landed. Re-check any claim before acting on it.

---

## What is in here

```
design-references/
├── README.md                       ← this file: library index + visual reference index
├── research/                       ← the five research deliverables
│   ├── competitor-analysis.md       ← 10 competitors, verified/unverified markers
│   ├── feature-benchmark.md         ← capability matrix, CareerDev4AI cells code-verified
│   ├── ux-analysis.md               ← navigation, onboarding, dashboard, states, trust
│   ├── visual-decisions.md          ← the implementable visual language
│   └── feature-gap-analysis.md      ← 23 gaps with priority and recommended approach
├── landing-page/                   ← marketing / public pages
├── onboarding/                     ← first-run and first-value flows
├── dashboard/                      ← the authenticated home surface
├── analytics/                      ← progress, charts, reporting
├── career-intelligence/            ← assessment, skill gap, career graph
├── roadmaps-learning/              ← roadmaps, learning catalogue, credentials
├── cv-studio/                      ← CV builder, tailoring, ATS
├── job-applications/               ← job matching, pipeline, Kanban, tracking
├── interview-preparation/          ← question bank, mock interviews, practice
├── ai-interface/                   ← copilot drawer, AI surfaces, AI trust
├── portfolio-projects/             ← public profile, projects, evidence
├── mobile/                         ← Capacitor shell, mobile-specific patterns
└── design-system/                 ← tokens, components, RTL rules
```

**How to use it:** start with `research/visual-decisions.md` (it is the implementable spec), then use the category directories to file further references as they are collected. Each category has a `README.md` explaining what belongs there and pointing at the references already identified.

---

## Visual Reference Index

Every record below was retrieved on **2026-11-04**. Each is a link only — **no images, screenshots, assets or other copyrighted material are stored in this repository.** Where a source is a design gallery, the entry records the *pattern* to study and the URL to study it at.

### A. Competitor product pages (first-party, verified)

| # | Source URL | Product area | Why it is effective | What to adapt | What NOT to copy | Influence on CareerDev4AI |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | https://wuzzuftop.com/ | Job market · RTL dashboard | The only competitor that is genuinely **Arabic-first and RTL-native**, with a published token set (night `#0A1F2E`, cream `#FAF6EE`, teal `#14B8C4`, coral `#FF6B5A`, amber `#FFB84D`, green `#2DBA85`), a 7-step spacing scale, five named shadow levels, and per-country currency/cities/dial codes. | The named-token discipline; the labelled **match bar**; the **AI MATCH** badge; the chat-first hero CTA; country-aware currency. | Arabic-only asymmetry; the repetitive feature-card grid. | Supplies the token vocabulary and the match-bar pattern for `visual-decisions.md` §1.3, §3, §6.3; supplies the currency model for gap G15. |
| V2 | https://mafeshsho8l.com/ | CV analysis · landing page | Sharp **local-market positioning** — names LinkedIn, Wuzzuf and Bayt explicitly; a "no signup to try it" free `/try` route; a `/sample-report` proof route; a glass sticky header; 72px gradient hero; native iOS + Android apps; EGP pricing in page JSON-LD. | The no-account first value; the "trust row" of three concrete limits; the status badge with a live ping dot; the `btn-shine` CTA. | The lime-green primary (it reads as a consumer tool, not a professional OS); the single-vocabulary scope. | Basis for gap **G6** (public no-account readiness check) and **G15** (EGP pricing); supplies the sticky-glass-header pattern. |
| V3 | https://emekly.com/ | AI career guidance · dark interface | The strongest **visual craft** in the set: floating `rounded-full h-14` pill nav, gradient hero text, 48px `rounded-xl` icon tiles with an **inset top highlight**, `translate-y-1` hover lift with an icon colour shift, an interactive globe, and `font-feature-settings: 'tnum' 1` for jitter-free counters. | The inset top-highlight recipe; the hover-lift + icon-colour-shift pair; tabular numerals on animated counters. | **Dark-only** (CareerDev4AI ships a full light/dark token system); low-contrast `white/50` hero text; unverifiable scale claims ("10,000,000 positions"). | Basis for `visual-decisions.md` §6.2 (inset highlight) and §2.2 (tabular numerals); supplies the hover-lift rule in §6.1. |
| V4 | https://usamif.com/ | Learning-to-employment · multi-audience nav | The **best accessibility hygiene** observed: skip link → `#main-content`, full menu ARIA (`role="menu"`, `aria-expanded`, `aria-controls`), `role="status"` live regions, `<details>` FAQ, honest AI disclosure ("this is not a live AI conversation"), and an `/trust` page. | The skip link; `aria-current` on active nav; the **"Illustrative example"** demo badge; the AI-limits FAQ pattern; the intent-routed entry. | The scrolling length before any product action; English-first with Arabic as a secondary locale. | Basis for ux-analysis **P2**, **P4**, **O1**, **O2**, **S4**, **S5**; gap **G7**. |
| V5 | https://www.careerflow.ai/ | Job application workflow | Best **navigation IA for a broad tool set**: a 7-item Features mega-menu with "New!" / "Trending" / "60% Off" badges, a persona switcher, a seven-item free-tool ladder, and geo-IP pricing swap. | The badge channel for nav items; the free-tool → paid ladder; persona segmentation. | The generic blue-SaaS look; Webflow + multiple carousel libraries and the page weight that follows; no Arabic. | Basis for gap **G22** (nav badges) and **G6** (free tools); supplies the badge pattern for `AppShell`. |
| V6 | https://www.tealhq.com/ | Resume tailoring · job tracking | Best **page-architecture craft**: full-width fixed mega-panels (2-col Tools, 3-col Resources) with 48px `rounded-full` icon tiles, a legible Free-vs-Plus comparison, tabbed Resume/Cover Letter/CV examples, and a signature `rounded-tl-[72px]` footer in maroon `#791E3F`. | The "one CV per job" object model; the tabbed CV/Cover-Letter pattern; the footer signature radius; per-stage application templates. | US-only framing and no EGP pricing; no roadmap, learning, evidence or portfolio. | Basis for gap **G19** (per-job CV variants) and **G17** (per-stage templates); supplies the one-radius signature in `visual-decisions.md` §4. |
| V7 | https://www.careerexplorer.com/ | Career assessment · onboarding | The cleanest **assessment UX** in the set: 01 Answer → 02 Discover → 03 Explore with a persistent progress bar, a staged data model (`welcome`, `interests`, `workplace`, `personality`), results that feed a browsable Library rather than a dead-end report, and a public `/accessibility` page. | The numbered stepper + progress bar; "results feed a destination"; the archetype/trait labelling model. | Assessment-only scope; English-only; the vanity "400M questions answered" counter. | Basis for ux-analysis **P3**, **O1**; gap **G7** (accessibility page) and **G21** (reject vanity metrics). |
| V8 | https://roadmap.sh/ | Learning roadmaps | The best **structured-learning IA**: roadmap → sections → topics → links, where a link is an article / resource / guide / interview question / quiz; plus a ⌘K search combobox, `aria-pressed` filter chips, and progress rendered on the card itself. | The roadmap → section → topic → **link** model; filter chips + ⌘K; progress on the card. | Developer-only scope; community content of uneven quality; dark-only (acceptable *inside* the roadmap surface only, not app-wide). | Basis for gap **G3** (roadmap leaf becomes a link) and **G10** (filter chips + search); ux-analysis **P5**, **P8**. |
| V9 | https://www.coursera.org/ | Professional learning · credentials | The only **published, named design system** in the set — `CDS`, with semantic token families (`--cds-typography-title-large`, `--cds-color-neutral-background-primary`, `--cds-spacing-100`, `--cds-letter-spacing-minus50`) and a taxonomy mega-menu (`MegaMenu → Category → Subcategory → links`). | The CDS-style role naming discipline; the "credential as the paywall" model; the AI-coach **side panel** placement. | The page weight (inline font CSS, Statsig, Sentry, Apollo state in the document); the anonymous-catalogue browsing model. | Basis for `visual-decisions.md` §2.2/§3.1 token naming; gap **G4** (credential issuance); confirms the right-side copilot placement. |

### B. Design-system and craft references

| # | Source URL | Product area | Why it is effective | What to adapt | What NOT to copy | Influence on CareerDev4AI |
| --- | --- | --- | --- | --- | --- | --- |
| V10 | https://ui.shadcn.com/docs/theming | Design system | The reference implementation of **semantic token pairs** (`primary`/`primary-foreground`, `muted`/`muted-foreground`, `card`, `popover`, `destructive`, `border`, `input`, `ring`, `chart-1..5`, `sidebar-*`) with a light/dark switch on the same names. | The `name`/`name-foreground` pairing discipline and the `chart-1..5` role names. | Its default neutrals — CareerDev4AI's warm cream/charcoal family is the brand and must not be replaced by shadcn's zinc. | Naming model for the new `--chart-*` and `--space-*` tokens in `visual-decisions.md` §11. |
| V11 | https://www.ncsc.org/sites/default/files/media/document/Dashboard-Design-Guide_0.pdf | Analytics · chart styling | A clear, non-aesthetic chart standard: remove gridlines, zero-based comparative axes, no 3D, label marks instead of redundant axes, use colour consistently for the same category, never encode meaning by colour alone, round to whole numbers, provide a data table alongside. | Every chart rule in `visual-decisions.md` §10. | — | Defines the chart spec for the analytics work in gap **G2**. |
| V12 | https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/designing_accessible_dashboards.html | Analytics · accessibility | States the contrast contract precisely: **3:1 for visualisations, 4.5:1 for text**, colour-blind-friendly palettes, no red+green adjacency, consistent legends for the same chart type, and a text alternative for every visualisation. | The 3:1 / 4.5:1 split and the "text alternative for every visualisation" rule. | — | `visual-decisions.md` §9.2 contrast table; §10 text-alternative rule. |
| V13 | https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html | RTL · mirroring rules | The most explicit "what to mirror / what not to mirror" list: direction icons, progress bars and collapse twisties mirror; text, numbers, checkmarks, media controls and product logos do not. | The exact mirror/don't-mirror table. | — | `visual-decisions.md` §7.3, applied to the CareerDev4AI icon set. |
| V14 | https://www.webversearena.com/blog/arabic-website-design-rtl-best-practices-2026 | RTL · implementation | The clearest statement that RTL is a **design-system decision made at wireframe time**, not a CSS trick: logical properties, Arabic line-height 1.7–2.0, never a font-weight below 400, `letter-spacing: 0` for Arabic. | The Arabic typography block in `visual-decisions.md` §7.4. | — | `visual-decisions.md` §7.2, §7.4. |

### C. Pattern and gallery references

| # | Source URL | Product area | Why it is effective | What to adapt | What NOT to copy | Influence on CareerDev4AI |
| --- | --- | --- | --- | --- | --- | --- |
| V15 | https://www.techmagic.co/ai-design-patterns/copilot | AI interface | Documents the industry-standard AI placement: a **side panel** that stays available without hijacking the screen, citing Adobe Acrobat, Shopify, HubSpot, GitLab, Notion and ClickUp as implementers. | Right-side panel placement for `CopilotDrawer`. | The floating bubble as the *only* entry — it must not obscure content. | Confirms the existing `src/components/copilot/CopilotDrawer.tsx` architecture; ux-analysis **P9**. |
| V16 | https://www.parallelhq.com/blog/llm-chat-ux-patterns | AI interface | The handoff pattern: once the AI produces a plan, the user must be able to **act on it in the product** ("Export to Task Board", "Open in Composer"), plus contextual prompt starters and visible, editable context. | The conversation→action handoff buttons on every copilot reply. | Open-ended chat with no exit points. | Gap **G13**; ux-analysis **P12**. |
| V17 | https://apptension.com/guides/building-ai-copilots-inside-b2b-saas-ux-patterns-permissions-and-workflow-automation-using-a-starter-kit | AI interface · trust | The most operationally specific copilot guidance observed: context pins, "draft then refine", "explain with receipts", action preview + undo, and **uncertainty as a UI state rather than an error**. | Context pins; receipts; the "I don't know" state. | A floating assistant that covers the interface. | Gaps **G12** and the uncertainty state in ux-analysis **S2**. |
| V18 | https://github.com/aniisabihi/NextRole | Job applications · Kanban | A **production-quality Kanban application tracker** with an explicit manual a11y checklist (keyboard column move, 44px targets, truncation banner, `aria-pressed` filters), a transition matrix mirrored client-side, and a documented status/priority model. | The keyboard-operable board, the transition matrix, the "Showing N of M" banner. | — | Gap **G1** — the de-facto spec for the applications board. |
| V19 | https://github.com/AlexSilka/application-tracker | Analytics · funnel | A tracker whose dashboard is a **conversion funnel** driven by an append-only event timeline, built with plain CSS design tokens and **no UI kit** — the same "no second theme system" stance as CareerDev4AI. | The funnel view and the append-only event model. | — | Gap **G2** — the funnel chart specification. |
| V20 | https://github.com/arish-tayalan/job-tracker | Job applications · dashboard | A small, readable reference for the two-chart tracker dashboard: totals, interview rate, status breakdown, applications per week. | The metric set. | — | The minimum viable analytics scope for gap **G2**. |
| V21 | https://mobbin.com/ | Design system · flows | The reference library for **shipped** flows — 600,000+ real screens, organised into Apps / Sites / Screens / Flows / Animations / UI Elements. | Use for onboarding, auth, and empty-state flow study. | Nothing may be copied or embedded; it is a paid reference for study only. | Points the team at the right category when the flow work begins. |
| V22 | https://www.saasui.design/best-saas-dashboard-ui-inspiration | Dashboard · analytics | Curates **real, in-production** SaaS screens (Mixpanel, Stripe, Vercel, PostHog and 50+ more) by screen type — dashboards, onboarding, pricing, settings, empty states — rather than concept shots. | The empty-state and onboarding screen-type index. | Nothing to copy; study only. | A place to find real empty-state patterns for `src/components/ui/EmptyState.tsx`. |
| V23 | https://dribbble.com/tags/career-dashboard | Dashboard | A broad, fast survey of career-dashboard layout vocabulary (grid density, stat-tile arrangement, dark-mode variants). | Layout vocabulary only. | **Concept shots, not shipped products** — do not treat any of it as a real pattern. | Loose inspiration only; the shipped-product references above take precedence. |
| V24 | https://colorlib.com/wp/developer-portfolios/ | Portfolio · projects | A curated portfolio structure survey: work before biography, 3–5 real projects, résumé one click away, and the *platform* behind each example noted. | The "show the work, then the story" ordering for `PublicProfileView`. | The specific visual treatments of the individual sites (they are other people's designs). | Informs gap **G23** — the public profile is the top-of-funnel artefact. |
| V25 | https://devbio.me/blogs/developer-portfolio-examples-2026.md | Portfolio · evidence | Argues the core principle for a career portfolio: **live proof over typed claims** — real stars, real commits, real metrics, and a résumé generated from the same data so it cannot drift. | Tying the public profile's claims to the live career graph so they cannot diverge. | The specific section layouts. | Gap **G23** and the evidence-first positioning in `feature-benchmark.md`. |

**Count: 25 visual references documented with source URLs and capture dates — requirement was 8.**

---

## Copyright and usage note

This library contains **links and written notes only**. No image, screenshot, icon set, font file, CSS file, or other asset from any referenced site has been downloaded, embedded, vendored, or reproduced in this repository. All referenced brands, logos, layouts and copy remain the property of their respective owners and are referenced for comparative design analysis. Any future work in this repository must either (a) link out to the original, or (b) use independently created assets under CareerDev4AI's own brand identity — which, per `research/visual-decisions.md`, is the warm cream + charcoal + terracotta-orange system already implemented in `src/index.css`.

---

## Research deliverables

| File | Contents |
| --- | --- |
| [`research/competitor-analysis.md`](research/competitor-analysis.md) | All 10 competitors. Nine loaded and verified on 2026-11-04; `pathrise.com` was offline (Cloudflare 1014) and is marked ⛔ NOT ACCESSIBLE with 🔵 secondary sources only. Each entry covers features, UI patterns, UX workflows, mobile behaviour, accessibility signals, strengths, weaknesses and opportunities. |
| [`research/feature-benchmark.md`](research/feature-benchmark.md) | A 12-capability × 11-column matrix. Every CareerDev4AI cell is code-verified with a file path; anything unverified is marked UNKNOWN. |
| [`research/ux-analysis.md`](research/ux-analysis.md) | Navigation model, onboarding, dashboard hierarchy, empty/loading/error states, trust patterns, 15 ranked patterns to adopt, and 8 patterns to reject — each tied to a competitor and a URL. |
| [`research/visual-decisions.md`](research/visual-decisions.md) | The implementable visual language: colour roles, typography, spacing, radius, elevation, card anatomy, charts, icons, dark/light hierarchy, RTL mirroring — with an explicit statement that the existing brand-orange primary is preserved. |
| [`research/feature-gap-analysis.md`](research/feature-gap-analysis.md) | 23 gaps scored on user value, competitive advantage, technical feasibility, data availability, implementation risk and maintenance cost, each with a recommended approach. |
