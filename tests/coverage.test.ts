// Coverage for the routes the other suites do not reach.
//
// These are the routes that were still uncovered after the B.3.9 expansion:
// the account-lifecycle endpoints, the username check, the roadmap enrolment
// and task-creation endpoints, the notifications read-all endpoint, and the
// authentication contract on the AI routes.
//
// The Gemini-backed routes (`/api/resumes/upload`, `/api/analyze-career`,
// `/api/optimize-cv`, `/api/mock-interview`, `/api/suggest-summary`,
// `/api/generate-cover-letter`) are covered for their AUTH contract and for
// their behaviour when the model is not configured. Because the suite has no
// Gemini key, it asserts that each route returns an explicit 503 and never
// substitutes invented content for a real model response.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('coverage');
});

after(async () => {
  await deleteTestUser(user);
});

describe('the account lifecycle endpoints', () => {
  test('change-password rejects a request without the current password', async () => {
    const res = await api('POST', '/api/account/change-password', {
      token: user.token,
      body: { newPassword: 'New-Probe1234Aa!' },
    });
    assert.equal(res.status, 400, 'the current password is required');
  });

  test('change-password rejects an incorrect current password', async () => {
    const res = await api('POST', '/api/account/change-password', {
      token: user.token,
      body: { currentPassword: 'Definitely-Wrong', newPassword: 'New-Probe1234Aa!' },
    });
    assert.equal(res.status, 400, 'a wrong current password must be rejected');
  });

  test('change-password changes the password and the old one stops working', async () => {
    const temp = await createTestUser('changepw');
    try {
      const newPassword = 'Changed-Probe1234Aa!';
      const res = await api('POST', '/api/account/change-password', {
        token: temp.token,
        body: { currentPassword: temp.password, newPassword },
      });
      assert.equal(res.status, 200, 'the password must be changed');

      // The old password no longer works; the new one does.
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const oldSignIn = await client.auth.signInWithPassword({
        email: temp.email,
        password: temp.password,
      });
      assert.ok(oldSignIn.error, 'the old password must be rejected');

      const newSignIn = await client.auth.signInWithPassword({
        email: temp.email,
        password: newPassword,
      });
      assert.equal(newSignIn.error, null, 'the new password must work');
    } finally {
      await deleteTestUser(temp);
    }
  });

  test('change-email rejects an invalid address', async () => {
    const res = await api('POST', '/api/account/change-email', {
      token: user.token,
      body: { newEmail: 'not-an-email' },
    });
    assert.equal(res.status, 400);
  });

  test('change-email requires the current password', async () => {
    const res = await api('POST', '/api/account/change-email', {
      token: user.token,
      body: { newEmail: 'new-address@example.com' },
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body?.error ?? ''), /password/i);
  });

  test('the account endpoints require authentication', async () => {
    for (const path of [
      '/api/account/change-password',
      '/api/account/change-email',
      '/api/account/delete',
    ]) {
      const res = await api('POST', path, { body: {} });
      assert.equal(res.status, 401, `${path} must require a session`);
    }
  });
});

describe('the username check', () => {
  test('an available username is reported as available', async () => {
    const res = await api('GET', '/api/profile/check-username?username=brandnewname123');
    assert.equal(res.status, 200);
    assert.equal(res.body?.available, true);
  });

  test('a taken username is reported as taken', async () => {
    const username = `taken${Date.now()}`;
    await admin.from('profiles').update({ username }).eq('id', user.id);

    const res = await api('GET', `/api/profile/check-username?username=${username}`);
    assert.equal(res.status, 200);
    assert.equal(res.body?.available, false, 'a taken username must be reported');
  });

  test('a missing username is rejected', async () => {
    const res = await api('GET', '/api/profile/check-username');
    assert.equal(res.status, 400);
  });
});

describe('the roadmap enrolment and task creation', () => {
  test('enrolling sets the is_enrolled flag and is persisted', async () => {
    const created = await api('POST', '/api/roadmap', {
      token: user.token,
      body: { title: 'Enrolment roadmap', isEnrolled: false, phases: [] },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body?.roadmap?.isEnrolled, false);

    const enrolled = await api('POST', '/api/roadmap/enroll', { token: user.token });
    assert.equal(enrolled.status, 200);
    assert.equal(enrolled.body?.roadmap?.isEnrolled, true);

    const { data } = await admin
      .from('roadmaps')
      .select('is_enrolled')
      .eq('profile_id', user.id)
      .single();
    assert.equal(data?.is_enrolled, true, 'the enrolment must be persisted');
  });

  test('enrolling without a roadmap answers 404', async () => {
    const empty = await createTestUser('noenrol');
    try {
      const res = await api('POST', '/api/roadmap/enroll', { token: empty.token });
      assert.equal(res.status, 404);
    } finally {
      await deleteTestUser(empty);
    }
  });

  test('a task can be added to a milestone and is persisted', async () => {
    const created = await api('POST', '/api/roadmap', {
      token: user.token,
      body: {
        title: 'Task creation roadmap',
        phases: [
          {
            phaseNumber: 1,
            title: 'Phase 1',
            milestones: [{ title: 'Milestone 1', tasks: [] }],
          },
        ],
      },
    });
    assert.equal(created.status, 201);
    const phase = created.body?.roadmap.phases[0];
    const milestone = phase.milestones[0];

    const added = await api(
      'POST',
      `/api/roadmap/phases/${phase.id}/milestones/${milestone.id}/tasks`,
      {
        token: user.token,
        body: { title: 'A newly added task', description: 'Added by the test' },
      }
    );
    assert.equal(added.status, 201);
    const taskId = added.body?.task?.id;
    assert.ok(taskId, 'the created task must have a real id');

    const { data } = await admin
      .from('roadmap_tasks')
      .select('title, milestone_id')
      .eq('id', taskId)
      .single();
    assert.equal(data?.title, 'A newly added task');
    assert.equal(data?.milestone_id, milestone.id);
  });

  test('a task cannot be added to another user\'s milestone', async () => {
    const other = await createTestUser('taskother');
    try {
      const created = await api('POST', '/api/roadmap', {
        token: user.token,
        body: {
          title: 'Owned roadmap',
          phases: [
            {
              phaseNumber: 1,
              title: 'Phase 1',
              milestones: [{ title: 'Milestone 1', tasks: [] }],
            },
          ],
        },
      });
      const phase = created.body?.roadmap.phases[0];
      const milestone = phase.milestones[0];

      const res = await api(
        'POST',
        `/api/roadmap/phases/${phase.id}/milestones/${milestone.id}/tasks`,
        { token: other.token, body: { title: 'Hijacked task' } }
      );
      assert.equal(res.status, 404, "B must not add a task to A's milestone");
    } finally {
      await deleteTestUser(other);
    }
  });

  test('a malformed phase or milestone id is rejected', async () => {
    const res = await api(
      'POST',
      '/api/roadmap/phases/not-a-uuid/milestones/not-a-uuid/tasks',
      { token: user.token, body: { title: 'x' } }
    );
    assert.equal(res.status, 400);
  });
});

describe('the notifications read-all endpoint', () => {
  test('every unread notification is marked read', async () => {
    await api('POST', '/api/notifications', {
      token: user.token,
      body: { title: 'Unread one', type: 'system' },
    });
    await api('POST', '/api/notifications', {
      token: user.token,
      body: { title: 'Unread two', type: 'system' },
    });

    const res = await api('POST', '/api/notifications/read-all', { token: user.token });
    assert.equal(res.status, 200);
    assert.ok(res.body?.marked >= 2, 'both notifications must be marked read');
    assert.ok(
      (res.body?.notifications ?? []).every((n: any) => n.read === true),
      'no notification may be left unread'
    );

    await api('DELETE', '/api/notifications', { token: user.token });
  });

  test('read-all requires authentication', async () => {
    const res = await api('POST', '/api/notifications/read-all');
    assert.equal(res.status, 401);
  });
});

describe('the AI routes reject an unauthenticated or malformed request', () => {
  test('every AI route requires a session', async () => {
    for (const path of [
      '/api/resumes/upload',
      '/api/analyze-career',
      '/api/optimize-cv',
      '/api/mock-interview',
      '/api/suggest-summary',
      '/api/generate-cover-letter',
    ]) {
      const res = await api('POST', path, { body: {} });
      assert.equal(res.status, 401, `${path} must require a session`);
    }
  });

  test('the AI routes fail honestly when no model is available', async (t) => {
    // These routes call Gemini with the application's key. In the test
    // environment there is no key, so every route must say that no result was
    // produced. Substituting invented analysis, scores or prose would be
    // indistinguishable from a real model response.
    if (process.env.GEMINI_API_KEY) {
      t.skip('GEMINI_API_KEY is configured; the no-model contract does not apply');
      return;
    }
    const fabricatedKeys = [
      'matchPercentage',
      'overallScore',
      'score',
      'suggestedSummary',
      'coverLetter',
    ];
    for (const path of [
      '/api/analyze-career',
      '/api/optimize-cv',
      '/api/mock-interview',
      '/api/suggest-summary',
      '/api/generate-cover-letter',
    ]) {
      const res = await api('POST', path, { token: user.token, body: {} });
      assert.equal(res.status, 503, `${path} must report the model as unavailable`);
      assert.equal(
        typeof res.body?.error,
        'string',
        `${path} must explain that no result was generated`
      );
      for (const key of fabricatedKeys) {
        assert.equal(res.body?.[key], undefined, `${path} must not fabricate ${key}`);
      }
      assert.equal(
        res.body?.details,
        undefined,
        'an internal error message must never be returned to the client'
      );
    }
  });
});
