import React from 'react';
import iconSrc from '../../assets/brand/careerpilot-icon.png';
import logoSrc from '../../assets/brand/careerpilot-logo.png';

/**
 * CareerPilot AI brand assets.
 *
 * Both variants are the official artwork. Nothing here redraws, recolours or
 * re-letters the logo — the component only chooses which approved asset is
 * shown and how large it is.
 */
export type LogoVariant = 'icon' | 'full';

interface LogoProps {
  /**
   * `icon` — the CareerPilot AI symbol only. Use it in favicons, app icons,
   *   collapsed navigation and any small slot where the full lockup would be
   *   too large to read.
   *
   * `full` — the symbol, the "CareerPilot AI" wordmark and the
   *   "GUIDE | SKILLS | OPPORTUNITIES | YOUR FUTURE" tagline. Use it on the
   *   landing page, the authentication screens, the footer and anywhere the
   *   brand itself is the subject.
   */
  variant?: LogoVariant;
  /**
   * Sizing classes for the image, e.g. `h-8 w-8` for the icon or `h-12 w-auto`
   * for the lockup. The aspect ratio of the asset is always preserved: the
   * image is rendered with `object-contain`, so it can never be stretched.
   */
  className?: string;
  /** Accessible label. Pass an empty string when the logo is decorative. */
  alt?: string;
}

/**
 * The single place the CareerPilot AI logo is rendered.
 *
 * The icon-only asset is transparent and fully saturated, so it reads on both
 * the light and the dark theme without any treatment.
 *
 * The full lockup carries the dark navy wordmark. On the light theme it sits
 * directly on the surface; on the dark theme it is placed on a white plate so
 * the wordmark keeps its contrast. The artwork itself is never altered.
 */
export const Logo: React.FC<LogoProps> = ({ variant = 'icon', className = '', alt }) => {
  const label = alt ?? 'CareerPilot AI';

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
