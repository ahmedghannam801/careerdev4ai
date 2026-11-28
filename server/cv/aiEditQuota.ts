/**
 * The CV Studio AI edit allowance, as the server sees it.
 *
 * THE RULE
 * --------
 * A free account may make three AI-powered edits in the CV Studio in any
 * twenty-four hour window. Every paid plan may make as many as it likes.
 *
 * An EDIT is an AI request that writes: the inline assistant that drafts a
 * summary or a bullet list, and the tailoring that produces a CV aimed at one
 * advertisement. A measurement — the ATS audit — reads the document and
 * reports on it; it is not an edit, and it is already accounted for by the
 * credit system. Typing by hand is never an edit.
 *
 * WHERE THE PLAN IS DECIDED
 * -------------------------
 * The database knows how many edits an account may make. It does not know
 * whether the account is free or paid, because that answer belongs to the
 * subscription system and changes independently of the counter. So the plan
 * is resolved here, and a paid plan never touches the counter at all: it is
 * not recorded, not counted and not limited.
 *
 * THE FAILURE IS GIVEN BACK
 * -------------------------
 * An edit is reserved before the model is called, so two concurrent requests
 * cannot both take the same last edit. When the model then fails, the
 * reservation is released, because a call that produced nothing was never an
 * edit and must not cost the candidate one of their three.
 */

import type { Response } from 'express';
import { getAccessPlanCode } from '../subscriptions/entitlements.ts';
import {
  consumeCvAiEditQuota,
  readCvAiEditQuota,
  releaseCvAiEditQuota,
} from '../db/cvAiQuota.ts';
import type { CvAiQuotaState } from '../../shared/cvAiQuota.ts';
import {
  claimCvAiEditForPlan,
  CvAiQuotaUnavailableError,
  getCvAiQuotaStateForPlan,
  type CvAiEditClaim,
} from '../../shared/cvAiQuotaService.ts';

export { CvAiQuotaUnavailableError } from '../../shared/cvAiQuotaService.ts';
export type { CvAiEditClaim } from '../../shared/cvAiQuotaService.ts';

/** The code the client sees when the allowance is spent. */
export const CV_AI_EDIT_LIMIT_CODE = 'CV_AI_EDIT_LIMIT_REACHED';

/**
 * The allowance for a profile, right now.
 *
 * A paid plan reads as unlimited and never touches the counter. A free
 * account reads the counter as it stands.
 *
 * While the platform is free every account reads the counter the same way:
 * the allowance is a global rate limit, not a paid tier, so it is resolved
 * against the free plan for everybody — including an account that still
 * holds an old subscription.
 */
export async function getCvAiQuotaState(profileId: string): Promise<CvAiQuotaState> {
  let planCode: string;
  try {
    planCode = await getAccessPlanCode(profileId);
  } catch {
    throw new CvAiQuotaUnavailableError();
  }

  return getCvAiQuotaStateForPlan(planCode, () => readCvAiEditQuota(profileId));
}

/**
 * Asks for one AI edit.
 *
 * For a paid plan this always succeeds and reserves nothing. For a free
 * account the database takes the edit out of the allowance, atomically, or
 * refuses and says when the window ends.
 */
export async function claimCvAiEdit(profileId: string): Promise<CvAiEditClaim> {
  let planCode: string;
  try {
    planCode = await getAccessPlanCode(profileId);
  } catch {
    throw new CvAiQuotaUnavailableError();
  }

  return claimCvAiEditForPlan(planCode, () => consumeCvAiEditQuota(profileId));
}

/**
 * Gives an edit back after the model failed.
 *
 * It only gives back an edit that was actually taken, and only for a free
 * account: a paid plan never reserved anything.
 */
export async function refundCvAiEdit(profileId: string): Promise<void> {
  // Callers only invoke this when the claim reports `reserved: true`. A second
  // plan lookup here could fail after the model call and strand the reservation.
  await releaseCvAiEditQuota(profileId);
}

/**
 * The answer the client receives when the allowance is spent.
 *
 * It carries the moment the window ends, so the interface can show a
 * countdown that is true rather than a number nobody checked.
 */
export function cvAiEditLimitResponse(res: Response, state: CvAiQuotaState): Response {
  return res.status(402).json({
    error:
      'You have used all of your AI edits for today. Your allowance comes back when the timer below runs out.',
    code: CV_AI_EDIT_LIMIT_CODE,
    quota: {
      limit: state.limit,
      used: state.used,
      remaining: state.remaining,
      locked: state.locked,
      unlimited: state.unlimited,
      resetAt: state.resetAt,
    },
  });
}
