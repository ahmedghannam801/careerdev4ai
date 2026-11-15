import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, GSAPSplitText);

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: Lenis | null = null;
    let ticker: ((time: number) => void) | null = null;
    let scrollListener: (() => void) | null = null;
    let observer: MutationObserver | null = null;

    const syncModalState = () => {
      if (document.querySelector('[role="dialog"]')) lenis?.stop();
      else lenis?.start();
    };

    const initialize = () => {
      if (lenis) {
        if (scrollListener) lenis.off('scroll', scrollListener);
        lenis.destroy();
      }
      if (ticker) gsap.ticker.remove(ticker);
      observer?.disconnect();

      lenis = new Lenis({
        autoRaf: false,
        smoothWheel: !motionPreference.matches,
        syncTouch: !motionPreference.matches,
        lerp: motionPreference.matches ? 1 : 0.1,
        prevent: (node) =>
          node.hasAttribute('data-lenis-prevent') ||
          node.closest(
            '[role="dialog"], [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto'
          ) !== null,
      });

      scrollListener = () => ScrollTrigger.update();
      lenis.on('scroll', scrollListener);
      ticker = (time) => lenis?.raf(time * 1000);
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);

      observer = new MutationObserver(syncModalState);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['role', 'data-state'],
      });
      syncModalState();
    };

    initialize();
    motionPreference.addEventListener('change', initialize);

    return () => {
      motionPreference.removeEventListener('change', initialize);
      observer?.disconnect();
      if (ticker) gsap.ticker.remove(ticker);
      if (lenis) {
        if (scrollListener) lenis.off('scroll', scrollListener);
        lenis.destroy();
      }
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, []);

  return children;
}
