/**
 * CareerPilot AI — shared motion system.
 * ---------------------------------------------------------------------------
 * One place for every duration, easing curve and entrance variant in the
 * product. Nothing in the app hard-codes a timing value, so the whole interface
 * moves with the same rhythm.
 *
 * Built on the `motion` package (Framer Motion's successor). Product UI
 * transitions — buttons, panels, modals, list reveals — stay on `motion` so
 * there is one timing system for everything the user touches.
 *
 * GSAP (+ @gsap/react), Lenis and React Bits components are installed for
 * showcase work: landing-page hero choreography, scroll-linked sequences and
 * long-page smooth scrolling. They are deliberately not used for in-product
 * UI state changes, and any GSAP/Lenis code must still honour
 * `prefers-reduced-motion` the same way the variants below do.
 *
 * Design rules encoded here:
 *   * UI interactions (hover, press, small state changes) run 150–250ms.
 *   * Section and hero entrances run 250–500ms.
 *   * Only `opacity`, `transform` and `filter` are animated — never layout.
 *   * Everything degrades to an instant, non-moving state when the visitor
 *     asks for reduced motion, while status/loading feedback is preserved.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Transition, Variants } from 'motion/react';

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

export const MOTION_DURATION = {
  /** Hover / press / focus micro-interactions. */
  ui: 0.18,
  /** Small in-panel reveals (cards, rows, list items). */
  micro: 0.26,
  /** Section and hero entrances. */
  entrance: 0.45,
  /** Larger, deliberate moments (drawers, modals). */
  overlay: 0.24,
} as const;

export const MOTION_EASE = {
  /** Smooth, decelerating — the default for entrances. */
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Quick in, quick out — the default for interactions. */
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

export const UI_TRANSITION: Transition = {
  duration: MOTION_DURATION.ui,
  ease: MOTION_EASE.inOut,
};

export const ENTRANCE_TRANSITION: Transition = {
  duration: MOTION_DURATION.entrance,
  ease: MOTION_EASE.out,
};

/* -------------------------------------------------------------------------- */
/* Variant factories                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every factory takes a `reduced` flag so a single hook can serve the whole
 * app. When motion is reduced the element still fades in (so content is never
 * hidden) but it never travels and the duration collapses.
 */
const buildEntrance = (reduced: boolean, distance = 16, delay = 0): Variants => ({
  hidden: {
    opacity: 0,
    y: reduced ? 0 : distance,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01, delay: 0, ease: MOTION_EASE.out }
      : { duration: MOTION_DURATION.entrance, delay, ease: MOTION_EASE.out },
  },
});

/** Fade + a short upward travel. The default entrance for content blocks. */
export const entranceVariants = (reduced = false, delay = 0): Variants =>
  buildEntrance(reduced, 16, delay);

/** Fade + a shorter travel. For elements that sit inside an already-moving area. */
export const entranceSoftVariants = (reduced = false, delay = 0): Variants =>
  buildEntrance(reduced, 10, delay);

/** Pure opacity fade — for text and overlays that should not move. */
export const fadeVariants = (reduced = false): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.overlay, ease: MOTION_EASE.out },
  },
});

/**
 * Parent container that reveals its children one after another.
 *
 * `staggerChildren` is the gap between children; it stays small so the last
 * child never feels late. The first child starts almost immediately, which
 * keeps the user from waiting for content.
 */
export const staggerContainer = (
  reduced = false,
  staggerChildren = 0.07,
  delayChildren = 0
): Variants => ({
  hidden: {},
  visible: {
    transition: reduced
      ? { staggerChildren: 0, delayChildren: 0 }
      : { staggerChildren, delayChildren },
  },
});

/**
 * Parent container for a list whose children should fade in one after another
 * without any travel — used for stat grids and compact rows.
 */
export const staggerFadeContainer = (reduced = false): Variants =>
  staggerContainer(reduced, 0.05, 0);

/** Item inside a `staggerContainer`. */
export const staggerItemVariants = (reduced = false): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.micro, ease: MOTION_EASE.out },
  },
});

/* -------------------------------------------------------------------------- */
/* Landing motion presets                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The named presets the landing page is built from.
 *
 * The variants above are the general vocabulary of the product. These are the
 * eight shapes the public page actually uses, given names so that a section
 * declares *what it wants to do* rather than re-deriving the numbers:
 *
 *   fadeUp           a block rises into place as it comes into view
 *   staggerReveal    a group of blocks arrives one after another
 *   smoothScale      a surface settles in by growing very slightly
 *   floatingMotion   a surface breathes, very slowly, while it is on screen
 *   cardHover        a card lifts by a hair and gains a border
 *   scrollReveal     a block is revealed by the act of scrolling to it
 *   textReveal       a heading arrives word by word
 *   sectionTransition a whole section crossfades into the next
 *
 * They are all built on `opacity` and `transform`, so none of them can
 * trigger a layout pass, and every one of them collapses to an instant,
 * unmoving state when the visitor asks for reduced motion.
 */

/** A block that rises into place. The default entrance for a section body. */
export const fadeUp = (reduced = false, distance = 24, delay = 0): Variants =>
  buildEntrance(reduced, distance, delay);

/**
 * A surface that settles in by growing slightly.
 *
 * Used for panels that should feel like they were always there and were
 * simply not yet lit — a product card, a preview window — rather than for
 * things that arrive from somewhere.
 */
export const smoothScale = (reduced = false, delay = 0): Variants => ({
  hidden: {
    opacity: 0,
    scale: reduced ? 1 : 0.96,
    y: reduced ? 0 : 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.entrance, delay, ease: MOTION_EASE.out },
  },
});

/**
 * A group whose children arrive one after another.
 *
 * The gap is the interval between two children, not a delay before the first
 * one, so the first card is never late.
 */
export const staggerReveal = (reduced = false, gap = 0.08, delay = 0): Variants =>
  staggerContainer(reduced, gap, delay);

/**
 * A block that is revealed by the act of scrolling to it.
 *
 * The difference from `fadeUp` is the trigger rather than the shape: this one
 * is for content whose whole point is that the reader arrives at it. The
 * `viewport` option below is what makes that real.
 */
export const scrollReveal = (reduced = false, distance = 32): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : distance },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.entrance, ease: MOTION_EASE.out },
  },
});

/**
 * A heading that arrives word by word.
 *
 * Each word is clipped by the line box it sits in and slides up from under
 * it, so the text appears to be uncovered rather than to fade in. The
 * duration is deliberately long relative to the number of words: a heading
 * that resolves in a fifth of a second reads as a flicker.
 */
export const textReveal = (reduced = false, gap = 0.055): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : '110%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01, delay: 0 }
      : { duration: 0.62, ease: MOTION_EASE.out },
  },
});

/**
 * The word container for a `textReveal` heading.
 *
 * `staggerChildren` is the gap between two words and `delayChildren` is the
 * pause before the first one starts.
 */
export const textRevealContainer = (reduced = false, gap = 0.055, delay = 0): Variants => ({
  hidden: {},
  visible: {
    transition: reduced
      ? { staggerChildren: 0, delayChildren: 0 }
      : { staggerChildren: gap, delayChildren: delay },
  },
});

/**
 * A whole section handing over to the next one.
 *
 * A crossfade rather than a slide: two adjacent sections that slide past
 * each other read as two pages, and this page is one continuous document.
 */
export const sectionTransition = (reduced = false): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.entrance, ease: MOTION_EASE.out },
  },
});

/**
 * The hover treatment of a card.
 *
 * A card lifts by two pixels and gains a hair of border emphasis. It never
 * scales: a grid of scaling cards visibly jumps around as the pointer crosses
 * it, which reads as sloppiness rather than as depth.
 */
export const cardHover = (reduced = false) =>
  reduced
    ? {}
    : {
        y: -2,
        transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE.out },
      };

/* -------------------------------------------------------------------------- */
/* Floating                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The drift of a floating surface.
 *
 * A single, slow, small oscillation. The amplitude is measured in pixels
 * because a percentage would scale with the element, and a large card would
 * then swing much further than a small one.
 *
 * The animation is driven by CSS rather than by a JavaScript loop, so it
 * costs nothing per frame on the main thread and it can be paused while the
 * element is off screen — see `useFloatingInView`.
 */
export const FLOATING_KEYFRAMES = 'cp-float';

/** The durations of the float, in seconds. Longer is calmer. */
export const FLOATING_DURATION = 7.5;

/**
 * Builds the inline style of a floating surface.
 *
 * `phase` offsets the cycle so that two surfaces floating together do not
 * move as one object. It is expressed as a negative delay, which is the only
 * way to start a CSS animation part-way through its cycle.
 */
export const floatingStyle = (
  reduced = false,
  phase = 0,
  amplitude = 7,
  duration = FLOATING_DURATION,
): CSSProperties => {
  if (reduced) return {};
  return {
    animation: `${FLOATING_KEYFRAMES} ${duration}s ease-in-out ${-phase}s infinite`,
    '--cp-float-amplitude': `${amplitude}px`,
  } as CSSProperties;
};

/**
 * Keeps a floating surface still while it is off screen.
 *
 * The brief for this page is that nothing moves when nobody is looking at it.
 * An IntersectionObserver toggles a single class, and the class pauses the
 * CSS animation — so an off-screen card costs no frames at all, rather than
 * being animated invisibly.
 */
export const useFloatingInView = (ref: RefObject<HTMLElement | null>) => {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '120px 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
};

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The single hook the app uses to ask "may I move things?".
 *
 * Returns the reduced-motion preference plus a ready-made set of variants, so
 * a component never has to remember to branch on the preference itself.
 */
export const useMotionVariants = () => {
  const reduced = useReducedMotion() ?? false;

  return {
    reduced,
    entrance: entranceVariants(reduced),
    entranceSoft: entranceSoftVariants(reduced),
    fade: fadeVariants(reduced),
    stagger: staggerContainer(reduced),
    staggerSoft: staggerContainer(reduced, 0.05, 0),
    staggerItem: staggerItemVariants(reduced),
  };
};

/* -------------------------------------------------------------------------- */
/* Interaction helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Hover treatment for a surface. A card lifts a couple of pixels and gains a
 * hair of border emphasis — it never scales, because scaling makes a grid of
 * cards visibly jump.
 */
export const hoverLift = (reduced = false) =>
  reduced
    ? {}
    : {
        y: -2,
        transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE.out },
      };

/** Press treatment for buttons. A tiny scale-down reads as a real click. */
export const pressScale = (reduced = false) =>
  reduced
    ? {}
    : { scale: 0.97, transition: { duration: 0.12, ease: MOTION_EASE.inOut } };

/* -------------------------------------------------------------------------- */
/* Overlay transitions                                                        */
/* -------------------------------------------------------------------------- */

/** Backdrop for modals and drawers. */
export const backdropVariants = (reduced = false): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: reduced ? 0.01 : MOTION_DURATION.overlay },
  },
  exit: {
    opacity: 0,
    transition: { duration: reduced ? 0.01 : 0.16 },
  },
});

/** Dialog panel: a short fade, a small scale and a 6px lift. */
export const dialogVariants = (reduced = false): Variants => ({
  hidden: {
    opacity: 0,
    scale: reduced ? 1 : 0.97,
    y: reduced ? 0 : 8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.overlay, ease: MOTION_EASE.out },
  },
  exit: {
    opacity: 0,
    scale: reduced ? 1 : 0.98,
    y: reduced ? 0 : 4,
    transition: { duration: reduced ? 0.01 : 0.14 },
  },
});

/** Right-hand drawer. */
export const drawerVariants = (reduced = false): Variants => ({
  hidden: { x: reduced ? 0 : '100%' },
  visible: {
    x: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.overlay, ease: MOTION_EASE.out },
  },
  exit: {
    x: reduced ? 0 : '100%',
    transition: { duration: reduced ? 0.01 : 0.18 },
  },
});

/** Left-hand drawer (mobile navigation). */
export const drawerLeftVariants = (reduced = false): Variants => ({
  hidden: { x: reduced ? 0 : '-100%' },
  visible: {
    x: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: MOTION_DURATION.overlay, ease: MOTION_EASE.out },
  },
  exit: {
    x: reduced ? 0 : '-100%',
    transition: { duration: reduced ? 0.01 : 0.18 },
  },
});
