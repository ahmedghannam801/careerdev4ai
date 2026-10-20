// Server persistence for public.user_skills and public.skills
// Verified remote schema:
//   user_skills: id, user_id (FK profiles.id), skill_id (FK skills.id), proficiency,
//                 years_experience, created_at, updated_at
//   skills:      id, name, category, description, created_at
import { getSupabaseServer } from './supabase';

export interface SkillRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  created_at: string;
}

export interface UserSkillRow {
  id: string;
  user_id: string;
  skill_id: string;
  proficiency: number | null;
  years_experience: number | null;
  created_at: string;
  updated_at: string;
}

export async function getUserSkills(userId: string): Promise<(UserSkillRow & { skill?: SkillRow })[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_skills')
    .select('*, skill:skills(*)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data as any[]) ?? [];
}

export async function upsertUserSkill(
  userId: string,
  skillId: string,
  values: { proficiency?: number; years_experience?: number }
): Promise<UserSkillRow> {
  // The unique key is (user_id, skill_id) — the upsert must target it,
  // otherwise a repeated save violates user_skills_user_id_skill_id_key.
  const { data, error } = await getSupabaseServer()
    .from('user_skills')
    .upsert(
      { user_id: userId, skill_id: skillId, ...values },
      { onConflict: 'user_id,skill_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as UserSkillRow;
}
