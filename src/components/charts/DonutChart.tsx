import { useMemo } from 'react';
import { chartColor, formatCount, shareOf, type ChartDatum } from './chartTheme';

/**
 * A donut chart, drawn as one SVG circle per segment.
 *
 * WHAT IT IS FOR
 * --------------
 * A share of a whole: how much of the career is finished, how the records are
 * distributed, how many applications reached an offer. It is genuinely worse
 * than a bar chart for comparing more than about five values, so the legend
 * beside it carries the exact number for every segment and the donut carries
 * the shape.
 *
 * The ring is drawn with `stroke-dasharray` on a circle, so a segment is one
 * short path rather than an arc computed by hand — and it animates with a
 * single transition on `stroke-dashoffset`, which the browser can composite.
 *
 * The centre holds the one number the chart exists to state. The segments are
 * separated by a gap in the ring itself, not by a white stroke, so the chart
 * keeps working on a dark surface.
 */
export interface DonutChartProps {
  data: ChartDatum[];
  /** The figure written in the middle. */
  centerValue: string;
  /** What that figure is. */
  centerLabel: string;
  /** A description of the chart for a screen reader. */
  ariaLabel: string;
  /** The reader's locale, for the digits. */
  locale?: string;
  /** Where the legend sits relative to the ring. */
  legend?: 'side' | 'below';
  /** The diameter of the ring, in pixels. */
  size?: number;
  /** The thickness of the ring, in pixels. */
  thickness?: number;
  className?: string;
  testId?: string;
}

const GAP = 1.6;

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  ariaLabel,
  locale,
  legend = 'side',
  size = 148,
  thickness = 18,
  className = '',
  testId,
}: DonutChartProps) {
  const total = useMemo(
    () => data.reduce((sum, datum) => sum + Math.max(0, datum.value), 0),
    [data]
  );

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((datum, index) => {
    const share = shareOf(datum.value, total);
    const length = (share / 100) * circumference;
    const segment = {
      datum,
      color: chartColor(index, datum),
      // A visible gap between segments, but never on a single-segment ring.
      dash: Math.max(0, length - (data.length > 1 ? GAP : 0)),
      offset,
      share,
    };
    offset += length;
    return segment;
  });

  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center ${
        legend === 'below' ? 'sm:flex-col' : ''
      } ${className}`}
      data-donut-chart={testId}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-secondary)"
            strokeWidth={thickness}
          />
          {/* The ring starts at the top and runs clockwise: -90deg turns the
              first segment from three o'clock to twelve o'clock. */}
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {segments.map((segment) => (
              <circle
                key={segment.datum.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
                className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
              >
                <title>
                  {segment.datum.hint ??
                    `${segment.datum.label}: ${formatCount(segment.datum.value, locale)} (${Math.round(
                      segment.share
                    )}%)`}
                </title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
            {centerValue}
          </span>
          <span className="max-w-[80%] text-[10px] font-medium leading-tight text-[var(--text-muted)]">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {segments.map((segment) => (
          <li key={segment.datum.key} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="min-w-0 truncate text-[var(--text-secondary)]" title={segment.datum.label}>
                {segment.datum.label}
              </span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">
              {formatCount(segment.datum.value, locale)}
              <span className="ms-1 font-normal text-[var(--text-muted)]">
                {Math.round(segment.share)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DonutChart;
