---
name: premium-visual-qa
description: Guides browser-based visual QA, screenshot comparison, layout collision detection, overflow auditing, and aesthetic refinement for CareerDev4AI.
---

# Premium Visual QA Skill

This skill governs visual quality assurance, screenshot auditing, layout regression detection, and pixel-level refinement across CareerDev4AI.

## When to Use

Activate this skill when:
- Reviewing UI implementations after modifying layouts, components, or styles.
- Verifying hero visual balance, card positioning, and aesthetic quality.
- Checking for visual regressions, horizontal scroll leakage, or overlapping cards.
- Inspecting rendered pages across Desktop, Tablet, and Mobile viewports.
- Verifying Light Mode vs Dark Mode and English (LTR) vs Arabic (RTL).
- Validating that visual bug reports (such as overlapping hero cards) have been resolved.

## Visual Quality Principles for CareerDev4AI

1. **Evidence-Based Verification**:
   - Never declare visual QA passed based on reading source code alone.
   - Inspect actual rendered output via headless browser, Playwright screenshots, or interactive DevTools.
   - Compare before-and-after captures against reference bug screenshots.

2. **The "Zero Overlap / Zero Collision" Rule**:
   - Floating elements must never collide with or obscure critical focal points (human faces in photos, laptop screens, headlines, or CTAs).
   - Card borders and shadows must be distinctly legible against their parent background.
   - Text must never truncate unexpectedly or wrap into orphaned single-character words.

3. **Optical Spacing & Alignment**:
   - Ensure visual balance between left (copy) and right (visual) columns on desktop viewports.
   - Equalize optical weights: a visually heavy photograph must be balanced by strong typography and CTA grouping on the left.
   - Eliminate barren vertical gaps: excessive whitespace below hero sections indicates uncalibrated container heights.

## Step-by-Step QA Workflow

1. **Prepare the Test Server**:
   - Start the local development server or headless preview: `npm run build && node scripts/server-harness.mjs`.
2. **Execute Multi-Viewport Screenshot Captures**:
   - Desktop: 1440×900, 1280×800.
   - Tablet: 820×1180 (iPad Air), 768×1024 (iPad).
   - Mobile: 390×844 (iPhone 14/15), 375×667 (iPhone SE), 360×800 (Android Standard).
3. **Audit Rendering in Both Themes & Languages**:
   - Verify Light Theme: crisp borders, subtle shadows, clean contrast.
   - Verify Dark Theme: deep background tones, readable secondary text, no harsh white flashes.
   - Verify English LTR and Arabic RTL.
4. **Inspect Captured Evidence**:
   - Check edges for horizontal scrollbar triggering (`document.documentElement.scrollWidth > window.innerWidth`).
   - Check text rendering for HTML entity escapes (`&amp;` instead of `&`).
   - Confirm image clarity, aspect ratio preservation, and lack of stretching/distortion.

## Visual Regression Checklist

- [ ] Is the hero image properly framed without awkward cropping?
- [ ] Are floating cards anchored intentionally with clear margins from the image subject?
- [ ] Are there zero horizontal scrollbars on mobile viewports (360px-390px)?
- [ ] Is text contrast sharp and legible in both Light and Dark themes?
- [ ] Are badges and CTAs aligned cleanly with consistent padding?
- [ ] Does Arabic RTL mode display natural text flow and mirrored layout components?

## Common Failure Patterns to Avoid

- **The Phantom Pass**: Assuming code works because build exited with code 0 without rendering the actual pixels.
- **Uncontrolled Perspective Stacking**: Using 3D CSS transforms with z-index stacking that breaks on smaller laptop viewports (1024px-1280px).
- **Hardcoded Container Heights**: Forcing an element to `height: 500px` causing overflow clipping when text wraps on different screens.

