import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * CareerPilot AI — animated progress indicator.
 *
 * The fill grows from its previous value to the new one instead of jumping,
 * so a progress bar reads as a value that moved. When the value changes
 * because the user completed something, the change is visible.
 *
 * Under reduced motion the bar still reaches the right width — it simply
 * appears there immediately.
 */

interface AnimatedProgressProps {
  /** Fill percentage, 0–100. */
  value: number;
  /** Optional label announced to assistive technology. */
  label?: string;
  className?: string;
  /** Track colour token. */
  trackClassName?: string;
  /** Fill colour token. */
  fillClassName?: string;
}

export const AnimatedProgress: React.FC<AnimatedProgressProps> = ({
  value,
  label,
  className = 'h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]',
  fillClassName = 'bg-[var(--color-primary)]',
}) => {
  const reduced = useReducedMotion() ?? false;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={className}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className={`h-full rounded-full ${fillClassName}`}
        initial={reduced ? { width: `${clamped}%` } : { width: '0%' }}
        animate={{ width: `${clamped}%` }}
        transition={
          reduced
            ? { duration: 0.01 }
            : { duration: 0.7, ease: [0.16, 1, 0.3, 1] }
        }
      />
    </div>
  );
};

export default AnimatedProgress;
