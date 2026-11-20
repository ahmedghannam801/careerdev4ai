/**
 * One live vacancy.
 *
 * The card shows only what the source stated. A field the posting did not
 * give is not displayed as an empty space with a guessed value: it is left
 * out, and what is missing is said plainly. The match against the
 * candidate's own record is shown next to it, so the fit is explained rather
 * than asserted, and the application itself always happens on the employer's
 * own page.
 *
 * The card is also where a candidate decides to tailor their CV for this
 * posting, so that decision is one button rather than a copy of the
 * description into another screen.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Calendar,
  ExternalLink,
  FileText,
  GraduationCap,
  MapPin,
  Scale,
  Sparkles,
} from 'lucide-react';
import type { MatchedJob } from '../../lib/jobsApi';
import type { JobMatchBreakdown } from '../../../shared/jobMatching';
import { JOB_SOURCE_LABELS } from '../../../shared/jobs';
import { SpotlightCard } from '../react-bits/SpotlightCard';
import { CareerImage } from '../ui/CareerImage';
import { MorphingButton } from '../motion/Morph';

interface LiveJobCardProps {
  item: MatchedJob;
  /** True when the candidate already saved this vacancy. */
  bookmarked: boolean;
  /** Saves or unsaves the vacancy. */
  onToggleBookmark: (jobId: string) => void;
  /** Starts tracking an application for this vacancy. */
  onTrackApplication: (item: MatchedJob) => void;
  /** Hands this vacancy to the CV Studio, to be tailored for it. */
  onCreateTailoredCv: (item: MatchedJob) => void;
  /** True while this vacancy's application is being created. */
  tracking: boolean;
  /** True while this vacancy is on its way to the CV Studio. */
  tailoring: boolean;
  /** Adds this vacancy to the comparison, when the screen offers one. */
  onCompare?: (item: MatchedJob) => void;
  /** True when this vacancy is already in the comparison. */
  comparing?: boolean;
  /** Translates a source string. */
  t: (key: string) => string;
}

/**
 * Whether the fit could be compared at all.
 *
 * A posting that states nothing comparable leaves every factor unevaluated.
 * That is not a score of zero: it is a comparison that was never made, and the
 * card says so rather than showing a number.
 */
function hasComparableMatch(match: JobMatchBreakdown): boolean {
  return match.factors.some((factor) => factor.evaluated);
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

/**
 * Turns the provider's employment type into a readable label.
 *
 * THE PROVIDER USUALLY DOES NOT ANSWER WITH AN ENUM HERE
 * ------------------------------------------------------
 * It takes an enum on the way in — `employment_types=INTERN` — but on the way
 * out it writes the type as free text, in the language of the posting:
 * "Full-time", "Part-time", "Internship", "Full-time and Internship",
 * "Full-time, Part-time, and Internship", and the Arabic "تدريب".
 *
 * A simple type is given the interface's own wording, in the interface's own
 * language. A compound type is shown as the posting wrote it, because
 * collapsing "Full-time, Part-time, and Internship" into one of its three
 * parts would lose what the employer actually said.
 */
function employmentLabel(value: string | null, t: (key: string) => string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const map: Record<string, string> = {
    FULLTIME: t('Full-time'),
    PARTTIME: t('Part-time'),
    CONTRACTOR: t('Contract'),
    INTERN: t('Internship'),
  };
  const upper = trimmed.toUpperCase();
  if (map[upper]) return map[upper];

  // A compound type keeps the posting's own words.
  if (/,| and |،| و /.test(trimmed)) return trimmed;

  const text = trimmed.toLowerCase();
  if (text.includes('intern')) return t('Internship');
  if (text.includes('full-time') || text.includes('full time')) return t('Full-time');
  if (text.includes('part-time') || text.includes('part time')) return t('Part-time');
  if (text.includes('contract')) return t('Contract');
  return trimmed;
}

export const LiveJobCard: React.FC<LiveJobCardProps> = ({
  item,
  bookmarked,
  onToggleBookmark,
  onTrackApplication,
  onCreateTailoredCv,
  tracking,
  tailoring,
  onCompare,
  comparing,
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

  // A CV can only be tailored for a posting that describes the job, so a
  // posting without a description cannot be handed to the studio. The reason
  // is said in the card rather than left to be found out later.
  const hasDescription = description.trim().length > 0;
  const tailorReasonId = `tailored-cv-reason-${job.id}`;

  const matchedSkills = match.requiredSkills.matched;
  const missingSkills = match.requiredSkills.missing;
  const comparable = hasComparableMatch(match);

  const scoreTone =
    !comparable
      ? 'text-[var(--text-muted)]'
      : match.score >= 70
        ? 'text-[var(--color-success-strong)]'
        : match.score >= 40
          ? 'text-[var(--color-warning)]'
          : 'text-[var(--text-secondary)]';

  return (
    // The card IS the article, so the screen reader is told what this thing
    // is without an extra element in between. The glow follows the pointer.
    <SpotlightCard
      as="article"
      className="flex h-full flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
    >
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <CareerImage
            category={job.title}
            src={job.logoUrl}
            alt={job.company}
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
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
              {employmentLabel(job.employmentType, t)}
            </span>
          )}
          {/* A placement is not a job. The posting said so, and the badge says
              so too, so the candidate never has to guess which they are
              looking at. */}
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
          {/* Which board the posting came from. The platform does not edit
              these postings, so the board is named on every one of them. */}
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-main)] px-2 py-0.5 font-semibold text-[var(--text-primary)]">
            {JOB_SOURCE_LABELS[job.source] ?? job.source}
            {job.publisher && job.publisher !== JOB_SOURCE_LABELS[job.source] && (
              <span className="font-normal text-[var(--text-secondary)]">
                {t('via {publisher}').replace('{publisher}', job.publisher)}
              </span>
            )}
          </span>
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
        {!comparable ? (
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
                {t('({matched} of {total} skills in your profile)').replace('{matched}', String(matchedSkills.length)).replace('{total}', String(matchedSkills.length + missingSkills.length))}
              </span>
            </p>

            {matchedSkills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {matchedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success-strong)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            {missingSkills.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t('Skills to build')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {missingSkills.slice(0, 8).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-primary)]"
                    >
                      {skill}
                    </span>
                  ))}
                  {missingSkills.length > 8 && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {t('+{count} more').replace('{count}', String(missingSkills.length - 8))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {hasDescription ? (
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
      ) : (
        <p id={tailorReasonId} className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {t('This posting gives no description, so there is nothing to tailor a CV from.')}
        </p>
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

        {/*
          The save button morphs as the vacancy is saved: the bookmark opens
          into a disc with a tick in it, and the label changes underneath it
          without the button moving.
        */}
        <MorphingButton
          variant="secondary"
          state={bookmarked ? 'success' : 'idle'}
          icon={<Bookmark className="h-3.5 w-3.5" />}
          label={t('Save')}
          successLabel={t('Saved')}
          aria-pressed={bookmarked}
          onClick={() => onToggleBookmark(job.id)}
        />

        <MorphingButton
          variant="secondary"
          state={tracking ? 'loading' : 'idle'}
          label={t('Track application')}
          loadingLabel={t('Tracking…')}
          disabled={tracking}
          onClick={() => onTrackApplication(item)}
        />

        {/* The comparison is offered only where the screen offers one, so the
            card does not show a button that would do nothing. */}
        {onCompare && (
          <button
            type="button"
            onClick={() => onCompare(item)}
            aria-pressed={comparing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
          >
            <Scale className="h-3.5 w-3.5" />
            <span>{comparing ? t('In the comparison') : t('Compare')}</span>
          </button>
        )}

        <MorphingButton
          variant="secondary"
          state={tailoring ? 'loading' : 'idle'}
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t('Create Tailored CV')}
          loadingLabel={t('Preparing…')}
          disabled={!hasDescription || tailoring}
          aria-describedby={hasDescription ? undefined : tailorReasonId}
          aria-label={t('Create a tailored CV for {title}').replace('{title}', job.title)}
          title={
            hasDescription
              ? undefined
              : t('This posting gives no description, so there is nothing to tailor a CV from.')
          }
          onClick={() => onCreateTailoredCv(item)}
        />
      </footer>
    </SpotlightCard>
  );
};

export default LiveJobCard;
