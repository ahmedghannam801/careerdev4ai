/**
 * The checkout state machine.
 * ------------------------------------------------------------------
 * One explicit state, one mapping function, no loose step strings.
 *
 * The screen the customer sees is a consequence of this state, so the
 * interface can never show one screen while the code believes it is on
 * another. The modal owns the state; this module owns its vocabulary.
 *
 *   idle              the modal is open, no method has been chosen yet
 *   method_selected   a payment method has been chosen
 *   instructions      the transfer details are on screen
 *   awaiting_submission the evidence form is open, waiting for the customer
 *   processing        the evidence is being submitted right now
 *   pending_verification the evidence was accepted and is under review
 *   verified          the server confirmed the payment
 *   failed            the payment was rejected, refunded or could not be sent
 *   expired           the payment request expired before it was completed
 */

import type { PaymentStatus } from '../../../shared/payments';

export type CheckoutState =
  | 'idle'
  | 'method_selected'
  | 'instructions'
  | 'awaiting_submission'
  | 'processing'
  | 'pending_verification'
  | 'verified'
  | 'failed'
  | 'expired';

/** The states that show the method picker. */
export const isMethodStep = (state: CheckoutState): boolean =>
  state === 'idle' || state === 'method_selected';

/** True while a submission is in flight. */
export const isProcessing = (state: CheckoutState): boolean => state === 'processing';

/** The states the flow can no longer leave on its own. */
export const isTerminal = (state: CheckoutState): boolean =>
  state === 'verified' || state === 'failed' || state === 'expired';

/**
 * Maps a server payment status onto the checkout state machine.
 *
 * `pending` means the request exists but no evidence has been submitted
 * yet, which is the instructions screen — not a terminal state.
 */
export function mapPaymentStatus(status: PaymentStatus): CheckoutState {
  switch (status) {
    case 'pending':
      return 'instructions';
    case 'under_review':
    case 'temporary_access':
      return 'pending_verification';
    case 'paid':
      return 'verified';
    case 'rejected':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'refunded':
      return 'failed';
    default:
      return 'instructions';
  }
}
