# CareerDev4AI — Rebrand & Deployment Report

**Date:** 1 November 2026
**Operator:** automated agent session (OpenCode)
**Cloudflare account:** `2609c1a7921f6c50f1edd82e93bff1a8`
**Companion document:** `CAREERDEV4AI_FINAL_AUDIT.md`

---

## 1. Summary

| Item | Value |
| --- | --- |
| New public URL | <https://careerdev4ai.pages.dev/> |
| New Cloudflare Pages project | `careerdev4ai` |
| Production branch | `main` |
| Deployment ID | `eed6ba5b-30d4-4590-9c08-8fb3c4912237` |
| Deployment URL | <https://eed6ba5b.careerdev4ai.pages.dev> |
| Source commit recorded by Pages | `90fd68f` (built from the uncommitted working tree) |
| Files uploaded | 50 static files + `_headers` + `_worker.js` |
| Backend | Existing Supabase project `ciihprsfdojzvjnqgbxl` (reused, unmodified) |
| Old public URL | <https://careerpilot4ai.pages.dev/> |
| Old project status | **Untouched**, still serving the previous build |

The new site is a separate Pages project. The old one was neither redeployed,
renamed, nor deleted.

---

## 2. What was deployed

`npm run build` produces a Cloudflare Pages **advanced mode** bundle:

- static React SPA: `index.html`, `assets/*`, `brand/*`, `favicon.*`,
  `theme-init.js`, `site.webmanifest`
- `_headers` — document-level CSP, HSTS and the rest of the security headers
- `_worker.js` — a single bundled Worker that serves the static assets and
  forwards `/api/*` to the same Express application used locally

Advanced mode is required: the standard `functions/` bundler substitutes Node
built-ins with `unenv`, whose `node:http` throws
`http.createServer is not implemented yet!`, so Express cannot run there.

Build output at deploy time:

```
dist/index.html                       3.48 kB
dist/assets/careerpilot-icon-*.png   40.76 kB
dist/assets/careerpilot-logo-*.png  194.17 kB
dist/assets/index-*.css              80.20 kB
dist/assets/index-*.js               ~600.7 kB   (advisory warning only)
```

---

## 3. Environment and secrets

The new project reuses the existing Supabase backend. Four production secrets
were written with `wrangler pages secret put`; values were read from the local
`.env` and were never printed, logged, or committed.

| Secret | Status |
| --- | --- |
| `SUPABASE_URL` | set (encrypted) |
| `SUPABASE_ANON_KEY` | set (encrypted) |
| `SUPABASE_SERVICE_ROLE_KEY` | set (encrypted) |
| `GEMINI_API_KEY` | set (encrypted) |

Confirmed with `wrangler pages secret list --project-name careerdev4ai`:

```
- GEMINI_API_KEY: Value Encrypted
- SUPABASE_ANON_KEY: Value Encrypted
- SUPABASE_SERVICE_ROLE_KEY: Value Encrypted
- SUPABASE_URL: Value Encrypted
```

The old project's secret set was read for comparison only (same four names); no
secret on `careerpilot4ai` was created, updated, or removed.

---

## 4. Deployment commands

```
npx wrangler pages project create careerdev4ai --production-branch main --force
npx wrangler pages secret put SUPABASE_URL            --project-name careerdev4ai
npx wrangler pages secret put SUPABASE_ANON_KEY       --project-name careerdev4ai
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name careerdev4ai
npx wrangler pages secret put GEMINI_API_KEY          --project-name careerdev4ai
npx wrangler pages deploy dist --project-name careerdev4ai --branch main
```

`--force` was needed only for project creation: Wrangler 4.152 delegates
`pages project create` to the newer Workers-based flow, which fails for an
asset-only project. The flag bypasses delegation for that one command; every
subsequent command ran directly against Cloudflare Pages without it.

`--branch main` maps the deployment to the **Production** environment, which is
what publishes `careerdev4ai.pages.dev`.

---

## 5. Verification performed

### 5.1 HTTP and content

| Check | Result |
| --- | --- |
| `GET https://careerdev4ai.pages.dev/` | 200 `text/html`, 3476 bytes |
| Title | `CareerDev4AI — Your Personal Career Operating System` |
| Canonical | `https://careerdev4ai.pages.dev/` |
| `CareerPilot` in HTML | 0 |
| `CareerDev4AI` in HTML | 6 |
| `CareerPilot` across all 6 built JS assets | 0 |
| `CareerDev4AI` across the same assets | 50 |

### 5.2 API surface

| Endpoint | Result |
| --- | --- |
| `GET /api/health` | 200 — `{"status":"ok","modelConfigured":true,"modelName":"gemini-3.1-flash-lite"}` |
| `GET /api/profile` (no token) | 401 |
| `GET /api/does-not-exist` | 404 JSON |

Authenticated checks used a temporary Supabase user created through the admin
API and signed in through the real UI:

| Endpoint | Result |
| --- | --- |
| `GET /api/profile` | 200 |
| `GET /api/volunteer/opportunities` | 200 — 49 opportunities, 10 Egypt |
| `GET /api/cv/build` | 200 |
| `GET /api/learning/items` | 200 |
| `GET /api/learning/catalog` | 200 — 505-course catalogue |
| `GET /api/projects` | 200 |
| `GET /api/cvs` | 200 |
| `GET /api/notifications` | 200 |
| `GET /api/roadmap/personalized` | 404 `no_target_role` before onboarding, 200 after the UI generated a 15-step / 208-hour roadmap |
| `GET /api/skill-gaps` | 404 `no_target_role` before onboarding, then populated |

The `no_target_role` responses are the intended contract for a fresh account,
not deployment faults.

### 5.3 Application walkthrough

Signed in on the new origin, completed the 10-step onboarding
(Software Engineer, Cairo), and visited: Home, My Career, Roadmap, Skills
Center, Progress, Learning, Projects, Volunteering, CV Studio, Jobs,
Applications, Interviews, My Documents, My Profile, Recent Activity, Evidence
and Settings.

- No visible `CareerPilot` text on any page.
- No console errors and no failed network requests on any page.
- Copilot drawer opens with the title `CareerDev4AI Copilot`, readiness,
  quick actions and the prompt input.
- Switching to Arabic sets `dir="rtl"` / `lang="ar"`, renders the Arabic UI and
  keeps `CareerDev4AI`; no old branding.
- Reloading `#/cv-studio` preserves the route and loads the studio (hash
  routing + SPA fallback).

### 5.4 SPA fallback and deep links

`#/dashboard`, `/auth/callback`, `#/cv`, `#/roadmap`, `#/learning`,
`#/volunteer`, `#/projects`, `#/certificates` all return 200 with the app shell.

### 5.5 Security headers on the new origin

```
x-frame-options: DENY
content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests;
  script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:;
  connect-src 'self' https://ciihprsfdojzvjnqgbxl.supabase.co wss://ciihprsfdojzvjnqgbxl.supabase.co
  https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; manifest-src 'self'
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=()
```

The CSP `connect-src` still points at the reused Supabase project, which is
correct: the backend did not change.

---

## 6. Legacy deployment protection

| Check | Old deployment |
| --- | --- |
| `GET https://careerpilot4ai.pages.dev/` | 200 |
| Title | `CareerPilot AI — Your Personal Career Operating System` |
| `CareerPilot` in HTML | present (6) |
| `CareerDev4AI` in HTML | 0 |
| `GET /api/health` | 200, model configured |
| Cloudflare project "Last Modified" | ~4 hours old — no new deployment |

`wrangler pages project list` shows both projects:

```
careerdev4ai     careerdev4ai.pages.dev     No git provider     modified at deploy time
careerpilot4ai   careerpilot4ai.pages.dev   No git provider     modified ~4 hours ago
```

---

## 7. Cleanup

- Temporary verification user `cp-verify-…@example.com` deleted via the Supabase
  admin API (HTTP 200).
- Temporary credentials file removed.
- Temporary verification/cleanup scripts left only in
  `D:\Claude-Workspace\Temp\opencode\` — outside the repository, never imported
  by the app.
- Local dev server stopped; no QA harness files were added to the repo in this
  pass.

---

## 8. Caveats and honest gaps

1. **OAuth providers are not verified on the new origin.** Email/password
   sign-in works end to end. Google, LinkedIn and GitHub additionally need
   `https://careerdev4ai.pages.dev/**` and the preview wildcard added to
   Supabase Auth → URL Configuration. Until then, OAuth buttons may bounce back
   to a disallowed redirect. This is a dashboard setting, not a code defect.
2. **No live Gemini completion was generated.** `/api/health` reports the model
   as configured and the Copilot UI renders and accepts input, but the free tier
   returned `429 RESOURCE_EXHAUSTED` earlier in the session, so an actual model
   response was not captured against the new origin.
3. **Mobile viewport not re-emulated.** Responsive behaviour was verified in the
   earlier UX pass at 320/390/768/1000 px. This pass confirmed no page-level
   horizontal overflow and correct RTL at available desktop widths, but did not
   run a true 390 px device emulation. The rebrand did not touch layout CSS.
4. **Deployed from an uncommitted working tree.** 73 modified and 14 untracked
   files are still uncommitted. The Pages source hash `90fd68f` refers to the
   last commit, not the exact bytes uploaded, so the deployment is not
   reproducible from git until these changes are committed.
5. **Bundle size warning.** `index-*.js` ≈ 600.7 kB, just over Vite's advisory
   threshold. Pre-existing; no action taken.
6. **Old deployment remains publicly reachable** with the old branding. That is
   intentional per the requirement to preserve it, but it means two brands are
   live until the old project is retired or redirected — a decision left to the
   owner.

---

## 9. Rollback

Nothing to roll back on the old project — it was never modified. To withdraw the
new brand, delete or unpublish the `careerdev4ai` Pages project; the legacy
`careerpilot4ai` deployment continues to serve unchanged. To revert the code,
restore the 73 modified files from git history (they are uncommitted, so
`git diff` is the record).

---

## 10. Recommended next steps

1. Add the new origin to Supabase Auth → URL Configuration (Site URL and
   redirect allow-list) and re-test Google / LinkedIn / GitHub sign-in.
2. Commit the working tree so future Pages deployments are traceable to a
   commit.
3. Run one live Copilot prompt once the Gemini quota resets, to close the last
   functional gap.
4. Decide whether `careerpilot4ai` should be retired, redirected, or kept as a
   frozen legacy snapshot.
