/**
 * One live vacancy.
 *
 * The card shows only what the source stated. A field the posting did not
 * give is not displayed as an empty space with a guessed value: it is left
 * out, and what is missing is said plainly. The match against the
 * candidate's own record is shown next to it, so the fit is explained rather
 * than asserted, and the application itself always happens on the employer's
 * own page.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Calendar,
  ExternalLink,
  MapPin,
  Sparkles,
} from 'lucide-react';
import type { MatchedJob } from '../../lib/jobsApi';
import { CareerImage } from '../ui/CareerImage';

interface LiveJobCardProps {
  item: MatchedJob;
  /** True when the candidate already saved this vacancy. */
  bookmarked: boolean;
  /** Saves or unsaves the vacancy. */
  onToggleBookmark: (jobId: string) => void;
  /** Starts tracking an application for this vacancy. */
  onTrackApplication: (item: MatchedJob) => void;
  /** True while this vacancy's application is being created. */
  tracking: boolean;
  /** Translates a source string. */
  t: (key: string) => string;
}

/** Formats a date the way the platform's other dates are formatted. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Turns the provider's employment type into a readable label. */
function employmentLabel(value: string | null, t: (key: string) => string): string | null {
  if (!value) return null;
  const map: Record<string, string> = {
    FULLTIME: t('Full-time'),
    PARTTIME: t('Part-time'),
    CONTRACTOR: t('Contract'),
    INTERN: t('Internship'),
  };
  return map[value.toUpperCase()] ?? value;
}

export const LiveJobCard: React.FC<LiveJobCardProps> = ({
  item,
  bookmarked,
  onToggleBookmark,
  onTrackApplication,
  tracking,
  t,
}) => {
  const { job, match } = item;
  const [expanded, setExpanded] = useState(false);

  // The employer's own application link is preferred; the original posting
  // is the fallback. Both leave the platform.
  const applyLink = job.applyUrl ?? job.url;
  const applyLabel = job.publisher
    ? t('Apply on {publisher}').replace('{publisher}', job.publisher)
    : t('Apply for this job');

  const description = job.description ?? '';
  const isLong = description.length > 320;
  const shownDescription = expanded || !isLong ? description : `${description.slice(0, 320).trimEnd()}…`;

  const scoreTone =
    match.score === null
      ? 'text-[var(--text-muted)]'
      : match.score >= 70
        ? 'text-[var(--color-success)]'
        : match.score >= 40
          ? 'text-[var(--color-warning)]'
          : 'text-[var(--text-secondary)]';

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <CareerImage
            category={job.title}
            size="sm"
            aspectRatio="square"
            rounded="rounded-xl"
            className="h-11 w-11 shrink-0 border border-[var(--border-subtle)] object-cover shadow-xs"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[var(--text-primary)]">
                {job.title}
              </h3>
              {bookmarked && (
                <BookmarkCheck
                  className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]"
                  aria-label={t('Saved')}
                />
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className="truncate">{job.company}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {job.location}
            </span>
          )}
          {employmentLabel(job.employmentType, t) && (
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5">
              {employmentLabel(job.employmentType, t)}
            </span>
          )}
          {job.isRemote === true && (
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5">
              {t('Remote')}
            </span>
          )}
        </div>
      </header>

      {/* Freshness: only what the posting actually stated. */}
      {(job.postedAt || job.expiresAt || job.expired) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {job.expired && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-2 py-0.5 font-semibold text-[var(--color-warning)]">
              <AlertTriangle className="h-3 w-3" />
              {t('This posting has expired')}
            </span>
          )}
          {job.postedAt && !job.expired && (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Calendar className="h-3 w-3" />
              {t('Posted {date}').replace('{date}', formatDate(job.postedAt))}
            </span>
          )}
          {job.expiresAt && !job.expired && (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Calendar className="h-3 w-3" />
              {t('Closes {date}').replace('{date}', formatDate(job.expiresAt))}
            </span>
          )}
          {!job.postedAt && !job.expiresAt && (
            <span className="text-[var(--text-muted)]">{t('No date given by the posting')}</span>
          )}
        </div>
      )}

      {/* Match explanation */}
      <div data-tour="job-match-badge" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
        {match.score === null ? (
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t(
              'This posting does not list the skills it asks for, so your fit cannot be compared. Read the description and apply on the employer’s own page.'
            )}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
              <span className={scoreTone}>
                {t('Your fit: {score}%').replace('{score}', String(match.score))}
              </span>
              <span className="font-normal text-[var(--text-muted)]">
                {t('({matched} of {total} skills in your profile)').replace('{matched}', String(match.matched.length)).replace('{total}', String(match.matched.length + match.missing.length))}
              </span>
            </p>

            {match.matched.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {match.matched.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            {match.missing.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t('Skills to build')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {match.missing.slice(0, 8).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                    >
                      {skill}
                    </span>
                  ))}
                  {match.missing.length > 8 && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {t('+{count} more').replace('{count}', String(match.missing.length - 8))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="space-y-1">
          <p className="whitespace-pre-line text-[11px] leading-relaxed text-[var(--text-primary)]">
            {shownDescription}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-[11px] font-semibold text-[var(--color-primary-text)]"
            >
              {expanded ? t('Show less') : t('Show more')}
            </button>
          )}
        </div>
      )}

      {/* Facts the posting stated */}
      {(job.salary || job.minEducation || job.requiredExperience) && (
        <dl className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
          {job.salary && (
            <div>
              <dt className="text-[var(--text-muted)]">{t('Salary')}</dt>
              <dd className="text-[var(--text-secondary)]">{job.salary}</dd>
            </div>
          )}
          {job.minEducation && (
            <div>
              <dt className="text-[var(--text-muted)]">{t('Education')}</dt>
              <dd className="text-[var(--text-secondary)]">{job.minEducation}</dd>
            </div>
          )}
          {job.requiredExperience && (
            <div>
              <dt className="text-[var(--text-muted)]">{t('Experience')}</dt>
              <dd className="text-[var(--text-secondary)]">{job.requiredExperience}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Actions */}
      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        {applyLink ? (
          <a
            href={applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{applyLabel}</span>
          </a>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">
            {t('This posting gives no application link.')}
          </span>
        )}

        <button
          type="button"
          onClick={() => onToggleBookmark(job.id)}
          aria-pressed={bookmarked}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
        >
          {bookmarked ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          <span>{bookmarked ? t('Saved') : t('Save')}</span>
        </button>

        <button
          type="button"
          onClick={() => onTrackApplication(item)}
          disabled={tracking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <span>{t('Track application')}</span>
        </button>
      </footer>
    </article>
  );
};

export default LiveJobCard;
