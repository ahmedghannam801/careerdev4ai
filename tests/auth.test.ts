// Authentication, authorization and validation tests.
//
// Every route must reject an unauthenticated request (401) and an invalid
// token (401), and a user must never reach another user's record (404).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestUser, deleteTestUser, api, type TestUser } from './helpers.ts';

let userA: TestUser;
let userB: TestUser;

const PROTECTED_ROUTES: Array<[string, string]> = [
  ['GET', '/api/state'],
  ['GET', '/api/profile'],
  ['GET', '/api/roadmap'],
  ['GET', '/api/projects'],
  ['GET', '/api/evidence'],
  ['GET', '/api/certifications'],
  ['GET', '/api/languages'],
  ['GET', '/api/profile-links'],
  ['GET', '/api/career-identity'],
  ['GET', '/api/saved-roles'],
  ['GET', '/api/job-applications'],
  ['GET', '/api/interviews'],
  ['GET', '/api/cvs'],
  ['GET', '/api/cv-versions'],
  ['GET', '/api/activities'],
  ['GET', '/api/secondary-goals'],
  ['GET', '/api/career-milestones'],
  ['GET', '/api/cover-letters'],
];

before(async () => {
  userA = await createTestUser('a');
  userB = await createTestUser('b');
});

after(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

describe('authentication', () => {
  test('every protected route rejects an unauthenticated request with 401', async () => {
    for (const [method, path] of PROTECTED_ROUTES) {
      const res = await api(method, path);
      assert.equal(res.status, 401, `${method} ${path} should be 401 unauthenticated`);
    }
  });

  test('every protected route rejects an invalid token with 401', async () => {
    for (const [method, path] of PROTECTED_ROUTES) {
      const res = await api(method, path, { token: 'not.a.real.jwt' });
      assert.equal(res.status, 401, `${method} ${path} should be 401 with a bad token`);
    }
  });

  test('a valid token is accepted', async () => {
    const res = await api('GET', '/api/profile', { token: userA.token });
    assert.equal(res.status, 200);
    assert.equal(res.body?.profile?.id, userA.id);
  });
});

describe('validation', () => {
  test('a malformed UUID is rejected with 400, not 500', async () => {
    for (const path of [
      '/api/cvs/not-a-uuid',
      '/api/projects/not-a-uuid',
      '/api/evidence/not-a-uuid',
      '/api/interviews/not-a-uuid',
      '/api/job-applications/not-a-uuid',
    ]) {
      const res = await api('GET', path, { token: userA.token });
      assert.equal(res.status, 400, `${path} should be 400`);
    }
  });

  test('an invalid enum value is rejected with 400', async () => {
    const cases: Array<[string, unknown]> = [
      ['/api/projects', { title: 'x', difficulty: 'NOPE' }],
      ['/api/evidence', { title: 'x', type: 'NOPE' }],
      ['/api/interviews', { question: 'q', type: 'NOPE' }],
      ['/api/job-applications', { company: 'c', role: 'r', stage: 'NOPE' }],
      ['/api/languages', { name: 'x', proficiency: 'NOPE' }],
      ['/api/activities', { actionType: 'NOPE', title: 'x' }],
    ];
    for (const [path, body] of cases) {
      const res = await api('POST', path, { token: userA.token, body });
      assert.equal(res.status, 400, `POST ${path} should be 400`);
    }
  });

  test('a missing required field is rejected with 400', async () => {
    for (const path of [
      '/api/cvs',
      '/api/projects',
      '/api/evidence',
      '/api/certifications',
      '/api/languages',
      '/api/profile-links',
      '/api/saved-roles',
      '/api/job-applications',
      '/api/interviews',
      '/api/activities',
    ]) {
      const res = await api('POST', path, { token: userA.token, body: {} });
      assert.equal(res.status, 400, `POST ${path} should be 400`);
    }
  });
});

describe('IDOR protection', () => {
  test('user B cannot read user A records', async () => {
    const created = await api('POST', '/api/projects', {
      token: userA.token,
      body: { title: 'A secret project', goal: 'g', description: 'd' },
    });
    assert.equal(created.status, 201);
    const id = created.body?.project?.id;

    const read = await api('GET', `/api/projects/${id}`, { token: userB.token });
    assert.equal(read.status, 404, 'B must not read A project');

    const list = await api('GET', '/api/projects', { token: userB.token });
    const ids = (list.body?.projects ?? []).map((p: any) => p.id);
    assert.ok(!ids.includes(id), "A's project must not appear in B's list");

    const patched = await api('PATCH', `/api/projects/${id}`, {
      token: userB.token,
      body: { title: 'HIJACK' },
    });
    assert.equal(patched.status, 404, 'B must not update A project');

    const deleted = await api('DELETE', `/api/projects/${id}`, { token: userB.token });
    assert.equal(deleted.status, 404, 'B must not delete A project');
  });

  test("a client-supplied user id does not change ownership", async () => {
    const res = await api('POST', '/api/projects', {
      token: userA.token,
      body: { title: 'ownership test', goal: 'g', description: 'd', userId: userB.id, profileId: userB.id },
    });
    assert.equal(res.status, 201);
    const list = await api('GET', '/api/projects', { token: userB.token });
    const ids = (list.body?.projects ?? []).map((p: any) => p.id);
    assert.ok(!ids.includes(res.body?.project?.id), 'the record must belong to A, not B');
  });
});
