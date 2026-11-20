import React, { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

/**
 * Roadmapak AI — animated number readout.
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
  /**
   * Whether the readout is announced when it changes.
   *
   * A number that counts up is one announcement, not a hundred: the browser
   * coalesces polite updates and says the settled value. It is on by default
   * because a figure that changes on screen should also change for a reader.
   */
  live?: boolean;
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 0.9,
  format,
  className,
  live = true,
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

  // Tabular numerals stop the digits from changing width as the value
  // counts, so a readout that is animating does not visibly jitter.
  return (
    <motion.span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums' }}
      aria-live={live ? 'polite' : undefined}
    >
      {display}
    </motion.span>
  );
};

export default CountUp;
