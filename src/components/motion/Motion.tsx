import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import {
  entranceVariants,
  entranceSoftVariants,
  staggerContainer,
  staggerItemVariants,
} from '../../lib/motion';

/**
 * CareerPilot AI — reusable motion wrappers.
 *
 * Views use these instead of hand-rolling variants, so every panel in the
 * product enters the same way and every one of them honours the visitor's
 * reduced-motion preference.
 *
 * All wrappers animate only `opacity` and `transform`.
 */

/**
 * Decides, before the first paint, whether an element is already on screen.
 *
 * `whileInView` relies on an IntersectionObserver, and an observer callback
 * is only delivered when the browser produces a frame. On a page whose
 * hero is above the fold that is a needless dependency: if the callback is
 * ever delayed, the headline stays invisible for a moment.
 *
 * So the position is measured directly. Anything already on screen is
 * revealed immediately; anything below the fold waits for the observer, which
 * is exactly the behaviour the scroll reveal wants.
 */
const useRevealedOnMount = (ref: React.RefObject<HTMLElement | null>, enabled: boolean) => {
  const [revealed, setRevealed] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) {
      setRevealed(true);
      return;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // On screen (or only just below the fold) — reveal straight away.
    if (rect.top < viewportHeight - 24 && rect.bottom > 0) {
      setRevealed(true);
      return;
    }

    // Otherwise reveal as soon as it is scrolled into view.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-80px 0px -80px 0px' }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, enabled]);

  return revealed;
};

interface RevealProps extends Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'animate'> {
  /** Delay in seconds before the element starts moving. */
  delay?: number;
  /** How far the element travels upward while fading in. */
  distance?: 'soft' | 'default';
  /** Animate every time the element scrolls into view instead of only once. */
  repeat?: boolean;
  /**
   * Animate as soon as the element mounts instead of waiting for it to scroll
   * into view. Use this for stepped content such as the onboarding wizard,
   * where the panel may already be on screen.
   */
  onMount?: boolean;
}

/**
 * A block of content that fades and rises into place the first time it is
 * scrolled into view.
 */
export const Reveal: React.FC<RevealProps> = ({
  delay = 0,
  distance = 'default',
  repeat = false,
  onMount = false,
  children,
  ...rest
}) => {
  const reduced = useReducedMotion() ?? false;
  const variants =
    distance === 'soft'
      ? entranceSoftVariants(reduced, delay)
      : entranceVariants(reduced, delay);

  const ref = useRef<HTMLDivElement>(null);
  const revealed = useRevealedOnMount(ref, true);

  if (onMount) {
    return (
      <motion.div ref={ref} initial="hidden" animate="visible" variants={variants} {...rest}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={revealed ? 'visible' : undefined}
      whileInView="visible"
      viewport={{ once: !repeat, margin: '-80px 0px -80px 0px' }}
      variants={variants}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

interface StaggerProps extends Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'animate'> {
  /** Gap between children, in seconds. */
  gap?: number;
  /** Delay before the first child starts. */
  delay?: number;
  /** Fire when the group scrolls into view rather than on mount. */
  inView?: boolean;
}

/**
 * A group whose children appear one after another.
 */
export const Stagger: React.FC<StaggerProps> = ({
  gap = 0.07,
  delay = 0,
  inView = false,
  children,
  ...rest
}) => {
  const reduced = useReducedMotion() ?? false;
  const variants = staggerContainer(reduced, gap, delay);

  const ref = useRef<HTMLDivElement>(null);
  const revealed = useRevealedOnMount(ref, true);

  if (inView) {
    return (
      <motion.div
        ref={ref}
        initial="hidden"
        animate={revealed ? 'visible' : undefined}
        whileInView="visible"
        viewport={{ once: true, margin: '-60px 0px -60px 0px' }}
        variants={variants}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate="visible"
      variants={variants}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

interface StaggerItemProps extends Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'animate'> {
  /** Use the shorter travel distance for dense grids. */
  soft?: boolean;
}

/**
 * A single child of a `Stagger` group.
 */
export const StaggerItem: React.FC<StaggerItemProps> = ({ soft = false, children, ...rest }) => {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      variants={soft ? entranceSoftVariants(reduced) : staggerItemVariants(reduced)}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

/**
 * A surface that lifts by a single pixel on hover and settles on press.
 *
 * Used for cards and clickable panels. It never scales, because a grid of
 * scaling cards visibly jumps around.
 */
export const HoverLift: React.FC<HTMLMotionProps<'div'>> = ({ children, ...rest }) => {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
};
