---
name: frontend-performance
description: Maximizes Core Web Vitals (LCP, INP, CLS), optimizes bundle size, eliminates layout shifts, and ensures lightning-fast execution for CareerDev4AI.
---

# Frontend Performance Skill

This skill governs runtime efficiency, Core Web Vitals optimization, bundle size management, code-splitting, and asset delivery speed for CareerDev4AI.

## When to Use

Activate this skill when:
- Auditing or optimizing Core Web Vitals: Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).
- Analyzing Vite production bundle size and code-splitting boundaries.
- Diagnosing client-side render lag or long tasks (> 50ms).
- Optimizing web font loading, CSS delivery, and critical rendering paths.
- Evaluating new third-party npm packages to prevent dependency bloat.

## Core Web Vitals Targets for CareerDev4AI

| Metric | Target | Focus Area in CareerDev4AI |
| :--- | :--- | :--- |
| **LCP** (Largest Contentful Paint) | < 1.8s | Hero image optimization (`fetchPriority="high"`, WebP, local asset, no render-blocking JS). |
| **INP** (Interaction to Next Paint) | < 100ms | Lightweight click handlers, non-blocking state updates (`startTransition`), micro-animation limits. |
| **CLS** (Cumulative Layout Shift) | < 0.05 | Explicit `width`/`height` on images, reserved card heights, zero layout jumps during hydration. |

## Key Optimization Strategies

1. **Above-the-Fold (Hero) Optimization**:
   - The hero image is almost always the LCP element on the landing page.
   - Serve the hero image locally from `public/images/` as a lightweight WebP (< 80 KB).
   - Add `fetchPriority="high"` and `loading="eager"` to the hero image.
   - Avoid hiding hero content behind client-side async fetch calls.

2. **Bundle Chunking & Dynamic Imports**:
   - Split heavy view routes using `React.lazy()` and dynamic imports (`import(...)`).
   - Isolate vendor libraries: React, Supabase, Motion into distinct cacheable chunks via Vite's `rolldownOptions.output.manualChunks`.
   - Never import entire icon libraries (`import * as Icons from 'lucide-react'`); always import individual named symbols.

3. **Animation Performance & GPU Acceleration**:
   - Only animate composite properties: `transform` and `opacity`.
   - Never animate layout properties: `width`, `height`, `top`, `left`, `margin`, `padding`.
   - Use `will-change: transform` judiciously only on actively animating elements, and remove it when animations stop.
   - Respect `prefers-reduced-motion` to immediately eliminate CPU/GPU overhead on low-power devices.

4. **DOM Node Count & Memory Hygiene**:
   - Keep total DOM nodes under 1,500 on the landing page.
   - Avoid deeply nested wrapper `<div>` chains.
   - Clean up event listeners, timers, and WebSockets on component unmount.

## Quality Checklist

- [ ] Does `npm run build` succeed with controlled chunk sizes?
- [ ] Is the hero image served as an optimized local WebP with explicit dimensions?
- [ ] Are animations restricted to `transform` and `opacity`?
- [ ] Are heavy non-critical views lazily loaded?
- [ ] Are third-party dependencies strictly vetted against bundle size cost?
- [ ] Is Cumulative Layout Shift (CLS) near zero during page load?

## Common Failure Patterns to Avoid

- **Lazy-Loading the Hero Image**: Setting `loading="lazy"` on above-the-fold hero images ruins LCP.
- **Animating Layout Dimensions**: Animating `height` from 0 to auto triggers reflows on every animation frame.
- **Monolithic Bundles**: Bundling all client views into a single 3MB file without code-splitting.
