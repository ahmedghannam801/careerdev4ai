# Palette 2 Implementation Report

**Project:** CareerPilot AI  
**Date:** 2026-10-23  
**Scope:** Apply the approved Palette 2 colour system without changing layout, structure, interaction, routes, animation, typography, responsiveness, or RTL/LTR behaviour.

## Branch and Commit

| Item | Value |
| --- | --- |
| Current branch | `audit/before-supabase-migration` |
| Commit | `feat: apply CareerPilot AI palette 2 theme` |
| Commit scope | One commit containing the theme implementation and this report |

The commit is created only after the implementation and all verification checks below pass. No push, deploy, reset, rebase, amend, or history rewrite was performed.

## Outcome

Palette 2 is applied across the application through one semantic token layer. The existing class-based light/dark mechanism is preserved, the theme preference remains persisted, and the pre-paint bootstrap prevents a light/dark flash for users with a saved preference.

## Palette Mapping

| Semantic role | Light | Dark | Canonical token |
| --- | --- | --- | --- |
| Background | `#F5F0E8` | `#1C201E` | `--color-background` |
| Cards / primary surface | `#FFFFFF` | `#282B29` | `--color-surface` |
| Primary | `#B94736` | `#D66A58` | `--color-primary` |
| Primary text / link | `#B94736` | `#E58A7A` | `--color-primary-text` |
| Foreground on filled primary | `#FFFFFF` | `#1C201E` | `--color-on-primary` |
| Primary text | `#282B29` | `#F5F0E8` | `--color-text` |
| Secondary text | `#686D76` | `#B8BDB9` | `--color-text-secondary` |
| Accent / dusty rose | `#D9A49A` | `#D9A49A` | `--color-accent` |
| Accessible accent foreground | `#95594E` | `#E3B4AA` | `--color-accent-strong` |
| Success / progress | `#DDE6D5` | `#A8C5A0` | `--color-success`, `--color-progress` |
| Accessible success / progress foreground | `#4F6B49` | `#A8C5A0` | `--color-success-strong`, `--color-progress-strong` |
| Borders | `#E1DDD5` | `#3D433F` | `--color-border` |

Derived supporting tokens cover soft accent surfaces, elevated charcoal surfaces, muted text, warning/danger/info states, success and danger hover states, and progress tracks. The values remain within the approved warm cream, terracotta, dusty rose, sage, and charcoal families.

## Implementation Summary

### 1. Central theme layer

`src/index.css` now owns the palette as a single source of truth:

- Canonical `--color-*` semantic tokens for light and dark.
- Existing `--bg-*`, `--surface-*`, `--text-*`, `--border-*`, and `--accent-*` names retained as aliases to the same values, so there is no competing theme system.
- `@custom-variant dark (&:where(.dark, .dark *));` preserves the existing class-based dark mode.
- `color-scheme: light` / `color-scheme: dark` added for native form controls and scrollbars.
- `::selection` now uses the Palette 2 primary token.
- Added accessible foreground tokens for text on filled primary, success, accent, and danger surfaces.

### 2. Theme bootstrap

`index.html` now includes a small pre-paint script that reads the existing `careerpilot_settings` localStorage record and applies `.dark` before first paint. This preserves the existing preference and default behaviour while avoiding a theme flash on reload.

### 3. Component migration

All previously hardcoded legacy palette classes were replaced with semantic tokens. This includes:

- Primary, secondary, muted, and inverse text.
- Navigation, sidebar, header, active, hover, and focus states.
- Cards, modals, drawers, inputs, borders, and empty states.
- Primary, secondary, danger, warning, success, and progress actions.
- Dashboard, onboarding, profile, learning hub, career, roadmap, CV, documents, jobs, applications, interviews, activity, and progress indicators.
- AI Copilot, global search, and notifications surfaces.
- All progress bars now use sage progress tokens with a sage track. The Profile page gradient was replaced with a solid sage fill so terracotta is not used as a progress colour.

### 4. RTL and responsive behaviour

No RTL/LTR logic, route logic, layout rules, spacing, or responsive breakpoints were changed. The existing language toggle still sets `dir` and `lang`, and Arabic keeps the same Palette 2 colours.

## Verification

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm test` | **146 tests passed, 0 failed** |
| TypeScript lint | `npm run lint` | **Passed** |
| Production build | `npm run build` | **Passed** |
| Dependency audit | `npm audit` | **0 vulnerabilities** |

Build output:

- `dist/index.html` - 1.93 kB
- `dist/assets/index-fdEXALsv.css` - 56.68 kB
- `dist/assets/index-CvN0NUsU.js` - 922.72 kB

Test cleanup reported no remaining `cp-test-*` identities, no orphaned storage objects, and an unchanged `.careerpilot_state.json`.

### Light and dark rendering verification

The live application at `http://localhost:3000` was audited in both themes with the browser rendered at desktop width. Every visible text node was checked against its composited background for WCAG AA contrast, alongside a legacy-colour scan and a review of buttons, inputs, cards, progress bars, drawers, and overlays.

Screens verified:

- Landing page
- Sign-in modal
- Sign-up modal
- Onboarding, all five steps
- Dashboard
- My Career
- Roadmap
- Skills Center
- Learning Hub
- Projects
- Evidence
- CV Studio
- Documents
- Jobs
- Applications
- Interviews
- Activity
- Progress
- Career Analysis
- Career Plan
- Roles
- Profile
- Settings
- AI Copilot drawer
- Global search modal
- Notifications drawer

Results:

- No visible text below WCAG AA in either theme on the audited screens.
- No legacy indigo, emerald, blue, purple, sky, teal, or amber UI classes remained.
- Primary buttons use white on `#B94736` in light mode and `#1C201E` on `#D66A58` in dark mode.
- Cards, inputs, borders, and secondary text follow the correct light/dark surfaces.
- Progress fills are sage in both themes; light uses `#5F7F58` on `#DDE6D5`, dark uses `#A8C5A0` on `#3D433F`.
- The Settings theme toggle changed the live document class and persisted `{"theme":"dark"}` / `{"theme":"light"}` to `careerpilot_settings`.
- A reload retained the selected theme.
- The language toggle set `dir="rtl"`, `lang="ar"`, and the Arabic font, with Palette 2 colours unchanged; switching back restored `ltr` / `en`.
- The CV print preview remains intentionally light-paper in both themes.

Representative contrast ratios:

| Pair | Ratio | Requirement |
| --- | --- | --- |
| Light primary button text on `#B94736` | 5.23:1 | AA normal text |
| Light primary text on background | 4.61:1 | AA normal text |
| Light secondary text on secondary surface | 4.50:1 | AA normal text |
| Light success-strong on success surface | 4.63:1 | AA normal text |
| Light progress fill on progress track | 3.51:1 | AA non-text |
| Dark primary button text on `#D66A58` | 4.76:1 | AA normal text |
| Dark primary text on card | 5.62:1 | AA normal text |
| Dark secondary text on background | 8.64:1 | AA normal text |
| Dark success/progress on background | 8.75:1 | AA normal text |
| Dark progress fill on progress track | 5.38:1 | AA non-text |

The browser session did not expose a capturable desktop window for pixel screenshots. Verification therefore used the live rendered DOM, computed styles, accessibility snapshots, and the contrast/legacy-colour scans above across every listed screen.

## Files Changed

### Theme entry points

- `index.html`
- `src/index.css`
- `src/App.tsx`

### Application surfaces

- `src/components/auth/AuthModal.tsx`
- `src/components/copilot/CopilotDrawer.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/GlobalSearchModal.tsx`
- `src/components/notifications/NotificationsDrawer.tsx`

### Views

- `src/components/views/ActivityView.tsx`
- `src/components/views/ApplicationsView.tsx`
- `src/components/views/CVStudioView.tsx`
- `src/components/views/CareerAnalysisView.tsx`
- `src/components/views/CareerPlanView.tsx`
- `src/components/views/CareerSetupView.tsx`
- `src/components/views/DashboardView.tsx`
- `src/components/views/DocumentsView.tsx`
- `src/components/views/EvidenceView.tsx`
- `src/components/views/InterviewsView.tsx`
- `src/components/views/JobsView.tsx`
- `src/components/views/LandingView.tsx`
- `src/components/views/LearningCenterView.tsx`
- `src/components/views/MyCareerView.tsx`
- `src/components/views/OnboardingView.tsx`
- `src/components/views/ProfileView.tsx`
- `src/components/views/ProgressView.tsx`
- `src/components/views/ProjectsView.tsx`
- `src/components/views/RoadmapView.tsx`
- `src/components/views/SettingsView.tsx`
- `src/components/views/SkillsCenterView.tsx`

### Report

- `PALETTE_2_IMPLEMENTATION_REPORT.md`

## Remaining Non-Theme Colours and Reasons

1. **CV print-preview paper** - `CVStudioView.tsx` intentionally keeps `bg-white`, `text-slate-*`, and `border-slate-*` for the printable CV sheet. The sheet represents paper and must stay white in both themes. Its brand title uses the fixed `--color-print-primary` token (`#B94736`) so the printed document keeps the palette brand colour.
2. **Modal scrims** - `bg-black/40`, `bg-black/50`, and `bg-black/60` are neutral backdrop overlays used to dim the page behind dialogs and drawers. They are not brand colours and remain intentionally translucent black for separation and contrast.
3. **Semantic states** - Warning, danger, and info colours are derived semantic tokens rather than Palette 2 brand colours. They are required for error, destructive, and informational feedback and are not used for success or progress.

No old Palette 1 UI colours remain in the application source.

## Verification Status

**PASS** - Palette 2 is implemented, the live light/dark audit passed across all requested screens, and tests, lint, build, and audit all passed.
