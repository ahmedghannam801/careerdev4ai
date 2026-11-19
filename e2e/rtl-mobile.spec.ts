import { expect, test, devices, type Page } from '@playwright/test';

/**
 * The mobile and right-to-left suite.
 *
 * The platform ships an Arabic interface, so "responsive" is not only about
 * width: a page that fits a phone but keeps left-to-right alignment is still
 * broken for half of the users.
 *
 * These tests run against the real production bundle that the preview server
 * serves, and they use the public landing page because it is the one surface
 * a visitor reaches without an account. The language switch there is a real
 * control, so the whole direction flip can be exercised end to end.
 */

/**
 * The elements that carry meaning.
 *
 * Decorative artwork is allowed to bleed past the edge of a phone — the hero
 * artwork does — but text and controls may not, because a clipped word or a
 * half-visible button is a real usability failure.
 */
const CONTENT_SELECTOR =
  'a, button, input, select, textarea, p, h1, h2, h3, h4, h5, h6, li, span, label, td, th';

interface OverflowOffender {
  tag: string;
  cls: string;
  left: number;
  right: number;
}

/**
 * Finds the content that sticks out of the viewport.
 *
 * The document's own `scrollWidth` is not enough on its own: in a right-to-left
 * document, content that overflows to the *left* does not always grow it. So
 * every meaningful element is measured against the viewport on both sides.
 *
 * Elements inside a horizontally scrollable container are left alone: a table
 * that can be swiped sideways is a deliberate design, not an overflow.
 */
async function findOverflow(page: Page): Promise<OverflowOffender[]> {
  return page.evaluate((selector) => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders: { tag: string; cls: string; left: number; right: number }[] = [];

    const insideScrollableAncestor = (element: Element): boolean => {
      let parent = element.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          parent.scrollWidth > parent.clientWidth + 1
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    for (const element of Array.from(document.querySelectorAll(selector))) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (element.getAttribute('aria-hidden') === 'true') continue;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= viewportWidth + 1 && rect.left >= -1) continue;
      if (insideScrollableAncestor(element)) continue;

      offenders.push({
        tag: element.tagName.toLowerCase(),
        cls: String(element.className ?? '').slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }

    return offenders;
  }, CONTENT_SELECTOR);
}

/** The bounding box of the first element matching a selector. */
async function boxOf(page: Page, selector: string) {
  const element = page.locator(selector).first();
  await expect(element, `expected to find ${selector}`).toBeVisible();
  const box = await element.boundingBox();
  expect(box, `expected ${selector} to have a bounding box`).not.toBeNull();
  return box!;
}

/**
 * Where the first words of the headline actually sit inside the headline box.
 *
 * The computed `text-align` is not enough to prove a direction flip: the
 * browser reports the logical keyword `start` in both directions, and only
 * resolves it when it lays the text out. So the text run itself is measured,
 * which is what the reader actually sees.
 */
async function readingEdge(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector('h1');
    const node = heading?.firstChild;
    if (!heading || !node || node.nodeType !== Node.TEXT_NODE) return null;

    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(6, node.textContent?.length ?? 0));

    const text = range.getBoundingClientRect();
    const box = heading.getBoundingClientRect();

    return {
      fromLeft: text.left - box.left,
      fromRight: box.right - text.right,
    };
  });
}

// A Chromium phone profile: the installed browser engine, at a real phone
// viewport, with touch and a mobile user agent.
test.use({ ...devices['Pixel 5'] });

test.describe('the landing page on a phone', () => {
  test('fits the viewport without clipping any text or control', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole('heading', { name: /Turn Your Ambition Into a Career Plan/i })
    ).toBeVisible({ timeout: 30_000 });

    const offenders = await findOverflow(page);
    expect(
      offenders,
      `content should fit the ${devices['Pixel 5'].viewport?.width}px viewport, but these overflow: ${JSON.stringify(
        offenders,
        null,
        2
      )}`
    ).toEqual([]);

    // The page itself must not be scrollable sideways either.
    const scrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(scrollsSideways, 'the page should not scroll sideways').toBe(false);
  });

  test('shows one navigation on a phone and opens it from the menu button', async ({ page }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // The desktop navigation is hidden on a phone, so the phone has exactly
    // one navigation — never two competing ones.
    const desktopNav = page.locator('header nav').first();
    await expect(desktopNav).toBeHidden();

    await menuButton.click();

    const mobileNav = page.locator('#landing-mobile-nav');
    await expect(mobileNav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();
    await expect(mobileNav.getByRole('link', { name: 'Target Roles' })).toBeVisible();

    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(mobileNav).toBeHidden();
  });

  test('keeps the primary controls big enough to tap', async ({ page }) => {
    await page.goto('/');

    // WCAG 2.2 SC 2.5.8 (Target Size, Minimum) asks for 24 by 24 CSS pixels.
    const menu = await boxOf(page, 'button[aria-controls="landing-mobile-nav"]');
    expect(menu.width).toBeGreaterThanOrEqual(24);
    expect(menu.height).toBeGreaterThanOrEqual(24);

    const language = await boxOf(page, 'button[aria-label="Switch interface language"]');
    expect(language.width).toBeGreaterThanOrEqual(24);
    expect(language.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe('the landing page in Arabic', () => {
  test('flips the page to right-to-left and keeps it on screen', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Switch interface language' }).click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    // The interface is really Arabic, not just flagged as it.
    const arabicText = await page.evaluate(() => {
      const pattern = /[\u0600-\u06FF]/;
      for (const node of Array.from(document.querySelectorAll('h1, h2, p, a, button'))) {
        const text = node.textContent ?? '';
        if (pattern.test(text)) return text.trim().slice(0, 80);
      }
      return '';
    });
    expect(arabicText, 'the page should show Arabic text').not.toBe('');

    const offenders = await findOverflow(page);
    expect(
      offenders,
      `Arabic content should fit the viewport, but these overflow: ${JSON.stringify(offenders, null, 2)}`
    ).toEqual([]);

    const scrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(scrollsSideways, 'the Arabic page should not scroll sideways').toBe(false);
  });

  test('lays the headline out along the reading edge, not always the left', async ({ page }) => {
    await page.goto('/');

    const english = await readingEdge(page);
    expect(english, 'the headline should be measurable').not.toBeNull();
    expect(
      english!.fromLeft,
      'in English the headline should start at the left edge of its box'
    ).toBeLessThan(4);

    await page.getByRole('button', { name: 'Switch interface language' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const arabic = await readingEdge(page);
    expect(arabic, 'the Arabic headline should be measurable').not.toBeNull();
    expect(
      arabic!.fromRight,
      'in Arabic the headline should start at the right edge of its box'
    ).toBeLessThan(4);
  });

  test('keeps the mobile navigation usable in Arabic', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Switch interface language' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // The menu button is labelled in Arabic once the language changes.
    const menuButton = page.locator('button[aria-controls="landing-mobile-nav"]');
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    const mobileNav = page.locator('#landing-mobile-nav');
    await expect(mobileNav).toBeVisible();

    const offenders = await findOverflow(page);
    expect(
      offenders,
      `the open Arabic menu should fit the viewport, but these overflow: ${JSON.stringify(
        offenders,
        null,
        2
      )}`
    ).toEqual([]);
  });
});

test.describe('a narrow phone in Arabic', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('does not clip the page on a 320px screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch interface language' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const offenders = await findOverflow(page);
    expect(
      offenders,
      `nothing should overflow on a 320px screen, but these do: ${JSON.stringify(offenders, null, 2)}`
    ).toEqual([]);
  });
});
