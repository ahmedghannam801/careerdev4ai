/**
 * The order of the entries on a CV, and the placement of the tour's
 * instruction card.
 *
 * Both are about the same thing: what the candidate sees is where they put
 * it.
 *
 * The order of the experience, the education, the certificates, the
 * languages and the projects is part of the document. It used to be derived
 * from a date on every read, so a candidate could not put the entry that
 * mattered first.
 *
 * The tour's instruction card used to be placed on top of the element it was
 * describing, and the element itself was dimmed along with the rest of the
 * page — so the one thing the instruction was talking about was the one
 * thing you could not see.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ORDERED_COLLECTIONS,
  isOrderedCollection,
  reorderCollection,
} from '../server/db/ordering.ts';

import { moveItem } from '../src/lib/profileOrderApi.ts';

import { placeTooltip } from '../src/components/onboarding/useSpotlight.ts';

describe('the order of a CV collection', () => {
  it('only accepts the collections whose order is stored', () => {
    for (const collection of ORDERED_COLLECTIONS) {
      assert.equal(isOrderedCollection(collection), true);
    }
    assert.equal(isOrderedCollection('profiles'), false);
    assert.equal(isOrderedCollection('user_preferences'), false);
    assert.equal(isOrderedCollection(''), false);
    assert.equal(isOrderedCollection(undefined), false);
  });

  it('covers the collections that appear on a CV', () => {
    assert.deepEqual(
      [...ORDERED_COLLECTIONS].sort(),
      ['certifications', 'educations', 'experiences', 'languages', 'projects']
    );
  });

  it('refuses a collection it does not know', async () => {
    // The table name is never taken from the request, so a collection that
    // is not in the list cannot be named at all.
    await assert.rejects(
      async () => reorderCollection('user-1', 'profiles' as never, ['a']),
      /Unknown collection/
    );
  });
});

describe('moving an entry', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an entry up', () => {
    assert.deepEqual(moveItem(items, 2, -1), ['a', 'c', 'b', 'd']);
  });

  it('moves an entry down', () => {
    assert.deepEqual(moveItem(items, 1, 1), ['a', 'c', 'b', 'd']);
  });

  it('leaves the list alone at the ends', () => {
    assert.deepEqual(moveItem(items, 0, -1), items);
    assert.deepEqual(moveItem(items, 3, 1), items);
  });

  it('does not modify the list it was given', () => {
    const original = [...items];
    moveItem(items, 0, 1);
    assert.deepEqual(items, original);
  });
});

describe('the placement of the tour card', () => {
  const viewport = { width: 1280, height: 800 };

  it('never covers the element it is describing', () => {
    const target = { top: 100, left: 100, width: 300, height: 120 };
    const placement = placeTooltip({
      rect: target,
      cardWidth: 380,
      cardHeight: 260,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    const overlaps =
      placement.left < target.left + target.width &&
      target.left < placement.left + 380 &&
      placement.top < target.top + target.height &&
      target.top < placement.top + 260;

    assert.equal(overlaps, false, 'the card was placed on top of the target');
  });

  it('never covers the element from the right either', () => {
    // A target on the far right, where there is no room beside it.
    const target = { top: 100, left: 1100, width: 160, height: 120 };
    const placement = placeTooltip({
      rect: target,
      cardWidth: 380,
      cardHeight: 260,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    const overlaps =
      placement.left < target.left + target.width &&
      target.left < placement.left + 380 &&
      placement.top < target.top + target.height &&
      target.top < placement.top + 260;

    assert.equal(overlaps, false, 'the card was placed on top of the target');
  });

  it('keeps the card inside the screen', () => {
    const target = { top: 600, left: 900, width: 300, height: 150 };
    const placement = placeTooltip({
      rect: target,
      cardWidth: 380,
      cardHeight: 260,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    assert.ok(placement.left >= 0);
    assert.ok(placement.top >= 0);
    assert.ok(placement.left + 380 <= viewport.width);
    assert.ok(placement.top + 260 <= viewport.height);
  });

  it('becomes a sheet on a phone', () => {
    const placement = placeTooltip({
      rect: { top: 100, left: 10, width: 340, height: 80 },
      cardWidth: 380,
      cardHeight: 260,
      viewportWidth: 390,
      viewportHeight: 780,
    });
    assert.equal(placement.placement, 'sheet');
  });

  it('centres the card when there is no target', () => {
    const placement = placeTooltip({
      rect: null,
      cardWidth: 380,
      cardHeight: 260,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    assert.equal(placement.placement, 'below');
    assert.ok(placement.left > 0);
  });
});
