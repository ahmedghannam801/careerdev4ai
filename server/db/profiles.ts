// Server persistence for public.profiles
// Verified remote schema: id (uuid PK, = auth.users.id), full_name, username,
// avatar_url, phone, bio, user_type, career_goal, target_role, target_industry,
// onboarding_completed, created_at, updated_at
import { getSupabaseServer } from './supabase';

export interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  user_type: string | null;
  career_goal: string | null;
  target_role: string | null;
  target_industry: string | null;
  onboarding_completed: boolean | null;
  is_public: boolean | null;
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'full_name'
    | 'username'
    | 'avatar_url'
    | 'phone'
    | 'bio'
    | 'user_type'
    | 'career_goal'
    | 'target_role'
    | 'target_industry'
    | 'onboarding_completed'
  >
>;

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function upsertProfile(userId: string, updates: ProfileUpdate): Promise<ProfileRow> {
  const { data, error } = await getSupabaseServer()
    .from('profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

// Username availability. Uniqueness is enforced by the existing
// profiles_username_key unique index — no schema change required.
export async function findProfileByUsername(username: string): Promise<ProfileRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}
