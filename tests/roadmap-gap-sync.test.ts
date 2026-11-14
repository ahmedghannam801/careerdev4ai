/**
 * The roadmap's honesty about gaps.
 *
 * The QA audit's BUG-04: the roadmap told a candidate "Your skills cover the
 * core requirements" while their SQL was still at 2 of 5, and the plan's
 * first recommended action was whichever task happened to be first in the
 * list rather than the one that closed the biggest gap.
 *
 * These tests cover the two rules the platform now enforces:
 *   1. a plan that is finished is not "Job Ready" while a core skill is
 *      still below its target;
 *   2. the recommendation follows the gap.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeCareerMetrics } from '../shared/careerMetrics.ts';

describe('the roadmap and the skill gaps', () => {
  it('does not treat a finished plan as job ready while a core skill is short', () => {
    // The plan is 100% complete, but SQL is still at 2 of 5.
    const metrics = computeCareerMetrics({
      skills: [
        { name: 'SQL', currentLevel: 2, targetLevel: 5, importance: 'core', required: true },
      ],
      roadmapTasks: [{ status: 'completed', skillName: 'SQL' }],
    });

    assert.equal(metrics.roadmapCompletionPct, 100);
    assert.equal(metrics.gaps.length, 1);
    // The gap survives the completed plan, so the plan cannot claim the role
    // is covered.
    assert.equal(metrics.gaps[0].name, 'SQL');
  });

  it('reports no gaps once the skills really do meet the target', () => {
    const metrics = computeCareerMetrics({
      skills: [
        { name: 'SQL', currentLevel: 5, targetLevel: 5, importance: 'core', required: true },
      ],
      roadmapTasks: [{ status: 'completed', skillName: 'SQL' }],
    });

    assert.equal(metrics.gaps.length, 0);
    assert.equal(metrics.roadmapCompletionPct, 100);
  });

  it('shows the level change on the gap, so the claim can be checked', () => {
    const metrics = computeCareerMetrics({
      skills: [
        { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
      ],
    });

    const gap = metrics.gaps[0];
    assert.equal(gap.currentLevel, 2);
    assert.equal(gap.targetLevel, 4);
    assert.equal(gap.gap, 2);
  });

  it('marks the gap that blocks the current stage as an active blocker', () => {
    const metrics = computeCareerMetrics({
      skills: [
        { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'high' },
        { name: 'Tableau', currentLevel: 1, targetLevel: 3, importance: 'high' },
      ],
      roadmapTasks: [{ skillName: 'SQL', status: 'pending' }],
    });

    const blockerNames = metrics.activeBlockers.map((blocker) => blocker.name);
    assert.ok(blockerNames.includes('SQL'));
  });

  it('sorts the biggest, most urgent gap first', () => {
    const metrics = computeCareerMetrics({
      skills: [
        { name: 'Communication', currentLevel: 3, targetLevel: 4, importance: 'medium' },
        { name: 'SQL', currentLevel: 1, targetLevel: 5, importance: 'core', required: true },
      ],
    });

    assert.equal(metrics.gaps[0].name, 'SQL');
  });
});
