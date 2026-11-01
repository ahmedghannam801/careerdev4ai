/**
 * Training & Courses.
 *
 * This route used to be the job board. It built searches on external vacancy
 * sites, because the product has no live job feed and will not invent one.
 * The section the candidate actually needs is the one the platform can fill
 * from its own records: a relevance-gated list of courses, certifications,
 * learning paths, workshops and tutorials that close a real gap for their
 * target role.
 *
 * The relevance gate runs before this page sees anything (see
 * `server/learning/recommendation.ts`). This view only filters and groups what
 * already passed it. It never shows a vacancy, a job-board search or a
 * placeholder application link.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Filter,
  GraduationCap,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import { CourseCard } from '../learning/CourseCard';
import {
  TRAINING_GROUPS,
  filterTrainingResources,
  groupTrainingResources,
  type TrainingGroupId,
} from '../../../shared/trainingResources';

interface JobsViewProps {
  onNavigate: (view: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({ onNavigate }) => {
  const {
    t,
    targetRole,
    learningRecommendations,
    learningRecommendationMeta,
    isLearningLoading,
    learningError,
    refreshLearningRecommendations,
    getLearningItem,
    saveLearningCourse,
    startLearningCourse,
    completeLearningCourse,
  } = useCareer();

  const [group, setGroup] = useState<TrainingGroupId | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterTrainingResources(learningRecommendations, { group, query }),
    [learningRecommendations, group, query]
  );

  const groups = useMemo(() => groupTrainingResources(filtered), [filtered]);

  const roleLabel =
    learningRecommendationMeta.targetRoleTitle || targetRole.title || t('your target role');

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('Training & Courses')}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Training that moves you toward')} {roleLabel}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {t(
              'Courses, certifications, learning paths, workshops and tutorials checked against your target role.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('learning')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{t('Open Learning Hub')}</span>
          </button>
        </div>
      </div>

      {/* Scope notice: this is not a job board. */}
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
        <div className="space-y-1 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">
            {t('This page lists training resources, not job vacancies.')}
          </p>
          <p>
            {t(
              'Every resource below passed a relevance gate for your target role before it appeared. A resource that does not close a role, skill, gap or roadmap need is not shown, however well it matches your preferred language or format.'
            )}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Search training resources')}
              aria-label={t('Search training resources')}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] py-2 pe-3.5 ps-9 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Filter className="h-3.5 w-3.5" />
            <span>
              {filtered.length} {t('of')} {learningRecommendations.length}{' '}
              {t('resources shown')}
            </span>
            <button
              type="button"
              onClick={() => void refreshLearningRecommendations({ ai: false })}
              disabled={isLearningLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3 w-3 shrink-0 ${isLearningLoading ? 'animate-spin' : ''}`}
              />
              <span>{t('Refresh')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGroup('all')}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              group === 'all'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('All training')}
          </button>
          {TRAINING_GROUPS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setGroup(entry.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                group === entry.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLearningLoading && (
        <div role="status" className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {t('Loading training resources…')}
          </p>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLearningLoading && learningError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-5"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {t('Training resources could not be loaded.')}
            </p>
            <p>{learningError}</p>
            <button
              type="button"
              onClick={() => void refreshLearningRecommendations({ ai: false })}
              className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)]"
            >
              {t('Try again')}
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLearningLoading && !learningError && filtered.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title={
            learningRecommendations.length === 0
              ? t('No relevant training is available yet')
              : t('No training matches these filters')
          }
          description={
            learningRecommendations.length === 0
              ? t(
                  'When a course, certification or tutorial closes a real gap for your target role, it will appear here. Refresh to check again, or browse the full catalogue in the Learning Hub.'
                )
              : t('Clear the search or choose another training type to see the rest.')
          }
          actionLabel={
            learningRecommendations.length === 0 ? t('Refresh recommendations') : t('Clear filters')
          }
          onAction={() => {
            if (learningRecommendations.length === 0) {
              void refreshLearningRecommendations({ ai: false });
            } else {
              setGroup('all');
              setQuery('');
            }
          }}
        />
      )}

      {/* Success */}
      {!isLearningLoading && !learningError && groups.length > 0 && (
        <div className="space-y-7">
          {groups.map((entry) => (
            <section key={entry.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {t(entry.label)}
                </h2>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {entry.items.length} {t('resources')}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {entry.items.map((recommendation) => {
                  const course = recommendation.course;
                  const item = getLearningItem(course.id);

                  return (
                    <CourseCard
                      key={course.id}
                      course={course}
                      recommendation={recommendation}
                      item={item}
                      onSave={saveLearningCourse}
                      onStart={startLearningCourse}
                      onComplete={completeLearningCourse}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Reveal>
  );
};
