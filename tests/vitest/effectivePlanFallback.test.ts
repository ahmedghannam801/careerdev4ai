import { describe, expect, it, vi } from 'vitest';

/**
 * The effective plan, while the platform is free.
 *
 * WHAT THIS USED TO PROVE
 * -----------------------
 * The gateway tables are the newest on the platform. When the read fails — the
 * migration has not been applied, or PostgREST cannot reach it for a moment —
 * `getUserEffectivePlan` used to fall into its single catch block, which
 * answers `free`. That silently downgraded every paying candidate. The gateway
 * read was isolated so that one failed lookup could not take a subscription
 * down with it.
 *
 * WHAT IT PROVES NOW
 * ------------------
 * The platform is free, so the question has changed. An allowance must never
 * be derived from a payment record: the payment tables are history, and a
 * history must not decide what an account may do.
 *
 * The two rules below are the same rule seen from both sides:
 *
 *   1. the effective plan is `free` for every account, and
 *   2. resolving it reads NOTHING — not the gateway tables, not the
 *      subscription table.
 *
 * The second rule is the one that matters: a free platform that still reads
 * the payment tables on every quota check is a free platform with a payment
 * system's finger on the switch.
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

const { getUserEffectivePlan, getAccessPlanCode } = await import(
  '../../server/subscriptions/entitlements.ts'
);

describe('the effective plan', () => {
  it('is the free plan for every account, whatever the subscription tables say', async () => {
    mocks.getActiveXPayAccess.mockResolvedValue({
      plan_code: 'pro',
      access_ends_at: '2026-12-01T00:00:00.000Z',
    });
    mocks.getActiveSubscription.mockResolvedValue({
      status: 'active',
      planCode: 'career_plus',
      currentPeriodEndsAt: '2027-01-01T00:00:00.000Z',
    });

    await expect(getUserEffectivePlan('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      planCode: 'free',
      isTemporary: false,
    });
  });

  it('never reads the payment tables to answer it', async () => {
    mocks.getActiveXPayAccess.mockClear();
    mocks.getActiveSubscription.mockClear();

    await getUserEffectivePlan('22222222-2222-4222-8222-222222222222');

    expect(mocks.getActiveXPayAccess).not.toHaveBeenCalled();
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });

  it('resolves the allowance against the free plan, so nobody gets a larger one', async () => {
    mocks.getActiveXPayAccess.mockResolvedValue({
      plan_code: 'career_plus',
      access_ends_at: '2027-01-01T00:00:00.000Z',
    });
    mocks.getActiveSubscription.mockResolvedValue({
      status: 'active',
      planCode: 'career_plus',
      currentPeriodEndsAt: '2027-01-01T00:00:00.000Z',
    });

    await expect(getAccessPlanCode('33333333-3333-4333-8333-333333333333')).resolves.toBe('free');
  });
});
