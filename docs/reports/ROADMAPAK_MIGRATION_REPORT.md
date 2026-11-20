# Roadmapak — Domain Migration & Logo Replacement

**Date:** 2026-11-20
**Brand:** Roadmapak
**Production URL:** <https://roadmapak.pages.dev/>
**Predecessor origin:** `https://careerdev4ai.pages.dev` (now a permanent redirect)
**Supabase project:** `ciihprsfdojzvjnqgbxl`

---

## 1. Cloudflare Pages — domain assignment

| Item | Result |
| --- | --- |
| Pages project `roadmapak` | **Created** via `wrangler pages project create roadmapak --production-branch main` |
| Production domain | **Assigned and live:** <https://roadmapak.pages.dev/> |
| Production branch | `main` |
| Deployments | `0884043d` (initial) → `6c310a6c` (final) |
| Project secrets | 13 uploaded and listed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `INDEXNOW_KEY`, `GA4_PROPERTY_ID`, `GA4_CLIENT_ID`, `GA4_CLIENT_SECRET`, `JSEARCH_RAPIDAPI_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_TEST_RECIPIENT` |
| Public variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_MODEL`, `SITE_ORIGIN` — declared in `wrangler.jsonc` and applied on deploy |

The project was created through the Wrangler CLI, not through the dashboard, so it has **no Git connection**. See §8.

## 2. SSL / HTTPS

| Item | Result |
| --- | --- |
| Issuer | Let's Encrypt (`YE2`) |
| Subject | `CN=roadmapak.pages.dev` |
| SAN | `*.roadmapak.pages.dev`, `roadmapak.pages.dev` |
| Valid | 2026-11-20 → **2027-02-18** |
| Protocol | TLSv1.3, `TLS_AES_256_GCM_SHA384` |

Verified by reading the live certificate. Cloudflare provisions and renews it automatically for a `pages.dev` domain; no certificate had to be uploaded.

## 3. Old-to-new migration

The predecessor origin was **not** deleted. It was repointed to the new origin only after the new origin had been deployed and verified.

```
GET https://careerdev4ai.pages.dev/               -> 301  https://roadmapak.pages.dev/
GET https://careerdev4ai.pages.dev/terms          -> 301  https://roadmapak.pages.dev/terms
GET https://careerdev4ai.pages.dev/api/health     -> 301  https://roadmapak.pages.dev/api/health
GET https://careerdev4ai.pages.dev/sitemap.xml    -> 301  https://roadmapak.pages.dev/sitemap.xml
GET https://careerdev4ai.pages.dev/#/dashboard    -> 301  https://roadmapak.pages.dev/ (fragment preserved by the browser)
```

**How it works.** `scripts/build-legacy-redirect.mjs` writes a two-file static deployment (`_redirects` + `index.html`) with the rule `/* https://roadmapak.pages.dev/:splat 301`. It contains no `_worker.js`, so the predecessor project serves the redirect rule rather than the application.

**Restoring the predecessor.** `npx wrangler pages deploy dist --project-name careerdev4ai --branch main` puts the application back on the old origin. The full deployment history of the project is retained.

**What a reader notices.** Supabase keeps the session in `localStorage`, which is scoped to an origin. A reader who was signed in on the old origin is sent to the new one and has to sign in again. That is inherent to any domain change, not to the redirect.

## 4. Supabase Auth configuration

| Setting | Value |
| --- | --- |
| Site URL | `https://roadmapak.pages.dev` |
| Redirect allowlist | the new origin (bare, trailing slash, `/**`, and `*.roadmapak.pages.dev/**`) |
| | `https://careerdev4ai.pages.dev`, `.../`, `.../**` — **kept** |
| | `https://careerpilot4ai.pages.dev`, `.../`, `.../**` — **kept** |
| | `http://localhost:3000`, `http://127.0.0.1:3000` and their `/**` forms |
| | `com.careerpilot.ai://auth/callback` — the native deep link |

The two previous origins stay on the allowlist for the length of the migration: recovery and confirmation links already delivered to a reader's inbox point at the old host, and Supabase refuses a redirect whose target is not listed.

Applied and read back with `scripts/supabase-auth-urls.mjs` (the Supabase Management API).

## 5. Stripe

| Item | Result |
| --- | --- |
| Webhook endpoint | `we_1UYyJrGL2qA2rllCQKVio77R` repointed from `careerdev4ai` to `https://roadmapak.pages.dev/api/stripe/webhook` |
| Signing secret | **unchanged** — the endpoint was repointed in place, so no secret was rotated |
| Subscribed events | all 23 preserved |
| Route verification | an invalid signature is refused with `Invalid signature`; a correctly signed request is accepted and reaches the body parser (`Malformed JSON body`) — both confirmed against the live origin, with no row written to the production events table |

`scripts/stripe-migrate-webhook.mjs` performs the move and is safe to re-run.

## 6. Logo

### The supplied artwork

| Property | Value |
| --- | --- |
| File | `src/assets/brand/official/roadmapak-logo.png` |
| Canvas | 1920 × 1079, 32-bit RGBA |
| Background | **transparent** — the alpha channel is 0 outside the mark; the white ribbon is a cut-out, not a white shape |
| Artwork bounds | 473 × 522 (ratio 0.906), 8.69 % of the canvas is opaque |
| Colour | an orange gradient, roughly `#FD8817` → `#F88717` |
| Light background | reads correctly — the mark is the only ink |
| Dark background | reads correctly — the mark is opaque orange with no white field to disappear |

The artwork is a **mark**, not a wordmark lockup, so no `full` lockup variant exists. The brand name is set as type next to the mark wherever the old lockup was used, which is how the previous logo behaved as well.

### Derivatives produced (`npm run brand`)

| Asset | Size |
| --- | --- |
| `src/assets/brand/roadmapak-icon.png` | 512 × 512 |
| `src/assets/brand/roadmapak-logo.png` | 1220 × 1386 |
| `public/brand/icon-512.png` | 512 × 512 |
| `public/brand/favicon-16.png` | 16 × 16 |
| `public/brand/favicon-32.png` | 32 × 32 |
| `public/brand/favicon-192.png` | 192 × 192 |
| `public/brand/apple-touch-icon-152.png` | 152 × 152, flattened on white |
| `public/brand/apple-touch-icon-167.png` | 167 × 167, flattened on white |
| `public/brand/apple-touch-icon-180.png` | 180 × 180, flattened on white |
| `public/brand/maskable-512.png` | 512 × 512, mark inside the safe zone on an opaque tile |
| `public/brand/og-image-1200x630.png` | 1200 × 630, the mark on the brand cream `#F5F0E8` |
| `public/favicon.svg` | the official 512 px raster, embedded — never redrawn |
| `public/favicon.ico` | regenerated from the 16 px and 32 px files by `npm run prebuild` |
| `public/site.webmanifest` | `name` and `short_name` are `Roadmapak` |

Renamed: `public/brand/careerra-ai-mascot.webp` → `public/brand/roadmapak-ai-mascot.webp`. The robot illustration is the AI assistant's avatar, not the platform logo, so the artwork itself was left untouched.

Removed: `src/assets/brand/careerpilot-icon.png`, `src/assets/brand/careerpilot-logo.png`, `src/assets/brand/official/careerpilot-icon.png`, `src/assets/brand/official/careerpilot-logo.png`.

`src/components/brand/Logo.tsx` is the single place the mark is rendered; it imports the two new assets, preserves the aspect ratio with `object-contain`, and carries `Roadmapak` as the default accessible label.

**No missing variant.** One artwork was supplied and one artwork was used. Nothing was recoloured, redrawn, restretched or re-lettered; the pipeline only trims the transparent margin, scales, and composites.

## 7. Brand rename

`CareerRa` / `Careerra` / `CareerDev4AI` → `Roadmapak` across 157 files: `src/`, `server/`, `shared/`, `public/`, `scripts/`, `tests/`, `e2e/`, `worker/`, `.agents/`, `.github/`, plus `index.html`, `app.ts`, `server.ts`, `capacitor.config.ts`, `wrangler.jsonc`, `package.json`, `README.md` and `.env`.

- The Arabic translation map was updated in lockstep with its English keys, so every `t()` call still resolves.
- `src/components/ui/CareerPilotAvatars.tsx` → `src/components/ui/RoadmapakAvatars.tsx`, with its exports renamed and the three import sites updated.
- The document title, meta description, Open Graph and Twitter card tags, and all three JSON-LD blocks now carry `Roadmapak` and the new origin.

### Identifiers deliberately **not** renamed

Each of these is a contract with something that already exists and cannot be renamed from here.

| Identifier | Why it stays |
| --- | --- |
| `LOOKUP_PREFIX = 'careerdev4ai'` and `parseSubscriptionLookupKey` | All nine live Stripe Prices carry `careerdev4ai_*` lookup keys. Changing the prefix makes every price lookup fail and breaks checkout. |
| `careerpilot_*` PostgreSQL functions | The live database exposes `careerpilot_daily_credit_allowance`, `careerpilot_egypt_date`, `careerpilot_active_plan_code`, `careerpilot_set_updated_at` and others. The migrations create them under that name. |
| `careerpilot_*` browser storage keys | The previous release wrote the profile, settings, skills and preference cache under these names. Renaming them would orphan every reader's state, including the unsaved CV drafts. |
| `careerdev4ai_*` browser storage keys | The CV draft, credits cache, roadmap tree and guided-tour keys, for the same reason. |
| `careerdev4ai:open-tour` | An internal DOM event name shared by the dispatcher and the listener. |
| `com.careerpilot.ai` | The installed Android application id and the OAuth deep-link scheme. |
| `careerdev4ai-jobs`, `careerdev4ai-jobs-dlq` | Cloudflare Queue resource names; the producer and the consumer must agree. |
| `careerpilot4ai` | The previous Pages project, kept as a separate deployment. |

### Consistency audit

`node scripts/rebrand-audit.mjs` searches the repository for the previous brand names, the previous origin, the previous logo paths and the previous metadata, and classifies every occurrence.

| Category | Occurrences | Files |
| --- | --- | --- |
| B. Historical record | 235 | 51 |
| C. Explicit compatibility | 11 | 6 |
| D. Internal identifier | 132 | 44 |
| **Unclassified** | **0** | — |

## 8. Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` and the test typecheck | pass |
| Database-free suite (`npm run test:logic`) | **1571 tests, 1571 pass, 0 fail** |
| Database-backed suite (`npm test`) | **could not run** — see the note below |
| `https://roadmapak.pages.dev/` loads | 200, HTTPS, title `Roadmapak — Turn Your Ambition Into a Career Plan` |
| Canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD `url` | all the new origin; no legacy origin anywhere in the document |
| `robots.txt` | served; `Sitemap: https://roadmapak.pages.dev/sitemap.xml` |
| `sitemap.xml` | served; every `<loc>` is on the new origin |
| `/terms` and the other server-rendered pages | render, carrying the new brand |
| `GET /api/health` | 200, `{"status":"ok"}` |
| `GET /api/learning/search?q=python` | 200 |
| Brand assets over HTTP | `icon-512.png`, `favicon-16/32/192.png`, `apple-touch-icon-152/167/180.png`, `maskable-512.png`, `og-image-1200x630.png`, `favicon.svg`, `favicon.ico`, `site.webmanifest` all 200; the manifest and the SVG are labelled `Roadmapak` |
| IndexNow key file | `<origin>/<key>.txt` → 200, body matches the key |
| Stripe webhook route | invalid signature refused, valid signature accepted |
| All 62 deployed JavaScript chunks | fetched from the live origin and inspected: the new brand is present, the legacy brand is absent, every storage key and the event name are intact |
| Visual check | the mark and the wordmark render in the desktop navbar, the mobile navbar, the landing hero and the sign-in modal |
| `scripts/detect-mojibake.mjs` | clean — no file carries UTF-8 mojibake |

## 9. Manual actions that remain

1. **Git-connected builds.** The `roadmapak` Pages project was created through the CLI, so it has no repository attached. Connect the repository in the Cloudflare dashboard if you want Cloudflare to build on push. Note the existing note in `README.md`: the git-connected build for the previous project fails inside Cloudflare's build container, so `npm run cf:deploy` is the working deployment path either way.
2. **Google Search Console.** Add `roadmapak.pages.dev` as a property and submit `https://roadmapak.pages.dev/sitemap.xml`. The old property should keep the old origin, which now redirects.
3. **Keep both origins on the Supabase allowlist** until the recovery links that were already sent have expired, then remove the two legacy origins.
4. **The database function names and the browser storage keys still carry the previous brand.** They are documented in §7 and can only be renamed with a database migration and a storage migration that carries every reader's state across — a separate, approved change.
5. **Consider retiring the predecessor project** once the redirect has been live long enough for every old link to have been reissued. Until then it should stay, because it is what the redirect runs on.

## 10. Files added or changed by the migration

**Added**

- `src/assets/brand/official/roadmapak-logo.png` — the supplied artwork
- `scripts/build-legacy-redirect.mjs` — builds the predecessor's redirect deployment
- `scripts/set-pages-secrets.mjs` — uploads the Pages secrets through the Wrangler CLI
- `scripts/supabase-auth-urls.mjs` — reads and writes the Supabase Auth URL configuration
- `scripts/stripe-migrate-webhook.mjs` — repoints the Stripe webhook endpoint
- `scripts/rebrand-audit.mjs` — the consistency audit
- `scripts/detect-mojibake.mjs` — guards against the UTF-8 corruption described in §11
- `scripts/production/verify-migration.mjs` — the production verification of §8
- `scripts/production/verify-bundle-identifiers.mjs` — the deployed-bundle identifier check
- `scripts/production/verify-stripe-webhook.mjs` — the webhook route check
- `scripts/production/verify-indexnow-key.mjs` — the IndexNow key-file check
- `scripts/probe-db-function-names.mjs` — reads the live function names out of the database

**Rewritten**: `scripts/generate-brand-assets.mjs`, `src/components/brand/Logo.tsx`, `index.html`, `public/site.webmanifest`, `public/robots.txt`, `wrangler.jsonc`, `package.json`, `README.md`, `capacitor.config.ts`, `metadata.json`, `.env`

**Renamed**: `src/components/ui/CareerPilotAvatars.tsx` → `src/components/ui/RoadmapakAvatars.tsx`; `public/brand/careerra-ai-mascot.webp` → `public/brand/roadmapak-ai-mascot.webp`

## 11. Notes for the next change

**The database-backed suite cannot run in this environment.** `npm test` runs
the integration tests against a dedicated, disposable Supabase project, named
in `.env.test` as `yqiuzbwaqfrvhynkobpu`. That project's DNS name does not
resolve — it has been deleted or paused — so every test that touches the
database times out after 30 seconds. This is a pre-existing condition of the
machine and has nothing to do with the migration; the suite needs a live
disposable project before it can be used as a gate again.

**A PowerShell 5.1 `Get-Content` without `-Encoding` reads a file as the system ANSI code page.** Six files were edited that way during this migration and their Arabic strings and typographic punctuation were corrupted; they were restored from `git show HEAD:<file>` and re-edited with a UTF-8-safe editor. `scripts/detect-mojibake.mjs` now scans the tree for the same fault. Edit files with an editor that reads and writes UTF-8 explicitly.

**`scripts/set-pages-env.mjs` cannot reach the Cloudflare REST API with a Wrangler login.** The credential `wrangler login` stores is an OAuth token, and the REST API refuses it with HTTP 401 even though the CLI uses the same token successfully. `scripts/set-pages-secrets.mjs` uses `wrangler pages secret bulk` instead, which handles the exchange.
