import { chromium } from 'playwright';

const BASE = process.env.QA_URL ?? 'https://aionvia.pages.dev/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const bad = [];
page.on('response', (res) => {
  if (res.status() >= 400) bad.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 160)}`);
});
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

console.log('URL:', BASE);
console.log('failed responses:', JSON.stringify(bad, null, 2));
console.log('console errors:', JSON.stringify(consoleErrors, null, 2));
await browser.close();
