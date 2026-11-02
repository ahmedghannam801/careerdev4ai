/**
 * The HTML shell for the public pages.
 *
 * The public pages are rendered on the server by the Cloudflare Pages worker,
 * so a crawler receives the whole document — headings, links, text — in the
 * first response. Nothing here runs JavaScript: the document is static HTML
 * with an inline stylesheet, which is why the pages are served with a
 * `script-src 'none'` content-security policy.
 *
 * The stylesheet is written by hand rather than generated from the React
 * bundle so that a public page does not depend on the application build. The
 * colours are the same tokens the application uses (`src/index.css`), so the
 * two surfaces look like one product.
 */

import { SITE_NAME, SITE_TAGLINE, absoluteUrl, ogImageUrl } from './config.ts';

/**
 * Escapes text for interpolation into HTML.
 *
 * Every dynamic value that reaches a public page goes through this. The
 * catalogue is curated rather than user-written, but the rule is applied
 * anyway: an escaping bug must not be one unescaped field away.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for use inside a JSON-LD script block.
 *
 * `</script` inside a JSON string would end the block early, so the sequence
 * is broken. The other characters are escaped so the JSON stays valid in an
 * HTML context.
 */
export function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A link inside a public page. */
export interface PublicLink {
  href: string;
  label: string;
}

/**
 * A public page ready to be rendered.
 *
 * The shape is deliberately narrow: a title, a description, a canonical path
 * and a body. Everything else — Open Graph, Twitter, structured data — is
 * derived, so two pages cannot disagree about their own metadata.
 */
export interface PublicPage {
  /** The site-relative path, e.g. `/careers/software-engineer`. */
  path: string;
  /** The unique document title. */
  title: string;
  /** The unique meta description. */
  description: string;
  /** The body content, as trusted HTML. */
  body: string;
  /** The Open Graph type. */
  ogType?: 'website' | 'article';
  /** The JSON-LD blocks to embed. */
  jsonLd?: unknown[];
  /** Breadcrumb entries, from the root to this page. */
  breadcrumb?: Array<{ name: string; path: string }>;
  /** Whether the page must be kept out of the index. */
  noindex?: boolean;
  /** Extra links shown in the footer of this page. */
  footerLinks?: PublicLink[];
}

/** The stylesheet shared by every public page. */
const PAGE_STYLES = `
:root {
  --bg: #F5F0E8;
  --surface: #FFFFFF;
  --surface-2: #F2EEE7;
  --primary: #B94736;
  --primary-hover: #A33D2E;
  --text: #282B29;
  --text-2: #686D76;
  --accent: #95594E;
  --border: #E1DDD5;
  --border-strong: #CBC5B9;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Plus Jakarta Sans", "IBM Plex Sans Arabic", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
  font-size: 16px;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
a { color: var(--primary); }
a:hover { color: var(--primary-hover); }
.site-header {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky; top: 0; z-index: 10;
}
.site-header .wrap {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; min-height: 68px; flex-wrap: wrap;
}
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); font-weight: 700; }
.brand img { width: 34px; height: 34px; border-radius: 9px; }
.brand span { font-size: 1.05rem; letter-spacing: -0.01em; }
.site-nav { display: flex; gap: 22px; flex-wrap: wrap; font-size: 0.9rem; }
.site-nav a { color: var(--text-2); text-decoration: none; font-weight: 500; }
.site-nav a:hover { color: var(--primary); }
main { padding: 48px 0 72px; }
.hero { padding: 8px 0 40px; max-width: 760px; }
.breadcrumb { font-size: 0.82rem; color: var(--text-2); margin-bottom: 18px; }
.breadcrumb a { color: var(--text-2); }
.breadcrumb span[aria-current] { color: var(--text); }
h1 { font-size: clamp(1.9rem, 4vw, 2.75rem); line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 14px; }
h2 { font-size: clamp(1.25rem, 2.2vw, 1.6rem); line-height: 1.25; letter-spacing: -0.01em; margin: 44px 0 14px; }
h3 { font-size: 1.05rem; margin: 0 0 6px; }
.lede { font-size: 1.08rem; color: var(--text-2); margin: 0; }
section { margin-top: 40px; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 20px;
}
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
.grid .card h3 a { text-decoration: none; }
.grid .card p { margin: 6px 0 0; color: var(--text-2); font-size: 0.92rem; }
.chip {
  display: inline-block; font-size: 0.74rem; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--accent); background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 999px; padding: 2px 10px; font-weight: 600;
}
.meta { color: var(--text-2); font-size: 0.88rem; margin: 10px 0 0; }
ul.clean { list-style: none; padding: 0; margin: 12px 0 0; }
ul.clean li { padding: 7px 0; border-bottom: 1px solid var(--border); }
ul.clean li:last-child { border-bottom: 0; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tag { font-size: 0.8rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; color: var(--text-2); }
.cta { margin-top: 28px; display: flex; gap: 12px; flex-wrap: wrap; }
.button {
  display: inline-block; background: var(--primary); color: #fff; text-decoration: none;
  border-radius: 10px; padding: 11px 20px; font-weight: 600; font-size: 0.95rem;
}
.button:hover { background: var(--primary-hover); color: #fff; }
.button.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border-strong); }
.button.secondary:hover { background: var(--surface-2); color: var(--text); }
.site-footer { border-top: 1px solid var(--border); background: var(--surface); padding: 34px 0; font-size: 0.88rem; color: var(--text-2); }
.site-footer .wrap { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.site-footer nav { display: flex; gap: 18px; flex-wrap: wrap; }
.site-footer a { color: var(--text-2); }
@media (max-width: 640px) {
  .site-nav { gap: 14px; font-size: 0.85rem; }
  main { padding: 32px 0 56px; }
}
`;

/** The links shown in the header of every public page. */
const HEADER_LINKS: PublicLink[] = [
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/learning', label: 'Learning' },
  { href: '/opportunities', label: 'Opportunities' },
];

/**
 * Renders the `<head>` of a public page.
 *
 * The metadata is deliberately complete and explicit: a unique title, a unique
 * description, a canonical URL, the Open Graph set and the Twitter/X card.
 * Every one of them is derived from the page itself, so two pages cannot end
 * up sharing a description by accident.
 */
function renderHead(page: PublicPage): string {
  const canonical = absoluteUrl(page.path);
  const ogImage = ogImageUrl();
  const robots = page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const jsonLd = (page.jsonLd ?? [])
    .map(
      (block) =>
        `    <script type="application/ld+json">${escapeJsonLd(block)}</script>`
    )
    .join('\n');

  return `  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="author" content="Ahmed Ebrahim" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:type" content="${page.ogType ?? 'website'}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="The CareerDev4AI logo: an orange orbital arrow mark with a white orbit and star." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <meta name="theme-color" content="#B94736" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon-180.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>${PAGE_STYLES}</style>
${jsonLd}
  </head>`;
}

/** Renders the breadcrumb trail of a page, if it has one. */
function renderBreadcrumb(page: PublicPage): string {
  const trail = page.breadcrumb ?? [];
  if (trail.length <= 1) return '';
  const parts = trail.map((entry, index) => {
    const isLast = index === trail.length - 1;
    const label = escapeHtml(entry.name);
    if (isLast) return `<span aria-current="page">${label}</span>`;
    return `<a href="${escapeHtml(entry.path)}">${label}</a>`;
  });
  return `      <nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' <span aria-hidden="true">/</span> ')}</nav>`;
}

/**
 * Renders a complete public page as an HTML document.
 *
 * The document is fully server-rendered. There is no script on the page and
 * no client-side hydration, so a crawler, a text browser and a screen reader
 * all receive the same content.
 */
export function renderPublicPage(page: PublicPage): string {
  const links = (page.footerLinks ?? HEADER_LINKS)
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en" dir="ltr">
${renderHead(page)}
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">
          <img src="/brand/icon-512.png" width="34" height="34" alt="" />
          <span>${escapeHtml(SITE_NAME)}</span>
        </a>
        <nav class="site-nav" aria-label="Main">
${HEADER_LINKS.map((link) => `          <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('\n')}
        </nav>
      </div>
    </header>
    <main>
      <div class="wrap">
${renderBreadcrumb(page)}
${page.body}
      </div>
    </main>
    <footer class="site-footer">
      <div class="wrap">
        <div>
          <strong>${escapeHtml(SITE_NAME)}</strong><br />
          ${escapeHtml(SITE_TAGLINE)}. &copy; 2026 ${escapeHtml(SITE_NAME)}.
        </div>
        <nav aria-label="Footer">
${links}
        </nav>
      </div>
    </footer>
  </body>
</html>
`;
}

/**
 * The content-security policy for a public page.
 *
 * The page runs no JavaScript at all, so `script-src 'none'` is accurate and
 * is the strongest statement the page can make. `connect-src 'none'` says the
 * same about the network.
 */
export const PUBLIC_PAGE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "form-action 'self'; script-src 'none'; connect-src 'none'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; " +
  "manifest-src 'self'; upgrade-insecure-requests";
