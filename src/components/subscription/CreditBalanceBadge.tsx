/**
 * Token Balance Badge Component
 * ------------------------------------------------------------------
 * A small indicator in the application header.
 *
 * It shows what the candidate can spend right now: the tokens on the account,
 * and a way to claim the daily free tokens. The badge itself stays small — the
 * detail lives in the popover — so it never crowds the header on a phone.
 *
 * ONE BADGE, ONE OPINION
 * The balance, the daily reward and the route to the top-up are all here, in
 * one place, reading one state. The platform used to have a balance badge, a
 * separate daily-allowance readout and a separate upgrade call to action, and
 * they could disagree with each other. They cannot disagree now: the daily
 * reward inside the popover is the SAME component the dashboard shows, so the
 * two surfaces read one state and press one button.
 *
 * THE DAILY REWARD IS VISIBLE FROM OUTSIDE
 * When today's tokens have not been claimed yet, the badge carries a small
 * marker. That is the difference between a reward the candidate has to find
 * and a reward the platform points at.
 *
 * THE CHIP WEARS THE PLAN'S COLOUR
 * The tokens belong to a subscription, so the whole chip is painted with that
 * subscription's palette: the plan's surface behind it, the plan's accent for
 * the border, the number and the icon. A free account reads as the free
 * palette, Pro as Pro's, and an ended period as the inactive palette the plan
 * badge already uses — the chip and the tier inside it can no longer be two
 * different colours. The palette itself is not in this file: the custom
 * property names come from `planPresentationFor`, so the dark theme and the
 * high-contrast theme are handled where the colours are defined.
 */

import React, { useState, useSyncExternalStore } from 'react';
import { Sparkles, Plus, ChevronDown } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { DailyTokenClaim } from './DailyTokenClaim';
import { PlanIdentityBadge } from './PlanIdentityBadge';
import { AnimatedCounter } from '../react-bits/AnimatedCounter';
import { getCreditsSnapshot, subscribeCredits } from '../../lib/creditsStore';
import { planPresentationFor } from '../../../shared/planIdentity';

interface CreditBalanceBadgeProps {
  onOpenPricing?: () => void;
}

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({ onOpenPricing }) => {
  const { creditBalance, subscription, settings, t } = useCareer();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // The badge is the surface a candidate looks at right after spending, so it
  // says when the authoritative number is being read again. It never shows a
  // guessed number in the meantime.
  const refreshing = useSyncExternalStore(
    subscribeCredits,
    () => getCreditsSnapshot().refreshing,
    () => false
  );

  const balance = creditBalance?.balance ?? 0;
  const isLow = balance <= 2;
  const daily = creditBalance?.daily ?? null;

  // The daily reward is worth pointing at while it is still available.
  const dailyAvailable = daily !== null && daily.allowance > 0 && !daily.claimedToday;

  // The same resolution the tier badge uses, so the chip is painted from the
  // plan the server sent — including the inactive palette once a period ends.
  const plan = planPresentationFor({
    planCode: subscription?.planCode ?? 'free',
    status: subscription?.status,
    expiresAt: subscription?.expiresAt,
  });

  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors sm:px-3 ${
          refreshing ? 'opacity-80' : ''
        }`}
        style={{
          color: `var(${plan.accentVar})`,
          backgroundColor: `var(${plan.surfaceVar})`,
          borderColor: `color-mix(in srgb, var(${plan.accentVar}) 38%, transparent)`,
        }}
        title={t('Tokens')}
        aria-expanded={dropdownOpen}
        aria-busy={refreshing}
      >
        {/* The subscription identity belongs to the tokens, so it lives in
            the tokens chip rather than beside the language selector. The
            plan is read from the same subscription the rest of the shell
            reads, and a status that has ended is shown as ended. */}
        <PlanIdentityBadge
          planCode={subscription?.planCode ?? 'free'}
          status={subscription?.status}
          expiresAt={subscription?.expiresAt}
          variant="outline"
          size="xs"
          language={settings.language}
          className="shrink-0"
        />
        {/* The divider is the plan's own accent, at the same weight as the
            ring, so it disappears into the chip rather than cutting it. */}
        <span
          className="h-3 w-px shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, var(${plan.accentVar}) 32%, transparent)` }}
          aria-hidden="true"
        />
        <span className="relative">
          {/* A low balance keeps one quiet cue: the icon turns amber. The chip
              itself stays in the plan's colour, because the plan is what the
              chip is about. */}
          <Sparkles
            className={`w-3.5 h-3.5 shrink-0 ${isLow ? 'text-amber-500' : ''}`}
            aria-label={isLow ? t('Low token balance') : undefined}
          />
          {dailyAvailable ? (
            <span
              className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-success-strong)] ring-2 ring-[var(--surface-main)]"
              aria-hidden="true"
            />
          ) : null}
        </span>
        <AnimatedCounter value={balance} duration={0.35} />
        <span className="hidden font-normal opacity-70 sm:inline">{t('Tokens')}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          <div
            className={`absolute z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xl p-4 space-y-3 animate-fadeIn ${
              'end-0'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                {t('Tokens')}
              </span>
              <AnimatedCounter
                value={balance}
                duration={0.35}
                className="text-sm font-extrabold text-[var(--color-primary-text)]"
              />
            </div>

            <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
              <div className="flex justify-between gap-2">
                <span>{t('Monthly Allowance')}:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {creditBalance?.monthlyAllocation ?? 0}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>{t('Used this cycle')}:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {creditBalance?.consumedThisMonth ?? 0}
                </span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span>{t('Plan')}:</span>
                {/* The tier's own identity, drawn from the plan the server
                    resolved. The plan code itself stays out of the way: a
                    candidate reads "Ultra", not "career_plus". */}
                <PlanIdentityBadge
                  planCode={subscription?.planCode ?? 'free'}
                  status={subscription?.status}
                  expiresAt={subscription?.expiresAt}
                  size="xs"
                  language={settings.language}
                />
              </div>
            </div>

            {/* The daily reward lives here and on the dashboard, and both are
                the same component reading the same state. */}
            <DailyTokenClaim variant="compact" />

            {subscription?.status === 'temporary_access' && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{t('Provisional Access Active')}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                if (onOpenPricing) onOpenPricing();
              }}
              className="w-full py-2 px-3 rounded-xl bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-bold hover:bg-[var(--accent-secondary)] shadow-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('Top up tokens')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CreditBalanceBadge;
