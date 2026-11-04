# Background jobs

This is how long-running work leaves the request cycle: the API accepts the
request, Trigger.dev does the work, and Supabase keeps the record of what
happened.

## Why the server talks to Trigger.dev over HTTP

The task runtime uses the `@trigger.dev/sdk`, which is where it belongs. The
*server* that starts those tasks does not.

The API in this repository is not a Node server. `worker/index.ts` bundles the
Express application into a Cloudflare Worker (`dist/_worker.js`), and that is
what runs in production. The Trigger.dev SDK's package graph reaches for
`node:child_process` and `node:fs`, which the Workers runtime does not
provide even with `nodejs_compat` — so bundling the SDK into the Worker would
make the whole API depend on a runtime it cannot have.

The server therefore talks to Trigger.dev over its public REST API with
`fetch`:

```
POST https://api.trigger.dev/api/v1/tasks/{taskId}/trigger
Authorization: Bearer <TRIGGER_SECRET_KEY>
```

Three properties follow from that choice:

* the same code path runs in the Cloudflare Worker, in the local Express
  server and in the test suite, so a test proves the real thing;
* the Worker build needs no bundling tricks and stays as it is;
* the platform's own idempotency and concurrency controls are used directly,
  which is what keeps a double submit from becoming two runs.

The key decides the environment. A `tr_dev_sk_…` key addresses Development and
a `tr_prod_sk_…` key addresses Production, so one variable covers both.

## The shape of a job

| Part | Where it lives |
| --- | --- |
| The work | `src/trigger/*.ts` — a Trigger.dev task per workflow |
| The shared task helpers | `server/trigger/runtime.ts` |
| The durable record | `public.background_jobs` |
| The API | `server/trigger/routes.ts` |
| The platform client | `server/trigger/client.ts` |
| The interface | `src/lib/useBackgroundJobs.ts`, `src/components/background/BackgroundJobsPanel.tsx` |

### The task files

| Task | What it does |
| --- | --- |
| `process-cv` | Reads the stored CV, extracts and structures it, evaluates it with the model, and writes a CV version. |
| `generate-targeted-cv` | Reads a job description, compares it with the candidate's record, writes a CV for it and a cover letter, and saves an application package. |
| `match-jobs` | Searches real vacancies and compares each one with the candidate's own skills. |
| `generate-career-roadmap` | Builds the roadmap from the candidate's record and saves it. |
| `update-roadmap-progress` | Records the steps a candidate has completed. |
| `process-ai-mentor-workflow` | Answers a question from the candidate's record, with the claims they cannot back removed. |
| `validate-learning-resources` | Checks that the learning catalogue still points at real resources. |
| `health-check` | Returns immediately. It is what a deployment is verified with. |

### The durable record

`public.background_jobs` holds one row per logical job. It records *that* a
job exists, *whose* it is, *what* it was for and *how it ended*. The work
itself stays in the domain tables — `cvs`, `cv_versions`,
`application_packages`, `cover_letters`, `roadmaps` — so nothing that already
reads those tables changes.

The state is kept there rather than in the browser for one reason: a result
that finishes while the tab is closed must still be there when the candidate
comes back. The interface reads the list back from the server, so a refresh
loses nothing.

The migration is `supabase/migrations/20261104000002_background_jobs.sql`. It
only creates a new table and its policies; no existing table is altered and no
existing row changes meaning.

## The rules the implementation keeps

**Ownership is never taken from the request.** The owner of a job is the id
verified from the caller's Supabase session. A record that belongs to somebody
else is reported as *not found*, so the API does not confirm that another
candidate's job exists. The task re-checks the same thing before it writes
anything, because the task is what actually touches the data.

**The same request is one job.** The idempotency key is a hash of the request
(profile, workflow, source record, content). A unique index on it means a
double submit can never create a second row, and the API answers the second
submit with the job the first one created. A deliberate retry bumps the
attempt counter on the same row and replays the stored request, so the second
attempt cannot quietly do something different from the first.

**The AI allowance is spent at the door.** The daily allowance is consumed
when the job is admitted, not inside the task. The task runs in a different
process with its own memory, so an in-process counter would be empty there and
every task would look free. Charging at the door keeps the accounting in the
one place every request goes through. A workflow that makes two model calls is
charged two units.

**No score is ever invented.** When the model is unavailable, spends too much,
or answers with something that is not the expected shape, the work is still
done and the result simply carries no score. A missing score is honest; a
made-up one is not.

**Retries are small and deliberate.** Each task declares its own retry policy,
and the ones that cost model calls get at most one retry. A second attempt
costs another unit of the day's allowance, so it is only worth it for a
failure that might not repeat.

**Concurrency is bounded.** Every user-facing task declares
`concurrency: { perKey: 1 }`, and the API passes a concurrency key of
`profile:kind:source`. One candidate's work on one record cannot overlap
itself, and the platform serialises it.

## Saying what is really true

A background job only runs if something can execute it, and that is not always
true. A Production run needs a deployed version of the tasks; a Development run
needs a development worker, which is a process on somebody's machine. A job
started while neither is true would wait for ever, and a spinner that never
ends is worse than an honest message.

So the API says plainly what it can do, and the interface shows it:

- `GET /api/background-jobs/availability` returns the state of the service.
- The environment comes from the secret key itself: a `tr_prod_sk_…` key
  addresses Production and a `tr_dev_sk_…` key addresses Development.
- In Production the check asks the platform whether a version is deployed.
- In Development there is no deployment to ask about, so the evidence is the
  runs themselves: a run that started recently proves a worker is connected, a
  run that has been waiting proves one is not.
- **"Not known" is never reported as "no".** When the platform cannot be asked,
  the answer is `unknown`, and work is still accepted.

The states are `ready` (the platform's own Production runtime), `degraded`
(the work runs, but on a development worker), `unavailable` (nothing can pick
it up), `unconfigured` (this server holds no Trigger.dev key) and `unknown`.

A job in `unavailable` is refused with `503 no_runner_available` rather than
being accepted and left waiting. The interface shows the state, disables the
button that starts work, and says why.

Two more things follow from this:

- **A job that never started is given up on.** A row that has been `queued` for
  half an hour has no runner behind it, so it is failed with
  `no_runner_available` and a sentence the candidate can read. It does not sit
  queued for ever with no explanation. If a task does eventually start, it
  overwrites the row with what it really did.
- **Nothing can point the server at another worker.** The API URL and the
  secret key come from the server environment and from nowhere else. A request
  cannot move production traffic onto a developer's machine, and there is no
  code path that would let it.

## Running it

```bash
# the local worker, with the tasks registered
npm run dev:trigger

# deploy the tasks
npm run deploy:trigger
```

The API needs `TRIGGER_SECRET_KEY` to start a job. Without it the
background-job routes answer 503 and the rest of the application is
unaffected — the server still boots, and the platform still runs the tasks.
The request that could not be started is still recorded as a failed job with
the reason on it, so the candidate sees *why* nothing happened instead of a
job that spins for ever.

## Configuration

| Variable | Needed for | Notes |
| --- | --- | --- |
| `TRIGGER_SECRET_KEY` | The API starting a job | `tr_dev_sk_…` for Development, `tr_prod_sk_…` for Production. Server-side only. |
| `TRIGGER_PROJECT_REF` | Labelling runs | Optional. |
| `TRIGGER_API_URL` | Pointing at another endpoint | Optional; defaults to `https://api.trigger.dev`. |
| `GEMINI_API_KEY` | The model calls | Already used by the synchronous routes. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Reading and writing the job row | The task has no end-user session, so it uses the service role and checks ownership itself. |

In Cloudflare Pages, `TRIGGER_SECRET_KEY` is a **secret** environment variable
on the production environment. It is never exposed to the browser.

## Where it is running

The API is live on `https://careerdev4ai.pages.dev` with `TRIGGER_SECRET_KEY`
set as a Pages secret. The tasks are running in the Trigger.dev **Development**
environment (`tr_dev_sk_…`), because Production deployments are not enabled on
the organisation — `trigger deploy --prod` uploads the build and then refuses
it with *"Deployments are not available for this organization."*

That refusal is not a problem with the project. It has been checked against
everything that could cause it: the organisation's Free plan is active (the
platform's own activation endpoint answers *"Organization is already
activated"*), the project is initialised, the personal access token is valid
(the build and the upload both succeed), the CLI is the current published
version, the remote build provider is operational, and the platform reports no
incident and no notification for this organisation. Only the creation of the
deployment is refused, and it is refused for the organisation rather than for
the project.

`TRIGGER_SUPPORT_REQUEST.md` holds the request to Trigger.dev, with the exact
error and the project reference.

A Development run needs a worker to pick it up, so `npm run dev:trigger` has to
be running for a job started by the live site to execute. That is the one
operational difference from Production: with a Production deployment the
platform runs the tasks on its own, and nothing has to be kept alive locally.

Until then the interface says so rather than letting the candidate believe
otherwise: the availability endpoint reports `environment: "development"` and
`status: "degraded"`, and the panel shows that the work is being carried out by
a development worker rather than by the Trigger.dev Production runtime.

The live chain was verified end to end with a throwaway identity: a job started
on the deployed site reached `completed` with a real roadmap (4 phases, 18
steps) in its result, the same request a second time was answered with the job
the first one created, a record belonging to another candidate was answered
with `404 Not found`, and the candidate's own record was accepted with `202`.

## What the owner still has to do

**Rotate the secret key.** The Development key was pasted into a conversation,
so it should be treated as exposed. A replacement is set with:

```bash
npx wrangler pages secret put TRIGGER_SECRET_KEY --project-name careerdev4ai
```

and the same value in the local `.env`. The old key is then revoked in the
Trigger.dev dashboard.

**Enable Production deployments** on the organisation, if the tasks should run
without a local worker. After that, `npm run deploy:trigger` publishes to
Production and the live site needs a `tr_prod_sk_…` key instead. The tasks
also need their own environment variables in the Trigger.dev environment,
because a Production run does not read the server's `.env`:

```bash
npx trigger.dev@latest env set SUPABASE_URL <value> --env prod --secret
npx trigger.dev@latest env set SUPABASE_SERVICE_ROLE_KEY <value> --env prod --secret
npx trigger.dev@latest env set GEMINI_API_KEY <value> --env prod --secret
```

The `--secret` flag matters: it stores the value so it cannot be read back
through the API.


