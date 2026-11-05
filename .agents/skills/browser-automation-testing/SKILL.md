---
name: browser-automation-testing
description: Governs end-to-end testing, Playwright automation, screenshot capture, user flow verification, and network failure detection for CareerDev4AI.
---

# Browser Automation Testing Skill

This skill governs end-to-end (E2E) browser testing, automated screenshot captures, navigation audits, and interactive flow validation using Playwright and browser automation tooling.

## When to Use

Activate this skill when:
- Writing or running automated browser tests against CareerDev4AI.
- Capturing screenshots across responsive breakpoints (Desktop, Tablet, Mobile).
- Testing critical user conversion flows: Landing Page CTA -> Onboarding -> Profile -> Dashboard.
- Auditing navigation links, anchor destinations, and modal interactions.
- Detecting unhandled browser console errors or failed network requests (4xx/5xx).
- Performing automated visual regression testing.

## Browser Automation Standards for CareerDev4AI

1. **Clean Test Server Lifecycle**:
   - Always run tests against an isolated, predictable local server (e.g. `tests/server-harness.mjs` or preview server).
   - Clean up browser contexts, temporary users, and storage objects after test completion.

2. **Viewport Coverage Matrix**:
   - **Desktop Large**: 1440 × 900
   - **Desktop Standard**: 1280 × 800
   - **Tablet Landscape / Portrait**: 820 × 1180 / 768 × 1024
   - **Mobile Modern**: 390 × 844 (iPhone standard)
   - **Mobile Compact**: 360 × 800 (Android compact)

3. **Assertion Rigor**:
   - Do not rely solely on `page.waitForTimeout()`; use locator-based assertions like `await expect(locator).toBeVisible()`.
   - Assert that all anchor links (`a[href^="#"]`) correspond to an actual DOM node with that `id`.
   - Monitor the browser console for unhandled errors:
     ```typescript
     page.on('console', (msg) => {
       if (msg.type() === 'error') {
         console.error('Browser console error:', msg.text());
       }
     });
     ```
   - Monitor failed network requests:
     ```typescript
     page.on('requestfailed', (req) => {
       console.error('Request failed:', req.url(), req.failure()?.errorText);
     });
     ```

## Step-by-Step Test Execution Workflow

1. **Launch Test Environment**:
   - Build latest code: `npm run build`.
   - Start test runner or harness: `node tests/runner.mjs`.
2. **Execute Multi-Device Visual Capture**:
   - Navigate to `http://localhost:<PORT>/`.
   - Set viewport sizes sequentially and capture screenshots to `.tmp-qa/screenshots/`.
   - Verify layout stability, absence of horizontal scrollbars, and readable text hierarchy.
3. **Verify Interactive Flows**:
   - Click "Start Your Journey" CTA and assert transition to onboarding view.
   - Click nav anchor links ("How It Works", "Preview", "Features") and verify viewport scrolls to target.
   - Toggle theme (Light / Dark) and language (English / Arabic) and verify correct class application (`dir="rtl"`).
4. **Assert Clean Console & Network**:
   - Verify 0 console errors and 0 unhandled promise rejections.

## Quality Checklist

- [ ] Does the test run headlessly and deterministically without flakiness?
- [ ] Are all target anchor IDs present in the DOM?
- [ ] Are screenshots stored in a designated test artifact directory?
- [ ] Are temporary test identities and cookies cleaned up after execution?
- [ ] Does the test verify that no horizontal scrollbar exists on mobile viewports?

## Common Failure Patterns to Avoid

- **Hardcoded Sleeps**: Using `page.waitForTimeout(5000)` instead of waiting for network idle or selector visibility.
- **Leaked Test Users**: Creating real Supabase auth users without cleanup scripts, polluting the database.
- **Ignoring Console Warnings**: Overlooking React key warnings or CSS parsing errors logged to the console.

