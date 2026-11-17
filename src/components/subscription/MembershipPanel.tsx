/**
 * The membership, shown as part of the profile.
 *
 * A candidate who has paid for something should be able to see, in one
 * glance and in the place where they look at themselves, what they are on and
 * what they have left. A candidate who is on the free plan should see the
 * same shape, with a clear way forward, rather than a page of pricing that
 * has to be found.
 *
 * WHAT THIS COMPONENT IS NOT
 * It changes nothing. It reads the plan the server resolved and the credit
 * balance the platform published, and it draws them. The pricing, the
 * entitlements, the credit weights and the payment flow are untouched: this is
 * a view of a decision that has already been made elsewhere.
 *
 * ONE TIER, EVERYWHERE
 * The tier, its name and its colour come from the shared plan identity, which
 * is the same source the badge in the header, the badge in the credits popover
 * and the plan cards on the pricing page read. They cannot disagree, because
 * there is only one of them.
 */

import React from 'react';
import { Crown, Sparkles, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  nextTier,
  planIdentityForTier,
  resolvePlanIdentityTier,
  type PlanIdentity,
} from '../../../shared/planIdentity';

/** How much of the panel is shown. */
export type MembershipPanelVariant = 'card' | 'row';

export interface MembershipPanelProps {
  /** Called when the candidate asks to change or manage the plan. */
  onManagePlan?: () => void;
  /** 'card' is a panel in the profile; 'row' is a line inside a menu. */
  variant?: MembershipPanelVariant;
  className?: string;
}

/**
 * The name of a tier, in the language the interface is in.
 *
 * The tier's own Arabic name is used rather than the English one, so an
 * Arabic-speaking candidate reads "بلس" rather than "Plus".
 */
function tierName(identity: PlanIdentity, arabic: boolean): string {
  return arabic ? identity.labelAr : identity.label;
}

/**
 * The plan's own name, when the server sent one.
 *
 * The server names the plan the candidate actually bought, which can be more
 * specific than the tier. The tier is the fallback.
 */
function planName(
  identity: PlanIdentity,
  serverNameEn: string | undefined,
  serverNameAr: string | undefined,
  arabic: boolean
): string {
  const serverName = arabic ? serverNameAr : serverNameEn;
  const trimmed = serverName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : tierName(identity, arabic);
}

/** A date, in the interface's language. */
function formatDate(value: string | null | undefined, arabic: boolean): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(arabic ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parsed);
  } catch {
    return null;
  }
}

export const MembershipPanel: React.FC<MembershipPanelProps> = ({
  onManagePlan,
  variant = 'card',
  className = '',
}) => {
  const { subscription, creditBalance, settings, t } = useCareer();
  const arabic = settings.language === 'ar';

  const tier = resolvePlanIdentityTier(subscription?.planCode);
  const identity = planIdentityForTier(tier);
  const isFree = identity.isFree;
  const upgradeTo = isFree ? nextTier(tier) : null;
  const upgradeIdentity = upgradeTo ? planIdentityForTier(upgradeTo) : null;

  const balance = creditBalance?.balance ?? 0;
  const allocation = creditBalance?.monthlyAllocation ?? 0;
  const consumed = creditBalance?.consumedThisMonth ?? 0;
  const remaining = Math.max(0, allocation - consumed);

  const renewed = formatDate(subscription?.expiresAt, arabic);
  const temporary = subscription?.status === 'temporary_access';

  const accent = `var(${identity.accentVar})`;
  const surface = `var(${identity.surfaceVar})`;

  const manageLabel = isFree
    ? upgradeIdentity
      ? t('Upgrade to {tier}').replace('{tier}', tierName(upgradeIdentity, arabic))
      : t('Upgrade')
    : t('Manage plan');

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onManagePlan}
        className={`w-full px-4 py-3 text-start hover:bg-[var(--surface-secondary)] transition-colors ${className}`.trim()}
        data-plan-tier={identity.tier}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: accent, backgroundColor: surface, borderColor: accent }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            {tierName(identity, arabic)}
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
        <div className="mt-1 text-[11px] text-[var(--text-muted)] truncate">
          {planName(identity, subscription?.planNameEn, subscription?.planNameAr, arabic)}
        </div>
      </button>
    );
  }

  return (
    <section
      className={`rounded-2xl border overflow-hidden ${className}`.trim()}
      style={{
        borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${surface} 70%, transparent)`,
      }}
      data-plan-tier={identity.tier}
      aria-label={t('Membership')}
    >
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isFree ? (
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
            ) : (
              <Crown className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: accent, backgroundColor: surface, borderColor: accent }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
              {tierName(identity, arabic)}
            </span>
          </div>

          <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)] truncate">
            {planName(identity, subscription?.planNameEn, subscription?.planNameAr, arabic)}
          </h3>

          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {isFree
              ? t('Unlock tailored CVs, detailed ATS analysis and interview practice.')
              : temporary
                ? t('Provisional Access Active')
                : t('Everything in your plan, with the credits that go with it.')}
          </p>
        </div>

        {onManagePlan && (
          <button
            type="button"
            onClick={onManagePlan}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
            style={{ backgroundColor: accent, color: 'var(--color-on-primary)' }}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {manageLabel}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
        <div className="bg-[var(--surface-main)] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {t('AI credits left')}
          </div>
          <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
            {remaining}
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {' / '}{allocation}
            </span>
          </div>
        </div>
        <div className="bg-[var(--surface-main)] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {renewed ? t('Renews on') : t('Used this cycle')}
          </div>
          <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
            {renewed ?? consumed}
          </div>
        </div>
      </div>

      <p className="px-4 py-2.5 text-[10px] text-[var(--text-muted)]">
        {balance} {t('tokens available')} · {t('Used this cycle')}: {consumed}
      </p>
    </section>
  );
};

export default MembershipPanel;
