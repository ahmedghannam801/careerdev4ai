/**
 * Centralized Payment Account Configuration
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every offline (manual) payment identifier
 * used by CareerDev4AI — Vodafone Cash and InstaPay.
 *
 * Rules enforced by this module:
 *  - No component may hardcode a wallet number, an IPA handle, or an
 *    account holder name. Everything reads from here (server side) or
 *    from the checkout instructions payload (client side).
 *  - The identifiers below are authoritative and must not be edited
 *    without an explicit product decision.
 *  - Server-side environment variables may override the *default* at
 *    runtime (useful for operations), but the committed defaults below
 *    are the values that ship to production.
 */

import type { PaymentMethod } from './payments';

/** Vodafone Cash wallet in local Egyptian format (as printed on the wallet). */
export const VODAFONE_CASH_WALLET = '01027053876';

/** Same Vodafone Cash wallet in international format (for tel: links). */
export const VODAFONE_CASH_WALLET_INTERNATIONAL = '+201027053876';

/** Registered account holder shown on the Vodafone Cash transfer. */
export const VODAFONE_CASH_ACCOUNT_HOLDER = 'CareerDev4AI Operations';

/** InstaPay Instant Payment Address (IPA). */
export const INSTAPAY_HANDLE = 'ahmed1192005@instapay';

/** Registered account holder shown on the InstaPay transfer. */
export const INSTAPAY_ACCOUNT_HOLDER = 'CareerDev4AI Commercial';

export type PaymentBrand = 'vodafone_cash' | 'instapay';

export interface PaymentAccountConfig {
  /** Payment rail this account belongs to. */
  readonly method: PaymentMethod;
  /** Brand used for the logo/mark. */
  readonly brand: PaymentBrand;
  /**
   * The identifier the customer transfers to.
   * Vodafone Cash -> wallet number, InstaPay -> IPA handle.
   */
  readonly identifier: string;
  /** Secondary display form (e.g. international dial format). */
  readonly identifierAlt: string | null;
  /** Account holder name to type/confirm on the transfer. */
  readonly accountHolderName: string;
  /** Machine-friendly label for support and receipts. */
  readonly label: string;
}

/**
 * The authoritative payment account registry.
 * Every payment surface resolves its identifiers through this map.
 */
export const PAYMENT_ACCOUNTS: Readonly<Record<'vodafone_cash' | 'instapay', PaymentAccountConfig>> = {
  vodafone_cash: {
    method: 'vodafone_cash',
    brand: 'vodafone_cash',
    identifier: VODAFONE_CASH_WALLET,
    identifierAlt: VODAFONE_CASH_WALLET_INTERNATIONAL,
    accountHolderName: VODAFONE_CASH_ACCOUNT_HOLDER,
    label: 'Vodafone Cash wallet',
  },
  instapay: {
    method: 'instapay',
    brand: 'instapay',
    identifier: INSTAPAY_HANDLE,
    identifierAlt: null,
    accountHolderName: INSTAPAY_ACCOUNT_HOLDER,
    label: 'InstaPay address',
  },
};

/** Public support / contact phone (also the Vodafone Cash wallet). */
export const CONTACT_PHONE = VODAFONE_CASH_WALLET_INTERNATIONAL;

/**
 * Resolves the account for a manual payment rail.
 * Unknown rails resolve to `null` so callers can fail loudly instead of
 * silently displaying the wrong identifier.
 */
export function getPaymentAccount(
  method: PaymentMethod | PaymentBrand | string,
): PaymentAccountConfig | null {
  if (method === 'vodafone_cash' || method === 'instapay') {
    return PAYMENT_ACCOUNTS[method];
  }
  return null;
}

/** Masked form used in logs, admin lists and notifications. */
export function maskPaymentIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.length <= 4) return '••••';
  const tail = trimmed.slice(-4);
  const maskChar = identifier.includes('@') ? '•' : '•';
  return `${maskChar.repeat(Math.max(0, trimmed.length - 4))}${tail}`;
}
