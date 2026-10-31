import React, { useState } from 'react';
import { Calendar, BookOpen, ExternalLink, RefreshCw, Target, Clock, GitBranch, FolderGit2, Info } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { ROADMAP_STATUS_FILTERS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { RoadmapTaskStatus } from '../../types/career';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { AnimatedProgress } from '../motion/AnimatedProgress';

interface RoadmapViewProps {
  onNavigate?: (view: string) => void;
}

/** The colour used for each gap priority. */
const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600',
  low: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  sufficient: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
};

export const RoadmapView: React.FC<RoadmapViewProps> = ({ onNavigate }) => {
  const {
    roadmapPhases,
    updateTaskStatus,
    isEnrolledInRoadmap,
    enrollInRoadmap,
    learningCatalog,
    learningRecommendations,
    getLearningItem,
    saveLearningCourse,
    startLearningCourse,
    regeneratePersonalizedRoadmap,
    t,
  } = useCareer();
  const [statusFilter, setStatusFilter] = useRouteParam<string>('status', ROADMAP_STATUS_FILTERS, 'all');
  const [isUpdating, setIsUpdating] = useState(false);

  const coursesForSkill = (skillName: string | null) => {
    if (!skillName) return [];
    const normalized = skillName.toLowerCase();
    const recommended = learningRecommendations.filter((rec) =>
      rec.course.skills.some((skill) => skill.name.toLowerCase() === normalized)
    );
    if (recommended.length > 0) {
      return recommended.slice(0, 2).map((rec) => ({ course: rec.course, rec }));
    }
    return learningCatalog
      .filter((course) =>
        course.skills.some((skill) => skill.name.toLowerCase() === normalized)
      )
      .slice(0, 2)
      .map((course) => ({ course, rec: undefined }));
  };

  const allTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks));
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t2 => t2.status === 'completed').length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalHours = allTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('EXECUTION TIMELINE')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Personal Career Roadmap')}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-end">
            <div className="text-xs text-[var(--text-muted)]">{t('Roadmap Completion')}</div>
            <div className="text-base font-bold font-mono tabular-nums text-[var(--color-primary-text)]">
              {completedTasks} / {totalTasks} {t('Tasks')} ({progressPct}%)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsUpdating(true);
                try {
                  await regeneratePersonalizedRoadmap();
                } finally {
                  setIsUpdating(false);
                }
              }}
              disabled={isUpdating}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title={t('Recalculate priorities based on your latest skills, CV and experience')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? t('Updating…') : t('Sync With Profile')}</span>
            </button>
            {!isEnrolledInRoadmap && (
              <button
                onClick={enrollInRoadmap}
                className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold shadow-xs"
              >
                {t('Enroll in Roadmap')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The plan summary: what this roadmap is worth and what it is for. */}
      <div
        data-guide="roadmap-summary"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Target className="h-3 w-3" />
            {t('Target role')}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {roadmapPhases[0]?.title?.replace(/ (Foundations|Core Delivery|Advanced Practice|Market Readiness)$/, '') ??
              t('Not available')}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Every step below closes a skill gap for this role')}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Clock className="h-3 w-3" />
            {t('Estimated time')}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {totalHours} {t('hours')}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Across')} {totalTasks} {t('steps')}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Info className="h-3 w-3" />
            {t('How this plan was built')}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {t('From your skill ratings')}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Steps you already meet are left out')}
          </div>
        </div>
      </div>

      {/* The roadmap bar fills toward its target as tasks are completed. */}
      <AnimatedProgress
        value={progressPct}
        label={t('Roadmap completion')}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        fillClassName="bg-[var(--color-primary)]"
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['all', 'in_progress', 'completed', 'not_started', 'blocked'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              statusFilter === st
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {st === 'all' ? `${t('All Tasks')} (${totalTasks})` : st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Phases and Milestones List */}
      <Stagger inView gap={0.09} className="space-y-6">
        {roadmapPhases.map((phase) => (
          <StaggerItem key={phase.id}>
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
              {/* Phase Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary-text)] font-bold">
                    {t('PHASE')} {phase.phaseNumber}
                  </span>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{phase.title}</h2>
                  <p className="text-xs text-[var(--text-secondary)]">{phase.description}</p>
                  {phase.goal && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <Target className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{phase.goal}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Milestones inside Phase */}
              <div className="space-y-6">
                {phase.milestones.map((milestone) => {
                  const visibleTasks = milestone.tasks.filter(t2 =>
                    statusFilter === 'all' ? true : t2.status === statusFilter
                  );

                  if (visibleTasks.length === 0 && statusFilter !== 'all') return null;

                  const milestonePct =
                    milestone.tasks.length > 0
                      ? (milestone.completedTasksCount / milestone.tasks.length) * 100
                      : 0;

                  return (
                    <div key={milestone.id} className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                        <span>{milestone.title}</span>
                        <span className="font-mono text-[var(--text-muted)] text-[11px]">
                          {milestone.completedTasksCount}/{milestone.tasks.length} {t('Completed')}
                        </span>
                      </div>

                      <AnimatedProgress
                        value={milestonePct}
                        label={`${milestone.title} progress`}
                        className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
                        fillClassName="bg-[var(--color-accent)]"
                      />

                    <div className="space-y-2.5">
                      {visibleTasks.map((task, taskIndex) => {
                        // The server plan names the exact courses for the step.
                        // The catalogue lookup is the fallback for a roadmap
                        // that was written before the plan carried resources.
                        const planCourses = (task.resources ?? []).map((resource) => ({
                          course: {
                            id: resource.id,
                            title: resource.title,
                            provider: resource.provider,
                            url: resource.url,
                            skills: [] as { name: string }[],
                            availability: 'free' as const,
                            level: 'Beginner' as const,
                            durationHours: resource.durationHours,
                          },
                          rec: undefined as undefined | { score: number; reason: string },
                        }));
                        const options = planCourses.length > 0
                          ? planCourses
                          : coursesForSkill(task.skillName ?? null);
                        return (
                        <div
                          key={task.id}
                          data-guide={taskIndex === 0 ? 'roadmap-task' : undefined}
                          className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold text-sm ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                {task.title}
                              </span>
                              {task.skillName && (
                                <span className="text-[11px] text-[var(--color-primary-text)]">· {task.skillName}</span>
                              )}
                              {task.priority && task.priority !== 'sufficient' && (
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                    PRIORITY_CLASS[task.priority] ?? PRIORITY_CLASS.low
                                  }`}
                                >
                                  {t(task.priority)}
                                </span>
                              )}
                              {task.difficulty && (
                                <span className="rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                                  {t(task.difficulty)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              {task.description}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] pt-0.5 flex-wrap">
                              {task.deadline && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3" />
                                  {t('Due')} {task.deadline}
                                </span>
                              )}
                              <span>·</span>
                              <span>{t('Est.')} {task.estimatedHours}h</span>
                            </div>

                            {/* Why this step is here at all. */}
                            {task.rationale && (
                              <p className="mt-1.5 rounded-lg bg-[var(--surface-main)]/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {t('Why this step')}:{' '}
                                </span>
                                {task.rationale}
                              </p>
                            )}

                            {/* What has to be finished first. */}
                            {task.prerequisites && task.prerequisites.length > 0 && (
                              <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                                <GitBranch className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {t('Prerequisites')}:{' '}
                                  </span>
                                  {task.prerequisites.join(' → ')}
                                </span>
                              </p>
                            )}

                            {/* Projects that prove this step. */}
                            {task.projectTitles && task.projectTitles.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <FolderGit2 className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                                <span className="font-semibold text-[var(--text-secondary)]">
                                  {t('Recommended projects')}:
                                </span>
                                {task.projectTitles.map((project) => (
                                  <span
                                    key={project}
                                    className="rounded-full bg-[var(--accent-primary)]/10 px-2 py-0.5 text-[var(--color-primary-text)]"
                                  >
                                    {project}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* A roadmap skill gap leads directly to concrete,
                                persisted learning resources. */}
                            {task.status !== 'completed' && options.length > 0 && (
                              <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)]/60 p-2.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                  <BookOpen className="h-3 w-3" />
                                  {t('Learning for this gap')}
                                </div>
                                <div className="mt-1.5 space-y-1.5">
                                  {options.map(({ course, rec }) => {
                                    const item = getLearningItem(course.id);
                                    return (
                                      <div
                                        key={course.id}
                                        className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">
                                              {course.title}
                                            </span>
                                            {rec && (
                                              <span className="rounded-full bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                                                {Math.round(rec.score)}% {t('match')}
                                              </span>
                                            )}
                                            {item && (
                                              <span className="rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)] capitalize">
                                                {t(item.status.replace('_', ' '))}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-[var(--text-muted)]">
                                            {course.provider}
                                            {'availability' in course && course.availability
                                              ? ` · ${t(course.availability.replace(/_/g, ' '))}`
                                              : ''}
                                          </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          {!item && (
                                            <button
                                              type="button"
                                              onClick={() => void saveLearningCourse(course.id, rec?.reason)}
                                              className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                            >
                                              {t('Save')}
                                            </button>
                                          )}
                                          {item?.status !== 'completed' && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void startLearningCourse(course.id, rec?.reason);
                                                updateTaskStatus(task.id, 'in_progress');
                                              }}
                                              className="rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                                            >
                                              {t('Start')}
                                            </button>
                                          )}
                                          <a
                                            href={course.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[var(--text-muted)] hover:text-[var(--color-primary-text)]"
                                            aria-label={`${t('Open')} ${course.title}`}
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {onNavigate && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigate('learning')}
                                    className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary-text)] transition-[background-color,box-shadow] hover:bg-[var(--accent-accent-surface)] hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                                  >
                                    {t('Open the Learning Hub')} →
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Selector: Status Controls */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(['not_started', 'in_progress', 'completed', 'skipped', 'blocked'] as RoadmapTaskStatus[]).map((status) => (
                              <button
                                key={status}
                                onClick={() => updateTaskStatus(task.id, status)}
                                className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                                  task.status === status
                                    ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] font-semibold'
                                    : 'bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {t(status.replace('_', ' '))}
                              </button>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </Reveal>
  );
};
