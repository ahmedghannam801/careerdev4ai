/**
 * The Progress page against production-shaped data.
 *
 * The Progress page reads the shared career context, which for a migrated
 * account is not the clean shape a fresh account has: skill rows may carry
 * null levels, an old `source` spelling, or no source at all, and the roadmap
 * may arrive with missing arrays. These tests feed that data to the page's
 * own calculator, so a crash on a real account is caught here rather than by
 * the candidate.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeProgressSnapshot,
  isProgressSkillMastered,
  progressSkillGap,
} from '../shared/progressMetrics.ts';

describe('the Progress page figures', () => {
  it('reads an account with no data at all', () => {
    const snapshot = computeProgressSnapshot({});

    assert.equal(snapshot.totalSkills, 0);
    assert.equal(snapshot.totalTasks, 0);
    assert.equal(snapshot.roadmapPct, 0);
    assert.equal(snapshot.masteredSkills, 0);
    assert.equal(snapshot.unverifiedAtTarget, 0);
  });

  it('reads an account whose context has not loaded yet', () => {
    const snapshot = computeProgressSnapshot({ skills: null, roadmapPhases: null });

    assert.equal(snapshot.totalSkills, 0);
    assert.equal(snapshot.totalTasks, 0);
  });

  it('survives a roadmap whose nested arrays are missing', () => {
    const snapshot = computeProgressSnapshot({
      roadmapPhases: [
        { milestones: null } as never,
        { milestones: [{ tasks: null }] } as never,
        { milestones: [{ tasks: [{ id: 'a', status: 'completed' }] }] } as never,
      ],
    });

    assert.equal(snapshot.totalTasks, 1);
    assert.equal(snapshot.completedTasks, 1);
    assert.equal(snapshot.roadmapPct, 100);
  });

  it('reads a legacy skill row whose fields are null', () => {
    const snapshot = computeProgressSnapshot({
      skills: [
        { id: 'sql', name: 'SQL', currentLevel: null, targetLevel: null, gap: null, source: null },
      ],
    });

    assert.equal(snapshot.totalSkills, 1);
    assert.equal(snapshot.skillsAtTarget, 0);
    assert.equal(snapshot.masteredSkills, 0);
    assert.equal(snapshot.inProgressSkills, 0);
  });

  it('reads a legacy skill row that carries a gap but no levels', () => {
    const snapshot = computeProgressSnapshot({
      skills: [{ id: 'sql', name: 'SQL', gap: 2 }],
    });

    assert.equal(snapshot.inProgressSkills, 1);
  });

  it('shows 10/10 at target when every skill is at 5/5, and says how many are only claimed', () => {
    const skills = Array.from({ length: 10 }, (_, index) => ({
      id: `skill-${index + 1}`,
      name: `Skill ${index + 1}`,
      currentLevel: 5,
      targetLevel: 5,
      gap: 0,
      source: 'self_reported',
    }));

    const snapshot = computeProgressSnapshot({ skills });

    assert.equal(snapshot.skillsAtTarget, 10);
    assert.equal(snapshot.totalSkills, 10);
    // Nothing backs a self-reported level, so none of the ten is mastered and
    // all ten are reported as claimed only.
    assert.equal(snapshot.masteredSkills, 0);
    assert.equal(snapshot.unverifiedAtTarget, 10);
  });

  it('counts a skill as mastered once an assessment backs it', () => {
    const snapshot = computeProgressSnapshot({
      skills: [
        { id: 'sql', name: 'SQL', currentLevel: 5, targetLevel: 5, gap: 0, source: 'assessment' },
        { id: 'py', name: 'Python', currentLevel: 5, targetLevel: 5, gap: 0, source: 'self_reported' },
      ],
    });

    assert.equal(snapshot.skillsAtTarget, 2);
    assert.equal(snapshot.masteredSkills, 1);
    assert.equal(snapshot.unverifiedAtTarget, 1);
  });

  it('does not treat a skill with no source as proven', () => {
    assert.equal(
      isProgressSkillMastered({ currentLevel: 5, targetLevel: 5 }),
      false
    );
    assert.equal(
      isProgressSkillMastered({ currentLevel: 5, targetLevel: 5, source: 'verified_evidence' }),
      true
    );
  });

  it('derives a gap when the stored one is missing', () => {
    assert.equal(progressSkillGap({ currentLevel: 2, targetLevel: 5 }), 3);
    assert.equal(progressSkillGap({ currentLevel: 5, targetLevel: 5 }), 0);
  });

  it('ignores a stale stored gap once the levels have changed', () => {
    // The row was 3/5 when the gap was written; the candidate has since
    // reached the target. The stored 2 must not keep the skill incomplete.
    assert.equal(progressSkillGap({ currentLevel: 5, targetLevel: 5, gap: 2 }), 0);
    // The reverse: a stored zero must not hide a real shortfall.
    assert.equal(progressSkillGap({ currentLevel: 2, targetLevel: 5, gap: 0 }), 3);
  });

  it('never reports a gap when the candidate is above the target', () => {
    assert.equal(progressSkillGap({ currentLevel: 5, targetLevel: 3, gap: 2 }), 0);
  });

  it('handles a missing or invalid level without inventing a gap', () => {
    assert.equal(progressSkillGap({ currentLevel: null, targetLevel: 5, gap: 2 }), 2);
    assert.equal(
      progressSkillGap({ currentLevel: Number.NaN, targetLevel: Number.NaN, gap: null }),
      0
    );
    assert.equal(progressSkillGap({}), 0);
  });

  it('keeps a legacy row that carries only a gap readable', () => {
    assert.equal(progressSkillGap({ id: 'sql', name: 'SQL', gap: 2 }), 2);
    assert.equal(progressSkillGap({ id: 'sql', name: 'SQL', gap: -1 }), 0);
  });

  it('does not count a skill whose stale gap said two as still in progress', () => {
    const snapshot = computeProgressSnapshot({
      skills: [
        { id: 'sql', name: 'SQL', currentLevel: 5, targetLevel: 5, gap: 2, source: 'assessment' },
      ],
    });

    assert.equal(snapshot.inProgressSkills, 0);
    assert.equal(snapshot.skillsAtTarget, 1);
    assert.equal(snapshot.masteredSkills, 1);
  });
});
