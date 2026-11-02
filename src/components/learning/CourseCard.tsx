/**
 * The course card shared by Training & Courses and the Learning Hub.
 *
 * The card is the place where a catalogue row becomes something a learner can
 * judge: who publishes it, what it costs, how long it takes, what it teaches
 * and whether it is aimed at their role. Two rules matter:
 *
 *   - the thumbnail is never an empty grey box. It is a branded panel built
 *     from the provider's identity, with an optional real image or favicon on
 *     top. If that image fails, the branded panel remains.
 *   - FREE, FREE AUDIT and PAID are always distinguishable. An audit is never
 *     shown as a free certificate.
 */

import React, { useMemo, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Languages,
  ListVideo,
  PlayCircle,
  Presentation,
  Sparkles,
  Star,
  Target,
  Video,
  X,
  Award,
  BookMarked,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { learningActionUrl } from '../../../shared/learningLinks';
import {
  RESOURCE_TYPE_LABELS,
  officialThumbnail,
  resourceCta,
  type LearningResourceType,
} from '../../../shared/learningResources';
import {
  availabilityBucket,
  availabilityDescription,
  availabilityLabel,
  providerBrand,
  type AvailabilityBucket,
} from '../../../shared/courseProviders';
import type {
  CourseFormat,
  LearningCourse,
  LearningItem,
  LearningRecommendation,
} from '../../types/learning';

const FORMAT_LABELS: Record<CourseFormat, string> = {
  course: 'Course',
  professional_certificate: 'Professional certificate',
  learning_path: 'Learning path',
  tutorial: 'Tutorial',
  video: 'Video',
  playlist: 'Playlist',
};

const BUCKET_STYLES: Record<AvailabilityBucket, string> = {
  free: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  free_audit: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
  paid: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
};

const RESOURCE_ICONS: Record<LearningResourceType, React.ElementType> = {
  video_course: Video,
  video_playlist: ListVideo,
  course: GraduationCap,
  article: FileText,
  documentation: BookOpen,
  pdf: FileText,
  book: BookMarked,
  workshop: Presentation,
  lecture: PlayCircle,
};

function resourceLabel(course: LearningCourse): string {
  const type = course.resourceType;
  return type ? RESOURCE_TYPE_LABELS[type] : FORMAT_LABELS[course.format];
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** The branded panel behind the provider identity. */
const Thumbnail: React.FC<{ course: LearningCourse; compact?: boolean }> = ({
  course,
  compact = false,
}) => {
  const brand = useMemo(() => providerBrand(course.provider), [course.provider]);
  const type = course.resourceType;
  const Icon = type ? RESOURCE_ICONS[type] : BookOpen;
  const [imageFailed, setImageFailed] = useState(false);

  // A real thumbnail is used when the catalogue records one, or when the
  // resource is a YouTube video (the provider publishes that image). Nothing
  // is fabricated: without one, the branded panel is drawn instead.
  const thumbnail = useMemo(
    () => officialThumbnail(course.url, course.thumbnailUrl),
    [course.thumbnailUrl, course.url]
  );

  const favicon = useMemo(() => {
    const host = hostOf(course.providerUrl);
    return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null;
  }, [course.providerUrl]);

  const [faviconFailed, setFaviconFailed] = useState(false);
  const showThumbnail = Boolean(thumbnail) && !imageFailed;
  const showFavicon = !showThumbnail && Boolean(favicon) && !faviconFailed;

  return (
    <div
      className={`relative flex overflow-hidden ${
        compact ? 'h-20' : 'h-32'
      } items-center justify-center`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${brand.colors[0]} 0%, ${brand.colors[1]} 100%)`,
      }}
    >
      {showThumbnail ? (
        <img
          src={thumbnail ?? undefined}
          alt=""
          aria-hidden
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-black/10"
          />
          {showFavicon ? (
            <img
              src={favicon ?? undefined}
              alt=""
              aria-hidden
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFaviconFailed(true)}
              className={`relative z-10 rounded-xl bg-white/95 object-contain shadow-sm ${
                compact ? 'h-8 w-8 p-1' : 'h-12 w-12 p-1.5'
              }`}
            />
          ) : (
            <span
              className={`relative z-10 font-black tracking-tight ${
                compact ? 'text-xl' : 'text-3xl'
              }`}
              style={{ color: brand.textColor }}
            >
              {brand.short}
            </span>
          )}
        </>
      )}

      {showThumbnail && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        />
      )}

      <span
        className={`absolute bottom-2 left-3 z-10 truncate pe-2 font-semibold ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
        style={{ color: showThumbnail ? '#ffffff' : brand.textColor }}
        title={course.provider}
      >
        {brand.name}
      </span>

      {type && (
        <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/45 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          <Icon className="h-2.5 w-2.5 shrink-0" />
          {RESOURCE_TYPE_LABELS[type]}
        </span>
      )}
    </div>
  );
};

export interface CourseCardProps {
  course: LearningCourse;
  recommendation?: LearningRecommendation;
  item?: LearningItem;
  compact?: boolean;
  /** Hide the "why this now" block, e.g. in the full catalogue. */
  showReason?: boolean;
  showProgress?: boolean;
  onSave?: (courseId: string, reason?: string) => void;
  onStart?: (courseId: string, reason?: string) => void;
  onComplete?: (courseId: string) => void;
  onDismiss?: (courseId: string, reason?: string) => void;
  onRemove?: (courseId: string) => void;
  onProgress?: (courseId: string, percent: number) => void;
  progressDraft?: number;
  onProgressDraft?: (courseId: string, percent: number) => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  recommendation,
  item,
  compact = false,
  showReason = true,
  showProgress = false,
  onSave,
  onStart,
  onComplete,
  onDismiss,
  onRemove,
  onProgress,
  progressDraft,
  onProgressDraft,
}) => {
  const { t } = useCareer();
  const brand = useMemo(() => providerBrand(course.provider), [course.provider]);
  const bucket = availabilityBucket(course.availability);
  const badge = availabilityLabel(course.availability);
  const url = learningActionUrl(course.url);

  const reason =
    recommendation?.aiExplanation ??
    recommendation?.reason ??
    item?.recommendationReason ??
    course.description;

  const skills = (
    recommendation?.matchedSkills.length
      ? recommendation.matchedSkills
      : course.skills.map((skill) => skill.name)
  ).slice(0, compact ? 3 : 5);

  const roleRelevance = recommendation
    ? Math.round(recommendation.roleRelevance * 100)
    : null;
  const isCompleted = item?.status === 'completed';
  const isInProgress = item?.status === 'in_progress';
  const isSaved = item?.status === 'saved';
  const isDismissed = item?.status === 'dismissed';
  const draft = progressDraft ?? item?.progressPercent ?? 0;
  const showActions = Boolean(onSave || onStart || onComplete || onDismiss || onRemove || url);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] transition-colors hover:border-[var(--border-strong)]">
      <div className="relative">
        <Thumbnail course={course} compact={compact} />
        <span
          className={`absolute right-2 top-2 z-20 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur-sm ${BUCKET_STYLES[bucket]}`}
          title={availabilityDescription(course.availability)}
        >
          {badge}
        </span>
        {roleRelevance !== null && (
          <span className="absolute left-2 top-2 z-20 rounded-full border border-white/30 bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {roleRelevance}% {t('role fit')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-secondary)]">{course.provider}</span>
          <span aria-hidden>•</span>
          <span className="inline-flex items-center gap-1">
            {course.resourceType && (() => {
              const Icon = RESOURCE_ICONS[course.resourceType];
              return <Icon className="h-2.5 w-2.5 shrink-0" />;
            })()}
            {t(resourceLabel(course))}
          </span>
          {brand.tier === 1 && (
            <span className="rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-primary-text)]">
              {t('Priority provider')}
            </span>
          )}
        </div>

        <h3
          className={`mt-1 font-semibold leading-snug text-[var(--text-primary)] ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          {course.title}
        </h3>

        {course.rating !== null && course.rating !== undefined && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-[var(--text-primary)]">{course.rating.toFixed(1)}</span>
            {course.ratingCount ? (
              <span className="text-[var(--text-muted)]">
                ({course.ratingCount.toLocaleString()})
              </span>
            ) : null}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            <Target className="h-3 w-3 shrink-0" />
            {t(course.level)}
          </span>
          {course.durationHours !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              <Clock className="h-3 w-3 shrink-0" />
              {course.durationHours}h
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            <Languages className="h-3 w-3 shrink-0" />
            {course.language.toLowerCase().startsWith('ar') ? t('Arabic') : course.language}
          </span>
          {course.hasCertificate && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                course.certificateIncluded
                  ? 'border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}
              title={t(
                course.certificateIncluded
                  ? 'The certificate is included at no extra cost.'
                  : 'A certificate is available for an additional fee.'
              )}
            >
              <Award className="h-3 w-3 shrink-0" />
              {t(course.certificateIncluded ? 'Free certificate' : 'Paid certificate')}
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success-strong)]">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              {t('Completed')}
            </span>
          )}
          {isDismissed && (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
              {t('Dismissed')}
            </span>
          )}
        </div>

        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {showReason && reason && (
          <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <Sparkles className="h-3 w-3 shrink-0" />
              {t('Why this now')}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {reason}
            </p>
            {recommendation?.aiSkillGap && (
              <p className="mt-1.5 text-[10px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{t('Skill gap:')}</span>{' '}
                {recommendation.aiSkillGap}
              </p>
            )}
            {recommendation?.aiRoadmapLink && (
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">
                  {t('Roadmap link:')}
                </span>{' '}
                {recommendation.aiRoadmapLink}
              </p>
            )}
          </div>
        )}

        {course.availabilityNote && (
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {course.availabilityNote}
          </p>
        )}

        {showProgress && (isInProgress || isCompleted) && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{t('Progress')}</span>
              <span>{item?.progressPercent ?? 0}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-progress-track)]">
              <div
                className="h-full rounded-full bg-[var(--color-progress-strong)] transition-all"
                style={{ width: `${item?.progressPercent ?? 0}%` }}
              />
            </div>
            {isInProgress && onProgress && onProgressDraft && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  aria-label={`${t('Progress for')} ${course.title}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft}
                  onChange={(event) =>
                    onProgressDraft(course.id, Number(event.target.value))
                  }
                  className="h-1.5 flex-1 accent-[var(--color-progress-strong)]"
                />
                <button
                  type="button"
                  onClick={() => onProgress(course.id, draft)}
                  className="rounded-lg border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                >
                  {t('Save')}
                </button>
              </div>
            )}
          </div>
        )}

        {showActions && (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
            {onStart && !isCompleted && (
              <button
                type="button"
                onClick={() => onStart(course.id, recommendation?.reason)}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
              >
                <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                {t(isInProgress ? 'Continue' : 'Start Learning')}
              </button>
            )}
            {onComplete && !isCompleted && (
              <button
                type="button"
                onClick={() => onComplete(course.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--color-success-strong)]/40 hover:text-[var(--color-success-strong)]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {t('Complete')}
              </button>
            )}
            {onSave && !isSaved && !isInProgress && !isCompleted && (
              <button
                type="button"
                onClick={() => onSave(course.id, recommendation?.reason)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              >
                <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                {t('Save')}
              </button>
            )}
            {isSaved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-success-strong)]">
                <BookmarkCheck className="h-3.5 w-3.5 shrink-0" />
                {t('Saved')}
              </span>
            )}
            {onDismiss && !isCompleted && (
              <button
                type="button"
                onClick={() => onDismiss(course.id, recommendation?.reason)}
                className="inline-flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5 shrink-0" />
                {t('Dismiss')}
              </button>
            )}
            {onRemove && (isSaved || isInProgress || isDismissed) && (
              <button
                type="button"
                onClick={() => onRemove(course.id)}
                className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:underline"
              >
                {t('Remove')}
              </button>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="ms-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent-strong)] hover:underline"
              >
                {course.resourceType ? t(resourceCta(course.resourceType)) : t('Open resource')}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
