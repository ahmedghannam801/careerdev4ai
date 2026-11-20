import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll } from 'motion/react';
import {
  BarChart3,
  Briefcase,
  FileText,
  FolderGit2,
  Route,
  Sparkles,
  Target,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { ROLE_DEFINITION_LIST } from '../../../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../../../shared/roadmapGenerator.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../../../shared/skillGap.ts';
import { JOB_SOURCE_LABELS } from '../../../shared/jobs.ts';
import { scrollReveal } from '../../lib/motion';

/**
 * JourneyScrollStory — the career journey, told as the visitor scrolls.
 *
 * The landing page used to explain how the platform works as a grid of six
 * cards. A grid asks the reader to take it all in at once, and a grid of six
 * equal cards gives every stage the same weight, so the journey reads as a
 * list rather than as a path.
 *
 * This tells it as a path instead. Seven stages, one after another, each
 * revealed when it arrives. The rail on the left fills as the reader moves
 * through them, so the shape of the journey is visible before it has been
 * read, and the stage that is currently in view is the one the rail is on.
 *
 * Every stage describes a capability the platform really has, and the small
 * panel under each one shows the real interface: the roles from the actual
 * catalogue, the gaps from the actual gap engine, the phases and tasks from
 * the actual planning engine, and the boards the actual jobs feed reads.
 */

interface Stage {
  /** The anchor of the stage. */
  id: string;
  /** The icon of the stage. */
  icon: React.ComponentType<{ className?: string }>;
  /** The name of the stage. */
  title: string;
  /** What happens at this stage. */
  body: string;
  /** Where in the product this stage lives. */
  area: string;
}

export const JourneyScrollStory: React.FC = () => {
  const { t } = useCareer();
  const reduced = useReducedMotion() ?? false;

  const [activeIndex, setActiveIndex] = useState(0);

  // The container the progress is measured against.
  const trackRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start 0.75', 'end 0.55'],
  });

  const role = useMemo(
    () =>
      ROLE_DEFINITION_LIST.find((candidate) => candidate.id === 'data-analyst') ??
      ROLE_DEFINITION_LIST[0],
    []
  );

  // The real engines, run against the real catalogue.
  const plan = useMemo(() => generateRoadmapPlan({ role, userSkills: [] }), [role]);
  const gaps = useMemo(() => computeSkillGaps(toRoleSkillRequirements(role), []), [role]);

  const stages: Stage[] = [
    {
      id: 'journey-stage-1',
      icon: Target,
      title: t('Discover Your Direction'),
      body: t('Set the role you are working towards and get a concrete picture of what that role demands.'),
      area: t('Target roles'),
    },
    {
      id: 'journey-stage-2',
      icon: FileText,
      title: t('Build Your Profile'),
      body: t('Parse your CV, work on it, and produce role-targeted versions without ever overwriting the original.'),
      area: t('navCV'),
    },
    {
      id: 'journey-stage-3',
      icon: BarChart3,
      title: t('Identify Your Skills'),
      body: t('A readiness score computed from your own records, with the gaps it is based on shown next to it.'),
      area: t('navSkills'),
    },
    {
      id: 'journey-stage-4',
      icon: Route,
      title: t('Follow Your Roadmap'),
      body: t('A phased plan of real tasks, with prerequisites, hour estimates and the reason each task is in your plan.'),
      area: t('navRoadmap'),
    },
    {
      id: 'journey-stage-5',
      icon: FolderGit2,
      title: t('Build Real Experience'),
      body: t('Turn a skill into finished work, submit the deliverable and get a structured evaluation you can point at.'),
      area: t('navProjects'),
    },
    {
      id: 'journey-stage-6',
      icon: Briefcase,
      title: t('Discover Opportunities'),
      body: t('Paste a job description and see the match score, the evidence behind it, and what is still missing.'),
      area: t('navJobs'),
    },
    {
      id: 'journey-stage-7',
      icon: Sparkles,
      title: t('Become Career Ready'),
      body: t('Track applications, prepare for interviews, and keep your momentum visible.'),
      area: t('navProgress'),
    },
  ];

  const reportActive = useCallback((index: number) => {
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
      {/* ------------------------------------------------------ the rail */}
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          {/*
            On a wide screen the rail is a vertical list with the titles, and
            it stays beside the stages as they are read. On a narrow one it
            collapses to a row of numbered pills: a seven-item list would
            take a whole screen before the first stage appeared, and the
            stage titles are on the cards themselves anyway.
          */}
          <ol className="relative flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {/* The rail the stages run along. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-2 start-[7px] hidden w-px bg-[var(--color-border)] lg:block"
            />
            {/* The part of the rail that has been travelled. */}
            <motion.div
              aria-hidden="true"
              style={{ scaleY: scrollYProgress, transformOrigin: 'top' }}
              className="absolute inset-y-2 start-[7px] hidden w-px bg-[var(--color-primary)] lg:block"
            />

            {stages.map((stage, index) => {
              const active = index === activeIndex;
              const Icon = stage.icon;
              return (
                <li key={stage.id} className="relative shrink-0 lg:shrink">
                  <a
                    href={`#${stage.id}`}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`${index + 1}. ${stage.title}`}
                    className="group flex items-center gap-3 py-1 lg:items-start lg:py-2"
                  >
                    {/* The narrow-screen pill. */}
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-300 lg:hidden ${
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                          : 'border-[var(--color-border-strong)] bg-[var(--surface-main)] text-[var(--text-muted)]'
                      }`}
                    >
                      {index + 1}
                    </span>

                    {/* The wide-screen dot on the rail. */}
                    <span
                      className={`relative z-10 mt-0.5 hidden h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 lg:flex ${
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                          : 'border-[var(--color-border-strong)] bg-[var(--surface-main)] group-hover:border-[var(--color-primary)]'
                      }`}
                    >
                      {active && <span className="h-1 w-1 rounded-full bg-[var(--color-on-primary)]" />}
                    </span>

                    {/* The wide-screen title. */}
                    <span
                      className={`hidden text-sm font-semibold transition-colors duration-300 lg:inline ${
                        active
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="me-1.5 font-mono text-[11px] text-[var(--color-primary-text)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {stage.title}
                    </span>

                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 hidden h-3.5 w-3.5 shrink-0 transition-opacity duration-300 lg:block ${
                        active ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* ---------------------------------------------------- the stages */}
      <div ref={trackRef} className="lg:col-span-8">
        <ol className="space-y-6">
          {stages.map((stage, index) => (
            <StageCard
              key={stage.id}
              index={index}
              stage={stage}
              reduced={reduced}
              onActive={reportActive}
              role={role}
              plan={plan}
              gaps={gaps}
            />
          ))}
        </ol>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* One stage                                                                  */
/* -------------------------------------------------------------------------- */

interface StageCardProps {
  index: number;
  stage: Stage;
  reduced: boolean;
  onActive: (index: number) => void;
  role: (typeof ROLE_DEFINITION_LIST)[number];
  plan: ReturnType<typeof generateRoadmapPlan>;
  gaps: ReturnType<typeof computeSkillGaps>;
}

/**
 * One stage of the journey.
 *
 * The card reports itself as the active stage while it is the one in view,
 * which is what moves the rail. It uses its own observer rather than a
 * shared scroll handler, so the parent only re-renders when the active
 * stage actually changes.
 */
const StageCard: React.FC<StageCardProps> = ({
  index,
  stage,
  reduced,
  onActive,
  role,
  plan,
  gaps,
}) => {
  const ref = useRef<HTMLLIElement>(null);
  const Icon = stage.icon;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onActive(index);
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [index, onActive]);

  return (
    <motion.li
      ref={ref}
      id={stage.id}
      variants={scrollReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px 0px -80px 0px' }}
      className="scroll-mt-28 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--surface-main)] shadow-[var(--shadow-card)]"
    >
      <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] sm:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="cp-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>

          <h3 className="mt-4 text-lg font-bold tracking-tight text-[var(--text-primary)]">
            {stage.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{stage.body}</p>

          <span className="mt-4 inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            {stage.area}
          </span>
        </div>

        <StageDetail index={index} role={role} plan={plan} gaps={gaps} />
      </div>
    </motion.li>
  );
};

/* -------------------------------------------------------------------------- */
/* The real interface under each stage                                        */
/* -------------------------------------------------------------------------- */

interface StageDetailProps {
  index: number;
  role: (typeof ROLE_DEFINITION_LIST)[number];
  plan: ReturnType<typeof generateRoadmapPlan>;
  gaps: ReturnType<typeof computeSkillGaps>;
}

/**
 * The small panel that shows what the stage actually looks like.
 *
 * Every value on it comes from the platform's own catalogue or its own
 * engines, so the panel cannot describe something the product does not do.
 */
const StageDetail: React.FC<StageDetailProps> = ({ index, role, plan, gaps }) => {
  const { t } = useCareer();

  const panel =
    'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 p-3.5';

  if (index === 0) {
    // The catalogue of roles, as the role picker offers them.
    const roles = ROLE_DEFINITION_LIST.slice(0, 4);
    return (
      <div className={panel}>
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('Target roles')}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {roles.map((candidate) => (
            <span
              key={candidate.id}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                candidate.id === role.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--surface-main)] text-[var(--text-secondary)]'
              }`}
            >
              {candidate.title}
            </span>
          ))}
        </div>
        <div className="mt-3 border-t border-[var(--color-border)]/70 pt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {t('Structured role profiles')}
        </div>
      </div>
    );
  }

  if (index === 1) {
    // The studio's own secondary sections.
    return (
      <div className={panel}>
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('navCV')}
        </div>
        <div className="mt-2 space-y-1">
          {[t('Document Editor & Preview'), t('Templates'), t('My Data'), t('Version History')].map(
            (label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg bg-[var(--surface-main)] px-2 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]"
              >
                <FileText className="h-2.5 w-2.5 shrink-0 text-[var(--color-primary-text)]" />
                <span className="truncate">{label}</span>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  if (index === 2) {
    // The real gaps, in the real order.
    const shown = gaps.slice(0, 4);
    return (
      <div className={panel}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t('navSkills')}
          </span>
          <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
            {plan.summary.openGaps} {t('Open gaps')}
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {shown.map((gap) => {
            const ratio = Math.min(
              100,
              Math.round((gap.currentLevel / Math.max(gap.requiredLevel, 1)) * 100)
            );
            return (
              <li key={gap.name} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[10px] text-[var(--text-secondary)]">
                  {gap.name}
                </span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-main)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${ratio}%` }}
                  />
                </span>
                <span className="shrink-0 font-mono text-[9px] text-[var(--text-muted)]">
                  {gap.currentLevel}/{gap.requiredLevel}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (index === 3) {
    // The real phases of the real plan.
    return (
      <div className={panel}>
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('navRoadmap')}
        </div>
        <div className="mt-2 space-y-1.5">
          {plan.phases.slice(0, 3).map((phase, phaseIndex) => (
            <div key={phase.title} className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[8px] font-bold text-[var(--color-on-primary)]">
                {phaseIndex + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold text-[var(--text-primary)]">
                  {phase.title}
                </div>
                <div className="truncate text-[9px] text-[var(--text-muted)]">{phase.goal}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 4) {
    // The real tasks, with the engine's own hour estimates.
    const tasks = plan.phases
      .flatMap((phase) => phase.milestones.flatMap((milestone) => milestone.tasks))
      .slice(0, 4);
    return (
      <div className={panel}>
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('navProjects')}
        </div>
        <ul className="mt-2 space-y-1.5">
          {tasks.map((task) => (
            <li key={task.title} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-secondary)]">
                {task.title}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-[var(--text-muted)]">
                {task.estimatedHours}h
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (index === 5) {
    // The boards the platform really reads.
    const sources = [
      JOB_SOURCE_LABELS.google_jobs,
      JOB_SOURCE_LABELS.indeed,
      JOB_SOURCE_LABELS.ziprecruiter,
      JOB_SOURCE_LABELS.handshake,
      JOB_SOURCE_LABELS.company_careers,
    ];
    return (
      <div className={panel}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t('navJobs')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ai-surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-ai-text)]">
            {t('Internship')}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <span
              key={source}
              className="rounded-md bg-[var(--surface-main)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]"
            >
              {source}
            </span>
          ))}
        </div>
        <div className="mt-3 border-t border-[var(--color-border)]/70 pt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {t('navJobDiscovery')}
        </div>
      </div>
    );
  }

  // The last stage: the measure of readiness and what it is made of.
  return (
    <div className={panel}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('Role readiness')}
        </span>
        <span className="font-mono text-sm font-bold leading-none text-[var(--text-primary)]">
          {plan.summary.readinessPct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-main)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)]"
          style={{ width: `${plan.summary.readinessPct}%` }}
        />
      </div>
      {/*
        The readiness score of someone who has recorded nothing is zero, and
        a zero with no explanation reads as a verdict rather than a starting
        line. The preview is honest about what it is: this is where every
        journey begins, and the two figures below are what moves it.
      */}
      <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
        {t('The preview starts with no recorded skills, so this is where every journey begins.')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label={t('roadmapCompletion')} value={`${plan.summary.totalTasks}`} />
        <MiniStat label={t('Open gaps')} value={`${plan.summary.openGaps}`} />
      </div>
    </div>
  );
};

/** A small figure in the last stage's panel. */
const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-[var(--surface-main)] px-2 py-1.5">
    <div className="font-mono text-sm font-bold leading-none text-[var(--text-primary)]">{value}</div>
    <div className="mt-1 text-[8px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </div>
  </div>
);

export default JourneyScrollStory;
