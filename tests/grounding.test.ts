/**
 * Behavioural checks for the grounding validator.
 *
 * The grounding check is the last line of defence against a model inventing a
 * company or a metric in a user's CV. It is a heuristic, so it is tested
 * against the two things that matter: it must catch a fabricated claim, and
 * it must not punish ordinary career language.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGroundingProfile,
  findUngroundedClaims,
  groundingRules,
  stripUngroundedSentences,
} from '../server/ai/grounding.ts';

const profile = buildGroundingProfile({
  organisations: ['Meridian Health', 'Northgate University'],
  roles: ['Data Analyst', 'Support Specialist'],
  skills: ['SQL', 'Data Analysis & Reporting', 'Python for Data Analysis'],
  certifications: ['IIBA ECBA Certified Business Analysis Professional'],
  projects: ['Quarterly demand forecast'],
  freeText: [
    'Reduced reporting time by 30% by automating the weekly extract.',
    'Supported a team of 8 analysts across three regions.',
  ],
});

describe('grounding validator', () => {
  it('catches a company the user never worked for', () => {
    const claims = findUngroundedClaims(
      'Led a data transformation programme at Acme Corporation.',
      profile
    );
    assert.ok(
      claims.some((claim) => claim.claim.toLowerCase().includes('acme')),
      'a fabricated employer must be flagged'
    );
  });

  it('accepts a company the user really worked for', () => {
    const claims = findUngroundedClaims(
      'Delivered a demand forecast at Meridian Health.',
      profile
    );
    assert.equal(claims.length, 0, `unexpected claims: ${JSON.stringify(claims)}`);
  });

  it('accepts a university the user really attended', () => {
    const claims = findUngroundedClaims(
      'Studied statistics at Northgate University.',
      profile
    );
    assert.equal(claims.length, 0, `unexpected claims: ${JSON.stringify(claims)}`);
  });

  it('catches a metric the user never claimed', () => {
    const claims = findUngroundedClaims(
      'Increased revenue by 45% across the region.',
      profile
    );
    assert.ok(
      claims.some((claim) => claim.kind === 'metric'),
      'a fabricated metric must be flagged'
    );
  });

  it('accepts a metric the user did claim', () => {
    const claims = findUngroundedClaims(
      'Reduced reporting time by 30% by automating the weekly extract.',
      profile
    );
    assert.equal(
      claims.filter((claim) => claim.kind === 'metric').length,
      0,
      'a real metric must not be flagged'
    );
  });

  it('does not flag ordinary career language', () => {
    const claims = findUngroundedClaims(
      'Delivered projects on time and improved processes across the team. Managed stakeholders and communicated clearly with clients.',
      profile
    );
    assert.equal(claims.length, 0, `unexpected claims: ${JSON.stringify(claims)}`);
  });

  it('catches a link the user never supplied', () => {
    const claims = findUngroundedClaims(
      'See https://www.fake-certification.example.com/verify/1234',
      profile
    );
    assert.ok(
      claims.some((claim) => claim.kind === 'url'),
      'a fabricated link must be flagged'
    );
  });

  it('removes only the offending sentence', () => {
    const result = stripUngroundedSentences(
      'Led reporting at Meridian Health. Ran a transformation at Acme Corporation. Improved team processes.',
      profile
    );
    assert.ok(result.removed.length > 0);
    assert.ok(result.text.includes('Meridian Health'));
    assert.ok(!result.text.includes('Acme'));
    assert.ok(result.text.includes('Improved team processes'));
  });

  it('leaves a fully grounded text untouched', () => {
    const text = 'Delivered a demand forecast at Meridian Health.';
    const result = stripUngroundedSentences(text, profile);
    assert.equal(result.text, text);
    assert.equal(result.removed.length, 0);
  });

  it('publishes grounding rules that forbid invention', () => {
    const rules = groundingRules();
    assert.match(rules, /Never invent/i);
    assert.match(rules, /say exactly what is missing/i);
  });
});
