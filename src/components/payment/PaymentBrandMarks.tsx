/**
 * Payment brand marks.
 * ------------------------------------------------------------------
 * The authentic marks of the payment rails the platform accepts.
 *
 * These are the real brand assets, not approximations:
 *
 *   * Vodafone Cash, Stripe, Visa and Mastercard are the Simple Icons
 *     glyphs (simpleicons.org), released under CC0-1.0. The path data below
 *     is copied verbatim from the SVG files kept next to this module in
 *     `src/assets/payment/`, and a test asserts that it still matches them,
 *     so a mark can never quietly become something that only looks like
 *     the brand.
 *   * InstaPay is the official wordmark published by InstaPay itself
 *     (instapay.eg), trimmed and optimised for the interface.
 *
 * Every mark is decorative: it always sits next to the name of the method,
 * so it is hidden from assistive technology and the name is what is read
 * out. A mark on its own — a card network inside a Stripe button — carries
 * its own accessible name instead.
 *
 * See `src/assets/payment/ATTRIBUTION.md` for the sources and licences.
 */

import React from 'react';
import instapayLogo from '../../assets/payment/instapay-logo.png';

interface BrandMarkProps {
  /** Tailwind classes for the size and the colour of the mark. */
  className?: string;
  /**
   * An accessible name for the mark, for the rare case where the mark is
   * the only thing that says what the method is. When it is empty the mark
   * is hidden from assistive technology.
   */
  title?: string;
}

/** The official Vodafone brand red. */
const VODAFONE_RED = '#E60000';
/** The official Stripe blurple. */
const STRIPE_PURPLE = '#635BFF';
/** The official Visa navy. */
const VISA_NAVY = '#1A1F71';
/** The official Mastercard red. */
const MASTERCARD_RED = '#EB001B';

function svgProps(title?: string) {
  return {
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    role: title ? ('img' as const) : undefined,
    'aria-hidden': title ? undefined : (true as const),
    focusable: 'false' as const,
  };
}

/** The Vodafone Cash mark — the Vodafone disc with its speech-mark cut. */
export const VodafoneCashMark: React.FC<BrandMarkProps> = ({ className = 'h-5 w-5', title }) => (
  <svg {...svgProps(title)} className={className}>
    {title ? <title>{title}</title> : null}
    <path
      fill={VODAFONE_RED}
      d="M12 0A12 12 0 0 0 0 12A12 12 0 0 0 12 24A12 12 0 0 0 24 12A12 12 0 0 0 12 0M16.25 1.12C16.57 1.12 16.9 1.15 17.11 1.22C14.94 1.67 13.21 3.69 13.22 6C13.22 6.05 13.22 6.11 13.23 6.17C16.87 7.06 18.5 9.25 18.5 12.28C18.54 15.31 16.14 18.64 12.09 18.65C8.82 18.66 5.41 15.86 5.39 11.37C5.38 8.4 7 5.54 9.04 3.85C11.04 2.19 13.77 1.13 16.25 1.12Z"
    />
  </svg>
);

/** The Stripe mark. */
export const StripeMark: React.FC<BrandMarkProps> = ({ className = 'h-5 w-5', title }) => (
  <svg {...svgProps(title)} className={className}>
    {title ? <title>{title}</title> : null}
    <path
      fill={STRIPE_PURPLE}
      d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
    />
  </svg>
);

/** The Visa mark. */
export const VisaMark: React.FC<BrandMarkProps> = ({ className = 'h-5 w-5', title }) => (
  <svg {...svgProps(title)} className={className}>
    {title ? <title>{title}</title> : null}
    <path
      fill={VISA_NAVY}
      d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
    />
  </svg>
);

/** The Mastercard mark. */
export const MasterCardMark: React.FC<BrandMarkProps> = ({ className = 'h-5 w-5', title }) => (
  <svg {...svgProps(title)} className={className}>
    {title ? <title>{title}</title> : null}
    <path
      fill={MASTERCARD_RED}
      d="M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z"
    />
  </svg>
);

/**
 * The InstaPay wordmark.
 *
 * The official mark is a raster image with a wide aspect ratio, so it is
 * sized by height and its intrinsic ratio is kept, which stops the layout
 * from jumping while it loads. `shrink-0` matters: without it a flex parent
 * squeezes the wordmark down to the width of a square, and a wordmark
 * squeezed that far is no longer readable.
 */
export const InstaPayMark: React.FC<BrandMarkProps> = ({
  className = 'h-5 w-auto shrink-0',
  title,
}) => (
  <img
    src={instapayLogo}
    alt={title ?? ''}
    aria-hidden={title ? undefined : true}
    width={495}
    height={64}
    className={`${className} object-contain`}
    loading="lazy"
    decoding="async"
  />
);

/** The card networks Stripe accepts, as a single mark group. */
export const CardNetworkMarks: React.FC<{ className?: string }> = ({ className = 'h-4 w-auto' }) => (
  <span className={`inline-flex items-center gap-1 ${className}`}>
    <VisaMark className="h-4 w-auto" />
    <MasterCardMark className="h-4 w-auto" />
  </span>
);
