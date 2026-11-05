---
name: cloudflare-production-deployment
description: Governs Cloudflare Pages builds, Worker bundles, Queues background deployment, secret management, release gates, and production health verification for CareerDev4AI.
---

# Cloudflare Production Deployment Skill

This skill governs the build packaging, Cloudflare Pages deployment, Cloudflare Workers execution, Cloudflare Queues background jobs, and production release verification for CareerDev4AI.

## When to Use

Activate this skill when:
- Packaging and bundling frontend assets (`npm run build`).
- Building the background queue worker (`npm run build:jobs`).
- Deploying releases to Cloudflare Pages (`npm run cf:deploy` via Wrangler).
- Deploying the Cloudflare Queues background consumer (`npm run cf:jobs:deploy`).
- Verifying production health endpoints (`https://careerdev4ai.pages.dev/api/health`).
- Managing Cloudflare secrets and environment bindings.
- Executing rollback procedures in case of deployment anomalies.

## Production Architecture on Cloudflare

1. **Cloudflare Pages (`careerdev4ai.pages.dev`)**:
   - Static client assets served from `dist/` via Cloudflare's global edge network.
   - Server-Side API routes handled via `dist/_worker.js` compiled from `worker/index.ts` and `server/`.
   - Production branch: `main`.

2. **Cloudflare Queues (`careerdev4ai-jobs`)**:
   - Durable, distributed message queue for heavy asynchronous operations:
     - CV processing & parsing (`process-cv`)
     - Targeted CV generation (`generate-targeted-cv`)
     - Live job matching (`match-jobs`)
     - AI mentor processing (`ai-mentor`)
     - Career roadmap generation (`roadmap`)
     - Learning resource verification (`validate-learning-resources`)
   - Worker consumer: `worker/jobs/` compiled into `dist-jobs/worker.js`.

3. **Release Gates (Never Deploy a Broken Build)**:
   - Gate 1: `npm run lint` (`tsc --noEmit`) must exit with code 0.
   - Gate 2: `node tests/runner.mjs` must pass all relevant integration tests.
   - Gate 3: `npm run build` must produce valid `dist/` and `dist/_worker.js`.
   - Gate 4: `npm run build:jobs` must produce valid `dist-jobs/worker.js`.
   - Gate 5: Git working tree must be clean, committed, and pushed to `origin/main`.

## Step-by-Step Deployment Workflow

1. **Execute Release Gates**:
   ```powershell
   npm run lint
   $env:TEST_ONLY='learning-search,localization'; node tests/runner.mjs
   npm run build
   npm run build:jobs
   ```
2. **Deploy Pages Application**:
   ```powershell
   npm run cf:deploy
   ```
   Wrangler uploads changed assets, compiles the Pages Worker bundle, and publishes to `careerdev4ai.pages.dev`.
3. **Verify Live Production Endpoints**:
   - Verify health: `GET https://careerdev4ai.pages.dev/api/health` -> HTTP 200 with `status: "ok"`.
   - Verify search: `GET https://careerdev4ai.pages.dev/api/learning/search?q=python` -> HTTP 200 with courses array.
   - Verify background jobs queue: `node scripts/verify-queue-production.mjs`.

## Quality Checklist

- [ ] Did all pre-deployment checks (`npm run lint`, tests, build) pass with 0 errors?
- [ ] Is the deployed commit hash tracked and recorded?
- [ ] Does `https://careerdev4ai.pages.dev/api/health` respond with HTTP 200?
- [ ] Are all environment secrets bound properly in Cloudflare dashboard?
- [ ] Has production verification confirmed end-to-end functionality?

## Common Failure Patterns to Avoid

- **Deploying Uncommitted Work**: Deploying local edits that are not committed or pushed to Git `main`.
- **Bypassing Failing Tests**: Forcing a deployment when unit tests or TypeScript compilation fails.
- **Missing Worker Secrets**: Deploying to Pages without configuring required secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
