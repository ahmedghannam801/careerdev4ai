# CareerDev4AI — Permanent Project & Agent Instructions

This document establishes the authoritative architecture, product guidelines, engineering standards, security rules, and deployment procedures for CareerDev4AI.

---

## 1. Product Identity & Core Mission

- **Product Name**: CareerDev4AI
- **Mission**: Comprehensive, Egypt-first Career Super App serving university students, fresh graduates, job seekers, working professionals, career switchers, and freelancers across Egypt and the MENA region.
- **The Professional Journey**: `DISCOVER → LEARN → PRACTICE → PROVE → BUILD → APPLY → INTERVIEW → GROW`
- **Business Model**: Completely **100% Free**. Never introduce paywalls, subscriptions, paid tiers, or fake limitations.
- **Brand Identity**:
  - Primary Brand Color: Terracotta (`#B94736` / `var(--color-primary)`)
  - AI Guidance Accent: Purple (`var(--color-ai)`)
  - Success State: Green (`var(--color-success)`)
  - Error/Destructive State: Red (`var(--color-error)`)
  - Dark Mode: Deep navy / charcoal surfaces
  - Light Mode: Crisp off-white / parchment surfaces
- **Data Integrity**: **Zero fake metrics**. Never fabricate job postings, course completion percentages, fake platform activity, or simulated success.

---

## 2. Technology Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Lucide React, Motion (`motion/react`).
- **Backend / Edge**: Cloudflare Pages + Cloudflare Workers (`dist/_worker.js` via `worker/index.ts`), Express/Node server for tests (`server.ts` / `app.ts`).
- **Database & Auth**: Supabase PostgreSQL (Row Level Security enabled on all tables), Supabase Auth, Supabase Storage, Supabase Realtime.
- **Background Jobs**: Cloudflare Queues (`careerdev4ai-jobs`) with durable worker consumer (`worker/jobs/`).
- **AI Providers**: Google Gemini API (`@google/genai`) as primary reasoning provider, OpenRouter as secondary/fallback.
- **Job Integrations**: JSearch API (RapidAPI) + verified external deep-links to LinkedIn Jobs (honest about OAuth scopes: `openid email profile` only).
- **Internationalization**: 100% Arabic (RTL) & English (LTR) bilingual coverage. Every user-facing string must pass through `t()` and exist in `src/translations/parts/`.

---

## 3. Directory Layout

- `src/`: Client application code.
  - `components/views/`: Primary views (`LandingView`, `DashboardView`, `CVStudioView`, `SkillAssessmentView`, etc.).
  - `components/landing/`: Landing page modular sections (`HeroVisual3D`, `ProductPreview`, `FeatureGrid`, etc.).
  - `context/`: `CareerContext.tsx` authoritative single source of truth for user profile, roadmaps, goals, and localization.
  - `translations/`: Modular translation dictionary parts (`landing.ts`, `skills.ts`, `jobs.ts`, etc.).
- `server/`: Server API handlers, database access layers (`server/db/`), queue transport, and AI endpoints.
- `worker/`: Cloudflare Pages worker entrypoint (`worker/index.ts`) and background jobs worker (`worker/jobs/`).
- `supabase/migrations/`: SQL migration files for Supabase schema, RLS policies, and triggers.
- `public/`: Static public assets (`images/`, `brand/`, `favicon.ico`, `robots.txt`).
- `tests/`: End-to-end and integration test suites run via `tests/runner.mjs`.
- `.agents/skills/`: Workspace-specific Antigravity agent skills.

---

## 4. Engineering Standards & Conventions

1. **TypeScript Rigor**:
   - Strictly typed. Run `npm run lint` (`tsc --noEmit`) to verify 0 errors before every commit.
   - Never use unsafe type assertions (`as any`) without an explicit documented justification.
2. **Component Architecture**:
   - Single responsibility, predictable props, accessible semantic HTML.
   - Responsive by design (verified across 360px mobile to 1440px desktop).
   - Support `prefers-reduced-motion` across all micro-animations.
3. **Typography & Text Rendering**:
   - Never output raw HTML entity strings (`&amp;`, `&quot;`) inside React components or translation dictionaries. Use literal characters (`&`, `"`).
4. **Localization Rules**:
   - Run `$env:TEST_ONLY='localization'; node tests/runner.mjs` before deploying.
   - Any new translatable text must have an accompanying Arabic translation in `src/translations/parts/`.

---

## 5. Security & Safety Non-Negotiables

- **Never**:
  - Expose Supabase `service_role` key in frontend code, git commits, or client-side responses.
  - Commit `.env` secrets or production tokens.
  - Disable Row Level Security (RLS) on any production table.
  - Drop or reset production tables.
  - Scrape or access third-party services outside sanctioned, approved APIs.

---

## 6. Testing, Verification & Deployment Workflow

1. **Pre-flight Checks**:
   - `npm run lint`: Verify TypeScript compiles cleanly with 0 errors.
   - `node tests/runner.mjs`: Verify relevant unit and integration tests.
2. **Build**:
   - `npm run build`: Generates frontend assets in `dist/` and `dist/_worker.js`.
   - `npm run build:jobs`: Generates queue worker in `dist-jobs/worker.js`.
3. **Commit & Push**:
   - Verify git status: No sensitive files or unintended diffs.
   - Commit with clear semantic message (`feat: ...`, `fix: ...`).
   - Push to `main` branch: `git push origin main`.
4. **Deploy**:
   - Deploy to Cloudflare Pages: `npm run cf:deploy`.
   - Verify live production status at `https://careerdev4ai.pages.dev/api/health`.
