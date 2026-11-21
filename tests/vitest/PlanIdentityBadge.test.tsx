import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanIdentityBadge } from '../../src/components/subscription/PlanIdentityBadge';
// The two placements are asserted from source: the question is WHERE the
// identity is drawn, and a source assertion answers that without mounting the
// whole shell and its lazy drawers.
import creditSource from '../../src/components/subscription/CreditBalanceBadge.tsx?raw';
import shellSource from '../../src/components/layout/AppShell.tsx?raw';

const PLANS = [
  { code: 'free', tier: 'free', state: 'free', en: 'Free', ar: 'مجاني', accent: '--plan-free-accent', surface: '--plan-free-surface' },
  { code: 'student', tier: 'plus', state: 'active', en: 'Basic', ar: 'أساسي', accent: '--plan-plus-accent', surface: '--plan-plus-surface' },
  { code: 'pro', tier: 'pro', state: 'active', en: 'Pro', ar: 'برو', accent: '--plan-pro-accent', surface: '--plan-pro-surface' },
  { code: 'career_plus', tier: 'ultra', state: 'active', en: 'Ultra', ar: 'ألترا', accent: '--plan-ultra-accent', surface: '--plan-ultra-surface' },
] as const;

describe('the subscription badge', () => {
  it.each(PLANS)('draws $en in the $en tier colour', ({ code, tier, state, en, accent, surface }) => {
    render(<PlanIdentityBadge planCode={code} status="active" />);

    const badge = screen.getByText(en);
    expect(badge.closest('[data-plan-tier]')?.getAttribute('data-plan-tier')).toBe(tier);
    expect(badge.closest('[data-plan-tier]')?.getAttribute('data-plan-state')).toBe(state);
    expect(badge.closest('[data-plan-tier]')?.getAttribute('style')).toContain(`var(${accent})`);
    expect(badge.closest('[data-plan-tier]')?.getAttribute('style')).toContain(`var(${surface})`);
  });

  it.each(PLANS)('speaks $ar in Arabic', ({ code, ar }) => {
    render(<PlanIdentityBadge planCode={code} status="active" language="ar" />);
    expect(screen.getByText(ar)).toBeInTheDocument();
  });

  it('shows an expired subscription as expired rather than as a paid plan', () => {
    render(
      <PlanIdentityBadge
        planCode="career_plus"
        status="active"
        expiresAt={new Date(Date.now() - 86_400_000).toISOString()}
      />
    );

    const badge = screen.getByText('Expired').closest('[data-plan-tier]');
    expect(badge?.getAttribute('data-plan-state')).toBe('expired');
    expect(badge?.getAttribute('data-plan-tier')).toBe('ultra');
    expect(badge?.getAttribute('style')).toContain('var(--plan-inactive-accent)');
  });

  it('does not animate the badge', () => {
    render(<PlanIdentityBadge planCode="pro" status="active" />);
    expect(screen.getByText('Pro').closest('[data-plan-tier]')?.className).not.toMatch(/animate/);
  });
});

describe('the two badge placements', () => {
  it('draws the identity inside the tokens control', () => {
    expect(creditSource).toMatch(/<PlanIdentityBadge[\s\S]{0,420}?status=\{subscription\?\.status\}[\s\S]{0,420}?expiresAt=\{subscription\?\.expiresAt\}/);
  });

  it('no longer draws a standalone badge beside the language selector', () => {
    const header = shellSource.slice(
      shellSource.indexOf('Top Actions'),
      shellSource.indexOf('<CreditBalanceBadge'),
    );
    expect(header).not.toMatch(/<PlanIdentityBadge/);
  });

  it('draws the same subscription beside the profile name', () => {
    const sidebar = shellSource.slice(shellSource.indexOf('User mini profile card'));
    expect(sidebar).toMatch(/<PlanIdentityBadge[\s\S]{0,420}?planCode=\{subscription\?\.planCode \?\? 'free'\}[\s\S]{0,420}?status=\{subscription\?\.status\}[\s\S]{0,420}?expiresAt=\{subscription\?\.expiresAt\}/);
  });
});
