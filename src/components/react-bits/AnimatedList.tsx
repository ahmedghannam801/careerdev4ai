import { Children, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

export function AnimatedList({ children, className = '' }: { children: ReactNode; className?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const childCount = Children.count(children);

  useGSAP(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = list.current?.children;
    if (!items?.length) return;
    // The whole reveal is bounded to about half a second. A fixed 50ms step
    // is right for eight cards and turns into a four-second crawl for the
    // eighty a live job search can return, which reads as a slow page rather
    // than as a reveal.
    const stagger = Math.min(0.05, 0.5 / Math.max(1, items.length));
    gsap.fromTo(items, { autoAlpha: 0, y: 12 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.35,
      stagger,
      ease: 'power2.out',
    });
  }, { scope: list, dependencies: [childCount], revertOnUpdate: true });

  return <div ref={list} className={className}>{children}</div>;
}
