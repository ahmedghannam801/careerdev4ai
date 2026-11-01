import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Flag,
  FolderGit2,
  GitBranch,
  Info,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { ROADMAP_STATUS_FILTERS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { isSafeExternalUrl } from '../../../shared/learningLinks';
import { RoadmapTaskStatus } from '../../types/career';
import { AnimatedProgress } from '../motion/AnimatedProgress';

interface RoadmapViewProps {
  onNavigate?: (view: string) => void;
}

const SECTION_LABEL_CLASS =
  'text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]';

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600',
  low: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  sufficient: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
};

const STATUS_OPTIONS: RoadmapTaskStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'skipped',
  'blocked',
];

/**
 * The roadmap as a chronological stage timeline.
 *
 * The database already stores the plan as phases and milestones. This view
 * does not regenerate or re-order that plan: it presents the phases as
 * stages, derives the current stage from the user's own completed tasks, and
 * adds a final "Job Ready" state that is reached — not generated.
 *
 * Every stage shows its goal, its effort, its progress, up to five concrete
 * actions, the learning resources attached to those actions, and the
 * projects that prove them. Details are collapsed by default so the page
 * answers "where am I and what is next" before it asks the user to read a
 * plan.
 */
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
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showAll, setShowAll] = useState<string[]>([]);

  const stageLabels = [
    t('Foundation'),
    t('Core Skills'),
    t('Practice'),
    t('Job Preparation'),
  ];

  const courseById = useMemo(() => {
    const map = new Map(learningCatalog.map((course) => [course.id, course]));
    return map;
  }, [learningCatalog]);

  const allTasks = roadmapPhases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) => milestone.tasks)
  );
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((task) => task.status === 'completed').length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalHours = allTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
  const jobReady = totalTasks > 0 && completedTasks === totalTasks;

  const stages = roadmapPhases.map((phase, index) => {
    const tasks = phase.milestones.flatMap((milestone) => milestone.tasks);
    const done = tasks.filter((task) => task.status === 'completed').length;
    const hours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    const resources = new Map<string, NonNullable<(typeof tasks)[number]['resources']>[number]>();
    const projects = new Set<string>();
    for (const task of tasks) {
      for (const resource of task.resources ?? []) resources.set(resource.id, resource);
      for (const project of task.projectTitles ?? []) projects.add(project);
    }
    return {
      id: phase.id,
      phase,
      label: stageLabels[index] ?? phase.title,
      tasks,
      done,
      total: tasks.length,
      hours,
      resources: [...resources.values()].slice(0, 5),
      projects: [...projects].slice(0, 3),
      pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
      complete: tasks.length > 0 && done === tasks.length,
    };
  });

  const currentStageIndex = stages.findIndex((stage) => !stage.complete);

  // Expand the current stage once the plan is available. The user can then
  // open and close any stage without the page re-opening it underneath them.
  useEffect(() => {
    if (expanded.length > 0 || stages.length === 0) return;
    const index = currentStageIndex >= 0 ? currentStageIndex : stages.length - 1;
    setExpanded([stages[index].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapPhases.length]);

  const toggleStage = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const toggleShowAll = (id: string) => {
    setShowAll((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

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
      .filter((course) => course.skills.some((skill) => skill.name.toLowerCase() === normalized))
      .slice(0, 2)
      .map((course) => ({ course, rec: undefined }));
  };

  /** The learning options attached to a task, in priority order. */
  const learningOptionsForTask = (task: (typeof allTasks)[number]) => {
    const planCourses = (task.resources ?? []).map((resource) => {
      const catalogCourse = courseById.get(resource.id);
      return {
        course: {
          id: resource.id,
          title: resource.title,
          provider: resource.provider,
          url: resource.url,
          language: catalogCourse?.language ?? null,
          format: catalogCourse?.format ?? null,
          durationHours: resource.durationHours,
        },
        rec: undefined as undefined | { score: number; reason: string },
      };
    });
    return planCourses.length > 0 ? planCourses : coursesForSkill(task.skillName ?? null);
  };

  const currentStage = stages.find((stage) => !stage.complete) ?? null;
  const nextTask =
    currentStage?.tasks.find((task) => task.status !== 'completed') ??
    allTasks.find((task) => task.status !== 'completed') ??
    null;
  const nextTaskStage = nextTask
    ? stages.find((stage) => stage.tasks.some((task) => task.id === nextTask.id)) ?? null
    : null;
  const nextTaskOptions = nextTask ? learningOptionsForTask(nextTask) : [];
  const nextTaskResource =
    nextTaskOptions.find((option) => isSafeExternalUrl(option.course.url)) ?? null;
  const allProjectTitles = [...new Set(stages.flatMap((stage) => stage.projects))];
  // Projects are proof of work for the skills just practised, so they sit
  // between Practice and Job Preparation. Persisted roadmaps can have fewer
  // phases; in that case they follow the whole plan.
  const projectsInsertIndex = stages.length >= 4 ? 3 : stages.length;

  const scrollToStage = (id: string) => {
    document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const projectsSection =
    allProjectTitles.length > 0 ? (
      <section id="roadmap-projects" className="relative scroll-mt-24 sm:ps-10">
        <div className="absolute start-0 top-5 hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-muted)] sm:flex">
          <FolderGit2 className="h-4 w-4" />
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <FolderGit2 className="h-3 w-3" />
            {t('PROJECTS')}
          </div>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {t('Proof of work')}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {t('These projects turn the skills above into evidence a hiring manager can see.')}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {allProjectTitles.map((project) => (
              <div
                key={project}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                {project}
              </div>
            ))}
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
            >
              {t('See project briefs')}
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </button>
          )}
        </div>
      </section>
    ) : null;

  if (roadmapPhases.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('YOUR PLAN, ONE STAGE AT A TIME')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Personal Career Roadmap')}
          </h1>
        </div>
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-10 text-center space-y-3">
          <Flag className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t('No roadmap yet')}</p>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            {t('Choose a target role and CareerDev4AI will build a staged plan from your real skill gaps.')}
          </p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('my-career')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)]"
            >
              {t('Choose a target role')}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Header: the target, the progress and the two plan controls. */}
      <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('YOUR PLAN, ONE STAGE AT A TIME')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Personal Career Roadmap')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            {t('Where you are, what comes next, and why each step is here.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="me-2 text-end">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Roadmap completion')}
            </div>
            <div className="font-mono text-base font-bold tabular-nums text-[var(--color-primary-text)]">
              {completedTasks} / {totalTasks} ({progressPct}%)
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsUpdating(true);
              try {
                await regeneratePersonalizedRoadmap();
              } finally {
                setIsUpdating(false);
              }
            }}
            disabled={isUpdating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title={t('Recalculate priorities based on your latest skills, CV and experience')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? t('Updating…') : t('Sync With Profile')}</span>
          </button>
          {!isEnrolledInRoadmap && (
            <button
              type="button"
              onClick={enrollInRoadmap}
              className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs hover:bg-[var(--accent-secondary)]"
            >
              {t('Enroll in Roadmap')}
            </button>
          )}
        </div>
      </div>

      {/* The plan summary: three facts, not a wall of text. */}
      <div data-guide="roadmap-summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Target className="h-3 w-3" />
            {t('Target role')}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {roadmapPhases[0]?.title?.replace(
              / (Foundations|Core Delivery|Advanced Practice|Market Readiness)$/,
              ''
            ) ?? t('Not available')}
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

      <AnimatedProgress
        value={progressPct}
        label={t('Roadmap completion')}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        fillClassName="bg-[var(--color-primary)]"
      />

      {/* START: the one action that matters right now, before the plan. */}
      {nextTask && nextTaskStage && (
        <section
          id="roadmap-start"
          className="scroll-mt-24 rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]/50 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
              <PlayCircle className="h-3.5 w-3.5" />
              {t('START HERE')}
            </div>
            <span className="rounded-full bg-[var(--surface-main)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              {nextTaskStage.label} · {nextTaskStage.done}/{nextTaskStage.total} {t('actions')}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug text-[var(--text-primary)]">
                {nextTask.title}
              </h2>
              {nextTask.rationale && (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                  {nextTask.rationale}
                </p>
              )}
              {nextTaskResource && (
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                  {nextTaskResource.course.provider} · {nextTaskResource.course.title}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {nextTaskResource ? (
                <a
                  href={nextTaskResource.course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void startLearningCourse(
                      nextTaskResource.course.id,
                      nextTaskResource.rec?.reason
                    );
                    if (nextTask.status !== 'completed') {
                      updateTaskStatus(nextTask.id, 'in_progress');
                    }
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] shadow-xs transition-opacity hover:opacity-90"
                >
                  {nextTask.status === 'in_progress' ? t('Continue Learning') : t('Start Learning')}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t('No verified resource link is attached to this step yet.')}
                </span>
              )}
              <button
                type="button"
                onClick={() => scrollToStage(nextTaskStage.id)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {t('View stage')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* The stage stepper: a map of the whole plan, not another menu. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-max items-stretch gap-2">
          <li className="min-w-[9.5rem] flex-1">
            <button
              type="button"
              onClick={() => scrollToSection('roadmap-start')}
              className="flex h-full w-full flex-col gap-1 rounded-xl border border-[var(--accent-primary)]/50 bg-[var(--accent-surface)] px-3 py-2.5 text-start transition-colors"
            >
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary-text)]">
                <PlayCircle className="h-3 w-3" />
                {t('START')}
              </span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {nextTask ? t('Your next action') : t('All steps complete')}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {nextTaskStage ? nextTaskStage.label : t('Job Ready')}
              </span>
            </button>
          </li>
          {stages.map((stage, index) => {
            const isCurrent = index === currentStageIndex;
            return (
              <React.Fragment key={stage.id}>
                {index === projectsInsertIndex && allProjectTitles.length > 0 && (
                  <li className="min-w-[9.5rem] flex-1">
                    <button
                      type="button"
                      onClick={() => scrollToSection('roadmap-projects')}
                      className="flex h-full w-full flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2.5 text-start transition-colors hover:border-[var(--accent-primary)]/40"
                    >
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                        <FolderGit2 className="h-3 w-3" />
                        {t('PROJECTS')}
                      </span>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {t('Proof of work')}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {allProjectTitles.length} {t('projects')}
                      </span>
                    </button>
                  </li>
                )}
                <li className="min-w-[9.5rem] flex-1">
                  <button
                    type="button"
                    onClick={() => scrollToStage(stage.id)}
                    className={`flex h-full w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-start transition-colors ${
                      stage.complete
                        ? 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)]'
                        : isCurrent
                          ? 'border-[var(--accent-primary)]/50 bg-[var(--accent-surface)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-main)]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {stage.complete ? (
                        <CheckCircle2 className="h-3 w-3 text-[var(--color-success-strong)]" />
                      ) : (
                        <span className="font-mono">{index + 1}</span>
                      )}
                      {isCurrent ? t('You are here') : stage.complete ? t('Done') : t('Upcoming')}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {stage.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {stage.done}/{stage.total} · {stage.hours}h
                    </span>
                  </button>
                </li>
              </React.Fragment>
            );
          })}
          <li className="min-w-[9.5rem] flex-1">
            <div
              className={`flex h-full flex-col gap-1 rounded-xl border px-3 py-2.5 ${
                jobReady
                  ? 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)]'
                  : 'border-dashed border-[var(--border-subtle)] bg-[var(--surface-main)]'
              }`}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <Flag className="h-3 w-3" />
                {jobReady ? t('Reached') : t('Final state')}
              </span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">{t('Job Ready')}</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {jobReady ? t('All steps complete') : `${100 - progressPct}% ${t('to go')}`}
              </span>
            </div>
          </li>
        </ol>
      </div>

      {/* A light filter. The timeline stays intact; the filter only hides
          actions, so the stage progress never lies. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t('Show')}
        </span>
        {ROADMAP_STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
              statusFilter === status
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {status === 'all' ? t('All actions') : t(status.replace('_', ' '))}
          </button>
        ))}
      </div>

      {/* The stages, in order. */}
      <div className="relative space-y-4">
        <div className="absolute start-[15px] top-3 bottom-3 hidden w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
        {stages.map((stage, index) => {
          const isOpen = expanded.includes(stage.id);
          const isCurrent = index === currentStageIndex;
          const visibleTasks = stage.tasks.filter((task) =>
            statusFilter === 'all' ? true : task.status === statusFilter
          );
          const limited = showAll.includes(stage.id) ? visibleTasks : visibleTasks.slice(0, 5);
          const hasMore = visibleTasks.length > limited.length;

          return (
            <React.Fragment key={stage.id}>
              {index === projectsInsertIndex && projectsSection}
              <section
                id={`stage-${stage.id}`}
                className="relative scroll-mt-24 sm:ps-10"
              >
              <div
                className={`absolute start-0 top-5 hidden h-8 w-8 items-center justify-center rounded-full border sm:flex ${
                  stage.complete
                    ? 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                    : isCurrent
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-muted)]'
                }`}
              >
                {stage.complete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="font-mono text-xs font-bold">{index + 1}</span>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-xs">
                <button
                  type="button"
                  onClick={() => toggleStage(stage.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-col gap-3 p-5 text-start transition-colors hover:bg-[var(--surface-secondary)]/30 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                        {t('Stage')} {index + 1}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {stage.label}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-[var(--accent-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-primary-text)]">
                          {t('Current stage')}
                        </span>
                      )}
                      {stage.complete && (
                        <span className="rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-success-strong)]">
                          {t('Complete')}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">{stage.phase.title}</h2>
                    {stage.phase.goal && (
                      <p className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
                        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                        <span>{stage.phase.goal}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {stage.hours} {t('hours')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {stage.done}/{stage.total} {t('actions')}
                      </span>
                      <span>{stage.pct}%</span>
                    </div>
                  </div>

                  <div className="flex w-full shrink-0 items-center gap-3 sm:w-44">
                    <div className="min-w-0 flex-1">
                      <AnimatedProgress
                        value={stage.pct}
                        label={`${stage.label} progress`}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
                        fillClassName={stage.complete ? 'bg-[var(--color-success-strong)]' : 'bg-[var(--color-accent)]'}
                      />
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-[var(--border-subtle)] p-5">
                    {/* Up to five actions: enough to act on, not a wall. */}
                    {limited.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
                        {t('No actions match this filter in this stage.')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {limited.map((task, taskIndex) => {
                          const options = learningOptionsForTask(task);
                          const primary =
                            options.find((option) => isSafeExternalUrl(option.course.url)) ?? null;
                          const secondary = options.filter((option) => option !== primary);
                          const item = primary ? getLearningItem(primary.course.id) : undefined;
                          const isCompleted = task.status === 'completed';
                          const ctaLabel = isCompleted
                            ? t('Review resource')
                            : item?.status === 'in_progress'
                              ? t('Continue Learning')
                              : t('Start Learning');

                          return (
                            <article
                              key={task.id}
                              data-guide={taskIndex === 0 && index === 0 ? 'roadmap-task' : undefined}
                              className={`rounded-2xl border bg-[var(--surface-main)] p-4 sm:p-5 ${
                                isCompleted
                                  ? 'border-[var(--color-success-strong)]/30'
                                  : task.id === nextTask?.id
                                    ? 'border-[var(--accent-primary)]/40 shadow-xs'
                                    : 'border-[var(--border-subtle)]'
                              }`}
                            >
                              {/* WHAT: the one thing this step is about. */}
                              <div className="min-w-0">
                                <div className={SECTION_LABEL_CLASS}>{t('LEARN THIS')}</div>
                                <h3
                                  className={`mt-1 text-base font-bold leading-snug ${
                                    isCompleted
                                      ? 'text-[var(--text-secondary)]'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  {task.title}
                                </h3>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {task.skillName && (
                                    <span className="rounded-full bg-[var(--accent-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary-text)]">
                                      {task.skillName}
                                    </span>
                                  )}
                                  {task.priority && task.priority !== 'sufficient' && (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                        PRIORITY_CLASS[task.priority] ?? PRIORITY_CLASS.low
                                      }`}
                                    >
                                      {t(task.priority)}
                                    </span>
                                  )}
                                  {isCompleted && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-success-strong)]">
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      {t('completed')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* WHY: one concise reason tied to the target role. */}
                              {task.rationale && (
                                <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
                                  <div className={SECTION_LABEL_CLASS}>{t('WHY THIS MATTERS')}</div>
                                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                                    {task.rationale}
                                  </p>
                                </div>
                              )}

                              {/* START: the primary action opens the real source. */}
                              {primary ? (
                                <div className="mt-3 rounded-xl border border-[var(--border-subtle)] p-3">
                                  <div className={`${SECTION_LABEL_CLASS} flex items-center gap-1`}>
                                    <BookOpen className="h-3 w-3" />
                                    {t('RESOURCE')}
                                  </div>
                                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                                        {primary.course.title}
                                      </p>
                                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-muted)]">
                                        <span>{primary.course.provider}</span>
                                        {primary.course.language && (
                                          <span>· {t(primary.course.language)}</span>
                                        )}
                                        {primary.course.format && (
                                          <span>
                                            ·{' '}
                                            {t(
                                              primary.course.format
                                                .replace('_', ' ')
                                                .replace(/^\w/, (letter) => letter.toUpperCase())
                                            )}
                                          </span>
                                        )}
                                        {primary.course.durationHours ? (
                                          <span>· {primary.course.durationHours}h</span>
                                        ) : null}
                                        {primary.rec && (
                                          <span className="rounded-full bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                                            {Math.round(primary.rec.score)}% {t('match')}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                      <a
                                        href={primary.course.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => {
                                          void startLearningCourse(
                                            primary.course.id,
                                            primary.rec?.reason
                                          );
                                          if (!isCompleted) {
                                            updateTaskStatus(task.id, 'in_progress');
                                          }
                                        }}
                                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] shadow-xs transition-opacity hover:opacity-90"
                                      >
                                        {ctaLabel}
                                        <ArrowUpRight className="h-4 w-4" />
                                      </a>
                                      {!item && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void saveLearningCourse(
                                              primary.course.id,
                                              primary.rec?.reason
                                            )
                                          }
                                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                          {t('Save')}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {secondary.length > 0 && (
                                    <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                                      <div className="text-[10px] text-[var(--text-muted)]">
                                        {t('More resources')}
                                      </div>
                                      <div className="mt-1 flex flex-col gap-1">
                                        {secondary.map(({ course }) =>
                                          isSafeExternalUrl(course.url) ? (
                                            <a
                                              key={course.id}
                                              href={course.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex min-w-0 items-center gap-1 text-[11px] text-[var(--color-primary-text)] hover:underline"
                                            >
                                              <ExternalLink className="h-3 w-3 shrink-0" />
                                              <span className="truncate">{course.title}</span>
                                              <span className="shrink-0 text-[var(--text-muted)]">
                                                · {course.provider}
                                              </span>
                                            </a>
                                          ) : (
                                            <span
                                              key={course.id}
                                              className="text-[11px] text-[var(--text-muted)]"
                                            >
                                              {course.title} · {course.provider}
                                            </span>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] p-3 text-[11px] text-[var(--text-muted)]">
                                  {t('No verified resource link is attached to this step yet.')}
                                </div>
                              )}

                              {/* OUTCOME: what the user will be able to do. */}
                              {task.description && (
                                <div className="mt-3">
                                  <div className={SECTION_LABEL_CLASS}>{t('OUTCOME')}</div>
                                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                                    {task.description}
                                  </p>
                                </div>
                              )}

                              {/* Secondary details and a subordinate status control. */}
                              <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                                <details className="group min-w-0">
                                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
                                    <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
                                    <span>
                                      {t('Details')} · {task.estimatedHours}h
                                      {task.difficulty ? ` · ${t(task.difficulty)}` : ''}
                                    </span>
                                  </summary>
                                  <div className="mt-2 space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                                    {task.deadline && (
                                      <p className="inline-flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                                        {t('Due')} {task.deadline}
                                      </p>
                                    )}
                                    {task.prerequisites && task.prerequisites.length > 0 && (
                                      <p className="flex items-start gap-1.5">
                                        <GitBranch className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                                        <span>
                                          <span className="font-semibold">
                                            {t('Prerequisites')}:{' '}
                                          </span>
                                          {task.prerequisites.join(' → ')}
                                        </span>
                                      </p>
                                    )}
                                    {task.projectTitles && task.projectTitles.length > 0 && (
                                      <div className="flex items-start gap-1.5">
                                        <FolderGit2 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                                        <span>
                                          <span className="font-semibold">
                                            {t('Recommended projects')}:{' '}
                                          </span>
                                          {task.projectTitles.join(' · ')}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </details>

                                <div className="flex shrink-0 items-center gap-2">
                                  <label
                                    className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                                    htmlFor={`status-${task.id}`}
                                  >
                                    {t('Status')}
                                  </label>
                                  <select
                                    id={`status-${task.id}`}
                                    value={task.status}
                                    onChange={(event) =>
                                      updateTaskStatus(
                                        task.id,
                                        event.target.value as RoadmapTaskStatus
                                      )
                                    }
                                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium capitalize ${
                                      task.status === 'completed'
                                        ? 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                                        : task.status === 'in_progress'
                                          ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                                          : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {t(status.replace('_', ' '))}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => toggleShowAll(stage.id)}
                        className="text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
                      >
                        {t('Show all')} {visibleTasks.length} {t('actions')}
                      </button>
                    )}

                    {/* The stage's learning resources, in one place. */}
                    {stage.resources.length > 0 && (
                      <div className="rounded-xl border border-[var(--border-subtle)] p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          <BookOpen className="h-3 w-3" />
                          {t('Resources for this stage')}
                        </div>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {stage.resources.map((resource) => {
                            const catalogCourse = courseById.get(resource.id);
                            return (
                              <a
                                key={resource.id}
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start justify-between gap-2 rounded-lg bg-[var(--surface-secondary)]/40 px-2.5 py-2 text-[11px] transition-colors hover:bg-[var(--surface-secondary)]"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-[var(--text-primary)]">
                                    {resource.title}
                                  </span>
                                  <span className="block text-[10px] text-[var(--text-muted)]">
                                    {resource.provider}
                                    {catalogCourse?.language ? ` · ${t(catalogCourse.language)}` : ''}
                                    {resource.durationHours ? ` · ${resource.durationHours}h` : ''}
                                  </span>
                                </span>
                                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* The project that proves the stage. */}
                    {stage.projects.length > 0 && (
                      <div className="rounded-xl border border-[var(--border-subtle)] p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          <FolderGit2 className="h-3 w-3" />
                          {t('Project for this stage')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {stage.projects.map((project) => (
                            <span
                              key={project}
                              className="rounded-full bg-[var(--accent-primary)]/10 px-2.5 py-1 text-[11px] text-[var(--color-primary-text)]"
                            >
                              {project}
                            </span>
                          ))}
                        </div>
                        {onNavigate && (
                          <button
                            type="button"
                            onClick={() => onNavigate('projects')}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline"
                          >
                            {t('See project briefs')}
                            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                          </button>
                        )}
                      </div>
                    )}

                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('learning')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
                      >
                        {t('Open the Learning Hub')}
                        <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              </section>
            </React.Fragment>
          );
        })}

        {/* The final state is derived, not generated. */}
        <section className="relative sm:ps-10">
          <div
            className={`absolute start-0 top-5 hidden h-8 w-8 items-center justify-center rounded-full border sm:flex ${
              jobReady
                ? 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                : 'border-dashed border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-muted)]'
            }`}
          >
            <Flag className="h-4 w-4" />
          </div>
          <div
            className={`rounded-2xl border p-5 ${
              jobReady
                ? 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)]'
                : 'border-dashed border-[var(--border-subtle)] bg-[var(--surface-main)]'
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <Sparkles className="h-3 w-3" />
                  {t('Final state')}
                </div>
                <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{t('Job Ready')}</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
                  {jobReady
                    ? t('Every roadmap step is complete. The next move is to apply: tailor your CV, track applications and practise interviews.')
                    : `${t('Finish the remaining')} ${Math.max(0, totalTasks - completedTasks)} ${t('actions to reach this state. It is calculated from your own completed steps, not from a new plan.')}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate?.('cv-studio')}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                >
                  {t('Tailor my CV')}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.('jobs')}
                  className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)]"
                >
                  {t('Find training')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
