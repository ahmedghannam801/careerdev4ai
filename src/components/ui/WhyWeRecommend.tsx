/**
 * "Why we recommend this".
 *
 * WHY THIS EXISTS
 * The platform recommends courses, projects and roadmap steps. A
 * recommendation without a reason is an instruction, and instructions the
 * candidate cannot check are the ones they stop following. The callout names
 * the reason in one place, so the candidate can see whether the
 * recommendation actually applies to them — and disagree with it.
 *
 * The reason is only rendered when there IS one. A card with no explanation
 * is not given a placeholder explanation, because a made-up reason is worse
 * than an absent one.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

export interface WhyWeRecommendProps {
  /** The reason, in plain language. Nothing is rendered when it is empty. */
  reason?: string | null;
  /** Overrides the default heading. */
  title?: string;
  className?: string;
  /** Render a tighter version, for use inside a dense card. */
  compact?: boolean;
}

export const WhyWeRecommend: React.FC<WhyWeRecommendProps> = ({
  reason,
  title,
  className = '',
  compact = false,
}) => {
  const { t } = useCareer();

  const trimmed = (reason ?? '').trim();
  if (!trimmed) return null;

  return (
    <div
      className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 ${
        compact ? 'px-2.5 py-2' : 'p-3'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary-text)]">
        <Sparkles className="h-3 w-3" />
        {title ?? t('Why we recommend this')}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {trimmed}
      </p>
    </div>
  );
};
