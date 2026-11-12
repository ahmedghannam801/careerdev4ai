/**
 * The little "i" beside a percentage.
 *
 * WHY THIS EXISTS
 * The platform shows four percentages a candidate is judged by: role
 * readiness, roadmap completion, the CV's ATS score and profile completeness.
 * None of them said what they measured, so a candidate could not tell whether
 * a number was a good score or a gap — and a number nobody can explain is a
 * number nobody trusts.
 *
 * The tooltip answers three questions, in the order a reader asks them:
 *
 *   1. What does this number measure?   (the definition)
 *   2. How is it calculated?            (the formula, written out)
 *   3. What does it deliberately NOT measure?  (the exclusions)
 *
 * The wording lives in `shared/scoreBreakdowns.ts`, so the explanation a
 * candidate reads and the explanation the tests assert are the same words.
 */

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { SCORE_EXPLANATIONS, type ScoreId } from '../../../shared/scoreBreakdowns';
import { useCareer } from '../../context/CareerContext';

export interface ScoreInfoTooltipProps {
  /** Which score is being explained. */
  score: ScoreId;
  /** The measured value, shown in the tooltip so the reader can see it. */
  value?: number;
  className?: string;
}

export const ScoreInfoTooltip: React.FC<ScoreInfoTooltipProps> = ({
  score,
  value,
  className = '',
}) => {
  const { t } = useCareer();
  const [open, setOpen] = useState(false);
  const explanation = SCORE_EXPLANATIONS[score];
  if (!explanation) return null;

  const label = t(explanation.title);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label={t('What does this score mean?')}
        title={t('What does this score mean?')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 text-left shadow-lg"
        >
          <span className="block text-xs font-bold text-[var(--text-primary)]">
            {label}
            {typeof value === 'number' ? `: ${value}%` : ''}
          </span>

          <span className="mt-1.5 block text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t(explanation.definition)}
          </span>

          <span className="mt-2 block rounded-lg bg-[var(--surface-secondary)] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--text-primary)]">
            {t(explanation.formula)}
          </span>

          <span className="mt-2 block text-[10px] leading-relaxed text-[var(--text-muted)]">
            <span className="font-semibold">{t('It does not measure:')}</span>{' '}
            {t(explanation.excludes)}
          </span>
        </span>
      )}
    </span>
  );
};

export default ScoreInfoTooltip;
