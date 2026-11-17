import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MembershipPanel } from '../../src/components/subscription/MembershipPanel';
// The shell is read as text rather than rendered: the question here is WHERE
// the membership appears, and a source assertion answers that without
// standing up the whole application.
import shellSource from '../../src/components/layout/AppShell.tsx?raw';

const mocks = vi.hoisted(() => ({
  career: {
    subscription: null as unknown,
    creditBalance: null as unknown,
    settings: { language: 'en' as 'en' | 'ar' },
    t: (value: string) => value,
  },
}));

vi.mock('../../src/context/CareerContext', () => ({ useCareer: () => mocks.career }));

function withPlan(planCode: string, language: 'en' | 'ar' = 'en') {
  mocks.career.settings.language = language;
  mocks.career.subscription = {
    success: true,
    planCode,
    planNameEn: 'Career Pro',
    planNameAr: 'برو مهني',
    status: 'active',
    activeSubscription: null,
    temporaryPaymentId: null,
    expiresAt: null,
    autoRenew: true,
    history: [],
  };
  mocks.career.creditBalance = {
    balance: 7,
    monthlyAllocation: 10,
    consumedThisMonth: 3,
    tier: planCode,
    expiresAt: null,
  };
}

describe('the membership beside the profile', () => {
  it('names the tier the server resolved', () => {
    withPlan('pro');
    render(<MembershipPanel />);

    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('/ 10')).toBeInTheDocument();
  });

  it('carries the tier on the element, so the colour is the tier colour', () => {
    withPlan('career_plus');
    const { container } = render(<MembershipPanel />);

    const panel = container.querySelector('[data-plan-tier]');
    expect(panel?.getAttribute('data-plan-tier')).toBe('ultra');
  });

  it('offers a free candidate the next step up', () => {
    withPlan('free');
    render(<MembershipPanel onManagePlan={() => {}} />);

    expect(screen.getByRole('button', { name: 'Upgrade to Plus' })).toBeInTheDocument();
    expect(screen.getByText('Unlock tailored CVs, detailed ATS analysis and interview practice.')).toBeInTheDocument();
  });

  it('offers a paying candidate the plan page instead', () => {
    withPlan('pro');
    render(<MembershipPanel onManagePlan={() => {}} />);

    expect(screen.getByRole('button', { name: 'Manage plan' })).toBeInTheDocument();
  });

  it('speaks the candidate\'s language', () => {
    withPlan('pro', 'ar');
    render(<MembershipPanel />);

    expect(screen.getByText('برو')).toBeInTheDocument();
  });
});

describe('the membership in the shell', () => {
  const shell = shellSource;

  it('is offered in the account menu', () => {
    expect(shell).toMatch(/<MembershipPanel\s+variant="row"/);
  });

  it('is offered in the mobile drawer', () => {
    const drawer = shell.slice(shell.indexOf('mobileMenuOpen &&'));
    expect(drawer).toMatch(/<MembershipPanel/);
  });

  it('shows the tier beside the name in the sidebar', () => {
    expect(shell).toMatch(/<PlanIdentityBadge[\s\S]{0,320}?language=\{settings\.language\}/);
  });

  it('uses no physical side properties', () => {
    expect(shell).not.toMatch(/\bml-|\bmr-|\bpl-|\bpr-/);
  });
});
