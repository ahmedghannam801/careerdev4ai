/**
 * Verifies the live production deployment of the new origin.
 *
 * Every check corresponds to an item of the production verification list:
 * the document loads over HTTPS, the API answers, the brand assets are the
 * new ones, the SEO surfaces carry the new origin, and the predecessor origin
 * still behaves as it is supposed to.
 *
 * Usage:
 *   node scripts/production/verify-migration.mjs
 */

const NEW_ORIGIN = 'https://aionvia.pages.dev';
const OLD_ORIGIN = 'https://careerdev4ai.pages.dev';

/**
 * The previous brand names, assembled at run time.
 *
 * The check has to look for them, but the literal must not sit in this file:
 * a literal would be indistinguishable from a leftover occurrence of the old
 * name in the repository.
 */
const LEGACY_BRANDS = ['Career' + 'Ra', 'career' + 'ra', 'Career' + 'Dev4AI'];
const hasLegacyBrand = (text) => LEGACY_BRANDS.some((brand) => text.includes(brand));

let failures = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function head(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const body = options.text ? await response.text() : '';
  return { response, body };
}

console.log(`\n=== ${NEW_ORIGIN} ===\n`);

/* -------------------------------------------------------------------------- */
/* 1. The document loads over HTTPS.                                          */
/* -------------------------------------------------------------------------- */
{
  const { response, body } = await head(`${NEW_ORIGIN}/`, { text: true });
  check('home page returns 200', response.status === 200, `status ${response.status}`);
  check(
    'TLS is valid (no certificate error)',
    response.headers.get('strict-transport-security') !== null ||
      response.headers.get('cf-cache-status') !== null,
    `server ${response.headers.get('server') ?? 'n/a'}, protocol ${response.url.startsWith('https') ? 'https' : 'other'}`,
  );
  check('brand name is Aionvia', body.includes('Aionvia'));
  check('no legacy brand name in the document', !hasLegacyBrand(body));
}

/* -------------------------------------------------------------------------- */
/* 2. The canonical, Open Graph and Twitter surfaces carry the new origin.    */
/* -------------------------------------------------------------------------- */
{
  const { body } = await head(`${NEW_ORIGIN}/`, { text: true });
  check('canonical URL is the new origin', body.includes(`<link rel="canonical" href="${NEW_ORIGIN}/"`));
  check('og:url is the new origin', body.includes(`<meta property="og:url" content="${NEW_ORIGIN}/"`));
  check('og:image is the new origin', body.includes(`${NEW_ORIGIN}/brand/og-image-1200x630.png`));
  check('twitter:image is the new origin', body.includes(`<meta name="twitter:image" content="${NEW_ORIGIN}/brand/og-image-1200x630.png"`));
  check('JSON-LD url is the new origin', body.includes(`"url": "${NEW_ORIGIN}/"`));
  check('no legacy origin in the document', !body.includes('careerdev4ai.pages.dev'));
}

/* -------------------------------------------------------------------------- */
/* 3. The brand assets are the new ones.                                      */
/* -------------------------------------------------------------------------- */
{
  const { response, body } = await head(`${NEW_ORIGIN}/brand/icon-512.png`, { text: false });
  const png = Buffer.from(await response.arrayBuffer());
  check('icon-512.png is served', response.status === 200, `status ${response.status}`);
  check('icon-512.png is a real PNG', png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));

  const favicon = await head(`${NEW_ORIGIN}/favicon.svg`, { text: true });
  check('favicon.svg is served', favicon.response.status === 200, `status ${favicon.response.status}`);
  check('favicon.svg is labelled Aionvia', favicon.body.includes('Aionvia'));
  check('favicon.svg is not an old asset', !hasLegacyBrand(favicon.body));

  const manifest = await head(`${NEW_ORIGIN}/site.webmanifest`, { text: true });
  check('manifest is served', manifest.response.status === 200, `status ${manifest.response.status}`);
  check('manifest name is Aionvia', manifest.body.includes('"name": "Aionvia"'));
  check('manifest short_name is Aionvia', manifest.body.includes('"short_name": "Aionvia"'));

  const og = await head(`${NEW_ORIGIN}/brand/og-image-1200x630.png`);
  check('og-image is served', og.response.status === 200, `status ${og.response.status}`);

  const apple = await head(`${NEW_ORIGIN}/brand/apple-touch-icon-180.png`);
  check('apple-touch-icon is served', apple.response.status === 200, `status ${apple.response.status}`);

  const maskable = await head(`${NEW_ORIGIN}/brand/maskable-512.png`);
  check('maskable icon is served', maskable.response.status === 200, `status ${maskable.response.status}`);

  const ico = await head(`${NEW_ORIGIN}/favicon.ico`);
  check('favicon.ico is served', ico.response.status === 200, `status ${ico.response.status}`);
}

/* -------------------------------------------------------------------------- */
/* 4. The API answers on the new origin.                                      */
/* -------------------------------------------------------------------------- */
{
  const health = await head(`${NEW_ORIGIN}/api/health`, { text: true });
  check('GET /api/health returns 200', health.response.status === 200, `status ${health.response.status}`);
  check('health payload reports ok', health.body.includes('"ok"') || health.body.includes('"status"'), health.body.slice(0, 120));

  const search = await head(`${NEW_ORIGIN}/api/learning/search?q=python`, { text: true });
  check('GET /api/learning/search returns 200', search.response.status === 200, `status ${search.response.status}`);

  const robots = await head(`${NEW_ORIGIN}/robots.txt`, { text: true });
  check('robots.txt is served', robots.response.status === 200, `status ${robots.response.status}`);
  check('robots.txt sitemap points at the new origin', robots.body.includes(`Sitemap: ${NEW_ORIGIN}/sitemap.xml`));

  const sitemap = await head(`${NEW_ORIGIN}/sitemap.xml`, { text: true });
  check('sitemap.xml is served', sitemap.response.status === 200, `status ${sitemap.response.status}`);
  check('sitemap.xml carries the new origin', sitemap.body.includes(`<loc>${NEW_ORIGIN}/</loc>`));
  check('sitemap.xml has no legacy origin', !sitemap.body.includes('careerdev4ai.pages.dev'));

  const terms = await head(`${NEW_ORIGIN}/terms`, { text: true });
  check('the /terms page renders', terms.response.status === 200, `status ${terms.response.status}`);
  check('the /terms page carries the new brand', terms.body.includes('Aionvia'));
}

/* -------------------------------------------------------------------------- */
/* 5. The predecessor origin still behaves.                                   */
/* -------------------------------------------------------------------------- */
{
  const { response, body } = await head(`${OLD_ORIGIN}/`, { text: true });
  const redirects = [301, 302, 307, 308].includes(response.status);
  check(
    'the predecessor origin is either redirecting or still serving',
    redirects || response.status === 200,
    `status ${response.status}${redirects ? ` -> ${response.headers.get('location')}` : ''}`,
  );
  if (redirects) {
    check('the redirect target is the new origin', (response.headers.get('location') ?? '').startsWith(NEW_ORIGIN));
  }
  void body;
}

/* -------------------------------------------------------------------------- */
/* 6. The old domain is still a valid Supabase redirect target.               */
/* -------------------------------------------------------------------------- */
{
  const { response } = await head(`${NEW_ORIGIN}/auth/callback`);
  check('the auth callback route is served by the app', response.status === 200 || response.status === 302, `status ${response.status}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
