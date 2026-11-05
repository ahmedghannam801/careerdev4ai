import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../.tmp-qa/pw/node_modules/playwright-core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, '.tmp-qa', 'hero-repair-screenshots');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Read port from argument or default to 5000 / live preview
const TARGET_URL = process.env.TEST_URL || 'http://127.0.0.1:4173';

console.log(`[visual-qa] Testing target URL: ${TARGET_URL}`);
console.log(`[visual-qa] Output directory: ${outDir}`);

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 800 },
];

const themes = ['light', 'dark'];
const languages = [
  { code: 'en', dir: 'ltr' },
  { code: 'ar', dir: 'rtl' },
];

const results = [];

try {
  for (const vp of viewports) {
    for (const theme of themes) {
      for (const lang of languages) {
        const scenario = `${vp.name}-${theme}-${lang.code}-${lang.dir}`;
        console.log(`[visual-qa] Running scenario: ${scenario}`);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });

        // Set localStorage for theme and language before navigation
        await context.addInitScript(([t, l]) => {
          try {
            localStorage.setItem('careerpilot_settings', JSON.stringify({
              theme: t,
              language: l,
              notifications: true,
              autoSave: true,
            }));
          } catch {}
        }, [theme, lang.code]);

        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(600); // Allow animations to settle

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });

        // Screenshot full hero area
        const screenshotPath = path.join(outDir, `${scenario}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        results.push({
          scenario,
          viewport: vp,
          theme,
          lang: lang.code,
          overflow,
          errorCount: errors.length,
          errors,
          screenshot: screenshotPath,
        });

        await context.close();
      }
    }
  }

  const reportPath = path.join(outDir, 'visual-qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`[visual-qa] Saved ${results.length} visual test scenarios.`);
  console.log(`[visual-qa] Report saved to: ${reportPath}`);

  const failures = results.filter((r) => r.overflow.hasOverflow || r.errorCount > 0);
  if (failures.length > 0) {
    console.error(`[visual-qa] Found ${failures.length} issues:`, failures);
  } else {
    console.log(`[visual-qa] All ${results.length} visual scenarios PASSED with 0 overflow and 0 errors!`);
  }
} finally {
  await browser.close();
}
