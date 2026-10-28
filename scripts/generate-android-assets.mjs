/**
 * CareerPilot AI — Android launcher icon and launch screen.
 * ---------------------------------------------------------------------------
 * Produces the native image assets of the Android application from the brand
 * artwork the web application already uses.
 *
 * The source is `src/assets/brand/careerpilot-icon.png` — the very same
 * prepared mark the React <Logo> component renders and the favicon set is
 * derived from. Nothing is redrawn, recoloured or re-lettered: the mark is
 * only resized and composited onto a tile, exactly like the brand pipeline in
 * `scripts/generate-brand-assets.mjs` does for the web.
 *
 *   ic_launcher.png            legacy launcher icon (Android 7.0 – 7.1)
 *   ic_launcher_round.png      legacy round launcher icon
 *   ic_launcher_foreground.png adaptive icon foreground (Android 8.0+)
 *   splash.png                 launch screen
 *
 * Run with:  npm run android:assets
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

/** The mark the platform already ships, used as the single source. */
const ICON = path.join(ROOT, 'src', 'assets', 'brand', 'careerpilot-icon.png');

/**
 * The tile behind the mark.
 *
 * White is the tile the web application already uses for its own "app icon on
 * a background" assets (`public/brand/maskable-512.png` and the apple-touch
 * icons), so the launcher looks like the platform's other icons.
 */
const TILE = '#FFFFFF';

/** The light brand background of the application (`src/index.css`). */
const BRAND_BACKGROUND = '#F5F0E8';

/** Launcher icon sizes per density, in pixels. */
const LAUNCHER_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

/** Adaptive icon foreground sizes per density, in pixels (108dp canvas). */
const FOREGROUND_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

/**
 * How much of the canvas the mark fills.
 *
 * The prepared mark already fills 94% of its own canvas, so the legacy icon
 * keeps that proportion. The round icon is inset a little further so the
 * launcher never crops the arrow. The adaptive foreground is inset much
 * further: Android shows the middle 72dp of the 108dp canvas, and only the
 * central 66dp of that survives the circular mask, so the mark has to sit
 * inside it.
 */
const LEGACY_FILL = 0.94;
const ROUND_FILL = 0.76;
const FOREGROUND_FILL = 0.6;

/** The launch screen sizes, in pixels, one entry per resource folder. */
const SPLASH_SIZES = {
  drawable: [480, 320],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
};

/** How much of the shorter side of the launch screen the mark fills. */
const SPLASH_FILL = 0.3;

/** The mark, resized to `size` pixels on its longest side. */
async function mark(size) {
  return sharp(ICON)
    .resize(size, size, { kernel: 'lanczos3', fit: 'contain' })
    .png()
    .toBuffer();
}

/** The legacy launcher icon: the mark on the white tile. */
async function legacyIcon(size) {
  const markSize = Math.round(size * LEGACY_FILL);
  const artwork = await mark(markSize);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: artwork,
        left: Math.round((size - markSize) / 2),
        top: Math.round((size - markSize) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** The legacy round launcher icon: the mark on a white circle. */
async function roundIcon(size) {
  const markSize = Math.round(size * ROUND_FILL);
  const artwork = await mark(markSize);
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FFFFFF"/>` +
      `</svg>`,
  );
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: artwork,
        left: Math.round((size - markSize) / 2),
        top: Math.round((size - markSize) / 2),
      },
      { input: circle, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

/** The adaptive icon foreground: the mark, alone on a transparent canvas. */
async function adaptiveForeground(size) {
  const markSize = Math.round(size * FOREGROUND_FILL);
  const artwork = await mark(markSize);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: artwork,
        left: Math.round((size - markSize) / 2),
        top: Math.round((size - markSize) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** The launch screen: the mark on the brand background. */
async function splash(width, height) {
  const markSize = Math.round(Math.min(width, height) * SPLASH_FILL);
  const artwork = await mark(markSize);
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: BRAND_BACKGROUND,
    },
  })
    .composite([
      {
        input: artwork,
        left: Math.round((width - markSize) / 2),
        top: Math.round((height - markSize) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function build() {
  for (const [density, size] of Object.entries(LAUNCHER_SIZES)) {
    const folder = path.join(RES, `mipmap-${density}`);
    await writeFile(path.join(folder, 'ic_launcher.png'), await legacyIcon(size));
    await writeFile(path.join(folder, 'ic_launcher_round.png'), await roundIcon(size));
  }

  for (const [density, size] of Object.entries(FOREGROUND_SIZES)) {
    const folder = path.join(RES, `mipmap-${density}`);
    await writeFile(
      path.join(folder, 'ic_launcher_foreground.png'),
      await adaptiveForeground(size),
    );
  }

  for (const [folder, [width, height]] of Object.entries(SPLASH_SIZES)) {
    await writeFile(
      path.join(RES, folder, 'splash.png'),
      await splash(width, height),
    );
  }

  console.log('android launcher icons and splash screens written');
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
