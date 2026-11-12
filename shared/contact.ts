/**
 * The platform's published contact channels.
 *
 * These are the addresses and links the product publishes in more than one
 * place — the landing page footer, the contact section, the settings screen and
 * the public Contact Us page. They live here so all of them name the same
 * channel. Changing one contact route means changing it once, and the
 * published legal documents can point at it.
 */

/** The support and feedback address. */
export const SUPPORT_EMAIL = 'ahmedghannam801@gmail.com';

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
} as const;

/* -------------------------------------------------------------------------- */
/* The business contact details                                               */
/* -------------------------------------------------------------------------- */

/**
 * The postal address of the business.
 *
 * The fields are the ones schema.org's `PostalAddress` uses, so what the page
 * shows and what the structured data says cannot drift apart. The country is
 * known; the rest is what the operator has to supply.
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
 * The business details published on the Contact Us page.
 *
 * A merchant onboarding reviewer asks for three things: a business address in
 * Egypt, a telephone number reachable on +20, and an address the business
 * answers on. This object is the single place those three answers live.
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
 * To complete the page, fill in the fields that are `null`:
 *
 *   - `address.street`, `address.locality`, `address.city`,
 *     `address.governorate`, `address.postalCode` — the registered address;
 *   - `email` — a mailbox the business answers on, if the published support
 *     address is not the one to put in front of a reviewer;
 *   - `businessHours` — optional, and left unpublished when it is unknown.
 *
 * The telephone number is already published, in the international form a
 * reviewer expects: the +20 country code, then the national number.
 *
 * Nothing else has to change: the page, the footer link, the sitemap and the
 * structured data all read from this one object.
 */
export const BUSINESS_CONTACT: BusinessContactDetails = {
  businessName: 'CareerDev4AI',
  address: {
    street: null,
    locality: null,
    city: null,
    governorate: null,
    postalCode: null,
    country: 'Egypt',
    countryCode: 'EG',
  },
  phone: '+20 10 2705 3876',
  email: SUPPORT_EMAIL,
  businessHours: null,
};

/**
 * Whether every detail a reviewer asks for has been supplied.
 *
 * The Contact Us page uses this to say plainly which details are still
 * outstanding, rather than letting a reader assume a detail was published
 * because it was not.
 */
export function isBusinessContactComplete(details: BusinessContactDetails = BUSINESS_CONTACT): boolean {
  const { address } = details;
  return Boolean(
    details.businessName?.trim() &&
      address.street?.trim() &&
      address.city?.trim() &&
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
