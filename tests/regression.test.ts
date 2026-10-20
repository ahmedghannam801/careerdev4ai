// Regression tests for the B.3.8 findings that were fixed in B.3.9.
//
// C-1: the aggregate POST /api/state used to DELETE every one of the caller's
//      `experiences` and `educations` rows and re-insert whatever the payload
//      contained. Combined with the frontend's demo-seeded initial profile and
//      its unconditional auto-sync, that replaced a real user's employment and
//      education history with the demo persona.
//
// C-2: GET /api/profile/public/:username returned a private user's profile to
//      an unauthenticated caller, ignoring `profiles.is_public`.
//
// These are the tests that would have caught both bugs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  apiAnonymous,
  readExperienceRows,
  readEducationRows,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

/**
 * The exact payload the frontend's demo-seeded profile produced. Before the
 * fix, POST /api/state applied this to the database.
 */
const DEMO_SEED_STATE = {
  profile: {
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@example.com',
    experiences: [
      {
        id: 'exp-1',
        role: 'Frontend Developer',
        company: 'Meridian Tech Labs',
        employmentType: 'Full-time',
        location: 'San Francisco, CA / Hybrid',
        startDate: '2024-03-01',
        endDate: '',
        isCurrent: true,
        description: 'Design, develop, and maintain high-volume customer-facing React components.',
        achievements: ['Spearheaded 25+ reusable design system components.'],
        skillsUsed: ['React', 'TypeScript'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of Texas at Austin',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        startDate: '2018-09-01',
        endDate: '2022-05-15',
        current: false,
        gpa: '3.8/4.0',
      },
    ],
  },
  targetRole: { title: 'Frontend Engineer' },
  settings: { theme: 'system', language: 'en' },
};

before(async () => {
  user = await createTestUser('c1regression');
});

after(async () => {
  await deleteTestUser(user);
});

describe('C-1 regression: the aggregate endpoint cannot replace real user data', () => {
  test('a real experience survives a POST /api/state with the demo seed payload', async () => {
    // A real row, as it would exist for a user who had entered their history.
    await admin.from('experiences').insert({
      user_id: user.id,
      company: 'REAL COMPANY',
      job_title: 'Real Role',
      is_current: true,
    });

    const res = await api('POST', '/api/state', {
      token: user.token,
      body: DEMO_SEED_STATE,
    });
    assert.equal(res.status, 200, 'the compatibility endpoint still answers');

    // The real row must still be there, unchanged.
    const rows = await readExperienceRows(user.id);
    assert.equal(rows.length, 1, 'the real experience row must not be replaced');
    assert.equal(rows[0].company, 'REAL COMPANY');
    assert.equal(rows[0].job_title, 'Real Role');

    // The demo seed must NOT have been written.
    assert.ok(
      !rows.some((row) => row.company === 'Meridian Tech Labs'),
      'the demo seed must never be written to the database'
    );
  });

  test('a real education survives a POST /api/state with the demo seed payload', async () => {
    await admin.from('educations').insert({
      user_id: user.id,
      institution: 'REAL UNIVERSITY',
      is_current: false,
    });

    const res = await api('POST', '/api/state', {
      token: user.token,
      body: DEMO_SEED_STATE,
    });
    assert.equal(res.status, 200);

    const rows = await readEducationRows(user.id);
    assert.equal(rows.length, 1, 'the real education row must not be replaced');
    assert.equal(rows[0].institution, 'REAL UNIVERSITY');
    assert.ok(
      !rows.some((row) => row.institution === 'University of Texas at Austin'),
      'the demo seed must never be written to the database'
    );
  });

  test('the aggregate endpoint reports the collections it did not apply', async () => {
    const res = await api('POST', '/api/state', {
      token: user.token,
      body: DEMO_SEED_STATE,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.deprecated, true, 'the endpoint is marked deprecated');
    const unmapped = res.body?.unmappedCollections ?? [];
    assert.ok(
      unmapped.includes('experiences'),
      'the experiences collection must be reported as not applied'
    );
    assert.ok(
      unmapped.includes('education'),
      'the education collection must be reported as not applied'
    );
  });

  test('the dedicated experience and education endpoints are the real write path', async () => {
    const created = await api('POST', '/api/experiences', {
      token: user.token,
      body: {
        role: 'Staff Engineer',
        company: 'Dedicated Endpoint Co',
        employmentType: 'Full-time',
        location: 'Remote',
        startDate: '2022-01-01',
        isCurrent: true,
        description: 'Owned by /api/experiences',
        achievements: ['Did the thing.'],
      },
    });
    assert.equal(created.status, 201);
    const experienceId = created.body?.experience?.id;
    assert.ok(experienceId, 'the created experience must have a real id');

    const education = await api('POST', '/api/educations', {
      token: user.token,
      body: {
        institution: 'Dedicated Endpoint University',
        degree: 'BSc',
        field: 'Computer Science',
        startDate: '2016-09-01',
        endDate: '2020-06-01',
        gpa: '3.9',
      },
    });
    assert.equal(education.status, 201);
    const educationId = education.body?.education?.id;
    assert.ok(educationId, 'the created education must have a real id');

    // Both are now readable through their own endpoints...
    const list = await api('GET', '/api/experiences', { token: user.token });
    assert.equal(list.status, 200);
    assert.ok(
      (list.body?.experiences ?? []).some((e: any) => e.id === experienceId),
      'the experience must be listed by the dedicated endpoint'
    );
    assert.equal(
      (list.body?.experiences ?? []).find((e: any) => e.id === experienceId)?.company,
      'Dedicated Endpoint Co'
    );

    const eduList = await api('GET', '/api/educations', { token: user.token });
    assert.equal(eduList.status, 200);
    assert.ok(
      (eduList.body?.educations ?? []).some((e: any) => e.id === educationId),
      'the education must be listed by the dedicated endpoint'
    );

    // ...and the aggregate endpoint still cannot remove them.
    await api('POST', '/api/state', { token: user.token, body: DEMO_SEED_STATE });
    const rows = await readExperienceRows(user.id);
    assert.ok(
      rows.some((row) => row.id === experienceId),
      'the aggregate endpoint must not delete a dedicated experience'
    );
    const eduRows = await readEducationRows(user.id);
    assert.ok(
      eduRows.some((row) => row.id === educationId),
      'the aggregate endpoint must not delete a dedicated education'
    );

    // Clean up the rows this test created.
    await api('DELETE', `/api/experiences/${experienceId}`, { token: user.token });
    await api('DELETE', `/api/educations/${educationId}`, { token: user.token });
  });

  test('another user cannot read or write the experience of user A', async () => {
    const other = await createTestUser('c1other');
    try {
      const created = await api('POST', '/api/experiences', {
        token: user.token,
        body: { role: 'Owner', company: 'Owner Co' },
      });
      assert.equal(created.status, 201);
      const id = created.body?.experience?.id;

      const read = await api('GET', `/api/experiences/${id}`, { token: other.token });
      assert.equal(read.status, 404, "B must not read A's experience");

      const patched = await api('PATCH', `/api/experiences/${id}`, {
        token: other.token,
        body: { company: 'HIJACKED' },
      });
      assert.equal(patched.status, 404, "B must not update A's experience");

      const deleted = await api('DELETE', `/api/experiences/${id}`, { token: other.token });
      assert.equal(deleted.status, 404, "B must not delete A's experience");

      const rows = await readExperienceRows(user.id);
      assert.ok(rows.some((row) => row.id === id), "A's experience must be intact");

      await api('DELETE', `/api/experiences/${id}`, { token: user.token });
    } finally {
      await deleteTestUser(other);
    }
  });
});

describe('C-2 regression: the public profile endpoint honours is_public', () => {
  test('a private profile is not returned to an unauthenticated caller', async () => {
    const username = `private${Date.now()}`;
    await admin
      .from('profiles')
      .update({ is_public: false, username })
      .eq('id', user.id);

    const res = await apiAnonymous('GET', `/api/profile/public/${username}`);
    assert.equal(res.status, 404, 'a private profile must not be public');
    assert.ok(
      !JSON.stringify(res.body ?? {}).includes('REAL COMPANY'),
      'the private profile must not leak its employment history'
    );
  });

  test('a public profile IS returned to an unauthenticated caller', async () => {
    const username = `public${Date.now()}`;
    await admin
      .from('profiles')
      .update({ is_public: true, username, full_name: 'Public Person' })
      .eq('id', user.id);

    const res = await apiAnonymous('GET', `/api/profile/public/${username}`);
    assert.equal(res.status, 200, 'a public profile must be readable');
    assert.equal(res.body?.profile?.name, 'Public Person');
  });

  test('an authenticated user cannot bypass a private profile', async () => {
    const username = `private2${Date.now()}`;
    await admin
      .from('profiles')
      .update({ is_public: false, username })
      .eq('id', user.id);

    // Even a valid, authenticated request must not see the private profile.
    const res = await api('GET', `/api/profile/public/${username}`, { token: user.token });
    assert.equal(res.status, 404, 'authentication must not bypass the privacy gate');
  });

  test('a private profile exposes no employment history', async () => {
    const username = `private3${Date.now()}`;
    await admin
      .from('profiles')
      .update({ is_public: false, username, bio: 'my private bio' })
      .eq('id', user.id);
    await admin.from('experiences').insert({
      user_id: user.id,
      company: 'SECRET COMPANY',
      job_title: 'Secret Role',
      is_current: true,
    });

    const res = await apiAnonymous('GET', `/api/profile/public/${username}`);
    assert.equal(res.status, 404);
    const serialized = JSON.stringify(res.body ?? {});
    assert.ok(!serialized.includes('SECRET COMPANY'), 'no employment history may leak');
    assert.ok(!serialized.includes('my private bio'), 'no bio may leak');
  });
});
