import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreditBalanceBadge } from '../../src/components/subscription/CreditBalanceBadge';

/**
 * The token chip wears the subscription's colour.
 *
 * The chip used to be painted with the interface accent whatever plan the
 * account was on, so a Pro account and a free account looked identical in the
 * header. These tests read the palette name off the rendered chip, which is the
 * one thing that decides its colour, and check it follows the plan the server
 * resolved — including an ended period.
 */

const mocks = vi.hoisted(() => ({
  career: {
    subscription: null as unknown,
    creditBalance: null as unknown,
    settings: { language: 'en' as 'en' | 'ar' },
    t: (value: string) => value,
  },
}));

vi.mock('../../src/context/CareerContext', () => ({ useCareer: () => mocks.career }));

function withSubscription(planCode: string, status = 'active', expiresAt: string | null = null) {
  mocks.career.subscription = {
    success: true,
    planCode,
    planNameEn: planCode,
    planNameAr: planCode,
    status,
    activeSubscription: null,
    temporaryPaymentId: null,
    expiresAt,
    autoRenew: false,
    history: [],
  };
  mocks.career.creditBalance = {
    balance: 12,
    monthlyAllocation: 20,
    consumedThisMonth: 8,
    tier: planCode,
    expiresAt: null,
    daily: null,
  };
}

function chip(): HTMLElement {
  return screen.getByTitle('Tokens');
}

describe('the tokens chip', () => {
  it('is painted with the free palette on a free account', () => {
    withSubscription('free');
    render(<CreditBalanceBadge />);

    expect(chip().style.color).toBe('var(--plan-free-accent)');
    expect(chip().style.backgroundColor).toBe('var(--plan-free-surface)');
  });

  it('follows the paid plan instead of the interface accent', () => {
    withSubscription('pro');
    render(<CreditBalanceBadge />);

    expect(chip().style.color).toBe('var(--plan-pro-accent)');
    expect(chip().style.backgroundColor).toBe('var(--plan-pro-surface)');
    // The border is the same accent, so the chip is one colour rather than two.
    expect(chip().style.borderColor).toContain('var(--plan-pro-accent)');
  });

  it('shows an ended period in the inactive palette', () => {
    withSubscription('pro', 'expired', '2020-01-01T00:00:00.000Z');
    render(<CreditBalanceBadge />);

    expect(chip().style.color).toBe('var(--plan-inactive-accent)');
    expect(chip().style.backgroundColor).toBe('var(--plan-inactive-surface)');
  });

  it('keeps the low-balance cue without leaving the plan colour', () => {
    withSubscription('plus');
    mocks.career.creditBalance = { ...(mocks.career.creditBalance as object), balance: 1 };
    render(<CreditBalanceBadge />);

    expect(chip().style.backgroundColor).toBe('var(--plan-plus-surface)');
    expect(screen.getByLabelText('Low token balance')).toBeTruthy();
  });
});
