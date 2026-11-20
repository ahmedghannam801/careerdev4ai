import { CountUp } from '../motion/CountUp';

/**
 * The animated number readout.
 *
 * The counting itself lives in `src/components/motion/CountUp.tsx`, which is
 * built on the same `motion` library as the rest of the product's interface.
 * This file keeps the name the screens already import, so nothing else has
 * to change, and there is exactly one implementation of a counting number in
 * the product rather than two that behave almost the same.
 */
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedCounter({ value, duration = 0.6, format, className }: AnimatedCounterProps) {
  return <CountUp value={value} duration={duration} format={format} className={className} />;
}

export default AnimatedCounter;

export { CountUp } from '../motion/CountUp';
