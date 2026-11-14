# CareerDev4AI

CareerDev4AI is a personal career operating system: goals, skills, roadmap,
learning, projects, evidence, CVs, job applications, and interview practice in
one workspace. State is stored in PostgreSQL (Supabase) and scoped to the
signed-in Supabase Auth user.

The Live Jobs view shows real vacancies returned by the job provider (JSearch),
matched against the skills in the signed-in user's own profile, and keeps the
roles you choose to pursue in the persisted Applications pipeline.

## Stack

- React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- Express 4, executed with `tsx` for Node (`server.ts`) and bundled into a
  Cloudflare Pages advanced-mode Worker (`dist/_worker.js`) for production
- Supabase Auth, PostgreSQL, and Storage
- Google Gemini (`@google/genai`, web build) for the AI features
- Motion: `motion` for product UI, plus GSAP (+ `@gsap/react`), Lenis and
  React Bits components for landing/showcase animation. See
  `src/lib/motion.ts` for the timing system and `npm run ui:add -- <Name>`
  for pulling React Bits components into `src/components/react-bits/`.

## Prerequisites

- Node.js 22 LTS (Vite 8 requires Node 20.19+ or 22.12+)
- npm
- A Supabase project

## Configuration

Copy `.env.example` to `.env` in the repository root. The server loads `.env`
with `dotenv`; Vite reads the `VITE_`-prefixed values for the browser.

Required for the app to run against a real backend:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon or publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon or publishable key>
```

Optional:

```dotenv
GEMINI_API_KEY=<key>            # AI routes return 503 without it
GEMINI_MODEL=gemini-3.8-flash   # optional override
PORT=3000
ALLOWED_ORIGINS=                # comma-separated extra browser origins
```

Rules:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never give it a `VITE_` prefix
  and never send it to the browser.
- `.env` and `.env.test` are gitignored. Never commit either file.

## Database

Apply the SQL files in `supabase/migrations` in filename order to the target
Supabase project:

```bash
npx supabase db push
```

or paste each file into the Supabase SQL editor in the same order.

> **Fresh projects are supported.** `20251019000000_fresh_project_baseline.sql`
> creates the auth-linked tables (`profiles`, `skills`, `experiences`,
> `educations`, `user_skills`, `user_preferences`) and the
> `auth.users` → `profiles` trigger that the later migrations build on. It sorts
> before the original series, is additive, and is a no-op on the existing
> hosted project. The archived files in `supabase/migrations/archive` are
> outdated (they use `auth_uid` and singular `education`/`experience`) and are
> not applied.

The CV upload feature uses a private Storage bucket named `cv-files`
(`202510200004_cv_file_storage.sql`). The bucket policies scope every object
to a `<auth.uid()>/...` prefix.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The Express server mounts Vite in middleware mode,
so the API and the browser app share one origin.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express + Vite on port 3000 |
| `npm start` | Start the server without Vite (use with a built `dist/`) |
| `npm run build` | Build the browser bundle and the Pages Worker into `dist/` |
| `npm run lint` | Type-check the project with `tsc --noEmit` |
| `npm test` | Run the integration test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run preview` | Preview the Vite build |
| `npm run build:android` | Build the native bundle into `dist-android/` |
| `npm run android:assets` | Regenerate the launcher icons and launch screens |
| `npm run android:sync` | Build the native bundle and sync it into `android/` |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:apk` | Build the debug APK |

## Deploy to Cloudflare Pages

The production target is Cloudflare Pages, project `careerdev4ai`:

<https://careerdev4ai.pages.dev>

The previous project, `careerpilot4ai` (<https://careerpilot4ai.pages.dev>), is
kept as a separate legacy deployment. It is intentionally not referenced by
`wrangler.jsonc` or the npm scripts, so deploying `careerdev4ai` cannot modify
it.

`npm run build` produces two things in `dist/`:

- the static React bundle (`index.html`, `assets/`, `theme-init.js`, `_headers`)
- `dist/_worker.js`, a single bundled Worker that serves the static assets and
  forwards `/api/*` to the same Express application used locally

`_worker.js` makes this a Pages **advanced mode** project. That is deliberate:
the standard `functions/` bundler substitutes Node built-ins with `unenv`, whose
`node:http` throws `http.createServer is not implemented yet!`, so Express
cannot run there. Advanced mode is deployed as a normal Worker module, and a
compatibility date of 2026-09-01 (the value in `wrangler.jsonc`) enables
Node.js compatibility by default and gives it the runtime's real `node:http`
implementation.

```bash
npm ci
npm run build
npx wrangler pages deploy dist --project-name careerdev4ai --branch main
```

`--branch main` is what targets the **Production** environment
(`careerdev4ai.pages.dev`). Pages maps the production branch to Production and
every other branch to a Preview environment, and Wrangler derives the branch from
the current Git branch when `--branch` is omitted. Without the explicit flag, a
deploy from any other branch silently publishes a preview URL and leaves
`careerdev4ai.pages.dev` on the old build.

Use the npm scripts, which encode the same targets:

| Script | Target |
| --- | --- |
| `npm run cf:deploy` | Production (`--branch main`) — updates `careerdev4ai.pages.dev` |
| `npm run cf:preview` | Preview (`--branch preview`) — alias `preview.careerdev4ai.pages.dev` |
| `npm run cf:dev` | Local Pages runtime on `http://localhost:8788` |
| `npm run cf:deployments` | List deployments for the project |
| `npm run cf:env` | Apply the environment variables below to Pages, from `.env` |
| `npm run cf:jobs:deploy` | Deploy the background-job Worker |
| `npm run cf:jobs:secrets` | Upload the Worker's own copy of the server credentials |
| `npm run cf:jobs:tail` | Watch the background-job Worker's logs |

Preview URLs are public by default and carry `X-Robots-Tag: noindex`.

> **Pushing to `main` does not deploy the site.** The project's git-connected
> Pages build fails in Cloudflare's build container — it has failed on every
> push since 2026-11-04, and it fails within seconds of the build stage
> starting, before any of this code is reached. The source itself is fine: a
> clean checkout of `main` installs and builds without complaint. Until that is
> fixed, **deploy with `npm run cf:deploy`**, and check the result with
> `npm run cf:deployments`.
>
> The background-job Worker is deployed separately either way
> (`npm run cf:jobs:deploy`); the git integration does not touch it.

### The background-job Worker

The long-running work (reading a CV, writing one for a job, searching for
vacancies, building a roadmap) does not run in the Pages project. It runs in a
separate Cloudflare Worker, `careerdev4ai-jobs`, which consumes a Cloudflare
Queue that the API publishes to.

A Pages project can publish to a queue but cannot consume one, which is why
the two sides are two deployments. The API writes the job to Supabase first and
publishes a message second; the worker claims the job in the database — so two
workers can never run the same job — does the work, and records the outcome.

```bash
npm run cf:jobs:deploy   # build and deploy the worker
npm run cf:jobs:tail     # watch it
```

The worker needs its own copy of the server secrets, because it is a separate
deployment:

```bash
npm run cf:jobs:secrets   # reads .env and uploads them with wrangler secret bulk
```

`BACKGROUND_JOBS.md` describes the whole design: the record, the claim, the
retry budget, the recovery sweep and what the interface says when the worker is
not picking work up.

Configure these in the Pages project (Settings → Environment variables) for
**both** Production and Preview:

| Variable | Scope | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build + client | inlined into the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build + client | anon/publishable key only |
| `SUPABASE_URL` | server | |
| `SUPABASE_ANON_KEY` | server | verifies caller access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | server | never expose or prefix with `VITE_` |
| `GEMINI_API_KEY` | server | AI routes return `503` without it |
| `GEMINI_MODEL` | server | optional |
| `ALLOWED_ORIGINS` | server | optional, comma-separated |

### Changing the environment variables safely

The Cloudflare API never returns the value of a secret: a secret always comes
back as an empty string. A PATCH that re-sends `value: ""` for a secret
therefore **erases** it while keeping its name, and the variable still shows up
in the dashboard while the deployed worker runs with an empty value. The
symptom is a site that loads and then quietly fails every route that needs
that secret.

Because of that, do not edit the environment variables by patching them one at
a time from the dashboard or the API. Apply the whole set from `.env` instead:

```bash
npm run cf:env     # sends every variable, with its real value, to both environments
npm run cf:deploy  # a redeploy is required: bindings are captured per deployment
```

`scripts/set-pages-env.mjs` refuses to send a blank value, prints only names
and types, and never prints a secret. It needs `CLOUDFLARE_API_TOKEN`, or a
`npx wrangler login` session on this machine.

The job feed adds one more server variable, `JSEARCH_RAPIDAPI_KEY`. See
[LIVE_JOBS_RAPIDAPI.md](LIVE_JOBS_RAPIDAPI.md).

Supabase Auth must also be configured (Authentication → URL Configuration):

- **Site URL**: `https://careerdev4ai.pages.dev`
- **Redirect URLs**: `https://careerdev4ai.pages.dev/**`,
  `https://*.careerdev4ai.pages.dev/**` for previews, and
  `http://localhost:3000/**` for local development. Keep the legacy
  `https://careerpilot4ai.pages.dev/**` entry while the old deployment is live.
- **Providers**: enable Google, LinkedIn (OIDC), and GitHub.

The Android application adds one more redirect URL, the deep link the OAuth
provider returns to: `com.careerpilot.ai://auth/callback`. See
[Android application](#android-application).

### GitHub OAuth

The app starts GitHub sign-in with the existing Supabase browser client and
returns to the `origin` + `/auth/callback` path. The SPA fallback serves the app
for that path, and the existing session listener completes the sign-in. No
client secret or GitHub credential belongs in this repository or in any
`VITE_` variable.

1. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth
   Apps) with the **Authorization callback URL** set to
   `https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`.
2. In Supabase → Authentication → Providers → GitHub, enable the provider and
   paste the GitHub Client ID and Client Secret there. Keep those values in the
   Supabase dashboard only.
3. Add the production callback to Supabase → Authentication → URL
   Configuration → Redirect URLs:
   `https://careerdev4ai.pages.dev/auth/callback`. Add
   `http://localhost:3000/auth/callback` for local development. An existing
   `<origin>/**` entry already covers the path.
4. After the first GitHub sign-in, the existing `careerpilot_handle_new_user`
   trigger creates the `profiles` and `user_preferences` rows; onboarding then
   runs exactly as it does for email/password and the other providers.

> `wrangler.jsonc` and the deployment commands above use the Pages project name
> `careerdev4ai`. Keep the Supabase Site URL and Redirect URLs aligned with the
> origin actually deployed. The legacy `careerpilot4ai` origin stays listed only
> while that separate deployment is still serving.

Verify the production build locally before deploying:

```bash
npx wrangler pages dev dist          # loads .env, serves on http://localhost:8788
curl http://localhost:8788/api/health
```

`GET /api/health` answers JSON, unknown `/api/*` paths answer JSON `404`, and
`/api/profile` answers `401` without a session.

### Node fallback

The app can still be hosted as a plain Node process:

```bash
npm install
npm run build
NODE_ENV=production npm start
```

`server.ts` loads `.env`, serves `dist/` and falls back to `index.html` for
client-side routes. Unknown `/api/*` paths return JSON `404` instead of HTML.
`tsx` is a runtime dependency because the Node entry is executed from
TypeScript source. Put the process behind HTTPS and provide every variable
through the host's secret manager.

The document-level Content-Security-Policy and HSTS live in
`public/_headers`; the API adds its own baseline headers in `app.ts`.

## Android application

The same application ships as a native Android app built with Capacitor. The
bundle, the branding, the routes and the backend are the ones that already
exist: the WebView serves the same React application, and the native layer
only adds what a phone needs — the hardware back button, the system bars, the
keyboard, the OAuth hand-off and the launcher icon.

| Path | Purpose |
| --- | --- |
| `android/` | the Capacitor Android project |
| `capacitor.config.ts` | the native configuration: application id, web directory, plugins |
| `.env.android` | the production configuration the native build is pinned to |
| `src/lib/native.ts` | the handful of helpers that differ between the web and the native build |
| `src/lib/nativeBridge.ts` | the native shell: back button, external links, OAuth deep link |
| `scripts/generate-android-assets.mjs` | builds the launcher icons and launch screens from the brand artwork |

### Build

The Android build needs **JDK 21** and the **Android SDK** (compile SDK 36,
build-tools 36). Nothing else changes:

```bash
npm ci
npm run android:sync     # builds dist-android/ and copies it into android/
npm run android:open     # opens the project in Android Studio
```

`npm run android:apk` produces the debug APK at
`android/app/build/outputs/apk/debug/app-debug.apk`.

### How the native build differs from the web build

- **A separate bundle.** `dist-android/` is built with `vite build --mode
  android`, so the Cloudflare Pages bundle in `dist/` — including its Worker —
  is never touched by the native build. `.env.android` pins the native build to
  the production origin and to the production Supabase project.
- **API calls.** The WebView is served from `https://localhost`, so a call to
  the application's own API is a cross-origin request. `CapacitorHttp` performs
  those requests with the native HTTP stack, which is not subject to the
  browser's CORS rules. The server, its CORS allow-list and the Cloudflare
  configuration are exactly as they were.
- **OAuth.** Google and LinkedIn refuse embedded user agents, so on Android
  the provider page is opened in the system browser and the result returns
  through the deep link `com.careerpilot.ai://auth/callback`, which the
  application exchanges for a session exactly as the web build does. That
  address has to be listed in Supabase → Authentication → URL Configuration →
  Redirect URLs. The web sign-in is untouched.
- **Links and the back button.** A link with `target="_blank"` is opened in the
  system browser, and the hardware back button closes an open dialog, walks
  the application's own history and minimizes the app at the very end.

## AI behaviour

AI routes require `GEMINI_API_KEY`. If the key is missing or the model call
fails, the server returns an explicit error. It does **not** return canned
advice dressed up as a model response. The Learning Hub's deterministic
recommendations still work without AI, and say so in the UI.

## Tests

`npm test` needs test credentials in the process environment or in a
`.env.test` file (copy `.env.test.example`). The suite creates and deletes its
own `cp-test-*` identities and rows. It never truncates tables, but the
service-role key gives full access, so use a project that is safe to hold test
data — never production credentials.

Every identity a run creates carries that run's id, so a run never removes the
data of a run that is executing at the same time. The tables the suite writes to
— announcements, the delivery ledger, the scheduler and the rate limits — are
still shared, so the CI workflow runs one job at a time, and a local run
should wait for a CI run to finish before it starts.

## Personalisation architecture

The product personalises from one thing: the career the user selected and the
skills they actually have. The logic that turns those two facts into advice
lives in `shared/`, so the browser and the API run exactly the same code, and
so it can be tested without a database.

```text
shared/careerDomains.ts     The 15 career domains
shared/careerRoles.ts       The 81 roles, with their skills, paths and projects
shared/targetRoleSelection.ts  Domain + specialisation validation
shared/skillGap.ts          THE skill gap engine. One answer to "what is
                            missing", with Critical/High/Medium/Low/Sufficient
                            priorities and a readiness figure.
shared/roadmapGenerator.ts  THE roadmap generator. Pure: role + skill levels in,
                            a fully attributed plan out.

server/roadmap/service.ts   Loads the user's real data, generates the plan and
                            persists it. Existing progress is preserved.
server/db/volunteerOpportunities.ts  Ranks the volunteering catalogue for the
                            signed-in user by open skill gap, then role, then
                            domain.
server/cv/buildCv.ts        Assembles a CV from the user's own records. It
                            never invents, and it reports what is missing.
server/cv/aiAssist.ts       Writes one CV section for the verified user. The
                            record is read from the database and the answer is
                            checked back against it before it is returned.
shared/cvAiAssist.ts        The contract for that operation, shared by the
                            server and the client.
shared/cvDocument.ts        Maps the platform's records onto a CV document,
                            keeping anything the user has already written.
server/ai/grounding.ts      Checks model output against the user's real record.
server/ai/groundingProfile.ts  Builds that record from the database.
```

`src/` consumes the same result. The React tree never assembles a plan.

### API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/roadmap/personalized` | The plan, generated on the server if it is missing or stale |
| `POST /api/roadmap/generate` | Regenerate from the current role and skill ratings |
| `GET /api/roadmap/preview` | The plan without writing anything |
| `GET /api/skill-gaps` | The gap list with priorities and a readiness figure |
| `GET /api/volunteer/opportunities` | The real volunteering catalogue, ranked for the user |
| `POST`/`DELETE /api/volunteer/opportunities/:id/save` | Save or unsave an opportunity |
| `GET /api/cv/build` | A CV assembled from the user's own records |
| `POST /api/cv/ai-assist` | Write one CV section from the user's own record |
| `GET /api/guides`, `POST /api/guides/:key/dismiss` | Which guided tours the user has seen |

### Localisation

`src/translations/sourceStrings.ts` holds the Arabic catalogue, keyed by the
English source string, split one file per area of the product. The `t()`
function in the career context resolves a key against the legacy keyed
catalogue first and then against this one, falling back to the English
source. `tests/localization.test.ts` fails the build if any string routed
through `t()` has no Arabic entry.

## Project layout

```text
app.ts                    Express application and every API route
server.ts                 Node entry point (dotenv, Vite/static serving, listen)
worker/index.ts           Cloudflare Pages advanced-mode entry point
scripts/build-worker.mjs  Bundles worker/index.ts into dist/_worker.js
scripts/generate-brand-assets.mjs  Rebuilds every logo derivative from the official files
server/auth/              Supabase token verification and route guard
server/db/                One module per persisted domain
server/shims/             Small Node-built-in replacements used by the Worker bundle
src/assets/brand/         Official logo files (official/) and their generated derivatives
src/components/brand/     The shared <Logo> component (icon | full)
src/context/              Application state, auth session, hydration
src/components/views/     Authenticated product views
src/lib/                  API clients and Supabase browser client
src/lib/native.ts         Web and native differences (API base URL, deep link)
src/lib/nativeBridge.ts   The native shell: back button, external links, OAuth deep link
supabase/migrations/      PostgreSQL schema, RLS policies, catalog seed
tests/                    Integration tests
android/                  The Capacitor Android project
capacitor.config.ts       The native configuration
```

## Release scope and external dependencies

- **Live job feed.** The Live Jobs view shows real postings returned by JSearch,
  an aggregate over public job boards. Live vacancies, the platform's own
  curated opportunities and its learning resources are three separate
  categories and are never mixed. The application does not invent listings or
  application links. The provider credential is a server secret — see
  `LIVE_JOBS_RAPIDAPI.md`.
- **Branding assets** are integrated. The approved logo files live in
  `src/assets/brand/official/` and are the single source of truth. `npm run brand`
  regenerates every derivative from them (`src/assets/brand/*.png` for the UI,
  `public/brand/*` for the favicon, PWA and Open Graph set). The UI renders the
  logo through `src/components/brand/Logo.tsx`; nothing else may reference an
  image file directly. The artwork is never redrawn or recoloured — only the
  supplied outer margin is trimmed and, for opaque source art, the white field
  is keyed out so the mark can sit on any surface.
- **Gemini** is the only external AI provider. Without `GEMINI_API_KEY` the AI
  routes return an explicit `503` and the UI reports that AI is unavailable;
  no canned AI output is substituted.
- **Supabase** is the only identity and persistence provider. Production
  migrations must be applied to the target project before deploying.

## Developer

**Ahmed Ebrahim**

- LinkedIn: [https://www.linkedin.com/in/ahmed-ebrahim2](https://www.linkedin.com/in/ahmed-ebrahim2)
- GitHub: [https://github.com/ahmedghannam801](https://github.com/ahmedghannam801)
- Email: [ahmedghannam801@gmail.com](mailto:ahmedghannam801@gmail.com)
- Phone: [+201027053876](tel:+201027053876)

## License

No license file is included in this repository. All rights are reserved unless
the repository owner states otherwise.
