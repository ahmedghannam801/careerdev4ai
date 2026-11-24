import { describe, expect, it, vi } from 'vitest';

/**
 * A missing table must not cancel a subscription.
 *
 * The XPay tables are the newest on the platform. When the read fails — the
 * migration has not been applied, or PostgREST cannot reach it for a moment —
 * `getUserEffectivePlan` used to fall into its single catch block, which answers
 * `free`. That silently downgraded every paying candidate. The gateway read is
 * isolated now, and these tests hold that line in both directions.
 */

const mocks = vi.hoisted(() => ({
  getActiveXPayAccess: vi.fn(),
  getActiveSubscription: vi.fn(),
}));

vi.mock('../../server/xpay/store.ts', () => ({
  getActiveXPayAccess: mocks.getActiveXPayAccess,
}));

vi.mock('../../server/db/subscriptions.ts', () => ({
  getActiveSubscription: mocks.getActiveSubscription,
}));

const { getUserEffectivePlan } = await import('../../server/subscriptions/entitlements.ts');

describe('the effective plan', () => {
  it('keeps the paid subscription when the gateway tables cannot be read', async () => {
    mocks.getActiveXPayAccess.mockRejectedValue(
      new Error(
        "Failed to read xpay_purchases: Could not find the table 'public.xpay_purchases' in the schema cache"
      )
    );
    mocks.getActiveSubscription.mockResolvedValue({
      status: 'active',
      planCode: 'career_plus',
      currentPeriodEndsAt: '2027-01-01T00:00:00.000Z',
    });

    const plan = await getUserEffectivePlan('11111111-1111-4111-8111-111111111111');

    expect(plan.planCode).toBe('career_plus');
    expect(plan.isTemporary).toBe(false);
    expect(plan.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('still answers free when there is nothing to honour', async () => {
    mocks.getActiveXPayAccess.mockResolvedValue(null);
    mocks.getActiveSubscription.mockResolvedValue(null);

    await expect(getUserEffectivePlan('22222222-2222-4222-8222-222222222222')).resolves.toEqual({
      planCode: 'free',
      isTemporary: false,
    });
  });

  it('prefers a paid XPay period, which is the whole entitlement', async () => {
    mocks.getActiveXPayAccess.mockResolvedValue({
      plan_code: 'pro',
      access_ends_at: '2026-12-01T00:00:00.000Z',
    });
    mocks.getActiveSubscription.mockResolvedValue({
      status: 'active',
      planCode: 'career_plus',
      currentPeriodEndsAt: '2027-01-01T00:00:00.000Z',
    });

    const plan = await getUserEffectivePlan('33333333-3333-4333-8333-333333333333');

    expect(plan.planCode).toBe('pro');
    expect(plan.expiresAt).toBe('2026-12-01T00:00:00.000Z');
  });
});
