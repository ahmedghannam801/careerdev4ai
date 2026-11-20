/**
 * The motion checks the page cannot fail on its own.
 *
 * Two things are checked here that a screenshot cannot show:
 *
 *   1. ARRIVAL. Every section must arrive when the reader reaches it — under
 *      the visitor's own motion preference AND under reduced motion. A
 *      reveal that never fires is a blank page, and it is the single worst
 *      failure a motion system can have.
 *   2. FRAME TIMING. The page is scrolled while the frames are counted, so
 *      the smoothness of the landing page is measured rather than asserted.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.QA_URL ?? 'http://127.0.0.1:4173/';
const OUT = join(process.cwd(), '.qa');

const browser = await chromium.launch();

/**
 * Scrolls the page and reports the frames it drew.
 *
 * The measurement is the gap between the timestamps of consecutive frames
 * while the page is being scrolled. A page that keeps up draws its frames
 * at roughly 16.7ms apart.
 */
async function measureScrollFrames(page) {
  return page.evaluate(async () => {
    const gaps = [];
    let last = performance.now();
    let running = true;

    const tick = (now) => {
      gaps.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const total = document.documentElement.scrollHeight;
    const steps = 90;
    for (let i = 0; i <= steps; i += 1) {
      window.scrollTo(0, (total / steps) * i);
      await new Promise((resolve) => setTimeout(resolve, 22));
    }

    running = false;
    await new Promise((resolve) => setTimeout(resolve, 60));

    const sorted = [...gaps].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      frames: gaps.length,
      medianMs: Math.round(at(0.5) * 10) / 10,
      p95Ms: Math.round(at(0.95) * 10) / 10,
      longestMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
    };
  });
}

/**
 * Walks the page and checks that every section ARRIVES.
 *
 * The check is made while the section is on screen, because a reveal that has
 * not been reached yet is correctly still hidden — that is what a scroll
 * reveal is. What must never happen is a section that is on screen and still
 * invisible, because the reveal never fired.
 */
async function walkForArrival(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const sectionCount = await page.evaluate(async () => {
    const sections = Array.from(document.querySelectorAll('section[id]'));
    const invisible = [];

    for (const section of sections) {
      section.scrollIntoView({ behavior: 'auto', block: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 700));

      for (const el of Array.from(section.querySelectorAll('h1, h2, h3, h4, p, li, button'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        /*
         * Only the elements that are genuinely on screen are judged. The
         * reveals use an 80px margin at the edges of the viewport, so an
         * element that is only just peeking in at the very top has not been
         * reached yet — that is the reveal working, not failing.
         */
        if (rect.bottom < 80 || rect.top > window.innerHeight - 80) continue;
        if (Number(getComputedStyle(el).opacity) < 0.05) {
          invisible.push(
            `${section.id} > ${el.tagName}: ${(el.textContent ?? '').trim().slice(0, 45)}`
          );
        }
      }
    }

    window.__invisible = invisible.slice(0, 12);
    return sections.length;
  });

  const invisible = await page.evaluate(() => window.__invisible ?? []);
  const heroVisible = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return false;
    return Number(getComputedStyle(h1).opacity) > 0.9;
  });

  await page.close();
  return { sections: sectionCount, invisibleElements: invisible, heroVisible, errors };
}

const results = {};

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                              */
/* -------------------------------------------------------------------------- */

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  results.reducedMotion = await walkForArrival(context);
  await context.close();
}

/* -------------------------------------------------------------------------- */
/* The visitor's own preference                                                */
/* -------------------------------------------------------------------------- */

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  results.fullMotion = await walkForArrival(context);
  await context.close();
}

/* -------------------------------------------------------------------------- */
/* Frame timing                                                                */
/* -------------------------------------------------------------------------- */

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  results.scrollFrames = await measureScrollFrames(page);
  await context.close();
}

await browser.close();

writeFileSync(join(OUT, 'motion-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
