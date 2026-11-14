/**
 * The career journey stepper.
 *
 * WHY THIS IS COMPACT
 * The journey has five stages — Profile, Assessment, Learning, Projects,
 * Apply — and the Dashboard used to show them as a tall vertical list of
 * cards, each one a full row of the page. The candidate had to scroll past
 * the whole journey to reach the thing they came for.
 *
 * The stepper puts all five stages on one line, marks where the candidate
 * stands, and shows the overall completion. The numbers come from the Career
 * Intelligence Engine (`shared/careerMetrics.ts`), so the percentage here is
 * the same percentage the Career Journey page shows.
 */

import React from 'react';
import { Check, CircleDot } from 'lucide-react';

import {
  CAREER_JOURNEY_STAGES,
  CAREER_JOURNEY_STAGE_LABELS,
  type CareerJourneyStage,
} from '../../../shared/careerMetrics';
import { useCareer } from '../../context/CareerContext';

export interface CareerJourneyStepperProps {
  /** The stage the candidate is standing in. */
  currentStage: CareerJourneyStage;
  /** Per-stage completion, 0..100 each. */
  stageProgress: Record<CareerJourneyStage, number>;
  /** The overall journey completion, 0..100. */
  overallPercent: number;
  /** Where a stage navigates to when it is activated. */
  onNavigate: (view: string) => void;
}

/** The page each stage belongs to. */
const STAGE_VIEWS: Record<CareerJourneyStage, string> = {
  profile: 'profile',
  assessment: 'skills',
  learning: 'learning',
  projects: 'projects',
  apply: 'applications',
};

export const CareerJourneyStepper: React.FC<CareerJourneyStepperProps> = ({
  currentStage,
  stageProgress,
  overallPercent,
  onNavigate,
}) => {
  const { t } = useCareer();

  const currentIndex = CAREER_JOURNEY_STAGES.indexOf(currentStage);

  return (
    <section
      aria-labelledby="dashboard-career-journey"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <CircleDot className="h-3 w-3" />
            {t('My career journey')}
          </div>
          <h2
            id="dashboard-career-journey"
            className="mt-0.5 text-base font-bold text-[var(--text-primary)]"
          >
            {t('Five stages from where you are to the offer')}
          </h2>
        </div>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--color-primary-text)]">
          {overallPercent}%
        </span>
      </div>

      {/* The progress rail behind the five stages. */}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-progress-track)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500"
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        {CAREER_JOURNEY_STAGES.map((stage, index) => {
          const progress = stageProgress[stage] ?? 0;
          const done = progress >= 100;
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;

          return (
            <li key={stage}>
              <button
                type="button"
                onClick={() => onNavigate(STAGE_VIEWS[stage])}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-start transition-colors ${
                  isCurrent
                    ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 hover:border-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done
                      ? 'bg-[var(--color-success-strong)] text-white'
                      : isCurrent
                        ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                        : isPast
                          ? 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                          : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">
                    {t(CAREER_JOURNEY_STAGE_LABELS[stage])}
                  </span>
                  <span className="block font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                    {progress}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default CareerJourneyStepper;
