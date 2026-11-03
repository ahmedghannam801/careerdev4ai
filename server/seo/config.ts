/**
 * The public identity of CareerDev4AI, and the one place that knows the
 * production origin.
 *
 * Every canonical URL, Open Graph URL, sitemap entry and IndexNow payload is
 * built from `siteOrigin()`. Nothing else in the SEO module may hard-code the
 * domain: the domain changes (a custom domain, a staging origin) and every
 * public URL has to follow it in the same commit.
 *
 * The origin is read from `SITE_ORIGIN` when it is set, so a preview
 * deployment can advertise itself without editing the source. The default is
 * the production domain the project ships on.
 */

const DEFAULT_SITE_ORIGIN = 'https://careerdev4ai.pages.dev';

export const SITE_NAME = 'CareerDev4AI';

/**
 * The other written forms of the name, for the `alternateName` property.
 *
 * A search engine that has seen "Career Dev 4AI" in a query needs to be able to
 * match it to this site. The list holds only spellings of the same product —
 * never a different product, and never a name the site does not use.
 */
export const SITE_ALTERNATE_NAMES = ['Career Dev 4AI', 'CareerDev4AI Career Platform'] as const;

/** The one-line description of the product, used where no better one exists. */
export const SITE_TAGLINE = 'Your personal career operating system';

/** The author credited in the document metadata. */
export const SITE_AUTHOR = 'Ahmed Ebrahim';

/** The organisation behind the product. Used in the Organization schema. */
export const SITE_ORGANIZATION = {
  name: SITE_NAME,
  legalName: 'CareerDev4AI',
  url: DEFAULT_SITE_ORIGIN,
  logo: `${DEFAULT_SITE_ORIGIN}/brand/icon-512.png`,
  sameAs: [] as string[],
};

/**
 * The origin every public URL is built from.
 *
 * A trailing slash is stripped so `absoluteUrl('/about')` and
 * `absoluteUrl('about')` cannot produce two different canonical URLs.
 */
export function siteOrigin(): string {
  const configured = (process.env.SITE_ORIGIN ?? '').trim();
  const origin = configured.length > 0 ? configured : DEFAULT_SITE_ORIGIN;
  return origin.replace(/\/+$/, '');
}

/**
 * The canonical address of the site's home page, with its trailing slash.
 *
 * The home page is the one URL that is written with a trailing slash, so this
 * is the form used by the canonical link, by `og:url` and by the `url` of the
 * `WebSite` schema. Using one form everywhere is what stops a search engine
 * from treating `https://host` and `https://host/` as two different addresses
 * for the same site — and from showing the site name under either one.
 */
export function siteUrl(): string {
  return `${siteOrigin()}/`;
}

/**
 * Builds an absolute URL for a site-relative path.
 *
 * A path that is already absolute is returned untouched, so a caller can pass
 * either form without producing a doubled origin.
 */
export function absoluteUrl(path: string): string {
  if (!path) return `${siteOrigin()}/`;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin()}${normalized}`;
}

/** The absolute URL of the Open Graph / Twitter card image. */
export function ogImageUrl(): string {
  return absoluteUrl('/brand/og-image-1200x630.png');
}

/**
 * Turns a title into a URL-safe slug.
 *
 * Slugs are the public identity of a catalogue entry, so the rule is stable
 * and conservative: lowercase, ASCII-ish, single hyphens, no trailing hyphen.
 */
export function slugify(value: string): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Truncates a description to a length search engines will display, cutting on
 * a word boundary so a description never ends mid-word.
 */
export function clampDescription(value: string, max = 160): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
