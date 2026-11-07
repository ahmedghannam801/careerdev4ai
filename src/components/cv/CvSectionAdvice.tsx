/**
 * The advice that belongs to a section, shown next to that section.
 *
 * The measurement produces one report about the whole CV. Showing it as one
 * block means the candidate has to work out which part of the document each
 * finding is about — which is the part they would have to change.
 *
 * This puts the advice next to the section it is about, so the link between
 * "this is weak" and "this is where you fix it" is the link the candidate
 * is already looking at.
 */

import React from 'react';
import { AlertCircle, Info, Lightbulb } from 'lucide-react';
import type { CvAnalysisReport } from '../../../shared/cvAnalysis';
import type { CvSectionKey } from '../../../shared/cvExtraction';
import { sectionAdvice } from '../../../shared/cvSectionAdvice';
import { useCareer } from '../../context/CareerContext';

interface CvSectionAdviceProps {
  /** The section the advice is about. */
  section: CvSectionKey;
  /** The measurement the advice comes from. */
  report: CvAnalysisReport | null;
  /** Called when the candidate asks for the section to be rewritten. */
  onImprove?: () => void;
  /** The label of the improve button. */
  improveLabel?: string;
}

export const CvSectionAdvice: React.FC<CvSectionAdviceProps> = ({
  section,
  report,
  onImprove,
  improveLabel,
}) => {
  const { t } = useCareer();
  const advice = sectionAdvice(report, section);

  // A section with nothing to say shows nothing. An empty box beside every
  // section would teach the candidate to ignore the ones that matter.
  if (advice.items.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-primary)]">
          <Lightbulb className="h-3.5 w-3.5 text-[var(--color-warning)]" />
          {t('What to improve here')} ({advice.items.length})
        </span>
        {onImprove && (
          <button
            type="button"
            onClick={onImprove}
            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {improveLabel ?? t('Rewrite this section')}
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {advice.items.slice(0, 6).map((item) => (
          <li key={item.id} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            <span className="shrink-0 mt-0.5">
              {item.kind === 'missing' ? (
                <AlertCircle className="h-3 w-3 text-[var(--color-danger)]" />
              ) : item.kind === 'weak' ? (
                <Info className="h-3 w-3 text-[var(--color-warning)]" />
              ) : (
                <Info className="h-3 w-3 text-[var(--text-muted)]" />
              )}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      {advice.items.length > 6 && (
        <p className="text-[10px] text-[var(--text-muted)]">
          {t('and {count} more').replace('{count}', String(advice.items.length - 6))}
        </p>
      )}
    </div>
  );
};
