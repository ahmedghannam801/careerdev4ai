/**
 * Renders a PDF file to a picture.
 * ---------------------------------------------------------------------------
 * The acceptance test for the export is not that the file exists — it is that
 * the page looks like the paper the candidate approved. This script opens a
 * PDF in Chromium's own viewer and photographs it, so what is judged is what
 * a reader sees.
 *
 *   node --experimental-strip-types scripts/render-pdf-to-png.mts <file.pdf> [out.png]
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) {
  console.error('Usage: render-pdf-to-png.mts <file.pdf> [out.png]');
  process.exit(1);
}

const input = path.isAbsolute(target) ? target : path.join(root, target);
const output = process.argv[3]
  ? path.isAbsolute(process.argv[3])
    ? process.argv[3]
    : path.join(root, process.argv[3])
  : path.join(root, 'samples', `${path.basename(input, '.pdf')}.png`);

const bytes = readFileSync(input);

const server = createServer((_request, response) => {
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': bytes.length,
  });
  response.end(bytes);
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });

try {
  await page.goto(`http://127.0.0.1:${port}/document.pdf`, { waitUntil: 'load' });
  // The viewer paints after the file arrives; give it a moment to do so.
  //
  // The wait is generous because a file whose pages are pictures takes
  // longer to paint than a file whose pages are text: the picture has to
  // be decoded before the page can be shown, and a blank photograph of the
  // document is worse than no photograph at all.
  await page.waitForTimeout(8000);
  await page.screenshot({ path: output });
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
  server.close();
}
