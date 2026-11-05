---
name: responsive-accessibility
description: Enforces responsive design across mobile/tablet/desktop viewports, accessibility (WCAG AA), semantic HTML, RTL/LTR localization, and motion preferences.
---

# Responsive & Accessibility Skill

This skill guarantees that CareerDev4AI delivers an inclusive, accessible, and responsive experience across all screen sizes (mobile, tablet, desktop) and assistive technologies.

## When to Use

Activate this skill when:
- Building or refactoring responsive layouts and grid structures.
- Auditing viewport behavior at 360px, 375px, 390px, 768px, 820px, 1024px, 1280px, and 1440px.
- Ensuring compliance with WCAG 2.1 AA standards (color contrast, keyboard focus, screen readers).
- Supporting bilingual LTR (English) and RTL (Arabic) interfaces.
- Handling motion preferences via `prefers-reduced-motion`.

## Responsive Breakpoints & Sizing Matrix

| Device Category | Target Viewports | Layout Strategy |
| :--- | :--- | :--- |
| **Mobile** | 360px, 375px, 390px, 412px | Single column stack, touch targets ≥ 44×44px, no floating overlap, full-width CTAs. |
| **Tablet** | 768px, 820px, 834px | Balanced 1-to-2 column layout, collapsed navigation drawer or condensed bar. |
| **Desktop** | 1024px, 1280px, 1440px | Two-column 50/50 hero grid, max-w-6xl / max-w-7xl centered container, full nav. |

## Accessibility (A11y) & WCAG AA Requirements

1. **Semantic HTML**:
   - Use `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>` instead of nested generic `<div>` tags.
   - Use proper heading levels (`<h1>` through `<h6>`) in logical descending order. One `<h1>` per page/view.
   - Use real `<button>` elements for actions and `<a>` elements for navigation with valid `href`.

2. **Keyboard Navigation & Focus Management**:
   - All interactive elements must be focusable via `Tab` key.
   - Focus rings must be visible and clear: `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`.
   - Modals and drawers must trap focus and close on `Escape`.

3. **Screen Readers & ARIA**:
   - Provide informative `aria-label` or `aria-labelledby` on icon-only buttons.
   - Images must have meaningful `alt` descriptions or `alt="" aria-hidden="true"` for purely decorative elements.
   - Dynamic updates must use `aria-live="polite"` where relevant.

4. **Bilingual RTL / LTR Mirroring**:
   - Use logical Tailwind classes: `ms-` (margin-inline-start), `me-` (margin-inline-end), `ps-`, `pe-`.
   - Rotate direction-dependent icons (e.g. `ArrowRight` -> `rtl:rotate-180`).
   - Test Arabic typography line-heights and text-balance to avoid awkward wrapping.

5. **Motion Preferences**:
   - Respect `prefers-reduced-motion: reduce`.
   - Use the `useReducedMotion()` hook from `motion/react`:
     ```typescript
     const reduced = useReducedMotion() ?? false;
     // Fallback to instant duration or zero displacement
     ```
   - In CSS, wrap keyframe animations in `@media (prefers-reduced-motion: reduce) { animation: none !important; }`.

## Quality Checklist

- [ ] Does the page avoid horizontal scrollbars at 360px width?
- [ ] Are touch targets at least 44px by 44px on mobile devices?
- [ ] Does text contrast pass WCAG AA (minimum 4.5:1 for body copy)?
- [ ] Can all interactive elements be reached and activated via keyboard only?
- [ ] Are ARIA attributes valid and not redundant?
- [ ] Are directional icons mirrored correctly in Arabic RTL?
- [ ] Are animations disabled or collapsed when reduced motion is preferred?

## Common Failure Patterns to Avoid

- **Negative Margin Collision**: Using negative margins on mobile that push cards offscreen or collide with text.
- **Button as Div**: Using `<div onClick={...}>` without `role="button"`, `tabIndex={0}`, or keyboard listener.
- **Hidden Overflow Clip**: Setting `overflow-hidden` on parent containers that clips focused focus-rings or dropdowns.

