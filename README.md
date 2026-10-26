# CareerPilot AI

CareerPilot AI is a personal career operating system: goals, skills, roadmap,
learning, projects, evidence, CVs, job applications, and interview practice in
one workspace. State is stored in PostgreSQL (Supabase) and scoped to the
signed-in Supabase Auth user.

The Jobs view does not ship a live vacancy feed. It launches real searches on
public job boards and keeps the roles you choose to pursue in the persisted
Applications pipeline.

## Stack

- React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- Express 4, executed with `tsx` for Node (`server.ts`) and bundled into a
  Cloudflare Pages advanced-mode Worker (`dist/_worker.js`) for production
- Supabase Auth, PostgreSQL, and Storage
- Google Gemini (`@google/genai`, web build) for the AI features

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

## Deploy to Cloudflare Pages

The production target is Cloudflare Pages, project `careerpilot4ai`:

<https://careerpilot4ai.pages.dev>

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
npx wrangler pages deploy dist --project-name careerpilot4ai --branch main
```

`--branch main` is what targets the **Production** environment
(`careerpilot4ai.pages.dev`). Pages maps the production branch to Production and
every other branch to a Preview environment, and Wrangler derives the branch from
the current Git branch when `--branch` is omitted. Without the explicit flag, a
deploy from any other branch silently publishes a preview URL and leaves
`careerpilot4ai.pages.dev` on the old build.

Use the npm scripts, which encode the same targets:

| Script | Target |
| --- | --- |
| `npm run cf:deploy` | Production (`--branch main`) — updates `careerpilot4ai.pages.dev` |
| `npm run cf:preview` | Preview (`--branch preview`) — alias `preview.careerpilot4ai.pages.dev` |
| `npm run cf:dev` | Local Pages runtime on `http://localhost:8788` |
| `npm run cf:deployments` | List deployments for the project |

Preview URLs are public by default and carry `X-Robots-Tag: noindex`.

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

Supabase Auth must also be configured (Authentication → URL Configuration):

- **Site URL**: `https://careerpilot4ai.pages.dev`
- **Redirect URLs**: `https://careerpilot4ai.pages.dev/**`,
  `https://*.careerpilot4ai.pages.dev/**` for previews, and
  `http://localhost:3000/**` for local development
- **Providers**: enable Google, LinkedIn (OIDC), and GitHub.

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
   `https://careerpilot4ai.pages.dev/auth/callback`. Add
   `http://localhost:3000/auth/callback` for local development. An existing
   `<origin>/**` entry already covers the path.
4. After the first GitHub sign-in, the existing `careerpilot_handle_new_user`
   trigger creates the `profiles` and `user_preferences` rows; onboarding then
   runs exactly as it does for email/password and the other providers.

> `wrangler.jsonc` and the deployment commands above use the Pages project name
> `careerpilot4ai`. If that is the live origin, use
> `https://careerpilot4ai.pages.dev/auth/callback` instead and keep the Supabase
> Site URL and Redirect URLs aligned with the origin actually deployed.

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
supabase/migrations/      PostgreSQL schema, RLS policies, catalog seed
tests/                    Integration tests
```

## Release scope and external dependencies

- **No live job feed.** The Jobs view builds searches on LinkedIn, Indeed,
  Google Jobs and Wellfound. The application does not invent listings or
  application links.
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
