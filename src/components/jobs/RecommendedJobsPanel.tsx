/**
 * The vacancies the platform recommends for this candidate.
 *
 * A recommendation is not a search result with a different colour. It is a
 * posting the platform chose, against the candidate's own record, with the
 * reason it was chosen written underneath — so the candidate can agree with
 * it, or see exactly why they do not.
 *
 * The panel says what the ranking was based on. A recommendation built from
 * a record the candidate cannot see is a recommendation they cannot judge.
 */

import React from 'react';
import { Briefcase, MapPin, Sparkles } from 'lucide-react';
import type { JobRecommendation, RecommendationBasis } from '../../lib/jobsApi';

interface RecommendedJobsPanelProps {
  recommendations: JobRecommendation[];
  /** What the ranking was based on. */
  basis: RecommendationBasis;
  /** True while the recommendations are being fetched. */
  loading: boolean;
  /** The reason the recommendations could not be fetched, when they could not. */
  error: string | null;
  /** Adds a posting to the comparison. */
  onCompare: (jobId: string) => void;
  /** The postings already in the comparison. */
  comparingIds: string[];
  /** Translates a source string. */
  t: (key: string) => string;
}

export const RecommendedJobsPanel: React.FC<RecommendedJobsPanelProps> = ({
  recommendations,
  basis,
  loading,
  error,
  onCompare,
  comparingIds,
  t,
}) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
        <p className="text-sm text-[var(--text-secondary)]">{t('Finding openings that fit your record…')}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      </section>
    );
  }

  if (!recommendations.length) return null;

  return (
    <section
      aria-label={t('Recommended for you')}
      className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5"
    >
      <header className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary-text)]">
          <Sparkles className="h-4 w-4" />
          {t('Recommended for you')}
        </h3>
        {/* What the ranking was built from, so it can be judged. */}
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {t('Chosen from your own record')}:{' '}
          {basis.skillCount > 0
            ? t('{count} skills, {level}').replace('{count}', String(basis.skillCount)).replace('{level}', basis.experienceLevel ?? t('level not stated'))
            : t('no skills recorded yet')}
          {basis.targetRole ? ` · ${basis.targetRole}` : ''}
          {basis.location ? ` · ${basis.location}` : ''}
        </p>
      </header>

      <ul className="space-y-3">
        {recommendations.map((recommendation) => {
          const comparing = comparingIds.includes(recommendation.job.id);

          return (
            <li
              key={recommendation.job.id}
              className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {recommendation.job.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {recommendation.job.company}
                    </span>
                    {recommendation.job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {recommendation.job.location}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-ai-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ai)]">
                    {t('Your fit: {score}%').replace('{score}', String(recommendation.match.score))}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCompare(recommendation.job.id)}
                    aria-pressed={comparing}
                    className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
                  >
                    {comparing ? t('In the comparison') : t('Compare')}
                  </button>
                </div>
              </div>

              {/* The reason, in words. */}
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {recommendation.reason}
              </p>

              {recommendation.highlights.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recommendation.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success-strong)]"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default RecommendedJobsPanel;
