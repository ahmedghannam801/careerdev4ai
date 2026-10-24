/**
 * CareerPilot AI — official brand asset pipeline.
 * -----------------------------------------------------------------------------
 * Turns the two approved brand assets in `src/assets/brand/official/` into every
 * derivative the platform ships:
 *
 *   official/careerpilot-icon.png  ->  app / favicon / PWA icon set
 *   official/careerpilot-logo.png  ->  full horizontal lockup
 *
 * The official files are NEVER redrawn, recoloured, restretched or re-lettered.
 * The only operations applied are:
 *
 *   1. removal of the plain white *field* the artwork was supplied on, so the
 *      mark can sit on any surface, and
 *   2. trimming of the supplied outer margin.
 *
 * The white that belongs to the artwork itself is preserved:
 *   - the swoosh that separates the cap from the ribbon is part of the
 *     background field (it is connected to the outside of the artwork), and
 *   - the counters of the letters in the wordmark are enclosed by the glyphs.
 * Both are pure white in the supplied assets, so both are keyed out exactly
 * like the background field — on any surface they reveal what is behind the
 * logo, which is how the supplied artwork reads on its own white background.
 *
 * Anti-aliased edge pixels are un-premultiplied against white so the mark keeps
 * a clean edge on dark surfaces instead of carrying a white halo. Only
 * chromatic pixels are un-premultiplied: the neutral grey tagline has no
 * saturated channel, so un-premultiplying it would darken its letter edges.
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
 * Keys the white field out of an RGBA image.
 *
 * Every pixel whose weakest channel is at least `NEAR_WHITE` is treated as
 * background and becomes transparent — this covers the outer field and the
 * enclosed letter counters, which are both pure white in the supplied art.
 * Chromatic edge pixels are un-premultiplied against white so the mark keeps
 * a clean edge on dark surfaces.
 */
async function keyOutWhite(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  if (C !== 4) throw new Error(`Expected 4 channels, received ${C}`);

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
  /* 1. Icon: key the white field, trim, centre on a square canvas.       */
  /* ------------------------------------------------------------------ */
  console.log('→ icon');
  const iconRaw = await keyOutWhite(OFFICIAL_ICON);
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
  /* 2. Full lockup: key the white field, trim, keep the artwork intact.  */
  /* ------------------------------------------------------------------ */
  console.log('→ lockup');
  const logoRaw = await keyOutWhite(OFFICIAL_LOGO);
  const logoBounds = artworkBounds(logoRaw.data, logoRaw.info);

  // The artwork is reproduced at its original scale; only the supplied outer
  // margin is replaced by a small, even transparent one so the lockup can be
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
    // The lockup is shown at most ~490px wide in the UI, so 1200px keeps it
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
  /* 5. Social card — the official lockup on the brand background.      */
  /* ------------------------------------------------------------------ */
  console.log('→ og image');
  const ogLockup = await sharp(lockup).resize({ width: 900, kernel: 'lanczos3' }).png().toBuffer();
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
