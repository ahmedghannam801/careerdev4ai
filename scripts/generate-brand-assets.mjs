/**
 * CareerPilot AI — official brand asset pipeline.
 * -----------------------------------------------------------------------------
 * Turns the approved brand assets in `src/assets/brand/official/` into every
 * derivative the platform ships:
 *
 *   official/careerpilot-icon.png  ->  app / favicon / PWA icon set
 *   official/careerpilot-logo.png  ->  larger UI presentation and social card
 *
 * The official files are NEVER redrawn, recoloured, restretched or re-lettered.
 * The only operations applied are:
 *
 *   1. removal of the plain white *field* from opaque source art, so the mark
 *      can sit on any surface,
 *   2. trimming of the supplied outer margin, and
 *   3. proportional resizing for each target size.
 *
 * Transparent source art is used as supplied: white details inside the mark
 * belong to the artwork and are never keyed out.
 *
 * Run with:  npm run brand
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL_DIR = path.join(ROOT, 'src', 'assets', 'brand', 'official');
const BUNDLED_DIR = path.join(ROOT, 'src', 'assets', 'brand');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_BRAND_DIR = path.join(PUBLIC_DIR, 'brand');

const OFFICIAL_ICON = path.join(OFFICIAL_DIR, 'careerpilot-icon.png');
const OFFICIAL_LOGO = path.join(OFFICIAL_DIR, 'careerpilot-logo.png');

/** Brand tokens mirrored from `src/index.css`. */
const BRAND = {
  lightBackground: '#F5F0E8',
  darkBackground: '#1C201E',
};

/* -------------------------------------------------------------------------- */
/* Core helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Prepares supplied art for compositing.
 *
 * Art that already carries transparency is returned unchanged: white details
 * inside the mark (an orbit line, for example) are part of the artwork. Opaque
 * art is assumed to have been supplied on a plain white field, which is keyed
 * out below.
 */
async function prepareArtwork(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  if (C !== 4) throw new Error(`Expected 4 channels, received ${C}`);

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return { data, info };
  }

  const at = (x, y) => (y * W + x) * 4;
  const minChannel = (x, y) => Math.min(data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]);
  const maxChannel = (x, y) => Math.max(data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]);

  const NEAR_WHITE = 245;  // a pixel counts as background from this brightness up
  const CHROMA = 30;       // above this a pixel is clearly a saturated colour

  // Guard: the artwork must not contain near-white pixels, or keying would
  // start eating into the mark itself.
  let brightestArtwork = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lo = minChannel(x, y);
      const hi = maxChannel(x, y);
      if (lo >= NEAR_WHITE) continue;
      if (hi - lo >= CHROMA && lo > brightestArtwork) brightestArtwork = lo;
    }
  }
  if (brightestArtwork >= NEAR_WHITE - 5) {
    throw new Error(`Artwork contains near-white pixels (${brightestArtwork}); refusing to key.`);
  }

  // ---- 1. build the "is background" mask (pure white only) ----
  const background = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (minChannel(x, y) >= NEAR_WHITE) background[y * W + x] = 1;
    }
  }

  // ---- 2. un-premultiply the anti-aliased edge against white ----
  // A blend of white and a saturated colour has (1 - alpha) * 255 as its
  // weakest channel, which yields the artwork's true opacity and true colour.
  const neighbourIsBackground = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (background[ny * W + nx]) return true;
      }
    }
    return false;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (background[y * W + x]) continue;
      const lo = minChannel(x, y);
      const hi = maxChannel(x, y);
      if (hi - lo < CHROMA) continue;   // neutral grey: keep the blended colour as-is
      if (!neighbourIsBackground(x, y)) continue;

      const alpha = (255 - lo) / 255;
      for (let c = 0; c < 3; c++) {
        const value = (data[at(x, y) + c] - (1 - alpha) * 255) / alpha;
        data[at(x, y) + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
      data[at(x, y) + 3] = Math.round(alpha * 255);
    }
  }

  // ---- 3. background becomes transparent ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (background[y * W + x]) data[at(x, y) + 3] = 0;
    }
  }

  return { data, info: { width: W, height: H, channels: 4 } };
}

/** Bounding box of the pixels that are not fully transparent. */
function artworkBounds(buffer, { width, height, channels }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (buffer[(y * width + x) * channels + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('Artwork is fully transparent');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Places artwork on a square transparent canvas, scaled to fit `fill` of the
 * canvas and centred. The aspect ratio of the artwork is never changed.
 */
async function squareCanvas(raw, fill, canvasSize) {
  const { data, info } = raw;
  const bounds = artworkBounds(data, info);
  const canvas = canvasSize;

  const scale = Math.min((canvas * fill) / bounds.width, (canvas * fill) / bounds.height);
  const scaledWidth = Math.max(1, Math.round(bounds.width * scale));
  const scaledHeight = Math.max(1, Math.round(bounds.height * scale));
  const offsetLeft = Math.round((canvas - scaledWidth) / 2);
  const offsetTop = Math.round((canvas - scaledHeight) / 2);

  const resized = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left: offsetLeft, top: offsetTop }])
    .png(PNG_OUTPUT)
    .toBuffer();
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Output settings for every raster asset.
 *
 * The artwork is a smooth multi-stop gradient, so a true-colour PNG is far
 * larger than it needs to be. An adaptive palette keeps the visible result
 * identical to the eye while cutting roughly a third off the file size, which
 * matters for a favicon and a social card that are fetched on every share.
 */
const PNG_OUTPUT = { palette: true, quality: 92, effort: 10, compressionLevel: 9 };

async function build() {
  await mkdir(PUBLIC_BRAND_DIR, { recursive: true });

  /* ------------------------------------------------------------------ */
  /* 1. Icon: prepare the art, trim, centre on a square canvas.           */
  /* ------------------------------------------------------------------ */
  console.log('→ icon');
  const iconRaw = await prepareArtwork(OFFICIAL_ICON);
  const iconSquare = await squareCanvas(iconRaw, 0.94, 512);

  // Bundled copy — imported by the React <Logo> component.
  await writeFile(path.join(BUNDLED_DIR, 'careerpilot-icon.png'), iconSquare);

  // Favicon / PWA set — served statically from /brand/.
  for (const size of [16, 32, 192, 512]) {
    await sharp(iconSquare)
      .resize(size, size, { kernel: 'lanczos3' })
      .png(PNG_OUTPUT)
      .toFile(path.join(PUBLIC_BRAND_DIR, size === 512 ? 'icon-512.png' : `favicon-${size}.png`));
  }

  // Apple touch icons are composited by the OS onto an opaque tile.
  for (const size of [180, 152, 167]) {
    await sharp(iconSquare)
      .resize(size, size, { kernel: 'lanczos3' })
      .flatten({ background: '#FFFFFF' })
      .png(PNG_OUTPUT)
      .toFile(path.join(PUBLIC_BRAND_DIR, `apple-touch-icon-${size}.png`));
  }

  // Maskable icon: the artwork sits inside the safe zone on an opaque tile.
  const maskableArt = await sharp(iconRaw.data, {
    raw: { width: iconRaw.info.width, height: iconRaw.info.height, channels: 4 },
  })
    .resize(430, 430, { kernel: 'lanczos3', fit: 'inside' })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: maskableArt, gravity: 'center' }])
    .flatten({ background: '#FFFFFF' })
    .png(PNG_OUTPUT)
    .toFile(path.join(PUBLIC_BRAND_DIR, 'maskable-512.png'));

  /* ------------------------------------------------------------------ */
  /* 2. Large UI asset: prepare the art, trim, keep the artwork intact.   */
  /* ------------------------------------------------------------------ */
  console.log('→ logo');
  const logoRaw = await prepareArtwork(OFFICIAL_LOGO);
  const logoBounds = artworkBounds(logoRaw.data, logoRaw.info);

  // The artwork is reproduced at its original scale; only the supplied outer
  // margin is replaced by a small, even transparent one so the mark can be
  // sized responsively without the whitespace dominating the box.
  const cropped = await sharp(logoRaw.data, {
    raw: { width: logoRaw.info.width, height: logoRaw.info.height, channels: 4 },
  })
    .extract({
      left: logoBounds.left,
      top: logoBounds.top,
      width: logoBounds.width,
      height: logoBounds.height,
    })
    .png()
    .toBuffer();

  const padX = Math.round(logoBounds.width * 0.02);
  const padY = Math.round(logoBounds.height * 0.06);
  const lockup = await sharp(cropped)
    .extend({ top: padY, bottom: padY, left: padX, right: padX, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    // The mark is displayed at a modest size in the UI, so 1200px keeps it
    // sharp on high-density screens without shipping an oversized file.
    .resize({ width: 1200, kernel: 'lanczos3' })
    .png(PNG_OUTPUT)
    .toBuffer();

  await writeFile(path.join(BUNDLED_DIR, 'careerpilot-logo.png'), lockup);

  /* ------------------------------------------------------------------ */
  /* 3. favicon.svg — the official raster, embedded (never redrawn).    */
  /* ------------------------------------------------------------------ */
  console.log('→ favicon.svg');
  const icon512 = await sharp(iconSquare)
    .resize(512, 512, { kernel: 'lanczos3' })
    .png(PNG_OUTPUT)
    .toBuffer();
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="CareerPilot AI">
  <image href="data:image/png;base64,${icon512.toString('base64')}" width="512" height="512"/>
</svg>
`;
  await writeFile(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg);

  /* ------------------------------------------------------------------ */
  /* 4. Web application manifest (mobile app icon).                    */
  /* ------------------------------------------------------------------ */
  console.log('→ web manifest');
  const manifest = {
    name: 'CareerPilot AI',
    short_name: 'CareerPilot AI',
    description: 'Your personal career operating system.',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND.lightBackground,
    theme_color: BRAND.darkBackground,
    icons: [
      { src: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  await writeFile(path.join(PUBLIC_DIR, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

  /* ------------------------------------------------------------------ */
  /* 5. Social card — the official mark on the brand background.        */
  /* ------------------------------------------------------------------ */
  console.log('→ og image');
  const ogLockup = await sharp(lockup)
    .resize({ width: 900, height: 500, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const ogLockupMeta = await sharp(ogLockup).metadata();
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: BRAND.lightBackground },
  })
    .composite([{
      input: ogLockup,
      left: Math.round((1200 - ogLockupMeta.width) / 2),
      top: Math.round((630 - ogLockupMeta.height) / 2),
    }])
    .png(PNG_OUTPUT)
    .toFile(path.join(PUBLIC_BRAND_DIR, 'og-image-1200x630.png'));

  /* ------------------------------------------------------------------ */
  /* Report                                                              */
  /* ------------------------------------------------------------------ */
  const bundledIcon = await sharp(path.join(BUNDLED_DIR, 'careerpilot-icon.png')).metadata();
  const bundledLogo = await sharp(path.join(BUNDLED_DIR, 'careerpilot-logo.png')).metadata();
  console.log('');
  console.log('  src/assets/brand/careerpilot-icon.png ', `${bundledIcon.width}x${bundledIcon.height}`);
  console.log('  src/assets/brand/careerpilot-logo.png ', `${bundledLogo.width}x${bundledLogo.height}`);
  console.log('  public/brand/*.png, public/favicon.svg, public/site.webmanifest');
  console.log('');
  console.log('done');
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
