/**
 * The consent gate, against the running API and the real database.
 *
 * The screen in the browser is not the security boundary: every protected
 * route goes through `requireAuth`, which refuses a caller who has not
 * accepted the current Terms & Conditions and Privacy Policy. These tests
 * exercise that boundary directly, not the component that renders it.
 *
 * Four properties are protected here:
 *
 *   * a protected route is refused with a code the client can act on, and the
 *     refusal does not depend on which route is tried;
 *   * an acceptance is explicit, is recorded against the authenticated user
 *     only, and opens the gate;
 *   * an acceptance of an older version does not count, and the historical
 *     rows are kept when a new version is accepted;
 *   * one user's acceptance cannot unlock another user, even when a request
 *     names the other user's id.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  admin,
  api,
  createTestUser,
  deleteTestUser,
  grantConsent,
  readConsentRows,
  type TestUser,
} from './helpers.ts';
import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/legal.ts';

const created: TestUser[] = [];

async function makeUser(label: string, consent = false): Promise<TestUser> {
  const user = await createTestUser(label, { consent });
  created.push(user);
  return user;
}

after(async () => {
  await Promise.all(created.map((user) => deleteTestUser(user)));
});

describe('the consent gate', () => {
  it('refuses every protected route until the current documents are accepted', async () => {
    const user = await makeUser('consent-none');

    for (const path of ['/api/profile', '/api/experiences', '/api/cvs', '/api/notifications']) {
      const blocked = await api('GET', path, { token: user.token });
      assert.equal(blocked.status, 403, `${path} must be gated`);
      assert.equal(blocked.body?.code, 'CONSENT_REQUIRED');
      assert.equal(blocked.body?.termsVersion, TERMS_VERSION);
      assert.equal(blocked.body?.privacyVersion, PRIVACY_VERSION);
    }

    // The consent endpoint itself stays reachable: it is how the client
    // learns which versions are missing.
    const state = await api('GET', '/api/consent', { token: user.token });
    assert.equal(state.status, 200);
    assert.equal(state.body?.consent?.accepted, false);
    assert.equal(state.body?.consent?.termsVersion, TERMS_VERSION);
    assert.equal(state.body?.consent?.privacyVersion, PRIVACY_VERSION);
    assert.deepEqual(await readConsentRows(user.id), []);
  });

  it('refuses an acceptance that is not explicit or names a different version', async () => {
    const user = await makeUser('consent-invalid');

    const implicit = await api('POST', '/api/consent', {
      token: user.token,
      body: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });
    assert.equal(implicit.status, 400);
    assert.equal(implicit.body?.code, 'CONSENT_NOT_ACCEPTED');

    const stale = await api('POST', '/api/consent', {
      token: user.token,
      body: {
        accepted: true,
        termsVersion: '2020-01-01',
        privacyVersion: PRIVACY_VERSION,
      },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body?.code, 'CONSENT_VERSION_MISMATCH');
    assert.equal(stale.body?.termsVersion, TERMS_VERSION);

    assert.deepEqual(await readConsentRows(user.id), []);
    const stillBlocked = await api('GET', '/api/profile', { token: user.token });
    assert.equal(stillBlocked.status, 403);
  });

  it('records an explicit acceptance and opens the gate', async () => {
    const user = await makeUser('consent-accept');

    const accepted = await api('POST', '/api/consent', {
      token: user.token,
      body: {
        accepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        source: 'reconsent',
      },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body?.consent?.accepted, true);

    const rows = await readConsentRows(user.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].terms_version, TERMS_VERSION);
    assert.equal(rows[0].privacy_version, PRIVACY_VERSION);
    assert.equal(rows[0].status, 'accepted');
    assert.ok(rows[0].accepted_at);

    const opened = await api('GET', '/api/profile', { token: user.token });
    assert.equal(opened.status, 200);

    // Accepting the same pair again is idempotent: history does not grow.
    const again = await api('POST', '/api/consent', {
      token: user.token,
      body: { accepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });
    assert.equal(again.status, 200);
    assert.equal((await readConsentRows(user.id)).length, 1);
  });

  it('re-gates when a document version changes and keeps the older record', async () => {
    const user = await makeUser('consent-version');
    await grantConsent(user.id, {
      termsVersion: '2025-01-01',
      privacyVersion: '2025-01-01',
    });

    const gated = await api('GET', '/api/consent', { token: user.token });
    assert.equal(gated.status, 200);
    assert.equal(gated.body?.consent?.accepted, false, 'an older acceptance is not current');

    const blocked = await api('GET', '/api/experiences', { token: user.token });
    assert.equal(blocked.status, 403);

    const accepted = await api('POST', '/api/consent', {
      token: user.token,
      body: {
        accepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        source: 'settings',
      },
    });
    assert.equal(accepted.status, 200);

    const rows = await readConsentRows(user.id);
    assert.equal(rows.length, 2, 'the historical acceptance is preserved');
    assert.ok(rows.some((row) => row.terms_version === '2025-01-01'));
    assert.ok(
      rows.some(
        (row) =>
          row.terms_version === TERMS_VERSION && row.privacy_version === PRIVACY_VERSION
      )
    );

    const opened = await api('GET', '/api/experiences', { token: user.token });
    assert.equal(opened.status, 200);
  });

  it('does not let one user acceptance, or a named id, unlock another user', async () => {
    const accepted = await makeUser('consent-owner');
    const victim = await makeUser('consent-other');

    const acceptance = await api('POST', '/api/consent', {
      token: accepted.token,
      // A client-supplied id must be ignored: the verified token is the only
      // identity source.
      body: {
        accepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        userId: victim.id,
      },
    });
    assert.equal(acceptance.status, 200);

    const victimRows = await readConsentRows(victim.id);
    assert.deepEqual(victimRows, [], 'the victim did not consent');

    const victimState = await api('GET', '/api/consent', { token: victim.token });
    assert.equal(victimState.body?.consent?.accepted, false);

    const victimBlocked = await api('GET', '/api/profile', { token: victim.token });
    assert.equal(victimBlocked.status, 403);
    assert.equal(victimBlocked.body?.code, 'CONSENT_REQUIRED');
  });

  it('honours an acceptance carried by a registration that needed confirmation', async () => {
    const user = await makeUser('consent-registration');

    // `signUp` returns no session until the address is confirmed, so the
    // registration form carries the acceptance in user metadata. The server
    // records it on the first authenticated consent check.
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        consent_accepted: true,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      },
    });
    assert.equal(error, null);

    const state = await api('GET', '/api/consent', { token: user.token });
    assert.equal(state.status, 200);
    assert.equal(state.body?.consent?.accepted, true);

    const rows = await readConsentRows(user.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'registration');

    const opened = await api('GET', '/api/profile', { token: user.token });
    assert.equal(opened.status, 200);
  });
});
