/**
 * Google Analytics 4.
 *
 * The measurement id is public — it identifies a property, not an account, and
 * it is meant to appear in the page source. It is still read from the
 * environment first, so a staging deployment can point at a different
 * property without a code change.
 *
 * Three rules shape this module.
 *
 * 1. **One page view per view.** The automatic page view that `config`
 *    would send is switched off (`send_page_view: false`) and a page view is
 *    sent explicitly instead. The application is a single-page application, so
 *    the page view has to follow the route: sending the automatic one as well
 *    would report every view twice and make the numbers wrong.
 *
 * 2. **Nothing personal leaves the browser.** The path that is reported is
 *    built from the route, never from the raw URL, so a public profile's
 *    username never reaches the property. Events carry a category or a level,
 *    never a name, an address, a document or an identifier.
 *
 * 3. **Measurement only.** IP anonymisation is on, and Google's advertising
 *    and remarketing signals are off, so the property is used to understand
 *    the product rather than to build an advertising profile.
 *
 * The official Google tag is loaded: `gtag.js` from Google's own domain, with
 * the standard data layer queue in front of it.
 */

/**
 * The measurement id that was configured for this deployment.
 *
 * `import.meta.env` does not exist outside a Vite build, so it is read
 * defensively: the module is imported by the test suite, which runs on plain
 * Node.
 */
function configuredMeasurementId(): string {
  try {
    const env = import.meta.env as Record<string, string | undefined> | undefined;
    return env?.VITE_GA_MEASUREMENT_ID ?? '';
  } catch {
    return '';
  }
}

/**
 * The measurement id of the CareerDev4AI property.
 *
 * The value may be replaced with `VITE_GA_MEASUREMENT_ID`. The id is public by
 * design — Google requires it in the page source for the tag to work — so it
 * is safe to ship in the browser bundle.
 */
export const GA_MEASUREMENT_ID: string = configuredMeasurementId() || 'G-KVH4XKTE23';

/**
 * The events the funnel is built from.
 *
 * `sign_up` and `login` are Google's own recommended events; the rest are
 * custom events registered with the same names. The list lives in `shared/`
 * so that the browser and the server read the same names.
 */
export { ANALYTICS_EVENTS, type AnalyticsEvent, type AnalyticsParams } from '../../shared/analyticsEvents';

import { ANALYTICS_EVENTS, type AnalyticsEvent, type AnalyticsParams } from '../../shared/analyticsEvents';

/** The shape of the global tag function. */
type GtagFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

let initialized = false;
let lastPageViewPath: string | null = null;

/** Whether the tag can run in this environment at all. */
function canUseAnalytics(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Whether analytics has been initialised.
 *
 * Exposed so a test can assert that the tag is only initialised once, which
 * is what keeps the page views from doubling.
 */
export function isAnalyticsInitialized(): boolean {
  return initialized;
}

/**
 * The queue function the official tag uses.
 *
 * `gtag.js` reads `window.dataLayer` when it loads, so the queue is created
 * before the script is requested. That is the same order the official snippet
 * uses, and it means no event is lost while the tag is still downloading.
 */
function ensureTagQueue(): GtagFunction {
  const layer = (window.dataLayer = window.dataLayer || []);
  const existing = window.gtag;
  if (typeof existing === 'function') return existing;

  const gtag: GtagFunction = (...args: unknown[]) => {
    layer.push(args);
  };
  window.gtag = gtag;
  return gtag;
}

/**
 * Starts the measurement.
 *
 * Calling this more than once is harmless: the second call is ignored, so the
 * configuration is never sent twice and no extra page view is produced.
 */
export function initializeAnalytics(): void {
  if (initialized || !canUseAnalytics()) return;

  const gtag = ensureTagQueue();

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    // The page view is sent explicitly, when the route is known. See the note
    // at the top of this file.
    send_page_view: false,
    // The location is stated explicitly, and it is the home page. The
    // browser's own address may carry a hash — a public profile's username
    // lives in one — and the property never needs to see it.
    page_path: '/',
    page_location: `${window.location.origin}/`,
    // Measurement only: no advertising signals, no remarketing audiences.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // IP anonymisation is on by default; it is stated here so the guarantee
    // is visible in the configuration rather than assumed.
    anonymize_ip: true,
  });

  // The official Google tag. It is requested after the queue exists, so the
  // calls above are processed as soon as it arrives.
  //
  // The document may already carry the tag — `index.html` includes it so that
  // the measurement starts before the application bundle is parsed. In that
  // case the tag is not requested twice.
  const alreadyPresent = document.querySelector(
    `script[src*="googletagmanager.com/gtag/js"][src*="${GA_MEASUREMENT_ID}"]`
  );
  if (!alreadyPresent) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.dataset.analyticsTag = 'ga4';
    document.head.appendChild(script);
  }

  initialized = true;
}

/**
 * The path reported for a route.
 *
 * The raw URL is never used. A public profile lives at `#/profile/<username>`,
 * and the username identifies a person, so it is dropped: the profile route
 * reports as `/profile` and every other application view reports under
 * `/app`. Nothing else about the route reaches the property.
 */
export function analyticsPathForRoute(route: string, publicUsername?: string | null): string {
  if (!route || route === 'landing') return '/';
  if (route === 'profile') return publicUsername ? '/profile' : '/app/profile';
  return `/app/${route}`;
}

/**
 * Reports a page view.
 *
 * The path is the one the route produced, never the browser's address bar.
 * A view of the same path is not reported twice in a row, which is what keeps
 * a re-render of the same route from inflating the page-view count.
 */
export function trackPageView(path: string, title: string): void {
  if (!initialized || !canUseAnalytics()) return;
  if (path === lastPageViewPath) return;
  lastPageViewPath = path;

  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;

  const location = `${window.location.origin}${path}`;
  gtag('event', 'page_view', {
    page_path: path,
    page_location: location,
    page_title: title,
    send_to: GA_MEASUREMENT_ID,
  });
}

/**
 * Reports an event.
 *
 * The event name is checked against the known list, so a typo cannot send an
 * arbitrary event name to the property. Unknown names are dropped.
 */
export function trackEvent(name: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (!initialized || !canUseAnalytics()) return;
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;
  if (!ANALYTICS_EVENTS.includes(name)) return;

  gtag('event', name, { ...params, send_to: GA_MEASUREMENT_ID });
}

/**
 * Forgets the last reported page view.
 *
 * Used when the application leaves and re-enters a route, and by the tests
 * that assert the "no duplicate page views" rule.
 */
export function resetAnalyticsPageView(): void {
  lastPageViewPath = null;
}
