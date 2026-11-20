import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  BarChart3,
  Briefcase,
  FileText,
  GraduationCap,
  Map,
  Sparkles,
  Target,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { ROLE_DEFINITION_LIST } from '../../../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../../../shared/roadmapGenerator.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../../../shared/skillGap.ts';
import { getCareerDomainLabel } from '../../../shared/careerDomains.ts';
import { JOB_SOURCE_LABELS } from '../../../shared/jobs.ts';
import { floatingStyle, smoothScale, staggerReveal, useFloatingInView } from '../../lib/motion';

/**
 * HeroEcosystem — the hero's Career Ecosystem.
 *
 * The landing page used to open on a decorative 3D architectural render with
 * two cards floating over it. That image says nothing about what CareerRa
 * does, and a visitor cannot tell from it whether the product is real.
 *
 * This replaces it with the product itself. The centre panel is a workspace
 * running the platform's OWN planning engine — the same `generateRoadmapPlan`
 * the signed-in product calls — against the platform's own role catalogue, for
 * a visitor with no recorded skills, which is exactly the state a stranger is
 * in. So the phases, the hour estimate, the readiness figure and the open
 * gaps on screen are the numbers the platform would produce for that role,
 * not a drawing of them.
 *
 * The four surfaces around it are the four places a career actually moves:
 * the CV you rewrite, the skills you are missing, the learning that closes
 * them, and the opportunities that follow. They are laid out as one
 * composition in a single 3D plane rather than as four cards on a shelf, and
 * they are tied to the centre by hairlines, so the page reads as a connected
 * system instead of a pile of screenshots.
 *
 * Nothing here animates for its own sake. The entrance staggers once, the
 * surfaces drift very slowly while they are on screen, and the drift stops
 * the moment they scroll away.
 */

/** The role the ecosystem is built around. A real catalogue entry. */
const HERO_ROLE_ID = 'data-analyst';

/**
 * The spring the tilt settles on.
 *
 * It is a module constant so that the spring is configured once rather than
 * on every render, which would restart the settling of the tilt.
 */
const TILT_SPRING = { stiffness: 120, damping: 22, mass: 0.6 };

export const HeroEcosystem: React.FC = () => {
  const { t } = useCareer();
  const reduced = useReducedMotion() ?? false;

  // The stage is observed so that the drift of the satellites can be paused
  // while the hero is off screen.
  const stageRef = useRef<HTMLDivElement>(null);
  const stageInView = useFloatingInView(stageRef);

  // The pointer's position on the stage, as a pair of motion values so that
  // the tilt is applied on the compositor and never triggers a re-render.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const tiltX = useSpring(useTransform(pointerY, [-0.5, 0.5], [2.4, -2.4]), TILT_SPRING);
  const tiltY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-3, 3]), TILT_SPRING);

  /**
   * A pointer that is not a mouse — a finger on a phone — has nowhere to
   * "hover from", so the tilt is not wired up for it at all. The same is
   * true when the visitor has asked for reduced motion.
   */
  const [pointerReady, setPointerReady] = useState(false);

  useEffect(() => {
    if (reduced) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(pointer: fine)');
    setPointerReady(query.matches);
    const onChange = (event: MediaQueryListEvent) => setPointerReady(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [reduced]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const role = useMemo(
    () =>
      ROLE_DEFINITION_LIST.find((candidate) => candidate.id === HERO_ROLE_ID) ??
      ROLE_DEFINITION_LIST[0],
    []
  );

  // The real engine, run against the real catalogue, for a visitor who has
  // recorded no skills — exactly the state a stranger is in.
  const plan = useMemo(() => generateRoadmapPlan({ role, userSkills: [] }), [role]);

  const gaps = useMemo(() => computeSkillGaps(toRoleSkillRequirements(role), []), [role]);

  const firstTask = plan.phases[0]?.milestones[0]?.tasks[0] ?? null;
  const domainLabel = getCareerDomainLabel(role.domainId);

  // The three gaps that are worth closing first. The product's own ordering,
  // not one written for the page.
  const priorityGaps = gaps.slice(0, 3);

  // The boards the platform really reads, with the names it shows them under.
  // Wonderin publishes no feed, so it is not one of them — the platform sends
  // the visitor there to search instead, and the interface says so.
  const liveSources = [
    JOB_SOURCE_LABELS.google_jobs,
    JOB_SOURCE_LABELS.indeed,
    JOB_SOURCE_LABELS.handshake,
    JOB_SOURCE_LABELS.company_careers,
  ];

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative w-full"
      style={{ perspective: '1600px' }}
    >
      {/* The ambient wash behind the composition. Decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-[var(--color-primary)]/10 via-transparent to-[var(--color-ai)]/10 blur-2xl"
      />

      <motion.div
        variants={staggerReveal(reduced, 0.09)}
        initial="hidden"
        animate="visible"
        style={{
          rotateX: pointerReady ? tiltX : 0,
          rotateY: pointerReady ? tiltY : 0,
          transformStyle: 'preserve-3d',
        }}
        className="relative grid grid-cols-1 items-center gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] xl:gap-5"
      >
        {/* ---------------------------------------------------- left column */}
        <div className="order-2 flex flex-col gap-4 sm:order-1 lg:order-none [transform:translateZ(-18px)]">
          <Satellite
            phase={0}
            inView={stageInView}
            reduced={reduced}
            icon={FileText}
            label={t('navCV')}
          >
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-md bg-[var(--color-accent-surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                {t('Document Editor & Preview')}
              </span>
              <span className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
                {t('Templates')}
              </span>
              <span className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
                {t('Version History')}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--color-border)]/70 pt-2 text-[9px] font-semibold text-[var(--color-ai-text)]">
              <Sparkles className="h-3 w-3" />
              {t('ATS Audit')}
            </div>
          </Satellite>

          <Satellite
            phase={1.6}
            inView={stageInView}
            reduced={reduced}
            icon={BarChart3}
            label={t('navSkills')}
          >
            <ul className="space-y-1.5">
              {priorityGaps.map((gap) => {
                const ratio = Math.min(
                  100,
                  Math.round((gap.currentLevel / Math.max(gap.requiredLevel, 1)) * 100)
                );
                return (
                  <li key={gap.name} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-[9px] font-medium text-[var(--text-secondary)]">
                      {gap.name}
                    </span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
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
          </Satellite>
        </div>

        {/* ------------------------------------------------- the centre panel */}
        <div className="order-1 sm:order-2 lg:order-none [transform:translateZ(38px)]">
          <div className="relative">
            {/* The hairlines that tie the satellites to the centre. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-full top-[30%] hidden h-px w-10 cp-connection xl:block"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-full top-[68%] hidden h-px w-10 cp-connection xl:block"
            />

            <motion.div
              variants={smoothScale(reduced)}
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--surface-main)] shadow-[var(--shadow-raised)]"
            >
              {/* The window chrome, so it reads as the product. */}
              <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--surface-secondary)] px-3 py-2.5">
                <div aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border-strong)]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border-strong)]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border-strong)]" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--surface-main)] px-2 py-1 text-[9px] text-[var(--text-muted)]">
                  <Map className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate font-mono">
                    careerdev4ai.pages.dev/{domainLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
                  </span>
                </div>
              </div>

              {/* The role the whole plan answers to. */}
              <div className="flex items-center gap-2.5 px-4 pt-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)]">
                  <Target className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-[var(--text-primary)]">
                    {role.title}
                  </div>
                  <div className="truncate text-[9px] text-[var(--text-muted)]">{domainLabel}</div>
                </div>
              </div>

              {/*
                The first phase of the plan the engine built.

                This used to be the role-readiness score, which is the real
                number the platform computes — and for a visitor with no
                recorded skills that number is zero. Zero is the honest
                answer and a terrible headline: a visitor does not yet know
                what it measures, so they read it as a verdict on themselves.
                The first phase says the same thing positively: here is the
                work, and here is what it is for.
              */}
              {plan.phases[0] && (
                <div className="px-4 pt-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[8px] font-bold text-[var(--color-on-primary)]">
                      1
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-[var(--text-primary)]">
                        {plan.phases[0].title}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-[var(--text-secondary)]">
                        {plan.phases[0].goal}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* The next best action the engine recommends. */}
              <div className="px-4 pt-3.5">
                <div className="rounded-xl border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] p-3">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-ai-text)]">
                    <Sparkles className="h-3 w-3" />
                    {t('Next best action')}
                  </div>
                  {firstTask && (
                    <>
                      <div className="mt-1.5 text-[11px] font-bold leading-snug text-[var(--text-primary)]">
                        {firstTask.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                        <span className="font-mono">{firstTask.estimatedHours}h</span>
                        {firstTask.primarySkillName && (
                          <span className="truncate">{firstTask.primarySkillName}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* The plan's own summary. */}
              <div className="mt-3.5 grid grid-cols-4 divide-x divide-[var(--color-border)] border-t border-[var(--color-border)] rtl:divide-x-reverse">
                <Metric label={t('Phases')} value={String(plan.phases.length)} />
                <Metric label={t('Tasks')} value={String(plan.summary.totalTasks)} />
                <Metric label={t('Hours')} value={`${plan.summary.estimatedHours}h`} />
                <Metric label={t('Open gaps')} value={String(plan.summary.openGaps)} />
              </div>
            </motion.div>
          </div>
        </div>

        {/* --------------------------------------------------- right column */}
        <div className="order-3 flex flex-col gap-4 [transform:translateZ(-18px)]">
          <Satellite
            phase={0.8}
            inView={stageInView}
            reduced={reduced}
            icon={GraduationCap}
            label={t('Learning Hub')}
          >
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-md bg-[var(--color-accent-surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                {t('Recommended')}
              </span>
              <span className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
                {t('Saved')}
              </span>
              <span className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
                {t('In progress')}
              </span>
              <span className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
                {t('Completed')}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--color-border)]/70 pt-2 text-[9px] text-[var(--text-muted)]">
              <Sparkles className="h-3 w-3" />
              {t('What should you learn next?')}
            </div>
          </Satellite>

          <Satellite
            phase={2.4}
            inView={stageInView}
            reduced={reduced}
            icon={Briefcase}
            label={t('navJobs')}
          >
            <div className="flex flex-wrap gap-1.5">
              {liveSources.map((source) => (
                <span
                  key={source}
                  className="rounded-md bg-[var(--color-surface-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]"
                >
                  {source}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--color-border)]/70 pt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ai-surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-ai-text)]">
                <GraduationCap className="h-2.5 w-2.5" />
                {t('Internship')}
              </span>
              <span className="text-[9px] text-[var(--text-muted)]">{t('Search jobs')}</span>
            </div>
          </Satellite>
        </div>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* The satellites                                                             */
/* -------------------------------------------------------------------------- */

interface SatelliteProps {
  /** The lucide icon of the surface. */
  icon: React.ComponentType<{ className?: string }>;
  /** The name of the surface, as the product's own navigation names it. */
  label: string;
  /** The body of the card. */
  children: React.ReactNode;
  /** The offset of the drift cycle, so two satellites never move as one. */
  phase: number;
  /** Whether the stage is currently on screen. */
  inView: boolean;
  /** Whether the visitor asked for reduced motion. */
  reduced: boolean;
}

/**
 * One surface of the ecosystem.
 *
 * The drift is a CSS animation on the card itself, and it is paused by a
 * class while the card is off screen. The entrance is a separate element
 * underneath it, so the two never fight over the same `transform`.
 */
const Satellite: React.FC<SatelliteProps> = ({
  icon: Icon,
  label,
  children,
  phase,
  inView,
  reduced,
}) => (
  <motion.div variants={smoothScale(reduced)}>
    <div
      style={floatingStyle(reduced, phase, 5)}
      className={`h-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-main)] p-3.5 shadow-[var(--shadow-card)] ${
        inView ? '' : 'cp-float-paused'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="cp-icon-tile flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
          <Icon className="h-3 w-3" />
        </span>
        {/*
          The label wraps rather than truncates. "Live Jobs & Internships"
          is the name the product gives the area, and a satellite that reads
          "Live Jobs & Inte…" is worse than one that takes two lines.
        */}
        <div className="min-w-0 text-[11px] font-bold leading-tight text-[var(--text-primary)]">
          {label}
        </div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  </motion.div>
);

/** A single number in the centre panel's metric strip. */
const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="px-2 py-2.5 text-center">
    <div className="font-mono text-sm font-bold leading-none text-[var(--text-primary)]">{value}</div>
    <div className="mt-1 text-[8px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </div>
  </div>
);

export default HeroEcosystem;
