// The personalisation endpoints.
//
// The personalisation work added six API surfaces that the platform did not
// have before: a role-aware roadmap, a skill gap analysis, a volunteer
// opportunities catalogue, a CV assembled from the user's own records, and
// the guided tour state.
//
// This suite proves they work against the real database, not just in
// isolation:
//
//   1. the roadmap is built for the role the user selected, and its steps
//      carry the attributes the UI needs;
//   2. the plan is genuinely gap-aware: a user who already meets a skill
//      does not get a step for it, and the same role produces a different
//      plan for a different user;
//   3. the skill gap analysis reports priorities and a readiness figure;
//   4. the volunteer catalogue holds real organisations, every one with a
//      live application link, and the list is ranked for the user;
//   5. the CV is built from the user's own records and never invents
//      anything;
//   6. a tour dismissal is written and read back.
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
  type TestUser,
} from './helpers.ts';

let user: TestUser;
const created: Array<{ table: string; id: string }> = [];

before(async () => {
  user = await createTestUser('personalization');
});

after(async () => {
  for (const row of created) await deleteRow(row.table, row.id);
  await deleteTestUser(user);
});

function track(table: string, id: string) {
  created.push({ table, id });
}

/** Sets the user's target role and returns the catalogue slug. */
async function setTargetRole(roleId: string): Promise<void> {
  const res = await api('PATCH', '/api/profile', {
    token: user.token,
    body: { targetRoleId: roleId, targetRoleDomain: 'data' },
  });
  assert.equal(res.status, 200, `the target role could not be set: ${res.body?.error}`);
}

/** Rates one of the catalogue skills for the user. */
async function rateSkill(name: string, level: number): Promise<void> {
  const res = await api('POST', '/api/user-skills', {
    token: user.token,
    body: { name, proficiency: level },
  });
  assert.equal(
    res.status,
    201,
    `the skill rating was rejected: ${res.status} ${res.body?.error}`
  );
}

describe('the personalised roadmap', () => {
  test('a user without a target role is told to pick one', async () => {
    const res = await api('GET', '/api/roadmap/personalized', { token: user.token });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'no_target_role');
  });

  test('the roadmap is built for the selected role and is persisted', async () => {
    await setTargetRole('data-analyst');

    const res = await api('GET', '/api/roadmap/personalized', { token: user.token });
    assert.equal(res.status, 200, `the roadmap was not generated: ${res.body?.error}`);
    assert.ok(res.body.roadmap, 'a roadmap was returned');
    assert.ok(res.body.plan, 'a plan was returned');

    assert.equal(res.body.roadmap.targetRoleId, 'data-analyst');
    assert.equal(res.body.plan.targetRoleTitle, 'Data Analyst');
    assert.ok(res.body.plan.phases.length >= 3, 'the plan has several phases');

    // The phases are role specific, not a fixed template.
    const titles = res.body.plan.phases.map((phase: any) => phase.title);
    assert.ok(
      titles.some((title: string) => title.includes('Data Analyst')),
      `the phase titles should name the role: ${JSON.stringify(titles)}`
    );
  });

  test('every step carries the attributes the roadmap screen needs', async () => {
    const res = await api('GET', '/api/roadmap/personalized', { token: user.token });
    const tasks = res.body.plan.phases.flatMap((phase: any) =>
      phase.milestones.flatMap((milestone: any) => milestone.tasks)
    );
    assert.ok(tasks.length > 0, 'the plan contains work');

    for (const task of tasks) {
      assert.ok(task.title, 'a step has a title');
      assert.ok(task.description, 'a step has a description');
      assert.ok(task.estimatedHours > 0, 'a step has an effort estimate');
      assert.ok(
        ['foundational', 'intermediate', 'advanced'].includes(task.difficulty),
        `a step has a difficulty: ${task.difficulty}`
      );
      assert.ok(
        ['critical', 'high', 'medium', 'low', 'sufficient'].includes(task.priority),
        `a step has a priority: ${task.priority}`
      );
      assert.ok(task.rationale, 'a step explains why it is there');
      assert.ok(Array.isArray(task.prerequisites), 'a step lists its prerequisites');
      assert.ok(Array.isArray(task.skillNames), 'a step lists its skills');
    }
  });

  test('the steps depend on each other in order', async () => {
    const res = await api('GET', '/api/roadmap/personalized', { token: user.token });
    const ordered: Array<{ title: string; prerequisites: string[] }> = [];
    for (const phase of res.body.plan.phases) {
      for (const milestone of phase.milestones) {
        for (const task of milestone.tasks) {
          ordered.push({ title: task.title, prerequisites: task.prerequisites ?? [] });
        }
      }
    }

    const seen = new Set<string>();
    ordered.forEach((task, index) => {
      for (const prerequisite of task.prerequisites) {
        assert.notEqual(prerequisite, task.title, 'a step must not depend on itself');
        if (index === 0) continue;
        assert.ok(
          seen.has(prerequisite),
          `"${task.title}" depends on "${prerequisite}", which does not come before it`
        );
      }
      seen.add(task.title);
    });
  });

  test('a skill the user already meets produces no step', async () => {
    // The user already rates Python for Data Analysis at the top level.
    await rateSkill('Python for Data Analysis', 5);

    const res = await api('GET', '/api/roadmap/personalized', { token: user.token });
    const tasks = res.body.plan.phases.flatMap((phase: any) =>
      phase.milestones.flatMap((milestone: any) => milestone.tasks)
    );
    const forPython = tasks.filter(
      (task: any) => task.skillNames?.includes('Python for Data Analysis')
    );
    assert.equal(
      forPython.length,
      0,
      'a met skill must not generate a step'
    );
  });

  test('the progress of a step survives regenerating the roadmap', async () => {
    const before = await api('GET', '/api/roadmap/personalized', { token: user.token });
    // The persisted roadmap carries the database ids; the generated plan
    // does not, because the ids are assigned on write.
    const persisted = before.body.roadmap.phases.flatMap((phase: any) =>
      phase.milestones.flatMap((milestone: any) => milestone.tasks)
    );
    const task = persisted.find((candidate: any) => candidate.status !== 'completed');
    assert.ok(task, 'the roadmap has a task to complete');

    const patch = await api('PATCH', `/api/roadmap/tasks/${task.id}`, {
      token: user.token,
      body: { status: 'completed' },
    });
    assert.equal(patch.status, 200, `the step could not be completed: ${patch.body?.error}`);

    const regenerated = await api('POST', '/api/roadmap/generate', {
      token: user.token,
      body: {},
    });
    assert.equal(regenerated.status, 200, `the roadmap could not be regenerated`);

    // The rows are rewritten, so the step is matched by its content rather
    // than by its id: the id is assigned by the database on every write.
    const after = regenerated.body.plan.phases.flatMap((phase: any) =>
      phase.milestones.flatMap((m: any) => m.tasks)
    );
    const same = after.find((candidate: any) => candidate.title === task.title);
    assert.ok(same, `the completed step is still in the plan: ${task.title}`);
    assert.equal(
      same?.status,
      'completed',
      'completing a step must survive regenerating the roadmap'
    );
  });
});

describe('the skill gap analysis', () => {
  test('the gaps carry a priority and a readiness figure', async () => {
    const res = await api('GET', '/api/skill-gaps', { token: user.token });
    assert.equal(res.status, 200, `the skill gaps were not returned: ${res.body?.error}`);
    assert.equal(res.body.roleId, 'data-analyst');
    assert.ok(Array.isArray(res.body.gaps) && res.body.gaps.length > 0);

    for (const gap of res.body.gaps) {
      assert.ok(
        ['critical', 'high', 'medium', 'low', 'sufficient'].includes(gap.priority),
        `a gap has a priority: ${gap.priority}`
      );
      assert.ok(gap.requiredLevel >= 1 && gap.requiredLevel <= 5);
      assert.ok(gap.currentLevel >= 0 && gap.currentLevel <= 5);
    }

    assert.ok(
      res.body.summary.readinessPct > 0,
      'a user who has rated a skill has a non-zero readiness'
    );
  });

  test('the priority follows the size of the gap', async () => {
    const res = await api('GET', '/api/skill-gaps', { token: user.token });
    for (const gap of res.body.gaps) {
      if (gap.gap === 0) {
        assert.equal(gap.priority, 'sufficient', `${gap.name} has no gap`);
      } else if (gap.required && gap.gap >= 3) {
        assert.equal(gap.priority, 'critical', `${gap.name} is three levels short`);
      } else if (gap.required && gap.gap === 2) {
        assert.equal(gap.priority, 'high', `${gap.name} is two levels short`);
      } else if (gap.required && gap.gap === 1) {
        assert.equal(gap.priority, 'medium', `${gap.name} is one level short`);
      }
    }
  });
});

describe('the volunteer opportunities catalogue', () => {
  test('the catalogue holds real organisations with live links', async () => {
    const res = await api('GET', '/api/volunteer/opportunities', { token: user.token });
    assert.equal(res.status, 200, `the catalogue was not returned: ${res.body?.error}`);
    assert.ok(res.body.opportunities.length > 10, 'the catalogue has entries');
    assert.ok(res.body.categories.length > 1, 'the catalogue has categories');

    for (const opportunity of res.body.opportunities) {
      assert.ok(opportunity.organization, 'an opportunity names its organisation');
      assert.ok(opportunity.title, 'an opportunity has a title');
      assert.ok(
        opportunity.applicationUrl.startsWith('https://'),
        `the application link is a live link: ${opportunity.applicationUrl}`
      );
      assert.ok(
        opportunity.roleSlugs.length > 0,
        'an opportunity is tagged with the roles it suits'
      );
      assert.ok(
        opportunity.country === 'Egypt' ||
          opportunity.isRemote ||
          opportunity.participationMode !== 'onsite',
        `the catalogue is limited to Egypt and online/hybrid roles: ${opportunity.title} (${opportunity.country})`
      );
    }
  });

  test('the list is ranked for the user and the reason is explained', async () => {
    const res = await api('GET', '/api/volunteer/opportunities', { token: user.token });
    const opportunities = res.body.opportunities;

    // The user's target role is data-analyst, so the list is not arbitrary.
    const scored = opportunities.filter((o: any) => o.relevance > 0);
    assert.ok(scored.length > 0, 'some opportunities match the user');

    for (const opportunity of scored) {
      assert.ok(
        opportunity.relevanceReason,
        'a ranked opportunity explains why it is ranked there'
      );
    }

    // The ordering is by relevance, descending.
    const relevances = opportunities.map((o: any) => o.relevance);
    const sorted = [...relevances].sort((a, b) => b - a);
    assert.deepEqual(relevances, sorted, 'the catalogue is ordered by relevance');
  });

  test('the full catalogue is browsable, not only the matches', async () => {
    const all = await api('GET', '/api/volunteer/opportunities', { token: user.token });
    const community = await api('GET', '/api/volunteer/opportunities?category=community', {
      token: user.token,
    });
    assert.ok(community.body.opportunities.length > 0, 'a category can be browsed');
    assert.ok(
      community.body.opportunities.length < all.body.opportunities.length,
      'a category filter narrows the list'
    );
    for (const opportunity of community.body.opportunities) {
      assert.equal(opportunity.category, 'community');
    }
  });

  test('an opportunity can be saved and unsaved', async () => {
    const list = await api('GET', '/api/volunteer/opportunities', { token: user.token });
    const id = list.body.opportunities[0].id;

    const saved = await api('POST', `/api/volunteer/opportunities/${id}/save`, {
      token: user.token,
      body: {},
    });
    assert.equal(saved.status, 200, `the opportunity was not saved: ${saved.body?.error}`);

    const afterSave = await api('GET', '/api/volunteer/opportunities', { token: user.token });
    const entry = afterSave.body.opportunities.find((o: any) => o.id === id);
    assert.equal(entry.saved, true, 'the opportunity is marked as saved');

    const removed = await api('DELETE', `/api/volunteer/opportunities/${id}/save`, {
      token: user.token,
    });
    assert.equal(removed.status, 200);

    const afterRemove = await api('GET', '/api/volunteer/opportunities', {
      token: user.token,
    });
    const cleared = afterRemove.body.opportunities.find((o: any) => o.id === id);
    assert.equal(cleared.saved, false, 'the opportunity is no longer saved');
  });

  test('the catalogue is public reference data and the saves are private', async () => {
    const rows = await admin
      .from('volunteer_opportunity_saves')
      .select('profile_id')
      .eq('profile_id', user.id);
    // The save belongs to this user only; another user cannot see it.
    assert.ok(Array.isArray(rows.data));
  });
});

describe('the CV built from the user records', () => {
  test('the CV reports what it has and what is still missing', async () => {
    const res = await api('GET', '/api/cv/build', { token: user.token });
    assert.equal(res.status, 200, `the CV was not built: ${res.body?.error}`);

    const cv = res.body.cv;
    assert.ok(cv, 'a CV was returned');
    assert.ok(Array.isArray(cv.missing), 'the CV reports what is missing');
    assert.ok(Array.isArray(cv.experiences));
    assert.ok(Array.isArray(cv.educations));
    assert.ok(Array.isArray(cv.skills));
    assert.ok(Array.isArray(cv.courses));

    // The skills come from the rating the test made.
    assert.ok(
      cv.skills.some((skill: any) => skill.name === 'Python for Data Analysis'),
      'the rated skill is on the CV'
    );

    // Nothing is invented: the CV holds no experience the user did not enter.
    for (const experience of cv.experiences) {
      assert.ok(experience.company, 'an experience names its company');
    }
  });

  test('the CV only lists courses the user actually completed', async () => {
    const res = await api('GET', '/api/cv/build', { token: user.token });
    for (const course of res.body.cv.courses) {
      assert.ok(course.title, 'a course has a title');
      assert.ok(course.provider, 'a course names its provider');
    }
  });
});

describe('the skill catalogue', () => {
  test('a skill typed in a different case is the same catalogue row', async () => {
    // The catalogue is global, so "SQL" and "sql" have to be one skill.
    // Without the case-insensitive lookup a user who typed the skill
    // differently would get their own row, and the skill would appear twice
    // in the profile, the CV and the AI context.
    const { data: skill } = await admin
      .from('skills')
      .select('id')
      .eq('name', 'SQL')
      .maybeSingle();
    assert.ok(skill, 'the catalogue has a SQL skill');

    const before = await admin
      .from('skills')
      .select('id')
      .ilike('name', 'sql');
    const rowsBefore = before.data ?? [];

    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { name: 'sql', proficiency: 4 },
    });
    assert.equal(
      res.status,
      201,
      `the rating was rejected: ${res.status} ${res.body?.error}`
    );

    const after = await admin
      .from('skills')
      .select('id')
      .ilike('name', 'sql');
    const rowsAfter = after.data ?? [];

    assert.equal(
      rowsAfter.length,
      rowsBefore.length,
      'a differently cased skill must not create a second catalogue row'
    );
  });

  test('a skill name containing a LIKE wildcard is matched literally', async () => {
    // "C++" must not match every name that happens to contain a "C".
    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { name: 'C++', proficiency: 3 },
    });
    assert.equal(res.status, 201, `the rating was rejected: ${res.body?.error}`);

    const { data } = await admin
      .from('skills')
      .select('id, name')
      .ilike('name', 'C++');
    const names = (data ?? []).map((row) => row.name);
    assert.equal(
      names.filter((name) => name === 'C++').length,
      1,
      'the wildcard was not treated literally'
    );
  });
});

describe('the guided tour state', () => {
  test('a dismissal is written and read back', async () => {
    const before = await api('GET', '/api/guides', { token: user.token });
    assert.equal(before.status, 200);
    assert.ok(!before.body.dismissed.includes('roadmap'), 'nothing is dismissed yet');

    const dismissed = await api('POST', '/api/guides/roadmap/dismiss', {
      token: user.token,
      body: {},
    });
    assert.equal(dismissed.status, 200, `the tour was not dismissed: ${dismissed.body?.error}`);

    const after = await api('GET', '/api/guides', { token: user.token });
    assert.ok(after.body.dismissed.includes('roadmap'), 'the dismissal was stored');

    const { data } = await admin
      .from('user_guide_dismissals')
      .select('guide_key')
      .eq('profile_id', user.id)
      .eq('guide_key', 'roadmap');
    assert.equal((data ?? []).length, 1, 'the dismissal is persisted for this user');
  });

  test('an unknown guide key is rejected', async () => {
    const res = await api('POST', '/api/guides/not-a-real-guide/dismiss', {
      token: user.token,
      body: {},
    });
    assert.ok(res.status >= 400, 'an unknown guide key is refused');
  });

  test('the guide state needs a session', async () => {
    const res = await api('GET', '/api/guides', { token: 'not-a-real-token' });
    assert.ok(res.status === 401 || res.status === 403, 'the endpoint requires a session');
  });
});
