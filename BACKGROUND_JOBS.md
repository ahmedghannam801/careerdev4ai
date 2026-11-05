# Background jobs

This is how long-running work leaves the request cycle: the API accepts the
request, a Cloudflare Worker does the work, and Supabase keeps the record of
what happened.

```
   browser ──POST──▶ Express API (Cloudflare Pages)
                          │
                          │  1. write the job row        ──▶ Supabase Postgres
                          │  2. publish a message        ──▶ Cloudflare Queue
                          ▼
                     202 Accepted
                          │
                          ▼
                 background-job Worker  ──queue──▶  the same queue
                          │                            (a retry, or a job
                          │                             that was handed back)
                          ▼
                   Supabase Postgres
```

## The shape of a job

| Part | Where it lives |
| --- | --- |
| The work | `server/jobs/tasks/*.ts` — one function per workflow |
| The registry | `server/jobs/tasks/index.ts` |
| The retry policies | `server/jobs/tasks/policies.ts` |
| The shared task helpers | `server/jobs/runtime.ts` |
| The durable record | `public.background_jobs` |
| The API | `server/jobs/routes.ts` |
| The queue transport | `server/jobs/queue.ts` |
| The consumer | `server/jobs/consumer.ts` |
| The worker | `worker/jobs/index.ts` |
| The interface | `src/lib/useBackgroundJobs.ts`, `src/components/background/BackgroundJobsPanel.tsx` |

### The tasks

| Task | What it does | Attempts |
| --- | --- | --- |
| `process-cv` | Reads the stored CV, extracts and structures it, evaluates it with the model, and writes a CV version. | 2 |
| `generate-targeted-cv` | Reads a job description, compares it with the candidate's record, writes a CV for it and a cover letter, and saves an application package. | 2 |
| `match-jobs` | Searches real vacancies and compares each one with the candidate's own skills. | 2 |
| `generate-career-roadmap` | Builds the roadmap from the candidate's record and saves it. | 2 |
| `update-roadmap-progress` | Records the steps a candidate has completed. | 1 |
| `process-ai-mentor-workflow` | Answers a question from the candidate's record, with the claims they cannot back removed. | 2 |
| `validate-learning-resources` | Checks that the learning catalogue still points at real resources. | 1 |
| `health-check` | Returns immediately. It is what a deployment is verified with. | 1 |

## Why the row is written before the message is published

A queue message can be delivered twice, or not at all. A database row cannot.
So the row is written first and the message is published second:

* the row is the promise that the job exists — it is what the interface reads,
  and what a retry replays;
* the message is only a knock on the door — it says *come and do job X*, and
  it says nothing about what X is or how it ended.

If the publication fails, the row is not stranded:

* a **permanent** failure — there is no queue on this server at all — fails the
  job with the reason on it, so the candidate sees *why* nothing happened
  instead of a job that spins for ever;
* a **temporary** failure leaves the row marked as *still to be dispatched*, and
  the worker's scheduled sweep publishes it again.

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

**Two workers cannot run the same job.** The job is claimed in the database
with a single conditional update. Postgres takes a row lock for it and
re-checks the condition when the lock is granted, so of two workers holding
the same message exactly one updates the row and the other updates none — and
is told to skip. That one rule is what makes duplicate delivery harmless.

**The AI allowance is spent at the door.** The daily allowance is consumed
when the job is admitted, not inside the worker. The worker runs in a separate
process with its own memory, so an in-process counter would be empty there and
every job would look free. Charging at the door keeps the accounting in the
one place every request goes through. A workflow that makes two model calls is
charged two units.

**No score is ever invented.** When the model is unavailable, spends too much,
or answers with something that is not the expected shape, the work is still
done and the result simply carries no score. A missing score is honest; a
made-up one is not.

**Retries are small, deliberate and bounded.** Each workflow declares its own
budget in `server/jobs/tasks/policies.ts`, and the ones that cost model calls get
at most one retry. The wait between attempts doubles each time and stops at the
policy's ceiling.

The policies live apart from the tasks on purpose: the API needs to know how
many attempts a job is allowed, and it must not pull the whole task library —
and the model SDK with it — into its own bundle to learn a number.

**One candidate's work on one record does not overlap itself.** The claim
checks for another job of the same candidate, the same workflow and the same
record that is already running. When one is found the job is handed straight
back and tried again later, rather than running two copies at once.

**An interrupted worker does not lose the job.** A worker holds a *lease* on
the job it is running. It renews the lease while it works. If the worker dies,
the lease runs out and the scheduled sweep hands the job back to the queue.
Recovery is counted apart from the job's own attempts, so an interrupted
worker does not spend the job's retry allowance — and it is bounded too, so a
job that keeps killing its worker is eventually given up on.

**Cancelling is a decision, not a request.** Cancelling a job writes
`cancelled` to the row. A worker that has not started it cannot claim it at
all; a worker that is holding it finds out at its next step and stops there.
Nothing has to be told to the worker for the cancellation to take effect, and a
late result can never be written over a cancellation.

**Nothing secret is written down.** A failure is stored with a code, a message
and a structured detail. Anything that looks like a credential — a bearer token,
an API key, a long encoded blob — is removed from the message before it is
stored.

## Saying what is really true

A background job only runs if something can execute it, and that is not always
true. A queue with no worker behind it cannot do anything at all, and a spinner
that never ends is worse than an honest message.

So the worker says that it is alive, and the API reports what the worker says:

- the worker writes a heartbeat into `public.background_job_consumers` every
  time its scheduled sweep runs (every five minutes);
- `GET /api/background-jobs/availability` reads the newest heartbeat;
- **"Not known" is never reported as "no"** — a state that could not be read is
  `unknown`, and work is still accepted.

The states are:

| State | What it means |
| --- | --- |
| `ready` | A worker checked in recently and is picking work up. |
| `degraded` | A worker checked in, but not recently enough to say it is running right now. Work may wait a little. |
| `unavailable` | No worker has checked in for over an hour. Nothing is picking work up. |
| `unconfigured` | This server has no queue at all. |
| `unknown` | The state could not be read just now. |

A job started while the service is `unavailable` is refused with
`503 no_runner_available` rather than being accepted and left waiting. The
interface shows the state, disables the button that starts work, and says why.

Two more things follow from this:

- **A job that never started is given up on.** A row that has been waiting for
  half an hour has no worker behind it, so it is failed with
  `no_runner_available` and a sentence the candidate can read. The clock runs
  from the time the *current* attempt started waiting, not from the time the
  job was first submitted, so a retried job is not given up on for being old.
- **Nothing can point the server at another worker.** The queue is a binding
  in the deployment configuration and comes from nowhere else. A request cannot
  move production traffic anywhere.

## The durable record

`public.background_jobs` holds one row per logical job. It records *that* a
job exists, *whose* it is, *what* it was for and *how it ended*. The work
itself stays in the domain tables — `cvs`, `cv_versions`,
`application_packages`, `cover_letters`, `roadmaps` — so nothing that already
reads those tables changes.

The state is kept there rather than in the browser for one reason: a result
that finishes while the tab is closed must still be there when the candidate
comes back. The interface reads the list back from the server, so a refresh
loses nothing.

| Column | What it is for |
| --- | --- |
| `status` | `pending`, `queued`, `processing`, `completed`, `failed` or `cancelled`. |
| `attempt` | Which attempt of the work is pending or running. |
| `max_attempts` | How many times the work itself may be attempted. |
| `run_id` | The id of the queue message that carries the job out. |
| `queued_at` | When the current attempt started waiting. |
| `scheduled_at` | When the job should next be handed to the queue. |
| `dispatched_at` | When it was last handed to the queue. |
| `dispatch_needed` | True when it still has to be handed to the queue. |
| `recovery_attempts` | How many times a worker was interrupted while holding it. |
| `locked_by`, `locked_at`, `lease_expires_at` | The worker's hold on the job. |
| `error_code`, `error_message`, `error_detail` | The failure, without any secret in it. |

The migration is `supabase/migrations/20261106000001_background_jobs_queue.sql`.
It adds the columns above, the indexes the dispatcher and the sweeps read by,
the heartbeat table, and the three functions that move a job between states
(`claim_background_job`, `complete_background_job`, `fail_background_job`). It
alters no existing row and changes no existing meaning.

## Running it

```bash
# the whole site, with the background jobs running on an in-process queue
npm run dev

# the worker on its own, against a local queue
npm run cf:jobs:dev

# build and deploy the worker
npm run cf:jobs:deploy

# watch the worker
npm run cf:jobs:tail

# check the deployed pipeline end to end
node scripts/verify-queue-production.mjs
```

The local development server runs its own queue — the same consumer the
deployed worker uses, fed by an in-process queue — so a job started in the
browser behaves the same way it behaves in production. The test server does
*not*: it must never start real work, and it has to be able to prove what the
API does when there is no queue at all.

`scripts/verify-queue-production.mjs` signs a throwaway candidate in on the
deployed site, starts a real job and follows it to its outcome. It is the
proof that the whole path works on the platform and not only in the test
suite.

## Configuration

| Variable | Needed for | Notes |
| --- | --- | --- |
| `JOB_QUEUE` (binding) | Starting a job | The Cloudflare Queue. A **binding**, not a variable: it is configured in `wrangler.jsonc` and applied by `wrangler pages deploy`. |
| `GEMINI_API_KEY` | The model calls | Already used by the synchronous routes. |
| `JSEARCH_RAPIDAPI_KEY` | The live job search (`match-jobs`) | Falls back to `RAPIDAPI_KEY`. Without either, the search reports *"Live job search is not configured on this server."* |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Reading and writing the job row | The worker has no end-user session, so it uses the service role and checks ownership itself. |

The worker needs its own copy of the last three, because it is a separate
deployment with its own environment:

```bash
npm run cf:jobs:secrets
```

That reads `.env` and uploads the five credentials to the worker with
`wrangler secret bulk`. It is a script rather than a shell pipeline on purpose:
a shell pipeline adds a byte-order mark to the value it sends, and a
credential that begins with a byte-order mark is rejected as invalid by the
service it belongs to.

The Pages environment is set from the local `.env` by `npm run cf:env`. The
public variables — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`OPENROUTER_MODEL` — are also declared in `wrangler.jsonc`, because
`wrangler pages deploy` applies that file to the project and a plain-text
variable the file does not declare is cleared from the project by the next
deployment. `npm run cf:env` checks that the file and `.env` still agree.

A variable that has been removed from `.env` is not removed from the project
by the API — the API merges what it is given into what is already there — so
`npm run cf:env` reports it and the command that removes it is printed with it:

```bash
npx wrangler pages secret delete <name> --project-name careerdev4ai
```

## The two deployments

| | The site | The worker |
| --- | --- | --- |
| What it is | Cloudflare Pages project `careerdev4ai` | Cloudflare Worker `careerdev4ai-jobs` |
| What it does | Serves the site and the API | Consumes the queue, runs the scheduled sweep |
| Where the code is | `worker/index.ts` | `worker/jobs/index.ts` |
| How it is built | `npm run build` → `dist/_worker.js` | `npm run build:jobs` → `dist-jobs/worker.js` |
| How it is deployed | `npm run cf:deploy` | `npm run cf:jobs:deploy` |
| The queue | producer (`JOB_QUEUE`) | consumer and producer |
| Its own address | `careerdev4ai.pages.dev` | `careerdev4ai-jobs.<account>.workers.dev` — it serves the worker's own health, which is what an operator reads to see that the consumer is alive |

A Pages project can publish to a queue but cannot consume one, which is why
the consuming side is a separate Worker rather than a second deployment of the
site.
