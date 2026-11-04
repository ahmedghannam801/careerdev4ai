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
