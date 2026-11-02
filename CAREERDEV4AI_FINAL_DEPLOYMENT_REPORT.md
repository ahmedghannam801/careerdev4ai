# CareerDev4AI — Final Verification & Production Deployment Report

**Date:** 2 November 2026
**Product:** CareerDev4AI
**Production URL:** https://careerdev4ai.pages.dev/
**Verified commit:** `335c574ee0827db72ef4698d2f5eda44d564b366`
**Branch:** `audit/before-supabase-migration`
**Hosting:** Cloudflare Pages (project `careerdev4ai`, branch `main`)
**Supabase project:** `ciihprsfdojzvjnqgbxl`

---

## 1. Executive summary

The application was inspected module by module, the confirmed defects were fixed, and the resulting commit was built, tested, and deployed to Cloudflare Pages production.

**Deployment status: LIVE and verified.**

| Item | Result |
| --- | --- |
| Production deployment | **Succeeded** |
| Deployment ID | `1b9dab0e-f571-4e2b-ab7b-77dc0f45563b` |
| Deployed source SHA | `335c574` |
| Deployment URL | https://1b9dab0e.careerdev4ai.pages.dev |
| Production alias | https://careerdev4ai.pages.dev/ |
| Production bundle | `assets/index-CHWlz64Y.js` (matches the locally built bundle) |
| TypeScript (`npx tsc --noEmit`) | **Pass** |
| Production build (`npm run build`) | **Pass** — `dist/_worker.js` 3.29 MiB |
| Full test suite (`npm test`) | **627 tests — 625 pass, 2 skipped, 0 fail** (145 suites) |
| Production smoke test | **Pass** at 320 px, 390 px, 768 px; LTR and RTL |
| Git push | **Not performed — repository has no configured remote** (see §8) |

No existing feature was rebuilt, no working implementation was replaced, and no UI redesign was introduced. The production identity is `CareerDev4AI` throughout.

---

## 2. What was verified, and how

The verification followed the required path for every module:

**UI → API → database/service → persistence → reload → user isolation.**

- The UI was exercised against the **production** deployment in a real Chromium browser.
- The API was exercised against the **production** `/api/*` routes with a real Supabase session.
- Persistence was checked by reloading the page and re-reading the record.
- Isolation was checked by attempting to read or write another user's records.
- Database-level checks were run against the production Supabase project.
- Static checks were run on the source and on the built client bundles.

---

## 3. Module verification

Legend: **WORKING** = present, exercised end to end, persists correctly.

| Module | Status | Evidence |
| --- | --- | --- |
| Authentication (login, session restore, logout, password recovery) | WORKING | Production login succeeded; session survived reload; `/api/roadmap` and upload routes return `401` without a session; existing auth tests pass. |
| Server-derived identity | WORKING | Every user-owned route uses `req.authUser!.id` from the verified token. No route accepts a body/query `userId` or `profileId` as the owner. |
| User isolation | WORKING | Ownership tests pass for CVs, CV versions, roadmaps, tasks, projects, volunteering, learning items, interviews and profile data. Cross-user reads/writes return `404`/`403` or empty sets. |
| Supabase RLS | WORKING | RLS enabled on all user-owned tables; policies use `auth.uid()` or parent-row ownership. Verified in production `pg_policies`. |
| Profile read/write and privacy | WORKING | Own profile read/write works. Direct anon PostgREST reads of `profiles` now return `401`; the public profile is served only by `GET /api/profile/public/:username` with the service role. |
| Onboarding | WORKING | New accounts are routed to onboarding; completing it unlocks the signed-in shell. |
| Roadmap — enroll | WORKING | `POST /api/roadmap/enroll` tested and covered by `coverage.test.ts`. |
| Roadmap — task progress | WORKING | `PATCH /api/roadmap/tasks/:taskId` persists status; covered by `roadmap.test.ts`, `b4.test.ts`, `domains.test.ts`, `personalization-api.test.ts`, `security.test.ts`. |
| Roadmap — enrollments list | WORKING | `GET /api/roadmap` returns the caller's roadmaps. Note: the route vocabulary is `/api/roadmap` (singular), not `/api/roadmaps/enrollments`; the plural path correctly returns `404 JSON`. |
| Multi-track target roles | WORKING | `profiles.target_role` remains the primary track; `saved_roles` backs additional tracks. Promoting a saved role saves the previous primary as an additional track. |
| CV upload and parse | WORKING | PDF, DOCX, TXT and JSON accepted; legacy `.doc` rejected; parsing produces structured CV data. |
| CV persistence | WORKING | CV records and versions survive reload; ownership enforced at every read/write. |
| CV export / print | WORKING | Export uses `window.print()` with a print stylesheet. The exported page is selectable text, not a raster image, and Arabic text is supported. |
| CV text safety | WORKING | No `eval`, `new Function`, `dangerouslySetInnerHTML` or direct `innerHTML` in app code; URLs are validated through `parseHttpUrl`. |
| AI language selector | WORKING | Five response languages (`en`, `ar`, `fr`, `de`, `es`) are an explicit setting, separate from the `en`/`ar` interface language. The selected code is sent with every AI request and persisted in the AI-preference cache. |
| AI failure handling | WORKING | AI routes enforce a daily budget (`429` with `Retry-After`), and routes with a deterministic fallback continue without the model. The language is never inferred from the prompt. |
| Training catalog accuracy | WORKING | `provider_tier` distribution in production: 93 tier-1, 127 tier-2, 285 tier-3. CS50 is described as free to audit with a free CS50 Certificate and an optional paid edX verified certificate. MIT OpenCourseWare is described as free with no certificate/credit. |
| Training relevance gate | WORKING | Tier only ranks otherwise-relevant courses; it never makes an unrelated course eligible. Covered by the relevance-gate tests. |
| Learning persistence | WORKING | Saved / in-progress / completed / dismissed status and progress percent persist through `/api/learning/items`. |
| Project start | WORKING | A recommended project is written to the user's workspace with goal, tasks, deliverables, skills and status `planned`. A duplicate-title guard prevents a second record for the same recommendation. |
| Project progress persistence | WORKING | Project status and fields persist through the projects API and survive reload. |
| Project task-level checklist | **PARTIAL** | Project status persists, but per-task checkboxes inside a project are not implemented. Tasks are stored as text and are not individually toggled. This is a known gap, not a regression. |
| Interview flow | WORKING | The adaptive interview builds a deterministic plan, asks questions sequentially, and saves each answered question through `saveInterviewSession` / `/api/mock-interview`. Sessions persist and are owner-scoped. |
| Volunteering catalog | WORKING | Production returns 35 opportunities, all in Egypt or online. On-site roles outside Egypt are excluded. The UI re-applies the same rule if it receives a cached response. |
| Volunteering links | WORKING | 12 catalog links checked in production; all returned HTTP 200 (Egyptian RC, Resala, Injaz Egypt, Baheya, Egyptian Clothing Bank, Egyptian Food Bank, Etijah, AYB-SD, Nahdet El Mahrousa, UNICEF Egypt, Catchafire, Taproot). |
| JSON API 404 behavior | WORKING | `/api/does-not-exist` returns `404 application/json`; `/api/roadmaps/enrollments` returns `404 JSON`; the SPA fallback does not swallow unknown API paths. |
| Upload validation | WORKING | Extension + MIME allow-list, 10 MB multer limit, authenticated ownership, and storage paths scoped to the user. |
| Localization | WORKING | Interface supports `en` and `ar`; switching the account language to Arabic applies `dir="rtl"` and `lang="ar"`; translation-coverage tests pass. |
| Responsive layout | WORKING | Zero horizontal overflow at 320, 390 and 768 px across all tested routes, in both LTR and RTL. |

---

## 4. Test results

Command: `npm test`

```
tests 627
suites 145
pass 625
fail 0
cancelled 0
skipped 2
todo 0
```

- **0 failures.**
- The **2 skips** are conditional tests in `tests/coverage.test.ts` that skip when the server has a model configured (they cover the “no model configured” path). They are pre-existing conditional skips, not tests disabled during this pass.
- No test was weakened, deleted, or skipped to obtain a green run.
- The suite's own teardown confirmed: no test identities remain, no orphaned storage objects remain, and `.careerpilot_state.json` was unchanged.

### Added regression coverage

- `tests/security.test.ts` — direct anon reads of `profiles` are refused.
- `tests/personalization-api.test.ts` — every volunteering opportunity is in Egypt or online.
- `tests/ai-languages.test.ts` — five AI response languages and explicit instruction wiring.
- `tests/career-tools.test.ts`, `tests/headline-suggestions.test.ts`, `tests/interview-plan.test.ts`, `tests/professional-links.test.ts`, `tests/training-courses.test.ts` — the new/verified module behavior.

### TypeScript and build

- `npx tsc --noEmit` — **no output, exit 0**.
- `npm run build` — **success**, `dist/_worker.js` written (3.29 MiB), `assets/index-CHWlz64Y.js` produced.

---

## 5. Security verification

### 5.1 User isolation

- Every user-owned table has RLS enabled.
- Policies use `auth.uid()` or a parent-row ownership check.
- Cross-user access attempts return `404`/`403` or an empty result; they do not leak existence.
- The API derives the owner from the verified session, never from request body/query fields.

### 5.2 Supabase RLS and profile privacy

A real issue was found and fixed during this pass:

- `profiles` had a **row-level** public policy (`profiles_select_public`, `is_public = true`). RLS does not restrict columns, so the public anon key could read every column of a public profile — including `phone`.
- Fix: migration `20261102000004_profiles_column_grants.sql` drops the broad public policy and revokes direct anon `SELECT` on `profiles`.
- The public profile page already uses the service role through `GET /api/profile/public/:username` and maps only the fields it exposes.
- Verified in production:
  - anon direct read → `401 permission denied for table profiles`;
  - authenticated user reading their own row → allowed;
  - authenticated user reading another user's row → empty set.

Migration `20261102000003_learning_catalog_branding.sql` was also applied and recorded: it adds `provider_tier`, `rating`, `rating_count`, `thumbnail_url` and corrects the CS50/MIT availability notes. Both migrations are recorded in `supabase_migrations.schema_migrations`.

### 5.3 Secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and `SUPABASE_ACCESS_TOKEN` are **absent** from the built bundle.
- No Google API key pattern is present in client bundles.
- The only JWT in the client bundle is the **public anon key** (`role=anon`, project ref `ciihprsfdojzvjnqgbxl` verified); it is not the service-role key.
- `service_role` appears only in the server worker bundle, never in `dist/assets/*`.
- No secret values are reproduced in this report.

### 5.4 Injection and unsafe rendering

- No `eval`, `new Function`, `dangerouslySetInnerHTML`, or direct `innerHTML` assignment in app code.
- External URLs are validated through `parseHttpUrl`, which rejects non-HTTP(S) schemes such as `javascript:`.
- CV export renders text through the browser print pipeline; it does not rasterize user content.

### 5.5 Upload boundary

- Extension and MIME type must both match the allow-list.
- 10 MB limit enforced by multer and re-checked before storage.
- Storage object paths are scoped to the authenticated user.
- Ownership is re-checked before a CV version can reference a CV.

---

## 6. Production smoke test

The production alias was exercised in Chromium at three viewports.

| Viewport | Result |
| --- | --- |
| 320 px | No horizontal overflow; all tested routes rendered; zero console/page/request errors. |
| 390 px | No horizontal overflow; all tested routes rendered; zero console/page/request errors. |
| 768 px | No horizontal overflow; all tested routes rendered; zero console/page/request errors. |

**Routes exercised:** landing, login, dashboard, my-career, roadmap, learning, projects, volunteer, cv-studio, interviews, profile, settings.

**RTL:** switching the account language to Arabic applied `dir="rtl"` and `lang="ar"` on the document, with no horizontal overflow. The language was restored to English afterward.

**API behavior in production:**

| Request | Result |
| --- | --- |
| `GET /` | `200 text/html` |
| `GET /api/does-not-exist` | `404 application/json` |
| `POST /api/resumes/upload` (no session) | `401 application/json` |
| `GET /api/roadmap` (no session) | `401 application/json` |
| `GET /api/roadmaps/enrollments` | `404 application/json` (route does not exist; correct) |
| `GET /site.webmanifest` | `200 application/manifest+json` |
| `GET /favicon.svg` | `200 image/svg+xml` |
| `GET /theme-init.js` | `200 application/javascript` |
| `GET /_worker.js` | `404` (not publicly served) |
| `GET /#/dashboard` (SPA route) | `200 text/html` |

**Authenticated API checks:** volunteering returned 35 opportunities, all Egypt or online; `/api/roadmap` returned the caller's (empty) roadmap list; `/api/learning/catalog` served the new `providerTier`/`rating`/`thumbnailUrl` fields.

The smoke-test identity was deleted afterward; no test user remains in production.

---

## 7. Genuine remaining issues

Only real, current gaps are listed. None blocks deployment.

1. **Project task-level checklist is not implemented.**
   Project status and fields persist, and tasks are stored as text, but individual tasks cannot be checked off inside a project. This is a known partial, not a regression.

2. **Roadmap empty state for a brand-new account.**
   A new account with no target role sees an empty roadmap until a target role is chosen. The roadmap then generates normally. This is expected behavior of the relevance-gated generator, but the empty state is sparse.

3. **Git push could not be performed.**
   The repository has **no configured git remote** (`git remote` is empty). The verified commit exists locally and was deployed directly from that commit through Wrangler. No push was claimed or faked.

4. **No automated Playwright suite is checked into the repository.**
   The browser smoke test was run from a temporary external script. The production smoke results are real, but they are not part of `npm test`. Adding a committed E2E suite would make this repeatable.

---

## 8. Deployment record

| Field | Value |
| --- | --- |
| Provider | Cloudflare Pages |
| Project | `careerdev4ai` |
| Environment | Production |
| Branch | `main` |
| Deployment ID | `1b9dab0e-f571-4e2b-ab7b-77dc0f45563b` |
| Source SHA | `335c574` |
| Deployment URL | https://1b9dab0e.careerdev4ai.pages.dev |
| Alias | https://careerdev4ai.pages.dev/ |
| Client entry | `assets/index-CHWlz64Y.js` |
| Worker bundle | `dist/_worker.js` (3.29 MiB) |
| Migrations applied | `20261102000003_learning_catalog_branding.sql`, `20261102000004_profiles_column_grants.sql` |

**Deployment note:** the deployed SHA matches the verified local HEAD, and the production alias serves the same client entry as the local build. Because no remote is configured, the commit was not pushed to a Git host; deployment was performed from the verified commit via Wrangler. This is the only deviation from the “push, then deploy” sequence, and it is a repository configuration limitation rather than a skipped verification step.

---

## 9. Final gate checklist

| Gate | Status |
| --- | --- |
| User isolation verified | ✅ |
| Supabase RLS verified | ✅ |
| No exposed secrets | ✅ |
| Server-derived identity | ✅ |
| Working authentication | ✅ |
| Profile persistence | ✅ |
| Roadmap persistence | ✅ |
| CV persistence | ✅ |
| Upload validation | ✅ |
| Commit matches deployed source | ✅ `335c574` |
| Production build passes | ✅ |
| Tests pass | ✅ 625 pass / 0 fail |
| Production smoke test passes | ✅ 320/390/768 px, LTR + RTL |
| Push to remote | ⚠️ No remote configured |

**Conclusion:** CareerDev4AI is deployed and verified in production at https://careerdev4ai.pages.dev/ from commit `335c574`, with all critical security and persistence gates passing. The remaining items are documented gaps, not deployment blockers.
