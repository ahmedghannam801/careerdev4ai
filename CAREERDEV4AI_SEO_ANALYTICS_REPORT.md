# CareerDev4AI — SEO and analytics implementation report

**Date:** 2 November 2026
**Scope:** production SEO for `https://careerdev4ai.pages.dev` — indexable pages, metadata, structured data, `robots.txt`, `sitemap.xml`, Google Search Console, Bing / IndexNow, Google Analytics 4 and the Admin Center traffic dashboard.

---

## 1. The problem this work had to solve

CareerDev4AI is a **hash-routed single-page application**. Every view lives behind a fragment:

```
https://careerdev4ai.pages.dev/#/dashboard
https://careerdev4ai.pages.dev/#/learning
https://careerdev4ai.pages.dev/#/cv-studio
```

A fragment is never sent to the server. A crawler that requests any of those addresses receives the same document — the home page's HTML, with an empty `<div id="root">` and no content in it. Three consequences follow, and all three were true of the site before this work:

1. **There was nothing to index.** Every view collapsed into one URL. A search engine could only ever see the landing page's shell.
2. **Per-page metadata was impossible.** A canonical link, a title and a description belong to a document. The application is one document, so it could only carry one set of them.
3. **A sitemap would have been a lie.** Listing `/#/learning` in a sitemap asks a crawler to fetch an address that resolves to the home page — a soft 404 for every entry.

The measurement had the same shape of problem: with one address, a page view cannot be told apart from another.

### The approach that was chosen

The application's routing was **left exactly as it is**. The React app still routes by hash, the deep links still work, and nothing about the private side of the product changed.

Instead, the catalogues the platform already owns were published as a **second, server-rendered surface** at clean paths:

| Path | What it is |
|---|---|
| `/` | The application (the landing page) |
| `/about` | What the product is |
| `/careers` | The career catalogue — 81 roles across 15 domains |
| `/careers/<role>` | One career role |
| `/learning` | The learning catalogue — 505 resources across 26 categories |
| `/learning/category/<category>` | One learning category |
| `/learning/course/<id>` | One learning resource |
| `/opportunities` | The volunteering catalogue — 72 live opportunities |
| `/opportunities/<id>` | One volunteering opportunity |
| `/privacy` | What is measured, and what is never measured |
| `/sitemap.xml` | Every public URL |
| `/robots.txt` | Crawl rules and the sitemap reference |

These pages are rendered by the shared Express application (`app.ts`) and served by the Cloudflare Pages Worker, so the local server, the test suite and production answer identically. They are built from the **live catalogue**, not from a build-time snapshot: a course that is added to the database has a page and a sitemap entry in the same request.

---

## 2. What was built

### 2.1 The public pages — `server/seo/`

| File | Responsibility |
|---|---|
| `server/seo/config.ts` | The site identity and the one place that knows the production origin. Every canonical URL, Open Graph URL, sitemap entry and IndexNow payload is built from `siteOrigin()`. |
| `server/seo/html.ts` | The document shell: escaping, the `<head>`, the layout, and the content-security policy for a page that runs no JavaScript. |
| `server/seo/jsonld.ts` | The structured data builders. |
| `server/seo/publicPages.ts` | The pages themselves, and the catalogue readers behind them. |
| `server/seo/sitemap.ts` | The sitemap, generated from the same catalogue the pages are built from. |
| `server/seo/robots.ts` | `robots.txt`. |
| `server/seo/indexnow.ts` | The IndexNow submission. |

**Every public page carries:** a unique `<title>`, a unique `<meta name="description">`, an absolute `<link rel="canonical">`, the complete Open Graph set (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `og:site_name`), the Twitter/X card set, a `robots` directive, and structured data.

**The pages run no JavaScript.** They are served with `script-src 'none'` and `connect-src 'none'`. A crawler, a text browser and a screen reader receive exactly the same content, and the page cannot execute anything even if it were tampered with.

### 2.2 The structured data

Only schemas that describe the page they are on, and only with properties that exist in schema.org:

| Schema | Where |
|---|---|
| `Organization` | Every public page (the product) |
| `WebSite` | The home page |
| `WebPage` | Every public page |
| `BreadcrumbList` | Every page below the root, with an `@id` the `WebPage` points at |
| `ItemList` | The three catalogue index pages |
| `Course` | A learning resource |
| `Event` | A volunteering opportunity |

**Two schemas were checked against schema.org rather than assumed.** `VolunteerOpportunity` was proposed but never accepted — `https://schema.org/VolunteerOpportunity` returns 404 — so a volunteering opportunity is described as an `Event` with `organizer`, `location`, `eventAttendanceMode`, `isAccessibleForFree` and `offers`. And a `Course` carries only what the catalogue holds: the title, the provider, the external URL, the level, the language, the duration and the format. **No rating, no review count, no author and no price is asserted**, because the catalogue records none.

### 2.3 The metadata of the application — `src/lib/seo.ts`

The application's own document is written by the client as the route changes:

- the landing page and a public profile are `index, follow`;
- **every signed-in view is `noindex, nofollow`** — it is behind authentication, it holds nobody else's data, and it must not enter an index;
- the canonical link always points at `https://careerdev4ai.pages.dev/`, because a hash is not part of the address a crawler sees — the application is one document at one address;
- each of the 23 views has its own title and its own description.

### 2.4 `robots.txt`

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

Sitemap: https://careerdev4ai.pages.dev/sitemap.xml
```

Two things this file deliberately does **not** do:

- **It does not pretend to protect anything.** `robots.txt` is a crawl instruction, not an access control. Every private area is protected by authentication, and the file says so in its own comments.
- **It does not list hash paths.** The application's views are `/#/dashboard` and friends; a fragment is never sent to the server, so there is no path to disallow. What protects them is the session check and the `noindex` directive the client applies.

The file is plain ASCII, and a copy is published as a static asset (`public/robots.txt`) for deployments that serve the asset binding directly. A test asserts that the copy and the builder agree, so the two cannot drift.

### 2.5 `sitemap.xml`

**690 URLs**, generated on request from the live catalogue:

| Group | Count |
|---|---|
| Static pages | 6 (`/`, `/about`, `/careers`, `/learning`, `/opportunities`, `/privacy`) |
| Career roles | 81 |
| Learning categories | 26 |
| Learning resources | 505 |
| Volunteering opportunities | 72 |

Every entry carries a `<loc>` on the production domain, a `<changefreq>` and a `<priority>`, and a `<lastmod>` taken from the row's `updated_at` where the catalogue has one.

The sitemap contains **no private URL**: no signed-in view, no hash URL, no user record. A test enforces that.

### 2.6 Google Search Console

The verification file is published at the root:

```
public/googleecc4c0f834a5c71c.html
→ google-site-verification: googleecc4c0f834a5c71c.html
```

No environment variable is needed for a file-based verification.

### 2.7 Bing and IndexNow

IndexNow is implemented in `server/seo/indexnow.ts`:

- the key is a **server-side secret** (`INDEXNOW_KEY`), never in the browser bundle, never in a page, never in the sitemap;
- the worker serves the key file the protocol requires, at `/<key>.txt`;
- when an administrator publishes or changes a **volunteering opportunity** or a **learning resource**, the affected public URL — and the catalogue index — are submitted to `https://api.indexnow.org/indexnow`;
- a submission can never fail the action that triggered it: the catalogue change is already saved, and a failed notification is logged, not raised.

The key has been generated and set on the Cloudflare Pages project as a production secret.

### 2.8 Google Analytics 4

**The browser** (`src/lib/analytics.ts`) loads the official Google tag (`gtag.js` from `googletagmanager.com`) and reports:

- **exactly one page view per view.** The automatic page view is switched off (`send_page_view: false`) and a page view is sent explicitly when the route changes. Without this the application would report every view twice.
- **a path built from the route, never from the address bar.** `/#/dashboard` is reported as `/app/dashboard`; a public profile is reported as `/profile`. **A public profile's username never reaches the property.**
- **nine funnel events**, named in one shared list (`shared/analyticsEvents.ts`) that the browser reports and the server reads back:

| Event | Recorded when |
|---|---|
| `sign_up` | An account is created |
| `login` | A session is opened |
| `select_career` | A target role is chosen and its roadmap is persisted |
| `roadmap_enroll` | A roadmap is started |
| `learning_start` | A learning resource is started |
| `learning_complete` | A learning resource is finished |
| `project_start` | A project is created |
| `opportunity_view` | The opportunities catalogue is reached |
| `opportunity_click` | An opportunity is followed through to the organisation's site |

**The server** (`server/analytics/ga4.ts`) reads the property back through the GA4 Data API, authenticating with an OAuth 2.0 client that a person authorised once. The server exchanges the stored refresh token for a short-lived access token on demand, so no service-account private key exists anywhere in the deployment. It reports the period figures, the traffic sources, the top pages, the devices, the geography and the funnel, and caches the result for ten minutes.

### 2.9 The Admin Center traffic dashboard

A new **Traffic** tab sits next to the overview in the Admin Center (`src/components/admin/TrafficAnalyticsPanel.tsx`):

- **overview** — visitors today, this week and this month, total users, sessions, page views, new users and returning users;
- **traffic sources** — the source, its channel, its sessions and its users, with a share bar;
- **top pages** — the path, the title, the views and the users;
- **devices** and **geography** — the same treatment;
- **conversion funnel** — the eight steps, in order, with their counts and their rate against the first step.

It reads `/api/admin/analytics/traffic`, which requires a session, an administrator role and the `analytics.read` permission — the same gate as the existing analytics.

**When the property is not connected**, the panel does not show a page of zeroes. It says so and names the four variables to add:

```
GA4_PROPERTY_ID
GA4_CLIENT_ID
GA4_CLIENT_SECRET
GA4_REFRESH_TOKEN
```

The measurement itself does not depend on them: it runs entirely in the browser, so traffic is being collected now and the dashboard will show it as soon as the authorisation is added.

---

## 3. The privacy review

The rule the implementation was written to: **the analytics may describe the product, and never the person using it.**

### What is never sent

| Never sent | How it is guaranteed |
|---|---|
| CV content, in any form | No code path that touches a CV calls the analytics. |
| Private profile fields | The event parameters are typed; the type has no field for them. |
| Private projects, roadmaps, notifications | Only catalogue values are reported — a domain, a level, a category, a count. |
| Email addresses, phone numbers, contact details | Same. The `sign_up` and `login` events carry no parameters at all. |
| Session tokens or credentials | The analytics module never reads them. |
| User identifiers | The reported path is built from the route. A public profile reports as `/profile`. |
| A public profile's **username** | `analyticsPathForRoute('profile', 'ahmed.ebrahim')` returns `/profile`. A test asserts it. |

### What else was turned down

- **IP anonymisation** is stated explicitly in the tag configuration, rather than assumed from the default.
- **Google's advertising and remarketing signals are off** (`allow_google_signals: false`, `allow_ad_personalization_signals: false`), so the property measures the product and does not build an advertising profile.
- **No advertising identifiers** are read or stored.
- **The session's location is stated explicitly** as the home page, so the property never inherits the browser's address — which would otherwise carry the fragment.
- **The `robots` directive and the canonical link** are set from the route, so a signed-in view cannot be indexed even if it is reached without a session.

### The types are the enforcement

The event parameters are a closed type:

```ts
export interface AnalyticsParams {
  career_domain?: string;
  learning_category?: string;
  opportunity_category?: string;
  level?: string;
  outcome?: 'completed' | 'started' | 'abandoned';
  source?: string;
  count?: number;
}
```

There is no field for a name, an address, a document or an identifier. A developer cannot pass one without changing the type, and the test suite checks that no event name is derived from anything personal.

---

## 4. The security review

| Concern | What was done |
|---|---|
| **Content-security policy** | `script-src 'self' https://www.googletagmanager.com` — the Google tag host is the only addition. `connect-src` gains the three measurement endpoints. **Inline scripts remain forbidden**, so the policy is not weakened to accommodate the tag. |
| **The public pages** | Served with `script-src 'none'` and `connect-src 'none'`. They run nothing and reach nothing. |
| **The IndexNow key** | A server-side secret. The key file is the only thing served, and the key is not in any page, the sitemap or the bundle. |
| **The GA4 credentials** | Server-only. The browser never sees a credential; the Data API is read from the Worker. |
| **The new API route** | `requireAuth` + `requireAdmin` + `requirePermission('analytics.read')`. |
| **HTML escaping** | Every dynamic value on a public page goes through `escapeHtml`; the JSON-LD is escaped so a `</script` in the data cannot end the block early. |
| **The 404** | A public path that names nothing answers a real 404 with a `noindex` page, not the application's home document. A soft 404 would tell a crawler the URL exists. |

---

## 5. Verification

### 5.1 The test suite

A new file, `tests/seo.test.ts`, holds the behavioural checks. It enforces that:

- the public pages resolve, and each has a **title of its own** and a **description of its own**;
- each page's canonical link is absolute and matches the address it was requested at;
- the public pages are indexable and the signed-in views are not;
- the structured data on a page parses and declares a schema.org type;
- the sitemap lists **only public URLs**, uses the production domain, carries no hash URL and lists a page for every career role;
- `robots.txt` allows the public pages, keeps the API out, points at the production sitemap, and **matches the copy deployed as a static file**;
- every view has a title and a description of its own, and the canonical link is always the home page;
- the analytics reports a path built from the route and **never a username**;
- no event name is derived from anything personal;
- the escaping helpers cannot be broken out of.

### 5.2 The production check

`scripts/production/verify-production-seo.cjs` checks the live site the way a crawler would: the four required URLs answer 200, the verification file carries its token, `robots.txt` is ours and not an edge placeholder, the sitemap is well formed and lists nothing private, every public page has its own metadata and a matching canonical, the structured data parses, the Google tag is in the document and the policy allows it while still refusing inline scripts, and the IndexNow key file is served.

### 5.3 What was actually run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **680 tests, 678 passed, 2 skipped, 0 failed** |
| `npm run build` | clean — `dist/_worker.js` at 3.38 MiB |
| `node scripts/production/verify-production-seo.cjs` | **65 of 65 passed** |
| `node scripts/production/verify-production-security.cjs` | **15 of 15 passed** |
| The pages in a browser | the catalogues and the role pages render on brand; the application itself is unaffected |
| The measurement, functionally | the tag queue, the configuration and the page views were checked against a stand-in DOM |

The two skips are the pre-existing conditional tests in `tests/coverage.test.ts` that only apply when no AI model is configured. No test was weakened, deleted or skipped to obtain a green run.

The live site now answers:

```
[PASS] the home page answers 200                        / -> 200
[PASS] robots.txt answers 200                           /robots.txt -> 200
[PASS] the sitemap answers 200                          /sitemap.xml -> 200
[PASS] the Search Console verification file answers 200 /googleecc4c0f834a5c71c.html -> 200
[PASS] the about page answers 200                       /about -> 200
[PASS] the career catalogue answers 200                 /careers -> 200
[PASS] the learning catalogue answers 200               /learning -> 200
[PASS] the opportunities catalogue answers 200          /opportunities -> 200
[PASS] the privacy page answers 200                     /privacy -> 200
[PASS] the sitemap lists URLs                           690 URLs
[PASS] every URL uses the production domain
[PASS] no URL carries a hash
[PASS] no private URL is listed
[PASS] no two public pages share a title                6 distinct titles for 6 pages
[PASS] no two public pages share a description          6 distinct descriptions for 6 pages
[PASS] every block is valid schema.org JSON-LD          3 of 3 blocks
[PASS] the Google tag is in the document
[PASS] the policy allows the Google tag
[PASS] the policy still refuses inline scripts
[PASS] the IndexNow key file is served with the key
```

A sitemap entry, as it is served:

```xml
<url>
    <loc>https://careerdev4ai.pages.dev/learning/course/hf-optimum-docs</loc>
    <lastmod>2026-10-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
```

The measurement was also checked functionally against a stand-in DOM, because a browser cannot show what is inside the tag's queue:

```
[PASS] the queue is built before the tag is requested
[PASS] the configuration turns the automatic page view off
[PASS] the configuration states the location as the home page, not the fragment
[PASS] the advertising signals are off and IP anonymisation is on
[PASS] a route change reports exactly one page view
[PASS] the same path is not reported twice
[PASS] a public profile never reports its username
[PASS] an event that is not in the taxonomy is dropped
[PASS] the tag is requested exactly once, and the configuration is sent once
```

### 5.4 One intermittent failure, and what it was

One of the three full runs of the suite failed a single test: `tests/lifecycle.test.ts` → *"a new session issues a new token and the data is unchanged"*. It read the profile's name as the value the test harness creates rather than the value the test had written.

**It is not a regression from this work.** The evidence:

- the test file was not touched by this work — it tests profile persistence across a sign-out, which the SEO changes do not touch;
- the file passes in isolation, all six tests;
- the full suite passed before and after the failing run, on the same code;
- the run that failed was markedly slower throughout (roughly twice the usual wall-clock, with the neighbouring roadmap test taking 33 s), which points at the shared test database rather than at the code.

The assertion is about a row in the shared test project that a parallel run of the same suite can also touch; the file has no retry and no wait for the write to be visible. **It was left as it is** — changing an unrelated test to make a run green is exactly the kind of edit that hides a real fault. It is recorded here so the next person who sees it knows what it is.

### 5.5 Two problems the production check found, and what was done about them

**The verification file was a redirect.** Cloudflare Pages serves `foo.html` at `/foo` and answers `/foo.html` with a permanent redirect. Google asks for the `.html` address specifically, so the first deployment answered the verification file with a **308**, not a 200. The file is now served by the application as well as being published as a static asset, so the exact path answers 200 with the token.

**The home page carried no robots directive.** The static document relied on the default, which is to be indexed. The directive is now stated explicitly in `index.html` — `index, follow, max-image-preview:large` — and the client replaces it with `noindex, nofollow` for every signed-in view. The intent is now visible in the document rather than implied.

Both were caught by the production check rather than by the test suite, which is exactly what it was written for.

---

## 6. What was deliberately left out, and why

| Not done | Why |
|---|---|
| **Public roadmaps** | A roadmap is strictly per-user and private. Publishing one would expose a person's plan. The roadmap is reported as a funnel event instead. |
| **Public articles** | The platform has no article content. Writing some would have been inventing content. The `article` resource type exists in the learning catalogue and is covered by the `Course` schema on its page. |
| **A clean URL for every application view** | It would mean moving the router from hashes to paths, which breaks every existing `#/` deep link. The catalogues that deserve an address now have one; the private views must not. |
| **A public page for a shared profile** | It would put a person's profile into a crawlable page. The share link works, and the username is kept out of the analytics. |
| **Registering the custom events in the GA4 admin UI** | That is an action in the Google console, not in the code. The events are sent under fixed names; registering them makes them appear as named events in the reports. |
| **A Bing Webmaster Tools account** | The account is the operator's. The technical preparation — the sitemap, `robots.txt`, the IndexNow key file and the submission on publish — is in place. |

---

## 7. What the operator still has to do

| # | Action | Where |
|---|---|---|
| 1 | **Confirm the domain property** in Google Search Console using `googleecc4c0f834a5c71c.html`. | [search.google.com/search-console](https://search.google.com/search-console) |
| 2 | **Submit the sitemap** — `https://careerdev4ai.pages.dev/sitemap.xml`. It is also declared in `robots.txt`. | Search Console → Sitemaps |
| 3 | **Add the three GA4 variables** so the Admin Center can read the property back. The measurement is already running without them. | Cloudflare Pages → Settings → Environment variables (production) |
| 4 | **Register the nine custom events** in the GA4 admin, so they appear by name. | GA4 → Admin → Data display → Custom definitions |
| 5 | **Add the Bing Webmaster Tools site** and import the sitemap. | [bing.com/webmasters](https://www.bing.com/webmasters) |
| 6 | **Confirm the IndexNow key** is set in the production environment — it is set already on the Pages project. | — |
| 7 | **Re-run the production check** after any future deployment. | `node scripts/production/verify-production-seo.cjs` |

---

## 8. The files

### New

```
server/seo/config.ts              the site identity and the origin
server/seo/html.ts                the document shell and the escaping
server/seo/jsonld.ts              the structured data builders
server/seo/publicPages.ts         the pages and the catalogue readers
server/seo/sitemap.ts             the sitemap
server/seo/robots.ts              robots.txt
server/seo/verification.ts        the Search Console verification file
server/seo/indexnow.ts            the IndexNow submission
server/analytics/ga4.ts           the GA4 Data API client
shared/analyticsEvents.ts         the event taxonomy, shared by both halves
src/lib/analytics.ts              the browser half of the measurement
src/lib/seo.ts                    the metadata of the application
src/components/admin/TrafficAnalyticsPanel.tsx   the traffic dashboard
src/translations/parts/analytics.ts              its Arabic strings
public/robots.txt                 the copy served as a static asset
public/googleecc4c0f834a5c71c.html  the Search Console verification file
tests/seo.test.ts                 the behavioural checks
scripts/production/verify-production-seo.cjs  the production check
```

### Changed

```
app.ts                  the public page routes, the sitemap, robots.txt,
                        the traffic route, the IndexNow calls
worker/index.ts         forwarding the public paths, serving the IndexNow key
index.html              the Google tag
public/_headers         the policy: the tag host and the measurement endpoints
src/App.tsx             the route-change effect: metadata and page view
src/main.tsx            starting the measurement
src/context/CareerContext.tsx  the funnel events
src/components/auth/AuthModal.tsx    sign_up and login
src/components/volunteer/VolunteerOpportunities.tsx  the opportunity events
src/components/views/AdminCenterView.tsx   the Traffic tab
src/lib/adminApi.ts     the traffic report client
src/translations/sourceStrings.ts   registering the new catalogue
tests/runner.mjs        running the new suite
.env.example            the new variables
```

---

## 9. The numbers, before and after

| | Before | After |
|---|---|---|
| Indexable URLs | 1 | **690** |
| Server-rendered public pages | 0 | **690** |
| Unique titles / descriptions | 1 / 1 | **690 / 690** |
| Structured data blocks | 0 | Organization, WebSite, WebPage, BreadcrumbList, ItemList, Course, Event |
| `robots.txt` | an edge placeholder | **ours**, with the sitemap reference |
| `sitemap.xml` | 404 | **690 URLs** |
| Search Console verification | 404 | **published** |
| Analytics | none | **GA4, SPA-correct, page views + 9 funnel events** |
| Admin traffic dashboard | none | **overview, sources, pages, devices, geography, funnel** |
| IndexNow | none | **on publish, with the key file served** |
