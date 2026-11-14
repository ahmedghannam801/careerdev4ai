import { useRef, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

export function MagnetButton({ className = '', onPointerLeave, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const button = useRef<HTMLButtonElement>(null);

  const { contextSafe } = useGSAP(() => {
    if (button.current) gsap.set(button.current, { x: 0, y: 0 });
  }, { scope: button });

  const move = contextSafe((event: PointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    gsap.to(event.currentTarget, {
      x: (event.clientX - rect.left - rect.width / 2) * 0.12,
      y: (event.clientY - rect.top - rect.height / 2) * 0.12,
      duration: 0.25,
      ease: 'power2.out',
    });
  });

  const reset = contextSafe((event: PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(event);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(event.currentTarget, { x: 0, y: 0 });
      return;
    }
    gsap.to(event.currentTarget, { x: 0, y: 0, duration: 0.45, ease: 'elastic.out(1, 0.45)' });
  });

  return (
    <button
      {...props}
      ref={button}
      onPointerMove={move}
      onPointerLeave={reset}
      className={`will-change-transform ${className}`}
    />
  );
}
