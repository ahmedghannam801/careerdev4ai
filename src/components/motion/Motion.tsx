import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import {
  entranceVariants,
  entranceSoftVariants,
  staggerContainer,
  staggerItemVariants,
  textReveal,
  textRevealContainer,
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

/* -------------------------------------------------------------------------- */
/* Kinetic type                                                               */
/* -------------------------------------------------------------------------- */

interface RevealTextProps {
  /** The text to reveal. It is split on whitespace. */
  text: string;
  /** The element the text is rendered in. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  /** The classes of the element. */
  className?: string;
  /** Seconds between two words. */
  gap?: number;
  /** Seconds before the first word starts. */
  delay?: number;
  /** Reveal as soon as the element mounts rather than when it scrolls into view. */
  onMount?: boolean;
}

/**
 * A headline that arrives word by word.
 *
 * Each word is clipped by the line box it sits in and slides up from under
 * it, so the text looks uncovered rather than faded in. It is used for the
 * one headline on the page that has to carry the first impression; the rest
 * of the page uses the calmer `Reveal`.
 *
 * The full sentence is exposed to assistive technology as one string and the
 * animated words are hidden from it, so a screen reader announces the
 * headline as a sentence rather than as a list of fragments.
 */
export const RevealText: React.FC<RevealTextProps> = ({
  text,
  as: Tag = 'span',
  className = '',
  gap = 0.055,
  delay = 0,
  onMount = false,
}) => {
  const reduced = useReducedMotion() ?? false;
  const words = text.split(/\s+/).filter(Boolean);

  const container = textRevealContainer(reduced, gap, delay);
  const word = textReveal(reduced);

  const inner = (
    <span className="inline">
      {words.map((entry, index) => (
        <span
          key={`${entry}-${index}`}
          className="inline-block overflow-hidden align-bottom pb-[0.14em] -mb-[0.14em]"
        >
          <motion.span variants={word} className="inline-block">
            {entry}
            {index < words.length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );

  if (onMount) {
    return (
      <Tag className={className}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          <motion.span variants={container} initial="hidden" animate="visible" className="inline">
            {inner}
          </motion.span>
        </span>
      </Tag>
    );
  }

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <motion.span
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px 0px -60px 0px' }}
          className="inline"
        >
          {inner}
        </motion.span>
      </span>
    </Tag>
  );
};
