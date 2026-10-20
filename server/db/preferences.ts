// Server persistence for public.user_preferences
// Verified remote schema: user_id (uuid FK -> profiles.id), theme, language,
// notifications_enabled, created_at, updated_at
import { getSupabaseServer } from './supabase';

export interface PreferencesRow {
  user_id: string;
  theme: string | null;
  language: string | null;
  notifications_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

export type PreferencesUpdate = Partial<
  Pick<PreferencesRow, 'theme' | 'language' | 'notifications_enabled'>
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
