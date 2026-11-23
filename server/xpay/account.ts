/**
 * What this merchant account can actually charge.
 *
 * The requirement that shaped this file: do not assume every method is
 * activated. XPay only offers what the merchant's processors are provisioned
 * for, and the dashboard's payment-method configuration can then hide a method
 * a second time. So the account is asked, and the answer is reported as it is
 * rather than as a wish list of Visa, Mastercard, Apple Pay, Fawry and ValU.
 *
 * The answer is cached because it changes when someone changes the account,
 * not between two clicks, and every checkout page load would otherwise spend
 * a request on it.
 */

import { xpayGet } from './client.ts';
import { getXPayConfig } from './config.ts';

/**
 * The currencies XPay documents for a checkout session.
 *
 * A code outside this list is not a currency XPay can charge in, so a row that
 * carries one is dropped rather than shown as something the account can sell.
 */
export const XPAY_CURRENCIES = [
  'EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'QAR', 'KWD', 'JOD', 'OMR', 'BHD', 'AUD', 'CAD', 'CNY',
] as const;

/** The payment method types XPay can report. */
export const XPAY_PAYMENT_METHOD_TYPES = ['card', 'fawry', 'valu', 'apple_pay'] as const;
export type XPayPaymentMethodType = (typeof XPAY_PAYMENT_METHOD_TYPES)[number];

export interface XPayAccountCurrency {
  code: string;
  decimals: number;
  paymentMethodTypes: XPayPaymentMethodType[];
}

export interface XPayAccount {
  id: string;
  displayName: string | null;
  country: string | null;
  defaultCurrency: string;
  defaultLocale: string;
  livemode: boolean;
  currencies: XPayAccountCurrency[];
  wallets: Array<{ type: string; websiteReady: boolean }>;
}

/** The raw account payload, as the API documents it. */
interface XPayAccountResponse {
  id?: unknown;
  displayName?: unknown;
  country?: unknown;
  defaultCurrency?: unknown;
  defaultLocale?: unknown;
  livemode?: unknown;
  supportedCurrencies?: unknown;
  wallets?: unknown;
}

function asMethodTypes(value: unknown): XPayPaymentMethodType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is XPayPaymentMethodType =>
    typeof entry === 'string' && (XPAY_PAYMENT_METHOD_TYPES as readonly string[]).includes(entry)
  );
}

/**
 * Normalises the account payload.
 *
 * A field that is missing or of the wrong shape is dropped rather than guessed:
 * this object decides which payment methods a screen advertises.
 */
export function normalizeAccount(payload: XPayAccountResponse): XPayAccount {
  const currencies: XPayAccountCurrency[] = Array.isArray(payload.supportedCurrencies)
    ? payload.supportedCurrencies.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Record<string, unknown>;
        if (
          typeof record.code !== 'string' ||
          !(XPAY_CURRENCIES as readonly string[]).includes(record.code)
        ) {
          return [];
        }
        const decimals = Number(record.decimals);
        return [
          {
            code: record.code,
            decimals: Number.isFinite(decimals) && decimals >= 0 && decimals <= 4 ? decimals : 2,
            paymentMethodTypes: asMethodTypes(record.paymentMethodTypes),
          },
        ];
      })
    : [];

  const wallets = Array.isArray(payload.wallets)
    ? payload.wallets.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Record<string, unknown>;
        // Apple Pay is the only wallet XPay reports today; anything else is a
        // future method this build cannot describe.
        if (record.type !== 'apple_pay') return [];
        return [{ type: record.type, websiteReady: record.websiteReady === true }];
      })
    : [];

  return {
    id: typeof payload.id === 'string' ? payload.id : 'unknown',
    displayName: typeof payload.displayName === 'string' ? payload.displayName : null,
    country: typeof payload.country === 'string' ? payload.country : null,
    defaultCurrency: typeof payload.defaultCurrency === 'string' ? payload.defaultCurrency : 'EGP',
    defaultLocale: typeof payload.defaultLocale === 'string' ? payload.defaultLocale : 'auto',
    livemode: payload.livemode === true,
    currencies,
    wallets,
  };
}

const ACCOUNT_CACHE_MS = 5 * 60_000;

let cache: { account: XPayAccount; at: number } | null = null;

/** Drops the cached account. Used by the diagnostics screen and by tests. */
export function clearXPayAccountCache(): void {
  cache = null;
}

export async function getXPayAccount(options: { fresh?: boolean } = {}): Promise<XPayAccount> {
  if (!options.fresh && cache && Date.now() - cache.at < ACCOUNT_CACHE_MS) {
    return cache.account;
  }

  const payload = await xpayGet<XPayAccountResponse>('/account', { config: getXPayConfig() });
  const account = normalizeAccount(payload);
  cache = { account, at: Date.now() };
  return account;
}

export interface PaymentMethodAvailability {
  /** Every method this account is provisioned for, in XPay's display order. */
  methods: XPayPaymentMethodType[];
  /** The methods that survive for the currency the platform prices in. */
  methodsForEgp: XPayPaymentMethodType[];
  /** False when the account cannot charge EGP at all, which blocks checkout. */
  egpSupported: boolean;
  /** Wallet readiness, for the one wallet that needs a website setup. */
  applePayWebsiteReady: boolean;
  currency: string;
  livemode: boolean;
  /**
   * What the account says is possible. A checkout can still show fewer
   * methods, because the dashboard configuration filters this list again.
   */
  note: string;
}

/**
 * Reads the account and reports the methods available for EGP.
 *
 * The platform prices in EGP, so the EGP row is the one that matters: an
 * account that can take cards in USD but not in EGP cannot sell a plan here.
 */
export async function discoverPaymentMethods(
  options: { fresh?: boolean } = {}
): Promise<PaymentMethodAvailability> {
  const account = await getXPayAccount(options);
  const egp = account.currencies.find((entry) => entry.code === 'EGP');

  const methods = XPAY_PAYMENT_METHOD_TYPES.filter((method) =>
    account.currencies.some((entry) => entry.paymentMethodTypes.includes(method))
  );

  return {
    methods,
    methodsForEgp: egp ? egp.paymentMethodTypes : [],
    egpSupported: Boolean(egp),
    applePayWebsiteReady: account.wallets.some(
      (wallet) => wallet.type === 'apple_pay' && wallet.websiteReady
    ),
    currency: 'EGP',
    livemode: account.livemode,
    note: 'Methods are reported by the account; the payment-method configuration in the XPay dashboard can show fewer at checkout.',
  };
}
