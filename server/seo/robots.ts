/**
 * robots.txt.
 *
 * The file allows the public pages to be crawled and keeps the machine-facing
 * surfaces out of the crawler's way. It is deliberately explicit about what
 * it is not: it is a crawl instruction, not an access control. Every private
 * area of the product is protected by authentication, and a URL that is
 * disallowed here is still a URL a signed-in user can reach.
 *
 * The application's own views are hash-routed (`/#/dashboard`). A fragment is
 * never sent to the server, so there is no path to disallow and none is
 * listed: pretending otherwise would be a false claim. What protects those
 * views is the session check in the application, and the `noindex` directive
 * the client applies to them.
 */

import { absoluteUrl } from './config.ts';

/**
 * The paths that are not crawlable.
 *
 * `/api/` is a JSON surface: it has no content to index, and crawling it
 * produces noise. The administrative route is listed for the same reason.
 */
export const DISALLOWED_PATHS = ['/api/', '/admin'] as const;

/**
 * Builds the robots.txt document.
 *
 * The file is plain ASCII. robots.txt is read by a great many parsers, and a
 * typographic dash is not worth the risk of being read as something else.
 */
export function buildRobotsTxt(): string {
  const lines: string[] = [
    '# CareerDev4AI',
    '#',
    '# The public pages - the home page, the career catalogue, the learning',
    '# catalogue and the volunteering catalogue - are open to every crawler.',
    '#',
    '# This file is a crawl instruction, not a security control. Every private',
    '# area of the application is protected by authentication, and private',
    '# records are never published here.',
    '',
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    '# Sitemaps',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ];
  return lines.join('\n');
}
