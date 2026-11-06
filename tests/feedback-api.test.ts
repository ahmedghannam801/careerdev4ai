/**
 * The feedback invitation API.
 *
 * The policy is unit-tested in `feedback.test.ts`. These tests cover what only
 * the real server and database can show: every route needs a session, the
 * session counter survives a reload, the three events write the right columns,
 * and one account's state is invisible to another.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { api, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

let user: TestUser;
let other: TestUser;

before(async () => {
  user = await createTestUser();
  other = await createTestUser();
});

after(async () => {
  await deleteTestUser(other);
  await deleteTestUser(user);
});

describe('the feedback API', () => {
  test('requires a session on every route', async () => {
    assert.equal((await api('GET', '/api/feedback')).status, 401);
    assert.equal((await api('POST', '/api/feedback/session', { body: {} })).status, 401);
    assert.equal(
      (await api('POST', '/api/feedback/event', {
        body: { type: 'opened', source: 'settings' },
      })).status,
      401
    );
  });

  test('counts a session once inside the thirty-minute window', async () => {
    const first = await api('POST', '/api/feedback/session', { token: user.token, body: {} });
    assert.equal(first.status, 200);
    assert.equal(first.body.counted, true);
    assert.equal(first.body.state.sessionCount, 1);

    const reload = await api('POST', '/api/feedback/session', { token: user.token, body: {} });
    assert.equal(reload.status, 200);
    assert.equal(reload.body.counted, false);
    assert.equal(reload.body.state.sessionCount, 1);
  });

  test('reads the state without counting another session', async () => {
    const read = await api('GET', '/api/feedback', { token: user.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.state.sessionCount, 1);
  });

  test('records the contextual impression and the open', async () => {
    const impression = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'impression', source: 'contextual_invitation' },
    });
    assert.equal(impression.status, 200);
    assert.ok(impression.body.state.lastShownAt);

    const opened = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'opened', source: 'settings' },
    });
    assert.equal(opened.status, 200);
    assert.ok(opened.body.state.lastOpenedAt);
  });

  test('a dashboard-card impression does not start the automatic cooldown', async () => {
    const before = await api('GET', '/api/feedback', { token: user.token });
    const impression = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'impression', source: 'dashboard_card' },
    });
    assert.equal(impression.status, 200);
    // The previous contextual impression is still the only one recorded, and
    // the card did not move its timestamp forward.
    assert.ok(impression.body.state.lastShownAt);
    assert.equal(impression.body.state.lastShownAt, before.body.state.lastShownAt);
  });

  test('a card dismissal hides the card, not the invitation cooldown', async () => {
    const dismissed = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'dismissed', source: 'dashboard_card' },
    });
    assert.equal(dismissed.status, 200);
    assert.ok(dismissed.body.state.cardDismissedAt);
    assert.equal(dismissed.body.state.lastDismissedAt, null);
  });

  test('rejects an unknown event or source', async () => {
    const badType = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'submitted', source: 'settings' },
    });
    assert.equal(badType.status, 400);

    const badSource = await api('POST', '/api/feedback/event', {
      token: user.token,
      body: { type: 'opened', source: 'somewhere_else' },
    });
    assert.equal(badSource.status, 400);
  });

  test('keeps one account\'s invitation history out of another account', async () => {
    const state = await api('GET', '/api/feedback', { token: other.token });
    assert.equal(state.status, 200);
    assert.equal(state.body.state.sessionCount, 0);
    assert.equal(state.body.state.lastOpenedAt, null);
    assert.equal(state.body.state.cardDismissedAt, null);
  });
});
