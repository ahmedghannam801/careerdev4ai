/**
 * A selectable payment method.
 * ------------------------------------------------------------------
 * The card shows the *authentic* mark of the rail next to the name of the
 * method, so a customer can recognise the brand they are about to pay with.
 * The mark is decorative — the name is what a screen reader announces — and
 * the option itself is a real button with `aria-pressed`.
 *
 * The selection is animated with a shared layout element, so the highlight
 * travels from one method to the next instead of blinking, and it collapses
 * to an instant change when the visitor asks for reduced motion.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';

export interface PaymentMethodCardProps {
  /** The brand mark of the rail. */
  mark: React.ReactNode;
  /** The translated name of the method. */
  title: string;
  /** A short secondary line (the local brand name, or the card networks). */
  subtitle?: React.ReactNode;
  /** Whether this method is the selected one. */
  selected: boolean;
  /** Called when the customer picks this method. */
  onSelect: () => void;
  /** Disables the option. */
  disabled?: boolean;
}

export const PaymentMethodCard: React.FC<PaymentMethodCardProps> = ({
  mark,
  title,
  subtitle,
  selected,
  onSelect,
  disabled = false,
}) => {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative isolate flex w-full flex-col items-start gap-2.5 overflow-hidden rounded-2xl border p-3 text-start transition-[border-color,box-shadow,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-secondary)]'
      }`}
      whileHover={reduced || disabled ? undefined : { y: -2 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: MOTION_DURATION.ui, ease: MOTION_EASE.out }}
    >
      {selected && (
        <motion.span
          aria-hidden="true"
          layoutId="checkout-method-highlight"
          className="pointer-events-none absolute inset-0 bg-[var(--accent-primary)]/10"
          transition={{
            duration: reduced ? 0.01 : MOTION_DURATION.micro,
            ease: MOTION_EASE.out,
          }}
        />
      )}

      {/* The tick sits in the corner of the card, so the name of the method
          gets the whole width of the card under its mark. */}
      <span
        aria-hidden="true"
        className={`absolute end-3 top-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          selected
            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
            : 'border-[var(--border-subtle)]'
        }`}
      >
        {selected && (
          <motion.span
            layoutId="checkout-method-check"
            initial={reduced ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0.01 : MOTION_DURATION.ui,
              ease: MOTION_EASE.out,
            }}
            className="inline-flex"
          >
            <Check className="h-3 w-3" />
          </motion.span>
        )}
      </span>

      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)]">
        {mark}
      </span>

      {/* The name of the method is on its own line under the mark, because a
          three-column grid is not wide enough to hold a mark, a radio and a
          brand name side by side — and a brand name that is cut in half is
          the one thing the customer needs to read. */}
      <span className="relative block w-full min-w-0">
        <span className="block text-sm font-bold leading-tight text-[var(--text-primary)] break-words">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-[11px] font-medium leading-tight text-[var(--text-muted)] break-words">
            {subtitle}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
};
