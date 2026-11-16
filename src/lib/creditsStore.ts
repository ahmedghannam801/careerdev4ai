/**
 * The one place the token balance lives.
 *
 * The balance used to be a `useState` inside the career context, refreshed on
 * login and after a daily claim. Anything else that spent a token — an ATS
 * audit, a tailored CV, a project review, a premium template — left the number
 * on the screen stale until the candidate reloaded the page. Every surface
 * showed the same view of that one state, so they were all wrong together.
 *
 * This module is the state. Components subscribe; a page component never owns
 * a copy. A balance is only ever written from a source that has the right to
 * say what it is:
 *
 *   1. The server, through `GET /api/credits/balance` — the authoritative
 *      number.
 *   2. A server answer that already carries the new balance (the daily claim,
 *      a template unlock, the learning recommender) — applied straight away so
 *      the badge moves without a second round trip.
 *   3. Another tab of the same application, through a `BroadcastChannel` (with
 *      a `localStorage` fallback), so two open tabs cannot disagree.
 *
 * Reads are single-flight: ten components asking at once produce one request.
 * A request that arrives while another is in flight is coalesced into a
 * follow-up read rather than running alongside it, which is what keeps a burst
 * of AI operations from racing each other and leaving an older answer on the
 * screen.
 *
 * Supabase Realtime is the fast path: a new row in the credit ledger for this
 * candidate triggers an authoritative re-read. When the table is not in the
 * realtime publication (or the socket is down) the same re-read happens on
 * focus, on tab visibility and on a slow poll, so the balance still converges
 * without a reload. The client never assumes realtime is available.
 */

import type { CreditBalanceDTO } from '../../shared/credits';
import { apiUrl } from './native';
import { getAccessToken, getBrowserSupabase, isSupabaseConfigured } from './supabase';
import {
  onCreditActivity,
  type CreditActivityReason,
} from './creditActivity';

export interface CreditsSnapshot {
  /** The last authoritative balance received, or null before the first read. */
  balance: CreditBalanceDTO | null;
  /** True while a read is in flight. */
  refreshing: boolean;
  /** The last read failure, cleared by the next successful read. */
  error: string | null;
  /** When the current balance was received, in epoch milliseconds. */
  updatedAt: number | null;
}

const INITIAL_SNAPSHOT: CreditsSnapshot = {
  balance: null,
  refreshing: false,
  error: null,
  updatedAt: null,
};

let snapshot: CreditsSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(next: CreditsSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn('A credit balance listener failed:', error);
    }
  }
}

export function getCreditsSnapshot(): CreditsSnapshot {
  return snapshot;
}

export function subscribeCredits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

let identity: string | null = null;
let identityReady = false;
// Invalidates reads started for a previous account/session. A late response
// must never publish one user's balance into another user's store snapshot.
let identityGeneration = 0;
let unsubscribeActivity: (() => void) | null = null;
let detachWindowListeners: (() => void) | null = null;
let realtimeChannel: { unsubscribe: () => void } | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledReason: CreditActivityReason = 'manual-refresh';

/**
 * Tells the store whose balance it is looking at.
 *
 * `null` is a sign-out: the balance is cleared and every background
 * synchronisation stopped, so a different candidate can never inherit the
 * previous one's number.
 */
export function setCreditIdentity(userId: string | null): void {
  if (identityReady && identity === userId) return;
  identityReady = true;
  const changed = identity !== userId;
  identity = userId;
  if (changed) {
    identityGeneration += 1;
    pending = false;
    inFlight = null;
  }

  if (!userId) {
    resetCredits();
    return;
  }

  ensureActivityBridge();
  startCreditSync();
  if (changed) {
    // A new session: never show the previous candidate's balance, and read the
    // new one immediately.
    emit({ ...snapshot, balance: null, updatedAt: null, error: null });
    void refreshCredits('manual-refresh');
    startCreditRealtime(userId);
  }
}

/** Forgets everything. Safe to call when there is nothing to forget. */
export function resetCredits(): void {
  identityGeneration += 1;
  identity = null;
  identityReady = false;
  stopCreditRealtime();
  stopCreditPolling();
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  unsubscribeActivity?.();
  unsubscribeActivity = null;
  detachWindowListeners?.();
  detachWindowListeners = null;
  inFlight = null;
  inFlightGeneration = -1;
  pending = false;
  emit(INITIAL_SNAPSHOT);
}

/* -------------------------------------------------------------------------- */
/* Reading the authoritative balance                                          */
/* -------------------------------------------------------------------------- */

let inFlight: Promise<void> | null = null;
let inFlightGeneration = -1;
let pending = false;

function toBalanceDto(payload: unknown): CreditBalanceDTO | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  if (typeof source.balance !== 'number' || !Number.isFinite(source.balance)) return null;
  const dto: CreditBalanceDTO = {
    balance: source.balance,
    monthlyAllocation:
      typeof source.monthlyAllocation === 'number' ? source.monthlyAllocation : 0,
    consumedThisMonth:
      typeof source.consumedThisMonth === 'number' ? source.consumedThisMonth : 0,
    tier: typeof source.tier === 'string' ? source.tier : 'free',
    expiresAt: typeof source.expiresAt === 'string' ? source.expiresAt : null,
  };
  if (source.daily && typeof source.daily === 'object') {
    dto.daily = source.daily as CreditBalanceDTO['daily'];
  }
  return dto;
}

async function readBalance(): Promise<CreditBalanceDTO | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(apiUrl('/api/credits/balance'), {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    let message = `Could not read the token balance (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // The status is still the honest answer.
    }
    throw new Error(message);
  }
  return toBalanceDto(await res.json());
}

/**
 * Re-reads the balance from the server.
 *
 * Single-flight: if a read is already running this returns it, and asks for one
 * more read afterwards. That coalesces a burst of operations into at most two
 * requests and guarantees the last answer on screen is not older than the last
 * operation.
 */
export function refreshCredits(reason: CreditActivityReason = 'manual-refresh'): Promise<void> {
  const requestedIdentity = identity;
  if (!requestedIdentity) return Promise.resolve();
  const requestedGeneration = identityGeneration;
  if (inFlight && inFlightGeneration === requestedGeneration) {
    pending = true;
    return inFlight;
  }

  emit({ ...snapshot, refreshing: true });
  const request = (async () => {
    try {
      const balance = await readBalance();
      if (identity !== requestedIdentity || identityGeneration !== requestedGeneration) return;
      if (balance === null) {
        // No session any more. The sign-out path owns the reset.
        emit({ ...snapshot, refreshing: false });
        return;
      }
      applyCreditBalance(balance, { broadcast: true, source: reason });
    } catch (error) {
      if (identity !== requestedIdentity || identityGeneration !== requestedGeneration) return;
      emit({
        ...snapshot,
        refreshing: false,
        error: error instanceof Error ? error.message : 'Could not read the token balance',
      });
    }
  })();
  inFlight = request;
  inFlightGeneration = requestedGeneration;

  const settle = () => {
    if (inFlight !== request || identityGeneration !== requestedGeneration) return;
    inFlight = null;
    inFlightGeneration = -1;
    if (pending) {
      pending = false;
      void refreshCredits(reason);
    }
  };
  void request.finally(settle);
  return request;
}

/**
 * Coalesces a burst of activity into one read.
 *
 * A single AI operation can announce itself from both the API client and the
 * feature that called it. A short delay makes that one request.
 */
export function scheduleCreditRefresh(
  reason: CreditActivityReason = 'ai-operation',
  delayMs = 120
): void {
  if (!identity) return;
  scheduledReason = reason;
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshCredits(scheduledReason);
  }, delayMs);
}

/* -------------------------------------------------------------------------- */
/* Writing a balance a server answer already supplied                         */
/* -------------------------------------------------------------------------- */

export interface CreditBalancePatch {
  balance?: number;
  monthlyAllocation?: number;
  consumedThisMonth?: number;
  tier?: string;
  expiresAt?: string | null;
  daily?: CreditBalanceDTO['daily'];
}

export interface ApplyCreditBalanceOptions {
  /** Announce the new number to the other open tabs. */
  broadcast?: boolean;
  source?: CreditActivityReason;
  /** The time the number was received. Defaults to now. */
  updatedAt?: number;
}

/**
 * Applies a balance the caller already has.
 *
 * Used by the daily claim, the template unlock and any other response that
 * carries the balance it produced, so the header moves on the same tick as the
 * confirmation instead of after another round trip.
 */
export function applyCreditBalance(
  next: CreditBalanceDTO | null,
  options: ApplyCreditBalanceOptions = {}
): void {
  if (!next) return;
  const updatedAt = options.updatedAt ?? Date.now();
  // Broadcasts and in-flight replies can arrive out of order. Keep the newest
  // known snapshot; a later server refresh can still replace it authoritatively.
  if (snapshot.updatedAt !== null && updatedAt < snapshot.updatedAt) return;
  emit({
    balance: next,
    refreshing: false,
    error: null,
    updatedAt,
  });
  if (options.broadcast !== false) {
    broadcastBalance(next, updatedAt);
  }
}

/**
 * Merges a partial balance into the one on screen.
 *
 * A response that only knows the new total (the learning recommender, for
 * example) must not erase the monthly allowance, the tier or the daily state
 * that the full balance carries.
 */
export function patchCreditBalance(patch: CreditBalancePatch): void {
  const current = snapshot.balance;
  if (!current) return;
  const next: CreditBalanceDTO = {
    ...current,
    ...(typeof patch.balance === 'number' ? { balance: patch.balance } : {}),
    ...(typeof patch.monthlyAllocation === 'number'
      ? { monthlyAllocation: patch.monthlyAllocation }
      : {}),
    ...(typeof patch.consumedThisMonth === 'number'
      ? { consumedThisMonth: patch.consumedThisMonth }
      : {}),
    ...(typeof patch.tier === 'string' ? { tier: patch.tier } : {}),
    ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
    ...(patch.daily ? { daily: patch.daily } : {}),
  };
  applyCreditBalance(next, { broadcast: true });
}

/* -------------------------------------------------------------------------- */
/* Cross-tab synchronisation                                                  */
/* -------------------------------------------------------------------------- */

const CHANNEL_NAME = 'careerdev4ai.credits';
const STORAGE_KEY = 'careerdev4ai.credits.sync';

interface SyncMessage {
  type: 'credits:update' | 'credits:invalidate';
  userId: string;
  balance?: CreditBalanceDTO;
  updatedAt?: number;
}

export function isSyncMessageForIdentity(message: unknown, userId: string | null): message is SyncMessage {
  if (!userId || !message || typeof message !== 'object') return false;
  return (message as { userId?: unknown }).userId === userId;
}

let broadcastChannel: BroadcastChannel | null = null;
let channelStarted = false;

function ensureChannel(): BroadcastChannel | null {
  if (channelStarted) return broadcastChannel;
  channelStarted = true;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const message = event.data;
      if (!isSyncMessageForIdentity(message, identity)) return;
      if (
        message.type === 'credits:update' &&
        message.balance &&
        typeof message.balance.balance === 'number'
      ) {
        applyCreditBalance(message.balance, {
          broadcast: false,
          updatedAt: message.updatedAt ?? Date.now(),
        });
      } else if (message.type === 'credits:invalidate') {
        scheduleCreditRefresh('cross-tab', 0);
      }
    };
  } catch {
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function broadcastBalance(balance: CreditBalanceDTO, updatedAt: number): void {
  if (!identity) return;
  const message: SyncMessage = { type: 'credits:update', userId: identity, balance, updatedAt };
  ensureChannel()?.postMessage(message);
  // The storage event is the fallback for a browser without
  // `BroadcastChannel`; it is not used to hold the number between sessions,
  // only to hand it to a tab that is open right now.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // A full or disabled storage is not an error worth reporting.
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const message: unknown = JSON.parse(event.newValue);
    if (!isSyncMessageForIdentity(message, identity)) return;
    if (message.type === 'credits:update' && message.balance) {
      applyCreditBalance(message.balance, {
        broadcast: false,
        updatedAt: message.updatedAt ?? Date.now(),
      });
    }
  } catch {
    // A message this tab cannot read was not written for it.
  }
}

/* -------------------------------------------------------------------------- */
/* Activity, focus and realtime                                               */
/* -------------------------------------------------------------------------- */

function ensureActivityBridge(): void {
  if (unsubscribeActivity) return;
  unsubscribeActivity = onCreditActivity((detail) => {
    scheduleCreditRefresh(detail.reason);
  });
}

function startCreditSync(): void {
  if (typeof window === 'undefined' || detachWindowListeners) return;
  ensureChannel();
  const onFocus = () => maybeRefresh('focus');
  const onVisibility = () => {
    if (document.visibilityState === 'visible') maybeRefresh('focus');
  };
  const onOnline = () => maybeRefresh('focus');
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  window.addEventListener('storage', handleStorage);
  document.addEventListener('visibilitychange', onVisibility);
  detachWindowListeners = () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('storage', handleStorage);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  startCreditPolling();
}

/** A focus refresh is skipped when the balance was read moments ago. */
function maybeRefresh(reason: CreditActivityReason): void {
  if (!identity) return;
  if (Date.now() - (snapshot.updatedAt ?? 0) < 10_000) return;
  void refreshCredits(reason);
}

function startCreditPolling(): void {
  if (pollTimer !== null || typeof window === 'undefined') return;
  pollTimer = setInterval(() => {
    if (!identity) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    maybeRefresh('poll');
  }, 60_000);
}

function stopCreditPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startCreditRealtime(userId: string): void {
  stopCreditRealtime();
  if (!isSupabaseConfigured) return;
  try {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`credit-ledger:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_credit_ledger',
          filter: `profile_id=eq.${userId}`,
        },
        () => {
          // The ledger row is the signal, not the number: the balance is
          // computed from the whole ledger, so it is read again.
          scheduleCreditRefresh('realtime', 200);
        }
      )
      .subscribe();
    realtimeChannel = channel;
  } catch (error) {
    // Realtime is an accelerator. The focus and polling paths still run.
    console.warn('Credit realtime is unavailable; falling back to polling:', error);
    realtimeChannel = null;
  }
}

function stopCreditRealtime(): void {
  if (!realtimeChannel) return;
  try {
    realtimeChannel.unsubscribe();
  } catch {
    // The channel may already be closed by the client.
  }
  realtimeChannel = null;
}
