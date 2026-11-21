import React from 'react';
import { ArrowRight, Clock, Flag, Gauge, Layers, Target, TrendingUp } from 'lucide-react';

/**
 * The heading of the career roadmap.
 *
 * WHY IT EXISTS
 * The guided roadmap used to open with four separate blocks that each repeated
 * part of the same story: a page header, a cover photograph, three summary
 * cards and a progress bar. A candidate had to read all of them before they
 * reached the first step, and the same number (the completion percentage)
 * appeared in three places.
 *
 * This panel is the one place the plan introduces itself: the role it is for,
 * the stage the candidate is standing in, how far through the plan they are,
 * what is left, and the single next step. Everything else on the page is the
 * plan itself. It is built from the candidate's own roadmap — no figure here
 * is a placeholder.
 */
export interface RoadmapCommandGap {
  name: string;
  currentLevel: number;
  targetLevel: number;
  blocker: boolean;
}

interface RoadmapCommandCenterProps {
  /** The target role the plan was generated for. */
  roleTitle: string;
  /** The domain the role belongs to, when it is known. */
  roleDomain?: string | null;
  /** The stage the candidate is working in, and where it sits in the plan. */
  stageLabel: string | null;
  stageNumber: number;
  stageCount: number;
  /** Overall completion: completed actions over all actions. */
  completedTasks: number;
  totalTasks: number;
  progressPct: number;
  totalHours: number;
  /** The open skill gaps, biggest first. */
  gaps: RoadmapCommandGap[];
  /** The action the candidate should take next, and the stage it belongs to. */
  nextTaskTitle: string | null;
  nextStageLabel: string | null;
  /** Moves the page to the stage that holds the next action. */
  onOpenStage?: () => void;
  /** Opens the skills surface that closes the biggest gap. */
  onCloseGap?: () => void;
  /** True when the whole plan and the skill targets are both met. */
  jobReady: boolean;
  /** Whether the candidate has enrolled in the plan. */
  isEnrolled: boolean;
  onEnroll?: () => void;
}

/**
 * A restrained progress ring.
 *
 * It is drawn in SVG rather than a CSS conic gradient so the arc can carry an
 * accessible label and the same geometry works in RTL. The track is always
 * visible, so "0%" reads as an empty plan rather than a missing number.
 */
const ProgressRing: React.FC<{ value: number; size?: number }> = ({ value, size = 116 }) => {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% of the roadmap complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
          {clamped}%
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          complete
        </span>
      </div>
    </div>
  );
};

/** One figure in the plan's fact row. */
const Fact: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}> = ({ icon, label, value, detail }) => (
  <div className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)]/80 px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
      {icon}
      {label}
    </div>
    <div className="mt-1 truncate font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
      {value}
    </div>
    {detail ? <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{detail}</div> : null}
  </div>
);

export const RoadmapCommandCenter: React.FC<RoadmapCommandCenterProps> = ({
  roleTitle,
  roleDomain,
  stageLabel,
  stageNumber,
  stageCount,
  completedTasks,
  totalTasks,
  progressPct,
  totalHours,
  gaps,
  nextTaskTitle,
  nextStageLabel,
  onOpenStage,
  onCloseGap,
  jobReady,
  isEnrolled,
  onEnroll,
}) => {
  const biggestGap = gaps[0] ?? null;

  return (
    <section
      data-guide="roadmap-command-center"
      className="relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-xs"
    >
      {/* One restrained wash, not decoration: it marks the plan's heading and
          separates it from the stages below without another card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,var(--color-accent-surface)_0%,transparent_58%)]"
      />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/25 bg-[var(--color-primary-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
              <Target className="h-3 w-3" />
              {roleTitle}
            </span>
            {roleDomain ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {roleDomain}
              </span>
            ) : null}
            {jobReady ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-success-strong)]">
                <Flag className="h-3 w-3" />
                Job ready
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Personal Career Roadmap
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Where you are, what comes next, and why each step is here.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact
              icon={<Layers className="h-3 w-3" />}
              label="Stage"
              value={stageLabel ? `${stageNumber} / ${stageCount}` : `${stageCount}`}
              detail={stageLabel ?? 'All stages'}
            />
            <Fact
              icon={<Gauge className="h-3 w-3" />}
              label="Actions"
              value={`${completedTasks} / ${totalTasks}`}
              detail={`${totalTasks - completedTasks} remaining`}
            />
            <Fact
              icon={<Clock className="h-3 w-3" />}
              label="Estimated effort"
              value={`${totalHours}h`}
              detail="Across the whole plan"
            />
            <Fact
              icon={<TrendingUp className="h-3 w-3" />}
              label="Open gaps"
              value={`${gaps.length}`}
              detail={biggestGap ? `${biggestGap.name} is biggest` : 'None — targets met'}
            />
          </div>

          {gaps.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {gaps.slice(0, 5).map((gap) => (
                <span
                  key={gap.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                    gap.blocker
                      ? 'border-[var(--color-danger)]/35 bg-[var(--color-danger)]/8 text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/70 text-[var(--text-primary)]'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                  {gap.name}
                  <span className="font-mono text-[var(--text-muted)]">
                    {gap.currentLevel}/{gap.targetLevel}
                  </span>
                </span>
              ))}
              {onCloseGap ? (
                <button
                  type="button"
                  onClick={onCloseGap}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-[var(--color-primary-text)] underline-offset-2 hover:underline"
                >
                  Close gaps
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-row items-center gap-5 lg:flex-col lg:items-end">
          <ProgressRing value={progressPct} />

          <div className="min-w-0 flex-1 rounded-2xl border border-[var(--accent-primary)]/35 bg-[var(--color-primary-surface)]/70 p-3.5 lg:w-[17rem] lg:flex-none">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
              Your next step
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">
              {nextTaskTitle ?? 'Every action in the plan is complete.'}
            </p>
            {nextStageLabel ? (
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{nextStageLabel}</p>
            ) : null}
            {onOpenStage ? (
              <button
                type="button"
                onClick={onOpenStage}
                className="mt-2.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                Open this stage
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            ) : null}
          </div>

          {!isEnrolled && onEnroll ? (
            <button
              type="button"
              onClick={onEnroll}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-text)] hover:bg-[var(--color-primary-surface)]"
            >
              Enroll in this plan
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default RoadmapCommandCenter;
