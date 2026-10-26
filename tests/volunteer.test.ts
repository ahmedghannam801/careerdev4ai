// The volunteer experience domain.
//
// A volunteer stint is its own domain: an organisation, a role, a duration,
// responsibilities, achievements, the skills it gave the user, and the
// EXISTING projects that evidence it.
//
// This suite proves that:
//   1. a stint round-trips through the API and is persisted;
//   2. it is genuinely separate from employment — it never lands in the
//      employment timeline the CV builder reads;
//   3. the link to a project works in BOTH directions;
//   4. ownership is enforced: another user can neither read nor change it,
//      and a stint can never be attached to somebody else's project;
//   5. the write boundary rejects malformed input.
//
// Every row created here is removed by explicit id in the `after` hooks.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTestUser,
  deleteTestUser,
  deleteRow,
  admin,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';

let userA: TestUser;
let userB: TestUser;
const created: Array<{ table: string; id: string }> = [];

before(async () => {
  userA = await createTestUser('volunteer');
  userB = await createTestUser('volunteerother');
});

after(async () => {
  for (const row of created) await deleteRow(row.table, row.id);
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

function track(table: string, id: string) {
  created.push({ table, id });
}

/** Creates a project owned by `user` and tracks it for cleanup. */
async function makeProject(user: TestUser, title: string): Promise<string> {
  const res = await api('POST', '/api/projects', {
    token: user.token,
    body: { title, goal: 'go', status: 'in_progress' },
  });
  assert.equal(res.status, 201, `the project could not be created: ${res.body?.error}`);
  track('projects', res.body.project.id);
  return res.body.project.id;
}

describe('the volunteer experience domain', () => {
  test('a stint round-trips through the API and is persisted', async () => {
    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: {
        organization: 'Red Crescent',
        role: 'Peer Mentor',
        location: 'Cairo, Egypt',
        startDate: '2025-01-15',
        endDate: '2025-06-30',
        description: 'Mentored students through the programme.',
        responsibilities: ['Ran weekly workshops', 'Tracked student progress'],
        achievements: ['Mentored 12 students'],
        skills: ['Facilitation', 'Mentoring'],
      },
    });
    assert.equal(createdRes.status, 201, `the stint could not be created: ${createdRes.body?.error}`);
    const entry = createdRes.body.volunteer;
    track('volunteer_experiences', entry.id);

    assert.equal(entry.organization, 'Red Crescent');
    assert.equal(entry.role, 'Peer Mentor');
    assert.equal(entry.location, 'Cairo, Egypt');
    assert.equal(entry.startDate, '2025-01-15');
    assert.equal(entry.endDate, '2025-06-30');
    assert.deepEqual(entry.responsibilities, ['Ran weekly workshops', 'Tracked student progress']);
    assert.deepEqual(entry.achievements, ['Mentored 12 students']);
    assert.deepEqual(entry.skills, ['Facilitation', 'Mentoring']);

    // The row is really in the database, with the arrays stored as arrays.
    const { data: rows } = await admin
      .from('volunteer_experiences')
      .select('*')
      .eq('id', entry.id)
      .maybeSingle();
    assert.ok(rows, 'the stint must be persisted');
    assert.equal(rows.organization, 'Red Crescent');
    assert.equal(rows.profile_id, userA.id);
    assert.deepEqual(rows.skills, ['Facilitation', 'Mentoring']);

    // And it is read back.
    const read = await api('GET', '/api/volunteer', { token: userA.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.volunteer.length, 1);
    assert.equal(read.body.volunteer[0].id, entry.id);

    const one = await api('GET', `/api/volunteer/${entry.id}`, { token: userA.token });
    assert.equal(one.status, 200);
    assert.equal(one.body.volunteer.role, 'Peer Mentor');
  });

  test('a stint is NOT written into the employment timeline', async () => {
    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Habitat for Humanity', role: 'Build Volunteer' },
    });
    assert.equal(createdRes.status, 201);
    track('volunteer_experiences', createdRes.body.volunteer.id);

    // The employment table the CV builder reads must stay untouched.
    const { data: experiences } = await admin
      .from('experiences')
      .select('id, company, job_title')
      .eq('user_id', userA.id);
    for (const row of experiences ?? []) {
      assert.notEqual(row.company, 'Habitat for Humanity');
      assert.notEqual(row.job_title, 'Build Volunteer');
    }

    // And the CV-facing experiences endpoint must not list it either.
    const list = await api('GET', '/api/experiences', { token: userA.token });
    assert.equal(list.status, 200);
    for (const row of list.body.experiences ?? []) {
      assert.notEqual(row.company, 'Habitat for Humanity');
    }
  });

  test('the stint is updated and deleted', async () => {
    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Green Peace', role: 'Field Assistant' },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);

    const patched = await api('PATCH', `/api/volunteer/${id}`, {
      token: userA.token,
      body: { role: 'Field Coordinator', skills: ['Data collection'] },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.volunteer.role, 'Field Coordinator');
    assert.deepEqual(patched.body.volunteer.skills, ['Data collection']);

    const removed = await api('DELETE', `/api/volunteer/${id}`, { token: userA.token });
    assert.equal(removed.status, 200);

    const read = await api('GET', `/api/volunteer/${id}`, { token: userA.token });
    assert.equal(read.status, 404, 'the stint must be gone');
  });
});

describe('the link between volunteering and projects', () => {
  test('a stint points at an existing project, in both directions', async () => {
    const projectId = await makeProject(userA, 'Community garden planner');

    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: {
        organization: 'Green Peace',
        role: 'Field Volunteer',
        projectIds: [projectId],
      },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);
    assert.deepEqual(createdRes.body.volunteer.projectIds, [projectId]);

    // The link row itself is persisted.
    const { data: links } = await admin
      .from('volunteer_projects')
      .select('volunteer_experience_id, project_id')
      .eq('volunteer_experience_id', id);
    assert.equal(links?.length, 1, 'the project link must be persisted');
    assert.equal(links?.[0]?.project_id, projectId);

    // Direction 1: the stint lists its projects.
    const read = await api('GET', `/api/volunteer/${id}`, { token: userA.token });
    assert.deepEqual(read.body.volunteer.projectIds, [projectId]);

    // Direction 2: the project lists the stints that evidence it.
    const forProject = await api('GET', `/api/projects/${projectId}/volunteer`, {
      token: userA.token,
    });
    assert.equal(forProject.status, 200);
    assert.equal(forProject.body.volunteer.length, 1);
    assert.equal(forProject.body.volunteer[0].id, id);
    assert.equal(forProject.body.volunteer[0].organization, 'Green Peace');
  });

  test('a stint cannot be attached to another user\'s project', async () => {
    const otherProjectId = await makeProject(userB, 'Someone else\'s project');

    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: {
        organization: 'Red Crescent',
        role: 'Mentor',
        projectIds: [otherProjectId],
      },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);

    // The link to a project the caller does not own is dropped, not written.
    assert.deepEqual(createdRes.body.volunteer.projectIds, []);
    const { data: links } = await admin
      .from('volunteer_projects')
      .select('project_id')
      .eq('volunteer_experience_id', id);
    assert.equal(links?.length ?? 0, 0, 'a link to another user\'s project must not be written');

    // And the project does not see the stint.
    const forProject = await api('GET', `/api/projects/${otherProjectId}/volunteer`, {
      token: userB.token,
    });
    assert.equal(forProject.status, 200);
    assert.equal(forProject.body.volunteer.length, 0);
  });

  test('the project link can be replaced', async () => {
    const first = await makeProject(userA, 'First project');
    const second = await makeProject(userA, 'Second project');

    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'UNICEF', role: 'Educator', projectIds: [first] },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);

    const patched = await api('PATCH', `/api/volunteer/${id}`, {
      token: userA.token,
      body: { projectIds: [second] },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual(patched.body.volunteer.projectIds, [second]);

    const { data: links } = await admin
      .from('volunteer_projects')
      .select('project_id')
      .eq('volunteer_experience_id', id);
    assert.equal(links?.length, 1);
    assert.equal(links?.[0]?.project_id, second);
  });
});

describe('volunteering ownership', () => {
  test('another user cannot read, change or delete a stint', async () => {
    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Private Org', role: 'Secret Role' },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);

    const read = await api('GET', `/api/volunteer/${id}`, { token: userB.token });
    assert.equal(read.status, 404, 'another user must not read the stint');

    const patched = await api('PATCH', `/api/volunteer/${id}`, {
      token: userB.token,
      body: { role: 'Hijacked' },
    });
    assert.equal(patched.status, 404, 'another user must not change the stint');

    const removed = await api('DELETE', `/api/volunteer/${id}`, { token: userB.token });
    assert.equal(removed.status, 404, 'another user must not delete the stint');

    // The stint is untouched.
    const owner = await api('GET', `/api/volunteer/${id}`, { token: userA.token });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.volunteer.role, 'Secret Role');
  });

  test('a links-only update cannot touch another user\'s project links', async () => {
    // The owner of the stint and the owner of the project are different
    // users: a PATCH that only carries projectIds must not delete the
    // owner's links, because the parent row itself is not updated.
    const projectId = await makeProject(userA, 'Owner project');
    const createdRes = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Links Org', role: 'Volunteer', projectIds: [projectId] },
    });
    assert.equal(createdRes.status, 201);
    const id = createdRes.body.volunteer.id;
    track('volunteer_experiences', id);

    await api('PATCH', `/api/volunteer/${id}`, {
      token: userB.token,
      body: { projectIds: [] },
    });

    const { data: links } = await admin
      .from('volunteer_projects')
      .select('project_id')
      .eq('volunteer_experience_id', id);
    assert.equal(links?.length, 1, "another user's update must not delete the owner's links");
  });

  test('the volunteer API requires a session', async () => {
    const list = await apiAnonymous('GET', '/api/volunteer');
    assert.equal(list.status, 401);

    const created = await apiAnonymous('POST', '/api/volunteer', {
      body: { organization: 'Nope', role: 'Nope' },
    });
    assert.equal(created.status, 401);
  });
});

describe('the volunteer write boundary', () => {
  test('an organisation and a role are required', async () => {
    const noOrg = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { role: 'Mentor' },
    });
    assert.equal(noOrg.status, 400);

    const noRole = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Org' },
    });
    assert.equal(noRole.status, 400);
  });

  test('a malformed date is rejected', async () => {
    const res = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: { organization: 'Org', role: 'Mentor', startDate: '15/01/2025' },
    });
    assert.equal(res.status, 400);
  });

  test('an end date before the start date is rejected', async () => {
    const res = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: {
        organization: 'Org',
        role: 'Mentor',
        startDate: '2025-06-01',
        endDate: '2025-01-01',
      },
    });
    assert.equal(res.status, 400);
  });

  test('a current stint cannot also have an end date', async () => {
    const res = await api('POST', '/api/volunteer', {
      token: userA.token,
      body: {
        organization: 'Org',
        role: 'Mentor',
        startDate: '2025-01-01',
        endDate: '2025-06-01',
        isCurrent: true,
      },
    });
    assert.equal(res.status, 400);
  });

  test('a malformed id is rejected', async () => {
    const res = await api('GET', '/api/volunteer/not-a-uuid', { token: userA.token });
    assert.equal(res.status, 400);
  });
});
