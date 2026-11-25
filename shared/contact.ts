/**
 * The platform's published contact channels.
 *
 * These are the addresses and links the product publishes in more than one
 * place — the landing page footer, the contact section, the settings screen and
 * the public Contact Us page. They live here so all of them name the same
 * channel. Changing one contact route means changing it once, and the
 * published legal documents can point at it.
 */

import { BRAND_NAME } from './brand';

/** The support and feedback address. */
export const SUPPORT_EMAIL = 'ahmedghannam801@gmail.com';

/**
 * The business contact address.
 *
 * This is the mailbox a customer, a partner or a merchant reviewer writes to
 * about the business itself: the published business information, the legal
 * documents, a refund request or a billing dispute. It is deliberately a
 * separate constant from the product's support mailbox, because the two are
 * different promises — but both are real addresses, and the Business
 * Information page publishes this one.
 *
 * The Refund Policy and the Terms point at this address rather than writing it
 * out, so there is exactly one place to change it.
 */
export const BUSINESS_EMAIL = 'aionvia09@gmail.com';

/**
 * The support phone number, in international format.
 *
 * It is the number the operator answers on. It used to be read from the manual
 * payment configuration, where it doubled as a wallet number; the wallet rails
 * are gone, and a phone number that a candidate can call is contact
 * information, not a payment destination.
 */
export const SUPPORT_PHONE = '+201027053876';

/** The support phone in the local format people dial domestically. */
export const SUPPORT_PHONE_LOCAL = '01027053876';

/** The operator's public professional profile. */
export const OPERATOR_LINKEDIN_URL = 'https://www.linkedin.com/in/ahmed-ebrahim2';

/** The operator's display name. */
export const OPERATOR_NAME = 'Ahmed Ebrahim';

/** The server-rendered pages the public site links to. */
export const PUBLIC_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
  about: '/about',
  careers: '/careers',
  learning: '/learning',
  opportunities: '/opportunities',
  contact: '/contact',
  businessInformation: '/business-information',
  refundPolicy: '/refund-policy',
} as const;

/* -------------------------------------------------------------------------- */
/* The business contact details                                               */
/* -------------------------------------------------------------------------- */

/**
 * The postal address of the business.
 *
 * The city and the country are the business's published location: Aionvia is
 * based in Tanta, Egypt. They are the only parts of the address that are
 * published, because they are the only parts that have been confirmed.
 *
 * The finer-grained fields — street, district, governorate and postal code —
 * stay `null` until the operator supplies them. Do not replace a null with a
 * plausible-looking address: an invented address on a merchant-verification
 * page is a false business detail, and a made-up street is worse than an
 * honest city.
 *
 * The fields are the ones schema.org's `PostalAddress` uses, so what the page
 * shows and what the structured data says cannot drift apart. The structured
 * data omits every field that is `null`, rather than asserting something untrue.
 */
export interface BusinessAddress {
  /** The street address: building, street, floor, unit. */
  street: string | null;
  /** The district or area within the city. */
  locality: string | null;
  /** The city. */
  city: string | null;
  /** The governorate. */
  governorate: string | null;
  /** The postal code. */
  postalCode: string | null;
  /** The country, written for a reader. */
  country: string;
  /** The country code, as schema.org writes it. */
  countryCode: string;
}

/**
 * The business details published on the Business Information page.
 *
 * A merchant onboarding reviewer asks for three things: where the business is,
 * a telephone number reachable on +20, and an address the business answers on.
 * This object is the single place those three answers live.
 *
 * A field that has not been supplied yet is `null`. It is never a plausible
 * value: a made-up address or a made-up number on a compliance page is a
 * fabricated business detail, and it is exactly what this page must not
 * publish. `null` renders as a clearly marked placeholder, and the structured
 * data omits the property entirely rather than asserting something untrue.
 */
export interface BusinessContactDetails {
  /** The legal or trading name of the business. */
  businessName: string;
  /** The postal address of the business. */
  address: BusinessAddress;
  /**
   * The telephone number, written the way it should be read on the page —
   * for example `+20 100 123 4567`. The `tel:` link is derived from it.
   */
  phone: string | null;
  /** The business email address. */
  email: string | null;
  /** The business hours, when they are published. */
  businessHours: string | null;
}

/**
 * The published business contact details.
 *
 * The location, the telephone number and the business email address are
 * published. The finer address fields are not, and stay `null` until the
 * operator supplies them:
 *
 *   - `address.street`, `address.locality`, `address.governorate`,
 *     `address.postalCode` — the registered address, if it is ever published;
 *   - `businessHours` — optional, and left unpublished when it is unknown.
 *
 * The telephone number is published in the international form a reviewer
 * expects: the +20 country code, then the national number.
 *
 * Nothing else has to change: the page, the footer link, the sitemap and the
 * structured data all read from this one object.
 */
export const BUSINESS_CONTACT: BusinessContactDetails = {
  businessName: BRAND_NAME,
  address: {
    street: null,
    locality: null,
    city: 'Tanta',
    governorate: null,
    postalCode: null,
    country: 'Egypt',
    countryCode: 'EG',
  },
  phone: '+20 10 2705 3876',
  email: BUSINESS_EMAIL,
  businessHours: null,
};

/**
 * The business location, as it is read on the page.
 *
 * This is the one business fact a payment provider checks first: where the
 * business is. It is derived from the address rather than written out again,
 * so the page, the structured data and the legal documents cannot drift apart.
 *
 * It is a location, not a postal address. Nothing here claims a street, a
 * building or a registered address, because none of those has been confirmed.
 */
export function businessLocation(details: BusinessContactDetails = BUSINESS_CONTACT): string {
  const { address } = details;
  const city = address.city?.trim();
  const country = address.country?.trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || '';
}

/**
 * Whether every detail a reviewer asks for has been supplied.
 *
 * The Contact Us page uses this to say plainly which details are still
 * outstanding, rather than letting a reader assume a detail was published
 * because it was not.
 *
 * A location is complete when the city and the country are known. The finer
 * address fields are not part of the test: a business that publishes its city
 * and country — and no invented street — has published its location.
 */
export function isBusinessContactComplete(details: BusinessContactDetails = BUSINESS_CONTACT): boolean {
  const { address } = details;
  return Boolean(
    details.businessName?.trim() &&
      address.city?.trim() &&
      address.country?.trim() &&
      details.phone?.trim() &&
      details.email?.trim()
  );
}

/**
 * The postal address as the lines it is read on, with the empty lines left
 * out.
 */
export function businessAddressLines(details: BusinessContactDetails = BUSINESS_CONTACT): string[] {
  const { address } = details;
  return [
    address.street?.trim(),
    address.locality?.trim(),
    address.city?.trim(),
    address.governorate?.trim(),
    address.postalCode?.trim(),
    address.country?.trim(),
  ].filter((line): line is string => Boolean(line));
}

/**
 * The `tel:` target for the published number.
 *
 * The number is stored the way it is read; the link needs the digits. Spaces,
 * dashes, dots and parentheses are dropped, and everything else is kept, so a
 * number written in the international form produces a usable link.
 */
export function businessPhoneHref(details: BusinessContactDetails = BUSINESS_CONTACT): string | null {
  const phone = details.phone?.trim();
  if (!phone) return null;
  const href = `tel:${phone.replace(/[^\d+]/g, '')}`;
  return href === 'tel:' ? null : href;
}
