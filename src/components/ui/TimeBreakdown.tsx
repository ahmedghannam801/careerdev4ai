/**
 * The roadmap's hours, split by the kind of work they are spent on.
 *
 * WHY THIS EXISTS
 * A stage that says "twelve hours" is not a plan until it says how those
 * hours are spent. Seven hours of courses, three of practice and two of a
 * project is a choice a candidate can make. "Twelve hours" is not.
 *
 * The bar is proportional: each part's width is its share of the total, and
 * the parts together fill the bar exactly. The numbers under it are the
 * hours, and they add up to the total that is shown beside it — the same
 * total the server computed when it generated the plan.
 *
 * The numbers come from `shared/roadmapTimeBreakdown.ts`, so the breakdown on
 * screen is the same calculation the server and the tests use.
 */

import React from 'react';
import { useCareer } from '../../context/CareerContext';
import {
  TIME_BREAKDOWN_LABELS,
  TIME_BREAKDOWN_ORDER,
  breakdownTotal,
  type RoadmapTimeBreakdown,
} from '../../../shared/roadmapTimeBreakdown';

/** The colour each kind of work is shown in, so a bar reads at a glance. */
const PART_COLORS: Record<string, string> = {
  learning: 'var(--color-primary)',
  practice: 'var(--color-accent-strong)',
  project: 'var(--color-success)',
  application: 'var(--color-warning)',
};

export interface TimeBreakdownProps {
  breakdown: RoadmapTimeBreakdown;
  /** Show the "h" suffix and the hour numbers. */
  showHours?: boolean;
  /** Show the label beside each part. */
  showLabels?: boolean;
  className?: string;
}

export const TimeBreakdown: React.FC<TimeBreakdownProps> = ({
  breakdown,
  showHours = true,
  showLabels = true,
  className = '',
}) => {
  const { t } = useCareer();
  const total = breakdownTotal(breakdown);

  // A plan with no hours has nothing to break down. Showing an empty bar
  // would suggest "zero hours" is a measurement rather than "not planned yet".
  if (total <= 0) return null;

  const parts = TIME_BREAKDOWN_ORDER.map((kind) => ({
    kind,
    hours: breakdown[kind],
    label: TIME_BREAKDOWN_LABELS[kind],
    share: (breakdown[kind] / total) * 100,
  })).filter((part) => part.hours > 0);

  return (
    <div className={className}>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        role="img"
        aria-label={parts
          .map((part) => `${t(part.label)} ${part.hours}${showHours ? ` ${t('hours')}` : ''}`)
          .join(' · ')}
      >
        {parts.map((part) => (
          <span
            key={part.kind}
            title={`${t(part.label)}: ${part.hours}${showHours ? ` ${t('hours')}` : ''}`}
            style={{ width: `${part.share}%`, backgroundColor: PART_COLORS[part.kind] }}
            className="h-full"
          />
        ))}
      </div>

      {showLabels && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {parts.map((part) => (
            <li key={part.kind} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: PART_COLORS[part.kind] }}
              />
              <span>{t(part.label)}</span>
              {showHours && (
                <span className="font-semibold text-[var(--text-secondary)]">
                  {part.hours}h
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
