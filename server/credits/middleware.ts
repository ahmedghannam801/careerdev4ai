/**
 * Express Middleware for AI Credits Enforcement & Auto-Refund.
 * Enforces pre-execution atomic deduction and protects users from credit loss on model failure.
 */

import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from '../auth/require-auth.ts';
import {
  type AICreditAction,
  CREDIT_WEIGHTS,
} from '../../shared/credits.ts';
import {
  canPerformAiAction,
  chargeAiAction,
  refundAiAction,
} from './service.ts';
import { recordAiCreditFailure } from '../db/credits.ts';

export interface CreditReservation {
  profileId: string;
  action: AICreditAction;
  amount: number;
  idempotencyKey: string;
  refunded: boolean;
  /**
   * The balance the ledger held immediately after the reservation was taken.
   * The route hands it back to the candidate, so the number on the screen is
   * the number the ledger holds and not the one from before the operation.
   */
  remainingBalance: number;
}

declare global {
  namespace Express {
    interface Request {
      aiCreditReservation?: CreditReservation;
    }
  }
}

/**
 * Explicitly triggers a refund for the credit reservation on this request.
 * Safe to call multiple times (idempotent via reservation.refunded guard).
 *
 * Returns the balance the ledger holds after the refund, so a route that
 * gives a credit back can tell the candidate what they have left.
 */
export async function refundAiCreditReservation(
  req: AuthedRequest,
  reason = 'Downstream AI execution error'
): Promise<{ refunded: boolean; newBalance: number }> {
  const reservation = req.aiCreditReservation;
  if (!reservation || reservation.refunded) {
    return {
      refunded: false,
      newBalance: reservation?.remainingBalance ?? 0,
    };
  }

  reservation.refunded = true;
  try {
    const refundKey = `refund_${reservation.idempotencyKey}`;
    const outcome = await refundAiAction({
      profileId: reservation.profileId,
      amount: reservation.amount,
      reason,
      idempotencyKey: refundKey,
    });
    reservation.remainingBalance = outcome.newBalance;

    // The attempt is written down as well as undone. An administrator needs
    // to see which operation failed and why, not only that the credits came
    // back.
    await recordAiCreditFailure({
      profileId: reservation.profileId,
      action: reservation.action,
      creditsAttempted: reservation.amount,
      refunded: true,
      reason,
    });

    return { refunded: true, newBalance: outcome.newBalance };
  } catch (err) {
    console.error('Failed to refund AI credits for reservation:', reservation, err);
    await recordAiCreditFailure({
      profileId: reservation.profileId,
      action: reservation.action,
      creditsAttempted: reservation.amount,
      refunded: false,
      reason: `The refund itself failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { refunded: false, newBalance: reservation.remainingBalance };
  }
}

/**
 * Express middleware that checks credit balance, performs atomic pre-deduction,
 * and gives the credit back if the route does not succeed.
 *
 * A credit is spent on a result, not on an attempt: any response that is not
 * a success returns the reservation, whether the request was refused by
 * validation, failed, timed out or was rejected by the model.
 */
export function requireCredits(action: AICreditAction) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const profileId = req.authUser?.id;
    if (!profileId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const required = CREDIT_WEIGHTS[action] ?? 1;

    try {
      // 1. Verify availability and grant trial credits if eligible
      const check = await canPerformAiAction(profileId, action);
      if (!check.allowed) {
        return res.status(402).json({
          error: `Insufficient AI credits for this action. Required: ${required}, Available: ${check.balance}`,
          code: 'INSUFFICIENT_CREDITS',
          requiredCredits: required,
          currentBalance: check.balance,
          action,
        });
      }

      // 2. Perform atomic pre-deduction via stored procedure
      const idempotencyKey = `ai_req_${profileId}_${action}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const chargeResult = await chargeAiAction({
        profileId,
        action,
        idempotencyKey,
        metadata: {
          path: req.originalUrl || req.path,
          method: req.method,
          ip: req.ip,
        },
      });

      if (!chargeResult.success) {
        return res.status(402).json({
          error: chargeResult.error || 'Failed to reserve AI credits for this operation',
          code: 'INSUFFICIENT_CREDITS',
          requiredCredits: required,
          currentBalance: chargeResult.remainingBalance,
          action,
        });
      }

      // 3. Attach reservation to request
      req.aiCreditReservation = {
        profileId,
        action,
        amount: required,
        idempotencyKey,
        refunded: false,
        remainingBalance: chargeResult.remainingBalance,
      };

      // 4. Hook response finish to auto-refund when the request did not
      //    succeed.
      //
      //    A credit is spent on a RESULT, not on an attempt. A request that
      //    was refused by validation, that failed, that timed out or that was
      //    rejected by the provider produced nothing for the candidate, so the
      //    reservation is given back. Only a successful request keeps it.
      //
      //    The 402 case never reaches this hook: a request that could not be
      //    charged returns before a reservation exists, so there is nothing to
      //    give back.
      res.on('finish', () => {
        if (res.statusCode >= 400 && req.aiCreditReservation && !req.aiCreditReservation.refunded) {
          void refundAiCreditReservation(
            req,
            `Automatic refund: the request failed with HTTP status ${res.statusCode}`
          );
        }
      });

      return next();
    } catch (error) {
      console.error(`Credits middleware error for action ${action}:`, error);
      return res.status(500).json({ error: 'Failed to process AI credits authorization' });
    }
  };
}

