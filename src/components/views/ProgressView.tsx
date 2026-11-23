import React, { useMemo } from 'react';
import {
  Award,
  Layers,
  FolderGit2,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  Flame,
  Star,
  CalendarDays,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  PlayCircle,
  GraduationCap,
  Activity,
  Target,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { AnimatedProgress } from '../motion/AnimatedProgress';
import {
  BarChart,
  ChartCard,
  DonutChart,
  LineChart,
  chartColor,
  formatCount,
  type ChartDatum,
} from '../charts';
import { buildRouteHash } from '../../lib/routing';
import {
  computeActivityStreak,
  groupMilestonesByYear,
  weeklyActivityBuckets,
  type TimelineMilestone,
} from '../../../shared/progressMomentum';
import {
  computeInterviewReadiness,
  portfolioTarget,
} from '../../../shared/interviewReadiness';
import {
  cvReadinessFromVersions,
  roleReadinessFromSkills,
} from '../../../shared/careerMetrics';
import { computeProgressSnapshot, isProgressSkillMastered } from '../../../shared/progressMetrics';
import type { ApplicationStage } from '../../types/career';

/**
 * The Progress Dashboard.
 *
 * WHY EVERY CARD IS A DOOR
 * A number a candidate cannot act on is a number they can only stare at. Every
 * card here counts something from the candidate's own records and, where there
 * is a place to act on it, opens that place — with the filter that makes the
 * destination show the records the card counted. "In progress: 3" opens the
 * Learning Hub already filtered to the courses in progress; "Interviews: 2"
 * opens the interview history. The route carries the filter, so the link can
 * be refreshed, shared and bookmarked.
 *
 * WHAT IS NOT SHOWN
 * Only figures the platform can compute from stored records are shown. A
 * figure that cannot be measured reads "—" with the reason beside it rather
 * than a plausible-looking zero. Nothing on this page is estimated.
 */

/** Where a statistic leads. */
interface StatDestination {
  route: string;
  params?: Record<string, string>;
  /** The accessible description of the action, e.g. "open the courses in progress". */
  action: string;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint: string;
  /** The icon chip's colour classes. */
  tone: string;
  destination?: StatDestination;
  /** Stable hook for the browser checks. */
  hook?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  destination,
  hook,
}) => {
  const { t } = useCareer();

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-[var(--text-secondary)]">{label}</div>
        {destination ? (
          <ArrowUpRight
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          />
        ) : null}
      </div>
      <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      <div className="text-xs leading-relaxed text-[var(--text-muted)]">{hint}</div>
      {destination ? (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary-text)]">
          <span>{t(destination.action)}</span>
          <ArrowRight aria-hidden="true" className="h-3 w-3 rtl:rotate-180" />
        </div>
      ) : null}
    </>
  );

  const shared =
    'group flex h-full w-full flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 text-start shadow-xs transition-colors duration-200 motion-reduce:transition-none';

  return (
    <StaggerItem className="h-full">
      {destination ? (
        <button
          type="button"
          data-progress-stat={hook}
          onClick={() => {
            window.location.hash = buildRouteHash(destination.route, destination.params);
          }}
          aria-label={`${label}: ${t(destination.action)}`}
          className={`${shared} hover:border-[var(--border-strong)] hover:bg-[var(--surface-secondary)]/40 focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40`}
        >
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${tone}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          {body}
        </button>
      ) : (
        <div data-progress-stat={hook} className={shared}>
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${tone}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          {body}
        </div>
      )}
    </StaggerItem>
  );
};

const STAT_TONES = {
  primary:
    'bg-[var(--accent-surface)] text-[var(--color-primary-text)] border-[var(--accent-primary)]/25',
  success:
    'bg-[var(--color-success-surface)] text-[var(--color-success-strong)] border-[var(--color-success-strong)]/25',
  warning:
    'bg-[var(--color-warning-surface)] text-[var(--color-warning)] border-[var(--color-warning)]/25',
  info: 'bg-[var(--surface-secondary)] text-[var(--color-info)] border-[var(--border-subtle)]',
} as const;

export const ProgressView: React.FC = () => {
  const {
    profile,
    targetRole,
    skills,
    roadmapPhases,
    cvVersions,
    projects,
    evidenceItems,
    applications,
    interviewSessions,
    learningItems,
    learningRecommendations,
    learningCatalog,
    bookmarkedJobIds,
    milestones,
    activities,
    t,
  } = useCareer();

  const safeSkills = Array.isArray(skills) ? skills : [];
  const safeRoadmapPhases = Array.isArray(roadmapPhases) ? roadmapPhases : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const safeEvidenceItems = Array.isArray(evidenceItems) ? evidenceItems : [];
  const safeApplications = Array.isArray(applications) ? applications : [];
  const safeInterviewSessions = Array.isArray(interviewSessions) ? interviewSessions : [];
  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  const safeActivities = Array.isArray(activities) ? activities : [];
  const safeLearningItems = Array.isArray(learningItems) ? learningItems : [];
  const safeLearningCatalog = Array.isArray(learningCatalog) ? learningCatalog : [];
  const safeRecommendations = Array.isArray(learningRecommendations) ? learningRecommendations : [];
  const safeSavedJobIds = Array.isArray(bookmarkedJobIds) ? bookmarkedJobIds : [];
  const safeCertifications = Array.isArray(profile?.certifications) ? profile.certifications : [];

  /**
   * The page's own figures, computed by the shared calculator so a migrated
   * account with legacy skill rows reads the same as a fresh one.
   */
  const snapshot = computeProgressSnapshot({ skills: safeSkills, roadmapPhases: safeRoadmapPhases });
  const totalTasks = snapshot.totalTasks;
  const completedTasks = snapshot.completedTasks;
  const remainingTasks = Math.max(0, totalTasks - completedTasks);
  const roadmapPct = snapshot.roadmapPct;

  const masteredSkillList = safeSkills.filter(isProgressSkillMastered);
  const masteredSkills = snapshot.masteredSkills;
  const skillsAtTarget = snapshot.skillsAtTarget;
  const unverifiedAtTarget = snapshot.unverifiedAtTarget;
  const inProgressSkills = snapshot.inProgressSkills;
  const completedProjects = safeProjects.filter(
    (project) => project?.status === 'completed' || project?.status === 'published'
  );
  const activeApplications = safeApplications.filter(
    (application) => !['rejected', 'withdrawn'].includes(application?.stage)
  );
  const offers = safeApplications.filter((application) => application?.stage === 'offer');

  /**
   * The portfolio target for this role.
   *
   * The card used to read "Shipped Projects: 0/0", which told the candidate
   * nothing: a denominator of zero is not a goal. It now reads the number of
   * projects completed against the number the role expects, and the target is
   * at least two — the smallest portfolio a hiring manager reads as evidence.
   */
  const portfolioGoal = portfolioTarget(targetRole?.typicalProjects);

  /**
   * The career readiness figure.
   *
   * It is the same engine the Dashboard, the Skills Center and the Roadmap use,
   * so the four pages cannot disagree about it. It is computed from the skill
   * list plus the CV's own readiness contribution.
   */
  const careerReadiness = useMemo(
    () =>
      roleReadinessFromSkills(
        safeSkills,
        cvReadinessFromVersions(cvVersions, targetRole?.title)
      ),
    [safeSkills, cvVersions, targetRole?.title]
  );

  /**
   * The four interview measures, kept independent of one another.
   *
   * Readiness is measured from the mock interviews and the candidate's skill
   * readiness. It is not reduced by having no job applications: a candidate
   * who has not applied yet has not failed to interview.
   */
  const interviewMetrics = useMemo(
    () =>
      computeInterviewReadiness(
        safeInterviewSessions.map((session) => ({
          score: session?.aiFeedback?.score ?? null,
          roleTitle: session?.roleTitle ?? null,
        })),
        careerReadiness
      ),
    [safeInterviewSessions, careerReadiness]
  );

  /** The learning counters, counted from the candidate's own records. */
  const learningCounts = useMemo(() => {
    const byStatus = (status: string) =>
      safeLearningItems.filter((item) => item?.status === status).length;
    const inProgress = safeLearningItems.filter((item) => item?.status === 'in_progress');
    const averageProgress =
      inProgress.length === 0
        ? null
        : Math.round(
            inProgress.reduce((sum, item) => {
              const value = Number(item?.progressPercent);
              return sum + (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);
            }, 0) / inProgress.length
          );

    // The course to resume is the most recently started one that is not
    // finished. It is read from the candidate's own rows, never chosen.
    const resumeItem = [...inProgress].sort((a, b) =>
      (a?.startedAt ?? '') < (b?.startedAt ?? '') ? 1 : -1
    )[0];
    const resumeCourse = resumeItem
      ? safeLearningCatalog.find((course) => course?.id === resumeItem.courseId)
      : undefined;

    return {
      recommended: safeRecommendations.length,
      saved: byStatus('saved'),
      inProgress: inProgress.length,
      completed: byStatus('completed'),
      averageProgress,
      resumeTitle: resumeCourse?.title ?? null,
      resumeProgress: resumeItem?.progressPercent ?? null,
    };
  }, [safeLearningItems, safeLearningCatalog, safeRecommendations.length]);

  // The streak comes from the user's own recorded activity, so it reflects
  // what they actually did rather than what the plan hoped they would do.
  const streak = useMemo(
    () => computeActivityStreak(safeActivities.map((activity) => ({ timestamp: activity?.timestamp }))),
    [safeActivities]
  );

  /**
   * The weekly activity chart.
   *
   * Every bar is a count of the candidate's own recorded actions in that week.
   * Weeks with nothing recorded are drawn empty instead of skipped, because a
   * quiet week is a fact about their momentum and hiding it would flatter the
   * chart.
   */
  const activityWeeks = useMemo(
    () => weeklyActivityBuckets(safeActivities.map((activity) => ({ timestamp: activity?.timestamp })), 8),
    [safeActivities]
  );
  const activityPeak = Math.max(1, ...activityWeeks.map((week) => week.count));
  const activityTotal = activityWeeks.reduce((sum, week) => sum + week.count, 0);

  const formatWeekLabel = (start: string): string => {
    const parsed = new Date(`${start}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return start;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // The milestones are the ones the user recorded. They are grouped by year
  // for the timeline; nothing is inferred from a percentage.
  const timeline = useMemo(
    () =>
      groupMilestonesByYear(
        safeMilestones.map(
          (milestone): TimelineMilestone => ({
            id: milestone?.id ?? '',
            title: milestone?.title ?? '',
            category: milestone?.category ?? '',
            dateAchieved: milestone?.dateAchieved ?? '',
            note: milestone?.notes ?? undefined,
            verified: milestone?.verified === true,
          })
        )
      ),
    [safeMilestones]
  );

  const milestoneTotal = timeline.reduce((sum, group) => sum + group.milestones.length, 0);

  /**
   * The pipeline, split by the stage each application is really at.
   *
   * It is not the same information as the counters above: those count the
   * total, the interviews and the offers. This shows where the whole pipeline
   * sits, including the applications that were rejected or withdrawn — which
   * is the part a candidate cannot see anywhere else on this page.
   */
  const applicationStages = useMemo(() => {
    const stages: Array<{ key: ApplicationStage; label: string }> = [
      { key: 'saved', label: 'Saved' },
      { key: 'applied', label: 'Applied' },
      { key: 'screening', label: 'Screening' },
      { key: 'interview', label: 'Interview' },
      { key: 'technical', label: 'Technical' },
      { key: 'final', label: 'Final' },
      { key: 'offer', label: 'Offer' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'withdrawn', label: 'Withdrawn' },
    ];
    return stages
      .map((stage) => ({
        key: stage.key,
        label: t(stage.label),
        value: safeApplications.filter((application) => application?.stage === stage.key).length,
      }))
      .filter((entry) => entry.value > 0);
  }, [safeApplications, t]);

  /**
   * The score of each scored mock interview, oldest first.
   *
   * Only sessions the model actually scored are on this line: a session with
   * no score is not a zero, it is a session that was not measured, and drawing
   * it as zero would invent a dip that did not happen.
   */
  const interviewTrend = useMemo(
    () =>
      [...safeInterviewSessions]
        .filter((session) => typeof session?.aiFeedback?.score === 'number' && session.createdAt)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((session) => {
          const parsed = new Date(session.createdAt);
          const label = Number.isNaN(parsed.getTime())
            ? session.createdAt.slice(0, 10)
            : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return {
            label,
            value: session.aiFeedback?.score ?? 0,
            hint: `${label} · ${session.roleTitle || t('Mock interview')}: ${session.aiFeedback?.score ?? 0} / 10`,
          };
        }),
    [safeInterviewSessions, t]
  );

  const weeklyActivity: ChartDatum[] = activityWeeks.map((week) => {
    const label = formatWeekLabel(week.start);
    return {
      key: week.start,
      label: week.isCurrent ? t('this week') : label,
      value: week.count,
      hint: `${t('Week of')} ${label}: ${week.count} ${week.count === 1 ? t('action') : t('actions')}`,
      color: week.isCurrent ? 'var(--color-primary)' : 'var(--accent-primary)',
    };
  });

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('MEASURABLE OUTCOMES')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Career Progression Dashboard')}
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {t('This page is built only from your own records. Every card opens the section it counts.')}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          {targetRole?.title ? (
            <div className="text-xs text-[var(--text-muted)]">
              {t('Target Role:')} <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-secondary)]">
              {t('No target role selected yet.')}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!targetRole?.title ? (
              <button
                type="button"
                onClick={() => {
                  window.location.hash = buildRouteHash('roles');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
              >
                {t('Choose a target role')}
                <ArrowRight aria-hidden="true" className="h-3 w-3 rtl:rotate-180" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                window.location.hash = buildRouteHash('roadmap');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
            >
              {t('Open roadmap')}
              <ArrowRight aria-hidden="true" className="h-3 w-3 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {/* 6 Primary Progress Pillars */}
      <Stagger data-tour="progress-metrics" inView gap={0.06} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          hook="skills"
          icon={Award}
          tone={STAT_TONES.success}
          label={t('Mastered Skills')}
          value={
            <>
              {skillsAtTarget} <span className="text-sm font-normal text-[var(--text-muted)]">/ {snapshot.totalSkills}</span>
            </>
          }
          hint={`${masteredSkills} ${t('assessed or verified')} · ${unverifiedAtTarget} ${t('at target without evidence')} · ${inProgressSkills} ${t('actively advancing')}`}
          destination={{ route: 'skills', action: 'open your skills' }}
        />

        <StatCard
          hook="roadmap"
          icon={Layers}
          tone={STAT_TONES.primary}
          label={t('Roadmap Completion')}
          value={<>{roadmapPct}%</>}
          hint={`${completedTasks} ${t('of')} ${totalTasks} ${t('tasks done')} · ${remainingTasks} ${t('tasks remaining')}`}
          destination={{ route: 'roadmap', action: 'open the roadmap stages' }}
        />

        <StatCard
          hook="projects"
          icon={FolderGit2}
          tone={STAT_TONES.info}
          label={t('Completed Projects')}
          value={
            <>
              {completedProjects.length}
              <span className="text-sm font-normal text-[var(--text-muted)]"> / {portfolioGoal}</span>
            </>
          }
          hint={`${t('Target for role')} · ${safeEvidenceItems.length} ${t('verified artifacts')}`}
          destination={{ route: 'projects', action: 'open your projects' }}
        />

        <StatCard
          hook="readiness"
          icon={Target}
          tone={STAT_TONES.primary}
          label={t('Career readiness')}
          value={<>{careerReadiness}%</>}
          hint={t('from your skills and CV')}
          destination={{ route: 'analysis', action: 'see how it is calculated' }}
        />

        <StatCard
          hook="interviews"
          icon={ShieldCheck}
          tone={STAT_TONES.warning}
          label={t('Interview Readiness')}
          value={interviewMetrics.readinessPct === null ? '—' : `${interviewMetrics.readinessPct}%`}
          hint={
            interviewMetrics.isUnmeasured
              ? t('Not measured yet — practise a mock interview')
              : t('from mock interview rubrics')
          }
          destination={{ route: 'interviews', action: 'open the interview history' }}
        />

        <StatCard
          hook="performance"
          icon={Star}
          tone={STAT_TONES.success}
          label={t('Average Interview Performance')}
          value={
            <>
              {interviewMetrics.averagePerformance === null
                ? '—'
                : interviewMetrics.averagePerformance.toFixed(1)}
              {interviewMetrics.averagePerformance !== null ? (
                <span className="text-sm font-normal text-[var(--text-muted)]"> / 10</span>
              ) : null}
            </>
          }
          hint={`${interviewMetrics.scoredInterviews} ${t('scored sessions')}`}
          destination={{ route: 'interviews', action: 'open the interview history' }}
        />
      </Stagger>

      {/* LEARNING: what is recommended, what is saved, what is moving. */}
      <section
        aria-labelledby="progress-learning"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[var(--color-primary-text)]" />
              <h2 id="progress-learning" className="text-base font-bold text-[var(--text-primary)]">
                {t('Learning at a glance')}
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Each count opens the Learning Hub already filtered to it.')}
            </p>
          </div>

          {learningCounts.averageProgress !== null ? (
            <div className="min-w-[180px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {t('Average progress of started courses')}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {learningCounts.averageProgress}%
                </span>
              </div>
              <AnimatedProgress
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
                value={learningCounts.averageProgress}
                label={t('Average progress of started courses')}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              key: 'recommended',
              label: t('Recommended'),
              value: learningCounts.recommended,
              icon: BookOpen,
              tab: 'recommended',
            },
            {
              key: 'saved',
              label: t('Saved'),
              value: learningCounts.saved,
              icon: Bookmark,
              tab: 'saved',
            },
            {
              key: 'in_progress',
              label: t('In progress'),
              value: learningCounts.inProgress,
              icon: PlayCircle,
              tab: 'in_progress',
            },
            {
              key: 'completed',
              label: t('Completed'),
              value: learningCounts.completed,
              icon: GraduationCap,
              tab: 'completed',
            },
          ].map((entry) => (
            <button
              key={entry.key}
              type="button"
              data-progress-learning={entry.key}
              onClick={() => {
                window.location.hash = buildRouteHash('learning', { tab: entry.tab });
              }}
              className="group flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2.5 text-start transition-colors duration-200 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40 motion-reduce:transition-none"
            >
              <span className="flex items-center gap-2">
                <entry.icon aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />
                <span className="text-xs font-medium text-[var(--text-secondary)]">{entry.label}</span>
              </span>
              <span className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
                {entry.value}
              </span>
            </button>
          ))}
        </div>

        {learningCounts.inProgress > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {t('Resume where you left off')}
              </div>
              <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {learningCounts.resumeTitle ?? t('Your course in progress')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.hash = buildRouteHash('learning', { tab: 'in_progress' });
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
            >
              {t('Continue')}
              <ArrowRight aria-hidden="true" className="h-3 w-3 rtl:rotate-180" />
            </button>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
            {t('No course in progress right now.')}
          </p>
        )}
      </section>

      {/* PIPELINE & PROOF: saved jobs, applications, interviews, offers. */}
      <Stagger gap={0.05} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          hook="saved-jobs"
          icon={Bookmark}
          tone={STAT_TONES.info}
          label={t('Saved jobs')}
          value={safeSavedJobIds.length}
          hint={t('Opportunities you kept to review')}
          destination={{ route: 'jobs', action: 'open the live jobs board' }}
        />
        <StatCard
          hook="applications"
          icon={Briefcase}
          tone={STAT_TONES.warning}
          label={t('Active Applications')}
          value={activeApplications.length}
          hint={`${safeApplications.length} ${t('tracked in total')}`}
          destination={{ route: 'applications', params: { view: 'list' }, action: 'open the application list' }}
        />
        <StatCard
          hook="interviews-count"
          icon={ShieldCheck}
          tone={STAT_TONES.primary}
          label={t('Interviews')}
          value={interviewMetrics.mockInterviewsCompleted}
          hint={t('interviews completed')}
          destination={{ route: 'interviews', action: 'open the interview history' }}
        />
        <StatCard
          hook="offers"
          icon={CheckCircle2}
          tone={STAT_TONES.success}
          label={t('Offers')}
          value={offers.length}
          hint={t('applications that reached an offer')}
          destination={{ route: 'applications', params: { view: 'list' }, action: 'open the application list' }}
        />
      </Stagger>

      {/* CREDENTIALS: certifications and evidence, both from stored records. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          hook="certifications"
          icon={GraduationCap}
          tone={STAT_TONES.success}
          label={t('Certifications')}
          value={safeCertifications.length}
          hint={t('recorded on your profile')}
          destination={{ route: 'evidence', params: { type: 'certificate' }, action: 'open your certificates' }}
        />
        <StatCard
          hook="evidence"
          icon={ShieldCheck}
          tone={STAT_TONES.primary}
          label={t('Evidence records')}
          value={safeEvidenceItems.length}
          hint={t('artifacts that prove a skill')}
          destination={{ route: 'evidence', action: 'open your evidence' }}
        />
      </div>

      {/* WEEKLY ACTIVITY: the pace, from the recorded activity log. */}
      <section
        aria-labelledby="progress-activity"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--color-primary-text)]" />
              <h2 id="progress-activity" className="text-base font-bold text-[var(--text-primary)]">
                {t('Weekly activity')}
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Recorded actions per week, last 8 weeks.')}
            </p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {activityTotal}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">{t('actions in 8 weeks')}</span>
          </div>
        </div>

        {safeActivities.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
            {t('Nothing recorded yet. Your activity appears here as soon as you act.')}
          </p>
        ) : (
          <div className="mt-4" data-progress-activity-chart>
            <BarChart
              data={weeklyActivity}
              orientation="vertical"
              height={150}
              max={Math.max(1, activityPeak)}
              ariaLabel={t('Recorded actions per week, last 8 weeks.')}
              locale={undefined}
              testId="progress-activity"
            />
          </div>
        )}
      </section>

      {/* MOMENTUM: the pace, not just the totals. */}
      <section
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
        data-tour="progress-streak"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[var(--color-warning)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {t('Your Momentum')}
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Measured from your own recorded activity, not from the plan.')}
            </p>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {streak.current}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {streak.current === 1 ? t('active day') : t('active days in a row')}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Longest streak')}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {streak.longest} {t('days')}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Days with activity')}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {streak.activeDayCount}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('Last active day')}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {streak.lastActiveDay ?? t('Not yet')}
            </div>
          </div>
        </div>
      </section>

      {/* THE PIPELINE AND THE INTERVIEW RECORD: the two parts of the
          candidate's own history that were counted on other pages and never
          drawn here. Both are read from their own records. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('Where your applications stand')}
          description={t(
            'Every application you have tracked, at the stage it is really at.'
          )}
          badge={formatCount(safeApplications.length)}
          empty={applicationStages.length === 0}
          emptyMessage={t(
            'Track your first application and this chart will show the stage each one reaches.'
          )}
          testId="progress-applications-chart"
        >
          <DonutChart
            data={applicationStages.map((entry, index) => ({
              ...entry,
              color: chartColor(index),
            }))}
            centerValue={formatCount(safeApplications.length)}
            centerLabel={t('applications')}
            ariaLabel={t('Where your applications stand')}
          />
        </ChartCard>

        <ChartCard
          title={t('Your interview scores over time')}
          description={t(
            'The score of each mock interview that was scored, oldest first.'
          )}
          empty={interviewTrend.length < 2}
          emptyMessage={t(
            'Two scored mock interviews are needed before a trend can be drawn. A session that was not scored is not a zero, so it is not on this line.'
          )}
          footnote={t('Each point is one mock interview, scored out of ten.')}
          testId="progress-interview-chart"
        >
          <LineChart
            points={interviewTrend}
            ariaLabel={t('Your interview scores over time')}
            formatValue={(value) => `${value} / 10`}
            height={180}
            color="var(--color-ai)"
          />
        </ChartCard>
      </div>

      {/* Progress Breakdown Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Closed Gaps Log */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success-strong)]" />
              <span>{targetRole?.title ? `${t('Mastered Skills for')} ${targetRole.title}` : t('Mastered Skills')}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                window.location.hash = buildRouteHash('skills');
              }}
              className="shrink-0 text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
            >
              {t('View all skills')}
            </button>
          </div>

          {masteredSkillList.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              {t('No skill has reached the target level yet. Rate your skills to see what is already there.')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {masteredSkillList.map((sk) => (
                <div key={sk.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">{sk.name}</span>
                    <span className="text-[var(--text-muted)]"> · {sk.category}</span>
                  </div>
                  <span className="font-mono text-[var(--color-success-strong)] font-medium">
                    {t('Level')} {sk.currentLevel}/5 ({t('Target Satisfied')})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shipped Evidence & Deliverables */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--color-primary-text)]" />
              <span>{t('Verifiable Evidence Artifacts')}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                window.location.hash = buildRouteHash('evidence');
              }}
              className="shrink-0 text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
            >
              {t('View all evidence')}
            </button>
          </div>

          {safeEvidenceItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              {t('No evidence attached yet. Add a project, certificate or document to prove a skill.')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {safeEvidenceItems.map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">{ev.title}</span>
                    <span className="text-[var(--text-muted)]"> · {ev.type}</span>
                  </div>
                  <span className="text-[var(--color-primary-text)] font-medium">
                    {(Array.isArray(ev?.skillNames) ? ev.skillNames.length : 0)} {t('Skills Linked')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MILESTONE TIMELINE: the milestones the user actually recorded. */}
      <section
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
        data-tour="progress-milestones"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--color-accent-strong)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {t('Milestone Timeline')}
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Every milestone you recorded, newest first.')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <CalendarDays className="h-3.5 w-3.5" />
            {milestoneTotal} {t('milestones')}
          </div>
        </div>

        {timeline.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
            {t('No milestones recorded yet. Record the moments that matter — an offer, a certification, a finished project — and they appear here.')}
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {timeline.map((group) => (
              <div key={group.year}>
                <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {group.year}
                </div>
                <ol className="mt-2 space-y-2.5 border-s-2 border-[var(--border-subtle)] ps-4">
                  {group.milestones.map((milestone) => (
                    <li key={milestone.id} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -start-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-main)] bg-[var(--color-primary)]"
                      />
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {milestone.title}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            {milestone.category}
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">
                          {milestone.dateAchieved}
                        </div>
                        {milestone.note && (
                          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                            {milestone.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </Reveal>
  );
};
