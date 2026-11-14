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
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import {
  computeActivityStreak,
  groupMilestonesByYear,
  type TimelineMilestone,
} from '../../../shared/progressMomentum';
import {
  computeInterviewReadiness,
  portfolioTarget,
} from '../../../shared/interviewReadiness';

export const ProgressView: React.FC = () => {
  const {
    targetRole,
    skills,
    roadmapPhases,
    projects,
    evidenceItems,
    applications,
    interviewSessions,
    milestones,
    activities,
    t,
  } = useCareer();

  const totalTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks)).length;
  const completedTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks.filter(t => t.status === 'completed'))).length;
  const roadmapPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const masteredSkills = skills.filter(s => s.gap === 0);
  const inProgressSkills = skills.filter(s => s.gap > 0);
  const completedProjects = projects.filter(p => p.status === 'completed' || p.status === 'published');
  const activeApplications = applications.filter(a => !['rejected', 'withdrawn'].includes(a.stage));

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
   * The four interview measures, kept independent of one another.
   *
   * Readiness is measured from the mock interviews alone. It is not reduced
   * by having no job applications: a candidate who has not applied yet has
   * not failed to interview.
   */
  const interviewMetrics = useMemo(
    () =>
      computeInterviewReadiness(
        interviewSessions.map((session) => ({
          score: session.aiFeedback?.score ?? null,
          roleTitle: session.roleTitle ?? null,
        }))
      ),
    [interviewSessions]
  );

  // The streak comes from the user's own recorded activity, so it reflects
  // what they actually did rather than what the plan hoped they would do.
  const streak = useMemo(
    () => computeActivityStreak(activities.map((activity) => ({ timestamp: activity.timestamp }))),
    [activities]
  );

  // The milestones are the ones the user recorded. They are grouped by year
  // for the timeline; nothing is inferred from a percentage.
  const timeline = useMemo(
    () =>
      groupMilestonesByYear(
        milestones.map(
          (milestone): TimelineMilestone => ({
            id: milestone.id,
            title: milestone.title,
            category: milestone.category,
            dateAchieved: milestone.dateAchieved,
            note: milestone.notes,
            verified: milestone.verified,
          })
        )
      ),
    [milestones]
  );

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('MEASURABLE OUTCOMES')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Career Progression Dashboard')}
          </h1>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          {t('Target Role:')} <strong className="text-[var(--text-primary)]">{targetRole?.title ?? ''}</strong>
        </div>
      </div>

      {/* 4 Primary Progress Pillars */}
      <Stagger data-tour="progress-metrics" inView gap={0.06} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[var(--color-success-strong)]" />
            <span>{t('Mastered Skills')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {masteredSkills.length} <span className="text-sm font-normal text-[var(--text-muted)]">/ {skills.length}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {inProgressSkills.length} {t('actively advancing')}
          </div>
        </StaggerItem>

        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--color-primary-text)]" />
            <span>{t('Roadmap Completion')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {roadmapPct}%
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {completedTasks} {t('of')} {totalTasks} {t('tasks done')}
          </div>
        </StaggerItem>

        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <FolderGit2 className="w-4 h-4 text-[var(--color-info)]" />
            <span>{t('Completed Projects')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {completedProjects.length}
            <span className="text-sm font-normal text-[var(--text-muted)]"> / {portfolioGoal}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {t('Target for role')} · {evidenceItems.length} {t('verified artifacts')}
          </div>
        </StaggerItem>

        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-[var(--color-warning)]" />
            <span>{t('Active Applications')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {activeApplications.length}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {interviewMetrics.mockInterviewsCompleted} {t('mock interviews completed')}
          </div>
        </StaggerItem>

        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--color-primary-text)]" />
            <span>{t('Interview Readiness')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {interviewMetrics.readinessPct === null ? '—' : `${interviewMetrics.readinessPct}%`}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {interviewMetrics.isUnmeasured
              ? t('Not measured yet — practise a mock interview')
              : t('from mock interview rubrics')}
          </div>
        </StaggerItem>

        <StaggerItem className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Star className="w-4 h-4 text-[var(--color-success-strong)]" />
            <span>{t('Average Interview Performance')}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {interviewMetrics.averagePerformance === null
              ? '—'
              : `${interviewMetrics.averagePerformance.toFixed(1)}`}
            {interviewMetrics.averagePerformance !== null ? (
              <span className="text-sm font-normal text-[var(--text-muted)]"> / 10</span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {interviewMetrics.scoredInterviews} {t('scored sessions')}
          </div>
        </StaggerItem>
      </Stagger>

      {/* MOMENTUM: the pace, not just the totals.
          The streak is measured from the activity log, so it can honestly be
          zero — which is the point of showing it. */}
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

      {/* Progress Breakdown Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Closed Gaps Log */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--color-success-strong)]" />
            <span>{t('Mastered Skills for')} {targetRole?.title ?? ''}</span>
          </h3>

          {masteredSkills.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              {t('No skill has reached the target level yet. Rate your skills to see what is already there.')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {masteredSkills.map((sk) => (
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
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-primary-text)]" />
            <span>{t('Verifiable Evidence Artifacts')}</span>
          </h3>

          {evidenceItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              {t('No evidence attached yet. Add a project, certificate or document to prove a skill.')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {evidenceItems.map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">{ev.title}</span>
                    <span className="text-[var(--text-muted)]"> · {ev.type}</span>
                  </div>
                  <span className="text-[var(--color-primary-text)] font-medium">
                    {ev.skillNames.length} {t('Skills Linked')}
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
            {timeline.reduce((sum, group) => sum + group.milestones.length, 0)} {t('milestones')}
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
