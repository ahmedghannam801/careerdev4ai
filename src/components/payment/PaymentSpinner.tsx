/**
 * The loading indicator used across the checkout.
 * ------------------------------------------------------------------
 * A single rotating arc, sized by the caller so it never changes the
 * layout of the button it sits in. When the visitor asks for reduced
 * motion the arc stops turning and the surrounding text carries the
 * meaning on its own.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export interface PaymentSpinnerProps {
  /** Size of the arc. */
  className?: string;
}

export const PaymentSpinner: React.FC<PaymentSpinnerProps> = ({ className = 'h-4 w-4' }) => {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.span
      aria-hidden="true"
      className="inline-flex shrink-0"
      animate={reduced ? undefined : { rotate: 360 }}
      transition={
        reduced ? undefined : { duration: 0.9, repeat: Infinity, ease: 'linear' }
      }
    >
      <Loader2 className={className} />
    </motion.span>
  );
};
