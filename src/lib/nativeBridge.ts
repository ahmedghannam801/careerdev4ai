/**
 * CareerPilot AI — the native shell of the Android application.
 *
 * Everything in this module is a no-op on the web: the browser keeps its own
 * behaviour for the back button (there is none), for external links (the
 * browser opens them) and for OAuth (the provider page runs in the same tab).
 *
 * On Android the module adds the three behaviours a native app needs:
 *
 *   1. the hardware back button;
 *   2. external links (`target="_blank"`) open in the system browser;
 *   3. the OAuth result comes back through a deep link.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { getBrowserSupabase } from './supabase';
import { isNative, OAUTH_DEEP_LINK } from './native';

/** The outcome of a native OAuth attempt. */
export interface NativeOAuthResult {
  /** A human-readable message when the attempt failed. */
  error?: string;
}

type OAuthResultListener = (result: NativeOAuthResult) => void;

let oauthResultListener: OAuthResultListener | null = null;

/**
 * The deep link that was handled last.
 *
 * The same deep link can reach the application twice — once as the launch URL
 * and once as an `appUrlOpen` event — and the authorization code it carries
 * may only be exchanged once.
 */
let handledDeepLink: string | null = null;

/**
 * Registers the listener that is told how the native OAuth attempt ended.
 *
 * The dialog that started the sign-in listens for this, because the Android
 * application is not reloaded when the provider returns: the dialog is still
 * open when the deep link brings the user back.
 */
export const onNativeOAuthResult = (listener: OAuthResultListener): (() => void) => {
  oauthResultListener = listener;
  return () => {
    if (oauthResultListener === listener) oauthResultListener = null;
  };
};

/** Reads the OAuth result out of the deep link the provider returned to. */
const readOAuthResult = (url: string): { code: string | null; error: string | null } => {
  try {
    const parsed = new URL(url);
    return {
      code: parsed.searchParams.get('code'),
      error: parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error'),
    };
  } catch {
    return { code: null, error: null };
  }
};

/**
 * Finishes the sign-in the provider started.
 *
 * Supabase hands the result back as an authorization code, which is exchanged
 * for a session with the PKCE verifier this WebView stored when the flow
 * began. The session then arrives through the ordinary auth listener, exactly
 * as it does on the web.
 */
const completeOAuthFromDeepLink = async (url: string): Promise<void> => {
  if (!url.startsWith(OAUTH_DEEP_LINK)) return;
  if (url === handledDeepLink) return;
  handledDeepLink = url;

  const { code, error } = readOAuthResult(url);

  // The provider page is still open behind the application; close it.
  try {
    await Browser.close();
  } catch {
    /* The browser was already closed. */
  }

  if (error) {
    oauthResultListener?.({ error: error.replace(/\+/g, ' ') });
    return;
  }
  if (!code) return;

  const { error: exchangeError } = await getBrowserSupabase().auth.exchangeCodeForSession(code);
  if (exchangeError) {
    oauthResultListener?.({ error: exchangeError.message });
    return;
  }
  oauthResultListener?.({});
};

/**
 * The hardware back button.
 *
 * An open dialog dismisses itself first — it is closed by the same Escape key
 * the web build uses. After that the WebView walks its own history, and at the
 * very end the application is minimized instead of being left on a dead screen.
 */
const registerBackButton = (): void => {
  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    // `useScrollLock` holds the scroll while a dialog is open.
    if (document.body.style.overflow === 'hidden') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    void CapacitorApp.minimizeApp();
  });
};

/**
 * External links.
 *
 * A WebView has no window to open, so a link with `target="_blank"` would go
 * nowhere. Handing the address to the WebView's own navigation makes the
 * native layer open it in the system browser, which is what a link on the web
 * does as well. Links that stay inside the application are left untouched.
 */
const registerExternalLinks = (): void => {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest('a[target="_blank"]');
    if (!(link instanceof HTMLAnchorElement)) return;

    const href = link.getAttribute('href');
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin === window.location.origin) return;

    event.preventDefault();
    window.location.href = url.toString();
  });
};

/**
 * Starts the native shell.
 *
 * On the web this does nothing at all.
 */
export const startNativeBridge = (): void => {
  if (!isNative) return;

  // The provider returns to the application through this deep link. The
  // listener also covers the case where the application was closed and the
  // deep link started it again — that URL is the launch URL.
  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    void completeOAuthFromDeepLink(url);
  });
  void CapacitorApp.getLaunchUrl().then((launchUrl) => {
    if (launchUrl?.url) void completeOAuthFromDeepLink(launchUrl.url);
  });

  registerBackButton();
  registerExternalLinks();
};
