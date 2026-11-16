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
 * THE COLOURS ARE NOT IN HERE
 * The component knows the tier and the name of the custom property that
 * carries the colour; the palette lives in the stylesheet. That is what lets
 * the same badge read correctly in the light theme, in the dark theme, and
 * for a reader who needs more contrast, without a second set of rules here.
 *
 * MOTION IS OPTIONAL
 * The mark beside the name breathes very slightly. When the visitor asks for
 * reduced motion the stylesheet stops it, so the badge still says what it
 * says without moving.
 */

import React from 'react';
import {
  planIdentityFor,
  type PlanIdentityTier,
} from '../../../shared/planIdentity';

export interface PlanIdentityBadgeProps {
  /** The plan code the server sent. */
  planCode?: string | null;
  /** The tier, when the caller already resolved it. */
  tier?: PlanIdentityTier;
  /** 'solid' fills the badge, 'outline' only rings it. */
  variant?: 'solid' | 'outline';
  /** 'sm' is for a header, 'md' for a card. */
  size?: 'sm' | 'md';
  /** The name to show instead of the tier's own. */
  label?: string | null;
  /** Hides the name, leaving only the mark. */
  markOnly?: boolean;
  className?: string;
}

export const PlanIdentityBadge: React.FC<PlanIdentityBadgeProps> = ({
  planCode,
  tier,
  variant = 'solid',
  size = 'sm',
  label,
  markOnly = false,
  className = '',
}) => {
  const identity = tier
    ? planIdentityFor(tier)
    : planIdentityFor(planCode);

  const name = label ?? identity.label;
  const isUltra = identity.tier === 'ultra';

  // The mark-only variant carries no padding of its own, so the size never
  // competes with the caller's own spacing.
  const sizeClass = markOnly
    ? size === 'md'
      ? 'text-[11px] py-1 gap-1.5'
      : 'text-[10px] py-0.5 gap-1'
    : size === 'md'
      ? 'text-[11px] px-2.5 py-1 gap-1.5'
      : 'text-[10px] px-2 py-0.5 gap-1';

  const markClass = 'h-1.5 w-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${sizeClass} ${className}`.trim()}
      style={{
        color: `var(${identity.accentVar})`,
        backgroundColor: variant === 'solid' ? `var(${identity.surfaceVar})` : 'transparent',
        borderColor: `var(${identity.accentVar})`,
        // Ultra is black with gold. On the solid variant the gold would be a
        // thin line on a dark surface, so the text carries the gold itself and
        // the border is softened to keep the contrast comfortable.
        ...(isUltra && variant === 'solid'
          ? { borderColor: 'color-mix(in srgb, var(--plan-ultra-accent) 55%, transparent)' }
          : null),
      }}
      data-plan-tier={identity.tier}
      title={name}
    >
      <span
        className={`${markClass} shrink-0 rounded-full motion-safe:animate-pulse`}
        style={{ backgroundColor: `var(${identity.accentVar})` }}
        aria-hidden="true"
      />
      {markOnly ? null : <span>{name}</span>}
    </span>
  );
};

export default PlanIdentityBadge;
