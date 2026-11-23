/**
 * What the deployment actually knows about its mail configuration.
 *
 * A Resend API key on its own does not make a deployment able to mail
 * arbitrary users: the `From` address must belong to a domain that Resend has
 * verified. The shared `@resend.dev` sender only delivers to the account
 * owner. A system that assumes otherwise queues a welcome email for every new
 * account and has every one of them bounce.
 *
 * This module asks the provider, caches the answer briefly, and reports the
 * truth to the admin screens and to the queue processor. Nothing here sends a
 * message or exposes the key.
 */

import { isEmailAddress, resolveSender } from './resend.ts';
import { runtimeSecret } from '../runtimeEnv.ts';

export interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  status: string;
  value: string;
  ttl?: string | number;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  region?: string;
  createdAt?: string;
  records: ResendDomainRecord[];
}

export interface EmailDeliveryConfig {
  apiKeyConfigured: boolean;
  sender: string;
  senderAddress: string | null;
  senderDomain: string | null;
  senderIsSharedTestAddress: boolean;
  ownerRecipient: string | null;
  domains: ResendDomain[];
  verifiedDomains: string[];
  /** True when the sender's domain is verified (or it is the shared test sender). */
  domainVerified: boolean;
  /**
   * True when the deployment can mail any address. False means only the owner
   * recipient (or nobody) can receive mail.
   */
  productionReady: boolean;
  /** A short, human-readable reason when not ready. */
  reason: string | null;
  checkedAt: string;
}

const RESEND_API = 'https://api.resend.com';
const CACHE_TTL_MS = 60_000;

let cache: { key: string; value: EmailDeliveryConfig; expiresAt: number } | null = null;

function addressOf(value: string): string | null {
  const bracketed = /<([^>]+)>/.exec(value)?.[1];
  const address = (bracketed ?? value).trim();
  return isEmailAddress(address) ? address : null;
}

function domainOf(address: string | null): string | null {
  if (!address) return null;
  const domain = address.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}

interface RawDomain {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  region?: unknown;
  created_at?: unknown;
  records?: unknown;
}

function toDomain(raw: RawDomain): ResendDomain | null {
  if (typeof raw?.id !== 'string' || typeof raw?.name !== 'string') return null;
  const records = Array.isArray(raw.records)
    ? raw.records
        .filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === 'object')
        .map((record) => ({
          record: String(record.record ?? ''),
          name: String(record.name ?? ''),
          type: String(record.type ?? ''),
          status: String(record.status ?? ''),
          value: String(record.value ?? ''),
          ...(record.ttl !== undefined ? { ttl: String(record.ttl) } : {}),
          ...(typeof record.priority === 'number' ? { priority: record.priority } : {}),
        }))
    : [];
  return {
    id: raw.id,
    name: raw.name,
    status: String(raw.status ?? 'not_started'),
    ...(typeof raw.region === 'string' ? { region: raw.region } : {}),
    ...(typeof raw.created_at === 'string' ? { createdAt: raw.created_at } : {}),
    records,
  };
}

async function fetchDomains(apiKey: string): Promise<ResendDomain[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${RESEND_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Resend domains request failed (HTTP ${response.status})`);
    }
    const payload = (await response.json()) as { data?: RawDomain[] };
    return (payload.data ?? [])
      .map(toDomain)
      .filter((domain): domain is ResendDomain => domain !== null);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads the current configuration. The answer is cached for one minute so a
 * queue pass, the admin screen and the status route do not each call Resend.
 *
 * A provider failure is not thrown: it is reported as "could not check", which
 * the queue treats conservatively. Sending a message that will bounce is worse
 * than waiting a minute.
 */
export async function getEmailDeliveryConfig(): Promise<EmailDeliveryConfig> {
  const sender = resolveSender();
  const apiKey = runtimeSecret('RESEND_API_KEY') ?? '';
  const senderAddress = addressOf(sender);
  const senderDomain = domainOf(senderAddress);
  const sharedSender = sender === 'Aionvia <onboarding@resend.dev>';
  const ownerRecipient = runtimeSecret('RESEND_TEST_RECIPIENT') ?? null;
  const checkedAt = new Date().toISOString();

  const base = {
    apiKeyConfigured: Boolean(apiKey),
    sender,
    senderAddress,
    senderDomain,
    senderIsSharedTestAddress: sharedSender,
    ownerRecipient: isEmailAddress(ownerRecipient) ? ownerRecipient : null,
    checkedAt,
  };

  if (!apiKey) {
    return {
      ...base,
      domains: [],
      verifiedDomains: [],
      domainVerified: false,
      productionReady: false,
      reason: 'RESEND_API_KEY is not configured on this deployment.',
    };
  }

  const cacheKey = `${apiKey.slice(-8)}|${sender}|${ownerRecipient ?? ''}`;
  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  let domains: ResendDomain[] = [];
  let providerError: string | null = null;
  try {
    domains = await fetchDomains(apiKey);
  } catch (error) {
    providerError = error instanceof Error ? error.message : 'The Resend domain check failed.';
  }

  const verifiedDomains = domains
    .filter((domain) => domain.status === 'verified')
    .map((domain) => domain.name.toLowerCase());
  const domainVerified = sharedSender
    ? true
    : Boolean(senderDomain && verifiedDomains.includes(senderDomain));

  let reason: string | null = null;
  if (providerError) {
    reason = `${providerError} Sends are paused until the domain state can be verified.`;
  } else if (sharedSender) {
    reason =
      'No verified sending domain. The shared @resend.dev sender only delivers to the Resend account owner (RESEND_TEST_RECIPIENT); every other recipient is blocked until a domain is verified and RESEND_FROM is set to it.';
  } else if (!domainVerified) {
    reason = senderDomain
      ? `The sending domain ${senderDomain} is not verified in Resend. Add the DKIM/SPF records Resend shows, wait for verification, then RESEND_FROM can deliver to real users.`
      : 'RESEND_FROM does not contain a usable address.';
  }

  const value: EmailDeliveryConfig = {
    ...base,
    domains,
    verifiedDomains,
    domainVerified,
    // The shared sender can deliver to the owner. That is the only delivery
    // path that exists without a verified domain, so it is not "production
    // ready" for arbitrary users.
    productionReady: !providerError && !sharedSender && domainVerified,
    reason,
  };

  cache = { key: cacheKey, value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** True when a send to this address is permitted by the current configuration. */
export function canDeliverTo(config: EmailDeliveryConfig, recipient: string): boolean {
  if (!config.apiKeyConfigured) return false;
  if (config.productionReady) return true;
  if (!config.senderIsSharedTestAddress && config.domainVerified) return true;
  // The shared test sender is the only path that works without a verified
  // domain, and it only reaches the account owner.
  if (!config.senderIsSharedTestAddress) return false;
  const owner = config.ownerRecipient;
  return Boolean(owner && owner.toLowerCase() === recipient.trim().toLowerCase());
}

/** Clears the cache. Used after an administrator changes the domain settings. */
export function clearEmailConfigCache(): void {
  cache = null;
}

/** Creates a domain in Resend and returns the records that must be published. */
export async function createResendDomain(name: string): Promise<ResendDomain> {
  const apiKey = runtimeSecret('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  const response = await fetch(`${RESEND_API}/domains`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { id?: string; name?: string; status?: string; records?: unknown; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? `Resend refused the domain (HTTP ${response.status}).`);
  }
  clearEmailConfigCache();
  const domain = payload ? toDomain(payload as RawDomain) : null;
  if (!domain) throw new Error('Resend created the domain but returned an unreadable response.');
  return domain;
}

/** Asks Resend to check the DNS records of one domain now. */
export async function verifyResendDomain(domainId: string): Promise<ResendDomain> {
  const apiKey = runtimeSecret('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  const response = await fetch(`${RESEND_API}/domains/${encodeURIComponent(domainId)}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Resend could not verify the domain (HTTP ${response.status}).${body ? ` ${body.slice(0, 160)}` : ''}`,
    );
  }
  clearEmailConfigCache();
  const config = await getEmailDeliveryConfig();
  return config.domains.find((domain) => domain.id === domainId) ?? {
    id: domainId,
    name: '',
    status: 'unknown',
    records: [],
  };
}
