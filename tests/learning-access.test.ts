/**
 * Behavioural checks for the Learning Hub's access model.
 *
 * The catalogue used to reduce every availability to "free", "free audit" or
 * "paid", and a course that was free for the first chapter wore the same
 * badge as a course anyone could finish for nothing. These tests protect
 * the two promises the learner now relies on:
 *
 *   - a resource is only ever called "100% Free" when it really is;
 *   - "Free only" never shows a resource whose content is behind a paywall.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACCESS_TIER_LABELS,
  accessTier,
  accessTierLabel,
  certificateBadge,
  completionPaceLabel,
  dedupeAcrossShelves,
  estimatedCompletionWeeks,
  isFreeOnlyEligible,
  isFullyFree,
} from '../shared/learningAccess.ts';
import { deriveResourceType } from '../shared/learningResources.ts';

describe('honest access tiers', () => {
  it('calls a genuinely free resource 100% free', () => {
    assert.equal(accessTier('free'), 'free');
    assert.equal(accessTier('youtube_free'), 'free');
    assert.equal(isFullyFree('free'), true);
    assert.equal(accessTierLabel('free'), '100% Free');
  });

  it('never calls an audit or a paid certificate 100% free', () => {
    assert.equal(accessTier('audit'), 'free_audit');
    assert.equal(accessTier('free_course_paid_certificate'), 'free_audit');
    assert.equal(isFullyFree('audit'), false);
    assert.equal(isFullyFree('free_course_paid_certificate'), false);
    assert.equal(accessTierLabel('audit'), 'Free Audit (Certificate Paid)');
  });

  it('separates a limited free trial from a free resource', () => {
    assert.equal(accessTier('free_with_limitations'), 'free_trial');
    assert.equal(isFullyFree('free_with_limitations'), false);
    assert.equal(accessTierLabel('free_with_limitations'), 'Free Trial / Limited');
  });

  it('treats a paid subscription as paid', () => {
    assert.equal(accessTier('paid'), 'paid');
    assert.equal(accessTierLabel('paid'), 'Paid Subscription');
  });

  it('treats an unknown availability as paid rather than free', () => {
    assert.equal(accessTier('something-new'), 'paid');
    assert.equal(isFreeOnlyEligible('something-new'), false);
  });

  it('gives every tier a label', () => {
    for (const tier of ['free', 'free_audit', 'free_trial', 'paid'] as const) {
      assert.ok(ACCESS_TIER_LABELS[tier].length > 0);
    }
  });
});

describe('the free only filter', () => {
  it('keeps a resource whose content is free', () => {
    assert.equal(isFreeOnlyEligible('free'), true);
    assert.equal(isFreeOnlyEligible('youtube_free'), true);
  });

  it('keeps a resource that is free to audit', () => {
    assert.equal(isFreeOnlyEligible('audit'), true);
    assert.equal(isFreeOnlyEligible('free_course_paid_certificate'), true);
  });

  it('drops a resource whose content is behind a paywall', () => {
    assert.equal(isFreeOnlyEligible('free_with_limitations'), false);
    assert.equal(isFreeOnlyEligible('paid'), false);
  });
});

describe('the certificate badge', () => {
  it('says when a certificate is included', () => {
    assert.equal(certificateBadge(true), 'Includes Certificate');
  });

  it('says when there is no certificate at all', () => {
    assert.equal(certificateBadge(false), 'Learning Content Only (No Certificate)');
  });
});

describe('the weekly pace', () => {
  it('divides the hours by the learner\'s own pace', () => {
    assert.equal(estimatedCompletionWeeks(15, 5), 3);
  });

  it('rounds up, because a plan that is short is not a plan', () => {
    assert.equal(estimatedCompletionWeeks(16, 5), 4);
    assert.equal(estimatedCompletionWeeks(1, 5), 1);
  });

  it('has no estimate when the duration is unknown', () => {
    assert.equal(estimatedCompletionWeeks(null, 5), null);
    assert.equal(estimatedCompletionWeeks(0, 5), null);
    assert.equal(estimatedCompletionWeeks(15, 0), null);
  });

  it('shows the arithmetic so the learner can check it', () => {
    assert.equal(completionPaceLabel(15, 5), '15h at 5h/week is about 3 weeks.');
    assert.equal(completionPaceLabel(10, 5), '10h at 5h/week is about 2 weeks.');
  });
});

describe('shelves never show the same course twice', () => {
  it('gives every course to its first shelf', () => {
    const shelves = dedupeAcrossShelves(
      [
        { id: 'skills', courses: [{ id: 'a' }, { id: 'b' }] },
        { id: 'role', courses: [{ id: 'a' }, { id: 'c' }] },
        { id: 'popular', courses: [{ id: 'b' }, { id: 'c' }, { id: 'd' }] },
      ],
      (course) => course.id
    );

    assert.deepEqual(shelves[0].courses.map((c) => c.id), ['a', 'b']);
    assert.deepEqual(shelves[1].courses.map((c) => c.id), ['c']);
    assert.deepEqual(shelves[2].courses.map((c) => c.id), ['d']);
  });

  it('never repeats a course across the whole page', () => {
    const shelves = dedupeAcrossShelves(
      [
        { id: 'a', courses: [{ id: 'x' }, { id: 'y' }] },
        { id: 'b', courses: [{ id: 'y' }, { id: 'z' }] },
      ],
      (course) => course.id
    );
    const ids = shelves.flatMap((shelf) => shelf.courses.map((c) => c.id));
    assert.deepEqual(ids, ['x', 'y', 'z']);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('the resource type is the truth', () => {
  it('calls an official professional certificate a course, not a playlist', () => {
    assert.equal(
      deriveResourceType({
        format: 'professional_certificate',
        provider: 'Coursera',
        url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
        title: 'Google Data Analytics Certificate',
      }),
      'course'
    );
  });

  it('still calls a real playlist a playlist', () => {
    assert.equal(
      deriveResourceType({
        format: 'playlist',
        provider: 'YouTube',
        url: 'https://www.youtube.com/playlist?list=PL123',
        title: 'SQL Playlist',
      }),
      'video_playlist'
    );
  });
});
