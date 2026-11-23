/**
 * The Career Timeline, as an analytics dashboard.
 * ---------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY
 * ---------------------
 * The timeline used to be drawn as a spiral. It was distinctive, and it was
 * hard to read: a marker at the centre of a spiral says nothing about how many
 * records the candidate has, how many are finished, what kind they are, or
 * when they happened. The shape was doing the work the numbers should do.
 *
 * So the timeline is a dashboard now. Every record the candidate owns is
 * counted, grouped and drawn:
 *
 *   * four figures at the top, because the first question is "how far along am
 *     I" and the answer is a number;
 *   * a donut for where the journey stands — finished, happening, still ahead;
 *   * a bar chart for what the records are — education, experience,
 *     certifications, projects, applications, milestones;
 *   * a line for when they happened, drawn only from records that carry a
 *     date;
 *   * a progress track per kind of record, so "you have three projects and one
 *     is finished" is visible at a glance;
 *   * the records themselves, with their own details one click away.
 *
 * NOTHING IS INVENTED
 * -------------------
 * Every figure is a count of the candidate's own records, worked out in
 * `lib/careerTimelineMetrics.ts`. A candidate with four records sees four. No
 * sample data, no estimate, no percentage that is not a ratio of two real
 * counts.
 *
 * The previous design's one genuinely good idea is kept: clicking a record
 * opens that record's own details, read from the record rather than
 * summarised.
 */

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Flag,
  Layers,
  TrendingUp,
} from 'lucide-react';

import {
  BarChart,
  ChartCard,
  DonutChart,
  LineChart,
  ProgressMeter,
  StatTile,
  chartColor,
  formatCount,
  formatPercent,
  type ChartDatum,
} from '../charts';
import {
  SPIRAL_LITERAL_VALUES,
  SPIRAL_STATE_LABELS,
  formatMilestoneDate,
  type SpiralMilestone,
} from '../../lib/spiralTimeline';
import { computeTimelineMetrics } from '../../lib/careerTimelineMetrics';

export interface CareerTimelineDashboardProps {
  /** The milestones, in the career's own order. */
  milestones: SpiralMilestone[];
  /** The translation helper. */
  t: (key: string) => string;
  /**
   * The language the dates and the figures are written in. A month is a word,
   * not a number: an Arabic reader should see the month in Arabic, and the
   * digits should be the reader's own.
   */
  locale?: string;
}

/** The colour each state keeps, so the donut and the list agree. */
const STATE_COLOR: Record<string, string> = {
  completed: 'var(--color-success-strong)',
  current: 'var(--accent-primary)',
  upcoming: 'var(--color-info)',
};

export const CareerTimelineDashboard: React.FC<CareerTimelineDashboardProps> = ({
  milestones,
  t,
  locale = 'en-GB',
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const metrics = useMemo(() => computeTimelineMetrics(milestones), [milestones]);

  const selected = useMemo(
    () => milestones.find((entry) => entry.id === selectedId) ?? null,
    [milestones, selectedId]
  );

  /** The state split, coloured so a state reads the same in every chart. */
  const stateData: ChartDatum[] = useMemo(
    () =>
      metrics.stateDistribution
        .filter((entry) => entry.value > 0)
        .map((entry) => ({
          key: entry.key,
          label: t(entry.label),
          value: entry.value,
          color: STATE_COLOR[entry.key],
          hint: `${t(entry.label)}: ${formatCount(entry.value, locale)}`,
        })),
    [metrics.stateDistribution, t, locale]
  );

  /** The records by kind, as the bar chart reads them. */
  const kindData: ChartDatum[] = useMemo(
    () =>
      metrics.kindDistribution
        .filter((entry) => entry.value > 0)
        .map((entry, index) => ({
          key: entry.key,
          label: t(entry.label),
          value: entry.value,
          color: chartColor(index),
        })),
    [metrics.kindDistribution, t]
  );

  /** Records per year, and the running total the line follows. */
  const timelinePoints = useMemo(
    () =>
      metrics.yearlyActivity.map((point) => ({
        label: point.label,
        value: point.cumulative,
        hint: `${point.label}: ${formatCount(point.cumulative, locale)} ${t('records in total')} · ${formatCount(
          point.value,
          locale
        )} ${t('added that year')}`,
      })),
    [metrics.yearlyActivity, locale, t]
  );

  /** The per-year counts, for the bar chart beside the line. */
  const yearBars: ChartDatum[] = useMemo(
    () =>
      metrics.yearlyActivity
        .filter((point) => point.value > 0)
        .map((point) => ({
          key: point.label,
          label: point.label,
          value: point.value,
          hint: `${point.label}: ${formatCount(point.value, locale)} ${t('records added')}`,
        })),
    [metrics.yearlyActivity, locale, t]
  );

  if (!milestones.length) {
    return (
      <div
        data-career-timeline
        className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center"
      >
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {t('Your career timeline starts here')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--text-secondary)]">
          {t(
            'Add your education, experience, certifications and projects and this dashboard will chart your progress — how much is finished, what each record is, and when it happened.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div data-career-timeline className="space-y-5">
      {/* THE FIGURES.
          Four numbers, because the first question about a journey is how far
          along it is, and a number answers that better than a shape. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t('Records in the timeline')}
          value={formatCount(metrics.total, locale)}
          hint={t('Every record you own, counted once')}
          icon={<Layers className="h-3.5 w-3.5" />}
          tone="var(--accent-primary)"
          testId="timeline-total"
        />
        <StatTile
          label={t('Completed')}
          value={formatCount(metrics.completed, locale)}
          hint={t('Finished and verified by the record itself')}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="var(--color-success-strong)"
          testId="timeline-completed"
        />
        <StatTile
          label={t('Happening now')}
          value={formatCount(metrics.current, locale)}
          hint={t('Current roles, studies and applications')}
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="var(--color-accent-strong)"
          testId="timeline-current"
        />
        <StatTile
          label={t('Journey completed')}
          value={formatPercent(metrics.completionPercent, locale)}
          hint={t('The share of your records that are finished')}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="var(--color-ai)"
          testId="timeline-completion"
        />
      </div>

      {/* WHERE THE JOURNEY STANDS, AND WHAT IT IS MADE OF. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('Where your career stands')}
          description={t(
            'Every record is finished, happening now, or still ahead. This is the split.'
          )}
          testId="timeline-state-chart"
        >
          <DonutChart
            data={stateData}
            centerValue={formatPercent(metrics.completionPercent, locale)}
            centerLabel={t('completed')}
            ariaLabel={`${t('Where your career stands')}: ${stateData
              .map((entry) => `${entry.label} ${entry.value}`)
              .join(', ')}`}
            locale={locale}
          />
        </ChartCard>

        <ChartCard
          title={t('What your records are')}
          description={t(
            'The kinds of record your timeline is built from, and how many of each.'
          )}
          testId="timeline-kind-chart"
        >
          <BarChart
            data={kindData}
            ariaLabel={`${t('What your records are')}: ${kindData
              .map((entry) => `${entry.label} ${entry.value}`)
              .join(', ')}`}
            locale={locale}
            max={Math.max(...kindData.map((entry) => entry.value), 1)}
          />
        </ChartCard>
      </div>

      {/* WHEN IT HAPPENED. Drawn only from records that state a date. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('Your records over time')}
          description={t(
            'The running total of records you had at the end of each year, from the dates your records state.'
          )}
          badge={metrics.datedCount > 0 ? formatCount(metrics.datedCount, locale) : undefined}
          empty={timelinePoints.length < 2}
          emptyMessage={t(
            'Add a start date or an end date to your records and the trend of your career appears here. A trend is never drawn from dates the records do not have.'
          )}
          footnote={
            metrics.datedCount > 0 && metrics.datedCount < metrics.total
              ? t('{count} of your records carry no date, so they are not on this line.').replace(
                  '{count}',
                  formatCount(metrics.total - metrics.datedCount, locale)
                )
              : undefined
          }
          testId="timeline-trend-chart"
        >
          <LineChart
            points={timelinePoints}
            ariaLabel={t('Your records over time')}
            locale={locale}
            height={180}
          />
        </ChartCard>

        <ChartCard
          title={t('Records added by year')}
          description={t('How many records each year contributed to your career.')}
          empty={yearBars.length === 0}
          emptyMessage={t('No record states a year yet, so there is nothing to place on this axis.')}
          testId="timeline-year-chart"
        >
          <BarChart
            data={yearBars}
            orientation="vertical"
            height={150}
            ariaLabel={t('Records added by year')}
            locale={locale}
            max={Math.max(...yearBars.map((entry) => entry.value), 1)}
          />
        </ChartCard>
      </div>

      {/* PROGRESS BY KIND — the compact indicators. */}
      <ChartCard
        title={t('Progress by record type')}
        description={t(
          'How much of each kind of record is finished. The bar is the share of that kind that is complete.'
        )}
        testId="timeline-progress-chart"
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {metrics.kindProgress.map((entry, index) => (
            <ProgressMeter
              key={entry.kind}
              label={t(entry.label)}
              value={entry.percent}
              tone={chartColor(index)}
              detail={`${formatCount(entry.completed, locale)} / ${formatCount(entry.total, locale)} · ${formatPercent(
                entry.percent,
                locale
              )}`}
            />
          ))}
        </div>
      </ChartCard>

      {/* THE RECORDS THEMSELVES, with their own details one click away. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            {t('Every record, newest first')}
          </h3>
        </div>

        <ul className="space-y-1.5" data-timeline-list>
          {[...milestones].reverse().map((entry) => {
            const isSelected = entry.id === selectedId;
            const color = STATE_COLOR[entry.state] ?? 'var(--accent-primary)';
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : entry.id)}
                  aria-expanded={isSelected}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
                    isSelected
                      ? 'border-[var(--accent-primary)]/50 bg-[var(--surface-secondary)]/60'
                      : 'border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/35'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {t(entry.label)}
                      {entry.date ? ` · ${formatMilestoneDate(entry.date, locale)}` : ''}
                    </span>
                    <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                      {entry.title || t('Untitled')}
                    </span>
                    {entry.subtitle ? (
                      <span className="block truncate text-[11px] text-[var(--text-secondary)]">
                        {entry.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ borderColor: color, color }}
                  >
                    {t(SPIRAL_STATE_LABELS[entry.state])}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* THE DETAILS OF THE RECORD THAT WAS CHOSEN. */}
      {selected ? (
        <div
          data-timeline-detail
          className="rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--surface-secondary)]/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t(selected.label)}
              </p>
              <h4 className="truncate text-sm font-bold text-[var(--text-primary)]">
                {selected.title || t('Untitled')}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            >
              {t('Close')}
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {selected.details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t(detail.label)}
                </dt>
                <dd className="truncate text-xs text-[var(--text-primary)]">
                  {SPIRAL_LITERAL_VALUES.has(detail.value) ? t(detail.value) : detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
        <Flag className="h-3 w-3" aria-hidden="true" />
        {t(
          'Every figure above is counted from your own records. Nothing on this dashboard is estimated.'
        )}
      </p>
    </div>
  );
};

export default CareerTimelineDashboard;
