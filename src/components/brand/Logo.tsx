import React from 'react';
import iconSrc from '../../assets/brand/aionvia-icon.png';
import logoSrc from '../../assets/brand/aionvia-logo.png';

/**
 * Aionvia brand assets.
 *
 * Both variants come from the official artwork. Nothing here redraws,
 * recolours or re-letters the logo — the component only chooses which approved
 * asset is shown and how large it is.
 */
export type LogoVariant = 'icon' | 'full';

interface LogoProps {
  /**
   * `icon` — the official mark at icon size. Use it in favicons, app icons,
   *   collapsed navigation and any small slot.
   *
   * `full` — the official lockup: the mark with the Aionvia lettering. Use it
   *   on the landing page, the authentication screens, the footer and anywhere
   *   the brand itself is the subject. Size it by WIDTH (`w-24`, `w-32`), not
   *   by height: the lockup is stacked, so a height class alone would shrink
   *   the lettering to a smudge.
   */
  variant?: LogoVariant;
  /**
   * Sizing classes for the image, e.g. `h-8 w-8` for the icon or `w-24 h-auto`
   * for the larger variant. The aspect ratio of the asset is always preserved:
   * the image is rendered with `object-contain`, so it can never be stretched.
   */
  className?: string;
  /** Accessible label. Pass an empty string when the logo is decorative. */
  alt?: string;
}

/**
 * The single place the Aionvia logo is rendered.
 *
 * The mark is transparent and fully saturated, so it reads on both the light
 * and the dark theme without any treatment. The artwork itself is never altered.
 */
export const Logo: React.FC<LogoProps> = ({ variant = 'icon', className = '', alt }) => {
  const label = alt ?? 'Aionvia';

  if (variant === 'full') {
    return (
      <img
        src={logoSrc}
        alt={label}
        draggable={false}
        decoding="async"
        className={`block max-w-full object-contain ${className}`}
      />
    );
  }

  return (
    <img
      src={iconSrc}
      alt={label}
      draggable={false}
      decoding="async"
      className={`block max-w-full object-contain ${className}`}
    />
  );
};

export default Logo;
