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
 * Every colour is a theme variable, so the badge reads the same in the light
 * and in the dark theme.
 */

import React, { useState } from 'react';
import { Sparkles, Plus, ChevronDown } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { DailyTokenClaim } from './DailyTokenClaim';

interface CreditBalanceBadgeProps {
  onOpenPricing?: () => void;
}

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({ onOpenPricing }) => {
  const { creditBalance, subscription, t } = useCareer();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const balance = creditBalance?.balance ?? 0;
  const isLow = balance <= 2;
  const daily = creditBalance?.daily ?? null;

  // The daily reward is worth pointing at while it is still available.
  const dailyAvailable = daily !== null && daily.allowance > 0 && !daily.claimedToday;

  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all sm:px-3 ${isLow
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            : 'bg-[var(--accent-surface)] border-[var(--accent-primary)]/25 text-[var(--color-primary-text)] hover:bg-[var(--accent-primary)]/10'
          }`}
        title={t('Tokens')}
        aria-expanded={dropdownOpen}
      >
        <span className="relative">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          {dailyAvailable ? (
            <span
              className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-success-strong)] ring-2 ring-[var(--surface-main)]"
              aria-hidden="true"
            />
          ) : null}
        </span>
        <span>{balance}</span>
        <span className="hidden sm:inline font-normal text-[var(--text-muted)]">{t('Tokens')}</span>
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
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
              <span className="text-sm font-extrabold text-[var(--color-primary-text)]">{balance}</span>
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
              <div className="flex justify-between gap-2">
                <span>{t('Plan')}:</span>
                <span className="font-semibold text-[var(--color-primary-text)] capitalize">
                  {subscription?.planCode ?? 'free'}
                </span>
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
