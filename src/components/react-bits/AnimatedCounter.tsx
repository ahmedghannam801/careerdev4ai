import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReducedMotion } from 'motion/react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedCounter({ value, duration = 0.6, format, className }: AnimatedCounterProps) {
  const output = useRef<HTMLSpanElement>(null);
  const formatter = useRef(format);
  formatter.current = format;
  const prefersReducedMotion = useReducedMotion() ?? false;

  useGSAP(() => {
    if (!output.current) return;
    const render = (current: number) => {
      if (output.current) output.current.textContent = formatter.current ? formatter.current(current) : String(Math.round(current));
    };
    if (prefersReducedMotion) {
      render(value);
      return;
    }
    const counter = { current: 0 };
    gsap.to(counter, {
      current: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => render(counter.current),
    });
  }, { dependencies: [value, duration, prefersReducedMotion], revertOnUpdate: true });

  return <span ref={output} className={className} aria-live="polite" />;
}

export default AnimatedCounter;

export { CountUp } from '../motion/CountUp';
