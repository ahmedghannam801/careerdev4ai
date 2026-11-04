/**
 * The platform's published contact channels.
 *
 * These are the addresses and links the product publishes in more than one
 * place — the landing page footer, the contact section, and Settings. They
 * live here so all three name the same channel. Changing one contact route
 * means changing it once, and the published legal documents can point at it.
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
} as const;
