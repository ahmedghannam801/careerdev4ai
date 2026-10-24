import React, { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

/**
 * CareerPilot AI — animated number readout.
 *
 * Stat values reveal by counting up to their real value rather than snapping
 * into place, which reads as a value changing rather than a page loading.
 *
 * Under reduced motion the final value is rendered immediately — the
 * information is identical, only the movement is removed.
 */

interface CountUpProps {
  /** The value to settle on. */
  value: number;
  /** How long the count takes, in seconds. */
  duration?: number;
  /** How the intermediate values are rendered. */
  format?: (value: number) => string;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 0.9,
  format,
  className,
}) => {
  const reduced = useReducedMotion() ?? false;
  const motionValue = useMotionValue(reduced ? value : 0);
  const display = useTransform(motionValue, (current) =>
    format ? format(current) : Math.round(current).toString()
  );

  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, motionValue, duration, reduced]);

  return <motion.span className={className}>{display}</motion.span>;
};

export default CountUp;
