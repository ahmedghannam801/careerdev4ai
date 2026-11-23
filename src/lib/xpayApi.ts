/**
 * XPay billing API client.
 *
 * The server creates the Checkout Session and returns a hosted URL; the browser
 * only navigates to it. No card field is ever rendered here and no secret key
 * reaches the bundle, which keeps the integration in PCI scope SAQ A.
 *
 * There is deliberately no "the customer came back, so it worked" path: the
 * return page asks the server to reconcile the session, and the server asks
 * XPay. A Fawry payment is complete before it is paid, so the answer has to come
 * from the provider, not from the URL.
 */

import { apiRequest } from './apiClient';

export interface XPayCheckoutResponse {
  success: boolean;
  url: string;
  sessionId: string;
  amount: { list: number; discount: number; charge: number; currency: 'EGP' };
  entitlement: {
    planCode: string | null;
    billingCycle: 'monthly' | 'annual' | null;
    packId: string | null;
    credits: number;
  };
}

export interface XPaySessionView {
  id: string;
  purchaseKind: 'subscription' | 'credit_pack';
  planCode: string | null;
  billingCycle: 'monthly' | 'annual' | null;
  amountTotal: number;
  currency: string;
  status: string;
  paymentStatus: string;
  paymentMethodType: string | null;
  /** The Fawry reference the customer pays, when they are paying one. */
  voucherReference: string | null;
  voucherExpiresAt: string | null;
  createdAt: string;
}

export interface XPayStatus {
  configured: boolean;
  mode: 'disabled' | 'test' | 'live';
  testMode: boolean;
  checkoutReady: boolean;
  config: {
    mode: 'disabled' | 'test' | 'live';
    configured: boolean;
    checkoutReady: boolean;
    errors: Array<{ code: string; variable: string; message: string; severity: 'error' | 'warning' }>;
    warnings: Array<{ code: string; variable: string; message: string; severity: 'error' | 'warning' }>;
  };
  paymentMethods: {
    methods: string[];
    methodsForEgp: string[];
    egpSupported: boolean;
    applePayWebsiteReady: boolean;
    currency: string;
    livemode: boolean;
    note: string;
  } | null;
  activePurchase: {
    plan_code: string | null;
    billing_cycle: 'monthly' | 'annual' | null;
    credits: number;
    access_ends_at: string | null;
  } | null;
  sessions: XPaySessionView[];
}

export interface XPaySyncResult {
  success: boolean;
  status: string;
  paymentStatus: string;
  paid: boolean;
  purchase: {
    planCode: string | null;
    billingCycle: 'monthly' | 'annual' | null;
    credits: number;
    accessEndsAt: string | null;
  } | null;
  voucher: { reference: string | null; expiresAt: string | null };
}

/** Starts a hosted XPay checkout for a plan or a credit pack. */
export async function startXPayCheckout(params: {
  planCode?: string;
  packId?: string;
  billingCycle?: 'monthly' | 'annual';
  couponCode?: string;
  locale?: 'ar' | 'en';
  idempotencyKey?: string;
}): Promise<XPayCheckoutResponse> {
  return apiRequest<XPayCheckoutResponse>('/api/xpay/checkout-session', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchXPayStatus(): Promise<XPayStatus> {
  return (await apiRequest<{ success: boolean; status: XPayStatus }>('/api/xpay/status')).status;
}

/**
 * Asks the server to check one session with XPay and apply the result.
 *
 * This is what the return page calls. It is safe to call more than once: a paid
 * session is only ever granted once.
 */
export async function syncXPaySession(sessionId: string): Promise<XPaySyncResult> {
  return apiRequest<XPaySyncResult>(`/api/xpay/session/${encodeURIComponent(sessionId)}/sync`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Navigates to the hosted page.
 *
 * In a Capacitor build the system browser is used deliberately: a card form
 * must not run inside an embedded WebView. The return URL is an ordinary web
 * address, so the payment completes in that browser.
 */
export async function goToXPay(url: string): Promise<void> {
  await goToHostedPage(url);
}

/** Shared navigation for any hosted payment page. */
export async function goToHostedPage(url: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }
  } catch {
    // Not running under Capacitor; fall through to a normal navigation.
  }
  window.location.assign(url);
}

/** Starts the checkout and leaves for it. */
export async function beginXPayCheckout(params: Parameters<typeof startXPayCheckout>[0]): Promise<XPayCheckoutResponse> {
  const session = await startXPayCheckout(params);
  await goToHostedPage(session.url);
  return session;
}
