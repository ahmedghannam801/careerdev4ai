// Persistence across a fresh sign-in and a server restart.
//
// The server must be running for these tests. `npm test` starts it (see the
// "test" script in package.json) and the restart case is exercised by the
// dedicated `tests/restart.test.ts`, which is run against a server that is
// started and stopped by the harness.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestUser, deleteTestUser, deleteRow, api, type TestUser } from './helpers.ts';

let user: TestUser;
const created: Array<{ table: string; id: string }> = [];

before(async () => {
  user = await createTestUser('persist');
});

after(async () => {
  for (const row of created) await deleteRow(row.table, row.id);
  await deleteTestUser(user);
});

describe('persistence', () => {
  test('data written by one session is visible to a later session', async () => {
    const project = await api('POST', '/api/projects', {
      token: user.token,
      body: { title: 'Persisted project', goal: 'g', description: 'd' },
    });
    assert.equal(project.status, 201);
    created.push({ table: 'projects', id: project.body.project.id });

    // A brand-new sign-in (a different session token) must see the same data.
    const { data: session } = await (
      await import('./helpers.ts')
    ).anon.auth.signInWithPassword({ email: user.email, password: user.password });
    const freshToken = session?.session?.access_token;
    assert.ok(freshToken, 'a fresh session must be obtainable');

    const read = await api('GET', '/api/projects', { token: freshToken });
    assert.ok(
      (read.body?.projects ?? []).some((p: any) => p.id === project.body.project.id),
      'the project must survive a new session'
    );
  });

  test('the roadmap survives a new session', async () => {
    const roadmap = await api('POST', '/api/roadmap', {
      token: user.token,
      body: { title: 'Persisted roadmap', isEnrolled: true },
    });
    assert.equal(roadmap.status, 201);
    created.push({ table: 'roadmaps', id: roadmap.body.roadmap.id });

    const { data: session } = await (
      await import('./helpers.ts')
    ).anon.auth.signInWithPassword({ email: user.email, password: user.password });
    const freshToken = session?.session?.access_token;

    const read = await api('GET', '/api/roadmap', { token: freshToken });
    assert.equal(read.body?.roadmap?.title, 'Persisted roadmap');
    assert.equal(read.body?.roadmap?.isEnrolled, true);
  });

  test('the profile survives a new session', async () => {
    await api('PATCH', '/api/profile', {
      token: user.token,
      body: { fullName: 'Persisted Name' },
    });

    const { data: session } = await (
      await import('./helpers.ts')
    ).anon.auth.signInWithPassword({ email: user.email, password: user.password });
    const freshToken = session?.session?.access_token;

    const read = await api('GET', '/api/profile', { token: freshToken });
    assert.equal(read.body?.profile?.fullName, 'Persisted Name');
  });
});
