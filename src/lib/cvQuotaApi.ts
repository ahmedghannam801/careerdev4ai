/**
 * The client half of the CV Studio AI edit allowance.
 *
 * The server owns the counter and the rule. This module only asks what is
 * left, so the studio can show the badge and lock the AI buttons before the
 * candidate reaches for one — and so the button that was locked explains
 * itself.
 */

import { apiRequest } from './apiClient';
import type { CvAiQuotaState } from '../../shared/cvAiQuota';

/** The allowance as the server reports it. */
export interface CvAiQuotaPayload {
  limit: number | null;
  used: number;
  remaining: number | null;
  locked: boolean;
  unlimited: boolean;
  resetAt: string | null;
  planCode?: string;
}

/** The code the server sends when the allowance is spent. */
export const CV_AI_EDIT_LIMIT_CODE = 'CV_AI_EDIT_LIMIT_REACHED';

/**
 * Reads the allowance.
 *
 * A failure here is not an error the candidate should see: the studio simply
 * treats the allowance as unknown and leaves the AI buttons alone, because a
 * candidate who cannot be measured must not be locked out of the studio.
 */
export async function fetchCvAiQuota(): Promise<CvAiQuotaState | null> {
  try {
    const payload = await apiRequest<{ success?: boolean; quota?: CvAiQuotaPayload }>(
      '/api/cv/ai-quota'
    );
    const quota = payload?.quota;
    if (!quota) return null;
    return {
      limit: quota.limit ?? null,
      used: quota.used ?? 0,
      remaining: quota.remaining ?? null,
      locked: Boolean(quota.locked),
      unlimited: Boolean(quota.unlimited),
      resetAt: quota.resetAt ?? null,
      planCode: quota.planCode ?? 'free',
    };
  } catch {
    return null;
  }
}
