/**
 * The plan's frame.
 * ---------------------------------------------------------------------------
 * One frame draws the plan's identity around something the candidate looks at:
 * the profile photo, the credits balance.
 *
 * TWO WAYS TO USE IT
 *
 *   * `premium` — only the TOP tier is framed. The frame is the reward: a
 *     candidate on the highest plan sees the ring around their photo, and a
 *     candidate on any other plan sees their photo exactly as it was. Nobody
 *     is shown a treatment they have not earned, and nobody on the top tier
 *     has to be told about it in a badge beside their face.
 *
 *   * `always` — every tier is framed, in the tier's own colour. This is how
 *     the credits balance is drawn: the frame says which plan the balance
 *     belongs to, and it says it without a second label.
 *
 * THE COLOUR IS NOT CHOSEN HERE
 * The frame reads the shared plan identity, so the tier's colour lives in the
 * stylesheet and the frame cannot drift away from the badge, the pricing
 * cards and the membership panel.
 */

import React from 'react';

import {
  planIdentityForTier,
  resolvePlanIdentityTier,
  type PlanIdentityTier,
} from '../../../shared/planIdentity';

export interface PlanIdentityFrameProps {
  /**
   * The plan code the server resolved. The browser never chooses a plan, so
   * this is the only source of the tier.
   */
  planCode: string | null | undefined;
  /** What the frame is drawn around. */
  children: React.ReactNode;
  /**
   * `premium` frames the top tier only. `always` frames every tier, in the
   * tier's own colour.
   */
  variant?: 'premium' | 'always';
  /** Extra classes for the frame. */
  className?: string;
  /** The shape of the frame: a photo is a rounded square, a chip is a pill. */
  shape?: 'square' | 'pill';
  /** The accessible description of the frame's meaning. */
  label?: string;
}

/** The tier that carries the premium treatment. */
const TOP_TIER: PlanIdentityTier = 'ultra';

export const PlanIdentityFrame: React.FC<PlanIdentityFrameProps> = ({
  planCode,
  children,
  variant = 'premium',
  className = '',
  shape = 'square',
  label,
}) => {
  const tier = resolvePlanIdentityTier(planCode);
  const identity = planIdentityForTier(tier);

  // The premium frame belongs to the top tier alone.
  if (variant === 'premium' && tier !== TOP_TIER) {
    return <>{children}</>;
  }

  const accent = `var(${identity.accentVar})`;
  const radius = shape === 'pill' ? '9999px' : '1.25rem';
  const innerRadius = shape === 'pill' ? '9999px' : '1.05rem';

  return (
    <div className={`relative inline-block ${className}`.trim()} title={label}>
      {/*
        The frame is a gradient border, drawn with a padding and an opaque
        inner surface. It costs one paint and no filter, so it stays crisp on
        a phone and never costs a blurred layer.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[var(--frame-radius)]"
        style={
          {
            '--frame-radius': radius,
            background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 35%, transparent) 38%, transparent 55%, color-mix(in srgb, ${accent} 60%, transparent) 78%, ${accent} 100%)`,
          } as React.CSSProperties
        }
      />
      <div
        className="relative rounded-[var(--frame-inner-radius)] bg-[var(--surface-main)] p-[2px]"
        style={{ '--frame-inner-radius': innerRadius } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
};

export default PlanIdentityFrame;
