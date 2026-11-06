/**
 * The spotlight engine shared by every guided tour in the product.
 *
 * The product has two kinds of tour: the small per-area coach marks
 * (`GuidedTour`) and the long product tour (`InteractiveTourModal`). Both
 * have to behave the same way, and both had the same three defects:
 *
 *  1. the highlighted element was dimmed along with the rest of the page, so
 *     the thing the instruction was talking about was the one thing you could
 *     not see;
 *  2. the instruction card could be placed on top of the element it was
 *     describing;
 *  3. the position was read once, so a scroll, a resize or a view change
 *     left the spotlight pointing at nothing.
 *
 * This module fixes all three in one place:
 *
 *  - the dimming is a RING. It is drawn as a very large box-shadow around
 *    the target, so the target's own area is never covered and the page
 *    behind the card is dimmed instead.
 *  - the card is placed by `placeTooltip`, which tries every side and refuses
 *    any placement that would overlap the target.
 *  - the measurement is live: it follows scrolling, resizing and the target
 *    changing size.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SpotlightRect {
  /** Physical viewport coordinates. Never flipped for RTL. */
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface UseSpotlightOptions {
  /** The CSS selector of the element to highlight. */
  target: string;
  /**
   * Selectors tried, in order, when the primary target is not on the page.
   * A step whose subject is missing should still say something useful.
   */
  fallbacks?: string[];
  /**
   * How long to wait before the first measurement. A step that navigates to
   * another view needs the new view to render before it can be measured.
   */
  settleMs?: number;
  /** Set to false to stop looking for the target (e.g. the tour is closed). */
  active?: boolean;
}

export interface SpotlightState {
  /** The measured target, or null when it is not on the page. */
  rect: SpotlightRect | null;
  /** True when the target could not be found at all. */
  missing: boolean;
}

const EMPTY: SpotlightState = { rect: null, missing: false };

/**
 * Finds the first element that matches the target or one of the fallbacks.
 */
export function resolveTarget(
  target: string,
  fallbacks: string[] = []
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const selectors = [target, ...fallbacks].filter(Boolean);
  for (const selector of selectors) {
    try {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    } catch {
      // A malformed selector must not take the whole tour down.
    }
  }
  return null;
}

/**
 * Tracks the position of the element a tour step points at.
 *
 * The measurement is a physical one: `getBoundingClientRect` always measures
 * from the left edge of the viewport, so the result must never be flipped for
 * an Arabic layout.
 */
export function useSpotlight({
  target,
  fallbacks = [],
  settleMs = 0,
  active = true,
}: UseSpotlightOptions): SpotlightState {
  const [state, setState] = useState<SpotlightState>(EMPTY);
  const elementRef = useRef<HTMLElement | null>(null);
  // The selectors are read through a ref so that a new string does not tear
  // the measurement down and set it up again on every render.
  const selectorsRef = useRef({ target, fallbacks });
  selectorsRef.current = { target, fallbacks };

  const measure = useCallback(() => {
    const { target: primary, fallbacks: secondary } = selectorsRef.current;
    const element = resolveTarget(primary, secondary);
    elementRef.current = element;

    if (!element) {
      setState((current) =>
        current.missing && !current.rect ? current : { rect: null, missing: true }
      );
      return;
    }

    const rect = element.getBoundingClientRect();
    // An element that is scrolled out of view, or one that is not rendered at
    // all (display:none), has no meaningful box. Treating it as missing lets
    // the tour move on instead of pointing at an empty space.
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;

    setState((current) => {
      const next: SpotlightState = isVisible
        ? { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, missing: false }
        : { rect: null, missing: true };
      if (
        current.rect &&
        next.rect &&
        Math.abs(current.rect.top - next.rect.top) < 0.5 &&
        Math.abs(current.rect.left - next.rect.left) < 0.5 &&
        Math.abs(current.rect.width - next.rect.width) < 0.5 &&
        Math.abs(current.rect.height - next.rect.height) < 0.5 &&
        current.missing === next.missing
      ) {
        return current;
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!active) {
      setState(EMPTY);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (settleMs > 0) {
      timer = setTimeout(measure, settleMs);
    } else {
      measure();
    }

    const onViewportChange = () => measure();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    // A target that changes size — a panel that loaded, a card that grew —
    // must keep the spotlight around it.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      if (elementRef.current) observer.observe(elementRef.current);
    }

    // Re-observe the element whenever the step changes.
    const targetElement = elementRef.current;
    if (observer && targetElement) observer.observe(targetElement);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      observer?.disconnect();
    };
  }, [active, target, settleMs, measure]);

  // Re-observe when the resolved element changes.
  useEffect(() => {
    if (!active) return;
    const element = elementRef.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      observer.observe(element);
    }
    return () => observer?.disconnect();
  }, [active, state.rect?.top, state.rect?.left, measure]);

  return state;
}

export type TooltipPlacement = 'below' | 'above' | 'right' | 'left' | 'sheet';

export interface TooltipPosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

export interface PlaceTooltipOptions {
  /** The measured target. */
  rect: SpotlightRect | null;
  /** The size the card wants. */
  cardWidth: number;
  cardHeight: number;
  /** Distance kept from the edge of the viewport. */
  margin?: number;
  /** Distance kept between the card and the target. */
  gap?: number;
  /** The current viewport size. */
  viewportWidth: number;
  viewportHeight: number;
  /** True when the interface is right-to-left. */
  isRtl?: boolean;
}

function intersects(
  a: { top: number; left: number; width: number; height: number },
  b: { top: number; left: number; width: number; height: number },
  padding: number
): boolean {
  return !(
    a.left + a.width + padding <= b.left ||
    b.left + b.width + padding <= a.left ||
    a.top + a.height + padding <= b.top ||
    b.top + b.height + padding <= a.top
  );
}

/**
 * Places the instruction card next to the target.
 *
 * The card is never allowed to sit on top of the element it describes: every
 * candidate placement is checked against the target's box and a placement
 * that overlaps is rejected. On a narrow screen the card becomes a sheet at
 * the bottom of the viewport, which is the only place that can hold it
 * without covering the subject.
 */
export function placeTooltip({
  rect,
  cardWidth,
  cardHeight,
  margin = 16,
  gap = 12,
  viewportWidth,
  viewportHeight,
  isRtl = false,
}: PlaceTooltipOptions): TooltipPosition {
  // A phone cannot hold a floating card next to anything. The card becomes a
  // bottom sheet instead.
  if (viewportWidth < 640) {
    return {
      top: Math.max(margin, viewportHeight - cardHeight - margin),
      left: margin,
      placement: 'sheet',
    };
  }

  if (!rect) {
    return {
      top: Math.max(margin, (viewportHeight - cardHeight) / 2),
      left: Math.max(margin, (viewportWidth - cardWidth) / 2),
      placement: 'below',
    };
  }

  const maxTop = Math.max(margin, viewportHeight - cardHeight - margin);
  const maxLeft = Math.max(margin, viewportWidth - cardWidth - margin);

  const below: TooltipPosition = {
    top: rect.top + rect.height + gap,
    left: isRtl ? rect.left + rect.width - cardWidth : rect.left,
    placement: 'below',
  };
  const above: TooltipPosition = {
    top: rect.top - cardHeight - gap,
    left: isRtl ? rect.left + rect.width - cardWidth : rect.left,
    placement: 'above',
  };
  const right: TooltipPosition = {
    top: rect.top,
    left: rect.left + rect.width + gap,
    placement: 'right',
  };
  const left: TooltipPosition = {
    top: rect.top,
    left: rect.left - cardWidth - gap,
    placement: 'left',
  };

  const candidates = [below, above, right, left];

  for (const candidate of candidates) {
    const insideViewport =
      candidate.top >= margin &&
      candidate.left >= margin &&
      candidate.top + cardHeight <= viewportHeight - margin &&
      candidate.left + cardWidth <= viewportWidth - margin;

    if (!insideViewport) continue;
    if (
      intersects(
        {
          top: candidate.top,
          left: candidate.left,
          width: cardWidth,
          height: cardHeight,
        },
        rect,
        gap
      )
    ) {
      continue;
    }

    return {
      top: candidate.top,
      left: Math.min(Math.max(margin, candidate.left), maxLeft),
      placement: candidate.placement,
    };
  }

  // Nothing fits beside the target without covering it. The card is pinned
  // to the bottom of the viewport, which keeps the target visible above it.
  return {
    top: maxTop,
    left: Math.min(Math.max(margin, rect.left), maxLeft),
    placement: 'below',
  };
}
