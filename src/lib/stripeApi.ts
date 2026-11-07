/**
 * Stripe billing API client.
 *
 * The server creates the Checkout Session and returns a hosted URL. The browser
 * only navigates to it: no card data ever touches this application, which is
 * what keeps the integration in PCI scope SAQ A.
 */

import { apiRequest } from './apiClient';

export interface StripeCheckoutResponse {
  success: boolean;
  url: string;
  sessionId: string;
  mode: 'payment' | 'subscription';
  lookupKey: string;
}

export interface StripePortalResponse {
  success: boolean;
  url: string;
}

export interface StripeSubscriptionView {
  id: string;
  plan_code: string;
  billing_cycle: 'monthly' | 'annual';
  status: string;
  current_period_start: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
}

export interface StripeConfigIssueView {
  code: string;
  variable: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface StripeBillingStatus {
  success: boolean;
  configured: boolean;
  mode: 'disabled' | 'test' | 'live';
  checkoutReady: boolean;
  testMode: boolean;
  customerId: string | null;
  subscription: StripeSubscriptionView | null;
  latestSubscription: StripeSubscriptionView | null;
  config: {
    mode: 'disabled' | 'test' | 'live';
    configured: boolean;
    checkoutReady: boolean;
    errors: StripeConfigIssueView[];
    warnings: StripeConfigIssueView[];
  };
}

/** Starts a card checkout for a plan or a credit pack. */
export async function startStripeCheckout(params: {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  promotionCode?: string;
}): Promise<StripeCheckoutResponse> {
  return apiRequest<StripeCheckoutResponse>('/api/stripe/checkout-session', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Opens the Stripe-hosted Customer Portal (payment methods, invoices, cancel). */
export async function openStripePortal(): Promise<StripePortalResponse> {
  return apiRequest<StripePortalResponse>('/api/stripe/portal-session', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchStripeBillingStatus(): Promise<StripeBillingStatus> {
  return apiRequest<StripeBillingStatus>('/api/stripe/status');
}

/**
 * Navigates to a Stripe-hosted page.
 *
 * In a Capacitor build the system browser is used deliberately: Stripe
 * Checkout must not run inside an embedded WebView. The success URL is an
 * ordinary web address, so the payment completes in that browser (where the
 * web application reads the `stripe=success` result) rather than deep-linking
 * back into the native shell.
 */
export async function goToStripe(url: string): Promise<void> {
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

/** Convenience: create the session and navigate to it. */
export async function beginCardCheckout(params: {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  promotionCode?: string;
}): Promise<StripeCheckoutResponse> {
  const session = await startStripeCheckout(params);
  await goToStripe(session.url);
  return session;
}
