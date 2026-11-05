// The background-job queue.
//
// This file covers the parts of the background-job system that the HTTP suite
// cannot reach: what a message carries, how a worker claims a job, what
// happens when the same message arrives twice, how a failure is retried and
// when it is given up on, how a job whose worker died is handed back, and how
// a candidate's cancellation is honoured.
//
// The code under test is the same code the platform runs. The consumer is the
// consumer the Cloudflare Worker calls, the transport is the transport the API
// publishes through — only the pipe between them is an in-process queue
// instead of a Cloudflare one.
//
// Every row this file creates is deleted by the end of it.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  admin,
  anon,
  api,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.ts';
import { startServer, findFreePort } from './server-harness.mjs';
import {
  LocalJobQueue,
  QueueNotConfiguredError,
  setJobQueueProducer,
  publishJobMessage,
  type JobQueueMessage,
} from '../server/jobs/queue.ts';
import {
  handleJobDelivery,
  redact,
  type WorkerContext,
} from '../server/jobs/consumer.ts';
import {
  createJob,
  getJobForProfile,
  listJobsNeedingDispatch,
  listJobsWithExpiredLease,
  recoverInterruptedJob,
  type BackgroundJobKind,
} from '../server/jobs/jobs.ts';
import { writeConsumerHeartbeat } from '../server/jobs/heartbeat.ts';

/** The workflow the tests use when they need work that succeeds. */
const HEALTH_CHECK = 'health-check' as BackgroundJobKind;

/**
 * A workflow that fails without touching anything outside this machine.
 *
 * The job description is too short, so the task refuses it immediately. That
 * is a real failure of a real task — the same refusal a candidate would get
 * for a one-word advertisement — and it costs nothing to produce.
 */
const TARGETED_CV = 'generate-targeted-cv' as BackgroundJobKind;

let owner: TestUser;
const createdJobIds: string[] = [];

/** The queue the tests publish to. */
let queue: LocalJobQueue;

/** What the worker published, so a test can look at it. */
const published: Array<{ message: JobQueueMessage; delaySeconds?: number }> = [];

/** The worker the consumer is given. */
const worker: WorkerContext = {
  consumerId: 'test-worker',
  leaseSeconds: 60,
  publish: async (message, options) => {
    published.push({ message, delaySeconds: options?.delaySeconds });
    await queue.send(message, options);
    return message.id;
  },
};

/** A delivery of a message, with the acknowledgements recorded. */
function delivery(message: JobQueueMessage) {
  const record = { acked: 0, retried: 0 };
  return {
    record,
    delivery: {
      body: message,
      ack: async () => {
        record.acked += 1;
      },
      retry: async () => {
        record.retried += 1;
      },
    },
  };
}

/** Creates a job row the way the API does, and returns it. */
async function makeJob(
  kind: BackgroundJobKind,
  options: { sourceId?: string | null; attempt?: number; request?: Record<string, unknown> } = {},
): Promise<string> {
  const { job } = await createJob({
    profileId: owner.id,
    kind,
    taskId: kind,
    idempotencyKey: `queue-test-${kind}-${owner.id}-${Date.now()}-${Math.random()}`,
    sourceType: null,
    sourceId: options.sourceId ?? null,
    stage: 'queued',
    request: options.request ?? {},
  });
  createdJobIds.push(job.id);
  return job.id;
}

/** Reads a job row straight from the database. */
async function readJob(id: string): Promise<Record<string, any>> {
  const { data, error } = await admin.from('background_jobs').select('*').eq('id', id).maybeSingle();
  assert.equal(error, null, `could not read the job: ${error?.message}`);
  return (data ?? {}) as Record<string, any>;
}

before(async () => {
  owner = await createTestUser('queue');
  queue = new LocalJobQueue();
  setJobQueueProducer(queue);
});

after(async () => {
  setJobQueueProducer(null);
  for (const id of createdJobIds) {
    await admin.from('background_jobs').delete().eq('id', id);
  }
  await deleteTestUser(owner);
});

/* -------------------------------------------------------------------------- */
/* The transport                                                                */
/* -------------------------------------------------------------------------- */

describe('the queue transport', () => {
  test('a message carries the job and the attempt, and nothing else', async () => {
    queue.clear();
    published.length = 0;

    const messageId = await publishJobMessage('11111111-1111-4111-8111-111111111111', 3);

    const due = queue.takeDue();
    assert.equal(due.length, 1);
    assert.equal(due[0].jobId, '11111111-1111-4111-8111-111111111111');
    assert.equal(due[0].attempt, 3);
    assert.ok(due[0].id, 'the message must carry its own id');
    assert.equal(due[0].id, messageId);
    assert.deepEqual(
      Object.keys(due[0]).sort(),
      ['attempt', 'id', 'jobId'],
      'a message must not carry the job itself — the row does that',
    );
  });

  test('a message can be held back for a while', async () => {
    queue.clear();
    await queue.send({ id: 'a', jobId: 'b', attempt: 1 }, { delaySeconds: 60 });

    assert.equal(queue.takeDue().length, 0, 'a delayed message is not due yet');
    assert.equal(queue.size, 1, 'but it is still waiting');
    queue.clear();
  });

  test('with no queue at all, publishing is refused rather than silently lost', async () => {
    setJobQueueProducer(null);
    await assert.rejects(
      () => publishJobMessage('11111111-1111-4111-8111-111111111111', 1),
      (error: unknown) => error instanceof QueueNotConfiguredError,
    );
    setJobQueueProducer(queue);
  });
});

/* -------------------------------------------------------------------------- */
/* The consumer                                                                 */
/* -------------------------------------------------------------------------- */

describe('the consumer', () => {
  test('a message claims the job, does the work, and records the outcome', async () => {
    const jobId = await makeJob(HEALTH_CHECK, { request: { ping: 'hello' } });
    queue.clear();
    published.length = 0;

    const { delivery: d, record } = delivery({ id: 'm1', jobId, attempt: 1 });
    const outcome = await handleJobDelivery(d, worker);

    assert.equal(outcome, 'completed');
    assert.equal(record.acked, 1, 'a finished message must be acknowledged');
    assert.equal(record.retried, 0);

    const row = await readJob(jobId);
    assert.equal(row.status, 'completed');
    assert.equal(row.result?.ok, true);
    assert.equal(row.result?.ping, 'hello');
    assert.ok(row.started_at, 'the job must say when it started');
    assert.ok(row.completed_at, 'the job must say when it finished');
    assert.equal(row.error_code, null);
  });

  test('the same message delivered twice does the work once', async () => {
    const jobId = await makeJob(HEALTH_CHECK, { request: { ping: 'twice' } });
    queue.clear();

    const first = delivery({ id: 'm2', jobId, attempt: 1 });
    await handleJobDelivery(first.delivery, worker);
    const afterFirst = await readJob(jobId);

    // The queue may deliver the same message again — at-least-once delivery is
    // the guarantee. The second delivery must not run the work again.
    const second = delivery({ id: 'm2', jobId, attempt: 1 });
    const outcome = await handleJobDelivery(second.delivery, worker);

    assert.equal(outcome, 'skipped', 'a message for a job that is already finished must be skipped');
    assert.equal(second.record.acked, 1, 'it must still be acknowledged, or it would come back for ever');

    const afterSecond = await readJob(jobId);
    assert.equal(afterSecond.status, 'completed');
    assert.equal(
      afterSecond.started_at,
      afterFirst.started_at,
      'the work must not have been started a second time',
    );
  });

  test('a message for an attempt that has been superseded is skipped', async () => {
    const jobId = await makeJob(HEALTH_CHECK);
    queue.clear();

    // The row is on attempt 2; the message is for attempt 1. The message is a
    // leftover and must not revive the job.
    await admin
      .from('background_jobs')
      .update({ attempt: 2 })
      .eq('id', jobId);

    const { delivery: d, record } = delivery({ id: 'm-old', jobId, attempt: 1 });
    const outcome = await handleJobDelivery(d, worker);

    assert.equal(outcome, 'skipped');
    assert.equal(record.acked, 1);
    assert.equal((await readJob(jobId)).status, 'pending');
  });

  test('a failure is worth another attempt, and the attempt is bounded', async () => {
    const jobId = await makeJob(TARGETED_CV, {
      request: { jobDescription: 'too short', language: 'en' },
    });
    queue.clear();
    published.length = 0;

    const first = delivery({ id: 'f1', jobId, attempt: 1 });
    const firstOutcome = await handleJobDelivery(first.delivery, worker);

    assert.equal(firstOutcome, 'retry_scheduled');
    assert.equal(first.record.acked, 1, 'the failed attempt is acknowledged once its retry is queued');

    const afterFirst = await readJob(jobId);
    assert.equal(afterFirst.status, 'queued', 'the job must be waiting for its next attempt');
    assert.equal(afterFirst.attempt, 2);
    assert.ok(afterFirst.error_code, 'the failure must be recorded while the job waits');
    assert.equal(afterFirst.error_code, 'job_description_required');
    assert.ok(afterFirst.error_detail, 'the failure must carry a structured detail');
    assert.equal(
      afterFirst.dispatch_needed,
      false,
      'the retry is on the queue, so the job does not still need publishing',
    );
    assert.ok(afterFirst.dispatched_at, 'the moment the retry was published must be recorded');

    assert.equal(published.length, 1, 'a retry must be published');
    assert.equal(published[0].message.attempt, 2, 'the retry must ask for the next attempt');
    assert.ok(
      (published[0].delaySeconds ?? 0) > 0,
      'a retry must wait, so a failing provider is not hammered',
    );

    // The second attempt runs out of attempts.
    const second = delivery({ id: 'f2', jobId, attempt: 2 });
    const secondOutcome = await handleJobDelivery(second.delivery, worker);

    assert.equal(secondOutcome, 'failed');
    assert.equal(second.record.acked, 1);

    const afterSecond = await readJob(jobId);
    assert.equal(afterSecond.status, 'failed', 'the job must end, not retry for ever');
    assert.equal(afterSecond.attempt, 2);
    assert.ok(afterSecond.error_message, 'the candidate must be told what happened');
    assert.ok(afterSecond.completed_at);
  });

  test('a retry that could not be published is not lost', async () => {
    const jobId = await makeJob(TARGETED_CV, {
      request: { jobDescription: 'too short', language: 'en' },
    });
    queue.clear();
    published.length = 0;

    // A worker whose queue refuses the message.
    const failingWorker: WorkerContext = {
      ...worker,
      publish: async () => {
        throw new Error('the queue refused the message');
      },
    };

    const { delivery: d, record } = delivery({ id: 'p1', jobId, attempt: 1 });
    const outcome = await handleJobDelivery(d, failingWorker);

    assert.equal(outcome, 'retry_scheduled');
    assert.equal(
      record.retried,
      1,
      'the message must come back, because the retry was never handed to the queue',
    );

    const row = await readJob(jobId);
    assert.equal(row.status, 'queued', 'the job must still be waiting for its next attempt');
    assert.equal(row.attempt, 2);
    assert.equal(
      row.dispatch_needed,
      true,
      'the job must still be marked as needing a dispatch, or it would be stranded for ever',
    );
    assert.ok(row.scheduled_at, 'the job must be scheduled for another attempt');

    // The sweep publishes it once the wait is over. Moving the moment forward
    // is what the passage of time would do.
    await admin
      .from('background_jobs')
      .update({ scheduled_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', jobId);

    const due = await listJobsNeedingDispatch();
    assert.ok(
      due.some((job) => job.id === jobId),
      'a job whose publication failed must be found by the sweep',
    );
  });

  test('a failure is never recorded with a credential in it', () => {
    const redacted = redact('Authorization: Bearer sk_live_abcdef1234567890 and token=ghp_abcdefghijklmnop');
    assert.ok(!redacted.includes('abcdef1234567890'), 'the token must not survive');
    assert.ok(!redacted.includes('abcdefghijklmnop'), 'the second token must not survive');
    assert.ok(redacted.includes('[redacted]'));
  });

  test("one candidate's work on one record does not overlap itself", async () => {
    // The record the two jobs are about. `source_id` is a uuid.
    const sourceId = '11111111-2222-4333-8444-555555555555';
    const firstJob = await makeJob(HEALTH_CHECK, { sourceId });
    const secondJob = await makeJob(HEALTH_CHECK, { sourceId });
    queue.clear();
    published.length = 0;

    // The first job is running.
    await admin
      .from('background_jobs')
      .update({ status: 'processing', locked_by: 'someone-else', locked_at: new Date().toISOString() })
      .eq('id', firstJob);

    const { delivery: d, record } = delivery({ id: 'b1', jobId: secondJob, attempt: 1 });
    const outcome = await handleJobDelivery(d, worker);

    assert.equal(outcome, 'deferred', 'the second job must wait for the first one');
    assert.equal(record.acked, 1);
    assert.equal(published.length, 1, 'the job must be handed back to the queue');
    assert.ok((published[0].delaySeconds ?? 0) > 0, 'and it must wait before trying again');
    assert.equal(published[0].message.jobId, secondJob);

    const row = await readJob(secondJob);
    assert.equal(row.status, 'queued');
  });

  test('a cancelled job is not claimed', async () => {
    const jobId = await makeJob(HEALTH_CHECK);
    queue.clear();

    await admin
      .from('background_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', jobId);

    const { delivery: d, record } = delivery({ id: 'c1', jobId, attempt: 1 });
    const outcome = await handleJobDelivery(d, worker);

    assert.equal(outcome, 'skipped');
    assert.equal(record.acked, 1);
    assert.equal((await readJob(jobId)).status, 'cancelled', 'the cancellation must stand');
  });

  test('a message that is not one of ours is discarded rather than retried for ever', async () => {
    const { delivery: d, record } = delivery({ nonsense: true } as unknown as JobQueueMessage);
    const outcome = await handleJobDelivery(d, worker);

    assert.equal(outcome, 'malformed');
    assert.equal(record.acked, 1);
    assert.equal(record.retried, 0);
  });
});

/* -------------------------------------------------------------------------- */
/* Recovery                                                                     */
/* -------------------------------------------------------------------------- */

describe('recovering a job whose worker died', () => {
  test('a job whose lease has run out is handed back to the queue', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    await admin
      .from('background_jobs')
      .update({
        status: 'processing',
        locked_by: 'worker-that-died',
        locked_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        lease_expires_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      })
      .eq('id', jobId);

    const expired = await listJobsWithExpiredLease();
    assert.ok(
      expired.some((job) => job.id === jobId),
      'the interrupted job must be found',
    );

    const recovered = await recoverInterruptedJob(jobId);
    assert.equal(recovered, true);

    const row = await readJob(jobId);
    assert.equal(row.status, 'pending', 'the job must be waiting again');
    assert.equal(row.locked_by, null, 'the dead worker must not hold it any more');
    assert.equal(row.dispatch_needed, true, 'and it must be marked as still to be published');
    assert.equal(row.recovery_attempts, 1);
  });

  test('a job that is given up on after too many interruptions is failed with a reason', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    await admin
      .from('background_jobs')
      .update({
        status: 'processing',
        locked_by: 'worker-that-died',
        lease_expires_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      })
      .eq('id', jobId);

    const recovered = await recoverInterruptedJob(jobId, 1);
    assert.equal(recovered, false, 'the job must not be handed back for ever');

    const row = await readJob(jobId);
    assert.equal(row.status, 'failed');
    assert.equal(row.error_code, 'worker_interrupted');
    assert.ok(row.error_message);
  });

  test('a job that still needs publishing is found by the sweep', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    const due = await listJobsNeedingDispatch();
    assert.ok(
      due.some((job) => job.id === jobId),
      'a job that has never been published must be waiting for the sweep',
    );
    assert.ok(due.every((job) => job.status === 'pending' || job.status === 'queued'));
  });
});

/* -------------------------------------------------------------------------- */
/* What a client may and may not do                                              */
/* -------------------------------------------------------------------------- */

describe('the database rules', () => {
  test('a client cannot read another candidate\'s job', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    const { data, error } = await anon
      .from('background_jobs')
      .select('id')
      .eq('id', jobId)
      .maybeSingle();

    assert.ok(error || !data, 'the job must not be readable by a client');
  });

  test('a client cannot claim a job', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    const { error } = await anon.rpc('claim_background_job', {
      p_job_id: jobId,
      p_attempt: 1,
      p_consumer_id: 'a-client',
      p_stage: 'claiming',
      p_lease_seconds: 60,
    });

    assert.ok(error, 'claiming a job must not be something a client can do');
  });

  test('a client cannot complete or fail a job', async () => {
    const jobId = await makeJob(HEALTH_CHECK);

    const complete = await anon.rpc('complete_background_job', {
      p_job_id: jobId,
      p_consumer_id: 'a-client',
      p_result: { ok: true },
      p_stage: 'done',
    });
    assert.ok(complete.error, 'finishing a job must not be something a client can do');

    const fail = await anon.rpc('fail_background_job', {
      p_job_id: jobId,
      p_consumer_id: 'a-client',
      p_error_code: 'made_up',
      p_error_message: 'made up',
      p_error_detail: {},
      p_max_attempts: 2,
      p_backoff_seconds: 10,
    });
    assert.ok(fail.error, 'failing a job must not be something a client can do');
  });

  test('the job row is read back for the candidate who owns it', async () => {
    const jobId = await makeJob(HEALTH_CHECK);
    const job = await getJobForProfile(owner.id, jobId);
    assert.ok(job, 'the owner must be able to read their own job');
    assert.equal(job!.id, jobId);
  });
});

/* -------------------------------------------------------------------------- */
/* The API, with a queue behind it                                              */
/* -------------------------------------------------------------------------- */

describe('the API, with a queue configured', () => {
  let server: { baseUrl: string; stop: () => Promise<void> } | null = null;
  let baseUrl = '';

  /** The consumer the heartbeat below speaks for. */
  const TEST_CONSUMER_ID = 'queue-test-consumer';

  before(async () => {
    const port = await findFreePort();
    // The queue is installed but the runner is not started: the test watches
    // what the API publishes without the work being carried out underneath it.
    server = await startServer({
      port,
      env: { CAREERDEV_LOCAL_JOB_QUEUE: '1', CAREERDEV_LOCAL_JOB_RUNNER: '0' },
    });
    baseUrl = server.baseUrl;

    // The API refuses new work when it has evidence that no worker is picking
    // it up — and that evidence is the heartbeat. This one says that a worker
    // is alive, which is the precondition for the rest of this block.
    await writeConsumerHeartbeat(TEST_CONSUMER_ID, 'local-test', { kind: 'test' });
  });

  after(async () => {
    await admin.from('background_job_consumers').delete().eq('consumer_id', TEST_CONSUMER_ID);
    await server?.stop();
  });

  test('a job is accepted, and its message is recorded against it', async () => {
    const started = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'match-jobs', query: 'queue-publish-probe', location: 'Remote' },
      baseUrl,
    });

    assert.equal(started.status, 202, 'the job must be accepted when there is a queue');
    assert.equal(started.body?.deduplicated, false);

    const jobId = started.body?.job?.id as string;
    assert.ok(jobId);
    createdJobIds.push(jobId);

    const row = await readJob(jobId);
    assert.equal(row.status, 'queued', 'the job must be waiting in the queue');
    assert.ok(row.run_id, 'the message id must be recorded against the job');
    assert.equal(row.dispatch_needed, false, 'the job must not still be waiting to be published');
    assert.ok(row.dispatched_at, 'the moment it was published must be recorded');
  });

  test('the same request twice is one job', async () => {
    const body = { kind: 'match-jobs', query: 'queue-idempotency-probe', location: 'Remote' };

    const first = await api('POST', '/api/background-jobs', { token: owner.token, body, baseUrl });
    assert.equal(first.status, 202);
    const jobId = first.body?.job?.id as string;
    createdJobIds.push(jobId);

    const second = await api('POST', '/api/background-jobs', { token: owner.token, body, baseUrl });
    assert.equal(second.status, 200);
    assert.equal(second.body?.deduplicated, true);
    assert.equal(second.body?.job?.id, jobId, 'the second submit must be the same job');
  });

  test('a job that belongs to somebody else is not found', async () => {
    const other = await createTestUser('queue-other');
    try {
      const { data: otherCv, error: cvError } = await admin
        .from('cvs')
        .insert({ profile_id: other.id, name: 'Not yours' })
        .select('id')
        .single();
      assert.equal(cvError, null, `could not set up the other candidate's CV: ${cvError?.message}`);
      assert.ok(otherCv?.id);

      const started = await api('POST', '/api/background-jobs', {
        token: owner.token,
        body: { kind: 'process-cv', sourceId: otherCv!.id },
        baseUrl,
      });

      assert.equal(started.status, 404, 'a record of another candidate must not be reachable');
    } finally {
      await deleteTestUser(other);
    }
  });
});
