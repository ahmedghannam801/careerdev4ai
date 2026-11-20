import React, { useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

/**
 * ScrollProgress — how far down the page the visitor has read.
 *
 * A hairline across the top of the window that fills as the page is read.
 * It is the one piece of scroll-linked feedback the page carries, and it
 * earns its place on a long page: it tells a reader who has arrived at a
 * section in the middle of the document that there is more below.
 *
 * It is deliberately a line and not a number. A percentage in the corner
 * competes with the content for attention, and the line does not.
 */
export const ScrollProgress: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll();

  // The spring smooths the line so a flick of the wheel does not make it
  // jump. It is a spring with no visible overshoot, so the line never
  // travels backwards.
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"
    >
      <motion.div
        style={{ scaleX }}
        className="h-full w-full origin-left bg-[var(--color-primary)]"
      />
    </div>
  );
};

export default ScrollProgress;
