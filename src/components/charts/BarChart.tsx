import { useMemo } from 'react';
import {
  chartColor,
  formatCount,
  shareOf,
  type ChartDatum,
} from './chartTheme';

/**
 * A bar chart, drawn with the browser's own boxes.
 *
 * WHY NOT SVG
 * -----------
 * A bar chart is a list of labelled numbers whose length is the value. That is
 * a progress track and a row of text, both of which the browser already lays
 * out — correctly, in both reading directions, at every width, with the
 * reader's own font. Drawing it in SVG would mean re-implementing the layout
 * and would put the labels in a coordinate system that does not follow the
 * page's direction.
 *
 * Because a bar is a block element, it grows from the inline-start of its
 * track: on the left in English and on the right in Arabic, with no branch in
 * this file.
 *
 * The tooltip is pure CSS (`group-hover` / `group-focus-within`), so hovering
 * a bar never re-renders a component. The animation is one transition on a
 * width or a height, and it is removed when the reader has asked for less
 * motion.
 */
export interface BarChartProps {
  data: ChartDatum[];
  /** The direction the bars grow in. Horizontal reads best for long labels. */
  orientation?: 'horizontal' | 'vertical';
  /** The value a full bar represents. Defaults to the largest value shown. */
  max?: number;
  /** How a value is written. Defaults to a plain count. */
  formatValue?: (value: number) => string;
  /** The reader's locale, for the digits and the separators. */
  locale?: string;
  /** A description of the chart for a screen reader. */
  ariaLabel: string;
  /** The height of a vertical chart's plot area, in pixels. */
  height?: number;
  /** Show the value inside or beside each bar. */
  showValue?: boolean;
  className?: string;
  testId?: string;
}

export function BarChart({
  data,
  orientation = 'horizontal',
  max,
  formatValue,
  locale,
  ariaLabel,
  height = 160,
  showValue = true,
  className = '',
  testId,
}: BarChartProps) {
  const ceiling = useMemo(() => {
    if (typeof max === 'number' && max > 0) return max;
    const largest = data.reduce((best, datum) => Math.max(best, datum.value), 0);
    return largest > 0 ? largest : 1;
  }, [data, max]);

  const format = formatValue ?? ((value: number) => formatCount(value, locale));

  if (data.length === 0) return null;

  if (orientation === 'vertical') {
    return (
      <div className={`min-w-0 ${className}`} data-bar-chart={testId} role="img" aria-label={ariaLabel}>
        <div className="flex items-end gap-2" style={{ height }}>
          {data.map((datum, index) => {
            const ratio = Math.max(0, Math.min(1, datum.value / ceiling));
            const color = chartColor(index, datum);
            return (
              <div
                key={datum.key}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span
                  className="pointer-events-none absolute bottom-full z-10 mb-1 hidden max-w-[180px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-1 text-[10px] font-semibold text-[var(--text-primary)] shadow-md group-hover:block group-focus-within:block"
                  role="tooltip"
                >
                  {datum.hint ?? `${datum.label}: ${format(datum.value)}`}
                </span>
                {showValue ? (
                  <span className="text-[10px] font-bold tabular-nums text-[var(--text-secondary)]">
                    {format(datum.value)}
                  </span>
                ) : null}
                <div
                  tabIndex={0}
                  aria-label={`${datum.label}: ${format(datum.value)}`}
                  className="w-full max-w-[46px] rounded-t-md transition-[height] duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    height: `${Math.max(datum.value > 0 ? 3 : 0, Math.round(ratio * 100))}%`,
                    backgroundColor: color,
                    opacity: datum.value > 0 ? 1 : 0.25,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {data.map((datum) => (
            <span
              key={datum.key}
              className="min-w-0 flex-1 truncate text-center text-[10px] text-[var(--text-muted)]"
              title={datum.label}
            >
              {datum.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ul
      className={`space-y-3 ${className}`}
      data-bar-chart={testId}
      role="img"
      aria-label={ariaLabel}
    >
      {data.map((datum, index) => {
        const ratio = shareOf(datum.value, ceiling);
        const color = chartColor(index, datum);
        return (
          <li key={datum.key} className="group relative min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text-primary)]" title={datum.label}>
                {datum.label}
              </span>
              {showValue ? (
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--text-secondary)]">
                  {format(datum.value)}
                </span>
              ) : null}
            </div>
            <div
              tabIndex={0}
              aria-label={`${datum.label}: ${format(datum.value)}`}
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${ratio}%`, backgroundColor: color }}
              />
            </div>
            {datum.hint ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full start-0 z-10 mb-1 hidden max-w-[240px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-1 text-[10px] leading-relaxed text-[var(--text-secondary)] shadow-md group-hover:block group-focus-within:block"
              >
                {datum.hint}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default BarChart;
