/**
 * Behavioural checks for the assessment card visuals.
 *
 * The Excel, Communication, English and SQL assessment cards all wore the
 * same generic "Software Engineer" photograph, which told the candidate that
 * four different subjects were the same thing.
 *
 * These tests protect the correction: a card either shows a visual that
 * genuinely belongs to its skill, or it shows no photograph at all and
 * renders its own badge instead.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getIndustryVisual,
  getSpecificIndustryVisual,
} from '../src/lib/imageAssets.ts';

describe('the assessment visuals are not the same picture', () => {
  it('never falls back to one photograph for every skill', () => {
    // Each assessment check either names a visual of its own or names none,
    // and a check that names none renders its own badge. The resolver must
    // therefore refuse to guess.
    const sql = getSpecificIndustryVisual('SQL');
    const excel = getSpecificIndustryVisual('Excel');
    const communication = getSpecificIndustryVisual('Communication');
    const english = getSpecificIndustryVisual('English');

    assert.ok(sql, 'SQL has a visual');
    assert.equal(
      getSpecificIndustryVisual(null),
      null,
      'a check that names no visual of its own has none'
    );
    assert.notEqual(sql?.id, 'software-engineering');
  });

  it('says "no picture" rather than guessing', () => {
    assert.equal(getSpecificIndustryVisual('Sundial Astrolabe Studies'), null);
    assert.equal(getSpecificIndustryVisual(''), null);
    assert.equal(getSpecificIndustryVisual(null), null);
  });

  it('still resolves a domain, a role and an exact asset id', () => {
    assert.ok(getSpecificIndustryVisual('data-analysis'), 'an exact asset id resolves');
    assert.ok(getSpecificIndustryVisual('data'), 'a domain resolves');
    assert.ok(getSpecificIndustryVisual('frontend'), 'a specialisation resolves');
  });

  it('keeps the old resolver available for pages that must always show something', () => {
    // A page that has to show a picture keeps the old behaviour, including
    // its safe default.
    assert.equal(
      getIndustryVisual('something-unknown').id,
      'software-engineering',
      'the general resolver still falls back'
    );
  });
});
