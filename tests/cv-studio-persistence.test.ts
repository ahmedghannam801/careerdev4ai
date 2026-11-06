/**
 * The CV studio's new settings and its new ordering, against the live
 * database.
 *
 * Two things are protected here.
 *
 * The first is the resume language. It is the language the document is
 * written in, and it has to survive a reload, follow the account to another
 * device, and be refused when it is a language the studio cannot render. It
 * also has to stay separate from the interface language: writing the CV in
 * Arabic must not move the product into Arabic, and moving the product into
 * Arabic must not move the document.
 *
 * The second is the order of the entries on the document. It used to be
 * re-derived from a date on every read, so a candidate could not put the
 * entry that mattered first. The order is now stored, and the rules around
 * it are the interesting ones: a candidate can reorder their own entries, a
 * candidate cannot reorder somebody else's, and a collection that does not
 * store its order cannot be named at all.
 */

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
let other: TestUser;

before(async () => {
  user = await createTestUser('cvstudio');
  other = await createTestUser('cvstudio-other');
});

after(async () => {
  await deleteTestUser(user);
  await deleteTestUser(other);
});

/** Creates an experience and returns its id. */
async function createExperience(
  token: string,
  role: string,
  company: string,
  startDate: string
): Promise<string> {
  const res = await api('POST', '/api/experiences', {
    token,
    body: { role, company, startDate, employmentType: 'Full-time' },
  });
  assert.equal(res.status, 201, `could not create the experience "${role}"`);
  return res.body?.experience?.id as string;
}

describe('the resume language', () => {
  test('it is written to the account and read back', async () => {
    const res = await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { resumeLanguage: 'ar' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.preferences?.resumeLanguage, 'ar');

    // The row, not just the response.
    const { data } = await admin
      .from('user_preferences')
      .select('resume_language')
      .eq('user_id', user.id)
      .single();
    assert.equal(data?.resume_language, 'ar');
  });

  test('it survives a reload, and it follows the account', async () => {
    const res = await api('GET', '/api/preferences', { token: user.token });
    assert.equal(res.status, 200);
    assert.equal(res.body?.preferences?.resumeLanguage, 'ar');
  });

  test('it does not move the interface language, and the interface does not move it', async () => {
    await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { language: 'en', resumeLanguage: 'ar' },
    });

    const both = await api('GET', '/api/preferences', { token: user.token });
    assert.equal(both.body?.preferences?.language, 'en');
    assert.equal(both.body?.preferences?.resumeLanguage, 'ar');

    // And the other way round.
    await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { language: 'ar' },
    });
    const after = await api('GET', '/api/preferences', { token: user.token });
    assert.equal(after.body?.preferences?.language, 'ar');
    assert.equal(after.body?.preferences?.resumeLanguage, 'ar');
  });

  test('a language the studio cannot render is refused', async () => {
    const res = await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { resumeLanguage: 'fr' },
    });
    assert.equal(res.status, 400);
  });

  test('the preferences routes still require authentication', async () => {
    const read = await apiAnonymous('GET', '/api/preferences');
    assert.equal(read.status, 401);
    const write = await apiAnonymous('PATCH', '/api/preferences', {
      body: { resumeLanguage: 'ar' },
    });
    assert.equal(write.status, 401);
  });
});

describe('the order of the entries on the document', () => {
  test('a candidate can put the entry they want first', async () => {
    const oldest = await createExperience(user.token, 'First role', 'Acme', '2019-01-01');
    const newest = await createExperience(user.token, 'Second role', 'Globex', '2024-01-01');

    // Before the reorder, the newest role is first — the list is read in
    // date order.
    const before = await api('GET', '/api/experiences', { token: user.token });
    assert.equal(before.body?.experiences?.[0]?.id, newest);

    const res = await api('POST', '/api/profile/reorder', {
      token: user.token,
      body: { collection: 'experiences', ids: [oldest, newest] },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body?.order, [oldest, newest]);

    // And the new order is the one that comes back.
    const after = await api('GET', '/api/experiences', { token: user.token });
    assert.equal(after.body?.experiences?.[0]?.id, oldest);
    assert.equal(after.body?.experiences?.[1]?.id, newest);
  });

  test('the order is stored, not re-derived from the date', async () => {
    const { data } = await admin
      .from('experiences')
      .select('job_title, sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });
    const rows = data ?? [];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].job_title, 'First role');
    assert.equal(rows[0].sort_order, 0);
    assert.equal(rows[1].sort_order, 1);
  });

  test('a candidate cannot reorder somebody else\'s entries', async () => {
    const mine = await createExperience(user.token, 'Third role', 'Initech', '2021-01-01');
    const theirs = await createExperience(other.token, 'Their role', 'Umbrella', '2022-01-01');

    const before = await api('GET', '/api/experiences', { token: user.token });
    const beforeIds = (before.body?.experiences ?? []).map(
      (entry: { id: string }) => entry.id
    );
    assert.ok(beforeIds.includes(mine));

    // The other candidate tries to move their own entry to the front of
    // this candidate's list.
    const res = await api('POST', '/api/profile/reorder', {
      token: other.token,
      body: { collection: 'experiences', ids: [theirs, mine] },
    });
    // The request succeeds, but it only renumbers the caller's own rows.
    assert.equal(res.status, 200);
    assert.ok(!res.body?.order?.includes(mine));

    // This candidate's list is untouched.
    const after = await api('GET', '/api/experiences', { token: user.token });
    const afterIds = (after.body?.experiences ?? []).map(
      (entry: { id: string }) => entry.id
    );
    assert.deepEqual(afterIds, beforeIds);
  });

  test('a collection that does not store its order cannot be named', async () => {
    const res = await api('POST', '/api/profile/reorder', {
      token: user.token,
      body: { collection: 'profiles', ids: ['anything'] },
    });
    assert.equal(res.status, 400);
  });

  test('the route requires authentication', async () => {
    const res = await apiAnonymous('POST', '/api/profile/reorder', {
      body: { collection: 'experiences', ids: [] },
    });
    assert.equal(res.status, 401);
  });
});
