/**
 * The two charts in the dashboard's overview.
 *
 * What matters here is that the series are made of the candidate's own numbers
 * and that they add up. A donut whose slices do not total the skills the role
 * asks for is a chart that lies about the whole it claims to divide.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  skillChartCenter,
  skillChartSeries,
  stageChartHasData,
  stageChartSeries,
} from '../src/lib/dashboardCharts.ts';
import type { CareerMetrics } from '../shared/careerMetrics.ts';

const t = (key: string) => key;

function metrics(overrides: Partial<CareerMetrics> = {}): CareerMetrics {
  return {
    gaps: [],
    criticalGaps: [],
    activeBlockers: [],
    skillsMastered: 0,
    skillsTotal: 0,
    skillsClaimedOnly: 0,
    skillsBelowTarget: 0,
    roleReadinessPct: 0,
    roadmapCompletionPct: 0,
    roadmapCompleted: 0,
    roadmapTotal: 0,
    journeyProgressPct: 0,
    currentStage: 'profile',
    stageProgress: { profile: 0, assessment: 0, learning: 0, projects: 0, apply: 0 },
    ...overrides,
  } as CareerMetrics;
}

describe('the dashboard charts', () => {
  it('draws the five stages in the catalogue’s order, not in value order', () => {
    const series = stageChartSeries(
      metrics({
        stageProgress: { profile: 100, assessment: 0, learning: 40, projects: 0, apply: 0 },
      }),
      t
    );

    assert.deepEqual(
      series.map((entry) => entry.key),
      ['profile', 'assessment', 'learning', 'projects', 'apply']
    );
    // A stage that has not moved is still drawn, as a zero.
    assert.equal(series.find((entry) => entry.key === 'assessment')?.value, 0);
    assert.equal(series.find((entry) => entry.key === 'profile')?.hint, '100%');
  });

  it('says there is nothing to draw until a stage has moved', () => {
    const empty = stageChartSeries(metrics(), t);
    assert.equal(stageChartHasData(empty), false);

    const started = stageChartSeries(metrics({ stageProgress: { profile: 100, assessment: 0, learning: 0, projects: 0, apply: 0 } }), t);
    assert.equal(stageChartHasData(started), true);
  });

  it('divides the target role’s skills into proven, claimed and not started', () => {
    const series = skillChartSeries(
      metrics({ skillsTotal: 11, skillsMastered: 2, skillsClaimedOnly: 3 }),
      t
    );

    assert.deepEqual(
      series.map((entry) => [entry.key, entry.value]),
      [
        ['mastered', 2],
        ['claimed', 3],
        ['not-started', 6],
      ]
    );

    // The slices are a share of the whole, so they must add up to it.
    const total = series.reduce((sum, entry) => sum + entry.value, 0);
    assert.equal(total, 11);
  });

  it('drops the slices that are zero instead of printing a legend of zeroes', () => {
    const series = skillChartSeries(metrics({ skillsTotal: 4, skillsMastered: 4 }), t);

    assert.deepEqual(series.map((entry) => entry.key), ['mastered']);
    assert.equal(skillChartCenter(metrics({ skillsTotal: 4, skillsMastered: 4 })), '4/4');
  });

  it('never shows a negative remainder, even if two counts disagree', () => {
    // A claimed-only skill that is also counted as mastered would otherwise
    // produce a fourth slice below zero.
    const series = skillChartSeries(
      metrics({ skillsTotal: 2, skillsMastered: 2, skillsClaimedOnly: 2 }),
      t
    );

    assert.equal(series.some((entry) => entry.key === 'not-started'), false);
    assert.equal(series.every((entry) => entry.value > 0), true);
  });
});
