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
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  ExternalLink,
  FileText,
  GraduationCap,
  MapPin,
  Scale,
  Sparkles,
} from 'lucide-react';
import type { JobRecommendation, MatchedJob, RecommendationBasis } from '../../lib/jobsApi';
import { JOB_SOURCE_LABELS } from '../../../shared/jobs';

interface RecommendedJobsPanelProps {
  recommendations: JobRecommendation[];
  /** What the ranking was based on. */
  basis: RecommendationBasis | null;
  /** True while the recommendations are being fetched. */
  loading: boolean;
  /** The reason the recommendations could not be fetched, when they could not. */
  error: string | null;
  /** Adds a posting to the comparison. */
  onCompare: (jobId: string) => void;
  /** The postings already in the comparison. */
  comparingIds: string[];
  /** Saved vacancies */
  bookmarkedJobIds?: string[];
  /** Toggles bookmark */
  onToggleBookmark?: (jobId: string) => void;
  /** Starts tracking an application */
  onTrackApplication?: (item: MatchedJob) => void;
  /** Hands this vacancy to CV Studio */
  onCreateTailoredCv?: (item: MatchedJob) => void;
  /** ID currently being tracked */
  trackingId?: string | null;
  /** ID currently being tailored */
  tailoringId?: string | null;
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
  bookmarkedJobIds = [],
  onToggleBookmark,
  onTrackApplication,
  onCreateTailoredCv,
  trackingId,
  tailoringId,
  t,
}) => {
  if (loading) {
    return (
      <section
        aria-label={t('Recommended for you')}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary-text)]">
          <Sparkles className="h-4 w-4 animate-spin text-[var(--color-ai)]" />
          <span>{t('Finding openings that fit your record…')}</span>
        </div>
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

  if (!recommendations.length || !basis) return null;

  return (
    <section
      aria-label={t('Recommended for you')}
      className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
    >
      <header className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary-text)]">
          <Sparkles className="h-4 w-4 text-[var(--color-ai)]" />
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
          const { job, match } = recommendation;
          const comparing = comparingIds.includes(job.id);
          const isBookmarked = bookmarkedJobIds.includes(job.id);
          const matchedItem: MatchedJob = { job, match };
          const applyLink = job.applyUrl ?? job.url;
          const applyLabel = job.publisher
            ? t('Apply on {publisher}').replace('{publisher}', job.publisher)
            : t('Apply for this job');
          const description = (job.description ?? '').trim();
          const hasDescription = description.length > 0;
          const isTracking = trackingId === job.id;
          const isTailoring = tailoringId === job.id;

          return (
            <li
              key={job.id}
              className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {job.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {job.company}
                    </span>
                    {job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </span>
                    )}
                    {job.isInternship && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ai-surface)] px-2 py-0.5 font-semibold text-[var(--color-ai)]">
                        <GraduationCap className="h-3 w-3" />
                        {t('Internship')}
                      </span>
                    )}
                    {job.isRemote === true && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
                        {t('Remote')}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-main)] px-2 py-0.5 font-semibold text-[var(--text-primary)]">
                      {JOB_SOURCE_LABELS[job.source] ?? job.source}
                      {job.publisher && job.publisher !== JOB_SOURCE_LABELS[job.source] && (
                        <span className="font-normal text-[var(--text-secondary)]">
                          {t('via {publisher}').replace('{publisher}', job.publisher)}
                        </span>
                      )}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-ai-surface)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ai)]">
                    {t('Your fit: {score}%').replace('{score}', String(match.score))}
                  </span>
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

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                {applyLink ? (
                  <a
                    href={applyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{applyLabel}</span>
                  </a>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {t('This posting gives no application link.')}
                  </span>
                )}

                {onCreateTailoredCv && (
                  <button
                    type="button"
                    onClick={() => onCreateTailoredCv(matchedItem)}
                    disabled={!hasDescription || isTailoring}
                    aria-label={t('Create a tailored CV for {title}').replace('{title}', job.title)}
                    title={
                      hasDescription
                        ? undefined
                        : t('This posting gives no description, so there is nothing to tailor a CV from.')
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)] disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <FileText className="h-3 w-3" />
                    <span>{t('Create Tailored CV')}</span>
                  </button>
                )}

                {onToggleBookmark && (
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(job.id)}
                    aria-pressed={isBookmarked}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
                  >
                    {isBookmarked ? (
                      <BookmarkCheck className="h-3 w-3" />
                    ) : (
                      <Bookmark className="h-3 w-3" />
                    )}
                    <span>{isBookmarked ? t('Saved') : t('Save')}</span>
                  </button>
                )}

                {onTrackApplication && (
                  <button
                    type="button"
                    onClick={() => onTrackApplication(matchedItem)}
                    disabled={isTracking}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    <span>{t('Track application')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onCompare(job.id)}
                  aria-pressed={comparing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
                >
                  <Scale className="h-3 w-3" />
                  <span>{comparing ? t('In the comparison') : t('Compare')}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default RecommendedJobsPanel;
