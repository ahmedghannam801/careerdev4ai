import { useRef, type PointerEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
};

export function SpotlightCard({ children, className = '' }: SpotlightCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP({ scope: card });

  const moveSpotlight = contextSafe((event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = `${event.clientX - rect.left}px`;
    const y = `${event.clientY - rect.top}px`;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.currentTarget.style.setProperty('--spotlight-x', x);
      event.currentTarget.style.setProperty('--spotlight-y', y);
      return;
    }
    gsap.to(event.currentTarget, {
      '--spotlight-x': x,
      '--spotlight-y': y,
      duration: 0.25,
      ease: 'power2.out',
    });
  });

  return (
    <div
      ref={card}
      onPointerMove={moveSpotlight}
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(360px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), rgb(99 102 241 / 0.12), transparent 72%)',
      }}
    >
      {children}
    </div>
  );
}
