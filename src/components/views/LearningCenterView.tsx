import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BookmarkCheck,
  CheckCircle2,
  Filter,
  Languages,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import type {
  CourseFormat,
  CourseLevel,
  LearningCourse,
  LearningItem,
  LearningRecommendation,
} from '../../types/learning';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import { CourseCard } from '../learning/CourseCard';
import { LEARNING_TABS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import {
  availabilityBucket,
  availabilityLabel,
  providerTier,
  type AvailabilityBucket,
} from '../../../shared/courseProviders';

type HubTab = 'recommended' | 'saved' | 'in_progress' | 'completed' | 'catalog';

type DurationFilter = 'all' | 'short' | 'medium' | 'long';
type AvailabilityFilter = 'all' | AvailabilityBucket;

const FORMAT_OPTIONS: Array<{ value: CourseFormat | 'all'; label: string }> = [
  { value: 'all', label: 'All course types' },
  { value: 'course', label: 'Course' },
  { value: 'professional_certificate', label: 'Professional certificate' },
  { value: 'learning_path', label: 'Learning path' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'video', label: 'Video' },
  { value: 'playlist', label: 'Playlist' },
];

const LEVEL_OPTIONS: Array<{ value: CourseLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'Beginner', label: 'Beginner' },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced', label: 'Advanced' },
];

const DURATION_OPTIONS: Array<{ value: DurationFilter; label: string }> = [
  { value: 'all', label: 'Any duration' },
  { value: 'short', label: 'Short — up to 10 hours' },
  { value: 'medium', label: 'Medium — 11 to 40 hours' },
  { value: 'long', label: 'Long — over 40 hours' },
];

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityFilter; label: string }> = [
  { value: 'all', label: 'Any availability' },
  { value: 'free', label: 'FREE' },
  { value: 'free_audit', label: 'FREE AUDIT' },
  { value: 'paid', label: 'PAID' },
];

function matchesDuration(course: LearningCourse, duration: DurationFilter): boolean {
  if (duration === 'all') return true;
  if (course.durationHours === null) return false;
  if (duration === 'short') return course.durationHours <= 10;
  if (duration === 'medium') return course.durationHours > 10 && course.durationHours <= 40;
  return course.durationHours > 40;
}

function matchesSearch(course: LearningCourse, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return (
    course.title.toLowerCase().includes(term) ||
    course.provider.toLowerCase().includes(term) ||
    course.category.toLowerCase().includes(term) ||
    (course.description ?? '').toLowerCase().includes(term) ||
    course.skills.some((skill) => skill.name.toLowerCase().includes(term))
  );
}

export const LearningCenterView: React.FC = () => {
  const {
    t,
    targetRole,
    savedRoles,
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
  } = useCareer();

  const [tab, setTab] = useRouteParam<HubTab>('tab', LEARNING_TABS, 'recommended');
  const [search, setSearch] = useState('');
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const [weeklyHours, setWeeklyHours] = useState(learningRecommendationMeta.weeklyHours);
  const [budget, setBudget] = useState<'free_only' | 'low' | 'any'>(
    learningRecommendationMeta.budget
  );
  const [preferredFormat, setPreferredFormat] = useState<CourseFormat | 'any'>(
    learningRecommendationMeta.preferredFormat
  );

  // Explore filters.
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>('all');
  const [levelFilter, setLevelFilter] = useState<CourseLevel | 'all'>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<CourseFormat | 'all'>('all');

  const initialRequest = useRef(false);
  const [aiRequested, setAiRequested] = useState(false);

  useEffect(() => {
    setWeeklyHours(learningRecommendationMeta.weeklyHours);
    setBudget(learningRecommendationMeta.budget);
    setPreferredFormat(learningRecommendationMeta.preferredFormat);
  }, [
    learningRecommendationMeta.weeklyHours,
    learningRecommendationMeta.budget,
    learningRecommendationMeta.preferredFormat,
  ]);

  // The page never calls the model on open. Deterministic recommendations are
  // already loaded with the career graph; this is only a safety net for a
  // first visit where that initial request failed.
  useEffect(() => {
    if (initialRequest.current) return;
    initialRequest.current = true;
    if (learningRecommendations.length === 0 && !isLearningLoading) {
      void refreshLearningRecommendations({ ai: false });
    }
  }, [isLearningLoading, learningRecommendations.length, refreshLearningRecommendations]);

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

  const roleOptions = useMemo(() => {
    const entries = [targetRole, ...savedRoles].filter(
      (role, index, list) => list.findIndex((entry) => entry.id === role.id) === index
    );
    return entries;
  }, [savedRoles, targetRole]);

  const skillOptions = useMemo(
    () =>
      [...new Set(learningCatalog.flatMap((course) => course.skills.map((s) => s.name)))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [learningCatalog]
  );

  const providerOptions = useMemo(
    () =>
      [...new Set(learningCatalog.map((course) => course.provider))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [learningCatalog]
  );

  const languageOptions = useMemo(
    () =>
      [...new Set(learningCatalog.map((course) => course.language))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [learningCatalog]
  );

  const matchesExploreFilters = (course: LearningCourse) => {
    if (roleFilter !== 'all' && !course.roles.some((role) => role.roleSlug === roleFilter)) {
      return false;
    }
    if (skillFilter !== 'all' && !course.skills.some((skill) => skill.name === skillFilter)) {
      return false;
    }
    if (providerFilter !== 'all' && course.provider !== providerFilter) return false;
    if (
      availabilityFilter !== 'all' &&
      availabilityBucket(course.availability) !== availabilityFilter
    ) {
      return false;
    }
    if (levelFilter !== 'all' && course.level !== levelFilter) return false;
    if (!matchesDuration(course, durationFilter)) return false;
    if (languageFilter !== 'all' && course.language !== languageFilter) return false;
    if (formatFilter !== 'all' && course.format !== formatFilter) return false;
    return matchesSearch(course, search);
  };

  const filteredRecommendations = learningRecommendations.filter((recommendation) =>
    matchesExploreFilters(recommendation.course)
  );

  const catalogFiltered = useMemo(
    () =>
      learningCatalog
        .filter(matchesExploreFilters)
        .sort((a, b) => {
          const tier = providerTier(a.provider) - providerTier(b.provider);
          if (tier !== 0) return tier;
          return a.title.localeCompare(b.title);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      learningCatalog,
      roleFilter,
      skillFilter,
      providerFilter,
      availabilityFilter,
      levelFilter,
      durationFilter,
      languageFilter,
      formatFilter,
      search,
    ]
  );

  const itemsByStatus = (status: LearningItem['status']) =>
    learningItems
      .filter((item) => item.status === status)
      .map((item) => ({ item, course: courseById.get(item.courseId) }))
      .filter(
        (entry): entry is { item: LearningItem; course: LearningCourse } =>
          Boolean(entry.course)
      );

  const savedItems = itemsByStatus('saved');
  const inProgressItems = itemsByStatus('in_progress');
  const completedItems = itemsByStatus('completed');

  const clearFilters = () => {
    setRoleFilter('all');
    setSkillFilter('all');
    setProviderFilter('all');
    setAvailabilityFilter('all');
    setLevelFilter('all');
    setDurationFilter('all');
    setLanguageFilter('all');
    setFormatFilter('all');
    setSearch('');
  };

  const activeFilterCount = [
    roleFilter !== 'all',
    skillFilter !== 'all',
    providerFilter !== 'all',
    availabilityFilter !== 'all',
    levelFilter !== 'all',
    durationFilter !== 'all',
    languageFilter !== 'all',
    formatFilter !== 'all',
    search.trim().length > 0,
  ].filter(Boolean).length;

  const handleRefresh = (ai: boolean) => {
    if (ai) setAiRequested(true);
    void refreshLearningRecommendations({
      weeklyHours,
      budget,
      preferredFormat,
      ai,
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

  const top = learningRecommendations[0];
  const roleLabel =
    learningRecommendationMeta.targetRoleTitle || targetRole.title || t('your target role');

  const filterSelectClass =
    'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs text-[var(--text-primary)]';

  return (
    <Reveal className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
            <Sparkles size={14} /> {t('AI Learning Hub')}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('What should you learn next?')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            {roleLabel}:{' '}
            {t(
              'recommendations are ranked from your skill gaps, roadmap and learning history. Every course is a real catalogue entry.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleRefresh(false)}
            disabled={isLearningLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50"
          >
            <RefreshCw size={15} className={isLearningLoading ? 'animate-spin' : ''} />
            {t(isLearningLoading ? 'Ranking…' : 'Refresh')}
          </button>
          <button
            type="button"
            onClick={() => handleRefresh(true)}
            disabled={isLearningLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles size={15} />
            {t('Explain with AI')}
          </button>
        </div>
      </div>

      {learningError && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t('Learning Hub request failed')}</div>
            <div className="text-xs">{learningError}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
        {learningRecommendationMeta.aiUsed ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} className="text-[var(--color-accent-strong)]" />
            {t('AI explanations are active. Candidate courses and scores remain deterministic.')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle size={13} className="text-[var(--text-muted)]" />
            {t('Deterministic ranking is active.')}
            {learningRecommendationMeta.aiFallbackReason
              ? ` ${learningRecommendationMeta.aiFallbackReason}`
              : ''}
          </span>
        )}
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.skillGapCount} {t('skill gaps')}
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.roadmapSkillCount} {t('roadmap skills')}
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {learningRecommendationMeta.weeklyHours}
        {t('h/week')}, {t(learningRecommendationMeta.budget.replace('_', ' '))}
        {aiRequested && !learningRecommendationMeta.aiUsed && (
          <span className="ms-2 text-[var(--text-muted)]">
            {t('AI explanations were not available; the deterministic reasons are shown.')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] pb-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === entry.id
                ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(entry.label)} <span className="text-[11px] opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <Filter size={14} /> {t('Learning preferences')}
          </div>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            {t('Hours/week')}
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
            {t('Budget')}
            <select
              value={budget}
              onChange={(event) => setBudget(event.target.value as typeof budget)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-primary)]"
            >
              <option value="free_only">{t('Free only')}</option>
              <option value="low">{t('Prefer free')}</option>
              <option value="any">{t('Any price')}</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            {t('Format')}
            <select
              value={preferredFormat}
              onChange={(event) =>
                setPreferredFormat(event.target.value as CourseFormat | 'any')
              }
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-primary)]"
            >
              <option value="any">{t('Any format')}</option>
              {FORMAT_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => handleRefresh(false)}
            disabled={isLearningLoading}
            className="ms-auto rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            {t('Apply preferences')}
          </button>
        </div>
      </section>

      {tab === 'recommended' && (
        <section className="space-y-4">
          {top && (
            <div className="rounded-2xl border border-[var(--color-accent)]/25 bg-gradient-to-br from-[var(--color-accent)]/10 via-[var(--bg-surface)] to-[var(--bg-surface)] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
                <Trophy size={14} /> {t('Next best step')}
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    {top.course.title}
                  </h2>
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
                  <div className="text-3xl font-bold text-[var(--color-accent-strong)]">
                    {Math.round(top.score)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    {t('deterministic')}
                    <br />
                    {t('match score')}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Recommended for You')} — {roleLabel}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {learningRecommendations.length} {t('courses')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className="text-xs font-semibold text-[var(--color-accent-strong)] hover:underline"
            >
              {t('Browse the full catalog')}
            </button>
          </div>

          {learningRecommendations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center text-sm text-[var(--text-secondary)]">
              <BookOpen size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
              {t(
                'No recommendations are available yet. Refresh your ranking to try again.'
              )}
            </div>
          ) : (
            <Stagger
              key="recommended"
              gap={0.06}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {learningRecommendations.slice(0, 12).map((recommendation) => (
                <StaggerItem key={recommendation.course.id} className="h-full">
                  <CourseCard {...cardProps(recommendation.course, recommendation)} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      )}

      {tab === 'saved' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedItems.length === 0 ? (
            <EmptyState
              compact
              icon={BookmarkCheck}
              title={t('Nothing saved yet')}
              description={t(
                'Save a course from your recommendations and it will wait here until you are ready to start it.'
              )}
            />
          ) : (
            <Stagger key="saved" gap={0.06} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {savedItems.map(({ course }) => (
                <StaggerItem key={course.id} className="h-full">
                  <CourseCard {...cardProps(course, recommendationById.get(course.id))} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      )}

      {tab === 'in_progress' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inProgressItems.length === 0 ? (
            <EmptyState
              compact
              icon={PlayCircle}
              title={t('No course in progress')}
              description={t(
                'Start a course and it will appear here, with the progress you have made so far.'
              )}
            />
          ) : (
            <Stagger
              key="in_progress"
              gap={0.06}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {inProgressItems.map(({ course }) => (
                <StaggerItem key={course.id} className="h-full">
                  <CourseCard
                    {...cardProps(course, recommendationById.get(course.id))}
                    showProgress
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      )}

      {tab === 'completed' && (
        <section className="space-y-3">
          {completedItems.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              title={t('No completed learning yet')}
              description={t(
                'Finish a course and it will be recorded here as learning evidence for your career.'
              )}
            />
          ) : (
            completedItems.map(({ item, course }) => (
              <div
                key={course.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <CheckCircle2 size={18} className="text-[var(--color-success-strong)]" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{course.title}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {course.provider} · {availabilityLabel(course.availability)} ·{' '}
                    {t('completed')}{' '}
                    {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}
                  </div>
                </div>
                <span className="rounded-full border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] px-2 py-1 text-[11px] font-medium text-[var(--color-success-strong)]">
                  {t('Learning evidence recorded')}
                </span>
                <a
                  href={course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline"
                >
                  {t('Open')}
                </a>
              </div>
            ))
          )}
        </section>
      )}

      {tab === 'catalog' && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                <Filter size={14} /> {t('Filter the catalog')}
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-on-primary)]">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} /> {t('Clear filters')}
                </button>
              )}
            </div>

            <div className="mt-3">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute start-2.5 top-2.5 text-[var(--text-muted)]"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('Search courses, providers, skills or topics')}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Target role')}
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All target roles')}</option>
                  {roleOptions.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Skill')}
                <select
                  value={skillFilter}
                  onChange={(event) => setSkillFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All skills')}</option>
                  {skillOptions.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Provider')}
                <select
                  value={providerFilter}
                  onChange={(event) => setProviderFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All providers')}</option>
                  {providerOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Availability')}
                <select
                  value={availabilityFilter}
                  onChange={(event) =>
                    setAvailabilityFilter(event.target.value as AvailabilityFilter)
                  }
                  className={filterSelectClass}
                >
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label === 'Any availability'
                        ? t(option.label)
                        : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Difficulty')}
                <select
                  value={levelFilter}
                  onChange={(event) =>
                    setLevelFilter(event.target.value as CourseLevel | 'all')
                  }
                  className={filterSelectClass}
                >
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Duration')}
                <select
                  value={durationFilter}
                  onChange={(event) =>
                    setDurationFilter(event.target.value as DurationFilter)
                  }
                  className={filterSelectClass}
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <Languages size={11} /> {t('Language')}
                </span>
                <select
                  value={languageFilter}
                  onChange={(event) => setLanguageFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All languages')}</option>
                  {languageOptions.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Course type')}
                <select
                  value={formatFilter}
                  onChange={(event) =>
                    setFormatFilter(event.target.value as CourseFormat | 'all')
                  }
                  className={filterSelectClass}
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Recommended for You')} — {roleLabel}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {filteredRecommendations.length} {t('courses')}
              </p>
            </div>
            {filteredRecommendations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-center text-sm text-[var(--text-secondary)]">
                <BookOpen size={22} className="mx-auto mb-2 text-[var(--text-muted)]" />
                {t('No personalized recommendations match these filters.')}
              </div>
            ) : (
              <Stagger
                key="catalog-recommended"
                gap={0.05}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {filteredRecommendations.map((recommendation) => (
                  <StaggerItem key={recommendation.course.id} className="h-full">
                    <CourseCard {...cardProps(recommendation.course, recommendation)} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>

          <div className="space-y-4 border-t border-[var(--border-subtle)] pt-5">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Full catalog')}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {learningCatalog.length} {t('courses')}
                {catalogFiltered.length !== learningCatalog.length
                  ? ` · ${catalogFiltered.length} ${t('match these filters')}`
                  : ''}
              </p>
            </div>

            {learningCatalog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center text-sm text-[var(--text-secondary)]">
                <BookOpen size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
                {t('The course catalogue could not be loaded. Refresh the page to try again.')}
              </div>
            ) : catalogFiltered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center text-sm text-[var(--text-secondary)]">
                <Search size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
                {t('No courses match these filters. Clear a filter or search term.')}
              </div>
            ) : (
              <Stagger
                key="catalog"
                gap={0.05}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {catalogFiltered.map((course) => (
                  <StaggerItem key={course.id} className="h-full">
                    <CourseCard
                      {...cardProps(course, recommendationById.get(course.id))}
                      compact
                      showReason={false}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </section>
      )}

      <footer className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
        {t(
          'Completing a course records learning progress; it does not automatically mark a skill as mastered. Update skill levels explicitly in the Skills Center.'
        )}
      </footer>
    </Reveal>
  );
};
