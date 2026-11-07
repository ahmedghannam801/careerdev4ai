/**
 * The workflow of the CV Studio.
 * ------------------------------------------------------------------
 * The studio is one workspace, and this is the path through it. It is the
 * studio's ONLY navigation: five steps, in the order a candidate actually
 * takes them, so the place a screen used to be is now a step in a journey
 * rather than a screen to find.
 *
 *   My CV              the document, the records it is built from, its history
 *   Import and review  reading a CV before anything is written
 *   Analyze            the measurement of the document
 *   Improve            the job the document is written for
 *   Export             the finished document
 *
 * The steps own the tabs of the studio, so every one of them is one click
 * away and nothing has to be opened somewhere else to be finished. A tab that
 * belongs to a step — the version history belongs to "My CV" — highlights that
 * step instead of asking for a sixth destination.
 *
 * The highlight travels between the steps with the same motion as the rest
 * of the product, and collapses to an instant change when the visitor asks
 * for reduced motion. On a narrow screen the steps scroll sideways rather
 * than wrapping into a tall block or breaking out of the card.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';
import {
  CV_STUDIO_STEPS,
  cvStudioStepForTab,
  type CvStudioStepId,
  type CvStudioTab,
} from '../../lib/routing';

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

  // The labels are the studio's own words, so the journey reads the same way
  // in every language the product speaks.
  const labels: Record<CvStudioStepId, string> = {
    cv: t('My CV'),
    import: t('Import and review'),
    analyze: t('Analyze'),
    improve: t('Improve'),
    export: t('Export'),
  };

  const activeStepId = cvStudioStepForTab(activeTab);
  const currentIndex = Math.max(
    0,
    CV_STUDIO_STEPS.findIndex((step) => step.id === activeStepId)
  );

  const transition = {
    duration: reduced ? 0 : MOTION_DURATION.ui,
    ease: MOTION_EASE.out,
  };

  return (
    <nav
      aria-label={t('CV Studio workflow')}
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
    >
      <ol className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {CV_STUDIO_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = step.id === activeStepId;
          // A step opens the first tab it owns; the tabs it owns beyond that
          // are reached from inside the step.
          const target = step.tabs[0];
          return (
            <li key={step.id} className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectTab(target)}
                aria-current={active ? 'step' : undefined}
                data-tour={step.id === 'improve' ? 'cv-tailor-tab' : undefined}
                className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-[var(--color-on-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]'
                }`}
              >
                {active && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="cv-studio-step"
                    className="absolute inset-0 rounded-lg bg-[var(--accent-primary)]"
                    transition={transition}
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                    done || active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="relative">{labels[step.id]}</span>
              </button>
              {index < CV_STUDIO_STEPS.length - 1 && (
                <span aria-hidden="true" className="h-px w-3 shrink-0 bg-[var(--border-subtle)]" />
              )}
            </li>
          );
        })}
      </ol>

      {/* The step that is current is named out loud for a screen reader. */}
      <p className="sr-only" role="status">
        {t('Step')} {currentIndex + 1} {t('of')} {CV_STUDIO_STEPS.length}:{' '}
        {labels[activeStepId]}
      </p>
    </nav>
  );
};
