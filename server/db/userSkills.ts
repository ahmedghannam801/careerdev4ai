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
  /** The level a diagnostic knowledge check measured (1-5). */
  assessed_level?: number | null;
  /** The raw percentage the assessment scored (0-100). */
  assessment_score?: number | null;
  /** When the assessment was taken. */
  assessment_at?: string | null;
  /** Evidence backing the skill, as a JSON array of source names. */
  evidence_sources?: string[] | null;
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
  values: {
    proficiency?: number;
    years_experience?: number;
    assessed_level?: number | null;
    assessment_score?: number | null;
    assessment_at?: string | null;
    evidence_sources?: string[] | null;
  }
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
 * Persists a diagnostic knowledge check result.
 *
 * The self-reported proficiency is left alone: a measurement does not erase
 * what the candidate said about themselves, it is stored beside it. The
 * effective level the rest of the product uses is the stronger of the two, so
 * completing a check updates readiness, blockers and the roadmap immediately
 * without a second "sync" action.
 */
export async function recordSkillAssessment(
  userId: string,
  skillId: string,
  result: { level: number; score: number; at?: string }
): Promise<UserSkillRow> {
  const level = Math.max(1, Math.min(5, Math.round(result.level)));
  const score = Math.max(0, Math.min(100, Math.round(result.score)));
  const at = result.at ?? new Date().toISOString();

  const existing = await getSupabaseServer()
    .from('user_skills')
    .select('evidence_sources')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .maybeSingle();

  const currentSources: string[] = Array.isArray(existing.data?.evidence_sources)
    ? (existing.data!.evidence_sources as string[])
    : [];
  const evidenceSources = [...new Set([...currentSources, 'diagnostic_assessment'])];

  return upsertUserSkill(userId, skillId, {
    assessed_level: level,
    assessment_score: score,
    assessment_at: at,
    evidence_sources: evidenceSources,
  });
}

/**
 * Adds an evidence source to a skill without changing its levels.
 *
 * Used when a project, course or certificate starts covering a skill the
 * candidate already has. The source list is a set, so recording the same
 * source twice is harmless.
 */
export async function addSkillEvidenceSource(
  userId: string,
  skillId: string,
  source: string
): Promise<void> {
  const { data } = await getSupabaseServer()
    .from('user_skills')
    .select('evidence_sources')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .maybeSingle();
  const current: string[] = Array.isArray(data?.evidence_sources)
    ? (data!.evidence_sources as string[])
    : [];
  if (current.includes(source)) return;
  await upsertUserSkill(userId, skillId, {
    evidence_sources: [...current, source],
  });
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

  // The lookup is case-insensitive. The catalogue is global, so "Arabic" and
  // "arabic" are the same skill: without this, two users who typed the same
  // skill differently would each create their own row, the skill list would
  // show the skill twice, and the gap engine would count it twice.
  //
  // Two details matter here. The LIKE metacharacters have to be escaped, or
  // a skill called "C++" would match any name containing a "C"; and the result
  // is read as a list rather than with maybeSingle(), because the catalogue
  // still holds one legacy pair of rows that differ only in case and would
  // make a single-row read fail.
  const escaped = trimmed.replace(/([%_\\])/g, '\\$1');
  const { data: found } = await getSupabaseServer()
    .from('skills')
    .select('id, name')
    .ilike('name', escaped)
    .limit(4);
  const candidates = found ?? [];
  if (candidates.length > 0) {
    // Prefer the row whose casing matches what the caller typed.
    const exact = candidates.find((row) => row.name === trimmed);
    const chosen = exact ?? candidates[0];
    if (chosen?.id) return chosen.id as string;
  }

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
      .ilike('name', escaped)
      .limit(1);
    if (raced?.[0]?.id) return raced[0].id as string;
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
  values: {
    proficiency?: number;
    years_experience?: number;
    assessed_level?: number | null;
    assessment_score?: number | null;
    assessment_at?: string | null;
    evidence_sources?: string[] | null;
  }
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
