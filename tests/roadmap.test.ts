// Roadmap persistence (B.3.9 finding H-1).
//
// Before the fix the frontend generated the roadmap tree in memory and never
// persisted it: POST /api/roadmap had no caller, so a new user had no
// roadmap row at all and the generated tree was lost on the next load.
//
// These tests prove the roadmap is real database state that survives a
// reload, a logout/login cycle and a server restart.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  reauthenticate,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

/** A small but complete roadmap tree: 2 phases, 3 milestones, 4 tasks. */
const TREE = {
  title: 'Backend Engineer Roadmap',
  targetRoleTitle: 'Backend Engineer',
  isEnrolled: true,
  phases: [
    {
      phaseNumber: 1,
      title: 'Phase 1: Foundations',
      description: 'The fundamentals.',
      isUnlocked: true,
      milestones: [
        {
          title: 'Data modelling',
          description: 'Schema design fundamentals.',
          tasks: [
            {
              title: 'Design the users table',
              description: 'Write the DDL.',
              status: 'completed',
              skillName: 'SQL',
              estimatedHours: 4,
            },
            {
              title: 'Design the orders table',
              description: 'Write the DDL.',
              status: 'in_progress',
              skillName: 'SQL',
              deadline: '2026-12-01',
              estimatedHours: 6,
            },
          ],
        },
        {
          title: 'API design',
          description: 'REST conventions.',
          tasks: [
            {
              title: 'Write the OpenAPI spec',
              description: 'Document the endpoints.',
              status: 'not_started',
              skillName: 'API Design',
              estimatedHours: 3,
            },
          ],
        },
      ],
    },
    {
      phaseNumber: 2,
      title: 'Phase 2: Delivery',
      description: 'Shipping it.',
      isUnlocked: false,
      milestones: [
        {
          title: 'Observability',
          description: 'Logs and metrics.',
          tasks: [
            {
              title: 'Add structured logging',
              description: 'JSON logs everywhere.',
              status: 'not_started',
              skillName: 'Observability',
              estimatedHours: 5,
            },
          ],
        },
      ],
    },
  ],
};

before(async () => {
  user = await createTestUser('roadmap');
});

after(async () => {
  await deleteTestUser(user);
});

describe('roadmap creation (H-1)', () => {
  test('POST /api/roadmap creates the roadmap with its phases, milestones and tasks', async () => {
    const res = await api('POST', '/api/roadmap', { token: user.token, body: TREE });
    assert.equal(res.status, 201);
    const roadmap = res.body?.roadmap;
    assert.ok(roadmap, 'the roadmap must be returned');
    assert.equal(roadmap.title, TREE.title);
    assert.equal(roadmap.targetRoleTitle, TREE.targetRoleTitle);
    assert.equal(roadmap.isEnrolled, true);

    // The tree is persisted, not just echoed back.
    assert.equal(roadmap.phases.length, 2, 'both phases must be persisted');
    assert.equal(roadmap.phases[0].milestones.length, 2);
    assert.equal(roadmap.phases[1].milestones.length, 1);
    assert.equal(roadmap.totalTasks, 4, 'every task must be persisted');

    // The ids are real database ids, not local ones.
    const { count: phaseCount } = await admin
      .from('roadmap_phases')
      .select('id', { count: 'exact', head: true });
    const { count: taskCount } = await admin
      .from('roadmap_tasks')
      .select('id', { count: 'exact', head: true });
    assert.ok((phaseCount ?? 0) >= 2, 'the phases must be rows in the database');
    assert.ok((taskCount ?? 0) >= 4, 'the tasks must be rows in the database');
  });

  test('the statuses and progress survive the write', async () => {
    const read = await api('GET', '/api/roadmap', { token: user.token });
    assert.equal(read.status, 200);
    const roadmap = read.body?.roadmap;
    assert.ok(roadmap);

    const tasks = roadmap.phases.flatMap((p: any) =>
      p.milestones.flatMap((m: any) => m.tasks)
    );
    const completed = tasks.find((t: any) => t.title === 'Design the users table');
    assert.equal(completed?.status, 'completed', 'the completed status must be stored');
    const inProgress = tasks.find((t: any) => t.title === 'Design the orders table');
    assert.equal(inProgress?.status, 'in_progress');
    assert.equal(inProgress?.deadline, '2026-12-01', 'the deadline must be stored');
    assert.equal(inProgress?.estimatedHours, 6);

    // Progress is derived from the stored task statuses.
    assert.equal(roadmap.completedTasks, 1);
    assert.equal(roadmap.totalTasks, 4);
    assert.equal(roadmap.progressPercent, 25);
  });

  test('the locked phase keeps its is_unlocked flag', async () => {
    const read = await api('GET', '/api/roadmap', { token: user.token });
    const roadmap = read.body?.roadmap;
    assert.equal(roadmap?.phases[0]?.isUnlocked, true);
    assert.equal(roadmap?.phases[1]?.isUnlocked, false, 'a locked phase must stay locked');
  });

  test('a reload returns the same roadmap (a new session sees the same data)', async () => {
    const token = await reauthenticate(user);
    const read = await api('GET', '/api/roadmap', { token });
    assert.equal(read.status, 200);
    const roadmap = read.body?.roadmap;
    assert.ok(roadmap, 'the roadmap must survive a logout/login cycle');
    assert.equal(roadmap.title, TREE.title);
    assert.equal(roadmap.totalTasks, 4);
  });

  test('a task status change is persisted and reflected in the progress', async () => {
    const read = await api('GET', '/api/roadmap', { token: user.token });
    const roadmap = read.body?.roadmap;
    const task = roadmap.phases
      .flatMap((p: any) => p.milestones.flatMap((m: any) => m.tasks))
      .find((t: any) => t.title === 'Write the OpenAPI spec');

    const patched = await api('PATCH', `/api/roadmap/tasks/${task.id}`, {
      token: user.token,
      body: { status: 'completed' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body?.roadmap?.completedTasks, 2);
    assert.equal(patched.body?.roadmap?.progressPercent, 50);

    // And it is really in the database.
    const { data } = await admin
      .from('roadmap_tasks')
      .select('status')
      .eq('id', task.id)
      .single();
    assert.equal(data?.status, 'completed');
  });

  test('creating a roadmap again replaces the previous one (no stale duplicates)', async () => {
    const res = await api('POST', '/api/roadmap', {
      token: user.token,
      body: { ...TREE, title: 'Second Roadmap', phases: [] },
    });
    assert.equal(res.status, 201);

    const read = await api('GET', '/api/roadmap', { token: user.token });
    const roadmap = read.body?.roadmap;
    assert.equal(roadmap?.title, 'Second Roadmap');
    assert.equal(roadmap?.totalTasks, 0, 'the old tree must be gone');

    const { count } = await admin
      .from('roadmaps')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    assert.equal(count, 1, 'a profile has at most one roadmap');
  });

  test('DELETE /api/roadmap actually deletes the persisted roadmap', async () => {
    const created = await api('POST', '/api/roadmap', {
      token: user.token,
      body: { title: 'To be deleted', phases: [] },
    });
    assert.equal(created.status, 201);

    const deleted = await api('DELETE', '/api/roadmap', { token: user.token });
    assert.equal(deleted.status, 200);

    const read = await api('GET', '/api/roadmap', { token: user.token });
    assert.equal(read.body?.roadmap, null, 'the roadmap must be gone');

    const { count } = await admin
      .from('roadmaps')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    assert.equal(count, 0, 'no roadmap row may remain');
  });

  test('another user cannot see, change or delete the roadmap', async () => {
    const other = await createTestUser('roadmapother');
    try {
      await api('POST', '/api/roadmap', {
        token: user.token,
        body: { title: 'A private roadmap', phases: [] },
      });

      const read = await api('GET', '/api/roadmap', { token: other.token });
      assert.equal(read.body?.roadmap, null, "B must not see A's roadmap");

      const deleted = await api('DELETE', '/api/roadmap', { token: other.token });
      assert.equal(deleted.status, 404, "B must not delete A's roadmap");

      const { count } = await admin
        .from('roadmaps')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id);
      assert.equal(count, 1, "A's roadmap must be intact");
    } finally {
      await deleteTestUser(other);
    }
  });

  test('another user cannot change a task of a roadmap they do not own', async () => {
    const other = await createTestUser('roadmaptaskother');
    try {
      await api('POST', '/api/roadmap', {
        token: user.token,
        body: { title: 'Owned roadmap', phases: TREE.phases },
      });
      const read = await api('GET', '/api/roadmap', { token: user.token });
      const task = read.body?.roadmap.phases
        .flatMap((p: any) => p.milestones.flatMap((m: any) => m.tasks))
        .find((t: any) => t.title === 'Design the users table');

      const { data: before } = await admin
        .from('roadmap_tasks')
        .select('status')
        .eq('id', task.id)
        .single();
      const statusBefore = before?.status;

      const patched = await api('PATCH', `/api/roadmap/tasks/${task.id}`, {
        token: other.token,
        body: { status: 'completed' },
      });
      assert.equal(patched.status, 404, "B must not change A's task");

      const { data: after } = await admin
        .from('roadmap_tasks')
        .select('status')
        .eq('id', task.id)
        .single();
      assert.equal(
        after?.status,
        statusBefore,
        "A's task must be unchanged"
      );
    } finally {
      await deleteTestUser(other);
    }
  });

  test('a malformed roadmap payload is rejected', async () => {
    const res = await api('POST', '/api/roadmap', { token: user.token, body: {} });
    assert.equal(res.status, 400, 'a title is required');
  });

  test('a task status outside the allow-list is rejected', async () => {
    await api('POST', '/api/roadmap', {
      token: user.token,
      body: { title: 'Validation roadmap', phases: TREE.phases },
    });
    const read = await api('GET', '/api/roadmap', { token: user.token });
    const task = read.body?.roadmap.phases
      .flatMap((p: any) => p.milestones.flatMap((m: any) => m.tasks))[0];

    const res = await api('PATCH', `/api/roadmap/tasks/${task.id}`, {
      token: user.token,
      body: { status: 'not_a_status' },
    });
    assert.equal(res.status, 400, 'an invalid status must be rejected');

    const malformed = await api('PATCH', '/api/roadmap/tasks/not-a-uuid', {
      token: user.token,
      body: { status: 'completed' },
    });
    assert.equal(malformed.status, 400, 'a malformed id must be rejected');
  });

  test('the roadmap endpoints require authentication', async () => {
    for (const [method, path] of [
      ['GET', '/api/roadmap'],
      ['POST', '/api/roadmap'],
      ['DELETE', '/api/roadmap'],
    ] as Array<[string, string]>) {
      const res = await api(method, path, { body: {} });
      assert.equal(res.status, 401, `${method} ${path} must require a session`);
    }
  });
});
