/**
 * The metric card and its explanation popover.
 *
 * WHY EVERY METRIC EXPLAINS ITSELF
 * The QA audit's complaint about the numbers was not that they were wrong —
 * it was that they were unexplainable. A candidate told "Role Readiness 77%"
 * had no way to find out what that 77% was made of, or what would move it.
 *
 * Every metric on the Dashboard therefore carries a popover that shows three
 * things: what the metric means, the exact formula, and the candidate's own
 * arithmetic. The wording comes from the Career Intelligence Engine, so the
 * Dashboard and the Skills Center explain the same number the same way.
 */

import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

import { explainMetric, type CareerMetrics } from '../../../shared/careerMetrics';
import { useCareer } from '../../context/CareerContext';

export interface MetricCardProps {
  /** The metric's id, used to look up its explanation. */
  metricId: 'roleReadiness' | 'skillsMastered' | 'roadmapCompletion' | 'journeyProgress';
  /** The metric's display name. */
  label: string;
  /** The big number, already formatted for display. */
  value: string;
  /** The small caption under the number. */
  hint?: string;
  /** The metrics the explanation is computed from. */
  metrics: CareerMetrics;
  /** The accent used for the icon chip. */
  tone?: 'primary' | 'success' | 'warning';
}

const TONE_CLASSES = {
  primary:
    'bg-[var(--accent-surface)] text-[var(--color-primary-text)] border-[var(--accent-primary)]/25',
  success:
    'bg-[var(--color-success-surface)] text-[var(--color-success-strong)] border-[var(--color-success-strong)]/25',
  warning:
    'bg-[var(--color-warning-surface)] text-[var(--color-warning)] border-[var(--color-warning)]/25',
} as const;

export const MetricCard: React.FC<MetricCardProps> = ({
  metricId,
  label,
  value,
  hint,
  metrics,
  tone = 'primary',
}) => {
  const { t } = useCareer();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const explanation = explainMetric(metricId, metrics);

  // The popover closes when the candidate clicks away, so it never sits open
  // over the content behind it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={t('How is this calculated?')}
        className="group w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 text-start shadow-xs transition-colors hover:border-[var(--border-strong)]"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {label}
          </span>
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${TONE_CLASSES[tone]}`}
            aria-hidden="true"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
          {value}
        </div>
        {hint ? (
          <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{hint}</div>
        ) : null}
      </button>

      {open ? (
        <div
          role="tooltip"
          className="absolute end-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-xl"
        >
          <div className="text-xs font-bold text-[var(--text-primary)]">
            {t(explanation.title)}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t(explanation.definition)}
          </p>
          <div className="mt-2 rounded-lg bg-[var(--surface-secondary)]/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('How it is calculated')}
            </div>
            <div className="mt-1 font-mono text-[10px] leading-relaxed text-[var(--text-primary)]">
              {t(explanation.arithmetic)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline"
          >
            {t('Close')}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default MetricCard;
