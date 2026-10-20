import { getSupabaseServer } from './supabase';
export async function getExperiences(userId: string) {
  const { data, error } = await getSupabaseServer().from('experiences').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}
