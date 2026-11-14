import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  FolderGit2,
  LayoutGrid,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { isAtsAnalysisForRole } from '../../../shared/atsAnalysis';
import { computeCareerMetrics, type CareerJourneyStage } from '../../../shared/careerMetrics';
import { EmptyState } from '../ui/EmptyState';
import { CareerJourneyStepper } from '../career/CareerJourneyStepper';
import { MetricCard } from '../career/MetricCard';
import { RecentActivityPanel } from '../career/RecentActivityPanel';
import { DashboardFeedbackCard } from '../feedback/DashboardFeedbackCard';
import { DailyTokenClaim } from '../subscription/DailyTokenClaim';

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
    learningItems,
    evidenceItems,
    interviewSessions,
    visibleNotifications,
    markNotificationRead,
    recordNotificationClick,
    identity,
    t,
  } = useCareer();

  const [showDetails, setShowDetails] = useState(false);

  // A critical announcement is the one communication that may step in front of
  // the dashboard. It is derived from the real inbox (and respects the device's
  // in-app notification preference), and it disappears once it is read.
  const criticalNotice = visibleNotifications.find(
    (notification) => !notification.read && notification.priority === 'critical'
  );

  const allTasks = roadmapPhases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) => milestone.tasks)
  );
  const pendingTasks = allTasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'skipped'
  );
  const nextTask = pendingTasks[0];
  const activeApplications = applications.filter(
    (application) => !['rejected', 'withdrawn', 'offer'].includes(application.stage)
  );

  // How much of the candidate's learning is actually finished. A course that
  // was only saved is not progress.
  const completedLearningCount = useMemo(
    () => learningItems.filter((item) => item.status === 'completed').length,
    [learningItems]
  );

  /* --------------------------------------------------------------------
   * THE ONE SET OF NUMBERS
   *
   * The Dashboard used to compute its own readiness, its own skills-mastered
   * count and its own roadmap progress, each with its own formula. The
   * Career Journey page computed a fourth set. The candidate was told four
   * different numbers for the same thing.
   *
   * Everything below now comes from the Career Intelligence Engine, so the
   * Dashboard shows the same figures as the Skills Center, the Roadmap and
   * the Career Journey — and every one of them can explain itself.
   * -------------------------------------------------------------------- */
  const metrics = useMemo(
    () =>
      computeCareerMetrics({
        skills: skills.map((skill) => ({
          name: skill.name,
          currentLevel: skill.currentLevel,
          targetLevel: skill.targetLevel,
          // A skill the candidate still has below its target is treated as a
          // required skill of the role, because that is exactly what the
          // platform compares them against.
          importance: skill.gap > 0 ? 'high' : 'medium',
          required: skill.gap > 0,
        })),
        roadmapTasks: allTasks.map((task) => ({
          id: task.id,
          status: task.status,
          skillName: task.skillName ?? null,
        })),
        journey: {
          profile: { complete: Boolean(profile?.name && targetRole) },
          assessment: { attempted: skills.some((skill) => skill.assessedLevel != null) },
          learning: {
            started: learningRecommendations.length > 0,
            completedCourses: completedLearningCount,
            totalCourses: learningRecommendations.length,
          },
          projects: {
            completed: projects.filter((project) => project.status === 'completed').length,
            target: 2,
          },
          apply: { applications: activeApplications.length, target: 1 },
        },
        blockingSkillNames: allTasks
          .filter((task) => task.status !== 'completed' && task.status !== 'skipped')
          .map((task) => task.skillName)
          .filter((name): name is string => Boolean(name)),
        careerGoal: targetRole?.title ?? null,
      }),
    [
      skills,
      allTasks,
      profile?.name,
      targetRole,
      completedLearningCount,
      learningRecommendations.length,
      projects,
      activeApplications.length,
    ]
  );

  /**
   * The one next step.
   *
   * It is driven by the highest-priority skill gap rather than by whichever
   * roadmap task happens to be first in the list, because the gap is what the
   * candidate is actually short of and what the recommendation is for.
   */
  const priorityGap = metrics.gaps[0] ?? null;

  const gapLearning = useMemo(() => {
    if (!priorityGap) return null;
    const needle = priorityGap.name.toLowerCase();
    return (
      learningRecommendations.find(
        (recommendation) =>
          recommendation.course.title.toLowerCase().includes(needle) ||
          recommendation.matchedSkills.some((skill) => skill.toLowerCase().includes(needle))
      ) ?? null
    );
  }, [priorityGap, learningRecommendations]);

  const nextStep = useMemo(() => {
    if (priorityGap) {
      const recommended = gapLearning?.course.title ?? analysis.nextBestAction?.title ?? null;
      return {
        title: `${t('Improve your')} ${priorityGap.name} ${t('Skills')}`,
        description: priorityGap.reason,
        reason: priorityGap.blocker
          ? `${t('Why this')}: ${priorityGap.reason}`
          : recommended
            ? `${t('Recommended')}: ${recommended}`
            : priorityGap.reason,
        hours: gapLearning?.course.durationHours ?? null,
        skill: priorityGap.name,
        currentLevel: priorityGap.currentLevel,
        targetLevel: priorityGap.targetLevel,
        recommended,
        view: gapLearning ? 'learning' : 'skills',
      };
    }

    if (nextTask) {
      return {
        title: nextTask.title,
        description: nextTask.description,
        reason:
          nextTask.rationale ??
          `${t('This is the first unfinished step in your roadmap for')} ${targetRole?.title ?? ''}.`,
        hours: nextTask.estimatedHours ?? null,
        skill: nextTask.skillName ?? null,
        currentLevel: null as number | null,
        targetLevel: null as number | null,
        recommended: null as string | null,
        view: 'roadmap',
      };
    }

    return {
      title: t('Review your plan'),
      description: t('Open your roadmap and confirm the next step.'),
      reason: t('Your roadmap has no unfinished step right now.'),
      hours: null as number | null,
      skill: null as string | null,
      currentLevel: null as number | null,
      targetLevel: null as number | null,
      recommended: null as string | null,
      view: 'roadmap',
    };
  }, [priorityGap, gapLearning, nextTask, analysis.nextBestAction, targetRole, t]);

  const readiness = metrics.roleReadinessPct;
  const readinessLabel =
    readiness >= 80 ? t('Ready to apply') : readiness >= 55 ? t('Almost there') : t('Building foundations');

  // The certifications the user actually has on file. It is a count of real
  // records — never a default.
  const certificationCount = profile?.certifications?.length ?? 0;

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

  /**
   * The greeting follows the candidate's own clock.
   *
   * "Good morning" at 9am and "Good evening" at 8pm is a small thing, but the
   * Dashboard opens with this line, and it is the difference between a page
   * that knows who is looking at it and a template.
   */
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Good morning');
    if (hour < 18) return t('Good afternoon');
    return t('Good evening');
  }, [t]);

  return (
    <div className="space-y-6">
      {/* A critical announcement is the only thing allowed above the greeting. */}
      {criticalNotice && (
        <section
          role="alert"
          aria-labelledby="dashboard-critical-announcement"
          className="flex flex-col gap-3 rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-danger)]">
                {t('Critical announcement')}
              </div>
              <h2
                id="dashboard-critical-announcement"
                className="mt-0.5 text-sm font-bold text-[var(--text-primary)]"
              >
                {criticalNotice.title}
              </h2>
              {criticalNotice.message && (
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {criticalNotice.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {criticalNotice.linkAction && (
              <button
                type="button"
                onClick={async () => {
                  await recordNotificationClick(criticalNotice.id);
                  onNavigate(criticalNotice.linkAction!);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {t('See details')}
                <ArrowRight className="h-3 w-3 rtl:rotate-180" />
              </button>
            )}
            <button
              type="button"
              onClick={() => markNotificationRead(criticalNotice.id)}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t('Dismiss')}
            </button>
          </div>
        </section>
      )}

      {/* The header says who you are, where you are going and what you are
          doing about it — in three lines. The old header spent a whole band on
          a "Switch Target Role" button and a large token banner, which pushed
          the actual content below the fold. The token reward now lives in the
          header's balance badge, where it belongs. */}
      <header
        data-tour="dashboard-greeting"
        className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {greeting}, {identity.displayName}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">
              {t('Your Career Goal')}:
            </span>{' '}
            {targetRole?.title ?? t('Not set yet')}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {readinessLabel}
            {targetRole?.category ? ` · ${targetRole.category}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* The daily reward sits beside the balance the topbar shows. It is
              the same widget as the one inside that badge, so the platform
              never states two different opinions about today's tokens. */}
          <DailyTokenClaim variant="compact" />
          <button
            type="button"
            onClick={onOpenCopilot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-colors hover:bg-[var(--accent-secondary)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('Ask Copilot')}</span>
          </button>
        </div>
      </header>

      {/* The getting-started banner is for a candidate who has not started.
          It used to be on every dashboard, which meant it was noise for
          everyone else. */}
      {!profile.onboardingCompleted && (
        <section className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('Getting started')}</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Complete your profile and take your first assessment to build your plan.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('Set up my profile')}
          </button>
        </section>
      )}

      {/* SECTION 1 — YOUR CAREER OVERVIEW
          *
          * Three numbers, one row, each one able to explain itself. The
          * candidate does not have to guess what "77%" is made of: pressing
          * any of them shows the definition, the formula and their own
          * arithmetic.
          *
          * These are the same numbers the Career Journey, the Skills Center
          * and the Roadmap show, because they all come from the Career
          * Intelligence Engine. */}
      <section
        data-tour="dashboard-target-role"
        aria-labelledby="dashboard-overview"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Target className="h-3 w-3" />
            <h2 id="dashboard-overview">{t('Your career overview')}</h2>
          </div>
          {targetRole ? (
            <span className="rounded-full bg-[var(--accent-surface)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary-text)]">
              {targetRole.title}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
            >
              {t('Set my target role')}
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricCard
            metricId="roleReadiness"
            label={t('Role readiness')}
            value={`${metrics.roleReadinessPct}%`}
            hint={readinessLabel}
            metrics={metrics}
            tone="primary"
          />
          <MetricCard
            metricId="skillsMastered"
            label={t('Skills mastered')}
            value={`${metrics.skillsMastered}/${metrics.skillsTotal}`}
            hint={t('mastered')}
            metrics={metrics}
            tone="success"
          />
          <MetricCard
            metricId="roadmapCompletion"
            label={t('Roadmap progress')}
            value={`${metrics.roadmapCompleted}/${metrics.roadmapTotal}`}
            hint={t('steps done')}
            metrics={metrics}
            tone="warning"
          />
        </div>

        {/* The gaps, with the classification explained. Every badge says why
            it is critical or blocking. */}
        {metrics.gaps.length > 0 ? (
          <div data-guide="skill-gaps" className="mt-4 border-t border-[var(--border-subtle)] pt-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Your skill gaps')}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {metrics.gaps.slice(0, 4).map((gap) => (
                <button
                  key={gap.name}
                  type="button"
                  onClick={() => onNavigate('skills')}
                  title={gap.reason}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    gap.blocker
                      ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--text-primary)]'
                      : gap.critical
                        ? 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 text-[var(--text-primary)]'
                  } hover:border-[var(--accent-primary)]`}
                >
                  <span>{gap.name}</span>
                  <span className="font-mono text-[var(--text-muted)]">
                    {gap.currentLevel}/{gap.targetLevel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* SECTION 2 — YOUR NEXT STEP
          *
          * The most prominent card on the page, because it is the only thing
          * on the page the candidate can act on. It is driven by their
          * highest-priority skill gap, and it shows the two numbers that
          * define that gap: where they are and where they need to be. */}
      <section
        aria-labelledby="dashboard-next"
        data-guide="next-action"
        className="relative overflow-hidden rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--surface-main)] p-5 shadow-xs sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t('Your next step')}</span>
            </div>
            <h2 id="dashboard-next" className="text-xl font-bold text-[var(--text-primary)]">
              {nextStep.title}
            </h2>

            {/* The two numbers that define the gap, side by side. */}
            {nextStep.currentLevel !== null && nextStep.targetLevel !== null ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
                  {t('Your current level')}:
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {nextStep.currentLevel}/5
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
                  {t('Target level')}:
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {nextStep.targetLevel}/5
                  </span>
                </span>
                {nextStep.hours ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
                    <Clock className="h-3.5 w-3.5" />
                    {t('Estimated time')}:
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      {nextStep.hours}h
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {nextStep.description}
            </p>

            {nextStep.recommended ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">
                  {t('Recommended')}:
                </span>
                <span>{nextStep.recommended}</span>
              </div>
            ) : null}

            <div className="rounded-xl bg-[var(--surface-secondary)]/60 px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {nextStep.reason}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
            <button
              type="button"
              onClick={() => onNavigate(nextStep.view)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-colors hover:bg-[var(--accent-secondary)]"
            >
              <PlayCircle className="h-4 w-4" />
              {nextStep.view === 'learning'
                ? t('Continue learning')
                : nextStep.view === 'skills'
                  ? t('Work on this skill')
                  : t('Start this step')}
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

      {/* SECTION 3 — MY CAREER JOURNEY
          *
          * Five stages on one line, with the candidate's current stage marked
          * and the overall completion shown. It was a tall vertical list of
          * cards before, which meant the journey pushed everything below it
          * off the screen. */}
      <CareerJourneyStepper
        currentStage={metrics.currentStage as CareerJourneyStage}
        stageProgress={metrics.stageProgress}
        overallPercent={metrics.journeyProgressPct}
        onNavigate={onNavigate}
      />

      {/* SECTION 4 — RECENT ACTIVITY
          *
          * Only the last three items. The full history lives on its own page,
          * and a Dashboard that lists everything is a Dashboard that never
          * shows the end of anything. */}
      <RecentActivityPanel onNavigate={onNavigate} limit={3} />

      {/* SECTION 5 — QUICK ACCESS
          *
          * The five places the candidate actually work. Everything else on
          * the platform is one step further away than this row. */}
      <section aria-labelledby="dashboard-quick-access" className="space-y-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <LayoutGrid className="h-3 w-3" />
          <h2 id="dashboard-quick-access">{t('Quick access')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              view: 'skills',
              label: t('My Skills'),
              icon: Zap,
              badge: `${metrics.gaps.length}`,
            },
            {
              view: 'roadmap',
              label: t('My Roadmap'),
              icon: TrendingUp,
              badge: `${metrics.roadmapTotal}`,
            },
            {
              view: 'projects',
              label: t('My Projects'),
              icon: FolderGit2,
              badge: `${projects.length}`,
            },
            {
              view: 'cv-studio',
              label: t('My CV'),
              icon: FileText,
              badge: `${cvVersions.length}`,
            },
            {
              view: 'applications',
              label: t('Applications'),
              icon: Briefcase,
              badge: `${activeApplications.length}`,
            },
          ].map((shortcut) => (
            <button
              key={shortcut.view}
              type="button"
              onClick={() => onNavigate(shortcut.view)}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 text-start shadow-xs transition-colors hover:border-[var(--accent-primary)]"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-surface)] text-[var(--color-primary-text)]"
                aria-hidden="true"
              >
                <shortcut.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                  {shortcut.label}
                </span>
                <span className="block font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                  {shortcut.badge}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* A permanent, quiet route to the feedback form. It is not an
          interruption: it sits below the work, and dismissing it never
          removes the account-menu and Settings routes. */}
      <DashboardFeedbackCard />

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

            {/* Metrics.
                These used to repeat the hero card exactly — readiness,
                skills mastered, roadmap steps and applications — so the same
                four numbers appeared twice on one screen. The hero owns those
                four. What is left here are the numbers the hero does NOT
                show: the evidence behind the claims, the projects that
                prove the skills, the certifications on file and the interviews
                practised. */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { label: t('Evidence artifacts'), value: `${evidenceItems.length}` },
                { label: t('Projects'), value: `${projects.length}` },
                { label: t('Certifications'), value: `${certificationCount}` },
                { label: t('Mock interviews'), value: `${interviewSessions.length}` },
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
                  {isAtsAnalysisForRole(cvVersions[0]?.targetRoleTitle, targetRole?.title ?? '')
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
