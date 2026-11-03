/**
 * Behavioural checks for the public SEO surface and the analytics.
 *
 * The application is a hash-routed single-page application, so the public
 * pages are the only thing a crawler can actually index. These tests hold
 * three lines in place.
 *
 * First, that what is published is publishable: a unique title, a unique
 * description, an absolute canonical URL and structured data that describes
 * the page it is on. Two pages that share a title are two pages a search
 * engine will treat as one.
 *
 * Second, that what is not public stays out: the sitemap carries no private
 * URL, no hash URL and no URL of the signed-in application.
 *
 * Third, that the measurement carries nothing personal. The path that is
 * reported is built from the route, so a public profile's username can never
 * reach the analytics property.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CAREER_ROLES } from '../shared/careerRoles.ts';
import { ANALYTICS_EVENTS } from '../shared/analyticsEvents.ts';
import { absoluteUrl, clampDescription, siteOrigin, siteUrl, slugify } from '../server/seo/config.ts';
import { websiteSchema } from '../server/seo/jsonld.ts';
import { escapeHtml, escapeJsonLd } from '../server/seo/html.ts';
import { DISALLOWED_PATHS, buildRobotsTxt } from '../server/seo/robots.ts';
import { buildSitemapXml, collectSitemapEntries } from '../server/seo/sitemap.ts';
import {
  VERIFICATION_FILE_NAME,
  VERIFICATION_PATH,
  verificationFileBody,
} from '../server/seo/verification.ts';
import {
  coursePath,
  learningCategoryPath,
  opportunityPath,
  resolvePublicPage,
  rolePath,
} from '../server/seo/publicPages.ts';
import { analyticsPathForRoute } from '../src/lib/analytics.ts';
import { routeMetaFor } from '../src/lib/seo.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

/** The public pages that must exist and must be indexable. */
const STATIC_PAGES = ['/about', '/privacy', '/terms'];

describe('the public pages', () => {
  it('serves the static pages', async () => {
    for (const path of STATIC_PAGES) {
      const page = await resolvePublicPage(path);
      assert.ok(page, `${path} should resolve to a page`);
      assert.equal(page.status, 200);
      assert.match(page.contentType, /text\/html/);
    }
  });

  it('gives every page a title of its own', async () => {
    const titles = new Map<string, string>();
    const paths = [
      ...STATIC_PAGES,
      '/careers',
      '/learning',
      '/opportunities',
      rolePath(CAREER_ROLES[0]),
    ];

    for (const path of paths) {
      const page = await resolvePublicPage(path);
      assert.ok(page, `${path} should resolve to a page`);
      const title = /<title>([^<]*)<\/title>/.exec(page.html)?.[1];
      assert.ok(title, `${path} should have a title`);
      assert.equal(
        titles.has(title),
        false,
        `${path} reuses the title of ${titles.get(title)}`
      );
      titles.set(title!, path);
    }
  });

  it('gives every page a description of its own', async () => {
    const descriptions = new Map<string, string>();
    const paths = [...STATIC_PAGES, '/careers', '/learning', '/opportunities'];

    for (const path of paths) {
      const page = await resolvePublicPage(path);
      assert.ok(page, `${path} should resolve to a page`);
      const description = /name="description" content="([^"]*)"/.exec(page.html)?.[1];
      assert.ok(description, `${path} should have a description`);
      assert.ok(
        description.length > 60,
        `${path} has a description of only ${description.length} characters`
      );
      assert.equal(
        descriptions.has(description),
        false,
        `${path} reuses the description of ${descriptions.get(description)}`
      );
      descriptions.set(description!, path);
    }
  });

  it('gives every page an absolute canonical URL that matches its path', async () => {
    for (const path of [...STATIC_PAGES, '/careers', '/learning', '/opportunities']) {
      const page = await resolvePublicPage(path);
      assert.ok(page);
      const canonical = /rel="canonical" href="([^"]*)"/.exec(page.html)?.[1];
      assert.equal(canonical, absoluteUrl(path));
      assert.match(canonical!, /^https:\/\//);
    }
  });

  it('lets a crawler index the public pages', async () => {
    for (const path of STATIC_PAGES) {
      const page = await resolvePublicPage(path);
      assert.ok(page);
      assert.match(page.html, /name="robots" content="index, follow/);
    }
  });

  it('publishes structured data that describes the page', async () => {
    const page = await resolvePublicPage('/about');
    assert.ok(page);
    const blocks = [...page.html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    assert.ok(blocks.length > 0, 'the page should carry structured data');

    for (const block of blocks) {
      const parsed = JSON.parse(block[1]);
      assert.equal(parsed['@context'], 'https://schema.org');
      assert.ok(parsed['@type'], 'every block declares its type');
    }
  });

  it('answers a page that does not exist with nothing at all', async () => {
    const page = await resolvePublicPage('/careers/not-a-role-that-exists');
    assert.equal(page, null);
  });
});

describe('the public pages in production', () => {
  it('forwards every public page to the application', () => {
    // The Pages worker serves the static asset binding for every path it
    // does not forward, and the binding answers an unknown path with the SPA
    // shell. A public page that is registered in the application but not
    // forwarded would therefore be published as the application shell instead
    // of the page itself. The two lists have to stay in step.
    const application = readFileSync(join(REPO_ROOT, 'app.ts'), 'utf-8');
    const worker = readFileSync(join(REPO_ROOT, 'worker', 'index.ts'), 'utf-8');

    const registered = [
      ...application.matchAll(/app\.get\('([^']+)',\s*publicPageHandler\)/g),
    ].map((match) => match[1]);

    assert.ok(registered.length >= 8, `expected the public page routes to be found, found ${registered.length}`);

    for (const route of registered) {
      // A parameterised route is covered by its prefix in the worker.
      const prefix = route.split('/')[1];
      assert.ok(
        worker.includes(`'${route}'`) || worker.includes(`'/${prefix}'`),
        `the Pages worker does not forward the public page ${route}`
      );
    }

    // The published legal documents are forwarded by name, so a document that
    // is published must not be answered with the application shell.
    for (const legalPath of ['/privacy', '/terms']) {
      assert.ok(
        worker.includes(`'${legalPath}'`),
        `the Pages worker does not forward ${legalPath}`
      );
    }
  });
});

describe('the sitemap', () => {
  it('lists only public URLs', async () => {
    const entries = await collectSitemapEntries();
    assert.ok(entries.length > 0);

    for (const entry of entries) {
      assert.ok(entry.path.startsWith('/'), `${entry.path} should be a site-relative path`);
      assert.equal(entry.path.includes('#'), false, `${entry.path} carries a hash`);
      assert.equal(
        entry.path.startsWith('/app'),
        false,
        `${entry.path} is a signed-in view and must not be listed`
      );
    }
  });

  it('uses the production domain', async () => {
    const xml = buildSitemapXml([
      { path: '/' },
      { path: '/about' },
    ]);
    assert.match(xml, /<loc>https:\/\/careerdev4ai\.pages\.dev\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/careerdev4ai\.pages\.dev\/about<\/loc>/);
    assert.equal(xml.includes('careerpilot'), false);
  });

  it('lists the home page and the catalogue pages', async () => {
    const entries = await collectSitemapEntries();
    const paths = entries.map((entry) => entry.path);
    assert.ok(paths.includes('/'));
    assert.ok(paths.includes('/about'));
    assert.ok(paths.includes('/careers'));
    assert.ok(paths.includes('/learning'));
    assert.ok(paths.includes('/opportunities'));
  });

  it('lists a page for every career role', async () => {
    const entries = await collectSitemapEntries();
    const paths = new Set(entries.map((entry) => entry.path));
    for (const role of CAREER_ROLES) {
      assert.ok(paths.has(rolePath(role)), `${role.id} has no sitemap entry`);
    }
  });

  it('is well formed enough to be read', async () => {
    const xml = buildSitemapXml([{ path: '/', priority: 1, changefreq: 'weekly' }]);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.equal((xml.match(/<url>/g) ?? []).length, (xml.match(/<\/url>/g) ?? []).length);
  });

  it('writes the date of a change in the form a parser expects', async () => {
    const xml = buildSitemapXml([
      { path: '/learning/course/abc', lastmod: '2026-10-29T22:20:38.881672+00:00' },
    ]);
    assert.match(xml, /<lastmod>2026-10-29<\/lastmod>/);
    assert.equal(xml.includes('22:20:38'), false, 'the time of day is not written');
  });
});

describe('robots.txt', () => {
  it('allows the public pages and keeps the machine surfaces out', () => {
    const robots = buildRobotsTxt();
    assert.match(robots, /^User-agent: \*/m);
    assert.match(robots, /^Allow: \/$/m);
    for (const path of DISALLOWED_PATHS) {
      assert.match(robots, new RegExp(`^Disallow: ${path.replace('/', '\\/')}$`, 'm'));
    }
  });

  it('points at the sitemap', () => {
    assert.match(buildRobotsTxt(), /^Sitemap: https:\/\/careerdev4ai\.pages\.dev\/sitemap\.xml$/m);
  });

  it('matches the copy that is deployed as a static file', () => {
    // The static copy exists so a deployment that serves the asset binding
    // directly still publishes the same rules. The test is what stops the two
    // from drifting apart.
    const deployed = readFileSync(join(REPO_ROOT, 'public', 'robots.txt'), 'utf-8');
    assert.equal(deployed, buildRobotsTxt());
  });
});

describe('the Search Console verification file', () => {
  it('carries its token at the exact path Google asks for', () => {
    assert.equal(VERIFICATION_PATH, '/googleecc4c0f834a5c71c.html');
    assert.match(verificationFileBody(), /google-site-verification: googleecc4c0f834a5c71c\.html/);
  });

  it('matches the copy that is deployed as a static file', () => {
    const deployed = readFileSync(
      join(REPO_ROOT, 'public', VERIFICATION_FILE_NAME),
      'utf-8'
    );
    assert.equal(deployed, verificationFileBody());
  });
});

describe('the document metadata of the application', () => {
  it('publishes the CareerDev4AI site name in static homepage structured data', () => {
    const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf-8');
    const blocks = [
      ...html.matchAll(
        /<script type="application\/ld\+json" data-app-jsonld="true">([\s\S]*?)<\/script>/g
      ),
    ];
    const schemas = blocks.map((block) => JSON.parse(block[1]));
    const website = schemas.find((schema) => schema['@type'] === 'WebSite');
    assert.ok(website, 'the static homepage must contain WebSite structured data');
    assert.equal(website.name, 'CareerDev4AI');
    assert.deepEqual(website.alternateName, ['Career Dev 4AI', 'CareerDev4AI Career Platform']);
    assert.equal(website.url, 'https://careerdev4ai.pages.dev/');
    assert.equal(websiteSchema().name, website.name);
    assert.equal(websiteSchema().url, website.url);
    assert.equal(websiteSchema().alternateName[0], website.alternateName[0]);
    assert.match(html, /<link rel="canonical" href="https:\/\/careerdev4ai\.pages\.dev\/"\s*\/>/);
    assert.match(html, /<meta property="og:site_name" content="CareerDev4AI"\s*\/>/);
    assert.match(html, /<title>CareerDev4AI — Turn Your Ambition Into a Career Plan<\/title>/);
  });

  it('indexes the landing page and hides the signed-in views', () => {
    assert.match(routeMetaFor('landing').robots, /^index, follow/);
    assert.equal(routeMetaFor('dashboard').robots, 'noindex, nofollow');
    assert.equal(routeMetaFor('cv-studio').robots, 'noindex, nofollow');
    assert.equal(routeMetaFor('settings').robots, 'noindex, nofollow');
  });

  it('indexes a public profile', () => {
    assert.match(routeMetaFor('profile', { isPublicProfile: true }).robots, /^index, follow/);
  });

  it('gives every view a title and a description of its own', () => {
    const views = [
      'landing',
      'onboarding',
      'dashboard',
      'my-career',
      'roles',
      'analysis',
      'plan',
      'roadmap',
      'skills',
      'learning',
      'projects',
      'volunteer',
      'evidence',
      'cv-studio',
      'documents',
      'jobs',
      'applications',
      'interviews',
      'profile',
      'activity',
      'progress',
      'settings',
      'admin',
    ];
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const view of views) {
      const meta = routeMetaFor(view);
      assert.ok(meta.title.length > 0, `${view} has no title`);
      assert.ok(meta.description.length > 40, `${view} has a very short description`);
      assert.equal(titles.has(meta.title), false, `${view} reuses a title`);
      assert.equal(descriptions.has(meta.description), false, `${view} reuses a description`);
      titles.add(meta.title);
      descriptions.add(meta.description);
    }
  });

  it('always points the canonical link at the home page', () => {
    // The application is one document at one address; a hash is not part of
    // the address a crawler sees.
    for (const view of ['landing', 'dashboard', 'learning']) {
      assert.equal(routeMetaFor(view).canonical, 'https://careerdev4ai.pages.dev/');
    }
  });
});

describe('the analytics', () => {
  it('reports a path that is built from the route', () => {
    assert.equal(analyticsPathForRoute('landing'), '/');
    assert.equal(analyticsPathForRoute('dashboard'), '/app/dashboard');
    assert.equal(analyticsPathForRoute('learning'), '/app/learning');
  });

  it('never reports a public profile username', () => {
    const path = analyticsPathForRoute('profile', 'ahmed.ebrahim');
    assert.equal(path, '/profile');
    assert.equal(path.includes('ahmed'), false);
  });

  it('names only the events the funnel is built from', () => {
    assert.deepEqual([...ANALYTICS_EVENTS].sort(), [
      'learning_complete',
      'learning_start',
      'login',
      'opportunity_click',
      'opportunity_view',
      'project_start',
      'roadmap_enroll',
      'select_career',
      'sign_up',
    ]);
  });

  it('does not name an event after anything personal', () => {
    for (const event of ANALYTICS_EVENTS) {
      assert.equal(
        /email|name|cv|resume|document|profile|user_?id/i.test(event),
        false,
        `${event} names something personal`
      );
    }
  });
});

describe('the escaping helpers', () => {
  it('escapes the characters that would break out of HTML', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
    assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  });

  it('escapes the sequence that would end a JSON-LD block early', () => {
    const escaped = escapeJsonLd({ name: '</script><script>alert(1)</script>' });
    assert.equal(escaped.includes('</script>'), false);
    assert.equal(JSON.parse(escaped).name, '</script><script>alert(1)</script>');
  });
});

describe('the URL helpers', () => {
  it('slugifies a title into a URL fragment', () => {
    assert.equal(slugify('Software Engineer'), 'software-engineer');
    assert.equal(slugify('AI & Machine Learning'), 'ai-machine-learning');
    assert.equal(slugify('  Data  Analyst  '), 'data-analyst');
  });

  it('clamps a description on a word boundary', () => {
    const clamped = clampDescription('one two three four five six seven eight nine ten', 20);
    assert.ok(clamped.length <= 21);
    assert.equal(clamped.endsWith('four'), false);
  });

  it('builds absolute URLs without doubling the origin', () => {
    assert.equal(absoluteUrl('/about'), `${siteOrigin()}/about`);
    assert.equal(absoluteUrl('https://example.com/x'), 'https://example.com/x');
  });

  it('names the public URL of every catalogue entry', () => {
    assert.equal(rolePath(CAREER_ROLES[0]), `/careers/${CAREER_ROLES[0].id}`);
    assert.equal(coursePath('abc'), '/learning/course/abc');
    assert.equal(learningCategoryPath('AI & ML'), '/learning/category/ai-ml');
    assert.equal(opportunityPath('opp-1'), '/opportunities/opp-1');
  });
});
