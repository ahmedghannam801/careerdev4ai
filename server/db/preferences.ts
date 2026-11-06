// Server persistence for public.user_preferences
// Verified remote schema: user_id (uuid FK -> profiles.id), theme, language,
// notifications_enabled, created_at, updated_at
import { getSupabaseServer } from './supabase';

export interface PreferencesRow {
  user_id: string;
  theme: string | null;
  language: string | null;
  notifications_enabled: boolean | null;
  // Feedback invitation state. It lives here rather than in its own table so
  // the existing owner-only row-level security covers it without a new
  // access path. Every timestamp is nullable; null means "never happened".
  feedback_last_shown_at: string | null;
  feedback_last_dismissed_at: string | null;
  feedback_last_opened_at: string | null;
  feedback_card_dismissed_at: string | null;
  feedback_session_count: number;
  feedback_last_session_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PreferencesUpdate = Partial<
  Pick<PreferencesRow, 'theme' | 'language' | 'notifications_enabled'>
>;

/** The subset of `user_preferences` the feedback policy owns. */
export type FeedbackPreferencesUpdate = Partial<
  Pick<
    PreferencesRow,
    | 'feedback_last_shown_at'
    | 'feedback_last_dismissed_at'
    | 'feedback_last_opened_at'
    | 'feedback_card_dismissed_at'
    | 'feedback_session_count'
    | 'feedback_last_session_at'
  >
>;

export async function getPreferences(userId: string): Promise<PreferencesRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as PreferencesRow | null;
}

export async function upsertPreferences(
  userId: string,
  updates: PreferencesUpdate
): Promise<PreferencesRow> {
  const { data, error } = await getSupabaseServer()
    .from('user_preferences')
    .upsert({ user_id: userId, ...updates })
    .select()
    .single();
  if (error) throw error;
  return data as PreferencesRow;
}

/**
 * Writes the feedback invitation state.
 *
 * Kept separate from `upsertPreferences` so a settings request can never
 * overwrite the invitation history, and so the feedback module cannot write
 * the theme or the language by accident.
 */
export async function upsertFeedbackPreferences(
  userId: string,
  updates: FeedbackPreferencesUpdate
): Promise<PreferencesRow> {
  const { data, error } = await getSupabaseServer()
    .from('user_preferences')
    .upsert({ user_id: userId, ...updates })
    .select()
    .single();
  if (error) throw error;
  return data as PreferencesRow;
}
