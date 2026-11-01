import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  FolderGit2,
  HeartHandshake,
  Languages,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { isAtsAnalysisForRole } from '../../../shared/atsAnalysis';
import { AnimatedProgress } from '../motion/AnimatedProgress';
import { CountUp } from '../motion/CountUp';
import { EmptyState } from '../ui/EmptyState';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  onOpenCopilot: () => void;
}

interface MilestoneEntry {
  id: string;
  kind: 'interview' | 'deadline';
  label: string;
  date: string;
  title: string;
  detail: string;
}

const formatMilestoneDate = (value?: string): string => {
  if (!value) return '';
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = dayOnly
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

/**
 * The dashboard answers three questions and nothing else:
 *
 *   1. Where am I?      target role, readiness, and the three numbers that
 *                       describe real progress;
 *   2. What is next?    exactly one next step, with its reason and a start
 *                       control;
 *   3. What can help?   the one course, the one project and the one
 *                       volunteering route that are relevant now.
 *
 * Everything else — the metric grid, career health, milestones, the weekly
 * review — is still there, behind one "More detail" control. The page used
 * to show all of it at once, which is why it read as a wall of competing
 * recommendations.
 */
export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenCopilot }) => {
  const {
    profile,
    targetRole,
    analysis,
    roadmapPhases,
    skills,
    applications,
    projects,
    updateTaskStatus,
    dailyActions,
    toggleDailyAction,
    weeklyReview,
    careerHealth,
    cvVersions,
    learningRecommendations,
    t,
  } = useCareer();

  const [showDetails, setShowDetails] = useState(false);

  const allTasks = roadmapPhases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) => milestone.tasks)
  );
  const pendingTasks = allTasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'skipped'
  );
  const nextTask = pendingTasks[0];
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((task) => task.status === 'completed').length;
  const masteredSkillsCount = skills.filter((skill) => skill.gap === 0).length;
  const activeApplications = applications.filter(
    (application) => !['rejected', 'withdrawn', 'offer'].includes(application.stage)
  );
  const interviewCount = applications.filter((application) =>
    ['interview', 'technical', 'final'].includes(application.stage)
  ).length;
  const activeProject = projects.find((project) => project.status === 'in_progress') || projects[0];
  const topLearning = learningRecommendations[0];

  const readiness = Math.round(analysis.matchPercentage);
  const readinessLabel =
    readiness >= 80 ? t('Ready to apply') : readiness >= 55 ? t('Almost there') : t('Building foundations');

  const nextStep = nextTask
    ? {
        title: nextTask.title,
        description: nextTask.description,
        reason:
          nextTask.rationale ??
          `${t('This is the first unfinished step in your roadmap for')} ${targetRole.title}.`,
        hours: nextTask.estimatedHours,
        skill: nextTask.skillName ?? null,
      }
    : analysis.nextBestAction
      ? {
          title: analysis.nextBestAction.title,
          description: analysis.nextBestAction.description,
          reason: analysis.nextBestAction.reason,
          hours: null as number | null,
          skill: null as string | null,
        }
      : {
          title: t('Review your plan'),
          description: t('Open your roadmap and confirm the next step.'),
          reason: t('Your roadmap has no unfinished step right now.'),
          hours: null as number | null,
          skill: null as string | null,
        };

  const interviewMilestones: MilestoneEntry[] = applications
    .filter((application) => ['interview', 'technical', 'final'].includes(application.stage))
    .map((application) => ({
      id: `milestone-interview-${application.id}`,
      kind: 'interview' as const,
      label: `${application.stage.charAt(0).toUpperCase()}${application.stage.slice(1)} ${t('Stage')}`,
      date: application.nextActionDate || '',
      title: application.company,
      detail: application.interviewStageDetails || application.role,
    }));

  const deadlineMilestones: MilestoneEntry[] = roadmapPhases
    .flatMap((phase) =>
      phase.milestones.flatMap((milestone) =>
        milestone.tasks.map((task) => ({ task, milestoneTitle: milestone.title }))
      )
    )
    .filter(({ task }) => Boolean(task.deadline) && task.status !== 'completed')
    .map(({ task, milestoneTitle }) => ({
      id: `milestone-deadline-${task.id}`,
      kind: 'deadline' as const,
      label: t('Roadmap Deadline'),
      date: task.deadline || '',
      title: task.title,
      detail: milestoneTitle,
    }));

  const upcomingMilestones = [...interviewMilestones, ...deadlineMilestones];

  return (
    <div className="space-y-6">
      {/* Greeting: one sentence, one target. */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">
            {t('Welcome back')}, {profile.name}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Your next move for')} {targetRole.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('my-career')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            {t('Switch Target Role')}
          </button>
          <button
            type="button"
            onClick={onOpenCopilot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-colors hover:bg-[var(--accent-secondary)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('Ask Copilot')}</span>
          </button>
        </div>
      </div>

      {/* 1. Where am I? */}
      <section
        aria-labelledby="dashboard-where"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Target className="h-3 w-3" />
              {t('Where you are')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="dashboard-where" className="text-lg font-bold text-[var(--text-primary)]">
                {targetRole.title}
              </h2>
              <span className="rounded-full bg-[var(--accent-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-text)]">
                {readinessLabel}
              </span>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
              {t('Readiness is measured against the real requirements of this role, not against a generic template.')}
            </p>
          </div>

          <div className="w-full shrink-0 lg:w-72" data-guide="readiness">
            <div className="flex items-end justify-between">
              <span className="text-[11px] text-[var(--text-secondary)]">{t('Role readiness')}</span>
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                <CountUp value={readiness} format={(value) => `${Math.round(value)}%`} />
              </span>
            </div>
            <div className="mt-2">
              <AnimatedProgress
                value={readiness}
                label={t('Role readiness match')}
                fillClassName="bg-[var(--color-primary)]"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Skills')}
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
              {masteredSkillsCount}/{skills.length}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{t('mastered')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Roadmap')}
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
              {completedTasks}/{totalTasks}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{t('steps done')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Applications')}
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
              {activeApplications.length}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {interviewCount > 0 ? `${interviewCount} ${t('interviews')}` : t('active')}
            </div>
          </div>
        </div>

        {analysis.criticalGaps.length > 0 && (
          <div data-guide="skill-gaps" className="mt-4 border-t border-[var(--border-subtle)] pt-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Primary Skill Gaps')}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {analysis.criticalGaps.slice(0, 3).map((gap) => (
                <button
                  key={gap.skill}
                  type="button"
                  onClick={() => onNavigate('skills')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-1 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)]"
                >
                  <span>{gap.skill}</span>
                  <span className="font-mono text-[var(--text-muted)]">
                    {gap.current}/{gap.target}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. What is next? Exactly one step. */}
      <section
        aria-labelledby="dashboard-next"
        data-guide="next-action"
        className="relative overflow-hidden rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--surface-main)] p-5 shadow-xs sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('Your next step')}
            </div>
            <h2 id="dashboard-next" className="text-xl font-bold text-[var(--text-primary)]">
              {nextStep.title}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {nextStep.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
              {nextStep.skill && <span>{nextStep.skill}</span>}
              {nextStep.hours ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {nextStep.hours}h
                </span>
              ) : null}
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)]/60 px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('Why this')}: </span>
              {nextStep.reason}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
            <button
              type="button"
              onClick={() => onNavigate('roadmap')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-colors hover:bg-[var(--accent-secondary)]"
            >
              <PlayCircle className="h-4 w-4" />
              {t('Start this step')}
            </button>
            {nextTask && (
              <button
                type="button"
                onClick={() => updateTaskStatus(nextTask.id, 'completed')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--color-success-strong)]/40 hover:text-[var(--color-success-strong)]"
              >
                <CheckCircle2 className="h-4 w-4" />
                {t('Mark complete')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('roadmap')}
              className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              {t('View full roadmap')}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </section>

      {/* 3. What can help? One course, one project, one local route. */}
      <section aria-labelledby="dashboard-help" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <TrendingUp className="h-3 w-3" />
              {t('What can help')}
            </div>
            <h2 id="dashboard-help" className="mt-0.5 text-base font-bold text-[var(--text-primary)]">
              {t('Pick one, not all of them')}
            </h2>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {/* Learning */}
          <article className="flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <BookOpen className="h-3 w-3" />
              {t('Learn')}
            </div>
            {topLearning ? (
              <>
                <h3 className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
                  {topLearning.course.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Languages className="h-3 w-3" />
                    {t(topLearning.course.language)}
                  </span>
                  <span>·</span>
                  <span>
                    {t(
                      topLearning.course.format
                        .replace('_', ' ')
                        .replace(/^\w/, (letter) => letter.toUpperCase())
                    )}
                  </span>
                  <span>·</span>
                  <span>{topLearning.course.provider}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {topLearning.aiExplanation ?? topLearning.reason}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-3">
                  <a
                    href={topLearning.course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
                  >
                    {t('Open resource')}
                    <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onNavigate('learning')}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {t('More in Learn')}
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                icon={BookOpen}
                title={t('No course ranked yet')}
                description={t('Open the Learning Hub to rank real courses against your gaps.')}
              />
            )}
          </article>

          {/* Project */}
          <article className="flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <FolderGit2 className="h-3 w-3" />
              {t('Build')}
            </div>
            {activeProject ? (
              <>
                <h3 className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
                  {activeProject.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {activeProject.goal}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeProject.skills.slice(0, 3).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('projects')}
                  className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
                >
                  {t('Open the project')}
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </button>
              </>
            ) : (
              <EmptyState
                compact
                icon={FolderGit2}
                title={t('No project yet')}
                description={t('A small project is the fastest way to prove a skill.')}
              />
            )}
          </article>

          {/* Volunteering */}
          <article className="flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <HeartHandshake className="h-3 w-3" />
              {t('Volunteer')}
            </div>
            <h3 className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
              {t('Practise in Egypt')}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {t('Egyptian organisations you can join now, filtered by the skills you still need.')}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('volunteer')}
              className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
            >
              {t('See Egypt opportunities')}
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </button>
          </article>
        </div>
      </section>

      {/* Progressive disclosure: the detail is available, not in the way. */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]">
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
        >
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {t('More detail')}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              {t('Career health, milestones, weekly review and today’s actions')}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${showDetails ? 'rotate-180' : ''}`}
          />
        </button>

        {showDetails && (
          <div className="space-y-5 border-t border-[var(--border-subtle)] p-5">
            {/* Today's actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Today’s high-impact actions')}
                </h3>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {dailyActions.filter((action) => action.completed).length} {t('of')}{' '}
                  {dailyActions.length} {t('completed')}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {dailyActions.map((action) => (
                  <div
                    key={action.id}
                    onClick={() => toggleDailyAction(action.id)}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-start transition-colors ${
                      action.completed
                        ? 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 opacity-75'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="mt-0.5 text-[var(--color-primary-text)]">
                      {action.completed ? (
                        <CheckSquare className="h-4 w-4 text-[var(--color-success-strong)]" />
                      ) : (
                        <Square className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div
                        className={`text-xs font-bold ${
                          action.completed
                            ? 'text-[var(--text-muted)] line-through'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {action.title}
                      </div>
                      <div className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        {action.description}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onNavigate(action.actionView);
                        }}
                        className="text-[10px] font-semibold text-[var(--color-primary-text)] hover:underline"
                      >
                        {t('Open')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { label: t('Role readiness match'), value: `${readiness}%` },
                { label: t('Skills mastered'), value: `${masteredSkillsCount}/${skills.length}` },
                { label: t('Roadmap completion'), value: `${completedTasks}/${totalTasks}` },
                { label: t('Active applications'), value: `${activeApplications.length}` },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-[var(--border-subtle)] p-3"
                >
                  <div className="text-[10px] text-[var(--text-secondary)]">{metric.label}</div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Career health + milestones */}
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--color-success-strong)]" />
                    {t('Career Health Breakdown')}
                  </h3>
                  <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                    {careerHealth.overallHealth}%
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {[
                    { label: t('Skills Confidence'), val: careerHealth.skillsConfidence },
                    { label: t('Evidence Coverage'), val: careerHealth.evidenceCoverage },
                    { label: t('CV Role Alignment'), val: careerHealth.cvAlignment },
                    { label: t('Market Engagement'), val: careerHealth.marketEngagement },
                  ].map((dimension) => (
                    <div key={dimension.label} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-medium text-[var(--text-primary)]">
                          {dimension.label}
                        </span>
                        <span className="font-mono text-[var(--text-muted)]">{dimension.val}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-progress-track)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-progress-strong)]"
                          style={{ width: `${dimension.val}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                  <Calendar className="h-4 w-4 text-[var(--color-primary-text)]" />
                  {t('Upcoming Milestones')}
                </h3>
                <div className="mt-3 space-y-2">
                  {upcomingMilestones.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Calendar}
                      title={t('No upcoming milestones yet')}
                      description={t('Interview stages and roadmap deadlines appear here as they come up.')}
                    />
                  ) : (
                    upcomingMilestones.slice(0, 4).map((milestone) => (
                      <div
                        key={milestone.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {milestone.label}
                          </div>
                          <div className="truncate text-xs font-medium text-[var(--text-primary)]">
                            {milestone.title}
                          </div>
                        </div>
                        {milestone.date && (
                          <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                            {formatMilestoneDate(milestone.date)}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Weekly review */}
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Weekly Career Review')}
                </h3>
                <span className="rounded bg-[var(--color-success-surface)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--color-success-strong)]">
                  {t('Health Score:')} {weeklyReview.healthScore}/100
                </span>
              </div>
              <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                    {t('Accomplishments This Week')}
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {weeklyReview.keyAchievements.map((achievement, index) => (
                      <li key={index} className="flex items-start gap-1.5">
                        <span className="font-bold text-[var(--color-success-strong)]">✓</span>
                        <span>{achievement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                    {t('Priorities For Next Week')}
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {weeklyReview.nextWeekPriorities.map((priority, index) => (
                      <li key={index} className="flex items-start gap-1.5">
                        <span className="font-bold text-[var(--color-primary-text)]">→</span>
                        <span>{priority}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Workspace links */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('cv-studio')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                <FileText className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
                {t('CV Studio')}
                <span className="text-[10px] text-[var(--text-muted)]">
                  {isAtsAnalysisForRole(cvVersions[0]?.targetRoleTitle, targetRole.title)
                    ? `${cvVersions[0]?.atsAnalysis?.overallScore ?? '—'}`
                    : '—'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('jobs')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                <Briefcase className="h-3.5 w-3.5 text-[var(--color-success-strong)]" />
                {t('Training & Courses')}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('interviews')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                <Target className="h-3.5 w-3.5 text-[var(--color-warning)]" />
                {t('Interview practice')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
