/**
 * The figures behind the Career Timeline dashboard.
 *
 * What these lock down:
 *
 *   * every count is a count of the records that were passed in;
 *   * a record with no date is never placed on the time axis;
 *   * the colours of a kind and a state are decided once, so a second reading
 *     of the same records draws the same chart;
 *   * a candidate with nothing gets zeroes, not invented data.
 */

import { describe, expect, it } from 'vitest';

import { computeTimelineMetrics, recordYear } from '../../src/lib/careerTimelineMetrics';
import type { SpiralMilestone } from '../../src/lib/spiralTimeline';

function milestone(
  id: string,
  kind: SpiralMilestone['kind'],
  state: SpiralMilestone['state'],
  date = ''
): SpiralMilestone {
  return {
    id,
    kind,
    label: kind,
    title: id,
    subtitle: '',
    date,
    state,
    details: [],
  };
}

describe('recordYear', () => {
  it('reads the year a record states, and refuses anything that is not one', () => {
    expect(recordYear('2021-03-01')).toBe(2021);
    expect(recordYear('2021')).toBe(2021);
    expect(recordYear('')).toBeNull();
    expect(recordYear(null)).toBeNull();
    expect(recordYear('not a date')).toBeNull();
    expect(recordYear('0001-01-01')).toBeNull();
  });
});

describe('computeTimelineMetrics', () => {
  const records: SpiralMilestone[] = [
    milestone('edu', 'education', 'completed', '2018-09-01'),
    milestone('exp', 'experience', 'current', '2021-02-01'),
    milestone('cert', 'certification', 'completed', '2021-06-01'),
    milestone('proj', 'project', 'upcoming', '2023-01-01'),
    milestone('undated', 'milestone', 'completed'),
  ];

  it('counts the records it was given, and nothing else', () => {
    const metrics = computeTimelineMetrics(records);

    expect(metrics.total).toBe(5);
    expect(metrics.completed).toBe(3);
    expect(metrics.current).toBe(1);
    expect(metrics.upcoming).toBe(1);
    expect(metrics.completionPercent).toBe(60);
  });

  it('keeps the state split in a fixed order so a colour never changes meaning', () => {
    const metrics = computeTimelineMetrics(records);

    expect(metrics.stateDistribution.map((entry) => entry.key)).toEqual([
      'completed',
      'current',
      'upcoming',
    ]);
    expect(metrics.stateDistribution.map((entry) => entry.value)).toEqual([3, 1, 1]);
  });

  it('groups the records by kind and shows only the kinds the candidate has', () => {
    const metrics = computeTimelineMetrics(records);

    expect(metrics.kindProgress.map((entry) => entry.kind)).toEqual([
      'education',
      'experience',
      'certification',
      'project',
      'milestone',
    ]);
    const project = metrics.kindProgress.find((entry) => entry.kind === 'project');
    expect(project).toMatchObject({ total: 1, completed: 0, percent: 0 });
  });

  it('places only the records that state a date on the time axis', () => {
    const metrics = computeTimelineMetrics(records);

    expect(metrics.datedCount).toBe(4);
    expect(metrics.firstYear).toBe(2018);
    expect(metrics.lastYear).toBe(2023);
    // 2018, 2021 and 2023 have records; the years in between carry the
    // running total forward rather than being skipped.
    expect(metrics.yearlyActivity.map((point) => point.label)).toEqual([
      '2018',
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
    ]);
    expect(metrics.yearlyActivity.map((point) => point.value)).toEqual([1, 0, 0, 2, 0, 1]);
    expect(metrics.yearlyActivity.at(-1)?.cumulative).toBe(4);
  });

  it('answers zeroes — not invented data — for a candidate with no records', () => {
    const metrics = computeTimelineMetrics([]);

    expect(metrics.total).toBe(0);
    expect(metrics.completionPercent).toBe(0);
    expect(metrics.kindProgress).toEqual([]);
    expect(metrics.yearlyActivity).toEqual([]);
    expect(metrics.datedCount).toBe(0);
  });
});
