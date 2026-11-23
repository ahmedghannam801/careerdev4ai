import { useEffect, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

/**
 * The animation runtime.
 *
 * WHAT THIS USED TO DO, AND WHY IT NO LONGER DOES
 * ------------------------------------------------
 * This provider installed Lenis, a smooth-scroll library, on the whole
 * application. Lenis intercepts the wheel and animates the page towards where
 * the pointer said to go, with a 0.1 lerp — which is exactly what "the page
 * scrolls slower than my wheel" feels like. On a long dashboard the page was
 * always a little behind the input, and every scroll frame also ran
 * `ScrollTrigger.update` and a GSAP ticker with lag smoothing switched off.
 *
 * The platform does not need it. The scroll it wants is the browser's own
 * scroll: instant, on the compositor, with the same physics as every other
 * page the candidate uses, and with `scroll-margin`/`prefers-reduced-motion`
 * respected for free. So the library is gone, and this provider now does the
 * one thing that is still required: it registers the GSAP plugins the motion
 * components use, once, before anything animates.
 *
 * The name is kept so the entry point does not change shape, and so the
 * remaining `SmoothScrollProvider` import in `main.tsx` keeps meaning "the
 * thing that sets motion up".
 */

/** Registers the GSAP plugins once, on the client. */
function registerPlugins(): void {
  gsap.registerPlugin(useGSAP, ScrollTrigger, GSAPSplitText);
}

if (typeof window !== 'undefined') {
  registerPlugins();
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // A component that mounts after a hot reload may be the first thing to
    // animate; registering again is idempotent and costs nothing.
    registerPlugins();
    // ScrollTrigger measures against the real viewport, and the mobile
    // browsers change it when the address bar collapses. Telling it to
    // refresh on that event keeps the reveal animations aligned without any
    // scroll listener of our own.
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return children;
}

export default SmoothScrollProvider;
