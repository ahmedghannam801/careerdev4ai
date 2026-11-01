/**
 * The two career tools, against the running API.
 *
 * The pure suites (`headline-suggestions.test.ts`, `professional-links.test.ts`)
 * prove the rules. This suite proves that the server actually applies them to a
 * real user's record:
 *
 *   1. The headline endpoint answers with several role-specific options even
 *      when the model is switched off, so the studio can never spin forever.
 *   2. A professional link can be created, edited, reloaded in a fresh session
 *      and deleted, and the edited label and URL are what the profile returns.
 *
 * Every identity and row created here is removed by the `after` hooks.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTestUser,
  deleteTestUser,
  reauthenticate,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';
import { isRelevantHeadlineSuggestion } from '../shared/headlineSuggestions.ts';
import { CV_HEADLINE_SUGGESTION_COUNT } from '../shared/cvAiAssist.ts';

let userA: TestUser;
let userB: TestUser;

before(async () => {
  userA = await createTestUser('careertools-a');
  userB = await createTestUser('careertools-b');
});

after(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

/** Asks the endpoint for deterministic headline options. */
async function suggestHeadlines(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: any }> {
  return api('POST', '/api/cv/ai-assist', {
    token,
    body: { field: 'headline', suggestions: true, ai: false, ...body },
  });
}

describe('headline suggestions for the target role', () => {
  test('returns several role-specific options without a model', async () => {
    const res = await suggestHeadlines(userA.token, { targetRoleTitle: 'HR Specialist' });

    assert.equal(res.status, 200, `the endpoint failed: ${res.body?.error}`);
    assert.equal(res.body?.success, true);
    assert.ok(Array.isArray(res.body?.suggestions));
    assert.ok(
      res.body.suggestions.length >= 3,
      `expected several options, received ${res.body?.suggestions?.length}`
    );
    assert.ok(res.body.suggestions.length <= CV_HEADLINE_SUGGESTION_COUNT);
    assert.equal(res.body?.aiUsed, false, 'ai:false must never report a model call');

    for (const suggestion of res.body.suggestions) {
      assert.equal(typeof suggestion, 'string');
      assert.ok(
        isRelevantHeadlineSuggestion(suggestion, { targetRoleTitle: 'HR Specialist' }),
        `"${suggestion}" must name the target role`
      );
    }
  });

  test('gives a different role different options', async () => {
    const hr = await suggestHeadlines(userA.token, { targetRoleTitle: 'HR Specialist' });
    const data = await suggestHeadlines(userA.token, { targetRoleTitle: 'Data Analyst' });

    assert.equal(hr.status, 200);
    assert.equal(data.status, 200);
    assert.notDeepEqual(hr.body.suggestions, data.body.suggestions);
    assert.ok(
      hr.body.suggestions.every((suggestion: string) => !/SQL|Data Analyst/.test(suggestion)),
      'an HR headline must not advertise a data role'
    );
    assert.ok(
      data.body.suggestions.some((suggestion: string) => /Data Analyst/.test(suggestion)),
      'a data headline must name the data role'
    );
  });

  test('writes Arabic options when the request is Arabic', async () => {
    const res = await suggestHeadlines(userA.token, {
      targetRoleTitle: 'HR Specialist',
      language: 'ar',
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.suggestions.length >= 1);
    assert.ok(
      res.body.suggestions.some((suggestion: string) => /[\u0600-\u06ff]/.test(suggestion)),
      'the Arabic request must return Arabic text'
    );
  });

  test('falls back to the stored target role when none is sent', async () => {
    // The user has no target role yet, so the endpoint must still answer.
    const res = await suggestHeadlines(userA.token, {});

    assert.equal(res.status, 200);
    assert.ok(res.body.suggestions.length >= 1, 'a sparse record must still get a headline');
  });

  test('rejects an unknown CV field and an anonymous caller', async () => {
    const bad = await api('POST', '/api/cv/ai-assist', {
      token: userA.token,
      body: { field: 'not-a-field', suggestions: true, ai: false },
    });
    assert.equal(bad.status, 400);

    const anonymous = await apiAnonymous('POST', '/api/cv/ai-assist', {
      body: { field: 'headline', suggestions: true, ai: false },
    });
    assert.equal(anonymous.status, 401);
  });
});

describe('professional links persist through the profile', () => {
  let linkId = '';

  test('a link is created and listed', async () => {
    const created = await api('POST', '/api/profile-links', {
      token: userA.token,
      body: {
        kind: 'github',
        label: 'GitHub',
        url: 'https://github.com/old-name',
      },
    });

    assert.equal(created.status, 201, `the link could not be created: ${created.body?.error}`);
    assert.equal(created.body?.link?.kind, 'github');
    assert.equal(created.body?.link?.url, 'https://github.com/old-name');
    assert.equal(created.body?.link?.label, 'GitHub');
    linkId = created.body.link.id;

    const list = await api('GET', '/api/profile-links', { token: userA.token });
    assert.equal(list.status, 200);
    assert.ok(list.body.links.some((link: any) => link.id === linkId));
  });

  test('the URL and label edit reach the profile and survive a new session', async () => {
    const patch = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userA.token,
      body: { label: 'Code', url: 'https://github.com/new-name' },
    });
    assert.equal(patch.status, 200, `the edit was rejected: ${patch.body?.error}`);
    assert.equal(patch.body?.link?.label, 'Code');
    assert.equal(patch.body?.link?.url, 'https://github.com/new-name');

    // A fresh session proves the row is read from the database, not memory.
    const freshToken = await reauthenticate(userA);
    const list = await api('GET', '/api/profile-links', { token: freshToken });
    const stored = list.body.links.find((link: any) => link.id === linkId);
    assert.ok(stored, 'the edited link must still exist');
    assert.equal(stored.label, 'Code');
    assert.equal(stored.url, 'https://github.com/new-name');

    // And the profile projection carries the same value to the CV.
    const profile = await api('GET', '/api/profile', { token: freshToken });
    assert.equal(profile.status, 200);
    const projected = profile.body.profile.links.find((link: any) => link.id === linkId);
    assert.ok(projected, 'the profile projection must include the link');
    assert.equal(projected.label, 'Code');
    assert.equal(projected.url, 'https://github.com/new-name');
  });

  test('a blank label clears the custom label instead of storing an empty string', async () => {
    const patch = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userA.token,
      body: { label: '   ' },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.body?.link?.label, null, 'a blank label must be stored as null');

    const cleared = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userA.token,
      body: { label: 'Code' },
    });
    assert.equal(cleared.status, 200);

    const nulled = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userA.token,
      body: { label: null },
    });
    assert.equal(nulled.status, 200);
    assert.equal(nulled.body?.link?.label, null, 'null must clear the label');
  });

  test('re-creating the same kind replaces it instead of duplicating it', async () => {
    const created = await api('POST', '/api/profile-links', {
      token: userA.token,
      body: {
        kind: 'github',
        label: 'GitHub',
        url: 'https://github.com/replaced',
      },
    });
    assert.equal(created.status, 201);

    const list = await api('GET', '/api/profile-links', { token: userA.token });
    const github = list.body.links.filter((link: any) => link.kind === 'github');
    assert.equal(github.length, 1, 'the unique (profile, kind) key must hold');
    assert.equal(github[0].url, 'https://github.com/replaced');
    linkId = github[0].id;
  });

  test('an unsafe URL is rejected', async () => {
    const created = await api('POST', '/api/profile-links', {
      token: userA.token,
      body: { kind: 'portfolio', url: 'javascript:alert(1)' },
    });
    assert.equal(created.status, 400);

    const patch = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userA.token,
      body: { url: 'mailto:someone@example.com' },
    });
    assert.equal(patch.status, 400);
  });

  test('another user cannot read, edit or delete the link', async () => {
    const otherList = await api('GET', '/api/profile-links', { token: userB.token });
    assert.equal(otherList.status, 200);
    assert.ok(
      otherList.body.links.every((link: any) => link.id !== linkId),
      'a link must never leak to another user'
    );

    const patch = await api('PATCH', `/api/profile-links/${linkId}`, {
      token: userB.token,
      body: { url: 'https://evil.example.com' },
    });
    assert.equal(patch.status, 404);

    const remove = await api('DELETE', `/api/profile-links/${linkId}`, {
      token: userB.token,
    });
    assert.equal(remove.status, 404);
  });

  test('the owner can delete the link and it stays gone', async () => {
    const removed = await api('DELETE', `/api/profile-links/${linkId}`, {
      token: userA.token,
    });
    assert.equal(removed.status, 200);

    const list = await api('GET', '/api/profile-links', { token: userA.token });
    assert.ok(
      list.body.links.every((link: any) => link.id !== linkId),
      'a deleted link must not come back'
    );

    const profile = await api('GET', '/api/profile', { token: userA.token });
    assert.ok(
      profile.body.profile.links.every((link: any) => link.id !== linkId),
      'the profile projection must drop the deleted link'
    );
  });
});
