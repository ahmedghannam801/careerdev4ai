/**
 * Server-side email preferences.
 *
 * The row is created with the account by the migration, so it is always there.
 * Writes go through this module and the permission-checked API; the table
 * itself grants an authenticated user SELECT on their own row and nothing
 * else, which means a direct PostgREST call cannot alter consent.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import type { EmailLocale } from './templates.ts';

export interface EmailPreferencesRow {
  user_id: string;
  email_enabled: boolean;
  security_alerts: boolean;
  billing_updates: boolean;
  application_updates: boolean;
  interview_updates: boolean;
  roadmap_updates: boolean;
  job_alerts: boolean;
  opportunity_alerts: boolean;
  learning_updates: boolean;
  volunteering_updates: boolean;
  project_updates: boolean;
  assessment_updates: boolean;
  career_recommendations: boolean;
  announcements: boolean;
  daily_digest: boolean;
  weekly_digest: boolean;
  digest_hour: number;
  unsubscribe_token: string;
  unsubscribed_all: boolean;
  unsubscribed_at: string | null;
  consent_granted_at: string;
  consent_updated_at: string;
  consent_source: string;
  last_daily_digest_at: string | null;
  last_weekly_digest_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailPreferencesDTO {
  emailEnabled: boolean;
  securityAlerts: boolean;
  billingUpdates: boolean;
  applicationUpdates: boolean;
  interviewUpdates: boolean;
  roadmapUpdates: boolean;
  jobAlerts: boolean;
  opportunityAlerts: boolean;
  learningUpdates: boolean;
  volunteeringUpdates: boolean;
  projectUpdates: boolean;
  assessmentUpdates: boolean;
  careerRecommendations: boolean;
  announcements: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  digestHour: number;
  unsubscribedAll: boolean;
  unsubscribedAt: string | null;
  consentGrantedAt: string;
  consentUpdatedAt: string;
  consentSource: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export type EmailPreferenceKey =
  | 'emailEnabled'
  | 'securityAlerts'
  | 'billingUpdates'
  | 'applicationUpdates'
  | 'interviewUpdates'
  | 'roadmapUpdates'
  | 'jobAlerts'
  | 'opportunityAlerts'
  | 'learningUpdates'
  | 'volunteeringUpdates'
  | 'projectUpdates'
  | 'assessmentUpdates'
  | 'careerRecommendations'
  | 'announcements'
  | 'dailyDigest'
  | 'weeklyDigest';

const COLUMN_BY_KEY: Record<EmailPreferenceKey, keyof EmailPreferencesRow> = {
  emailEnabled: 'email_enabled',
  securityAlerts: 'security_alerts',
  billingUpdates: 'billing_updates',
  applicationUpdates: 'application_updates',
  interviewUpdates: 'interview_updates',
  roadmapUpdates: 'roadmap_updates',
  jobAlerts: 'job_alerts',
  opportunityAlerts: 'opportunity_alerts',
  learningUpdates: 'learning_updates',
  volunteeringUpdates: 'volunteering_updates',
  projectUpdates: 'project_updates',
  assessmentUpdates: 'assessment_updates',
  careerRecommendations: 'career_recommendations',
  announcements: 'announcements',
  dailyDigest: 'daily_digest',
  weeklyDigest: 'weekly_digest',
};

/** The preference that governs a queue category. */
export const CATEGORY_PREFERENCE: Record<string, EmailPreferenceKey | null> = {
  transactional: null,
  security: 'securityAlerts',
  billing_receipt: null,
  billing: 'billingUpdates',
  payment: 'billingUpdates',
  subscription: 'billingUpdates',
  application_updates: 'applicationUpdates',
  interview_updates: 'interviewUpdates',
  roadmap_updates: 'roadmapUpdates',
  job_alerts: 'jobAlerts',
  opportunity_alerts: 'opportunityAlerts',
  learning_updates: 'learningUpdates',
  volunteering_updates: 'volunteeringUpdates',
  project_updates: 'projectUpdates',
  assessment_updates: 'assessmentUpdates',
  career_recommendations: 'careerRecommendations',
  announcements: 'announcements',
  daily_digest: 'dailyDigest',
  weekly_digest: 'weeklyDigest',
};

export function siteOrigin(): string {
  const configured = (process.env.SITE_ORIGIN ?? '').trim().replace(/\/+$/, '');
  return configured || 'https://aionvia.pages.dev';
}

export function preferencesUrl(): string {
  return `${siteOrigin()}/#/settings?tab=notifications`;
}

export function unsubscribeUrl(token: string): string {
  return `${siteOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function toPreferencesDTO(row: EmailPreferencesRow): EmailPreferencesDTO {
  return {
    emailEnabled: row.email_enabled,
    securityAlerts: row.security_alerts,
    billingUpdates: row.billing_updates,
    applicationUpdates: row.application_updates,
    interviewUpdates: row.interview_updates,
    roadmapUpdates: row.roadmap_updates,
    jobAlerts: row.job_alerts,
    opportunityAlerts: row.opportunity_alerts,
    learningUpdates: row.learning_updates,
    volunteeringUpdates: row.volunteering_updates,
    projectUpdates: row.project_updates,
    assessmentUpdates: row.assessment_updates,
    careerRecommendations: row.career_recommendations,
    announcements: row.announcements,
    dailyDigest: row.daily_digest,
    weeklyDigest: row.weekly_digest,
    digestHour: row.digest_hour,
    unsubscribedAll: row.unsubscribed_all,
    unsubscribedAt: row.unsubscribed_at,
    consentGrantedAt: row.consent_granted_at,
    consentUpdatedAt: row.consent_updated_at,
    consentSource: row.consent_source,
    unsubscribeUrl: unsubscribeUrl(row.unsubscribe_token),
    preferencesUrl: preferencesUrl(),
  };
}

export async function getEmailPreferences(userId: string): Promise<EmailPreferencesRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('email_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as EmailPreferencesRow;

  // The row is created by a trigger on the profile. An account created before
  // the migration has one backfilled; an account created during a failure of
  // the trigger is repaired here rather than left without preferences.
  const { data: created, error: createError } = await getSupabaseServer()
    .from('email_preferences')
    .insert({ user_id: userId, consent_source: 'account' })
    .select('*')
    .single();
  if (createError) {
    if (createError.code === '23505') return getEmailPreferences(userId);
    throw createError;
  }
  return created as EmailPreferencesRow;
}

export async function updateEmailPreferences(
  userId: string,
  updates: Partial<Record<EmailPreferenceKey, boolean>> & { digestHour?: number; unsubscribeAll?: boolean },
  source = 'settings',
): Promise<EmailPreferencesRow> {
  const patch: Record<string, unknown> = {
    consent_updated_at: new Date().toISOString(),
    consent_source: source,
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'digestHour' || key === 'unsubscribeAll') continue;
    const column = COLUMN_BY_KEY[key as EmailPreferenceKey];
    if (column && typeof value === 'boolean') patch[column] = value;
  }

  if (typeof updates.digestHour === 'number') {
    if (!Number.isInteger(updates.digestHour) || updates.digestHour < 0 || updates.digestHour > 23) {
      throw new Error('digestHour must be a whole hour between 0 and 23');
    }
    patch.digest_hour = updates.digestHour;
  }

  if (updates.unsubscribeAll === true) {
    patch.unsubscribed_all = true;
    patch.unsubscribed_at = new Date().toISOString();
    // The flags are kept as they were, so re-subscribing restores the choices
    // the reader had made rather than resetting everything to defaults.
  } else if (updates.unsubscribeAll === false) {
    patch.unsubscribed_all = false;
    patch.unsubscribed_at = null;
  }

  const { data, error } = await getSupabaseServer()
    .from('email_preferences')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as EmailPreferencesRow;
}

/** Resolves the preference for one category, or null when it is transactional. */
export function preferenceForCategory(
  row: EmailPreferencesRow,
  category: string,
): boolean | null {
  const key = CATEGORY_PREFERENCE[category];
  if (key === null || key === undefined) return null;
  const column = COLUMN_BY_KEY[key];
  return row[column] as boolean;
}

/**
 * Whether a category may be sent to this account.
 *
 * Account, security and receipt mail is never suppressed by a marketing
 * preference, and a hard suppression on the address is checked separately.
 */
export function maySendCategory(row: EmailPreferencesRow, category: string): boolean {
  if (category === 'transactional' || category === 'security' || category === 'billing_receipt') {
    return true;
  }
  if (row.unsubscribed_all) return false;
  if (!row.email_enabled) return false;
  const preference = preferenceForCategory(row, category);
  return preference !== false;
}

/** The locale a message to this account should use. */
export async function localeForUser(userId: string): Promise<EmailLocale> {
  const { data } = await getSupabaseServer()
    .from('user_preferences')
    .select('language')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { language?: string } | null)?.language === 'ar' ? 'ar' : 'en';
}

/** The display name a message should greet. */
export async function nameForUser(userId: string): Promise<string> {
  const { data } = await getSupabaseServer()
    .from('profiles')
    .select('preferred_name, full_name')
    .eq('id', userId)
    .maybeSingle();
  const row = data as { preferred_name?: string | null; full_name?: string | null } | null;
  return (row?.preferred_name ?? row?.full_name ?? '').trim();
}

export async function findPreferencesByToken(token: string): Promise<EmailPreferencesRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await getSupabaseServer()
    .from('email_preferences')
    .select('*')
    .eq('unsubscribe_token', token)
    .maybeSingle();
  if (error) throw error;
  return (data as EmailPreferencesRow | null) ?? null;
}

/** Marks an address suppressed so no future message is attempted. */
export async function suppressEmail(
  email: string,
  reason: string,
  source: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;
  const { error } = await getSupabaseServer()
    .from('email_suppressions')
    .upsert(
      {
        email: address,
        reason,
        source,
        metadata,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    );
  if (error) throw error;
}
