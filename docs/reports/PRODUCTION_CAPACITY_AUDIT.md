# CareerDev4AI — Production Capacity Audit & Safe Load-Test Plan

**Audit date:** 2026-11-16  
**Scope:** Read-only source/configuration audit of the current checkout.  
**Production activity:** None. No production URL was requested, no database was queried, no secrets were opened, and no load test, deployment, push, or schema operation was performed.

## Executive assessment

This application is a Vite/React SPA with one shared Express API. In production, a Cloudflare Pages advanced-mode Worker routes `/api/*` and server-rendered SEO/legal paths through the Node-compatibility runtime; all other requests go to Pages Assets. The client uses Supabase Auth and sends application API calls to the same origin. The server-side API and queue worker use Supabase's HTTP client with a server credential; source does not show raw Postgres TCP connections.

There is also a separate Cloudflare Worker that consumes a Cloudflare Queue (maximum concurrency configured as 3) and runs maintenance every five minutes. It invokes Supabase and model providers while processing applicable jobs. An additional announcement sweep is opportunistically launched at most once per minute **per API isolate** when API traffic arrives.

**No measured capacity or concurrent-user result is available.** No production or staging telemetry, database usage, live schema/index inventory, queue depth, provider billing/quota data, or safe staging credentials were available in this source audit. Therefore no claim that the service supports a particular concurrency level is warranted. The numbers below are quota-derived planning scenarios only.

Most likely constraints to measure first:
1. Workers Free CPU per invocation (10 ms) for CPU-heavy synchronous work, especially parsing uploaded CVs and serializing/transforming large inputs; model/database network wait is mostly duration, not CPU.
2. Supabase Free's small 500 MB database, 5 GB egress and 1 GB storage, plus shared Nano compute (500 MB RAM). Repeated unbounded result sets and per-row query loops raise database load and egress.
3. Data API and storage operation volume, rather than the nominal 60 Postgres connection ceiling. The server creates Supabase JS clients and uses HTTP PostgREST/Storage; it does not maintain a direct Postgres pool in the audited code.
4. Model-provider latency, quotas, retries and cost, plus at most three simultaneous queue jobs. This is distinct from the synchronous API p95.
5. API traffic-triggered scheduled-announcement work and repeated job-status/availability reads.

## Architecture

```text
Browser SPA (Pages static assets; static requests do not consume Workers request quota)
  ├─ Supabase Auth JS (session persisted; auto refresh enabled)
  └─ same-origin /api/* ──> Cloudflare Pages advanced Worker (request/CPU quota)
                                ├─ Express API (Node compatibility)
                                ├─ Supabase HTTP Data API/Auth/Storage
                                ├─ Gemini / OpenRouter / JSearch / Stripe / GA4 / IndexNow as applicable
                                └─ Cloudflare Queue producer
                                      │
                                      ▼
                          careerdev4ai-jobs Queue
                                      │
                                      ▼
                          Separate jobs Worker (queue + 5-minute cron)
                             ├─ max concurrency 3, batch size 5
                             ├─ Supabase HTTP data operations / job state RPCs
                             └─ AI and other job-specific integrations
```

**Source anchors:** `worker/index.ts:128-189`, `wrangler.jsonc:33-49`, `worker/jobs/wrangler.jsonc:33-69`, `worker/jobs/index.ts:179-290`, `server/db/supabase.ts:10-20`, `src/lib/supabase.ts:26-47`, `src/lib/apiClient.ts:62-78`.

The custom Express body parser accepts up to 15 MiB JSON/form payloads in memory, and Multer uses memory storage with a 10 MiB upload cap (5 MiB for job-description file parsing). This is a material memory/CPU risk for bursts of concurrent large uploads, even though request bodies are bounded (`app.ts:504-535,650-659`). CV file objects use the `cv-files` bucket and paths are owner-prefixed; signed downloads last five minutes (`server/db/cvStorage.ts:13-14,39-85`). A portfolio bucket also exists (`server/db/portfolioStorage.ts`). Client-download traffic may appear as Supabase Storage egress, not Cloudflare Worker API traffic.

## Endpoint inventory

The application has a large API surface: inline routes in `app.ts` plus separately registered background-job, subscription, referral, Stripe, CV-template and admin-credit-monitor routes. Auth is enforced on most user routes with `requireAuth`; public and special cases are noted below. Requests to these endpoints enter the Pages Worker. **Expected frequency is qualitative** (product action/request), not an observed rate; no production traffic telemetry was read. API methods that mutate records, upload files, trigger providers, or invoke payments can write data or cause external usage/cost.

| Method and route(s) | Auth | Database / external work | Typical frequency / risk |
|---|---|---|---|
| `GET /api/health` | Public | Configuration/health state; no user data | Monitoring/health checks; Worker request |
| `GET,POST /api/state` | Auth | Profile/preferences/skills/experience/education; POST writes selected state and may perform per-skill lookups/upserts | Startup/refresh and synchronization; read is multi-read, write mutates records |
| `GET,POST,PATCH,DELETE /api/experiences[/:id]`, `/api/educations[/:id]`, `/api/user-skills[... ]`, `/api/profile`, `/api/preferences`, `/api/profile/reorder` | Auth | User record CRUD, including profile/skill data | View load and user edits; writes DB |
| `GET,POST,PATCH,DELETE /api/notifications[/:id]`, `/api/activities`, `/api/secondary-goals[/:id]`, `/api/career-milestones[/:id]`, `/api/cover-letters[/:id]`, `/api/consent` | Auth (consent has exemptions) | User-scoped reads/writes; some notification actions touch delivery/announcement data | Dashboard/view reads and user actions; writes DB |
| `GET,POST,PATCH,DELETE /api/cvs[/:id]`, `/api/cv-versions[/:id]`; `GET /api/cvs/:id/file`; `POST /api/portfolio/upload` | Auth | CV rows/version writes, Storage upload, signed URL issue/download, object operations | CV workflow; Storage egress/GB and writes |
| `POST /api/resumes/upload`, `/api/cv/extract`, `/api/cv/extract/section`, `/api/cv/import/reviewed`, `/api/job-descriptions/extract` | Auth; AI throttling on upload/extract routes | In-memory parsing; database writes on reviewed import; model/provider work varies by route/config | User-triggered and potentially CPU/memory/provider intensive |
| `POST /api/analyze-career`, `/api/optimize-cv`, `/api/mock-interview`, `/api/suggest-summary`, `/api/generate-cover-letter`, `/api/copilot` | Auth; AI rate limiter; some credit guards | Gemini/OpenRouter calls; some paths persist results or consume/refund credits | User-triggered, expensive external latency/cost; retry/fallback can multiply calls |
| `POST /api/cv/analysis`, `/api/cv/analysis/stream`, `GET /api/cv/analyses`, `GET /api/cv/ai-quota`, `POST /api/cv/ai-assist`, `/api/cv/job-description/analyze`, `/api/cv/job-description/generate` | Auth; AI rate limit on assist/job description | Measurements/analysis persistence; provider and credit use varies | CV feature use; AI latency must be reported separately |
| `GET,POST,PATCH,DELETE /api/projects[/:id]`, `POST /api/projects/recommendations`, `/api/projects/analyze`, `/api/volunteer[... ]`, `/api/evidence[... ]`, `/api/certifications[... ]`, `/api/languages[... ]`, `/api/profile-links[... ]` | Auth (admin evidence review separately guarded) | Multiple user-scoped tables; project/evidence association queries; recommendation/analysis may call AI | Feature view and CRUD; AI endpoints can incur provider cost |
| `GET,POST,PATCH,DELETE /api/roadmap[... ]`, `GET /api/skill-gaps`, `GET /api/career-context`, `GET,POST,PATCH,DELETE /api/guides[... ]` | Auth | Roadmaps, phases, milestones/tasks, skills, profile and progress; roadmap operations can fan out | Dashboard/navigation and progress activity; writes mutate records |
| `GET /api/learning/...`, `GET,POST,PATCH,DELETE /api/learning/items[... ]`, `GET /api/experiences/catalog`, `/api/experiences/state` | Auth for user endpoints; public SEO pages separate | Courses/catalogue, user learning state, recommendation context; some recommendation enrichment may call AI | Browse and progress; list/catalogue size and response egress matter |
| `GET /api/jobs/search`, `GET /api/jobs/:jobId` | Auth + job-search limiter | JSearch external calls and potential per-provider cost/quota | User searches; provider rate/latency bound |
| `GET,POST,DELETE /api/bookmarks[... ]`, saved roles, job applications, interviews | Auth | User-scoped persistence | User browsing/actions; writes DB |
| `GET /api/profile/public/:username`, `/api/profile/check-username` | Public | Public profile lookup can read several related tables; username availability query | Public/view traffic; multi-query read fan-out |
| `POST /api/account/change-password`, `/api/account/change-email`, `/api/account/delete` | Auth + account limiter | Supabase Auth and/or Storage/database operations; deletion is destructive to the caller's own account | Rare, externally impactful; exclude from load tests |
| `/api/background-jobs` GET/POST, `/availability`, `/:id`, `/:id/retry`, `/:id/cancel` | Auth | Job rows/RPCs, queue publish/cancel and availability checks; create/retry writes and may spend AI units | Status polling can repeat reads; start/retry consumes queue/provider capacity |
| `/api/subscriptions/...`, `/api/referrals/...`, `/api/cv-templates/...`, `/api/admin/credit-monitor/...` | Mostly auth; admin endpoints require admin | Supabase tables/RPCs, credits, referral records; admin views can aggregate/query many rows | User action/admin usage; admin aggregation can be heavy |
| `/api/stripe/...` including webhook | Webhook signature for webhook; other routes auth as declared | Stripe API/webhook and payment/subscription DB writes | Low ordinary frequency; triggers financial side effects—never part of generic load test |
| `/api/admin/...` (announcements, users, analytics, learning/opportunities and management) | Auth + admin permission/permission-specific checks | Aggregation, profile/table scans, announcements/notifications fan-out and management writes | Low volume; can be expensive and externally visible; dedicated synthetic admin account required |
| `/api/seo/...`, `/about`, `/privacy`, `/terms`, `/careers`, `/learning`, `/opportunities`, `/sitemap.xml`, `/robots.txt` | Public | SSR catalogue/data reads for some routes; IndexNow may call external service on its own route | Crawler/user traffic; routed through Worker; avoid assuming static-asset-free treatment |
| Stripe webhook and unknown `/api/*` | Webhook signature / unmatched | Stripe event writes / 404 | Inbound third-party webhook; request still goes through Pages Worker |

The route list above groups CRUD siblings and route families to keep the inventory readable; exact inline registrations are in `app.ts:938-6351`, with modular registrations cited in the table. The source contains no reliable per-feature request counts or browser polling intervals, so frequency labels are not traffic measurements.

### Auth/session and direct Supabase paths

- Browser Supabase client persists sessions and enables automatic token refresh (`src/lib/supabase.ts:31-37`). The client gets the current token and sends it as a Bearer token on every app API call (`src/lib/apiClient.ts:62-78`).
- Application data calls are server-mediated; code search found no browser-side direct `.from()` or `.rpc()` data access. Browser Supabase usage is Auth (and analytics is separate). Thus app CRUD calls incur a Workers invocation plus Supabase Data API/DB work.
- `requireAuth` verifies the token and checks consent (consent status has a brief cache) before protected routes (`server/auth/require-auth.ts:79-133`). Authenticated API responses are `no-store`, so repeated view loads are not served from HTTP cache.
- Server API and jobs Worker use one lazily created Supabase JS client configured with server-side credentials; calls are HTTP, so the published 60 direct Postgres connection count is not a direct per-Worker-connection cap. Supabase DB compute/query saturation still matters.

## Query, data, storage and AI findings

### Query patterns and probable hotspots

- The repo has many Supabase `.from()` calls. Across the audited `server/db` modules, the pattern scan found 221 uses of select/limit/range/order/single or `select('*')`; this is a scan count, not a request/query execution count. Some catalogue methods use explicit limits, but pagination is not consistently evident from the call-site scan.
- `loadState()` performs profile/preferences/skills and sequential experience/education reads; `saveState()` iterates skills with an individual skill lookup, possible insert, then user-skill upsert per skill (`server/db/state.ts:98-201,204-217`). This is an N+1-style pattern for large skill collections, and the endpoint may have multiple serial round trips.
- `roadmap` materialization loads roadmaps, phases, milestones and tasks through separate queries (`server/db/roadmap.ts:326-361`); creating/replacing a tree has a multi-write path. Audit query shapes and actual row counts on staging before deciding index/query changes.
- Admin audience/analytics calculations have loops and many table-level queries, including profiles and progress-related tables (`server/db/admin.ts:598-790`). These are plausible outliers; they are admin-only, not representative of a normal user request.
- Several data accessors use `select('*')` and some list APIs have fixed caps; fixed limit is safer than unbounded selection but still returns wide records. The app sends authenticated responses with `no-store`, meaning repeat page visits re-read data rather than benefit from browser caching.
- Production indexes/EXPLAIN plans were not inspected; this audit did not access the production database. No conclusion about a missing index or actual slow query is asserted.

### Storage and CV processing

- CV uploads max at 10 MiB and portfolio uploads use Supabase Storage. Signed downloads use a 5-minute URL. Storage usage has 1 GB included; the free allowance's 5 GB egress/cached egress can be exhausted by repeated CV downloads even when API request counts remain low.
- Uploads are buffered in memory; the body parser's 15 MiB limit is above CV's 10 MiB file cap. Concurrent uploads can cause a memory spike. Document extraction/analysis runs on API paths and may consume Worker CPU; measure CPU-time metrics separately from request duration and from upstream model wait.
- Full account deletion and file deletion are write/destructive operations; exclude them from load scenarios.

### AI and external services

- The unified provider abstraction chooses Gemini or OpenRouter, supports a single retry for retryable failures, controlled fallback if both providers are configured, and in-flight request deduplication (`server/ai/provider.ts:22-73,232-359`). Gemini and OpenRouter clients default to 45-second timeouts; OpenRouter request retries are bounded, exponential, and can be invoked by its wrapper (`server/ai/openrouterConfig.ts:117-145,234-254`). A fallback attempt means one user operation can issue requests to both providers; retry can add another call. Free OpenRouter model availability/rate limits are dynamic, not an application guarantee.
- AI routes may run synchronously or be queued. Background job workflow concurrency is configured at 3; user job starts have a process-local cap of 10/minute, which is not a globally shared limiter across isolates (`server/jobs/routes.ts:65-70,165-187`).
- JSearch, Stripe, GA4, and IndexNow have other usage and rate/cost characteristics. Actual keys, quotas, usage, provider account plan or exact monetary costs are intentionally not inspected.

### Background and scheduled tasks

- Separate queue consumer: max batch 5, max concurrency 3, 3 queue retries, 30-second retry delay, 15-minute visibility timeout; scheduled sweep every five minutes (`worker/jobs/wrangler.jsonc:41-69`). Queue handlers make multiple Supabase operations per job for kind lookup, claim, lease, progress, cancellation and completion/failure; AI tasks add provider calls. A job is not one DB operation.
- API announcement tick runs at most once per minute **per isolate**, only when traffic arrives, and calls `processDueAnnouncements()` asynchronously (`app.ts:627-648`). With multiple isolates, this is not a fleet-wide once-per-minute guarantee; duplicate work/race behavior and request-coupled DB load should be checked.
- The five-minute scheduled consumer writes a heartbeat and performs dispatch/recovery/stale-job/subscription sweeps (`worker/jobs/index.ts:235-290`). These are background Worker invocations and DB writes independent of browser API requests.

## Provider free-tier limits (checked against official pages 2026-11-16)

| Provider / resource | Current official Free allowance / limit | Relevance |
|---|---:|---|
| Cloudflare Workers + Pages Functions | 100,000 requests per day; 10 ms CPU per invocation; static asset requests are free/unlimited | API/SSR Worker calls share the important daily request pool; static assets are not the primary quota. Worker subrequests are not billed as inbound Worker requests. |
| Cloudflare Workers memory | 128 MB isolate memory | Concurrent in-memory file processing and large body transformations deserve measurement. |
| Supabase database size | 500 MB per project | Retained CV metadata, job/credit/activity rows, and all app data share the database-size ceiling. |
| Supabase Auth | 50,000 MAU | Not a request-throughput ceiling; monthly active users are distinct from concurrent sessions. |
| Supabase egress | 5 GB egress + 5 GB cached egress | API response volume and Storage downloads contribute; separate limits/categories apply as published. |
| Supabase Storage | 1 GB | CVs/portfolio files share storage according to bucket usage. |
| Supabase Edge Functions | 500,000 invocations included | No app Edge Function invocation path was identified; do not treat this as the app API request quota. |
| Supabase Nano (Free) DB | 500 MB RAM; 60 max database connections; pooler up to 200 clients, default pool size 15 | The app uses Supabase HTTP APIs, not a direct persistent Postgres pool; still relevant to shared DB resources, not a literal per-Worker connection limit. |
| Supabase Free project lifecycle | Project may pause after one week of inactivity; two active free projects | Can affect availability/testing; does not provide a staging project or guarantee active capacity. |

Official references: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated Nov 13, 2026); [Supabase pricing](https://supabase.com/pricing); [Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) (updated Nov 3, 2026). Provider limits can change; verify again immediately before a real test.

## Request budget and illustrative DAU model

For an API-heavy day, the theoretical Workers request ceiling is 100,000 counted requests/day. To leave 30% headroom for variation, bots, monitoring, route fan-out at the browser, and scheduled API work, this audit uses a **planning budget of 70,000 app Worker requests/day**. This is not an observed safe threshold and does not account for account-level shared usage by unrelated Workers. Static asset requests are excluded per Cloudflare's pricing description; server-rendered public pages and `/api/*` go through the Worker.

Formula: `DAU ≈ 70,000 / (counted app Worker requests per active user per day)`.

| Usage scenario | Assumed Worker-routed requests per active user/day | Planning DAU at 70k/day | Quota-only absolute DAU at 100k/day |
|---|---:|---:|---:|
| Light (occasional profile/dashboard/API use) | 20 | 3,500 | 5,000 |
| Normal (several app views, searches and saves) | 60 | 1,167 | 1,667 |
| Heavy (many repeated views, frequent reads/writes) | 150 | 467 | 667 |

These are arithmetic illustrations, **not evidence CareerDev4AI can serve those users**. They omit non-app Worker traffic, runtime failures, CPU overruns, Supabase database CPU/RAM/query time, data egress/storage, crawler mix, queue throughput, provider rate limits, and burst concentration. Daily quotas do not imply peak RPS/concurrency. Under those same assumptions, the entire 100k daily allowance averages only 1.16 requests/second over 24 hours (70k reserve budget averages 0.81 rps), but an uneven workload can hit its daily quota much earlier. The app's request/user/day must be measured with actual usage analytics before this estimate is useful.

## Supabase capacity analysis

- **MAU is not the likely first bottleneck:** the 50k MAU figure is a billing entitlement, not a concurrency or query-rate promise.
- **Database size/compute/egress are more immediate risks:** 500 MB DB, shared Nano 500 MB RAM, 5 GB egress plus 5 GB cached egress and 1 GB file storage. Actual utilization was not inspected. In a user-generated-data product, CV/profile/history and background job/credit records accumulate; retention and per-user row/file sizes must be measured.
- **Connections:** 60 direct database connections is a limit on PostgreSQL connections for Nano. Audited server code uses Supabase JS over HTTP, so each Worker request does not directly hold one Postgres socket from the app. PostgREST/API concurrency can still stress the database and its pool.
- **Supabase's 500,000 Edge Function invocations are not the same as app API request allowance.** No Supabase Edge Function route/deployment was identified in the source inventory. App API calls run on Cloudflare Pages Functions, then call Supabase HTTP APIs.
- **Potential fan-out:** request authentication/consent plus handler database queries add work before business logic. Multi-table user views and job polling can increase query/egress per browser view. Need Supabase observability/slow query data and plan usage to identify actual ceiling.

## Capacity conclusions and evidence classes

- **Measured:** None. No load test or production/staging performance data was collected.
- **Provider limits:** Official values above; not a service-level throughput guarantee.
- **Engineering estimate:** DAU table uses explicitly assumed request counts and a 70% quota budget only.
- **Untested assumptions:** deployed bindings and plan, current resource utilization, row/object sizes, route mix/poll intervals, index coverage, actual queue workload, provider plan/costs and the effect of API isolate count.
- **Concurrent-user capacity:** **unknown / not measured**. Do not turn the daily request model into a concurrent-user claim.

## Safe staging and test readiness

No dedicated Supabase staging project, staging Pages/Worker deployment binding, synthetic test-account fixture, or AI mock/capped-provider configuration was established from the repository's non-secret configuration. Existing references to disposable PGlite staging in subscription release tests are not a full isolated application staging environment. Consequently **no load test was run**.

The added `tests/load/capacity.k6.js` is a guarded, read-only k6 starter for static/API browsing and authenticated dashboard/jobs/roadmap/learning reads. It refuses production hostnames and requires an explicit expected staging host plus `ALLOW_STAGING_LOAD_TEST=YES`. It does not perform login, writes, uploads, AI calls, payment/account/admin mutations, or provider calls. These need separately provisioned synthetic fixtures and an isolated AI mock/capped provider before being added. This intentionally avoids creating live records, costs, or data loss in an unverified environment.

Suggested next staging setup (not performed): separate Supabase project; separate Pages preview/Worker with staging-only secrets; staging-only queue and isolated buckets; synthetic users/data with explicit cleanup; AI mock endpoint or provider test key with hard spend/usage cap; dedicated admin account only if admin tests are later approved. Verify environment/project identifiers before testing, record the provider dashboard baseline, then run stages sequentially and stop on any threshold breach.

## Prepared k6 stages and metrics

Stages available in the script: 10 VUs/5 min, 25 VUs/5 min, 50 VUs/10 min, 100 VUs/10 min, 150 VUs/5 min, and 50 VUs/30 min soak. Run individually, not all at once, and advance only if earlier stages pass. Use realistic 2–5 second think time. The k6 script reports request count/rate, latency percentiles, HTTP errors and 429s; it cannot report Cloudflare CPU, Supabase DB CPU/memory/connections/slow queries, Supabase Storage egress, or AI provider latency/cost without side-channel provider telemetry. Collect provider metrics separately and split AI duration from internal request duration.

Example command (only after staging is configured, k6 installed, and the required gates/fixtures are ready):

```powershell
$env:ALLOW_STAGING_LOAD_TEST = 'YES'
$env:STAGING_HOST = 'your-staging-host.example'
$env:STAGING_BASE_URL = 'https://your-staging-host.example'
$env:TEST_BEARER_TOKEN = '<short-lived synthetic-user token>'
k6 run --vus 10 --duration 5m -e ALLOW_STAGING_LOAD_TEST=YES -e STAGING_HOST=$env:STAGING_HOST -e STAGING_BASE_URL=$env:STAGING_BASE_URL -e TEST_BEARER_TOKEN=$env:TEST_BEARER_TOKEN tests/load/capacity.k6.js
```

Run each later VU/duration pair by changing `--vus` and `--duration`; do not proceed to 150 VUs or soak unless the prior stage met all gates and provider/DB dashboards are healthy. Do not place bearer tokens in shell history or report output; use a local protected environment mechanism. The sample command is not executed by this audit.

Initial acceptance gates are the supplied thresholds: normal API p95 <1s; write p95 <1.5s (not covered by current read-only suite); HTTP errors <1%; 429s understood and within expected policy; DB connections below 70% configured maximum; no sustained CPU/memory/egress/provider saturation or unexpected data/cost changes. Distinguish upstream AI latency from internal API latency.

## Prioritized recommendations (not implemented)

1. **Before any capacity claim:** establish isolated staging; collect Cloudflare Worker requests/day and CPU-time distribution, per-route RPS/p95/error/429, queue depth/job duration/retries; Supabase disk/DB/egress/storage and query-performance data; provider rate/cost/latency. Use test-only synthetic users.
2. **Measure high fan-out endpoints:** `/api/state`, roadmap reads, learning catalog/recommendation, public profile, admin analytics, background-job status/availability. Measure SQL/API query count and response bytes per UI page.
3. **Investigate repeated query patterns:** batch skill lookups/upserts in `saveState`; validate whether roadmap reads can use fewer round trips; ensure all large collections have explicit pagination/caps and indexes aligned with actual filter/order patterns. Confirm using staging `EXPLAIN (ANALYZE, BUFFERS)` / Supabase observability, not assumptions.
4. **Measure CPU/memory for document flows:** profile PDF/DOCX extraction, parsing and CV analysis under controlled file sizes; consider streaming/object-based processing if memory spikes or CPU exceeds the Free per-invocation limit.
5. **Check write/idempotency pressure:** worker job transitions use RPCs, per-job stage/cancel/lease calls and maintenance scans; observe DB operations per completed/retried job and queue age at concurrency 3. Check the isolate-local announcement scheduler's scale-out behavior.
6. **Prevent test costs and data pollution:** use AI mocks first; if provider test credentials are necessary, hard-cap them and run a tiny smoke test before ramping. Keep writes in a dedicated synthetic tenant and define cleanup before testing.
7. **Upgrade only based on observed bottleneck:** Cloudflare Workers Paid starts at $5/month and includes 10M requests/month plus included CPU allowance, with usage-based charges beyond included usage; Supabase Pro starts at $25/month and includes a larger database disk, 250 GB egress, 100 GB storage and 2M Edge Function invocations (additional usage billed per current pricing). Price and limits vary and must be checked at purchase time. Upgrade does not fix inefficient query patterns or provider limits.

## Source map for reviewers

- Worker routing: `worker/index.ts:128-189`; config/queue: `wrangler.jsonc:33-49`.
- Jobs Worker config and cron: `worker/jobs/wrangler.jsonc:33-69`; handlers: `worker/jobs/index.ts:179-290`.
- Auth/session: `src/lib/supabase.ts:26-47`, `src/lib/apiClient.ts:62-78`, `server/auth/require-auth.ts:79-133`.
- Server Supabase client: `server/db/supabase.ts:10-20`.
- API route registrations: `app.ts:938-6351`, plus route modules imported at `app.ts:55-61`.
- Body limits/CPU-memory exposure: `app.ts:504-535,650-659`.
- State query loops: `server/db/state.ts:98-201,204-217`.
- AI retry/fallback: `server/ai/provider.ts:232-359`, `server/ai/openrouterConfig.ts:117-145,234-254`.
- Storage: `server/db/cvStorage.ts:13-14,39-85`.
