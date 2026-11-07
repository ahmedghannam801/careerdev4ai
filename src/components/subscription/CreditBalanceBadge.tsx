/**
 * Credit Balance Badge Component
 * ------------------------------------------------------------------
 * A small indicator in the application header.
 *
 * It shows what the candidate can spend right now: the credits on the
 * account, the daily free allowance that comes back at midnight, and when
 * that allowance is next granted. The badge itself stays small — the detail
 * lives in the popover — so it never crowds the header on a phone.
 *
 * Every colour is a theme variable, so the badge reads the same in the light
 * and in the dark theme.
 */

import React, { useState } from 'react';
import { Sparkles, Plus, ChevronDown, Clock } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface CreditBalanceBadgeProps {
  onOpenPricing?: () => void;
}

/**
 * Formats the moment the daily allowance is granted again, in the reader's
 * own language and time zone.
 */
const formatReset = (value: string, locale: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({ onOpenPricing }) => {
  const { creditBalance, subscription, t, settings } = useCareer();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isAr = settings.language === 'ar';
  const locale = isAr ? 'ar-EG' : 'en-GB';

  const balance = creditBalance?.balance ?? 0;
  const isLow = balance <= 2;
  const daily = creditBalance?.daily ?? null;

  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all sm:px-3 ${isLow
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            : 'bg-[var(--accent-surface)] border-[var(--accent-primary)]/25 text-[var(--color-primary-text)] hover:bg-[var(--accent-primary)]/10'
          }`}
        title={t('AI Credits')}
        aria-expanded={dropdownOpen}
      >
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span>{balance}</span>
        <span className="hidden sm:inline font-normal text-[var(--text-muted)]">{t('Credits')}</span>
        {daily ? (
          <span
            className="hidden sm:inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
            title={t('Daily free credit allowance')}
          >
            <Clock className="h-3 w-3" />
            {daily.remaining}/{daily.allowance}
          </span>
        ) : null}
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
      </button>

      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          <div
            className={`absolute z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xl p-4 space-y-3 animate-fadeIn ${isAr ? 'left-0' : 'right-0'
              }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                {t('AI Credits')}
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

            {daily ? (
              <div className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-muted)]">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <Clock className="h-3.5 w-3.5" />
                  {t('Daily allowance')}
                </div>
                <div className="flex justify-between gap-2">
                  <span>{t('Remaining today')}:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {daily.remaining} / {daily.allowance}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{t('Next reset')}:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatReset(daily.resetAt, locale)}
                  </span>
                </div>
              </div>
            ) : null}

            {subscription?.status === 'temporary_access' && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0" />
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
              <span>{t('Top up credits')} / {t('Upgrade Now')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CreditBalanceBadge;
