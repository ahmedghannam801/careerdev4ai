// The hierarchical target role: domain -> specialisation.
//
// A target role is a TWO-level selection. Level 1 is the career domain and
// level 2 is a specialisation inside it. This suite proves that:
//
//   1. the shared hierarchy is coherent (every specialisation really belongs
//      to its domain, and the domain is recoverable from the stored role);
//   2. the selection PERSISTS — it survives a logout/login cycle, and the
//      parent domain is still there afterwards;
//   3. the API validates the selection on the SERVER, so an invalid domain,
//      an invalid specialisation, a specialisation from another domain and
//      an empty selection are all rejected;
//   4. the AI never overwrites the user's explicit selection.
//
// Every row created here is removed by explicit id in the `after` hooks.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTestUser,
  deleteTestUser,
  reauthenticate,
  admin,
  api,
  type TestUser,
} from './helpers.ts';

import {
  CAREER_DOMAINS,
  getCareerDomain,
} from '../shared/careerDomains.ts';
import { CAREER_ROLES, findRoleById, findRoleByTitle } from '../shared/careerRoles.ts';
import {
  validateTargetRoleSelection,
  resolveTargetRoleDomain,
  getCareerSpecializations,
  isCareerDomainId,
} from '../shared/targetRoleSelection.ts';

let userA: TestUser;

before(async () => {
  userA = await createTestUser('targetrole');
});

after(async () => {
  await deleteTestUser(userA);
});

/** Reads the stored target role straight from the database. */
async function readTargetRole(userId: string): Promise<{ target_role: string | null; target_industry: string | null }> {
  const { data, error } = await admin
    .from('profiles')
    .select('target_role, target_industry')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? { target_role: null, target_industry: null }) as {
    target_role: string | null;
    target_industry: string | null;
  };
}

describe('the shared career hierarchy', () => {
  test('every catalogue role belongs to a real domain and resolves to it', () => {
    const domainIds = new Set(CAREER_DOMAINS.map((domain) => domain.slug));
    for (const role of CAREER_ROLES) {
      assert.ok(domainIds.has(role.domainId), `${role.id} has unknown domain ${role.domainId}`);
      assert.equal(
        resolveTargetRoleDomain(role.title),
        role.domainId,
        `${role.id} does not resolve back to its own domain`
      );
      assert.equal(
        resolveTargetRoleDomain(role.id),
        role.domainId,
        `${role.id} does not resolve back to its own domain by id`
      );
    }
  });

  test('the specialisations of a domain are exactly the catalogue roles of that domain', () => {
    for (const domain of CAREER_DOMAINS) {
      const listed = getCareerSpecializations(domain.slug).map((role) => role.id).sort();
      const expected = CAREER_ROLES.filter((role) => role.domainId === domain.slug)
        .map((role) => role.id)
        .sort();
      assert.deepEqual(listed, expected, `${domain.slug} lists a different set of specialisations`);
    }
  });

  test('a specialisation from another domain is rejected', () => {
    const business = getCareerSpecializations('business');
    const technical = getCareerSpecializations('technology');
    assert.ok(business.length > 0 && technical.length > 0, 'the catalogue must span domains');

    const result = validateTargetRoleSelection({
      domainId: 'business',
      specializationId: technical[0].id,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'domain_mismatch');
  });

  test('an unknown domain and an unknown specialisation are rejected', () => {
    const unknownDomain = validateTargetRoleSelection({
      domainId: 'not-a-domain',
      specializationId: 'business-analyst',
    });
    assert.equal(unknownDomain.ok, false);
    if (!unknownDomain.ok) assert.equal(unknownDomain.error.code, 'invalid_domain');

    const unknownRole = validateTargetRoleSelection({
      domainId: 'business',
      specializationId: 'not-a-role',
    });
    assert.equal(unknownRole.ok, false);
    if (!unknownRole.ok) assert.equal(unknownRole.error.code, 'invalid_specialization');

    const empty = validateTargetRoleSelection({ domainId: 'business' });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error.code, 'missing_specialization');
  });

  test('a legacy free-text target role has no domain, and does not crash', () => {
    assert.equal(resolveTargetRoleDomain('Astronaut Major'), null);
    assert.equal(resolveTargetRoleDomain(null), null);
  });
});

describe('the target role persists across a logout and login', () => {
  test('the specialisation and its parent domain both survive a new session', async () => {
    const role = findRoleByTitle('Business Analyst') ?? getCareerSpecializations('business')[0];
    const domain = getCareerDomain(role.domainId);
    assert.ok(domain, 'the role must belong to a known domain');

    const patch = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: role.id, targetRoleDomain: role.domainId },
    });
    assert.equal(patch.status, 200, `the target role could not be saved: ${patch.body?.error}`);

    // The stored column is the role's canonical title, and the domain is
    // stored beside it.
    const stored = await readTargetRole(userA.id);
    assert.equal(stored.target_role, role.title);
    assert.equal(stored.target_industry, domain.label);

    // A fresh session reads the rows from the database, not from memory.
    const freshToken = await reauthenticate(userA);
    const read = await api('GET', '/api/profile', { token: freshToken });
    assert.equal(read.status, 200);
    assert.equal(read.body?.profile?.targetRole, role.title);
    assert.equal(
      read.body?.profile?.targetRoleDomain,
      role.domainId,
      'the parent domain must survive the session change'
    );
    assert.equal(read.body?.profile?.targetRoleId, role.id);

    // And the domain is recoverable from the stored title alone.
    assert.equal(resolveTargetRoleDomain(stored.target_role), role.domainId);
  });

  test('a previously stored target role is not reset by an unrelated profile edit', async () => {
    const role = getCareerSpecializations('finance')[0];
    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: role.id, targetRoleDomain: role.domainId },
    });

    // Editing an unrelated field must not clear the selection.
    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { headline: 'A headline that has nothing to do with the target role' },
    });

    const stored = await readTargetRole(userA.id);
    assert.equal(stored.target_role, role.title, 'the target role must survive an unrelated edit');
  });
});

describe('the server validates the selection', () => {
  test('an unknown domain is rejected with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: {
        targetRoleId: getCareerSpecializations('business')[0].id,
        targetRoleDomain: 'not-a-domain',
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'invalid_domain');
  });

  test('an unknown specialisation is rejected with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: 'not-a-role', targetRoleDomain: 'business' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'invalid_specialization');
  });

  test('a specialisation from another domain is rejected with 400', async () => {
    const business = getCareerSpecializations('business')[0];
    const technical = getCareerSpecializations('technology')[0];
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: technical.id, targetRoleDomain: business.domainId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'domain_mismatch');
  });

  test('a domain without a specialisation is rejected with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleDomain: 'business' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'missing_specialization');
  });

  test('a rejected selection leaves the stored target role untouched', async () => {
    const role = getCareerSpecializations('design')[0];
    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: role.id, targetRoleDomain: role.domainId },
    });

    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: 'not-a-role', targetRoleDomain: 'design' },
    });

    const stored = await readTargetRole(userA.id);
    assert.equal(stored.target_role, role.title, 'a rejected write must not change the stored role');
  });

  test('an arbitrary free-text target role is rejected with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRole: 'Rocket Ship Operator' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'invalid_specialization');
  });

  test('a legacy flat title that IS a catalogue role is still accepted', async () => {
    const role = getCareerSpecializations('legal')[0];
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRole: role.title },
    });
    assert.equal(res.status, 200);
    const stored = await readTargetRole(userA.id);
    assert.equal(stored.target_role, role.title);
  });
});

describe('the AI never overwrites the target role', () => {
  test('the copilot prompt treats the selected target role as authoritative', async () => {
    // The prompt is built from the profile, so it has to name the role the
    // user actually chose.
    const role = getCareerSpecializations('healthcare')[0];
    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: role.id, targetRoleDomain: role.domainId },
    });

    const { loadAiCareerContext, buildAiContextBlock } = await import(
      '../server/ai/careerContext.ts'
    );
    const context = await loadAiCareerContext(userA.id);
    assert.equal(context.targetRoleTitle, role.title);
    assert.equal(context.targetRole?.domainId, role.domainId);

    const block = buildAiContextBlock(context);
    assert.ok(
      block.includes(role.title),
      'the prompt must state the target role the user selected'
    );
    assert.ok(
      /authoritative/i.test(block),
      'the prompt must tell the model the target role is the user\'s explicit choice'
    );
    assert.ok(
      /never state or imply that their target role has changed/i.test(block),
      'the prompt must forbid the model from presenting the target role as changed'
    );
  });

  test('a learning recommendation request does not change the stored target role', async () => {
    const role = getCareerSpecializations('marketing')[0];
    await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { targetRoleId: role.id, targetRoleDomain: role.domainId },
    });

    // A recommendation request may PREVIEW another role. That is a read-only
    // override: it must never be written to the profile.
    const res = await api('POST', '/api/learning/recommendations', {
      token: userA.token,
      body: { targetRoleId: getCareerSpecializations('data')[0].id, ai: false },
    });
    assert.ok(res.status === 200 || res.status === 400 || res.status === 500, `unexpected status ${res.status}`);

    const stored = await readTargetRole(userA.id);
    assert.equal(
      stored.target_role,
      role.title,
      'an AI recommendation must not overwrite the user\'s target role'
    );
  });
});

describe('the hierarchy helper used by the client', () => {
  test('a domain slug is recognised and an unknown one is not', () => {
    assert.equal(isCareerDomainId('business'), true);
    assert.equal(isCareerDomainId('not-a-domain'), false);
    assert.equal(isCareerDomainId(undefined), false);
  });

  test('a role id and its title resolve to the same catalogue entry', () => {
    const role = getCareerSpecializations('business')[0];
    assert.equal(findRoleById(role.id)?.title, role.title);
    assert.equal(findRoleByTitle(role.title)?.id, role.id);
  });
});
