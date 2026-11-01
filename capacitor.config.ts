import type { CapacitorConfig } from '@capacitor/cli';

/**
 * CareerDev4AI — Capacitor configuration.
 *
 * The Android application is a native wrapper around the very same build that
 * is deployed to https://careerdev4ai.pages.dev. Nothing about the web
 * application changes: the bundle, the branding, the routes, the backend and
 * the authentication behaviour are the ones that already exist.
 *
 * Three things are specific to the native build:
 *
 *   1. `webDir` points at `dist-android`, the output of `npm run build:android`.
 *      The web deployment keeps using `dist` (which also carries the Cloudflare
 *      Pages worker), so the two builds can never overwrite each other.
 *
 *   2. `CapacitorHttp` is enabled. The application's own API lives on the
 *      production origin while the WebView is served from `https://localhost`,
 *      so the calls are cross-origin, and the production API only answers
 *      same-origin requests. Letting the native HTTP stack perform the
 *      requests keeps the server, its CORS allow-list and the Cloudflare
 *      configuration exactly as they are.
 *
 *   3. `server.androidScheme` stays `https`, so the WebView origin is
 *      `https://localhost` — the origin Capacitor expects.
 */
const config: CapacitorConfig = {
  appId: 'com.careerpilot.ai',
  appName: 'CareerDev4AI',
  webDir: 'dist-android',
  server: {
    androidScheme: 'https',
  },
  android: {
    // The colour the WebView shows while the first frame is painted: the
    // platform's own light brand background (`src/index.css`).
    backgroundColor: '#F5F0E8',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      // The application sits on the light brand background, so the status bar
      // keeps dark icons on that same background. The system bars are inset
      // from the WebView, which keeps the content clear of them.
      style: 'LIGHT',
    },
    SplashScreen: {
      // The splash screen is the platform background plus the launcher icon
      // the system draws for us. No new artwork and no new branding.
      launchShowDuration: 700,
      backgroundColor: '#F5F0E8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
