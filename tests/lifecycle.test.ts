// Lifecycle persistence: a user's data must survive a logout/login cycle.
//
// The suite re-signed-in in `persistence.test.ts` but never signed OUT, so the
// logout path itself was untested. These tests sign out (the Supabase session
// is destroyed) and sign back in, then prove every persisted domain is still
// there — read from the database, not from any in-memory state.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  reauthenticate,
  signOut,
  readExperienceRows,
  readEducationRows,
  readUserSkillRows,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('lifecycle');
});

after(async () => {
  await deleteTestUser(user);
});

/**
 * A fresh access token for the test user.
 *
 * Signing out revokes the previous session's token, so every test starts by
 * obtaining a current one. Without this, a test that signs out would leave
 * the next test with a dead token.
 */
async function freshToken(): Promise<string> {
  return reauthenticate(user);
}

describe('logout / login persistence', () => {
  test('the profile survives a logout and login', async () => {
    const token = await freshToken();
    const patched = await api('PATCH', '/api/profile', {
      token,
      body: { fullName: 'Persisted Name', city: 'Cairo', country: 'Egypt' },
    });
    assert.equal(patched.status, 200);

    // Sign out for real, then sign back in with a brand-new session.
    await signOut(user);
    const afterLogin = await freshToken();

    const read = await api('GET', '/api/profile', { token: afterLogin });
    assert.equal(read.status, 200);
    assert.equal(read.body?.profile?.fullName, 'Persisted Name');
    assert.equal(read.body?.profile?.city, 'Cairo');
    assert.equal(read.body?.profile?.country, 'Egypt');
  });

  test('the experience and education survive a logout and login', async () => {
    const token = await freshToken();
    const experience = await api('POST', '/api/experiences', {
      token,
      body: { role: 'Persisted Role', company: 'Persisted Co', isCurrent: true },
    });
    assert.equal(experience.status, 201);
    const experienceId = experience.body?.experience?.id;

    const education = await api('POST', '/api/educations', {
      token,
      body: { institution: 'Persisted University', degree: 'BSc' },
    });
    assert.equal(education.status, 201);
    const educationId = education.body?.education?.id;

    await signOut(user);
    const afterLogin = await freshToken();

    const list = await api('GET', '/api/experiences', { token: afterLogin });
    assert.equal(list.status, 200);
    assert.ok(
      (list.body?.experiences ?? []).some((e: any) => e.id === experienceId),
      'the experience must survive the logout/login cycle'
    );

    const eduList = await api('GET', '/api/educations', { token: afterLogin });
    assert.equal(eduList.status, 200);
    assert.ok(
      (eduList.body?.educations ?? []).some((e: any) => e.id === educationId),
      'the education must survive the logout/login cycle'
    );

    // And the rows are really in the database.
    assert.equal((await readExperienceRows(user.id)).length, 1);
    assert.equal((await readEducationRows(user.id)).length, 1);
  });

  test('the skill level survives a logout and login', async () => {
    const token = await freshToken();
    const created = await api('POST', '/api/user-skills', {
      token,
      body: { name: 'LifecycleSkill', proficiency: 3, category: 'technical' },
    });
    assert.equal(created.status, 201);

    await signOut(user);
    const afterLogin = await freshToken();

    const res = await api('GET', '/api/user-skills', { token: afterLogin });
    assert.equal(res.status, 200);
    const stored = (res.body?.skills ?? []).find(
      (s: any) => s.skill?.name === 'LifecycleSkill'
    );
    assert.ok(stored, 'the skill must survive the logout/login cycle');
    assert.equal(stored.proficiency, 3);

    const rows = await readUserSkillRows(user.id);
    assert.ok(rows.some((row) => row.skill_id === stored.skill_id));
  });

  test('the roadmap survives a logout and login', async () => {
    const token = await freshToken();
    const created = await api('POST', '/api/roadmap', {
      token,
      body: {
        title: 'Lifecycle Roadmap',
        phases: [
          {
            phaseNumber: 1,
            title: 'Phase 1',
            milestones: [
              {
                title: 'Milestone 1',
                tasks: [{ title: 'Task 1', status: 'completed' }],
              },
            ],
          },
        ],
      },
    });
    assert.equal(created.status, 201);

    await signOut(user);
    const afterLogin = await freshToken();

    const read = await api('GET', '/api/roadmap', { token: afterLogin });
    assert.equal(read.status, 200);
    const roadmap = read.body?.roadmap;
    assert.ok(roadmap, 'the roadmap must survive the logout/login cycle');
    assert.equal(roadmap.title, 'Lifecycle Roadmap');
    assert.equal(roadmap.completedTasks, 1);
    assert.equal(roadmap.progressPercent, 100);
  });

  test('a project survives a logout and login', async () => {
    const token = await freshToken();
    const created = await api('POST', '/api/projects', {
      token,
      body: { title: 'Lifecycle Project', goal: 'g', description: 'd' },
    });
    assert.equal(created.status, 201);
    const id = created.body?.project?.id;

    await signOut(user);
    const afterLogin = await freshToken();

    const read = await api('GET', '/api/projects', { token: afterLogin });
    assert.equal(read.status, 200);
    assert.ok(
      (read.body?.projects ?? []).some((p: any) => p.id === id),
      'the project must survive the logout/login cycle'
    );
  });

  test('a new session issues a new token and the data is unchanged', async () => {
    const staleToken = await freshToken();
    await signOut(user);
    const fresh = await reauthenticate(user);
    assert.notEqual(staleToken, fresh, 'a new session must issue a new token');

    // The stale token is a Supabase access token; whether it is still valid
    // depends on Supabase's own expiry, so the assertion here is that the
    // fresh token works and the data is unchanged.
    const read = await api('GET', '/api/profile', { token: fresh });
    assert.equal(read.status, 200);
    assert.equal(read.body?.profile?.fullName, 'Persisted Name');

    const { count } = await admin
      .from('experiences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    assert.equal(count, 1);
  });
});
