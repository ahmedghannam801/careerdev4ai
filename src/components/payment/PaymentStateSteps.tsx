/**
 * The checkout progress indicator.
 * ------------------------------------------------------------------
 * Four phases — method, instructions, evidence, verification — that mirror
 * the checkout state machine. The customer always knows which phase they
 * are in and how many are left, and the connector between two phases
 * changes colour as the flow advances.
 *
 * The progress is announced to assistive technology as a list, so the
 * phases can be read in order.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';
import type { CheckoutState } from './checkoutState';

export interface PaymentStateStepsProps {
  /** The current state of the checkout machine. */
  state: CheckoutState;
  /** The translation helper. */
  t: (key: string) => string;
}

interface PhaseDefinition {
  id: string;
  label: string;
}

/** The index of the phase the checkout is currently in. */
function activePhase(state: CheckoutState): number {
  switch (state) {
    case 'idle':
    case 'method_selected':
      return 0;
    case 'instructions':
      return 1;
    case 'awaiting_submission':
    case 'processing':
      return 2;
    default:
      return 3;
  }
}

export const PaymentStateSteps: React.FC<PaymentStateStepsProps> = ({ state, t }) => {
  const reduced = useReducedMotion() ?? false;
  const current = activePhase(state);

  const phases: PhaseDefinition[] = [
    { id: 'method', label: t('Method') },
    { id: 'instructions', label: t('Instructions') },
    { id: 'evidence', label: t('Evidence') },
    { id: 'verification', label: t('Verification') },
  ];

  return (
    <ol className="flex items-center" aria-label={t('Checkout progress')}>
      {phases.map((phase, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <React.Fragment key={phase.id}>
            <li
              className="flex min-w-0 items-center gap-1.5"
              aria-current={active ? 'step' : undefined}
            >
              <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                {active && !reduced && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-[var(--accent-primary)]"
                    initial={{ opacity: 0.55, scale: 0.85 }}
                    animate={{ opacity: 0, scale: 1.7 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <span
                  className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-200 ${
                    done || active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : index + 1}
                </span>
              </span>
              <span
                className={`truncate text-[11px] font-semibold transition-colors duration-200 ${
                  active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {phase.label}
              </span>
            </li>

            {index < phases.length - 1 && (
              <span aria-hidden="true" className="relative mx-1.5 h-px min-w-3 flex-1 bg-[var(--border-subtle)]">
                <motion.span
                  className="absolute inset-0 bg-[var(--accent-primary)]"
                  initial={false}
                  animate={{ opacity: index < current ? 1 : 0 }}
                  transition={{
                    duration: reduced ? 0.01 : MOTION_DURATION.micro,
                    ease: MOTION_EASE.out,
                  }}
                />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
};
