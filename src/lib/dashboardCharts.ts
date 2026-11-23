/**
 * The two charts in the dashboard's overview, worked out from the metrics.
 *
 * WHY THIS IS A SEPARATE FILE
 * ---------------------------
 * The dashboard is the first screen a candidate sees, and the charts on it are
 * the only place the career numbers are drawn. Keeping the derivation here
 * means the series can be checked without standing up the whole application:
 * the tests call these functions with plain metrics and read the series back.
 *
 * WHAT THEY MAY AND MAY NOT SAY
 * -----------------------------
 * Every value comes from `CareerMetrics`, which is computed once from the
 * candidate's own records. Nothing here estimates, rounds up or fills a gap to
 * make a chart look complete: a skill that was never started is counted as
 * "not started", not as a zero-length slice that silently disappears, and a
 * stage with no progress is a zero bar rather than a missing one.
 */

import {
  CAREER_JOURNEY_STAGES,
  CAREER_JOURNEY_STAGE_LABELS,
  type CareerMetrics,
} from '../../shared/careerMetrics';
import type { ChartDatum } from '../components/charts';

/** The translation function the interface hands down. */
type Translate = (key: string) => string;

/**
 * The five journey stages as bars, in the catalogue's own order.
 *
 * The order is fixed by `CAREER_JOURNEY_STAGES` rather than by the values, so a
 * stage keeps its place as the candidate moves through the journey — a bar that
 * jumps to another position because its number changed would make the chart
 * unreadable between visits.
 */
export function stageChartSeries(metrics: CareerMetrics, t: Translate): ChartDatum[] {
  return CAREER_JOURNEY_STAGES.map((stage) => {
    const value = Math.round(metrics.stageProgress[stage] ?? 0);
    return {
      key: stage,
      label: t(CAREER_JOURNEY_STAGE_LABELS[stage]),
      value,
      hint: `${value}%`,
    };
  });
}

/** True when at least one stage has moved, so the bars say something. */
export function stageChartHasData(series: ChartDatum[]): boolean {
  return series.some((entry) => entry.value > 0);
}

/**
 * The target role's skills, split by how well each one is proven.
 *
 * The identity is `total = mastered + claimed only + not started`, so the donut
 * is a share of a whole that adds up to the number of skills the role asks for.
 * Slices with a value of zero are dropped: a legend entry for "0 mastered" adds
 * a word without adding a fact.
 */
export function skillChartSeries(metrics: CareerMetrics, t: Translate): ChartDatum[] {
  const notStarted = Math.max(
    0,
    metrics.skillsTotal - metrics.skillsMastered - metrics.skillsClaimedOnly
  );

  return [
    {
      key: 'mastered',
      label: t('Mastered with proof'),
      value: metrics.skillsMastered,
      color: 'var(--color-success-strong)',
      hint: t('Assessed or evidenced at the level the role asks for.'),
    },
    {
      key: 'claimed',
      label: t('Claimed only'),
      value: metrics.skillsClaimedOnly,
      color: 'var(--color-warning)',
      hint: t('You say you can do this, but nothing on the platform confirms it yet.'),
    },
    {
      key: 'not-started',
      label: t('Not started'),
      value: notStarted,
      color: 'var(--text-muted)',
      hint: t('Still below the level the role asks for.'),
    },
  ].filter((entry) => entry.value > 0);
}

/** The figure in the middle of the donut: what is proven, out of what is asked. */
export function skillChartCenter(metrics: CareerMetrics): string {
  return `${metrics.skillsMastered}/${metrics.skillsTotal}`;
}
