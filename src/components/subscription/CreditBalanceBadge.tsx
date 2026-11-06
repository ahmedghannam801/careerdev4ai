/**
 * Credit Balance Badge Component
 * Real-time credit display pill in application header with usage breakdown and quick top-up action.
 */

import React, { useState } from 'react';
import { Sparkles, Plus, ChevronDown, Clock } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface CreditBalanceBadgeProps {
  onOpenPricing?: () => void;
}

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({ onOpenPricing }) => {
  const { creditBalance, subscription, t, settings } = useCareer();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isAr = settings.language === 'ar';

  const balance = creditBalance?.balance ?? 0;
  const isLow = balance <= 2;

  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${isLow
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            : 'bg-primary/10 border-primary/25 text-primary hover:bg-primary/20'
          }`}
        title={t('AI Credits')}
        aria-expanded={dropdownOpen}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>{balance}</span>
        <span className="hidden sm:inline font-normal text-muted">{t('Credits')}</span>
        <ChevronDown className="w-3 h-3 text-muted" />
      </button>

      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          <div
            className={`absolute z-50 mt-2 w-64 rounded-2xl bg-surface border border-border shadow-xl p-4 space-y-3 animate-fadeIn ${isAr ? 'left-0' : 'right-0'
              }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {t('AI Credits')}
              </span>
              <span className="text-sm font-extrabold text-primary">{balance}</span>
            </div>

            <div className="space-y-1.5 text-xs text-muted">
              <div className="flex justify-between">
                <span>{t('Monthly Allowance')}:</span>
                <span className="font-semibold text-foreground">
                  {creditBalance?.monthlyAllocation ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t('Used this cycle')}:</span>
                <span className="font-semibold text-foreground">
                  {creditBalance?.consumedThisMonth ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t('Plan')}:</span>
                <span className="font-semibold text-primary capitalize">
                  {subscription?.planCode ?? 'free'}
                </span>
              </div>
            </div>

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
              className="w-full py-2 px-3 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover shadow-sm flex items-center justify-center gap-1.5 transition-colors"
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
