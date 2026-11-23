import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useIsRtl } from './useIsRtl';
import { chartColor, formatCount } from './chartTheme';

/**
 * A line chart for a series that has a direction in time.
 *
 * WHEN IT IS USED
 * ---------------
 * Only when the records carry dates. A trend drawn from records that have no
 * dates would be an invented trend, so the callers pass historical series and
 * show an empty state when they have none.
 *
 * HOW IT IS DRAWN
 * ---------------
 * The plot is sized in real pixels, measured from the element itself, so the
 * points are placed where they belong at any width and the marker circles stay
 * circular — an SVG scaled with `preserveAspectRatio="none"` would flatten
 * them. The line is one polyline and the area under it is one path, so a
 * series of thirty points is two elements rather than thirty.
 *
 * The first point is on the left in English and on the right in Arabic: the
 * chart follows the reading direction of the page.
 *
 * Hovering a point shows its value. The tooltip is CSS-driven, so moving the
 * pointer across the chart does not re-render it.
 */
export interface LineChartProps {
  /** The points, in the order they happened. */
  points: Array<{ label: string; value: number; hint?: string }>;
  /** A description of the chart for a screen reader. */
  ariaLabel: string;
  /** The height of the plot area, in pixels. */
  height?: number;
  /** The colour of the line. */
  color?: string;
  /** The reader's locale, for the digits. */
  locale?: string;
  /** How a value is written. */
  formatValue?: (value: number) => string;
  className?: string;
  testId?: string;
}

const PADDING = { top: 12, right: 10, bottom: 22, left: 10 };

/** Measures the element, and keeps the measurement current on resize. */
function useMeasuredWidth(fallback: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect().width;
      if (next > 0) setWidth(Math.round(next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export function LineChart({
  points,
  ariaLabel,
  height = 180,
  color = chartColor(0),
  locale,
  formatValue,
  className = '',
  testId,
}: LineChartProps) {
  const rtl = useIsRtl();
  const [containerRef, width] = useMeasuredWidth(320);
  const format = formatValue ?? ((value: number) => formatCount(value, locale));

  const plotWidth = Math.max(40, width - PADDING.left - PADDING.right);
  const plotHeight = Math.max(40, height - PADDING.top - PADDING.bottom);

  const geometry = useMemo(() => {
    const values = points.map((point) => point.value);
    const highest = values.length ? Math.max(...values) : 0;
    const ceiling = highest > 0 ? highest : 1;
    const count = points.length;
    const step = count > 1 ? plotWidth / (count - 1) : 0;

    const coords = points.map((point, index) => {
      const x = rtl
        ? PADDING.left + plotWidth - index * step
        : PADDING.left + index * step;
      const y = PADDING.top + plotHeight - (point.value / ceiling) * plotHeight;
      return { x, y, point, ratio: point.value / ceiling };
    });

    const line = coords.map((coord) => `${coord.x},${coord.y}`).join(' ');
    const area = coords.length
      ? `M ${coords[0].x} ${PADDING.top + plotHeight} L ${coords
          .map((coord) => `${coord.x} ${coord.y}`)
          .join(' L ')} L ${coords[coords.length - 1].x} ${PADDING.top + plotHeight} Z`
      : '';

    return { coords, line, area, ceiling };
  }, [points, plotWidth, plotHeight, rtl]);

  if (points.length === 0) return null;

  // One label in four, so the axis never turns into a wall of text on a phone.
  const labelEvery = Math.max(1, Math.ceil(points.length / (width < 380 ? 3 : 6)));

  return (
    <div className={`min-w-0 ${className}`} ref={containerRef} data-line-chart={testId}>
      <div className="relative" style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          {/* The horizontal guides: a baseline and one line at the top. */}
          {[0, 0.5, 1].map((fraction) => {
            const y = PADDING.top + plotHeight * fraction;
            return (
              <line
                key={fraction}
                x1={PADDING.left}
                x2={PADDING.left + plotWidth}
                y1={y}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth={1}
                strokeDasharray={fraction === 1 ? undefined : '3 4'}
              />
            );
          })}

          {geometry.area ? (
            <path
              d={geometry.area}
              fill={color}
              opacity={0.1}
              className="transition-opacity duration-500 ease-out motion-reduce:transition-none"
            />
          ) : null}

          <polyline
            points={geometry.line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geometry.coords.map((coord, index) => (
            <g key={`${coord.point.label}-${index}`} className="group">
              <circle
                cx={coord.x}
                cy={coord.y}
                r={4}
                fill="var(--surface-main)"
                stroke={color}
                strokeWidth={2}
              />
              {/* A generous invisible target, so the tooltip is easy to reach
                  on a phone without enlarging the marker itself. */}
              <circle cx={coord.x} cy={coord.y} r={14} fill="transparent" />
              <title>
                {coord.point.hint ?? `${coord.point.label}: ${format(coord.point.value)}`}
              </title>
            </g>
          ))}

          {geometry.coords
            .filter((_coord, index) => index % labelEvery === 0 || index === points.length - 1)
            .map((coord) => (
              <text
                key={`label-${coord.point.label}-${coord.x}`}
                x={coord.x}
                y={height - 6}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-[10px]"
              >
                {coord.point.label}
              </text>
            ))}
        </svg>

        {/* The most recent value, so the chart states where the series ended
            even when the reader never hovers it. */}
        <span className="pointer-events-none absolute top-0 end-0 rounded-md bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-secondary)]">
          {format(points[points.length - 1].value)}
        </span>
      </div>
    </div>
  );
}

export default LineChart;
