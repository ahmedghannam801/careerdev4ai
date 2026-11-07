/**
 * Stripe configuration, read lazily from the environment.
 *
 * Nothing is read at import time: `dotenv` populates `process.env` after the
 * modules are loaded, and the test suite sets variables per run. A getter that
 * reads on first use is the only arrangement that works in both.
 *
 * Secrets:
 *   STRIPE_SECRET_KEY       sk_test_... / sk_live_...   (server only)
 *   STRIPE_WEBHOOK_SECRET   whsec_...                   (server only)
 *
 * Optional:
 *   STRIPE_PORTAL_CONFIGURATION_ID  bpc_...  Use a dedicated Customer Portal
 *                                   configuration instead of the account default.
 *   STRIPE_ACCOUNT_ID               acct_... Reject events from another account.
 *   STRIPE_AUTOMATIC_TAX            "true"   Enable Stripe Tax on Checkout.
 *   STRIPE_ALLOW_LIVE               "true"   Required before a live key is used.
 *   SITE_ORIGIN                     canonical origin for redirect URLs.
 *
 * There are three modes and no implicit fallback:
 *
 *   disabled  no key configured; every card surface is hidden.
 *   test      a test key; entitlements and revenue are test-scoped.
 *   live      a live key with STRIPE_ALLOW_LIVE=true.
 *
 * A live key without the explicit opt-in is treated as a configuration error,
 * never as a test key. That is the difference between "card payments are off"
 * and "card payments quietly take test mode actions against a live account".
 */

export type StripeMode = 'disabled' | 'test' | 'live';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
  portalConfigurationId: string | null;
  accountId: string | null;
  siteOrigin: string;
  automaticTax: boolean;
  apiBase: string;
  mode: Exclude<StripeMode, 'disabled'>;
}

export type StripeConfigIssueSeverity = 'error' | 'warning';

export interface StripeConfigIssue {
  /** A stable, machine-readable reason. */
  code: string;
  /** The environment variable the operator has to change. */
  variable: string;
  /** A human-readable, actionable explanation. */
  message: string;
  severity: StripeConfigIssueSeverity;
}

export interface StripeConfigStatus {
  mode: StripeMode;
  configured: boolean;
  /** True only when card checkout may take money without risking an un-credited purchase. */
  checkoutReady: boolean;
  errors: StripeConfigIssue[];
  warnings: StripeConfigIssue[];
}

const DEFAULT_SITE_ORIGIN = 'https://careerdev4ai.pages.dev';
const DEFAULT_API_BASE = 'https://api.stripe.com';

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigError';
  }
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? '').trim();
}

function secretKeyMode(secretKey: string): StripeMode {
  if (!secretKey) return 'disabled';
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) return 'live';
  return 'test';
}

export function getStripeMode(): StripeMode {
  return secretKeyMode(readEnv(process.env, 'STRIPE_SECRET_KEY'));
}

export function getStripeConfig(): StripeConfig {
  const secretKey = readEnv(process.env, 'STRIPE_SECRET_KEY');
  if (!secretKey) {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY is not configured. Add it to .env (local) or as a secret on the deployment.'
    );
  }

  const mode = secretKeyMode(secretKey);
  if (mode === 'test' && !secretKey.startsWith('sk_test_') && !secretKey.startsWith('rk_test_')) {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY is neither a test nor a live Stripe key. Expected a value starting with sk_test_, rk_test_, sk_live_ or rk_live_.'
    );
  }

  // Fail closed on live mode. A live key used by accident, together with a
  // test webhook secret, would take real money and then reject the event that
  // grants the plan. Requiring an explicit opt-in makes that impossible to do
  // without noticing.
  if (mode === 'live' && readEnv(process.env, 'STRIPE_ALLOW_LIVE') !== 'true') {
    throw new StripeConfigError(
      'A live Stripe key is configured but STRIPE_ALLOW_LIVE is not "true". Refusing to run in live mode. Card payments stay disabled until an operator explicitly confirms live eligibility.'
    );
  }

  return {
    secretKey,
    webhookSecret: readEnv(process.env, 'STRIPE_WEBHOOK_SECRET') || null,
    portalConfigurationId: readEnv(process.env, 'STRIPE_PORTAL_CONFIGURATION_ID') || null,
    accountId: readEnv(process.env, 'STRIPE_ACCOUNT_ID') || null,
    siteOrigin: (readEnv(process.env, 'SITE_ORIGIN') || DEFAULT_SITE_ORIGIN).replace(/\/+$/, ''),
    automaticTax: readEnv(process.env, 'STRIPE_AUTOMATIC_TAX') === 'true',
    apiBase: (readEnv(process.env, 'STRIPE_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, ''),
    mode: mode === 'live' ? 'live' : 'test',
  };
}

/**
 * Reports what is missing without throwing, so the status endpoint can return
 * an actionable list instead of a generic failure.
 */
export function describeStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfigStatus {
  const secretKey = readEnv(env, 'STRIPE_SECRET_KEY');
  const webhookSecret = readEnv(env, 'STRIPE_WEBHOOK_SECRET');
  const mode = secretKeyMode(secretKey);
  const errors: StripeConfigIssue[] = [];
  const warnings: StripeConfigIssue[] = [];

  if (!secretKey) {
    errors.push({
      code: 'missing_secret_key',
      variable: 'STRIPE_SECRET_KEY',
      severity: 'error',
      message:
        'Set the Stripe secret key as a server-side secret. Without it no Checkout Session can be created.',
    });
  } else if (
    !secretKey.startsWith('sk_test_') &&
    !secretKey.startsWith('rk_test_') &&
    !secretKey.startsWith('sk_live_') &&
    !secretKey.startsWith('rk_live_')
  ) {
    errors.push({
      code: 'invalid_secret_key',
      variable: 'STRIPE_SECRET_KEY',
      severity: 'error',
      message:
        'The configured value is not a Stripe secret key. It must start with sk_test_, rk_test_, sk_live_ or rk_live_.',
    });
  }

  if (mode === 'live' && readEnv(env, 'STRIPE_ALLOW_LIVE') !== 'true') {
    errors.push({
      code: 'live_not_allowed',
      variable: 'STRIPE_ALLOW_LIVE',
      severity: 'error',
      message:
        'A live key is present but live mode is not authorised. Set STRIPE_ALLOW_LIVE=true only after Stripe has enabled charges for this business.',
    });
  }

  if (!webhookSecret) {
    errors.push({
      code: 'missing_webhook_secret',
      variable: 'STRIPE_WEBHOOK_SECRET',
      severity: 'error',
      message:
        'Card checkout is refused until a webhook signing secret is configured: a payment must never be taken without a verified path to activation and credit grants.',
    });
  } else if (!webhookSecret.startsWith('whsec_')) {
    warnings.push({
      code: 'unusual_webhook_secret',
      variable: 'STRIPE_WEBHOOK_SECRET',
      severity: 'warning',
      message: 'Stripe webhook signing secrets normally start with whsec_.',
    });
  }

  const siteOrigin = readEnv(env, 'SITE_ORIGIN');
  if (siteOrigin && !siteOrigin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(siteOrigin)) {
    warnings.push({
      code: 'insecure_site_origin',
      variable: 'SITE_ORIGIN',
      severity: 'warning',
      message: 'SITE_ORIGIN is not an HTTPS URL. Stripe redirects should use the public HTTPS origin.',
    });
  }

  if (readEnv(env, 'STRIPE_AUTOMATIC_TAX') === 'true' && !readEnv(env, 'STRIPE_TAX_REGISTRATION_CONFIRMED')) {
    warnings.push({
      code: 'tax_not_confirmed',
      variable: 'STRIPE_AUTOMATIC_TAX',
      severity: 'warning',
      message:
        'Stripe Tax is enabled without STRIPE_TAX_REGISTRATION_CONFIRMED. Confirm the tax registrations before charging tax.',
    });
  }

  const configured = Boolean(secretKey);
  return {
    mode,
    configured,
    checkoutReady: configured && errors.length === 0,
    errors,
    warnings,
  };
}

/** Throws with every actionable problem when card checkout is not safe yet. */
export function assertStripeCheckoutReady(): void {
  const status = describeStripeConfig();
  if (status.checkoutReady) return;

  const detail = status.errors
    .map((issue) => `${issue.variable}: ${issue.message}`)
    .join(' | ');
  throw new StripeConfigError(
    `Card payments are not ready on this deployment. ${detail || 'Stripe is not configured.'}`
  );
}

/**
 * The webhook may run while checkout is disabled (for example, a deployment
 * that has a secret key but has not yet added the webhook secret). It still
 * needs a signing secret; without one every delivery is rejected.
 */
export function assertStripeWebhookConfigured(): StripeConfig {
  const config = getStripeConfig();
  if (!config.webhookSecret) {
    throw new StripeConfigError(
      'STRIPE_WEBHOOK_SECRET is not configured. The webhook cannot verify any delivery.'
    );
  }
  return config;
}

export function isStripeConfigured(): boolean {
  return Boolean(readEnv(process.env, 'STRIPE_SECRET_KEY'));
}

/** True for a test-mode key. Useful for labelling responses and logs. */
export function isTestMode(): boolean {
  return getStripeMode() !== 'live';
}

/**
 * Stripe's price lookup keys, derived from the application's own catalogue.
 * They are the stable contract between this code and the Dashboard: changing a
 * price means creating a new Price with the same lookup key, never editing
 * these strings.
 */
export const LOOKUP_PREFIX = 'careerdev4ai';

export function subscriptionLookupKey(planCode: string, billingCycle: 'monthly' | 'annual'): string {
  return `${LOOKUP_PREFIX}_${planCode}_${billingCycle}`;
}

export function creditPackLookupKey(packId: string): string {
  return `${LOOKUP_PREFIX}_${packId}`;
}
