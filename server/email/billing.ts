/**
 * Billing emails for the payment gateway.
 *
 * The webhook handler owns the money: it records the event, records the
 * purchase and grants what was paid for. This module is the notification half,
 * and it runs only after that handler has succeeded. It enqueues one receipt or
 * lifecycle message; it never changes a subscription or a balance.
 *
 * The card rail is XPay, so the only entry point is `enqueueBillingEmail`, which
 * takes plain values and knows nothing about any provider's event shape.
 */

import { formatAmount, sendBillingEmail } from './lifecycle.ts';

export type BillingEmailKind =
  | 'subscription_activated'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'subscription_expired';

/**
 * Provider-agnostic billing email, for XPay and any future gateway.
 *
 * `amountTotal` is in major units (299 for EGP 299), which is what a checkout
 * session and an admin dashboard usually show. It is converted to minor units
 * for the shared formatter here, once, so callers cannot disagree about it.
 *
 * Idempotency is on the gateway session id, so a webhook redelivery never
 * sends the same receipt twice. Without an id, the key falls back to the
 * profile and day; that is still at-most-once per day, but a session id is the
 * reliable choice and should always be supplied when one exists.
 */
export async function enqueueBillingEmail(input: {
  profileId: string;
  kind: BillingEmailKind;
  planCode?: string;
  billingCycle?: string;
  amountTotal?: number;
  currency?: string;
  sessionId?: string;
  periodEnd?: string;
  reason?: string;
}): Promise<boolean> {
  if (!input.profileId) return false;

  const reference = input.sessionId?.trim() || undefined;
  const day = new Date().toISOString().slice(0, 10);
  const idempotencyKey = reference
    ? `billing:${input.kind}:${reference}`
    : `billing:${input.kind}:${input.profileId}:${day}`;

  const amount =
    typeof input.amountTotal === 'number' && Number.isFinite(input.amountTotal)
      ? formatAmount(Math.round(input.amountTotal * 100), input.currency ?? 'EGP')
      : undefined;

  await sendBillingEmail({
    userId: input.profileId,
    template: input.kind,
    idempotencyKey,
    planName: input.planCode,
    billingCycle: input.billingCycle,
    periodEnd: input.periodEnd,
    amount,
    reference,
    reason: input.reason,
  });
  return true;
}
