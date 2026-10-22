import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import type {
  CourseAvailability,
  CourseFormat,
  LearningCourse,
  LearningItem,
  LearningRecommendation,
  CourseLevel,
} from '../../types/learning';

type HubTab = 'recommended' | 'saved' | 'in_progress' | 'completed' | 'catalog';

const AVAILABILITY_LABELS: Record<CourseAvailability, string> = {
  free: 'Free',
  free_with_limitations: 'Free with limitations',
  audit: 'Free to audit',
  free_course_paid_certificate: 'Free course, paid certificate',
  paid: 'Paid',
  youtube_free: 'Free on YouTube',
};

const AVAILABILITY_STYLES: Record<CourseAvailability, string> = {
  free: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  youtube_free: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  audit: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  free_course_paid_certificate: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  free_with_limitations: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  paid: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
};

const FORMAT_LABELS: Record<CourseFormat, string> = {
  course: 'Course',
  professional_certificate: 'Professional certificate',
  learning_path: 'Learning path',
  tutorial: 'Tutorial',
  video: 'Video',
  playlist: 'Playlist',
};

function scoreLabel(score: number): string {
  return `${Math.round(score)}% match`;
}

function skillNames(rec?: LearningRecommendation, course?: LearningCourse): string[] {
  if (rec?.matchedSkills.length) return rec.matchedSkills.slice(0, 4);
  return (course ?? rec?.course)?.skills.map((skill) => skill.name).slice(0, 4) ?? [];
}

interface CourseCardProps {
  course: LearningCourse;
  recommendation?: LearningRecommendation;
  item?: LearningItem;
  onSave: (courseId: string, reason?: string) => void;
  onStart: (courseId: string, reason?: string) => void;
  onComplete: (courseId: string) => void;
  onDismiss: (courseId: string, reason?: string) => void;
  onRemove: (courseId: string) => void;
  onProgress: (courseId: string, percent: number) => void;
  progressDraft?: number;
  onProgressDraft: (courseId: string, percent: number) => void;
  compact?: boolean;
}

const CourseCard: React.FC<CourseCardProps> = ({
  course,
  recommendation,
  item,
  onSave,
  onStart,
  onComplete,
  onDismiss,
  onRemove,
  onProgress,
  progressDraft,
  onProgressDraft,
  compact = false,
}) => {
  const reason =
    recommendation?.aiExplanation ??
    recommendation?.reason ??
    item?.recommendationReason ??
    course.description;
  const skills = skillNames(recommendation, course);
  const roleRelevance = recommendation ? Math.round(recommendation.roleRelevance * 100) : null;
  const isCompleted = item?.status === 'completed';
  const isInProgress = item?.status === 'in_progress';
  const isSaved = item?.status === 'saved';
  const isDismissed = item?.status === 'dismissed';
  const draft = progressDraft ?? item?.progressPercent ?? 0;

  return (
    <article
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--border-strong)] ${
        compact ? '' : 'h-full flex flex-col'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            <span>{course.provider}</span>
            <span aria-hidden>•</span>
            <span>{FORMAT_LABELS[course.format]}</span>
            <span aria-hidden>•</span>
            <span>{course.level}</span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)] leading-snug">
            {course.title}
          </h3>
        </div>
        {recommendation && (
          <div className="shrink-0 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
            {scoreLabel(recommendation.score)}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${AVAILABILITY_STYLES[course.availability]}`}>
          {AVAILABILITY_LABELS[course.availability]}
        </span>
        {course.durationHours !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
            <Clock size={11} /> {course.durationHours}h
          </span>
        )}
        {roleRelevance !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
            <Target size={11} /> {roleRelevance}% role fit
          </span>
        )}
        {isCompleted && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={11} /> Completed
          </span>
        )}
        {isDismissed && (
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
            Dismissed
          </span>
        )}
      </div>

      {reason && (
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Sparkles size={12} /> Why this now
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{reason}</p>
          {recommendation?.aiSkillGap && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">Skill gap:</span>{' '}
              {recommendation.aiSkillGap}
            </p>
          )}
          {recommendation?.aiRoadmapLink && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">Roadmap link:</span>{' '}
              {recommendation.aiRoadmapLink}
            </p>
          )}
        </div>
      )}

      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {recommendation && recommendation.gapsAddressed.length > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Gap addressed:{' '}
          {recommendation.gapsAddressed
            .slice(0, 2)
            .map((gap) => `${gap.skill} ${gap.currentLevel}→${gap.targetLevel}`)
            .join(', ')}
        </p>
      )}

      {course.availabilityNote && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {course.availabilityNote}
        </p>
      )}

      {(isInProgress || isCompleted) && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <span>Progress</span>
            <span>{item?.progressPercent ?? 0}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${item?.progressPercent ?? 0}%` }}
            />
          </div>
          {isInProgress && (
            <div className="mt-2 flex items-center gap-2">
              <input
                aria-label={`Progress for ${course.title}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={draft}
                onChange={(event) => onProgressDraft(course.id, Number(event.target.value))}
                className="h-2 flex-1 accent-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => onProgress(course.id, draft)}
                className="rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`mt-4 flex flex-wrap items-center gap-2 ${compact ? '' : 'mt-auto pt-4'}`}>
        {!isCompleted && (
          <button
            type="button"
            onClick={() => onStart(course.id, recommendation?.reason)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <PlayCircle size={14} /> {isInProgress ? 'Continue' : 'Start'}
          </button>
        )}
        {!isCompleted && (
          <button
            type="button"
            onClick={() => onComplete(course.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-emerald-600"
          >
            <CheckCircle2 size={14} /> Complete
          </button>
        )}
        {!isSaved && !isInProgress && !isCompleted && (
          <button
            type="button"
            onClick={() => onSave(course.id, recommendation?.reason)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          >
            <BookmarkPlus size={14} /> Save
          </button>
        )}
        {isSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <BookmarkCheck size={14} /> Saved
          </span>
        )}
        {!isCompleted && (
          <button
            type="button"
            onClick={() => onDismiss(course.id, recommendation?.reason)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} /> Dismiss
          </button>
        )}
        {(isSaved || isInProgress || isDismissed) && (
          <button
            type="button"
            onClick={() => onRemove(course.id)}
            className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
          >
            Remove
          </button>
        )}
        <a
          href={course.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
        >
          Open resource <ExternalLink size={12} />
        </a>
      </div>
    </article>
  );
};

export const LearningCenterView: React.FC = () => {
  const {
    learningCatalog,
    learningItems,
    learningRecommendations,
    learningRecommendationMeta,
    isLearningLoading,
    learningError,
    refreshLearningRecommendations,
    saveLearningCourse,
    dismissLearningCourse,
    startLearningCourse,
    completeLearningCourse,
    updateLearningProgress,
    removeLearningCourse,
    targetRole,
  } = useCareer();

  const [tab, setTab] = useState<HubTab>('recommended');
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [format, setFormat] = useState('all');
  const [search, setSearch] = useState('');
  const [weeklyHours, setWeeklyHours] = useState(learningRecommendationMeta.weeklyHours);
  const [budget, setBudget] = useState<'free_only' | 'low' | 'any'>(learningRecommendationMeta.budget);
  const [preferredFormat, setPreferredFormat] = useState<CourseFormat | 'any'>(
    learningRecommendationMeta.preferredFormat
  );
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const [requestedAi, setRequestedAi] = useState(false);

  useEffect(() => {
    setWeeklyHours(learningRecommendationMeta.weeklyHours);
    setBudget(learningRecommendationMeta.budget);
    setPreferredFormat(learningRecommendationMeta.preferredFormat);
  }, [
    learningRecommendationMeta.weeklyHours,
    learningRecommendationMeta.budget,
    learningRecommendationMeta.preferredFormat,
  ]);

  // Ask for AI explanations once when the hub opens. The request still goes
  // through the deterministic engine; if Gemini is unavailable the same
  // candidates are shown with the fallback reason.
  useEffect(() => {
    if (requestedAi) return;
    setRequestedAi(true);
    void refreshLearningRecommendations({ ai: true });
  }, [refreshLearningRecommendations, requestedAi]);

  const itemByCourse = useMemo(() => {
    const map = new Map<string, LearningItem>();
    for (const item of learningItems) map.set(item.courseId, item);
    return map;
  }, [learningItems]);

  const courseById = useMemo(() => {
    const map = new Map<string, LearningCourse>();
    for (const course of learningCatalog) map.set(course.id, course);
    return map;
  }, [learningCatalog]);

  const recommendationById = useMemo(() => {
    const map = new Map<string, LearningRecommendation>();
    for (const recommendation of learningRecommendations) {
      map.set(recommendation.course.id, recommendation);
    }
    return map;
  }, [learningRecommendations]);

  const categories = useMemo(
    () => [...new Set(learningCatalog.map((course) => course.category))].sort(),
    [learningCatalog]
  );

  const searchMatches = (course: LearningCourse) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      course.title.toLowerCase().includes(term) ||
      course.provider.toLowerCase().includes(term) ||
      course.skills.some((skill) => skill.name.toLowerCase().includes(term))
    );
  };

  const matchesFilters = (course: LearningCourse) => {
    if (category !== 'all' && course.category !== category) return false;
    if (level !== 'all' && course.level !== level) return false;
    if (availability !== 'all' && course.availability !== availability) return false;
    if (format !== 'all' && course.format !== format) return false;
    return searchMatches(course);
  };

  const filteredRecommendations = learningRecommendations.filter((rec) =>
    matchesFilters(rec.course)
  );

  const itemsByStatus = (status: LearningItem['status']) =>
    learningItems
      .filter((item) => item.status === status)
      .map((item) => ({ item, course: courseById.get(item.courseId) }))
      .filter((entry): entry is { item: LearningItem; course: LearningCourse } => Boolean(entry.course));

  const savedItems = itemsByStatus('saved');
  const inProgressItems = itemsByStatus('in_progress');
  const completedItems = itemsByStatus('completed');

  const catalogFiltered = learningCatalog.filter(matchesFilters);

  const handleRefresh = () => {
    void refreshLearningRecommendations({
      weeklyHours,
      budget,
      preferredFormat,
      ai: true,
    });
  };

  const handleProgressDraft = (courseId: string, percent: number) => {
    setProgressDrafts((prev) => ({ ...prev, [courseId]: percent }));
  };

  const cardProps = (course: LearningCourse, recommendation?: LearningRecommendation) => ({
    course,
    recommendation,
    item: itemByCourse.get(course.id),
    onSave: saveLearningCourse,
    onStart: startLearningCourse,
    onComplete: completeLearningCourse,
    onDismiss: dismissLearningCourse,
    onRemove: removeLearningCourse,
    onProgress: updateLearningProgress,
    progressDraft: progressDrafts[course.id],
    onProgressDraft: handleProgressDraft,
  });

  const tabs: { id: HubTab; label: string; count: number }[] = [
    { id: 'recommended', label: 'Recommended', count: learningRecommendations.length },
    { id: 'saved', label: 'Saved', count: savedItems.length },
    { id: 'in_progress', label: 'In progress', count: inProgressItems.length },
    { id: 'completed', label: 'Completed', count: completedItems.length },
    { id: 'catalog', label: 'Explore catalog', count: learningCatalog.length },
  ];

  const top = filteredRecommendations[0];

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
            <Sparkles size={14} /> AI Learning Hub
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            What should you learn next?
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            {learningRecommendationMeta.targetRoleTitle ?? targetRole.title}: recommendations are ranked
            from your skill gaps, roadmap and learning history. Every course is a real catalogue entry.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLearningLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw size={15} className={isLearningLoading ? 'animate-spin' : ''} />
          {isLearningLoading ? 'Ranking…' : 'Refresh recommendations'}
        </button>
      </div>

      {learningError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Learning Hub request failed</div>
            <div className="text-xs">{learningError}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
        {learningRecommendationMeta.aiUsed ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} className="text-[var(--color-accent)]" />
            AI explanations are active. Candidate courses and scores remain deterministic.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle size={13} className="text-[var(--text-muted)]" />
            Deterministic ranking is active.
            {learningRecommendationMeta.aiFallbackReason
              ? ` ${learningRecommendationMeta.aiFallbackReason}`
              : ''}
          </span>
        )}
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.skillGapCount} skill gaps
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.roadmapSkillCount} roadmap skills
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.weeklyHours}h/week, {learningRecommendationMeta.budget.replace('_', ' ')}
      </div>

      {top && (
        <section className="rounded-2xl border border-[var(--color-accent)]/25 bg-gradient-to-br from-[var(--color-accent)]/10 via-[var(--bg-surface)] to-[var(--bg-surface)] p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
            <Trophy size={14} /> Next best step
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{top.course.title}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {top.aiExplanation ?? top.reason}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {top.matchedSkills.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="text-3xl font-bold text-[var(--color-accent)]">{Math.round(top.score)}</div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                deterministic
                <br />
                match score
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <Filter size={14} /> Learning preferences
          </div>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            Hours/week
            <input
              type="number"
              min={1}
              max={40}
              value={weeklyHours}
              onChange={(event) => setWeeklyHours(Number(event.target.value))}
              className="w-16 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-primary)]"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            Budget
            <select
              value={budget}
              onChange={(event) => setBudget(event.target.value as typeof budget)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-primary)]"
            >
              <option value="free_only">Free only</option>
              <option value="low">Prefer free</option>
              <option value="any">Any price</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            Format
            <select
              value={preferredFormat}
              onChange={(event) => setPreferredFormat(event.target.value as CourseFormat | 'any')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-primary)]"
            >
              <option value="any">Any format</option>
              <option value="course">Course</option>
              <option value="learning_path">Learning path</option>
              <option value="professional_certificate">Professional certificate</option>
              <option value="tutorial">Tutorial</option>
              <option value="video">Video</option>
              <option value="playlist">Playlist</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLearningLoading}
            className="ml-auto rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] pb-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === entry.id
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {entry.label} <span className="text-[11px] opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search courses, providers or skills"
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 pl-8 pr-3 text-sm text-[var(--text-primary)]"
          />
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="all">All categories</option>
          {categories.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="all">All levels</option>
          {(['Beginner', 'Intermediate', 'Advanced'] as CourseLevel[]).map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <select
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="all">All availability</option>
          {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="all">All formats</option>
          {Object.entries(FORMAT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {tab === 'recommended' && (
        <section className="space-y-4">
          {filteredRecommendations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center text-sm text-[var(--text-secondary)]">
              <BookOpen size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
              No recommendations match these filters. Increase your budget or clear a filter.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredRecommendations.slice(0, 12).map((recommendation) => (
                <CourseCard
                  key={recommendation.course.id}
                  {...cardProps(recommendation.course, recommendation)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'saved' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedItems.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Nothing saved yet.</p>
          ) : (
            savedItems.map(({ course }) => (
              <CourseCard key={course.id} {...cardProps(course, recommendationById.get(course.id))} />
            ))
          )}
        </section>
      )}

      {tab === 'in_progress' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inProgressItems.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No course in progress.</p>
          ) : (
            inProgressItems.map(({ course }) => (
              <CourseCard key={course.id} {...cardProps(course, recommendationById.get(course.id))} />
            ))
          )}
        </section>
      )}

      {tab === 'completed' && (
        <section className="space-y-3">
          {completedItems.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No completed learning yet.</p>
          ) : (
            completedItems.map(({ item, course }) => (
              <div
                key={course.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <CheckCircle2 size={18} className="text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{course.title}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {course.provider} · {AVAILABILITY_LABELS[course.availability]} · completed{' '}
                    {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  Learning evidence recorded
                </span>
                <a
                  href={course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                >
                  Open
                </a>
              </div>
            ))
          )}
        </section>
      )}

      {tab === 'catalog' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalogFiltered.map((course) => (
            <CourseCard
              key={course.id}
              {...cardProps(course, recommendationById.get(course.id))}
              compact
            />
          ))}
        </section>
      )}

      <footer className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
        Completing a course records learning progress; it does not automatically mark a skill as
        mastered. Update skill levels explicitly in the Skills Center.
      </footer>
    </div>
  );
};
