/**
 * The approval gate on an application, proved against the running server.
 *
 * The rule under test is the one the product promises: an application goes
 * out in the candidate's name, so the candidate has to be the one who agrees
 * to it.
 *
 * What is proved here:
 *
 *   1. A new package starts as a draft — nobody has approved it.
 *   2. It cannot jump straight to approved. The database refuses the move,
 *      and the route reports the refusal rather than a generic error.
 *   3. It goes through review and then approves.
 *   4. Every decision is recorded, and the record says what was decided.
 *   5. One candidate cannot move another candidate's package, and cannot read
 *      their decisions.
 *   6. An action the platform does not know is refused.
 *
 * The gate itself lives in a database trigger, so these tests are what prove
 * the trigger is really there: the route is only the way the candidate
 * reaches it.
 */

import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';

import { admin, api, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

const users: TestUser[] = [];
let userCounter = 0;

after(async () => {
  for (const user of users) {
    await deleteTestUser(user);
  }
});

async function makeUser(): Promise<TestUser> {
  // The label names the identity inside this run's namespace, so two
  // candidates created in the same run never collide.
  userCounter += 1;
  const user = await createTestUser(`approval-gate-${userCounter}`);
  users.push(user);
  return user;
}

/** Creates a package for the candidate and returns its id. */
async function makePackage(user: TestUser): Promise<string> {
  const response = await api('POST', '/api/application-packages', {
    token: user.token,
    body: {
      jobTitle: 'Backend Engineer',
      company: 'Example employer',
      jobDescription:
        'We are hiring a backend engineer to build payment systems with TypeScript and PostgreSQL.',
      analysis: { summary: 'A backend role.' },
      matchAnalysis: { strengths: ['TypeScript'] },
      matchScore: 72,
      language: 'en',
    },
  });

  assert.equal(response.status, 201);
  assert.ok(response.body?.package?.id);
  return response.body.package.id as string;
}

describe('the application approval gate', () => {
  it('starts a new package as a draft nobody has approved', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    const listed = await api('GET', '/api/application-packages', { token: user.token });
    assert.equal(listed.status, 200);

    const saved = (listed.body?.packages ?? []).find(
      (entry: { id: string }) => entry.id === packageId
    );
    assert.ok(saved, 'the package should be listed');
    assert.equal(saved.status, 'draft');
    assert.equal(saved.reviewedAt, null);
  });

  it('refuses to approve a package that was never sent for review', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    const response = await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'approve' },
    });

    // 409 is the conflict answer: the package is in a state that does not
    // allow this move.
    assert.equal(response.status, 409);
    assert.match(String(response.body?.error), /draft/);
  });

  it('goes through review and then approves', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    const sent = await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'submit_for_review' },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body?.decision?.toStatus, 'pending_review');

    const approved = await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'approve', note: 'This is the version I want to send.' },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body?.decision?.toStatus, 'approved');
    assert.ok(approved.body?.decision?.reviewedAt, 'the decision must carry a time');
  });

  it('records every decision it makes', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'submit_for_review' },
    });
    await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'reject', note: 'The cover letter needs another pass.' },
    });

    const reviews = await api('GET', `/api/application-packages/${packageId}/reviews`, {
      token: user.token,
    });
    assert.equal(reviews.status, 200);

    const history = reviews.body?.reviews ?? [];
    assert.equal(history.length, 2);

    // The newest decision is first, and it says what was decided and why.
    assert.equal(history[0].toStatus, 'rejected');
    assert.equal(history[0].fromStatus, 'pending_review');
    assert.equal(history[0].note, 'The cover letter needs another pass.');
    assert.equal(history[1].toStatus, 'pending_review');
    assert.equal(history[1].fromStatus, 'draft');
  });

  it('refuses an action it does not know', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    const response = await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'send_to_the_employer' },
    });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error), /submit_for_review/);
  });

  it('does not let one candidate decide for another', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const packageId = await makePackage(owner);

    const response = await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: stranger.token,
      body: { action: 'submit_for_review' },
    });

    // A package that is not the caller's is not found, rather than refused,
    // so the route cannot be used to discover which packages exist.
    assert.equal(response.status, 404);
  });

  it('does not let one candidate read another candidate\'s decisions', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const packageId = await makePackage(owner);

    await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: owner.token,
      body: { action: 'submit_for_review' },
    });

    const response = await api('GET', `/api/application-packages/${packageId}/reviews`, {
      token: stranger.token,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body?.reviews, []);
  });

  it('refuses the decision to a caller who is not signed in', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    const response = await api('POST', `/api/application-packages/${packageId}/decision`, {
      body: { action: 'approve' },
    });
    assert.equal(response.status, 401);
  });

  it('keeps the gate in the database, not only in the route', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    // The route checks the move before it makes it. The trigger checks it
    // again, and this proves the trigger is there: this update goes straight
    // to the database, past the route entirely.
    const { error } = await admin
      .from('application_packages')
      .update({ status: 'approved' })
      .eq('id', packageId)
      .eq('profile_id', user.id);

    assert.ok(error, 'the database must refuse the move');
    assert.match(error.message, /cannot move from draft to approved/);
  });

  it('leaves the package untouched after a refused move', async () => {
    const user = await makeUser();
    const packageId = await makePackage(user);

    await api('POST', `/api/application-packages/${packageId}/decision`, {
      token: user.token,
      body: { action: 'approve' },
    });

    const listed = await api('GET', '/api/application-packages', { token: user.token });
    const saved = (listed.body?.packages ?? []).find(
      (entry: { id: string }) => entry.id === packageId
    );
    assert.equal(saved.status, 'draft');
  });
});
