---
name: frontend-design
description: Guides premium SaaS visual design, layout composition, typography hierarchy, spacing systems, and brand consistency for CareerDev4AI.
---

# Frontend Design Skill

This skill defines the visual design standards and execution rules for CareerDev4AI's user interfaces. It ensures every screen feels like a world-class, professional product rather than a generic or AI-generated prototype.

## When to Use

Activate this skill when:
- Designing or modifying landing page sections, hero banners, and marketing blocks.
- Establishing visual hierarchy, layout grids, or spacing systems.
- Selecting typography scales, line-heights, and contrast ratios.
- Implementing design tokens, color palettes, and surface elevations.
- Auditing UI quality to eliminate generic AI design clichés (e.g. random floating cards, disconnected gradients, crowded cards).

## Core Design Philosophy for CareerDev4AI

1. **Brand Identity Anchors**:
   - **Primary Brand Color**: Terracotta `#B94736` (`var(--color-primary)`). Used for key actions, primary buttons, and hero focal points.
   - **Dark Surfaces**: Rich deep navy and charcoal (`var(--bg-main)` in dark mode).
   - **Light Surfaces**: Clean, soft off-white/parchment with subtle borders (`var(--color-border)`).
   - **AI Accent**: Purple (`var(--color-ai)`) reserved exclusively for AI guidance and copilot insights.
   - **Success**: Calibrated emerald green (`var(--color-success)`).
   - **Error / Danger**: Crisp coral red (`var(--color-error)`).

2. **Visual Hierarchy & Layout Principles**:
   - **Controlled Two-Column Layout**: On desktop hero sections, maintain a clean 50%/50% balance between copy and visual container.
   - **Human Connection**: Ground hero sections with genuine, high-quality photography rather than abstract geometric shapes or fake dashboards.
   - **Restrained Floating Cards**: Maximum 1 or 2 small supporting UI pills/cards. Floating cards must NEVER obscure the main subject of an image or collide with text.
   - **Vertical Rhythm**: Avoid excessive top/bottom padding that leaves barren vertical voids. Keep section padding between 64px and 96px (`py-16` to `py-24`).

3. **Typography Standards**:
   - Headers: Clean tracking (`tracking-tight`), appropriate leading (`leading-[1.1]`), and balanced line breaks (`text-balance`).
   - Body Copy: Readable line-height (`leading-relaxed`), max-width constrained (`max-w-xl` to `max-w-2xl`), high contrast.
   - Micro-copy & Badges: Semi-bold or medium weight, uppercase tracking where appropriate, crisp contrast.
   - **Text Escaping**: Never display raw HTML entities (`&amp;`, `&lt;`). Always use clean literal characters (`&`, `<`).

## Step-by-Step Workflow

1. **Analyze Requirements & Viewports**:
   - Determine the purpose of the section (Conversion, Information, Exploration).
   - Plan desktop (1440px/1280px), tablet (768px/820px), and mobile (360px-390px) presentations upfront.
2. **Establish the Grid**:
   - Use container constraints: `max-w-6xl` or `max-w-7xl` centered with `mx-auto px-6`.
   - Use CSS Grid (`grid grid-cols-1 lg:grid-cols-12` or `lg:grid-cols-2`) for responsive alignment.
3. **Harmonize Surfaces & Borders**:
   - Apply semantic design tokens: `bg-[var(--color-surface)]`, `border-[var(--color-border)]`, `text-[var(--text-primary)]`.
   - Keep rounded corners consistent: `rounded-xl` for small cards, `rounded-2xl` for major content containers.
4. **Audit in Light and Dark Mode**:
   - Verify text contrast meets WCAG AA standards (4.5:1 for body, 3:1 for large text) across both modes.

## Quality Checklist

- [ ] Does the screen communicate a clear story within 3 seconds?
- [ ] Is there an obvious primary call-to-action (CTA)?
- [ ] Are floating cards anchored intentionally without overlapping critical visuals or text?
- [ ] Are all colors mapped to semantic CSS variables rather than hardcoded hex codes?
- [ ] Are HTML entities properly rendered without raw code leaks?
- [ ] Does the layout look intentional and balanced in both English (LTR) and Arabic (RTL)?

## Common Failure Patterns to Avoid

- **The Jumbled Card Stack**: Stacking 4+ cards at arbitrary 3D angles that obscure each other.
- **AI-Style Generic Hero**: Neon gradients, floating glass spheres, or disconnected mockups that do not relate to real product functionality.
- **The Empty Void**: Section padding exceeding 120px with small content blocks, causing awkward scrolling.

