/**
 * The referral API client.
 * ---------------------------------------------------------------------------
 * Every registered account has a personal referral link. The server owns the
 * code, the counts and the reward; this module only reads them and claims a
 * code that arrived through somebody else's link.
 *
 * It also owns the capture of that code: a visitor who arrives on
 * `?ref=CODE` keeps the code until the account exists, so the server can
 * attribute the signup to the person who invited them.
 */

import { apiRequest, ApiRequestError } from './apiClient';

/** How many referrals the account has, split by what the server knows. */
export interface ReferralCounts {
  /** Referrals the server has verified. */
  successful: number;
  /** Referrals that are waiting for the server to confirm them. */
  pending: number;
  /** Every referral the account knows about. */
  total: number;
}

/** The account's own referral summary. */
export interface ReferralSummary {
  /** The account's personal referral code. */
  code: string;
  /** The shareable link that carries the code. */
  link: string;
  /** How many people the account has referred. */
  referrals: ReferralCounts;
  /** How many credits the referrals have earned. */
  creditsEarned: number;
  /** How many credits one verified referral earns. */
  rewardPerReferral: number;
}

/** What the server answered to a claim. */
export type ReferralClaimStatus =
  /** The referral is confirmed and the reward was granted. */
  | 'verified'
  /** The referral is confirmed; the reward follows once the email is verified. */
  | 'pending_email'
  /** This referral was already claimed. */
  | 'already_claimed'
  /** The code does not exist. */
  | 'invalid_code'
  /** The code belongs to the account that tried to claim it. */
  | 'self_referral';

/** The outcome of a claim. */
export interface ReferralClaimResult {
  /** Whether the request itself succeeded. */
  success: boolean;
  /** What the server decided. */
  status: ReferralClaimStatus;
  /** How many credits the claim earned. */
  rewardCredits: number;
}

/**
 * Reads the account's own referral summary.
 *
 * Nothing is invented: a count the server did not send is read as zero, and
 * the link is the one the server published.
 */
export async function fetchReferralSummary(): Promise<ReferralSummary> {
  const res = await apiRequest<{ success: boolean } & Partial<ReferralSummary>>('/api/referrals/me');
  return {
    code: res.code ?? '',
    link: res.link ?? '',
    referrals: {
      successful: res.referrals?.successful ?? 0,
      pending: res.referrals?.pending ?? 0,
      total: res.referrals?.total ?? 0,
    },
    creditsEarned: res.creditsEarned ?? 0,
    rewardPerReferral: res.rewardPerReferral ?? 0,
  };
}

/**
 * Claims a referral code.
 *
 * The server decides what the code is worth; the status it answers with is
 * reported as it is, including the cases in which nothing was earned.
 */
export async function claimReferral(code: string): Promise<ReferralClaimResult> {
  const res = await apiRequest<
    { success: boolean } & Partial<ReferralClaimResult>
  >('/api/referrals/claim', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return {
    success: res.success,
    status: res.status ?? 'invalid_code',
    rewardCredits: res.rewardCredits ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* The captured referral code                                                 */
/* -------------------------------------------------------------------------- */

/** Where a captured referral code waits for the account to exist. */
export const REFERRAL_CODE_STORAGE_KEY = 'cd4_ref_code';

/** The shape a referral code is allowed to have. */
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

/**
 * Reads the referral code out of a URL.
 *
 * The link the platform shares carries the code in the query string
 * (`/register?ref=CODE`). The application routes by hash, so the code may
 * also arrive inside the hash's own query (`#/register?ref=CODE`); both are
 * read.
 */
export function readReferralCodeFromUrl(href?: string): string | null {
  try {
    const url = new URL(href ?? (typeof window === 'undefined' ? '' : window.location.href));
    const fromSearch = url.searchParams.get('ref');
    if (fromSearch && REFERRAL_CODE_PATTERN.test(fromSearch)) return fromSearch;

    const hash = url.hash.replace(/^#/, '');
    const queryIndex = hash.indexOf('?');
    if (queryIndex >= 0) {
      const fromHash = new URLSearchParams(hash.slice(queryIndex + 1)).get('ref');
      if (fromHash && REFERRAL_CODE_PATTERN.test(fromHash)) return fromHash;
    }
  } catch {
    // A URL that cannot be read carries no referral code.
  }
  return null;
}

/**
 * Captures the referral code in the current URL, if there is one.
 *
 * It is safe to call on every load: a URL without a code changes nothing.
 */
export function captureReferralCodeFromUrl(href?: string): string | null {
  const code = readReferralCodeFromUrl(href);
  if (!code) return null;
  storeReferralCode(code);
  return code;
}

/** Keeps a captured referral code until the account exists. */
export function storeReferralCode(code: string): void {
  try {
    window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code);
  } catch {
    // A browser that refuses storage simply loses the attribution; the
    // signup itself is never blocked by it.
  }
}

/** The captured referral code, when there is one. */
export function readStoredReferralCode(): string | null {
  try {
    const stored = window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
    return stored && REFERRAL_CODE_PATTERN.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Forgets the captured referral code. */
export function clearStoredReferralCode(): void {
  try {
    window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  } catch {
    // Nothing to do: the code is gone either way.
  }
}

/** The claim that is currently running, so it is only ever sent once. */
let claimInFlight: Promise<ReferralClaimResult | null> | null = null;

/**
 * Claims the captured referral code, once.
 *
 * The code is claimed after the account is authenticated and it is forgotten
 * afterwards, so a second call cannot claim it twice. When the request could
 * not reach the server the code is kept — the server refuses a code that was
 * already claimed, so trying again later is safe and a referral is not lost
 * to a dropped connection.
 *
 * The caller never waits for this: a failed claim never blocks the account.
 */
export function claimStoredReferral(): Promise<ReferralClaimResult | null> {
  if (claimInFlight) return claimInFlight;

  const code = readStoredReferralCode();
  if (!code) return Promise.resolve(null);

  claimInFlight = (async (): Promise<ReferralClaimResult | null> => {
    try {
      const result = await claimReferral(code);
      clearStoredReferralCode();
      return result;
    } catch (error) {
      // The server answered and refused the code: there is nothing to retry.
      if (error instanceof ApiRequestError) clearStoredReferralCode();
      return null;
    } finally {
      claimInFlight = null;
    }
  })();

  return claimInFlight;
}
