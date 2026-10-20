// Skill-level persistence (B.3.9 finding H-2).
//
// Before the fix, a skill level change only touched React state: there was no
// /api/skills route at all, and the levels reached the database only through
// the aggregate /api/state endpoint that B.3.9 retired. The level the user
// saw in the career analysis was therefore not the level that was stored.
//
// These tests prove the level is real, owned, validated, database state.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  reauthenticate,
  readUserSkillRows,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('skills');
});

after(async () => {
  await deleteTestUser(user);
});

describe('skill levels (H-2)', () => {
  test('a skill level is created and persisted', async () => {
    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { name: 'RegressionSkill', proficiency: 4, category: 'technical' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body?.skill?.proficiency, 4);
    const skillId = res.body?.skill?.skill_id;
    assert.ok(skillId, 'the skill link must have a catalogue id');

    // It is really in the database.
    const rows = await readUserSkillRows(user.id);
    const stored = rows.find((row) => row.skill_id === skillId);
    assert.ok(stored, 'the skill link must be a row in user_skills');
    assert.equal(stored.proficiency, 4);
  });

  test('a skill level survives a reload (a new session sees the same level)', async () => {
    const token = await reauthenticate(user);
    const res = await api('GET', '/api/user-skills', { token });
    assert.equal(res.status, 200);
    const skills = res.body?.skills ?? [];
    const stored = skills.find((s: any) => s.skill?.name === 'RegressionSkill');
    assert.ok(stored, 'the skill must be readable after a logout/login cycle');
    assert.equal(stored.proficiency, 4, 'the level must be preserved');
  });

  test('changing a level updates the stored row rather than adding one', async () => {
    const before = await readUserSkillRows(user.id);
    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { name: 'RegressionSkill', proficiency: 2 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body?.skill?.proficiency, 2);

    const after = await readUserSkillRows(user.id);
    assert.equal(
      after.length,
      before.length,
      'the same skill must be updated, not duplicated'
    );
    const stored = after.find((row) => row.skill_id === res.body?.skill?.skill_id);
    assert.equal(stored?.proficiency, 2);
  });

  test('a level outside 1-5 is rejected', async () => {
    for (const proficiency of [0, 6, -1, 100]) {
      const res = await api('POST', '/api/user-skills', {
        token: user.token,
        body: { name: 'InvalidLevelSkill', proficiency },
      });
      assert.equal(res.status, 400, `proficiency ${proficiency} must be rejected`);
    }
  });

  test('a non-integer level is rejected', async () => {
    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { name: 'InvalidLevelSkill', proficiency: 3.5 },
    });
    assert.equal(res.status, 400);
  });

  test('a missing skill name is rejected', async () => {
    const res = await api('POST', '/api/user-skills', {
      token: user.token,
      body: { proficiency: 3 },
    });
    assert.equal(res.status, 400);
  });

  test('the skill endpoints require authentication', async () => {
    const list = await api('GET', '/api/user-skills');
    assert.equal(list.status, 401);
    const create = await api('POST', '/api/user-skills', {
      body: { name: 'Unauthenticated', proficiency: 3 },
    });
    assert.equal(create.status, 401);
  });

  test('another user cannot read or overwrite a skill level', async () => {
    const other = await createTestUser('skillsother');
    try {
      const created = await api('POST', '/api/user-skills', {
        token: user.token,
        body: { name: 'OwnedSkill', proficiency: 5, category: 'technical' },
      });
      assert.equal(created.status, 201);
      const skillId = created.body?.skill?.skill_id;

      // B's own list must not contain A's skill.
      const otherList = await api('GET', '/api/user-skills', { token: other.token });
      assert.equal(otherList.status, 200);
      assert.ok(
        !(otherList.body?.skills ?? []).some((s: any) => s.skill_id === skillId),
        "B must not see A's skill link"
      );

      // B must not be able to delete A's skill link.
      const deleted = await api('DELETE', `/api/user-skills/${skillId}`, {
        token: other.token,
      });
      assert.equal(deleted.status, 404, "B must not delete A's skill link");

      const rows = await readUserSkillRows(user.id);
      assert.ok(
        rows.some((row) => row.skill_id === skillId),
        "A's skill link must be intact"
      );
    } finally {
      await deleteTestUser(other);
    }
  });

  test('a malformed skill id is rejected', async () => {
    const res = await api('DELETE', '/api/user-skills/not-a-uuid', {
      token: user.token,
    });
    assert.equal(res.status, 400);
  });
});
