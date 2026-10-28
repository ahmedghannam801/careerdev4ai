import React from 'react';
import { motion } from 'motion/react';
import { Check, Sparkles, Target } from 'lucide-react';
import { useMotionVariants, MOTION_EASE } from '../../lib/motion';
import { useCareer } from '../../context/CareerContext';

/**
 * CareerPilot AI — the landing-page journey visual.
 *
 * A vertical career path that shows the shape of the product: direction →
 * skill gaps → roadmap → learning → projects → evidence → CV → opportunity.
 *
 * The motion is deliberately restrained. The path draws itself once, the nodes
 * fade up in sequence, and the active destination carries a slow, low-amplitude
 * pulse. There is no continuous movement that would pull the eye away from the
 * headline, and the whole thing settles into a static, legible diagram when the
 * visitor asks for reduced motion.
 */

interface JourneyStep {
  key: string;
  label: string;
  detail: string;
}

/** The product's actual sequence, in the order the platform performs it. */
const JOURNEY: JourneyStep[] = [
  { key: 'direction', label: 'Direction', detail: 'Target role and goals' },
  { key: 'skills', label: 'Skill gaps', detail: 'What to close first' },
  { key: 'roadmap', label: 'Roadmap', detail: 'Phased, actionable steps' },
  { key: 'learning', label: 'Learning', detail: 'Courses matched to gaps' },
  { key: 'projects', label: 'Projects', detail: 'Proof of skill' },
  { key: 'evidence', label: 'Evidence', detail: 'Verified outcomes' },
  { key: 'cv', label: 'CV', detail: 'Role-targeted proof' },
  { key: 'opportunity', label: 'Opportunity', detail: 'Applications and interviews' },
];

export interface CareerJourneyVisualProps {
  /**
   * If provided, displays the authenticated user's real progress.
   * If omitted, renders the neutral public starting state.
   */
  userState?: {
    completedKeys: string[];
    activeKey?: string;
  };
}

export const CareerJourneyVisual: React.FC<CareerJourneyVisualProps> = ({ userState }) => {
  const { reduced, stagger, staggerItem, entrance } = useMotionVariants();
  const { t } = useCareer();

  // Public/neutral mode when no authenticated userState is provided
  const isPublic = !userState;
  const completedKeys = userState?.completedKeys || [];
  const activeKey = userState?.activeKey;

  const completedCount = completedKeys.length;
  const progressRatio = isPublic ? 0 : completedCount / JOURNEY.length;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={entrance}
      className="relative w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-[0_1px_2px_color-mix(in_srgb,var(--color-text-primary)_6%,transparent),0_24px_48px_-28px_color-mix(in_srgb,var(--color-text-primary)_35%,transparent)] overflow-hidden"
    >
      {/* A soft brand wash behind the panel — decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 cp-brand-wash opacity-70"
      />

      <div className="relative flex items-start justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
            <Target className="w-3.5 h-3.5" />
            <span>{t('Your Career Journey')}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {isPublic
              ? 'One unified path. Eight connected stages.'
              : `${completedCount} of ${JOURNEY.length} stages completed`}
          </p>
        </div>

        {isPublic ? (
          <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
            8 Stages
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--color-primary-text)]">
            {Math.round(progressRatio * 100)}%
          </span>
        )}
      </div>

      {/* The journey list. The connecting path is drawn behind the nodes. */}
      <motion.ol
        variants={stagger}
        className="relative mt-4 space-y-0"
        aria-label={t('The CareerPilot journey')}
      >
        {/* Progress rail: the connecting line behind the nodes. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-4 start-[14px] h-[calc(100%-2rem)] w-px overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 1 100"
        >
          {/* Neutral base path */}
          <line
            x1="0.5"
            y1="0"
            x2="0.5"
            y2="100"
            stroke="var(--color-border)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {/* Travelled path — only shown for authenticated user progress */}
          {!isPublic && progressRatio > 0 && (
            <motion.line
              x1="0.5"
              y1="0"
              x2="0.5"
              y2="100"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reduced ? { pathLength: progressRatio } : { pathLength: 0 }}
              animate={{ pathLength: progressRatio }}
              transition={
                reduced
                  ? { duration: 0.01 }
                  : { duration: 1.1, ease: MOTION_EASE.out, delay: 0.25 }
              }
            />
          )}
        </svg>

        {JOURNEY.map((step, index) => {
          const isDone = !isPublic && completedKeys.includes(step.key);
          const isActive = !isPublic && activeKey === step.key;

          return (
            <motion.li
              key={step.key}
              variants={staggerItem}
              className="relative flex items-start gap-3 py-2.5"
            >
              {/* Node */}
              <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                <span
                  className={`absolute inset-0 rounded-full border transition-colors duration-300 ${
                    isActive
                      ? 'border-[var(--color-primary)]/35 bg-[var(--color-accent-surface)]'
                      : 'border-transparent bg-[var(--color-surface)]'
                  }`}
                />
                {isActive && !reduced && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-[var(--color-primary)]/50"
                    initial={{ scale: 0.85, opacity: 0.7 }}
                    animate={{ scale: 1.55, opacity: 0 }}
                    transition={{
                      duration: 2.4,
                      ease: 'easeOut',
                      repeat: Infinity,
                      repeatDelay: 1.2,
                    }}
                  />
                )}
                <span
                  className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300 ${
                    isDone
                      ? 'bg-[var(--color-success-strong)] text-[var(--color-surface)]'
                      : isActive
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : isActive ? (
                    <Sparkles className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
              </span>

              {/* Label */}
              <span className="min-w-0 flex-1 pt-0.5">
                <span
                  className={`block text-sm font-semibold leading-tight transition-colors duration-300 ${
                    isDone || isActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                  {step.detail}
                </span>
              </span>

              {/* Only show "You are here" when authenticated and active */}
              {isActive && (
                <span className="mt-1 shrink-0 rounded-full bg-[var(--color-accent-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-primary-text)]">
                  {t('You are here')}
                </span>
              )}
            </motion.li>
          );
        })}
      </motion.ol>

      {/* Footnote */}
      <p className="relative mt-3 border-t border-[var(--color-border)] pt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
        {isPublic
          ? 'Neutral starting view. Your career journey becomes dynamic and personalized as soon as you choose a target role and begin.'
          : 'Personalized to your target role, skill gaps, verified evidence, and current progress.'}
      </p>
    </motion.div>
  );
};

export default CareerJourneyVisual;
