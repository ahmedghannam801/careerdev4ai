import type { ReactNode } from 'react';

/**
 * The panel a chart lives in.
 *
 * A chart is never dropped bare onto a page. It sits in a card with the title
 * that says what is measured, the description that says what the measurement
 * is of, and — when there is nothing to draw — an honest empty state instead
 * of an empty axis.
 *
 * The card keeps Aionvia's own surface, border, radius and spacing. It adds no
 * glow, no gradient and no animation of its own.
 */
export interface ChartCardProps {
  /** What is measured. */
  title: string;
  /** What the measurement is of, in one sentence. */
  description?: string;
  /** A short figure shown beside the title, for example a total. */
  badge?: ReactNode;
  /** A legend, an action, or anything that belongs on the header line. */
  aside?: ReactNode;
  /** True when there is no data to draw. */
  empty?: boolean;
  /** What to say instead of a chart. Required when `empty` is true. */
  emptyMessage?: string;
  /** Extra notes under the chart, for example how a figure was worked out. */
  footnote?: string;
  className?: string;
  children?: ReactNode;
  /** A stable hook for the browser checks. */
  testId?: string;
}

export function ChartCard({
  title,
  description,
  badge,
  aside,
  empty = false,
  emptyMessage,
  footnote,
  className = '',
  children,
  testId,
}: ChartCardProps) {
  return (
    <section
      data-chart-card={testId}
      className={`flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
            {badge !== undefined && badge !== null ? (
              <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>

      {empty ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="max-w-sm text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div className="min-w-0 flex-1">{children}</div>
      )}

      {footnote ? (
        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{footnote}</p>
      ) : null}
    </section>
  );
}

export default ChartCard;
