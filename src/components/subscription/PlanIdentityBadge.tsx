/**
 * The badge that shows which subscription tier an account is on.
 *
 * ONE IDENTITY, EVERYWHERE
 * The tier is drawn from the plan code the server sent with the account. The
 * browser never decides which plan the candidate is on: it draws the plan the
 * subscription says they have. A tampered response cannot make the platform
 * show a paid identity, because the plan code that produces the identity is
 * the one the server resolved from the subscription itself.
 *
 * ONE RESOLUTION, INCLUDING STATUS
 * The badge reads the plan code, the subscription status and the end of the
 * current period through the shared `planPresentationFor`. That is what stops
 * an expired `career_plus` row from continuing to wear the Ultra colour after
 * access has ended, and it is why the header and the sidebar cannot disagree.
 *
 * THE COLOURS ARE NOT IN HERE
 * The component knows the tier and the name of the custom property that
 * carries the colour; the palette lives in the stylesheet. That is what lets
 * the same badge read correctly in the light theme, in the dark theme, and
 * for a reader who needs more contrast, without a second set of rules here.
 *
 * NO MOTION
 * The badge is a label, not an ornament. It does not pulse, breathe or
 * animate: a plan identity is information the candidate reads, and motion
 * would only make the header busier.
 */

import React from 'react';
import {
  planPresentationFor,
  type PlanIdentityTier,
} from '../../../shared/planIdentity';

export interface PlanIdentityBadgeProps {
  /** The plan code the server sent. */
  planCode?: string | null;
  /** The tier, when the caller already resolved it. */
  tier?: PlanIdentityTier;
  /** The subscription status, so an expired or suspended plan is shown as such. */
  status?: string | null;
  /** The end of the current period, so a stale active row is not trusted. */
  expiresAt?: string | null;
  /** 'solid' fills the badge, 'outline' only rings it. */
  variant?: 'solid' | 'outline';
  /** 'xs' sits inside the tokens chip, 'sm' in the sidebar, 'md' on a card. */
  size?: 'xs' | 'sm' | 'md';
  /** The name to show instead of the tier's own. */
  label?: string | null;
  /** Hides the name, leaving only the mark. */
  markOnly?: boolean;
  /**
   * The interface's language.
   *
   * A tier has a name in each language the platform speaks, and the name the
   * candidate reads should be the one in their own. An Arabic-speaking
   * candidate reads "أساسي", not "Basic".
   */
  language?: 'ar' | 'en';
  className?: string;
  /** The instant used to decide whether the period has ended. */
  now?: Date;
}

export const PlanIdentityBadge: React.FC<PlanIdentityBadgeProps> = ({
  planCode,
  tier,
  status,
  expiresAt,
  variant = 'solid',
  size = 'sm',
  label,
  markOnly = false,
  language = 'en',
  className = '',
  now,
}) => {
  const display = planPresentationFor(
    {
      planCode: tier ?? planCode,
      status,
      expiresAt,
    },
    now,
  );

  const name = label ?? (language === 'ar' ? display.labelAr : display.label);

  // The mark-only variant carries no padding of its own, so the size never
  // competes with the caller's own spacing.
  const sizeClass = markOnly
    ? size === 'md'
      ? 'text-[11px] py-1 gap-1.5'
      : size === 'xs'
        ? 'text-[9px] py-0.5 gap-1'
        : 'text-[10px] py-0.5 gap-1'
    : size === 'md'
      ? 'text-[11px] px-2.5 py-1 gap-1.5'
      : size === 'xs'
        ? 'text-[9px] px-1.5 py-0.5 gap-1'
        : 'text-[10px] px-2 py-0.5 gap-1';

  const markClass = size === 'md' ? 'h-1.5 w-1.5' : 'h-1 w-1';
  // Letter-spacing is right for an uppercase Latin tier name and wrong for
  // Arabic, where it would pull apart the joined script.
  const typeClass = language === 'ar' ? '' : 'uppercase tracking-[0.04em]';

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border font-semibold leading-none ${typeClass} ${sizeClass} ${className}`.trim()}
      style={{
        color: `var(${display.accentVar})`,
        backgroundColor: variant === 'solid' ? `var(${display.surfaceVar})` : 'transparent',
        borderColor: `color-mix(in srgb, var(${display.accentVar}) ${
          variant === 'solid' ? '38%' : '55%'
        }, transparent)`,
      }}
      data-plan-tier={display.tier}
      data-plan-state={display.state}
      title={name}
      aria-label={name}
    >
      <span
        className={`${markClass} shrink-0 rounded-full`}
        style={{ backgroundColor: `var(${display.accentVar})` }}
        aria-hidden="true"
      />
      {markOnly ? null : <span className="truncate">{name}</span>}
    </span>
  );
};

export default PlanIdentityBadge;
