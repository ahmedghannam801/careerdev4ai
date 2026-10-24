/**
 * CareerPilot AI — shared motion system.
 * ---------------------------------------------------------------------------
 * One place for every duration, easing curve and entrance variant in the
 * product. Nothing in the app hard-codes a timing value, so the whole interface
 * moves with the same rhythm.
 *
 * Built on the `motion` package (Framer Motion's successor), which is already a
 * project dependency — no additional animation library is introduced.
 *
 * Design rules encoded here:
 *   * UI interactions (hover, press, small state changes) run 150–250ms.
 *   * Section and hero entrances run 250–500ms.
 *   * Only `opacity`, `transform` and `filter` are animated — never layout.
 *   * Everything degrades to an instant, non-moving state when the visitor
 *     asks for reduced motion, while status/loading feedback is preserved.
 */

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
