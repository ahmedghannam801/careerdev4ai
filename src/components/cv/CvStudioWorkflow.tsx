/**
 * The workflow of the CV Studio.
 * ------------------------------------------------------------------
 * The studio is one workspace, and this is the path through it. It names
 * the seven steps a candidate actually takes and says which part of the
 * studio each one happens in, so the place a screen used to be is now a
 * step in a journey rather than a screen to find.
 *
 * The steps are the studio's own tabs, so every step is one click away and
 * nothing has to be opened somewhere else to be finished.
 *
 * The highlight travels between the steps with the same motion as the rest
 * of the product, and collapses to an instant change when the visitor asks
 * for reduced motion.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';
import type { CvStudioTab } from '../../lib/routing';

interface StepDefinition {
  /** The label of the step. */
  label: string;
  /** The tab of the studio the step happens in. */
  tab: CvStudioTab;
}

export interface CvStudioWorkflowProps {
  /** The tab the studio is showing. */
  activeTab: CvStudioTab;
  /** Switches the studio to a tab. */
  onSelectTab: (tab: CvStudioTab) => void;
  /** The translation helper. */
  t: (key: string) => string;
}

export const CvStudioWorkflow: React.FC<CvStudioWorkflowProps> = ({
  activeTab,
  onSelectTab,
  t,
}) => {
  const reduced = useReducedMotion() ?? false;

  const steps: StepDefinition[] = [
    { label: t('Upload or select a CV'), tab: 'review' },
    { label: t('Review what was extracted'), tab: 'review' },
    { label: t('Edit and confirm it'), tab: 'editor' },
    { label: t('Run the analysis'), tab: 'ats' },
    { label: t('See the results'), tab: 'ats' },
    { label: t('Improve the CV'), tab: 'editor' },
    { label: t('Export it'), tab: 'built' },
  ];

  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.tab === activeTab)
  );

  return (
    <nav
      aria-label={t('CV Studio workflow')}
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
    >
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={`${step.tab}-${step.label}`} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectTab(step.tab)}
                aria-current={active ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                    done || active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {index + 1}
                </span>
                {step.label}
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-3 shrink-0 bg-[var(--border-subtle)]" />
              )}
            </li>
          );
        })}
      </ol>

      {/* The highlight travels rather than blinking, and the step that is
          current is named out loud for a screen reader. */}
      <motion.span
        aria-hidden="true"
        className="sr-only"
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0.01 : MOTION_DURATION.ui, ease: MOTION_EASE.out }}
      />
      <p className="sr-only" role="status">
        {t('Step')} {currentIndex + 1} {t('of')} {steps.length}: {steps[currentIndex].label}
      </p>
    </nav>
  );
};
