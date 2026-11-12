/**
 * The shared measurement layer for the roadmap time breakdown and the
 * progress momentum.
 *
 * These two modules are the single source of the numbers the interface
 * shows. The tests here pin the two properties that make those numbers
 * trustworthy:
 *
 *   1. The breakdown is ADDITIVE. The parts always add up to the total. A
 *      stage that says twelve hours cannot quietly hide two of them.
 *   2. The streak is HONEST. It is computed from the user's own recorded
 *      activity, so a quiet week reads zero — it is never estimated, never
 *      carried over, and never invented.
 *
 * The tests are written against the shared modules, not the React views,
 * because the server, the browser and the tests all call the same function.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TIME_BREAKDOWN_LABELS,
  TIME_BREAKDOWN_ORDER,
  addTimeBreakdowns,
  breakdownTotal,
  computeTimeBreakdown,
  emptyTimeBreakdown,
  normalizeWorkKind,
  timeBreakdownParts,
} from '../shared/roadmapTimeBreakdown.ts';
import {
  computeActivityStreak,
  groupMilestonesByYear,
  localDayKey,
} from '../shared/progressMomentum.ts';
import { explainGap } from '../shared/skillGap.ts';
import { generateRoadmapPlan } from '../shared/roadmapGenerator.ts';
import { resolveRoleDefinition } from '../shared/careerRoles.ts';

describe('roadmap time breakdown', () => {
  it('adds up to the total, exactly', () => {
    const breakdown = computeTimeBreakdown([
      { estimatedHours: 6, workKind: 'learning' },
      { estimatedHours: 4, workKind: 'practice' },
      { estimatedHours: 3, workKind: 'project' },
      { estimatedHours: 2, workKind: 'application' },
    ]);
    assert.equal(breakdownTotal(breakdown), 15);
    assert.equal(
      breakdown.learning + breakdown.practice + breakdown.project + breakdown.application,
      15
    );
  });

  it('adds up to the total for any mix of tasks', () => {
    const cases = [
      [],
      [{ estimatedHours: 1, workKind: 'learning' as const }],
      [
        { estimatedHours: 2.5, workKind: 'practice' as const },
        { estimatedHours: 7.25, workKind: 'project' as const },
      ],
      [
        { estimatedHours: 10, workKind: 'application' as const },
        { estimatedHours: 0, workKind: 'learning' as const },
        { estimatedHours: 5, workKind: 'learning' as const },
      ],
    ];
    for (const tasks of cases) {
      const expected = tasks.reduce(
        (sum, task) => sum + (task.estimatedHours ?? 0),
        0
      );
      assert.equal(breakdownTotal(computeTimeBreakdown(tasks)), expected);
    }
  });

  it('never drops an hour on the floor', () => {
    // A legacy task with no recorded work kind is counted as learning work
    // rather than being discarded, because discarding it would break the
    // additive promise.
    const breakdown = computeTimeBreakdown([
      { estimatedHours: 5 },
      { estimatedHours: 5, workKind: null },
    ]);
    assert.equal(breakdownTotal(breakdown), 10);
    assert.equal(breakdown.learning, 10);
  });

  it('normalises an unknown work kind to learning', () => {
    assert.equal(normalizeWorkKind('practice'), 'practice');
    assert.equal(normalizeWorkKind('project'), 'project');
    assert.equal(normalizeWorkKind('application'), 'application');
    assert.equal(normalizeWorkKind('learning'), 'learning');
    assert.equal(normalizeWorkKind('something-new'), 'learning');
    assert.equal(normalizeWorkKind(null), 'learning');
    assert.equal(normalizeWorkKind(undefined), 'learning');
  });

  it('ignores a negative or non-finite estimate', () => {
    const breakdown = computeTimeBreakdown([
      { estimatedHours: -5, workKind: 'learning' },
      { estimatedHours: Number.NaN, workKind: 'practice' },
      { estimatedHours: 4, workKind: 'project' },
    ]);
    assert.equal(breakdownTotal(breakdown), 4);
    assert.equal(breakdown.project, 4);
  });

  it('rolls stage breakdowns up into a plan total', () => {
    const stageOne = computeTimeBreakdown([
      { estimatedHours: 4, workKind: 'learning' },
      { estimatedHours: 2, workKind: 'practice' },
    ]);
    const stageTwo = computeTimeBreakdown([
      { estimatedHours: 3, workKind: 'project' },
      { estimatedHours: 1, workKind: 'application' },
    ]);
    const plan = addTimeBreakdowns(stageOne, stageTwo);
    assert.equal(breakdownTotal(plan), 10);
    assert.equal(plan.learning, 4);
    assert.equal(plan.practice, 2);
    assert.equal(plan.project, 3);
    assert.equal(plan.application, 1);
  });

  it('lists only the parts that have hours, in a fixed order', () => {
    const parts = timeBreakdownParts(
      computeTimeBreakdown([
        { estimatedHours: 5, workKind: 'learning' },
        { estimatedHours: 2, workKind: 'project' },
      ])
    );
    assert.deepEqual(
      parts.map((part) => part.kind),
      ['learning', 'project']
    );
    assert.equal(parts[0].sharePercent, 71);
    assert.equal(parts[1].sharePercent, 29);
  });

  it('gives every part a label', () => {
    for (const kind of TIME_BREAKDOWN_ORDER) {
      assert.ok(TIME_BREAKDOWN_LABELS[kind]);
    }
  });

  it('has an empty breakdown of zero', () => {
    assert.equal(breakdownTotal(emptyTimeBreakdown()), 0);
    assert.deepEqual(timeBreakdownParts(emptyTimeBreakdown()), []);
  });

  it('agrees with the plan the generator produces', () => {
    const role = resolveRoleDefinition('data-analyst');
    assert.ok(role);
    const plan = generateRoadmapPlan({ role, userSkills: [], resources: [] });
    const breakdown = plan.summary.timeBreakdown;
    assert.equal(
      breakdownTotal(breakdown),
      plan.summary.estimatedHours,
      'the plan summary and its breakdown must be the same number'
    );
  });
});

describe('progress momentum', () => {
  const day = (value: string) => ({ timestamp: `${value}T12:00:00.000Z` });

  it('reads the local calendar day, not the UTC one', () => {
    const key = localDayKey(new Date(2026, 0, 15, 23, 30));
    assert.equal(key, '2026-01-15');
  });

  it('counts a streak of consecutive days', () => {
    const streak = computeActivityStreak(
      [day('2026-01-10'), day('2026-01-11'), day('2026-01-12')],
      new Date(2026, 0, 12, 18, 0)
    );
    assert.equal(streak.current, 3);
    assert.equal(streak.longest, 3);
    assert.equal(streak.activeDayCount, 3);
  });

  it('keeps the streak alive on the day before the user acts', () => {
    // The user has not done anything TODAY, but they did it yesterday, so
    // the streak is not broken — it is not started.
    const streak = computeActivityStreak(
      [day('2026-01-10'), day('2026-01-11')],
      new Date(2026, 0, 12, 9, 0)
    );
    assert.equal(streak.current, 2);
  });

  it('breaks the streak after a missed day', () => {
    const streak = computeActivityStreak(
      [day('2026-01-08'), day('2026-01-09')],
      new Date(2026, 0, 12, 9, 0)
    );
    assert.equal(streak.current, 0);
    assert.equal(streak.longest, 2);
  });

  it('reads zero for a candidate who has done nothing', () => {
    const streak = computeActivityStreak([], new Date(2026, 0, 12, 9, 0));
    assert.equal(streak.current, 0);
    assert.equal(streak.longest, 0);
    assert.equal(streak.activeDayCount, 0);
    assert.equal(streak.lastActiveDay, null);
  });

  it('counts several activities on one day as one active day', () => {
    const streak = computeActivityStreak(
      [
        { timestamp: '2026-01-11T08:00:00.000Z' },
        { timestamp: '2026-01-11T20:00:00.000Z' },
      ],
      new Date(2026, 0, 11, 21, 0)
    );
    assert.equal(streak.current, 1);
    assert.equal(streak.activeDayCount, 1);
  });

  it('remembers the longest run even when it is not the current one', () => {
    const streak = computeActivityStreak(
      [
        day('2026-01-01'),
        day('2026-01-02'),
        day('2026-01-03'),
        day('2026-01-04'),
        day('2026-01-10'),
      ],
      new Date(2026, 0, 10, 20, 0)
    );
    assert.equal(streak.current, 1);
    assert.equal(streak.longest, 4);
    assert.equal(streak.activeDayCount, 5);
  });

  it('groups milestones by year, newest year first', () => {
    const groups = groupMilestonesByYear(
      [
        { id: 'a', title: 'Old', category: 'role', dateAchieved: '2024-05-01' },
        { id: 'b', title: 'New', category: 'offer', dateAchieved: '2026-01-04' },
        { id: 'c', title: 'Mid', category: 'project', dateAchieved: '2025-09-09' },
      ],
      new Date(2026, 0, 12)
    );
    assert.deepEqual(
      groups.map((group) => group.year),
      ['2026', '2025', '2024']
    );
  });

  it('keeps a milestone that has no usable date', () => {
    const groups = groupMilestonesByYear(
      [{ id: 'a', title: 'Undated', category: 'role', dateAchieved: '' }],
      new Date(2026, 0, 12)
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].milestones.length, 1);
  });
});

describe('skill gap explanation', () => {
  it('exposes the facts behind the reason', () => {
    const explanation = explainGap({
      name: 'SQL',
      category: 'technical',
      requiredLevel: 4,
      currentLevel: 2,
      gap: 2,
      priority: 'critical',
      required: true,
    });
    assert.equal(explanation.name, 'SQL');
    assert.equal(explanation.currentLevel, 2);
    assert.equal(explanation.requiredLevel, 4);
    assert.equal(explanation.met, false);
    assert.equal(explanation.urgency, 'blocks_the_role');
  });

  it('reports a met skill as met', () => {
    const explanation = explainGap({
      name: 'SQL',
      category: 'technical',
      requiredLevel: 3,
      currentLevel: 4,
      gap: 0,
      priority: 'sufficient',
      required: true,
    });
    assert.equal(explanation.met, true);
  });
});
