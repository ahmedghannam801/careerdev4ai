/**
 * The Progress Dashboard's activity chart.
 *
 * The chart exists to answer "am I keeping this up?" — so the only thing that
 * matters about it is that it is HONEST. These tests pin that:
 *
 *   * every week in the window is present, including empty ones, because an
 *     empty week is a fact about the candidate and not a gap in the data;
 *   * a recorded activity lands in the week it actually happened, including
 *     across a month and a year boundary;
 *   * activity outside the window is not moved into the oldest column;
 *   * an unreadable timestamp is ignored rather than counted.
 *
 * The module is pure, so the browser and these tests compute the same number.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  startOfWeek,
  weeklyActivityBuckets,
} from '../shared/progressMomentum.ts';

/** A local-time timestamp on a given day, so the test does not depend on UTC. */
function at(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

describe('weeklyActivityBuckets', () => {
  it('starts a week on Monday, whatever day it is given', () => {
    // 2026-05-06 is a Wednesday.
    const monday = startOfWeek(new Date(2026, 4, 6, 15, 30));
    assert.equal(monday.getDay(), 1);
    assert.equal(monday.getDate(), 4);
    assert.equal(monday.getHours(), 0);

    // A Monday is its own week start.
    const asMonday = startOfWeek(new Date(2026, 4, 4, 9));
    assert.equal(asMonday.getDate(), 4);

    // A Sunday belongs to the week that began six days earlier.
    const sunday = startOfWeek(new Date(2026, 4, 10, 23));
    assert.equal(sunday.getDate(), 4);
  });

  it('returns every week in the window, oldest first, with the current week last', () => {
    const buckets = weeklyActivityBuckets([], 4, new Date(2026, 4, 6, 12));

    assert.equal(buckets.length, 4);
    assert.deepEqual(
      buckets.map((bucket) => bucket.start),
      ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04']
    );
    assert.deepEqual(
      buckets.map((bucket) => bucket.isCurrent),
      [false, false, false, true]
    );
    assert.deepEqual(
      buckets.map((bucket) => bucket.count),
      [0, 0, 0, 0]
    );
  });

  it('counts an activity into the week it happened in', () => {
    const buckets = weeklyActivityBuckets(
      [
        { timestamp: at(2026, 5, 6) }, // Wednesday of the current week
        { timestamp: at(2026, 5, 4, 8) }, // Monday of the current week
        { timestamp: at(2026, 4, 29) }, // previous week
      ],
      4,
      new Date(2026, 4, 6, 18)
    );

    assert.deepEqual(
      buckets.map((bucket) => bucket.count),
      [0, 0, 1, 2]
    );
  });

  it('counts across a month and a year boundary', () => {
    const buckets = weeklyActivityBuckets(
      [
        { timestamp: at(2025, 12, 31) },
        { timestamp: at(2026, 1, 2) },
      ],
      3,
      new Date(2026, 0, 5, 12)
    );

    // 2025-12-31 is a Wednesday and 2026-01-02 a Friday: both belong to the
    // week that starts on Monday 2025-12-29.
    assert.equal(buckets[0].start, '2025-12-22');
    assert.equal(buckets[1].start, '2025-12-29');
    assert.equal(buckets[1].count, 2);
    assert.equal(buckets[2].start, '2026-01-05');
    assert.equal(buckets[2].count, 0);
    assert.equal(buckets[2].isCurrent, true);
  });

  it('leaves activity older than the window out of the oldest column', () => {
    const buckets = weeklyActivityBuckets(
      [
        { timestamp: at(2025, 1, 1) },
        { timestamp: at(2026, 4, 28) }, // inside the window
      ],
      2,
      new Date(2026, 4, 6, 12)
    );

    assert.deepEqual(
      buckets.map((bucket) => bucket.count),
      [1, 0]
    );
  });

  it('ignores a timestamp it cannot read', () => {
    const buckets = weeklyActivityBuckets(
      [
        { timestamp: 'not a date' },
        { timestamp: '' },
        { timestamp: at(2026, 5, 5) },
      ],
      2,
      new Date(2026, 4, 6, 12)
    );

    assert.equal(
      buckets.reduce((total, bucket) => total + bucket.count, 0),
      1
    );
  });

  it('never returns fewer than one week', () => {
    for (const requested of [0, -5]) {
      const buckets = weeklyActivityBuckets([], requested, new Date(2026, 4, 6));
      assert.equal(buckets.length, 1, `requested ${requested}`);
      assert.equal(buckets[0].isCurrent, true);
    }
  });

  it('falls back to the default window when the request is not a number', () => {
    const buckets = weeklyActivityBuckets([], Number.NaN, new Date(2026, 4, 6));
    assert.equal(buckets.length, 8);
    assert.equal(buckets.at(-1)?.isCurrent, true);
  });
});
