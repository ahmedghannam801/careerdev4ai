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
- Express 4, executed with `tsx` (`server.ts`)
- Supabase Auth, PostgreSQL, and Storage
- Google Gemini (`@google/genai`) for the AI features

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
APP_URL=
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
| `npm run build` | Build the browser bundle into `dist/` |
| `npm run lint` | Type-check the project with `tsc --noEmit` |
| `npm test` | Run the integration test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run preview` | Preview the Vite build |

## Production

```bash
npm install
npm run build
NODE_ENV=production npm start
```

In production the server serves `dist/` and falls back to `index.html` for
client-side routes. Unknown `/api/*` paths return JSON `404` instead of HTML.
`tsx` is a runtime dependency because the server is executed from TypeScript
source.

Deployment notes:

- Set `NODE_ENV=production` so Vite middleware is not loaded.
- Provide all Supabase variables through the host's secret manager, not a
  committed file.
- Put the service behind HTTPS. The app sets baseline security headers but does
  not define a Content-Security-Policy yet; add and test one before exposing
  third-party embeds.
- Health check: `GET /api/health`.

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
server.ts                 Express app, API routes, Vite/static serving
server/auth/              Supabase token verification and route guard
server/db/                One module per persisted domain
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
- **Branding assets** (official logo mark, favicon set, web manifest and Open
  Graph image) are not included in this repository. The app ships with a text
  wordmark and a neutral favicon; add the official assets before launch.
- **Gemini** is the only external AI provider. Without `GEMINI_API_KEY` the AI
  routes return an explicit `503` and the UI reports that AI is unavailable;
  no canned AI output is substituted.
- **Supabase** is the only identity and persistence provider. Production
  migrations must be applied to the target project before deploying.

## License

No license file is included in this repository. All rights are reserved unless
the repository owner states otherwise.
