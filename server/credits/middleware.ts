/**
 * Express Middleware for AI Credits Enforcement & Auto-Refund.
 *
 * Three rules shape this file, and every one of them exists because a
 * candidate was losing tokens they never spent:
 *
 *   1. A credit is spent on a RESULT, not on an attempt. A request that never
 *      reached a model, or that failed, gives the reservation back.
 *   2. The same request is charged ONCE. A double-click, a React re-render or
 *      a retried request replays the same ledger key instead of taking a
 *      second credit.
 *   3. A credit is only kept when the route says a real AI completion
 *      happened. `markAiCreditCompleted` is the only way to keep it, so a
 *      route that returns a cached, deterministic or fallback answer cannot
 *      silently spend a token.
 */

import { createHash } from 'node:crypto';
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
import { getCreditBalance, recordAiCreditFailure } from '../db/credits.ts';

export interface CreditReservation {
  profileId: string;
  action: AICreditAction;
  amount: number;
  idempotencyKey: string;
  refunded: boolean;
  /**
   * Whether THIS request actually took a credit.
   *
   * A replayed request (the ledger already held the key) took nothing, so it
   * must never refund: the credit it would return belongs to the original
   * request, which may well have succeeded.
   */
  charged: boolean;
  /**
   * Whether a real AI completion was produced for this request.
   *
   * The credit is only kept when this is true. It is set by
   * `markAiCreditCompleted`, which the route calls once the model has
   * answered with a result it accepts.
   */
  aiCompleted: boolean;
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
 * How long two identical requests are treated as the same request.
 *
 * Inside this window the ledger key is identical, so the second request is a
 * replay: the provider's own in-flight de-duplication coalesces the model
 * calls and the candidate is charged once.
 *
 * Five minutes is long enough to absorb a double-click, a React re-render, a
 * flaky-network retry and a tab that was left open, and short enough that a
 * candidate who deliberately asks for the very same thing again later is
 * still charged for it.
 */
export const CREDIT_DEDUPE_WINDOW_MS = 5 * 60_000;

/**
 * Orders the keys of a JSON value so that two structurally identical bodies
 * always produce the same fingerprint, whatever order the browser wrote them
 * in.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      result[key] = canonicalize(source[key]);
    }
    return result;
  }
  return value;
}

/**
 * A stable fingerprint of the request body.
 *
 * The fingerprint is what makes a duplicate recognisable as a duplicate. It
 * is derived from the content, so an identical request produces an identical
 * ledger key and the database replays it instead of charging again.
 */
export function requestFingerprint(body: unknown): string {
  try {
    const serialized = JSON.stringify(canonicalize(body ?? {}));
    return createHash('sha256').update(serialized).digest('hex').slice(0, 32);
  } catch {
    // A body that cannot be serialised cannot be fingerprinted. The request is
    // still served; it simply falls back to a per-request key.
    return `unfingerprintable-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Records that this request produced a real AI result.
 *
 * The route calls this once the model has answered with something the route
 * accepts. Until it is called, the reservation is given back when the response
 * finishes, so a request that answered with a cached, deterministic or
 * fallback result costs the candidate nothing.
 */
export function markAiCreditCompleted(req: AuthedRequest): void {
  if (req.aiCreditReservation) {
    req.aiCreditReservation.aiCompleted = true;
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

  // A replayed request never took a credit, so there is nothing to give back.
  // Refunding it would return a credit that the original request spent.
  if (!reservation.charged) {
    reservation.refunded = true;
    return {
      refunded: false,
      newBalance: reservation.remainingBalance,
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
      //
      //    The ledger key is derived from the CONTENT of the request, not from
      //    a random value. Two identical requests therefore carry the same
      //    key, and the database replays the second one instead of taking a
      //    second credit. A double-click, a React re-render and a retried
      //    request are all the same request as far as the ledger is concerned.
      //
      //    The time bucket keeps the window bounded: the very same request
      //    asked for again much later is a new request and is charged again.
      const fingerprint = requestFingerprint(req.body);
      const bucket = Math.floor(Date.now() / CREDIT_DEDUPE_WINDOW_MS);
      const idempotencyKey = `ai_req_${profileId}_${action}_${fingerprint}_${bucket}`;

      const chargeResult = await chargeAiAction({
        profileId,
        action,
        idempotencyKey,
        metadata: {
          path: req.originalUrl || req.path,
          method: req.method,
          ip: req.ip,
          fingerprint,
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

      // A replayed key means the ledger already paid for this exact request.
      // The balance the ledger returned belongs to the original charge and may
      // be stale, so the live balance is read instead.
      const remainingBalance = chargeResult.idempotentReplay
        ? (await getCreditBalance(profileId)).balance
        : chargeResult.remainingBalance;

      // 3. Attach reservation to request
      req.aiCreditReservation = {
        profileId,
        action,
        amount: required,
        idempotencyKey,
        refunded: false,
        charged: !chargeResult.idempotentReplay,
        aiCompleted: false,
        remainingBalance,
      };

      // 4. Settle the reservation when the response is finalised.
      //
      //    A credit is spent on a RESULT, not on an attempt. A request that
      //    was refused by validation, that failed, that timed out or that was
      //    rejected by the provider produced nothing for the candidate, so the
      //    reservation is given back. Only a successful request keeps it.
      //
      //    A successful request keeps it only when the route confirmed that a
      //    real AI completion happened. A route that answered from a cache, or
      //    from its own deterministic fallback, costs the candidate nothing.
      //
      //    The settlement is attached to the END of the response rather than
      //    to the response's 'finish' event, because that event is not
      //    emitted by every runtime this application runs on: under the
      //    Cloudflare Pages worker's node:http bridge the request was
      //    answered with the credit already spent and no refund, which is
      //    exactly the failure this replaces.
      //
      //    When a refund IS needed it is awaited before the response is
      //    written, so the balance the candidate reads is the balance the
      //    ledger holds, and so the refund cannot be lost if the worker's
      //    isolate is torn down as soon as the response goes out.
      const settle = (): Promise<unknown> | null => {
        const reservation = req.aiCreditReservation;
        if (!reservation || reservation.refunded) return null;

        const failed = res.statusCode >= 400;
        const producedNoResult = !reservation.aiCompleted;
        if (!failed && !producedNoResult) return null;

        const reason = failed
          ? `Automatic refund: the request failed with HTTP status ${res.statusCode}`
          : 'Automatic refund: the request finished without producing an AI result.';

        return refundAiCreditReservation(req, reason);
      };

      const originalEnd = res.end;
      res.end = function patchedEnd(this: Response, ...args: unknown[]) {
        const send = () =>
          (originalEnd as (...rest: unknown[]) => unknown).apply(this, args);

        const settlement = settle();
        if (!settlement) return send();

        return Promise.resolve(settlement).then(send);
      } as typeof res.end;

      return next();
    } catch (error) {
      console.error(`Credits middleware error for action ${action}:`, error);
      return res.status(500).json({ error: 'Failed to process AI credits authorization' });
    }
  };
}
