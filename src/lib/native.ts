/**
 * CareerPilot AI — native (Android) helpers.
 *
 * The web build keeps every path it has always used: `isNative` is false, the
 * API base URL is empty (so every API call stays same-origin) and the OAuth
 * flow runs in the browser exactly as before.
 *
 * The Android build is the same application, served from the Capacitor WebView
 * (`https://localhost`) with a native layer around it. Two things differ:
 *
 *   1. the application's own API lives on the production origin, so the calls
 *      are absolute and cross-origin;
 *   2. OAuth cannot run inside a WebView — Google and LinkedIn refuse
 *      embedded user agents — so the provider page is opened in the system
 *      browser and the result is handed back through a deep link.
 *
 * Nothing in this module changes the web behaviour: every branch is guarded by
 * `isNative`.
 */
import { Capacitor } from '@capacitor/core';

/** True when the application runs inside the Capacitor native shell. */
export const isNative = Capacitor.isNativePlatform();

/** True when the application runs on Android. */
export const isAndroid = Capacitor.getPlatform() === 'android';

/**
 * The origin that serves the application's own API.
 *
 * Empty in the web build, where every call is same-origin. The Android build
 * pins it to the production deployment through `VITE_API_BASE_URL`.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * Builds the URL of one of the application's own API endpoints.
 *
 * On the web this returns the path unchanged, so the request stays
 * same-origin and behaves exactly as it always has.
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * The deep link the native application listens on for the OAuth result.
 *
 * It matches the intent filter in `android/app/src/main/AndroidManifest.xml`
 * and the application id in `capacitor.config.ts`.
 */
export const OAUTH_DEEP_LINK = 'com.careerpilot.ai://auth/callback';
