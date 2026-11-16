/**
 * Regression tests for the subscription tier identities.
 *
 * The bug these lock down: the plan was shown as a raw code. A candidate
 * whose plan is `career_plus` read "career_plus" on the page, which is a
 * database value rather than a name, and every plan looked the same.
 *
 * The rules now are:
 *
 *   - each tier has one identity: a name and a colour of its own;
 *   - the tier comes from the plan the server resolved, and the browser only
 *     draws what it is given;
 *   - the colours live in the stylesheet, and the code never hard-codes one,
 *     so the palette can be adjusted without touching a component.
 *
 * These are pure: they need no database and no server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PLAN_IDENTITY_TIERS,
  isUpgrade,
  nextTier,
  planIdentityFor,
  planIdentityForTier,
  resolvePlanIdentityTier,
} from '../shared/planIdentity.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

describe('the subscription tier identities', () => {
  it('knows four tiers, lowest first', () => {
    assert.deepEqual(PLAN_IDENTITY_TIERS, ['free', 'plus', 'pro', 'ultra']);
  });

  it('maps the catalogue\'s own plan codes onto the tiers', () => {
    assert.equal(resolvePlanIdentityTier('free'), 'free');
    assert.equal(resolvePlanIdentityTier('student'), 'plus');
    assert.equal(resolvePlanIdentityTier('pro'), 'pro');
    assert.equal(resolvePlanIdentityTier('career_plus'), 'ultra');
  });

  it('also understands the tier names themselves', () => {
    // The catalogue may be renamed to these; the identity must not have to
    // change when it is.
    assert.equal(resolvePlanIdentityTier('plus'), 'plus');
    assert.equal(resolvePlanIdentityTier('ultra'), 'ultra');
  });

  it('is not fooled by the case or the spacing of a code', () => {
    assert.equal(resolvePlanIdentityTier('  CAREER_PLUS '), 'ultra');
    assert.equal(resolvePlanIdentityTier('Pro'), 'pro');
  });

  it('falls back to the free tier for a code it does not know', () => {
    assert.equal(resolvePlanIdentityTier('enterprise'), 'free');
    assert.equal(resolvePlanIdentityTier(null), 'free');
    assert.equal(resolvePlanIdentityTier(undefined), 'free');
    assert.equal(resolvePlanIdentityTier(''), 'free');
  });

  it('gives every tier its own colour', () => {
    const accents = PLAN_IDENTITY_TIERS.map(
      (tier) => planIdentityForTier(tier).accentVar,
    );
    assert.equal(new Set(accents).size, PLAN_IDENTITY_TIERS.length);
  });

  it('names the tiers rather than the codes', () => {
    assert.equal(planIdentityFor('career_plus').label, 'Ultra');
    assert.equal(planIdentityFor('student').label, 'Plus');
    assert.equal(planIdentityFor('pro').label, 'Pro');
    assert.equal(planIdentityFor('free').label, 'Free');
  });

  it('marks only the free tier as free', () => {
    assert.equal(planIdentityFor('free').isFree, true);
    for (const tier of PLAN_IDENTITY_TIERS.filter((value) => value !== 'free')) {
      assert.equal(planIdentityForTier(tier).isFree, false);
    }
  });

  it('only ever offers a step up', () => {
    assert.equal(isUpgrade('free', 'plus'), true);
    assert.equal(isUpgrade('plus', 'pro'), true);
    assert.equal(isUpgrade('pro', 'ultra'), true);
    assert.equal(isUpgrade('plus', 'free'), false);
    assert.equal(isUpgrade('pro', 'pro'), false);
  });

  it('knows the top of the ladder', () => {
    assert.equal(nextTier('free'), 'plus');
    assert.equal(nextTier('plus'), 'pro');
    assert.equal(nextTier('pro'), 'ultra');
    assert.equal(nextTier('ultra'), null);
  });

  it('has a colour defined for every tier in the stylesheet', () => {
    const stylesheet = readFileSync(join(REPO_ROOT, 'src', 'index.css'), 'utf8');
    for (const tier of PLAN_IDENTITY_TIERS) {
      const identity = planIdentityForTier(tier);
      assert.ok(
        stylesheet.includes(`${identity.accentVar}:`),
        `the stylesheet must define ${identity.accentVar}`,
      );
      assert.ok(
        stylesheet.includes(`${identity.surfaceVar}:`),
        `the stylesheet must define ${identity.surfaceVar}`,
      );
    }
  });

  it('does not hard-code a colour in the identity module', () => {
    const source = readFileSync(join(REPO_ROOT, 'shared', 'planIdentity.ts'), 'utf8');
    // A hex colour in the identity module would mean the palette is in two
    // places, and the stylesheet could no longer be the one that decides.
    assert.ok(
      !/#[0-9a-fA-F]{3,8}\b/.test(source),
      'the identity module must name custom properties, not colours',
    );
  });
});
