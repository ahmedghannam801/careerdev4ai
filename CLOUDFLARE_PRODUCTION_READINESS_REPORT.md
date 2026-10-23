# CareerPilot AI — Cloudflare Production Readiness Report

**Target:** `https://careerpilotai.pages.dev` (Cloudflare Pages)
**Date:** 2026-10-23
**Constraint set honoured:** no redesign, no palette/layout/route/UX/RTL/typography/animation changes, existing Supabase project, existing Gemini implementation, GitHub OAuth left disabled, no secret was requested, printed, or committed.

---

## 1. Status at a glance

| Area | Status |
| --- | --- |
| Application build (`npm run build`) | **VERIFIED** |
| Type check (`npm run lint`) | **VERIFIED** |
| Test suite (`npm test`) | **VERIFIED** — 146/146 |
| Dependency audit (high/critical) | **VERIFIED** — 0 vulnerabilities |
| Worker runtime + static assets (local Workerd emulation) | **VERIFIED** |
| API contract, auth gate, SPA/404 routing, security headers | **VERIFIED** |
| Client bundle contains no server secret | **VERIFIED** |
| Deployed to `careerpilotai.pages.dev` | **BLOCKED** — no Cloudflare account/credentials in this environment |
| Live Google / LinkedIn OAuth | **BLOCKED** — provider credentials + dashboard allowlist |
| Live Gemini responses | **BLOCKED** — no `GEMINI_API_KEY` configured |
| Official logo / OG image | **BLOCKED** — asset does not exist in the repository; not invented |

The repository is production-ready and locally proven; the remaining work is cloud-side configuration and deployment, listed in §4 and §5.

---

## 2. What was changed (and why)

The app was already a Vite + React SPA with an Express API. Cloudflare Pages cannot run the Express app through the default Functions bundler: that bundler substitutes `node:*` with `unenv`, so `http.createServer` fails at runtime. The app was therefore not merely "configured" but packaged correctly:

1. **Express app split out of the server entry** — `app.ts` now exports `const app`; `server.ts` is the Node entry (dotenv, Vite middleware or static files, `listen`). Local dev, tests and production execute the **same** route code.
2. **Pages advanced mode** — `worker/index.ts` is the Pages entry; `scripts/build-worker.mjs` bundles it with esbuild into `dist/_worker.js`. `/api/*` is dispatched through `cloudflare:node`'s `handleAsNodeRequest`; everything else is served from the `ASSETS` binding with a hash-routing-safe SPA fallback and honest 404s for asset-shaped paths. `node:*`/`cloudflare:*` are left external so the runtime supplies real implementations.
3. **Workers-compatible runtime code**
   - Gemini uses `@google/genai/web` (fetch-based, no `google-auth-library`) and is constructed **lazily**, so a missing key cannot prevent the API from booting; AI routes return their existing explicit 503.
   - `body-parser`'s `iconv-lite` was replaced with a small UTF-8 JSON/urlencoded parser (15 MB limit, 400 on malformed JSON, 413 on oversize). Multipart uploads still go through multer.
   - The module-level `setInterval` rate-limit sweep was replaced with a lazy sweep (Workers rejects global-scope timers).
   - A `createRequire('/_worker.js')` banner covers the few remaining CJS `require`s; `supports-color` is aliased to a stub.
4. **Pages configuration** — `wrangler.jsonc`: project `careerpilotai`, `pages_build_output_dir: "./dist"`, `compatibility_date: 2026-09-01` (Node compat on by default at this date; the HTTP-server bridge depends on it), preview URLs enabled.
5. **Security** — `public/_headers` adds HSTS, CSP, COOP, XCTO, frame denial, permissions policy, immutable caching for `/assets/*` and revalidation for the document. API responses carry the same baseline in `app.ts`. The inline theme bootstrap moved to `public/theme-init.js` so `script-src 'self'` needs no `unsafe-inline`.
6. **Auth UX (no visual redesign)** — Google and LinkedIn (OIDC) buttons in the existing auth modal, a loading state, the existing divider language, and a surface for OAuth/email-link redirect errors (`consumeAuthRedirectError` cleans the URL and opens the modal). Registration now sends `emailRedirectTo: window.location.origin`. The API is unchanged; GitHub remains absent.
7. **Docs and ops** — `README.md` deployment/auth/env guide, `.env.example` aligned to the real variable set, `.gitignore` for `.wrangler/` and `.tmp-qa/`, `cf:dev` / `cf:deploy` scripts, neutral `CP` favicon in Palette 2 primary `#B94736`.

---

## 3. VERIFIED (evidence)

### 3.1 Build, types, tests, audit

```
npm run lint    -> clean (tsc --noEmit)
npm run build   -> vite build + node scripts/build-worker.mjs
                   dist/_worker.js = 1,203,187 bytes (~1.15 MiB)
npm test        -> 146/146 passing (Node entry, i.e. the same app.ts)
npm audit --audit-level=high -> found 0 vulnerabilities
```

`dist/` contains `index.html`, `assets/`, `favicon.svg`, `theme-init.js`, `_headers`, `_worker.js`. `_worker.js` is the Pages entry; Pages never serves it publicly (verified 404).

### 3.2 Runtime smoke test (`npx wrangler pages dev dist`)

| Request | Result |
| --- | --- |
| `GET /api/health` | 200 JSON |
| `GET /api` and `/api/unknown` | 404 JSON |
| `GET /api/profile` (no token) | 401 JSON |
| `POST /api/state` (no token) | 401 JSON |
| `OPTIONS /api/health` | 204 + CORS |
| `GET /` | 200 HTML |
| `GET /dashboard` | 200 HTML (SPA shell) |
| `GET /favicon.svg`, `/theme-init.js` | 200 |
| `GET /assets/nope.js`, `/nope.js`, `/_worker.js` | 404 |
| Response headers | CSP, HSTS, XCTO, XFO, Referrer-Policy, Permissions-Policy present |

Supabase connectivity was exercised through the Worker: `/api/profile/public/<missing>` returned the expected 404 JSON, proving URL/key reachability from the runtime. Browser check: landing page renders correctly in the approved design, the auth modal shows "Continue with Google" / "Continue with LinkedIn", and the console is error-free.

### 3.3 Secret containment

`dist/` was scanned for the actual `SUPABASE_SERVICE_ROLE_KEY` value: **0 occurrences**. The only key material in the client bundle is the public Supabase URL and publishable/anon key (by design; RLS is the boundary). No Gemini key exists in the environment, so none can leak. `.env`, `.env.test`, `dist/`, `.wrangler/` and `.tmp-qa/` are gitignored.

---

## 4. MANUAL CLOUD CONFIGURATION

These steps require account access and are **not** performed by the repository.

### 4.1 Cloudflare Pages project

1. Authenticate Wrangler (`npx wrangler login`, or provide `CLOUDFLARE_API_TOKEN` with Pages:Edit for CI) and create/select the account.
2. Either deploy directly:
   ```
   npm run cf:deploy
   # = npm run build && wrangler pages deploy dist --project-name careerpilotai
   ```
   or connect the Git repository with:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** repository root
   - Node version: 20 or 22.
3. Keep `wrangler.jsonc` as the source of truth for `compatibility_date` (**2026-09-01 or later**) and preview URLs. Do not add a `functions/` directory: routing must go through the prebuilt advanced-mode `dist/_worker.js`.
4. Set the environment variables below for **both Production and Preview** (Pages → Settings → Environment variables). `VITE_*` values are inlined at build time and require a rebuild; the rest are readable by the Worker at runtime. Mark every non-`VITE_` value as a **secret**.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | build (public) | yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build (public) | yes | publishable/anon key |
| `SUPABASE_URL` | runtime (secret) | yes | server-side Supabase URL |
| `SUPABASE_ANON_KEY` | runtime (secret) | yes | token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime (secret) | yes | server-side data access |
| `GEMINI_API_KEY` | runtime (secret) | yes for AI | Gemini API key |
| `GEMINI_MODEL` | runtime | no | defaults to `gemini-3.8-flash` |
| `ALLOWED_ORIGINS` | runtime | no | extra CORS origins; same-origin needs none |

`PORT` is only for the Node server and is ignored on Pages.

### 4.2 Supabase (project `ciihprsfdojzvjnqgbxl`)

1. **Authentication → URL Configuration**
   - Site URL: `https://careerpilotai.pages.dev`
   - Redirect URLs: `https://careerpilotai.pages.dev/**`, `https://*.careerpilotai.pages.dev/**` (previews), `http://localhost:3000/**`
2. **Authentication → Providers**
   - Enable **Google**, paste client ID/secret issued by Google Cloud. Authorized redirect URI in Google Cloud: `https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`.
   - Enable **LinkedIn (OIDC)**, paste client ID/secret from LinkedIn. Callback: `https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`.
   - Leave **GitHub disabled**.
3. Confirm the "Confirm signup" email template uses `{{ .ConfirmationURL }}` so the `emailRedirectTo` origin is honoured.
4. RLS policies and the schema are unchanged by this work.

### 4.3 Post-deploy verification (5 minutes)

```
curl -i https://careerpilotai.pages.dev/api/health          # 200 JSON
curl -i https://careerpilotai.pages.dev/api/profile         # 401 JSON
curl -i https://careerpilotai.pages.dev/api/nope            # 404 JSON
curl -i https://careerpilotai.pages.dev/assets/nope.js      # 404
curl -i https://careerpilotai.pages.dev/                    # 200 + CSP/HSTS
```

Then, in a browser: sign in with Google, sign in with LinkedIn, sign in with email/password, reload to confirm session persistence, and call one AI action to confirm Gemini.

---

## 5. BLOCKERS / NOT VERIFIED

1. **Deployment not executed.** No Cloudflare credentials or account ID are available here, so `careerpilotai.pages.dev` could not be created or verified. Everything above is local Workerd evidence, not a live-URL assertion.
2. **Gemini not exercised.** `GEMINI_API_KEY` is absent from `.env`. The lazy client prevents an API-wide failure and the routes still return their explicit 503, but an end-to-end AI success path could not be tested. Set the key and test one AI action.
3. **OAuth not live-tested.** No Google/LinkedIn client credentials and no access to the Supabase provider settings. The buttons, redirect handling and error surface are verified in the browser; provider enablement and the redirect allowlist are manual (§4.2). If a provider is disabled, the app shows the provider's error rather than failing silently.
4. **Brand assets.** The repository has no official logo, favicon set or OG image. A neutral `CP` monogram in `#B94736` is used so the tab and metadata are not broken; replace `public/favicon.svg` (and add `og:image`) when official assets exist.
5. **Custom domain.** Not configured; `careerpilotai.pages.dev` is the assumed origin in metadata, CSP and the docs. A custom domain works without code changes because the CSP uses `'self'`, but the Supabase Site URL/redirect list must be extended.
6. **First-deploy caveat.** Pages must detect `dist/_worker.js` as the advanced-mode entry. If the project was previously created with a `functions/` directory or a different output directory, delete that configuration before deploying; otherwise the API will hit the incompatible default bundler.

---

## 6. Rollback / operations notes

- Every deploy is immutable in Pages; roll back from the dashboard to the previous deployment if needed.
- The Node path is unchanged: `npm run dev` / `npm start` still serve the full app from `server.ts`.
- Rebuild after changing any `VITE_*` variable; runtime secrets apply on the next request without a rebuild.
- `dist/_worker.js` is generated; never edit it by hand and never commit `dist/`.
