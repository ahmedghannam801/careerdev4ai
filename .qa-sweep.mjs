/**
 * Landing page QA sweep.
 *
 * Loads the built landing page at each required breakpoint and checks the
 * things that can silently break: horizontal overflow, clipped or broken
 * images, console errors, anchors that point at nothing, and the size of
 * the first paint.
 *
 * Screenshots and the report are written to .qa/ for visual inspection.
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = join(process.cwd(), '.qa');

const BREAKPOINTS = [
  { name: '1920-desktop', width: 1920, height: 1080 },
  { name: '1440-desktop', width: 1440, height: 900 },
  { name: '1024-tablet', width: 1024, height: 900 },
  { name: '768-tablet', width: 768, height: 1024 },
  { name: '390-mobile', width: 390, height: 844 },
  { name: '360-mobile', width: 360, height: 800 },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = [];

for (const bp of BREAKPOINTS) {
  const context = await browser.newContext({
    viewport: { width: bp.width, height: bp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url().slice(0, 120)}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;

    // Anything wider than the viewport is a horizontal overflow.
    const overflowing = [];
    const limit = doc.clientWidth + 1;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > limit || rect.left < -1) {
        const style = getComputedStyle(el);
        // Decorative, deliberately off-canvas layers are allowed.
        if (style.position === 'absolute' && style.pointerEvents === 'none') continue;
        // A child of a horizontally scrollable strip is reachable by scrolling
        // it, so it is not an overflow of the page.
        if (el.closest('.overflow-x-auto')) continue;
        overflowing.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(rect.right)}`
        );
      }
    }

    // Images that never loaded.
    const brokenImages = Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src') ?? '(no src)');

    // Anchors that point at an id the page does not have.
    const brokenAnchors = Array.from(document.querySelectorAll('a[href^="#"]'))
      .map((a) => a.getAttribute('href'))
      .filter((href) => {
        if (!href || href === '#') return false;
        return !document.getElementById(href.slice(1));
      });

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => ({
      level: Number(h.tagName[1]),
      text: (h.textContent ?? '').trim().slice(0, 60),
    }));
    let headingJumps = 0;
    for (let i = 1; i < headings.length; i += 1) {
      if (headings[i].level - headings[i - 1].level > 1) headingJumps += 1;
    }

    const nav = document.querySelector('nav');
    const navOverflow = nav ? nav.scrollWidth > nav.clientWidth + 1 : false;

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      overflowing: overflowing.slice(0, 8),
      brokenImages,
      brokenAnchors: Array.from(new Set(brokenAnchors)),
      h1Count: document.querySelectorAll('h1').length,
      headingJumps,
      navOverflow,
      pageHeight: doc.scrollHeight,
      sections: Array.from(document.querySelectorAll('section[id]')).map((s) => s.id),
    };
  });

  const paint = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = { fcp: null, lcp: null, domContentLoaded: null };
        try {
          const nav = performance.getEntriesByType('navigation')[0];
          out.domContentLoaded = nav ? Math.round(nav.domContentLoadedEventEnd) : null;
        } catch {
          /* not available */
        }
        try {
          const fcp = performance.getEntriesByName('first-contentful-paint')[0];
          out.fcp = fcp ? Math.round(fcp.startTime) : null;
        } catch {
          /* not available */
        }
        try {
          const entries = performance.getEntriesByType('largest-contentful-paint');
          if (entries.length) out.lcp = Math.round(entries[entries.length - 1].startTime);
        } catch {
          /* not available */
        }
        resolve(out);
      })
  );

  const transferBytes = await page.evaluate(() => {
    let total = 0;
    for (const entry of performance.getEntriesByType('resource')) {
      total += entry.transferSize ?? 0;
    }
    return total;
  });

  await page.screenshot({ path: join(OUT, `${bp.name}-hero.png`) });

  const showcase = page.locator('#showcase');
  if (await showcase.count()) {
    await showcase.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${bp.name}-showcase.png`) });
  }

  const journey = page.locator('#how-it-works');
  if (await journey.count()) {
    await journey.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${bp.name}-journey.png`) });
  }

  report.push({
    breakpoint: bp.name,
    ...metrics,
    paint,
    transferKB: Math.round(transferBytes / 1024),
    consoleErrors: consoleErrors.slice(0, 6),
    failedRequests: failedRequests.slice(0, 6),
  });

  await context.close();
}

await browser.close();

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(
  report
    .map(
      (r) =>
        `${r.breakpoint.padEnd(16)} overflow=${r.horizontalOverflow} navOverflow=${r.navOverflow} ` +
        `brokenImg=${r.brokenImages.length} brokenAnchor=${r.brokenAnchors.length} h1=${r.h1Count} ` +
        `jumps=${r.headingJumps} height=${r.pageHeight} fcp=${r.paint.fcp}ms transfer=${r.transferKB}kb ` +
        `errors=${r.consoleErrors.length} failed=${r.failedRequests.length}`
    )
    .join('\n')
);
