/**
 * Aionvia — the one place that knows the brand.
 * -----------------------------------------------------------------------------
 * The product name, the canonical origin and the names a search engine may use
 * for this site are read from here by both the browser bundle and the server.
 * A rebrand is therefore a change to this file plus the brand artwork, not a
 * hunt through a hundred strings that can drift apart.
 *
 * The *technical* names are deliberately not here: the Supabase project, the
 * queue name and the historical storage keys are integration identifiers.
 * Renaming one of those would break live data or a live integration, so they
 * stay as they are and are documented where they live.
 */

/** The official product name. */
export const BRAND_NAME = 'Aionvia';

/** The canonical production origin, without a trailing slash. */
export const BRAND_ORIGIN = 'https://aionvia.pages.dev';

/** The canonical production URL, with the trailing slash used by canonical links. */
export const BRAND_URL = `${BRAND_ORIGIN}/`;

/** The one-line description used wherever no better one exists. */
export const BRAND_TAGLINE = 'Your personal career operating system';

/** The author credited in the document metadata. */
export const BRAND_AUTHOR = 'Ahmed Ebrahim';

/** The Cloudflare Pages project name (the source of the pages.dev subdomain). */
export const BRAND_PAGES_PROJECT = 'aionvia';

/**
 * The origin the platform was previously served from.
 *
 * Kept because a link that was shared under the old domain still has to land
 * on the new one. It is never advertised as the canonical address.
 */
export const BRAND_LEGACY_ORIGINS = ['https://aionvia.pages.dev'] as const;

/**
 * Other written forms of the same name.
 *
 * Only spellings of this product belong here — never a different product, and
 * never a name the site does not use. The canonical name is included, because
 * it is the exact string a search engine should attach to this site when the
 * schema blocks are reconciled.
 */
export const BRAND_ALTERNATE_NAMES = [
  BRAND_NAME,
  `${BRAND_NAME} AI`,
  `${BRAND_NAME} Career Platform`,
] as const;

/**
 * Resolves the origin every public URL is built from.
 *
 * `SITE_ORIGIN` may override the default so a preview deployment can advertise
 * itself without editing the source. A trailing slash is stripped so the same
 * origin never produces two different canonical URLs.
 */
export function resolveSiteOrigin(configured?: string | null): string {
  const value = (configured ?? '').trim();
  return (value.length > 0 ? value : BRAND_ORIGIN).replace(/\/+$/, '');
}
