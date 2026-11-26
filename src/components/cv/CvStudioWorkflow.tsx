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
 * Each step is a card of its own: its number, its name, and the state it is
 * in. The earlier version packed five labels, five two-pixel circles and four
 * connectors into a fifty-pixel strip, which read as one long sentence rather
 * than five places. The strip below the cards says how far along the path is,
 * and the current step is named for a screen reader as well as shown.
 */

import React from 'react';
import { Check } from 'lucide-react';
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

  return (
    <nav
      aria-label={t('CV Studio workflow')}
      data-cv-steps
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3.5 shadow-xs"
    >
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {CV_STUDIO_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = step.id === activeStepId;
          // A step opens the first tab it owns; the tabs it owns beyond that
          // are reached from inside the step.
          const target = step.tabs[0];
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectTab(target)}
                aria-current={active ? 'step' : undefined}
                data-tour={step.id === 'improve' ? 'cv-tailor-tab' : undefined}
                className={`flex h-full w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-start transition-colors ${
                  active
                    ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-secondary)]/60'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    active
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : done
                        ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] ring-1 ring-[var(--accent-primary)]/40'
                        : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                  }`}
                >
                  {/* A finished step is marked as finished. The number it
                      carried is still in the name of the step for anyone who
                      needs it, and a tick is a faster read than a digit. */}
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('Step')} {index + 1}
                  </span>
                  <span
                    className={`block truncate text-xs font-semibold ${
                      active ? 'text-[var(--color-primary-text)]' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {labels[step.id]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* How far along the path is, in one line rather than four connectors. */}
      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-300"
            style={{ width: `${((currentIndex + 1) / CV_STUDIO_STEPS.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
          {currentIndex + 1} / {CV_STUDIO_STEPS.length}
        </span>
      </div>

      {/* The step that is current is named out loud for a screen reader. */}
      <p className="sr-only" role="status">
        {t('Step')} {currentIndex + 1} {t('of')} {CV_STUDIO_STEPS.length}:{' '}
        {labels[activeStepId]}
      </p>
    </nav>
  );
};
