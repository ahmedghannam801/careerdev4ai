/**
 * SEO verification against the live production site.
 *
 * The search-engine side of a deployment breaks quietly: a sitemap that
 * stops being served, a verification file that 404s, a canonical link that
 * points at the wrong host, a page that answers 200 with an empty document.
 * None of that breaks the application, and all of it is invisible until a
 * search engine notices.
 *
 * This script checks the live site the way a crawler would:
 *
 *   - the home page, the public pages and the sitemap answer 200;
 *   - robots.txt is served, allows the public pages and points at the
 *     sitemap;
 *   - the sitemap is well formed, uses the production domain and lists no
 *     private URL;
 *   - the Search Console verification file is served with its token;
 *   - every public page has its own title, its own description and a
 *     canonical link that matches the address it was requested at;
 *   - the structured data on a page parses and describes that page;
 *   - the Google tag is in the document and the policy allows it;
 *   - the IndexNow key file is served, when a key is configured.
 *
 * Usage: node scripts/production/verify-production-seo.cjs [base-url]
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BASE = (process.argv[2] || 'https://careerdev4ai.pages.dev').replace(/\/+$/, '');
const VERIFICATION_FILE = 'googleecc4c0f834a5c71c.html';
const VERIFICATION_TOKEN = 'google-site-verification: googleecc4c0f834a5c71c.html';

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function envValue(name) {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

/** Reads one tag's content out of a document. */
function meta(html, attribute, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(`<meta[^>]*${attribute}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i')
  );
  return match ? match[1] : '';
}

/** Reads the canonical link out of a document. */
function canonical(html) {
  const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/** Reads the title out of a document. */
function title(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1] : '';
}

/** Fetches a path and returns the response and its body. */
async function get(pathname) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'manual',
  });
  const body = await response.text();
  return { response, body, status: response.status, path: pathname };
}

async function main() {
  console.log(`SEO verification against ${BASE}\n`);

  // ---- 1. The pages a crawler asks for -----------------------------------
  console.log('Public documents');

  const required = [
    { path: '/', name: 'the home page' },
    { path: '/robots.txt', name: 'robots.txt' },
    { path: '/sitemap.xml', name: 'the sitemap' },
    { path: `/${VERIFICATION_FILE}`, name: 'the Search Console verification file' },
    { path: '/about', name: 'the about page' },
    { path: '/careers', name: 'the career catalogue' },
    { path: '/learning', name: 'the learning catalogue' },
    { path: '/opportunities', name: 'the opportunities catalogue' },
    { path: '/privacy', name: 'the privacy page' },
  ];

  const documents = new Map();
  for (const item of required) {
    const result = await get(item.path);
    documents.set(item.path, result);
    record(
      `${item.name} answers 200`,
      result.status === 200,
      `${result.path} -> ${result.status}`
    );
  }

  // ---- 2. The verification file ------------------------------------------
  console.log('\nSearch Console');
  const verification = documents.get(`/${VERIFICATION_FILE}`);
  record(
    'the verification file carries its token',
    Boolean(verification) && verification.body.includes(VERIFICATION_TOKEN)
  );

  // ---- 3. robots.txt ------------------------------------------------------
  console.log('\nrobots.txt');
  const robots = documents.get('/robots.txt');
  if (robots) {
    record('robots.txt allows the public pages', /^Allow: \/$/m.test(robots.body));
    record('robots.txt keeps the API out', /^Disallow: \/api\/$/m.test(robots.body));
    record(
      'robots.txt points at the production sitemap',
      robots.body.includes(`Sitemap: ${BASE}/sitemap.xml`)
    );
    record(
      'robots.txt is not the edge placeholder',
      !robots.body.includes('content signals'),
      'the document is ours, not a generated default'
    );
  }

  // ---- 4. The sitemap -----------------------------------------------------
  console.log('\nThe sitemap');
  const sitemap = documents.get('/sitemap.xml');
  if (sitemap) {
    const locations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    record('the sitemap lists URLs', locations.length > 0, `${locations.length} URLs`);
    record(
      'every URL uses the production domain',
      locations.every((location) => location.startsWith(`${BASE}/`))
    );
    record(
      'no URL carries a hash',
      locations.every((location) => !location.includes('#'))
    );
    record(
      'no private URL is listed',
      locations.every(
        (location) => !/\/(dashboard|settings|documents|cv-studio|applications)(\/|$)/.test(location)
      )
    );
    record(
      'the home page is listed',
      locations.includes(`${BASE}/`)
    );
    record(
      'the catalogue pages are listed',
      locations.includes(`${BASE}/careers`) &&
        locations.includes(`${BASE}/learning`) &&
        locations.includes(`${BASE}/opportunities`)
    );
  }

  // ---- 5. The metadata of every public page ------------------------------
  console.log('\nPage metadata');
  const titles = new Map();
  const descriptions = new Map();
  const pagePaths = [
    '/',
    '/about',
    '/privacy',
    '/careers',
    '/learning',
    '/opportunities',
  ];

  for (const pagePath of pagePaths) {
    const result = documents.get(pagePath) ?? (await get(pagePath));
    const pageTitle = title(result.body);
    const description = meta(result.body, 'name', 'description');
    const link = canonical(result.body);
    const robotsDirective = meta(result.body, 'name', 'robots');

    record(
      `${pagePath} has a title`,
      pageTitle.length > 0,
      pageTitle.slice(0, 60)
    );
    record(
      `${pagePath} has a description`,
      description.length > 60,
      `${description.length} characters`
    );
    record(
      `${pagePath} has a canonical link of its own`,
      link === `${BASE}${pagePath === '/' ? '/' : pagePath}`,
      link
    );
    record(
      `${pagePath} may be indexed`,
      /^index, follow/.test(robotsDirective),
      robotsDirective
    );
    record(`${pagePath} declares Open Graph`, meta(result.body, 'property', 'og:title') !== '');
    record(
      `${pagePath} declares a Twitter card`,
      meta(result.body, 'name', 'twitter:card') !== ''
    );

    if (!titles.has(pageTitle)) titles.set(pageTitle, pagePath);
    if (!descriptions.has(description)) descriptions.set(description, pagePath);
  }

  record(
    'no two public pages share a title',
    titles.size === pagePaths.length,
    `${titles.size} distinct titles for ${pagePaths.length} pages`
  );
  record(
    'no two public pages share a description',
    descriptions.size === pagePaths.length,
    `${descriptions.size} distinct descriptions for ${pagePaths.length} pages`
  );

  // ---- 6. The structured data ---------------------------------------------
  console.log('\nStructured data');
  const about = documents.get('/about');
  if (about) {
    const blocks = [...about.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    record('the about page publishes structured data', blocks.length > 0, `${blocks.length} blocks`);

    let parsed = 0;
    for (const block of blocks) {
      try {
        const value = JSON.parse(block[1]);
        if (value['@context'] === 'https://schema.org' && value['@type']) parsed += 1;
      } catch {
        /* counted below as a failure */
      }
    }
    record(
      'every block is valid schema.org JSON-LD',
      parsed === blocks.length,
      `${parsed} of ${blocks.length} blocks`
    );
  }

  // ---- 7. The measurement -------------------------------------------------
  console.log('\nThe measurement');
  const home = documents.get('/');
  if (home) {
    record(
      'the Google tag is in the document',
      home.body.includes('googletagmanager.com/gtag/js?id=G-KVH4XKTE23')
    );
    const csp = home.response.headers.get('content-security-policy') ?? '';
    record(
      'the policy allows the Google tag',
      csp.includes('https://www.googletagmanager.com'),
      csp ? 'the policy names the tag host' : 'no policy header'
    );
    record(
      'the policy allows the measurement endpoint',
      csp.includes('https://www.google-analytics.com')
    );
    record(
      'the policy still refuses inline scripts',
      csp.includes("script-src 'self'") && !csp.includes("script-src 'self' 'unsafe-inline'")
    );
  }

  // ---- 8. IndexNow --------------------------------------------------------
  console.log('\nIndexNow');
  const indexNowKey = envValue('INDEXNOW_KEY');
  if (indexNowKey) {
    const keyFile = await get(`/${indexNowKey}.txt`);
    record(
      'the key file is served with the key',
      keyFile.status === 200 && keyFile.body.trim() === indexNowKey,
      `/${indexNowKey}.txt -> ${keyFile.status}`
    );
  } else {
    console.log('  [SKIP] no INDEXNOW_KEY is configured locally');
  }

  // ---- The summary --------------------------------------------------------
  console.log(`\n${results.length - failures} of ${results.length} checks passed.`);
  if (failures > 0) {
    console.log(`${failures} check(s) failed:`);
    for (const result of results.filter((entry) => !entry.ok)) {
      console.log(`  - ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('The verification could not be completed:', error);
  process.exit(1);
});
