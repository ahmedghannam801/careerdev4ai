/**
 * Aionvia — interim brand artwork.
 * -----------------------------------------------------------------------------
 * The final logo is supplied by the product owner and is the source of truth.
 * This script only runs when that file is not present yet, so a build never
 * ships the previous brand's "R" monogram or a broken image.
 *
 * It draws a plain typographic "A" in the brand palette on a transparent
 * canvas. It is deliberately simple and is not a designed logo: the moment
 * `src/assets/brand/official/aionvia-logo.png` exists, this file is ignored
 * and `npm run brand` derives every asset from the supplied artwork instead.
 *
 * Run:  node scripts/generate-brand-placeholder.mjs
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL_DIR = path.join(ROOT, 'src', 'assets', 'brand', 'official');
export const OFFICIAL_LOGO = path.join(OFFICIAL_DIR, 'aionvia-logo.png');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="aionvia" gradientUnits="userSpaceOnUse" x1="180" y1="160" x2="860" y2="900">
      <stop offset="0" stop-color="#E2703A"/>
      <stop offset="1" stop-color="#B94736"/>
    </linearGradient>
  </defs>
  <path d="M246 800 L512 226 L778 800" fill="none" stroke="url(#aionvia)" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M356 626 L668 626" fill="none" stroke="url(#aionvia)" stroke-width="88" stroke-linecap="round"/>
</svg>`;

export async function ensurePlaceholderLogo() {
  await mkdir(OFFICIAL_DIR, { recursive: true });
  await sharp(Buffer.from(SVG)).png().toFile(OFFICIAL_LOGO);
  return OFFICIAL_LOGO;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensurePlaceholderLogo().then((file) => console.log(`wrote ${file}`));
}
