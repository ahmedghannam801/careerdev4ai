# Live Jobs — the JSearch provider credential

The **Live Jobs** view shows real vacancies. They come from **JSearch**, an
aggregate over public job boards, reached from the server only.

This file is the owner's side of that integration: where the credential comes
from, how to inject it, and how to confirm the feed is live. Everything else
about the integration is already built and committed.

---

## 1. What is already in place

| Piece | Where | State |
|---|---|---|
| The shared contract and the pure logic | `shared/jobs.ts` | done |
| The provider client (fetch, cache, quota, errors) | `server/jsearch/client.ts` | done |
| The routes | `GET /api/jobs/search`, `GET /api/jobs/:jobId` in `app.ts` | done |
| The screen | `src/components/views/JobsView.tsx`, `src/components/jobs/LiveJobCard.tsx` | done |
| The browser client | `src/lib/jobsApi.ts` | done |
| The tests | `tests/jobs.test.ts` (31 assertions) | done |

The credential is **the only missing piece**. Until it is injected, the screen
says so plainly and shows no invented vacancies.

---

## 2. The two variable names are one credential

The platform's provider account was supplied under two names. They are **the
same RapidAPI subscription** — one key serves every endpoint of that account —
so there is no need for two secrets.

`server/jsearch/client.ts` reads them in this order:

1. `JSEARCH_RAPIDAPI_KEY` — the service-specific name, used when present.
2. `RAPIDAPI_KEY` — the generic name, used as the fallback.

Either one is enough. `JSEARCH_RAPIDAPI_KEY` is preferred because it names the
service that consumes it.

---

## 3. Getting the key

1. Sign in to <https://rapidapi.com> with the account that owns the provider
   subscription.
2. Open the **JSearch** API (`letscrape-6bRBa3QguO5/api/jsearch`).
3. Open the **Pricing / Subscribe** tab and confirm the plan is active. A
   free plan is enough to prove the integration; a paid plan raises the
   request quota.
4. Open the **API Keys** tab and copy the **X-RapidAPI-Key** value.

The value is a single long string. It is never written in this repository, never
sent to the browser, and never included in a log line.

---

## 4. Injecting it into the deployment

The production deployment is the Cloudflare Pages project `careerdev4ai`.

```bash
# from the repository root
npx wrangler pages secret put JSEARCH_RAPIDAPI_KEY --project-name careerdev4ai
```

Wrangler prompts for the value and encrypts it. Paste the key at the prompt —
**not** into a chat, a commit, or a file in the repository.

The secret is available to the production environment only. To give the preview
builds the same key, run the same command with `--env preview` (preview
secrets are managed separately by Cloudflare).

### Confirming it landed

```bash
npx wrangler pages secret list --project-name careerdev4ai
```

Only the names are ever printed. The list must contain `JSEARCH_RAPIDAPI_KEY`.

### For a local development server

Add it to `.env` (gitignored) alongside the other keys:

```bash
JSEARCH_RAPIDAPI_KEY=your-key-here
```

`.env.example` already documents the variable.

---

## 5. Confirming the feed is live

### The server answers

```bash
curl -s https://careerdev4ai.pages.dev/api/health
```

`modelConfigured` concerns the AI provider. The job feed has its own answer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://careerdev4ai.pages.dev/api/jobs/search
```

* **401** — the route is private, which is correct. Sign in and try again.
* **503** with `"code":"not_configured"` — the credential is not injected yet.
* **429** — the provider is rate limiting this server. Wait for the window.
* **502** with `"code":"invalid_credential"` — the provider rejected the key.

### The screen

Sign in, open **Career Tools → Live Jobs**, and the vacancies appear with the
match against your own profile. The source line under the results always
names the provider, because the postings are not the platform's own.

---

## 6. What the integration guarantees

**Nothing is invented.** Every field on a card is something the provider
stated. A posting that gives no salary shows no salary; a posting that lists
no skills produces **no match score at all** rather than a flattering default.

**The three categories stay apart.** Live vacancies (this provider), the
platform's curated opportunities and the learning resources are separate
screens, and a vacancy is never presented as a course.

**Expired postings are labelled.** When the provider states an expiry that has
passed, the card says the posting has expired. It is never presented as a
current opening.

**The fit is explained, not asserted.** The score compares the posting's
skills with the signed-in user's own verified skills. The matched skills and
the skills to build are both listed.

**Applications happen on the employer's page.** The card links to the
employer's own posting or application link. The platform is not a party to any
application.

**Quota is protected.** A repeated identical search is answered from a
five-minute server cache, and the remaining provider quota is shown on screen.

---

## 7. The provider's own limits

| Behaviour | Limit |
|---|---|
| Pages per request | 1–20 (`numPages`, capped at 2 in this integration) |
| Page number | 1–20 |
| Country | `country` is a two-letter code; the product opens on `eg` (Egypt) |
| Date posted | `all`, `today`, `3days`, `week`, `month` |
| Employment types | `FULLTIME`, `CONTRACTOR`, `PARTTIME`, `INTERN` |
| Experience | `under_3_years_experience`, `more_than_3_years_experience`, `no_experience`, `no_degree` |
| Rate-limit headers | `x-ratelimit-requests-limit`, `x-ratelimit-requests-remaining` |

The integration only ever sends values from that vocabulary. A value outside it
falls back to the default rather than reaching the provider in a shape it does
not accept.

---

## 8. When the feed stops working

| The screen says | What happened | What to do |
|---|---|---|
| "Live job search is not configured on this server." | the secret is missing from the environment | §4, then redeploy |
| "The job provider rejected this server credential." | the key was rotated, the plan lapsed, or the account changed | §3, §4 |
| "The job provider is rate limiting this server." | the quota window is spent | wait for the window; the cache absorbs a repeat |
| "The job provider is temporarily unavailable." | the provider is down | wait; nothing on this side is broken |
| "The job provider did not answer in time." | the upstream call exceeded twelve seconds | retry |

---

## 9. Attribution

The provider aggregates postings published by third-party boards. The screen
always names the provider and always links to the original posting, and the
published Terms (section 8, *Third-Party Services*) already cover this
arrangement.
