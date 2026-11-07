/**
 * The outcome of a checkout.
 * ------------------------------------------------------------------
 * One card, four outcomes, each with its own colour and icon:
 *
 *   pending_verification the evidence was received and a human is checking it
 *   verified             the server confirmed the payment
 *   failed               the payment was rejected, refunded or could not be sent
 *   expired              the request ran out of time
 *
 * A receipt that was uploaded is *evidence for a review*, never proof that
 * money arrived: the card says "under review" unless the server reported a
 * paid status.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, Clock } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';
import type { PaymentStatus } from '../../../shared/payments';
import type { CheckoutState } from './checkoutState';

export interface PaymentStatusCardProps {
  /** The state of the checkout machine. */
  state: CheckoutState;
  /** The status the server reported, when there was one. */
  status: PaymentStatus | null;
  /** Whether a provisional 24-hour access was granted. */
  provisionalGranted: boolean;
  /** The error that caused the failure, when there was one. */
  message?: string | null;
  /** The translation helper. */
  t: (key: string) => string;
}

interface Outcome {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: string;
  iconTone: string;
}

export const PaymentStatusCard: React.FC<PaymentStatusCardProps> = ({
  state,
  status,
  provisionalGranted,
  message,
  t,
}) => {
  const reduced = useReducedMotion() ?? false;

  let outcome: Outcome;

  if (state === 'verified') {
    outcome = {
      icon: <Check className="h-8 w-8" />,
      title: t('Payment received'),
      body: t('Your payment has been confirmed and your subscription is now active.'),
      tone: 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)]',
      iconTone: 'bg-[var(--color-success-surface)] text-[var(--color-success-strong)]',
    };
  } else if (state === 'expired') {
    outcome = {
      icon: <Clock className="h-8 w-8" />,
      title: t('Payment request expired'),
      body: t('This payment request expired before it was completed. Please start a new checkout.'),
      tone: 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]',
      iconTone: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
    };
  } else if (state === 'failed') {
    const refunded = status === 'refunded';
    outcome = {
      icon: <AlertCircle className="h-8 w-8" />,
      title: refunded ? t('Payment refunded') : t('Payment failed'),
      body: refunded
        ? t('The payment was refunded, so nothing was charged for your subscription.')
        : t('The payment could not be confirmed. Nothing was charged — you can try again or contact support.'),
      tone: 'border-[var(--color-danger)]/30 bg-[var(--danger-surface)]',
      iconTone: 'bg-[var(--danger-surface)] text-[var(--color-danger)]',
    };
  } else {
    outcome = {
      icon: <Clock className="h-8 w-8" />,
      title: t('Payment Under Review'),
      body: provisionalGranted
        ? t('Your payment proof has been submitted. A provisional 24-hour access has been unlocked.')
        : t('Your payment evidence has been submitted and is currently being verified by an administrator.'),
      tone: 'border-[var(--color-warning)]/30 bg-[var(--surface-secondary)]',
      iconTone: 'bg-[var(--surface-secondary)] text-[var(--color-warning)]',
    };
  }

  return (
    <motion.div
      className={`rounded-2xl border p-5 text-center ${outcome.tone}`}
      initial={reduced ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0.01 : MOTION_DURATION.micro, ease: MOTION_EASE.out }}
    >
      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
        {state === 'verified' && !reduced && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-[var(--color-success-strong)]"
            initial={{ opacity: 0.5, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <motion.span
          className={`relative flex h-16 w-16 items-center justify-center rounded-full ${outcome.iconTone}`}
          initial={reduced ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: reduced ? 0.01 : 0.32,
            delay: reduced ? 0 : 0.06,
            ease: MOTION_EASE.out,
          }}
        >
          {outcome.icon}
        </motion.span>
      </div>

      <h4 className="text-lg font-bold text-[var(--text-primary)]">{outcome.title}</h4>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
        {outcome.body}
      </p>

      {message ? (
        <p className="mx-auto mt-3 max-w-sm text-xs font-medium text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}

      {state === 'pending_verification' && provisionalGranted && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-success-strong)]">
          <Clock className="h-4 w-4" />
          <span>{t('Provisional Access Active')} (24h)</span>
        </div>
      )}
    </motion.div>
  );
};
