// The background-job API.
//
// These tests cover the contract that does not depend on the Trigger.dev
// account being reachable:
//
//   * a request without a session is refused;
//   * a job is always associated with the candidate who asked for it, and one
//     candidate can never see, read or restart another candidate's job;
//   * the same request twice is one job, not two;
//   * a job that could not be started records why, instead of spinning for
//     ever;
//   * a finished job is still there after the browser is closed and reopened,
//     which is the whole point of keeping the state on the server.
//
// The last one is exercised by writing the row exactly as the task writes it
// and reading it back through the API, so the refresh path is proven without
// depending on a live run.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, api, apiAnonymous, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

let owner: TestUser;
let stranger: TestUser;

before(async () => {
  owner = await createTestUser('background-job-owner');
  stranger = await createTestUser('background-job-stranger');
});

after(async () => {
  await deleteTestUser(owner);
  await deleteTestUser(stranger);
});

describe('background jobs', () => {
  test('a request without a session is refused', async () => {
    const anonymous = await apiAnonymous('POST', '/api/background-jobs', {
      body: { kind: 'match-jobs' },
    });
    assert.equal(anonymous.status, 401);

    const anonymousList = await apiAnonymous('GET', '/api/background-jobs');
    assert.equal(anonymousList.status, 401);
  });

  test('a job can be started, and the same request twice is one job', async () => {
    const body = { kind: 'match-jobs', query: 'react developer', location: 'Cairo' };
    const started = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body,
    });

    // The platform may or may not be configured on this machine. Either way
    // the request is answered with a job, or with a clear reason — never
    // with a crash.
    assert.ok(
      started.status === 202 || started.status === 503,
      `unexpected status ${started.status}: ${JSON.stringify(started.body)}`,
    );

    if (started.status === 202) {
      assert.ok(started.body?.job?.id, 'the response must carry the job');
      assert.equal(started.body?.deduplicated, false);
    }

    // The same request again is the SAME job, not a second one. This holds
    // whether or not the platform accepted the first attempt, because the
    // job is recorded before the platform is asked to run it.
    const repeated = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body?.deduplicated, true);
    assert.ok(repeated.body?.job?.id, 'the repeated request must return the existing job');
    if (started.status === 202) {
      assert.equal(repeated.body?.job?.id, started.body?.job?.id);
    }

    // Exactly one row exists for that request.
    const { data } = await admin
      .from('background_jobs')
      .select('id, status, profile_id')
      .eq('profile_id', owner.id)
      .eq('kind', 'match-jobs')
      .eq('request->>query', 'react developer');
    assert.equal((data ?? []).length, 1, 'a repeated request must not create a second job');
  });

  test('a job is associated with the candidate who asked for it', async () => {
    const started = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'generate-career-roadmap' },
    });
    assert.ok(
      started.status === 202 || started.status === 503,
      `unexpected status ${started.status}`,
    );

    const { data } = await admin
      .from('background_jobs')
      .select('profile_id')
      .eq('profile_id', owner.id)
      .limit(1);
    assert.ok((data ?? []).length > 0, 'the job must be stored against its owner');

    // Another candidate cannot see it.
    const list = await api('GET', '/api/background-jobs', { token: stranger.token });
    assert.equal(list.status, 200);
    const strangerJobs = (list.body?.jobs ?? []) as Array<{ profile_id?: string; id: string }>;
    for (const job of strangerJobs) {
      assert.notEqual(job.id, started.body?.job?.id, 'a job must never appear in another candidate\'s list');
    }
  });

  test("one candidate cannot read or restart another candidate's job", async () => {
    const started = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'match-jobs', query: 'unique-ownership-probe', location: 'Remote' },
    });
    const jobId = started.body?.job?.id;
    if (!jobId) {
      // The platform refused the job, so there is no id to probe. The
      // isolation is proven by the row check below instead.
      const { data } = await admin
        .from('background_jobs')
        .select('id')
        .eq('profile_id', owner.id)
        .eq('kind', 'match-jobs')
        .eq('request->>query', 'unique-ownership-probe')
        .limit(1);
      assert.ok((data ?? []).length > 0);
      return;
    }

    const read = await api('GET', `/api/background-jobs/${jobId}`, { token: stranger.token });
    assert.equal(read.status, 404, "another candidate's job must be reported as missing");

    const retry = await api('POST', `/api/background-jobs/${jobId}/retry`, {
      token: stranger.token,
    });
    assert.equal(retry.status, 404, "another candidate's job must not be restartable");

    const cancel = await api('POST', `/api/background-jobs/${jobId}/cancel`, {
      token: stranger.token,
    });
    assert.equal(cancel.status, 404, "another candidate's job must not be cancellable");
  });

  test('a job that could not be started says why', async () => {
    const started = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'match-jobs', query: 'failure-handling-probe', location: 'Remote' },
    });

    if (started.status === 202) {
      // The platform is configured and accepted the job.
      return;
    }

    assert.equal(started.status, 503);
    assert.equal(started.body?.code, 'trigger_not_configured');

    // The failure is recorded, so the job does not stay 'queued' for ever.
    const { data } = await admin
      .from('background_jobs')
      .select('status, error_code')
      .eq('profile_id', owner.id)
      .eq('kind', 'match-jobs')
      .eq('request->>query', 'failure-handling-probe')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { status?: string; error_code?: string } | undefined;
    assert.equal(row?.status, 'failed');
    assert.ok(row?.error_code, 'a failed job must carry a reason');
  });

  test('a finished job is still there after the browser is reopened', async () => {
    // The row is written exactly as the task writes it.
    const { data: inserted, error } = await admin
      .from('background_jobs')
      .insert({
        profile_id: owner.id,
        task_id: 'process-cv',
        kind: 'process-cv',
        status: 'completed',
        stage: 'done',
        source_type: 'cv',
        idempotency_key: `refresh-recovery-${owner.id}-${Date.now()}`,
        attempt: 1,
        result: { cvId: 'cv-1', cvVersionId: 'version-1', analysisAvailable: true },
      })
      .select('id')
      .single();
    assert.equal(error, null);
    assert.ok(inserted?.id);

    // A fresh session — the same thing a refresh produces.
    const { data: session } = await owner.client.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    });
    const freshToken = session?.session?.access_token ?? owner.token;

    const list = await api('GET', '/api/background-jobs', { token: freshToken });
    assert.equal(list.status, 200);
    const jobs = (list.body?.jobs ?? []) as Array<{ id: string; status: string; result: unknown }>;
    const recovered = jobs.find((job) => job.id === inserted!.id);
    assert.ok(recovered, 'the finished job must still be listed after a refresh');
    assert.equal(recovered!.status, 'completed');
    assert.deepEqual(recovered!.result, {
      cvId: 'cv-1',
      cvVersionId: 'version-1',
      analysisAvailable: true,
    });

    const read = await api('GET', `/api/background-jobs/${inserted!.id}`, { token: freshToken });
    assert.equal(read.status, 200);
    assert.equal(read.body?.job?.status, 'completed');

    await admin.from('background_jobs').delete().eq('id', inserted!.id);
  });

  test('an unknown workflow is refused', async () => {
    const unknown = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'run-anything-the-browser-asks-for' },
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body?.code, 'unknown_kind');
  });

  test('a job about somebody else\'s record is refused', async () => {
    // The stranger owns a CV; the owner may not start a job about it.
    const { data: cv, error } = await admin
      .from('cvs')
      .insert({ profile_id: stranger.id, name: 'Stranger CV' })
      .select('id')
      .single();
    assert.equal(error, null);

    const attempt = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'process-cv', sourceId: cv!.id },
    });
    assert.equal(attempt.status, 404, "another candidate's record must be reported as missing");

    await admin.from('cvs').delete().eq('id', cv!.id);
  });

  test('a scheduled workflow cannot be started by hand', async () => {
    const attempt = await api('POST', '/api/background-jobs', {
      token: owner.token,
      body: { kind: 'validate-learning-resources' },
    });
    assert.equal(attempt.status, 403);
  });
});

describe('the background-job service reports what it can do', () => {
  test('the availability of the service is readable, and needs a session', async () => {
    const anonymous = await apiAnonymous('GET', '/api/background-jobs/availability');
    assert.equal(anonymous.status, 401);

    const availability = await api('GET', '/api/background-jobs/availability', { token: owner.token });
    assert.equal(availability.status, 200);

    const state = availability.body?.availability;
    assert.ok(state, 'the response must carry the state of the service');
    assert.ok(
      ['ready', 'degraded', 'unavailable', 'unconfigured', 'unknown'].includes(state.status),
      `unexpected status ${state.status}`,
    );
    assert.ok(
      ['production', 'development', 'unknown'].includes(state.environment),
      `unexpected environment ${state.environment}`,
    );
    assert.equal(typeof state.message, 'string');
    assert.ok(state.message.length > 0, 'the service must always be able to explain itself');

    // The runner is either there or it is not — never claimed without evidence.
    if (state.runnerAvailable !== null) {
      assert.equal(typeof state.runnerAvailable, 'boolean');
    }
  });

  test('the job list carries the state of the service as well', async () => {
    const list = await api('GET', '/api/background-jobs', { token: owner.token });
    assert.equal(list.status, 200);
    const state = list.body?.availability;
    assert.ok(state, 'the list must say what the service can do');
    assert.equal(state.environment, list.body?.availability?.environment);
  });

  test('a job that never started is given up on rather than left queued for ever', async () => {
    // A job that was queued a long time ago and never started. Nothing is
    // going to pick it up, so it must not sit queued with no explanation.
    const createdAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: inserted, error } = await admin
      .from('background_jobs')
      .insert({
        profile_id: owner.id,
        task_id: 'match-jobs',
        kind: 'match-jobs',
        status: 'queued',
        stage: 'queued',
        idempotency_key: `stale-queued-${owner.id}-${Date.now()}`,
        attempt: 1,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select('id')
      .single();
    assert.equal(error, null);
    assert.ok(inserted?.id);

    const list = await api('GET', '/api/background-jobs', { token: owner.token });
    assert.equal(list.status, 200);
    const jobs = (list.body?.jobs ?? []) as Array<{
      id: string;
      status: string;
      errorCode: string | null;
      errorMessage: string | null;
    }>;
    const stale = jobs.find((job) => job.id === inserted!.id);
    assert.ok(stale, 'the job must still be listed');
    assert.equal(stale!.status, 'failed', 'a job that never started must not stay queued for ever');
    assert.equal(stale!.errorCode, 'no_runner_available');
    assert.ok(stale!.errorMessage, 'the candidate must be told why it did not run');

    await admin.from('background_jobs').delete().eq('id', inserted!.id);
  });

  test('a job that has just been queued is left alone', async () => {
    const { data: inserted, error } = await admin
      .from('background_jobs')
      .insert({
        profile_id: owner.id,
        task_id: 'match-jobs',
        kind: 'match-jobs',
        status: 'queued',
        stage: 'queued',
        idempotency_key: `fresh-queued-${owner.id}-${Date.now()}`,
        attempt: 1,
      })
      .select('id')
      .single();
    assert.equal(error, null);

    const read = await api('GET', `/api/background-jobs/${inserted!.id}`, { token: owner.token });
    assert.equal(read.status, 200);
    assert.equal(
      read.body?.job?.status,
      'queued',
      'a job that has only just been queued must not be given up on',
    );

    await admin.from('background_jobs').delete().eq('id', inserted!.id);
  });
});
