// Security hardening tests (B.3.9).
//
// These cover the security controls that B.3.9 added or that the B.3.8 audit
// marked as unverified:
//
//   * rate limiting on the Gemini-backed routes (P-1)
//   * the CORS allow-list (P-2)
//   * account deletion removes the user's Storage objects (M-2)
//   * the skills catalogue is readable by an authenticated client but NOT
//     writable by one (M-6)
//   * the legacy JSON auth surface is gone (M-3)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('security');
});

after(async () => {
  await deleteTestUser(user);
});

/** An anon-key client signed in as the given test user. */
async function signedInClient(target: TestUser) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({
    email: target.email,
    password: target.password,
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return client;
}

describe('rate limiting on the AI routes (P-1)', () => {
  test('the AI routes return 429 once the caller exceeds the budget', async () => {
    // The budget is 30 requests per minute, keyed on the verified user id.
    // These routes fail fast on a missing body, so a request is rejected
    // before it ever reaches Gemini.
    let sawTooMany = false;
    let lastStatus = 0;

    for (let i = 0; i < 40; i++) {
      const res = await api('POST', '/api/copilot', {
        token: user.token,
        body: { userPrompt: 'x' },
      });
      lastStatus = res.status;
      if (res.status === 429) {
        sawTooMany = true;
        break;
      }
    }

    assert.ok(
      sawTooMany,
      `the limiter must eventually answer 429 (last status ${lastStatus})`
    );
  });

  test('the limiter is keyed on the user, so another user is unaffected', async () => {
    const other = await createTestUser('ratelimitother');
    try {
      const res = await api('POST', '/api/copilot', {
        token: other.token,
        body: { userPrompt: 'x' },
      });
      assert.notEqual(
        res.status,
        429,
        "another user must not inherit the first user's exhausted budget"
      );
    } finally {
      await deleteTestUser(other);
    }
  });

  test('the AI routes still require authentication', async () => {
    const res = await api('POST', '/api/copilot', { body: { userPrompt: 'x' } });
    assert.equal(res.status, 401);
  });
});

describe('CORS (P-2)', () => {
  test('an unlisted origin receives no CORS headers', async () => {
    const res = await fetch(`${process.env.TEST_API_BASE_URL}/api/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(res.status, 200, 'the request itself still succeeds');
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      null,
      'an unlisted origin must not be allowed'
    );
  });

  test('a preflight request is answered without reaching a route handler', async () => {
    const res = await fetch(`${process.env.TEST_API_BASE_URL}/api/profile`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('a same-origin request is unaffected', async () => {
    const res = await fetch(`${process.env.TEST_API_BASE_URL}/api/health`);
    assert.equal(res.status, 200);
  });
});

describe('account deletion removes the Storage objects (M-2)', () => {
  test('deleting the account empties the CV bucket folder', async () => {
    const temp = await createTestUser('storagecascade');
    try {
      const path = `${temp.id}/to-be-deleted.txt`;
      const upload = await admin.storage
        .from('cv-files')
        .upload(path, Buffer.from('orphan me'), { contentType: 'text/plain' });
      assert.equal(upload.error, null, 'the fixture upload must succeed');

      const before = await admin.storage.from('cv-files').list(temp.id, { limit: 100 });
      assert.equal((before.data ?? []).length, 1, 'the fixture file must be there');

      const deleted = await api('POST', '/api/account/delete', { token: temp.token });
      assert.equal(deleted.status, 200, 'the account must be deleted');

      // Storage has no cascade, so the deletion must remove the folder itself.
      const after = await admin.storage.from('cv-files').list(temp.id, { limit: 100 });
      assert.equal(
        (after.data ?? []).length,
        0,
        'the storage object must not survive the account'
      );
    } finally {
      await deleteTestUser(temp);
    }
  });
});

describe('the skills catalogue (M-6)', () => {
  test('an authenticated client can READ the catalogue', async () => {
    const client = await signedInClient(user);

    // A catalogue row to read. It is created with the service-role client
    // and removed afterwards.
    const name = `ReadPolicyProbe${Date.now()}`;
    const inserted = await admin
      .from('skills')
      .insert({ name, category: 'technical' })
      .select('id')
      .single();
    assert.equal(inserted.error, null);

    try {
      const { data, error } = await client.from('skills').select('name').eq('name', name);
      assert.equal(error, null, 'an authenticated client must be able to read the catalogue');
      assert.equal((data ?? []).length, 1, 'the catalogue row must be visible');
    } finally {
      await admin.from('skills').delete().eq('id', inserted.data!.id);
    }
  });

  test('an authenticated client cannot WRITE to the catalogue', async () => {
    const client = await signedInClient(user);
    const write = await client
      .from('skills')
      .insert({ name: `ClientWrite${Date.now()}`, category: 'technical' });
    assert.ok(write.error, 'a client must not be able to write to the catalogue');
  });
});

describe('the legacy JSON auth surface is gone (M-3)', () => {
  test('the legacy auth routes no longer exist', async () => {
    for (const [method, path] of [
      ['POST', '/api/auth/register'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/logout'],
      ['GET', '/api/auth/me'],
    ] as Array<[string, string]>) {
      const res = await apiAnonymous(method, path, { body: { email: 'x@y.invalid' } });
      assert.equal(res.status, 404, `${method} ${path} must no longer exist`);
    }
  });
});

describe('the payload validation still holds', () => {
  test('a malformed id is rejected with 400, not 500', async () => {
    // The GET routes that address a single row by id.
    for (const path of [
      '/api/projects/not-a-uuid',
      '/api/experiences/not-a-uuid',
      '/api/educations/not-a-uuid',
    ]) {
      const res = await api('GET', path, { token: user.token });
      assert.equal(res.status, 400, `${path} should be 400`);
    }

    // The PATCH/DELETE routes that address a row by id.
    for (const path of [
      '/api/experiences/not-a-uuid',
      '/api/educations/not-a-uuid',
      '/api/user-skills/not-a-uuid',
      '/api/notifications/not-a-uuid',
    ]) {
      const deleted = await api('DELETE', path, { token: user.token });
      assert.equal(deleted.status, 400, `DELETE ${path} should be 400`);
    }

    const patched = await api('PATCH', '/api/notifications/not-a-uuid', {
      token: user.token,
    });
    assert.equal(patched.status, 400, 'PATCH /api/notifications/:id should be 400');

    const task = await api('PATCH', '/api/roadmap/tasks/not-a-uuid', {
      token: user.token,
      body: { status: 'completed' },
    });
    assert.equal(task.status, 400, 'PATCH /api/roadmap/tasks/:taskId should be 400');
  });

  test('an unknown API path answers 404 JSON, not the SPA fallback', async () => {
    const res = await api('GET', '/api/this-route-does-not-exist', {
      token: user.token,
    });
    assert.equal(res.status, 404, 'an unknown API path must be a 404');
    assert.equal(
      res.body?.error,
      'Not found',
      'the 404 must be JSON, not the SPA index.html'
    );
  });

  test('an oversized string is rejected', async () => {
    const res = await api('POST', '/api/projects', {
      token: user.token,
      body: { title: 'x'.repeat(5000), goal: 'g', description: 'd' },
    });
    assert.equal(res.status, 400, 'an over-long title must be rejected');
  });

  test('a missing required field is rejected', async () => {
    const res = await api('POST', '/api/experiences', {
      token: user.token,
      body: { company: 'No role' },
    });
    assert.equal(res.status, 400);

    const edu = await api('POST', '/api/educations', {
      token: user.token,
      body: { degree: 'No institution' },
    });
    assert.equal(edu.status, 400);
  });
});
