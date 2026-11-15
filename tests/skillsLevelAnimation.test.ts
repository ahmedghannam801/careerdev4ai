/**
 * The arithmetic behind the skills centre level control.
 *
 * The animation itself needs a browser, but the numbers it animates between
 * do not: the mapping from a level to a width, the clamping, and the level
 * the level-up button would set are all pure, and they are the parts that
 * decide whether the bar moves to the right place.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_SKILL_LEVEL,
  SKILL_LEVEL_SEGMENTS,
  canLevelUp,
  clampSkillLevel,
  isSegmentFilled,
  levelToPercent,
  nextSkillLevel,
} from '../src/components/skills/skillLevelAnimation.ts';

describe('skill level animation', () => {
  it('knows the ceiling of the scale', () => {
    assert.equal(MAX_SKILL_LEVEL, 5);
    assert.equal(SKILL_LEVEL_SEGMENTS, MAX_SKILL_LEVEL);
  });

  it('clamps a level to the range the platform understands', () => {
    assert.equal(clampSkillLevel(3), 3);
    assert.equal(clampSkillLevel(0), 0);
    assert.equal(clampSkillLevel(-2), 0);
    assert.equal(clampSkillLevel(9), 5);
    assert.equal(clampSkillLevel(3.4), 3);
    assert.equal(clampSkillLevel(3.6), 4);
    assert.equal(clampSkillLevel(Number.NaN), 0);
    assert.equal(clampSkillLevel(Number.POSITIVE_INFINITY), 0);
  });

  it('maps a level to the width of the bar', () => {
    assert.equal(levelToPercent(0), 0);
    assert.equal(levelToPercent(1), 20);
    assert.equal(levelToPercent(3), 60);
    assert.equal(levelToPercent(5), 100);
  });

  it('never lets the bar exceed the track', () => {
    assert.equal(levelToPercent(6), 100);
    assert.equal(levelToPercent(-4), 0);
  });

  it('takes the level-up button one step higher', () => {
    assert.equal(nextSkillLevel(0), 1);
    assert.equal(nextSkillLevel(1), 2);
    assert.equal(nextSkillLevel(4), 5);
  });

  it('stops the level-up button at the ceiling', () => {
    assert.equal(nextSkillLevel(5), 5);
    assert.equal(nextSkillLevel(12), 5);
  });

  it('knows when there is still a level to gain', () => {
    assert.equal(canLevelUp(0), true);
    assert.equal(canLevelUp(4), true);
    assert.equal(canLevelUp(5), false);
    assert.equal(canLevelUp(6), false);
  });

  it('lights exactly the segments the reached level covers', () => {
    const filledAt = (level: number) =>
      Array.from({ length: SKILL_LEVEL_SEGMENTS }, (_, index) =>
        isSegmentFilled(index, level),
      );

    assert.deepEqual(filledAt(0), [false, false, false, false, false]);
    assert.deepEqual(filledAt(1), [true, false, false, false, false]);
    assert.deepEqual(filledAt(3), [true, true, true, false, false]);
    assert.deepEqual(filledAt(5), [true, true, true, true, true]);
  });

  it('keeps the segments and the bar in agreement', () => {
    for (let level = 0; level <= MAX_SKILL_LEVEL; level += 1) {
      const lit = Array.from({ length: SKILL_LEVEL_SEGMENTS }, (_, index) =>
        isSegmentFilled(index, level),
      ).filter(Boolean).length;
      assert.equal(levelToPercent(level), (lit / SKILL_LEVEL_SEGMENTS) * 100);
    }
  });
});
