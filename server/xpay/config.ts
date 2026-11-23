/**
 * XPay configuration, read lazily from the environment.
 *
 * Secrets:
 *   XPAY_SECRET_KEY        sk_test_... / sk_live_...   (server only)
 *   XPAY_WEBHOOK_SECRET    whsec_...                   (server only)
 *
 * Optional:
 *   XPAY_ALLOW_LIVE        "true"  Required before a live key takes money.
 *   XPAY_API_BASE          Defaults to https://api.xpay.app
 *   XPAY_PAYMENT_METHOD_CONFIGURATION_ID  pmc_...  Pin checkouts to one payment
 *                          method configuration instead of the account default.
 *   SITE_ORIGIN            Origin for the return and cancel redirects.
 *
 * XPay decides test or live from the key, not from the URL: `sk_test_*` opens
 * `cs_test_*` sessions and takes no money. A live key without the explicit
 * opt-in is treated as an error rather than as a test key, because the
 * difference between the two is somebody's card.
 */

import { BRAND_ORIGIN } from '../../shared/brand.ts';

export type XPayMode = 'disabled' | 'test' | 'live';

export interface XPayConfig {
  secretKey: string;
  webhookSecret: string | null;
  paymentMethodConfigurationId: string | null;
  siteOrigin: string;
  apiBase: string;
  mode: Exclude<XPayMode, 'disabled'>;
}

export interface XPayConfigIssue {
  code: string;
  variable: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface XPayConfigStatus {
  mode: XPayMode;
  configured: boolean;
  /** True only when a checkout may take money and be confirmed. */
  checkoutReady: boolean;
  errors: XPayConfigIssue[];
  warnings: XPayConfigIssue[];
}

export class XPayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XPayConfigError';
  }
}

const DEFAULT_API_BASE = 'https://api.xpay.app';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function xpayKeyMode(secretKey: string): XPayMode {
  if (!secretKey) return 'disabled';
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) return 'live';
  return 'test';
}

export function getXPayMode(): XPayMode {
  return xpayKeyMode(readEnv('XPAY_SECRET_KEY'));
}

export function isXPayConfigured(): boolean {
  return getXPayMode() !== 'disabled';
}

/** True while this deployment is pointed at XPay's sandbox. */
export function isXPayTestMode(): boolean {
  return getXPayMode() === 'test';
}

export function getXPayConfig(): XPayConfig {
  const secretKey = readEnv('XPAY_SECRET_KEY');
  const mode = xpayKeyMode(secretKey);

  if (mode === 'disabled') {
    throw new XPayConfigError('Card payments are not configured on this server.');
  }

  if (mode === 'live' && readEnv('XPAY_ALLOW_LIVE') !== 'true') {
    throw new XPayConfigError(
      'A live XPay key is configured but XPAY_ALLOW_LIVE is not "true". Refusing to risk a live charge.'
    );
  }

  const webhookSecret = readEnv('XPAY_WEBHOOK_SECRET');
  const siteOrigin = readEnv('SITE_ORIGIN') || BRAND_ORIGIN;
  const apiBase = (readEnv('XPAY_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, '');

  return {
    secretKey,
    webhookSecret: webhookSecret.length ? webhookSecret : null,
    paymentMethodConfigurationId: readEnv('XPAY_PAYMENT_METHOD_CONFIGURATION_ID') || null,
    siteOrigin,
    apiBase,
    mode,
  };
}

/**
 * Reports what an operator has to fix, without revealing anything secret.
 *
 * The admin screen and the checkout route both read this: a checkout that
 * cannot be confirmed by a webhook is not offered, because a payment nobody can
 * verify is worse than no payment button.
 */
export function describeXPayConfig(): XPayConfigStatus {
  const mode = getXPayMode();
  const errors: XPayConfigIssue[] = [];
  const warnings: XPayConfigIssue[] = [];

  if (mode === 'disabled') {
    return { mode, configured: false, checkoutReady: false, errors, warnings };
  }

  const webhookSecret = readEnv('XPAY_WEBHOOK_SECRET');
  if (!webhookSecret) {
    errors.push({
      code: 'webhook_secret_missing',
      variable: 'XPAY_WEBHOOK_SECRET',
      message:
        'A checkout cannot be confirmed without the endpoint signing secret, so card payments are not offered.',
      severity: 'error',
    });
  } else if (!webhookSecret.startsWith('whsec_')) {
    warnings.push({
      code: 'webhook_secret_shape',
      variable: 'XPAY_WEBHOOK_SECRET',
      message: 'The signing secret does not start with whsec_. Check that the endpoint secret was copied.',
      severity: 'warning',
    });
  }

  if (mode === 'live' && readEnv('XPAY_ALLOW_LIVE') !== 'true') {
    errors.push({
      code: 'live_not_allowed',
      variable: 'XPAY_ALLOW_LIVE',
      message: 'A live key is configured. Set XPAY_ALLOW_LIVE=true to take real payments.',
      severity: 'error',
    });
  }

  if (mode === 'test') {
    warnings.push({
      code: 'test_mode',
      variable: 'XPAY_SECRET_KEY',
      message: 'Test mode is active: checkouts take no money and grant test entitlements.',
      severity: 'warning',
    });
  }

  const origin = readEnv('SITE_ORIGIN');
  if (!origin) {
    warnings.push({
      code: 'site_origin_default',
      variable: 'SITE_ORIGIN',
      message: `Redirects after payment fall back to ${BRAND_ORIGIN}.`,
      severity: 'warning',
    });
  } else if (!origin.startsWith('https://')) {
    errors.push({
      code: 'site_origin_not_https',
      variable: 'SITE_ORIGIN',
      message: 'XPay requires an https return address. Set SITE_ORIGIN to the deployed https origin.',
      severity: 'error',
    });
  }

  return {
    mode,
    configured: true,
    checkoutReady: errors.length === 0,
    errors,
    warnings,
  };
}
