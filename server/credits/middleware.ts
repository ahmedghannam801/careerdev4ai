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

export interface CreditReservation {
  profileId: string;
  action: AICreditAction;
  amount: number;
  idempotencyKey: string;
  refunded: boolean;
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
 */
export async function refundAiCreditReservation(
  req: AuthedRequest,
  reason = 'Downstream AI execution error'
): Promise<void> {
  const reservation = req.aiCreditReservation;
  if (!reservation || reservation.refunded) {
    return;
  }

  reservation.refunded = true;
  try {
    const refundKey = `refund_${reservation.idempotencyKey}`;
    await refundAiAction({
      profileId: reservation.profileId,
      amount: reservation.amount,
      reason,
      idempotencyKey: refundKey,
    });
  } catch (err) {
    console.error('Failed to refund AI credits for reservation:', reservation, err);
  }
}

/**
 * Express middleware that checks credit balance, performs atomic pre-deduction,
 * and attaches automatic refund hooks if the route finishes with an error status (5xx/429).
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
      };

      // 4. Hook response finish to auto-refund on server or provider failure
      res.on('finish', () => {
        if ((res.statusCode >= 500 || res.statusCode === 429) && req.aiCreditReservation && !req.aiCreditReservation.refunded) {
          void refundAiCreditReservation(
            req,
            `Automatic refund on HTTP status ${res.statusCode}`
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

