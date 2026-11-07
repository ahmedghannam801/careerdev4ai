/**
 * The referral endpoints.
 *
 * Both routes are authenticated: the platform reads and writes referral
 * information on behalf of the signed-in candidate only, and never on behalf
 * of a code that the browser supplies.
 */

import type { Express, Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/require-auth.ts';
import { claimReferral, getReferralSummary } from './service.ts';

export function registerReferralRoutes(app: Express): void {
  /**
   * The caller's own referral code, link and counts.
   */
  app.get('/api/referrals/me', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const summary = await getReferralSummary(req.authUser!.id);
      return res.json({ success: true, ...summary });
    } catch (error) {
      console.error('Failed to read the referral summary:', error);
      return res.status(500).json({ error: 'Failed to retrieve the referral details' });
    }
  });

  /**
   * Attributes a referral to the signed-in candidate.
   *
   * The code is validated on the server, an account can only be attributed
   * once, and the reward is only paid for a verified email.
   */
  app.post('/api/referrals/claim', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const body = (req.body ?? {}) as { code?: unknown };
      const code = typeof body.code === 'string' ? body.code : '';

      if (!code) {
        return res.status(400).json({ error: 'A referral code is required' });
      }

      const result = await claimReferral(req.authUser!.id, code);

      if (!result.success && result.status === 'invalid_code') {
        return res.status(404).json({ error: 'That referral code is not valid' });
      }

      if (!result.success && result.status === 'self_referral') {
        return res.status(400).json({ error: 'A referral cannot point at your own account' });
      }

      return res.json({
        success: result.success,
        status: result.status,
        rewardCredits: result.rewardCredits,
      });
    } catch (error) {
      console.error('Failed to claim the referral:', error);
      return res.status(500).json({ error: 'Failed to claim the referral' });
    }
  });
}
