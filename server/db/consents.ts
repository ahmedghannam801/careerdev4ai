// Server persistence for public.user_consents.
//
// Consent is history, not a flag: every acceptance is a row, and a new Terms
// or Privacy version creates a new row instead of overwriting the old one.
// The service role is used here because the API has already verified the
// caller's identity; the browser can only read or insert its own rows through
// RLS if it ever talks to PostgREST directly.
import { getSupabaseServer } from './supabase.ts';
import { hasServerTermsApproval } from '../legal.ts';
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  isCurrentConsent,
  type ConsentRecord,
  type ConsentSource,
  type ConsentState,
} from '../../shared/legal.ts';

interface ConsentRow {
  id: string;
  user_id: string;
  terms_version: string;
  privacy_version: string;
  status: 'accepted' | 'withdrawn';
  source: string;
  accepted_at: string;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, user_id, terms_version, privacy_version, status, source, accepted_at, created_at';

function toDTO(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    status: row.status,
    source: row.source,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

/** Every consent row for a user, newest first. */
export async function listConsents(userId: string): Promise<ConsentRecord[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_consents')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ConsentRow[]).map(toDTO);
}

/** The newest acceptance, or null when the user has never accepted. */
export async function getLatestConsent(userId: string): Promise<ConsentRecord | null> {
  const { data, error } = await getSupabaseServer()
    .from('user_consents')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as ConsentRow) : null;
}

/**
 * The full consent state the client uses to decide whether to gate access.
 *
 * `accepted` is true only when the newest row covers both current versions.
 */
export async function getConsentState(userId: string): Promise<ConsentState> {
  const history = await listConsents(userId);
  const current = history[0] ?? null;
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    termsAvailable: hasServerTermsApproval(),
    accepted: hasServerTermsApproval() && isCurrentConsent(current),
    current,
    history,
    termsPath: '/terms',
    privacyPath: '/privacy',
  };
}

/**
 * True when the user may use the platform without a new consent prompt.
 *
 * A short cache keeps the gate from adding a database round-trip to every API
 * request while still noticing a new acceptance within half a minute. The
 * cache is per user id and only ever holds a boolean, never personal data.
 */
const CONSENT_CACHE_TTL_MS = 30_000;
const consentCache = new Map<string, { accepted: boolean; expiresAt: number }>();

export function clearConsentCache(userId?: string): void {
  if (userId) consentCache.delete(userId);
  else consentCache.clear();
}

export async function hasCurrentConsent(userId: string): Promise<boolean> {
  const cached = consentCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.accepted;
  const latest = await getLatestConsent(userId);
  const accepted = isCurrentConsent(latest);
  consentCache.set(userId, { accepted, expiresAt: Date.now() + CONSENT_CACHE_TTL_MS });
  return accepted;
}

/**
 * Resolves the full state, and honours a consent the user gave during a
 * registration that required email confirmation.
 *
 * Supabase's `signUp` returns no session until the address is confirmed, so a
 * client cannot call the authenticated consent endpoint at that moment. The
 * registration form therefore carries the accepted versions in the user's
 * metadata. When the user first authenticates, those values are checked
 * against the current release and, if they match, recorded as a real row here.
 * A forged or stale metadata value simply leaves the gate closed.
 */
export async function resolveConsentState(userId: string): Promise<ConsentState> {
  const state = await getConsentState(userId);
  if (!state.termsAvailable || state.accepted) return state;

  try {
    const { data, error } = await getSupabaseServer().auth.admin.getUserById(userId);
    if (!error && data?.user) {
      const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      if (
        metadata.consent_accepted === true &&
        metadata.terms_version === TERMS_VERSION &&
        metadata.privacy_version === PRIVACY_VERSION
      ) {
        await recordConsent(userId, { source: 'registration' });
        return getConsentState(userId);
      }
    }
  } catch {
    // Reading metadata is an optimisation, not the gate itself: a failure
    // leaves the user on the ordinary consent screen.
  }

  return state;
}

/**
 * Records an acceptance of the current versions.
 *
 * The caller must have validated that the versions match the current release.
 * The unique index on (user_id, terms_version, privacy_version) makes this
 * idempotent: a repeated acceptance returns the existing row rather than
 * creating a second one.
 */
export async function recordConsent(
  userId: string,
  input: { source?: ConsentSource | string } = {}
): Promise<ConsentRecord> {
  if (!hasServerTermsApproval()) throw new Error('Approved Terms content is not available.');
  const source = input.source ?? 'reconsent';
  clearConsentCache(userId);

  const existing = await getSupabaseServer()
    .from('user_consents')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('terms_version', TERMS_VERSION)
    .eq('privacy_version', PRIVACY_VERSION)
    .eq('status', 'accepted')
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    clearConsentCache(userId);
    return toDTO(existing.data as ConsentRow);
  }

  const { data, error } = await getSupabaseServer()
    .from('user_consents')
    .insert({
      user_id: userId,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      status: 'accepted',
      source,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // A concurrent request may have inserted the same acceptance first.
    if (error.code === '23505') {
      const raced = await getSupabaseServer()
        .from('user_consents')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('terms_version', TERMS_VERSION)
        .eq('privacy_version', PRIVACY_VERSION)
        .eq('status', 'accepted')
        .maybeSingle();
      if (!raced.error && raced.data) return toDTO(raced.data as ConsentRow);
    }
    throw error;
  }
  clearConsentCache(userId);
  return toDTO(data as ConsentRow);
}
