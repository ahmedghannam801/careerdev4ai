import type { ReactNode } from 'react';
import { shareOf } from './chartTheme';

/**
 * A compact statistic.
 *
 * The figure that answers "how am I doing" belongs at the top of a screen in a
 * form the eye can read in one look: a label, the number, and the sentence
 * that says what the number is counting. It is deliberately not a chart — a
 * single value drawn as a chart is decoration.
 */
export interface StatTileProps {
  /** What the number counts. */
  label: string;
  /** The number, already formatted by the caller. */
  value: ReactNode;
  /** What the number means, or where it came from. */
  hint?: string;
  /** The icon chip. */
  icon?: ReactNode;
  /** The colour of the icon chip, as a CSS colour value. */
  tone?: string;
  /** Turns the tile into a door to the screen it counts. */
  onClick?: () => void;
  /** A stable hook for the browser checks. */
  testId?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'var(--accent-primary)',
  onClick,
  testId,
  className = '',
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] leading-relaxed text-[var(--text-muted)]">{hint}</div>
      ) : null}
    </>
  );

  const shared =
    'flex h-full min-w-0 flex-col gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 text-start shadow-xs';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`${shared} transition-colors hover:border-[var(--accent-primary)] ${className}`}
      >
        {body}
      </button>
    );
  }

  return (
    <div data-testid={testId} className={`${shared} ${className}`}>
      {body}
    </div>
  );
}

/**
 * One milestone's progress, as a track and a fill.
 *
 * The value is the state the record itself states — a finished record is full,
 * the record happening now is half way, a record still ahead is empty — so the
 * bar encodes the record's own status rather than an estimate of it.
 */
export interface ProgressMeterProps {
  label: string;
  /** How much is done, 0-100. */
  value: number;
  /** The words for the value, for example "3 of 5 records". */
  detail?: string;
  /** The fill colour. */
  tone?: string;
  className?: string;
}

export function ProgressMeter({
  label,
  value,
  detail,
  tone = 'var(--accent-primary)',
  className = '',
}: ProgressMeterProps) {
  const percent = shareOf(value, 100);
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text-primary)]" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--text-secondary)]">
          {detail ?? `${Math.round(percent)}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%`, backgroundColor: tone }}
        />
      </div>
    </div>
  );
}

export default StatTile;
