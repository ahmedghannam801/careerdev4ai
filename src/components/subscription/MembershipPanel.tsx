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
import { Crown, Sparkles, ArrowUpRight, ShieldCheck, Check } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  nextTier,
  planIdentityForTier,
  planPresentationFor,
  type PlanIdentity,
} from '../../../shared/planIdentity';
import {
  PLAN_FEATURE_MATRIX,
  type EntitlementFeature,
  type SubscriptionPlanCode,
} from '../../../shared/subscriptions';
import { PlanIdentityFrame } from './PlanIdentityFrame';

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

/**
 * The short, human name of an entitlement.
 *
 * These are labels only: whether a feature is available still comes from the
 * entitlement matrix the server uses, never from this table.
 */
const FEATURE_LABELS: Record<EntitlementFeature, string> = {
  'cv.builder': 'CV builder',
  'cv.tailoring': 'Tailored CVs',
  'cv.multiple_versions': 'Multiple CV versions',
  'cv.export_pdf': 'PDF export',
  'ats.analysis': 'ATS analysis',
  'ats.detailed_breakdown': 'Detailed ATS breakdown',
  'job_description.analysis': 'Job description analysis',
  'cover_letter.generate': 'Cover letter generation',
  'roadmap.generate': 'Career roadmap',
  'roadmap.full_stages': 'Full roadmap stages',
  'interview.mock_simulation': 'Mock interviews',
  'ai_mentor.session': 'AI mentor sessions',
  'portfolio.advanced': 'Advanced portfolio',
  'career.reports': 'Career progress reports',
  'career.transition_plan': 'Career transition plan',
  'career.comparative_fit': 'Multi-role comparative fit',
  'interview.deep_simulation': 'Deep scenario interviews',
  'ai.priority_processing': 'Priority AI processing',
};

/**
 * The three most distinctive features of a plan.
 *
 * For a paid plan, what sets it apart from the free tier is the useful thing
 * to show; for the free tier, the basics it includes. Nothing is invented: the
 * features are read straight from the shared matrix.
 */
function planHighlights(planCode: SubscriptionPlanCode): EntitlementFeature[] {
  const features = PLAN_FEATURE_MATRIX[planCode] ?? [];
  const freeFeatures = new Set<EntitlementFeature>(PLAN_FEATURE_MATRIX.free);
  const distinctive = features.filter((feature) => !freeFeatures.has(feature));
  return (distinctive.length > 0 ? distinctive : features).slice(0, 3);
}

export const MembershipPanel: React.FC<MembershipPanelProps> = ({
  onManagePlan,
  variant = 'card',
  className = '',
}) => {
  const { subscription, creditBalance, settings, t } = useCareer();
  const arabic = settings.language === 'ar';

  // The tier and the subscription state are resolved together: a plan whose
  // period has ended is shown as ended, not as the paid plan it used to be.
  const display = planPresentationFor({
    planCode: subscription?.planCode,
    status: subscription?.status,
    expiresAt: subscription?.expiresAt,
  });
  const tier = display.tier;
  const identity = planIdentityForTier(tier);
  const isExpired = display.isExpired;
  const isInactive = display.isInactive;
  const isFree = tier === 'free' && !isExpired && !isInactive;
  const upgradeTo = isFree ? nextTier(tier) : null;
  const upgradeIdentity = upgradeTo ? planIdentityForTier(upgradeTo) : null;

  const balance = creditBalance?.balance ?? 0;
  const allocation = creditBalance?.monthlyAllocation ?? 0;
  const consumed = creditBalance?.consumedThisMonth ?? 0;
  const remaining = Math.max(0, allocation - consumed);

  const renewed = formatDate(subscription?.expiresAt, arabic);
  const temporary = subscription?.status === 'temporary_access';

  const accent = `var(${display.accentVar})`;
  const surface = `var(${display.surfaceVar})`;
  const highlights = planHighlights(subscription?.planCode ?? 'free');
  const currentLabel = arabic ? display.labelAr : display.label;

  const manageLabel = isFree
    ? upgradeIdentity
      ? t('Upgrade to {tier}').replace('{tier}', tierName(upgradeIdentity, arabic))
      : t('Upgrade')
    : isExpired || isInactive
      ? t('Renew plan')
      : t('Manage plan');

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onManagePlan}
        className={`w-full px-4 py-3 text-start hover:bg-[var(--surface-secondary)] transition-colors ${className}`.trim()}
        data-plan-tier={display.tier}
        data-plan-state={display.state}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              arabic ? '' : 'uppercase tracking-wide'
            }`}
            style={{
              color: accent,
              backgroundColor: surface,
              borderColor: `color-mix(in srgb, ${accent} 38%, transparent)`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            {currentLabel}
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
      data-plan-tier={display.tier}
      data-plan-state={display.state}
      aria-label={t('Membership')}
    >
      {/* The plan's own colour as a hairline across the top: a quiet
          accent rather than a banner. */}
      <div aria-hidden="true" className="h-1 w-full" style={{ backgroundColor: accent }} />

      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isFree ? (
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
            ) : (
              <Crown className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                arabic ? '' : 'uppercase tracking-wide'
              }`}
              style={{
                color: accent,
                backgroundColor: surface,
                borderColor: `color-mix(in srgb, ${accent} 38%, transparent)`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
              {currentLabel}
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

      {highlights.length > 0 && (
        <ul className="grid gap-1 px-4 pb-3 sm:grid-cols-2 sm:px-5">
          {highlights.map((feature) => (
            <li
              key={feature}
              className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"
            >
              <Check
                className="h-3 w-3 shrink-0"
                style={{ color: accent }}
                aria-hidden="true"
              />
              <span className="truncate">{t(FEATURE_LABELS[feature])}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
        {/*
          The credits.

          The balance is framed in the plan's own colour, in the same way the
          profile photo is framed for the top tier, so the two read as one
          language. The frame says WHICH plan the credits belong to; the
          number inside says how many are left.

          The number is the platform's own balance: the remaining credits of
          the cycle and the cycle's allocation. Nothing here is a default or
          a guess — a candidate with no credits sees zero, and that is the
          truth about their account.
        */}
        <div className="bg-[var(--surface-main)] p-4">
          <PlanIdentityFrame
            planCode={subscription?.planCode ?? 'free'}
            status={subscription?.status}
            expiresAt={subscription?.expiresAt}
            variant="always"
            shape="pill"
            className="w-full"
            label={t('Your AI credits')}
          >
            <div className="flex items-center gap-2 rounded-full bg-[var(--surface-main)] px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {t('AI credits left')}
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {remaining}
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    {' / '}{allocation}
                  </span>
                </div>
              </div>
            </div>
          </PlanIdentityFrame>
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
