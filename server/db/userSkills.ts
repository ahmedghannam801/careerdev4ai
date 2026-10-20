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

/**
 * The category used when a skill is created without one.
 *
 * `skills.category` is NOT NULL in the live schema, so a value is always
 * required. 'technical' is the category the app uses for most skills.
 */
export const DEFAULT_SKILL_CATEGORY = 'technical';

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

/**
 * Resolves a skill name to its catalogue id, creating the catalogue row when
 * it does not exist yet.
 *
 * `public.skills` is a GLOBAL catalogue shared by every user: it has no owner
 * and no cascade, so a row created here survives the user. The insert is
 * conflict-tolerant — two users adding the same skill concurrently must not
 * produce a duplicate-key error.
 *
 * `skills.category` is NOT NULL in the live schema, so a category is always
 * supplied; the default matches the categories the app uses.
 */
export async function resolveSkillId(name: string, category?: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: found } = await getSupabaseServer()
    .from('skills')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: created, error } = await getSupabaseServer()
    .from('skills')
    .insert({ name: trimmed, category: category?.trim() || DEFAULT_SKILL_CATEGORY })
    .select('id')
    .single();

  if (error) {
    // Another user inserted the same skill between the lookup and the insert.
    const { data: raced } = await getSupabaseServer()
      .from('skills')
      .select('id')
      .eq('name', trimmed)
      .maybeSingle();
    if (raced?.id) return raced.id as string;
    throw error;
  }
  return created?.id ?? null;
}

/**
 * Sets the caller's proficiency level for a skill, creating the link row when
 * it does not exist yet.
 *
 * `proficiency` is the user's skill level (1-5 in the UI). It is stored in
 * `user_skills.proficiency`; `years_experience` is optional.
 */
export async function setUserSkillLevel(
  userId: string,
  skillId: string,
  values: { proficiency?: number; years_experience?: number }
): Promise<UserSkillRow> {
  return upsertUserSkill(userId, skillId, values);
}

/** Removes a skill link owned by the given user. */
export async function deleteUserSkill(userId: string, skillId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('user_skills')
    .delete()
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
