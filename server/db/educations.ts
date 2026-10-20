import { getSupabaseServer } from './supabase';
export async function getEducations(userId: string) {
  const { data, error } = await getSupabaseServer().from('educations').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}
