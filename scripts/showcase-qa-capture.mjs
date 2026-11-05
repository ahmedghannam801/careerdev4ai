import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../.tmp-qa/pw/node_modules/playwright-core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactDir = 'C:\\Users\\TEESLA\\.gemini\\antigravity\\brain\\21eb413c-6e7a-4141-af6f-0eec738004f7';

const TARGET_URL = process.env.TEST_URL || 'http://localhost:4173';
console.log(`[showcase-qa] Testing target URL: ${TARGET_URL}`);

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

const scenarios = [
  { name: 'showcase-desktop-1280-dark-ar', width: 1280, height: 900, theme: 'dark', lang: 'ar' },
  { name: 'showcase-desktop-1280-dark-en', width: 1280, height: 900, theme: 'dark', lang: 'en' },
  { name: 'showcase-tablet-768-dark-ar', width: 768, height: 1024, theme: 'dark', lang: 'ar' },
  { name: 'showcase-tablet-768-dark-en', width: 768, height: 1024, theme: 'dark', lang: 'en' },
  { name: 'showcase-mobile-390-dark-ar', width: 390, height: 844, theme: 'dark', lang: 'ar' },
  { name: 'showcase-mobile-390-dark-en', width: 390, height: 844, theme: 'dark', lang: 'en' },
];

try {
  for (const s of scenarios) {
    console.log(`[showcase-qa] Capturing: ${s.name}`);
    const context = await browser.newContext({
      viewport: { width: s.width, height: s.height },
    });

    await context.addInitScript(([t, l]) => {
      try {
        localStorage.setItem('careerpilot_settings', JSON.stringify({
          theme: t,
          language: l,
          notifications: true,
          autoSave: true,
        }));
      } catch {}
    }, [s.theme, s.lang]);

    const page = await context.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);

    const showcaseEl = page.locator('#visual-showcase');
    await showcaseEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const outPath = path.join(artifactDir, `${s.name}.png`);
    await showcaseEl.screenshot({ path: outPath });
    console.log(`[showcase-qa] Saved screenshot: ${outPath}`);

    await context.close();
  }
} finally {
  await browser.close();
}
