// Server persistence for the B.5 Learning Hub.
//
// Catalogue reads are global. User state writes always use the verified
// auth user id as profile_id; no client-supplied owner is accepted anywhere in
// this module.
import { getSupabaseServer } from './supabase';
import type {
  Availability,
  CourseRole,
  CourseSkill,
  LearningCourse,
  LearningFormat,
  LearningItem,
  LearningStatus,
} from '../learning/recommendation.ts';

interface CourseRow {
  id: string;
  title: string;
  provider: string;
  provider_url: string | null;
  category: string;
  level: LearningCourse['level'];
  duration_hours: number | string | null;
  language: string;
  url: string;
  availability: Availability;
  availability_note: string | null;
  format: LearningFormat;
  description: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface CourseSkillRow {
  course_id: string;
  skill_name: string;
  importance: number;
}

interface CourseRoleRow {
  course_id: string;
  role_slug: string;
  relevance_score: number;
}

interface LearningItemRow {
  id: string;
  course_id: string;
  status: LearningStatus;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  notes: string | null;
  recommendation_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface UserSkillNameRow {
  proficiency: number | null;
  skill_id: string;
}

interface SkillRow {
  id: string;
  name: string;
}

function toCourse(
  row: CourseRow,
  skills: CourseSkill[],
  roles: CourseRole[]
): LearningCourse {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    providerUrl: row.provider_url,
    category: row.category,
    level: row.level,
    durationHours: row.duration_hours === null ? null : Number(row.duration_hours),
    language: row.language,
    url: row.url,
    availability: row.availability,
    availabilityNote: row.availability_note,
    format: row.format,
    description: row.description,
    isVerified: row.is_verified,
    skills,
    roles,
  };
}

function toItem(row: LearningItemRow): LearningItem {
  return {
    id: row.id,
    courseId: row.course_id,
    status: row.status,
    progressPercent: row.progress_percent,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    notes: row.notes,
    recommendationReason: row.recommendation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Reads the whole catalogue with its skill and role mappings. */
export async function listCourses(): Promise<LearningCourse[]> {
  const supabase = getSupabaseServer();
  const [coursesResult, skillsResult, rolesResult] = await Promise.all([
    supabase.from('courses').select('*').order('title', { ascending: true }),
    supabase.from('course_skills').select('course_id, skill_name, importance'),
    supabase.from('course_roles').select('course_id, role_slug, relevance_score'),
  ]);
  if (coursesResult.error) throw coursesResult.error;
  if (skillsResult.error) throw skillsResult.error;
  if (rolesResult.error) throw rolesResult.error;

  const skillsByCourse = new Map<string, CourseSkill[]>();
  for (const row of (skillsResult.data ?? []) as CourseSkillRow[]) {
    const list = skillsByCourse.get(row.course_id) ?? [];
    list.push({ name: row.skill_name, importance: row.importance });
    skillsByCourse.set(row.course_id, list);
  }

  const rolesByCourse = new Map<string, CourseRole[]>();
  for (const row of (rolesResult.data ?? []) as CourseRoleRow[]) {
    const list = rolesByCourse.get(row.course_id) ?? [];
    list.push({ roleSlug: row.role_slug, relevanceScore: row.relevance_score });
    rolesByCourse.set(row.course_id, list);
  }

  return ((coursesResult.data ?? []) as CourseRow[]).map((row) =>
    toCourse(row, skillsByCourse.get(row.id) ?? [], rolesByCourse.get(row.id) ?? [])
  );
}

export async function getCourse(courseId: string): Promise<LearningCourse | null> {
  const courses = await listCourses();
  return courses.find((course) => course.id === courseId) ?? null;
}

export async function listLearningItems(profileId: string): Promise<LearningItem[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_learning_items')
    .select(
      'id, course_id, status, progress_percent, started_at, completed_at, dismissed_at, notes, recommendation_reason, created_at, updated_at'
    )
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as LearningItemRow[]).map(toItem);
}

export async function getLearningItem(
  profileId: string,
  courseId: string
): Promise<LearningItem | null> {
  const { data, error } = await getSupabaseServer()
    .from('user_learning_items')
    .select(
      'id, course_id, status, progress_percent, started_at, completed_at, dismissed_at, notes, recommendation_reason, created_at, updated_at'
    )
    .eq('profile_id', profileId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data ? toItem(data as LearningItemRow) : null;
}

export interface UpsertLearningItemInput {
  courseId: string;
  status: LearningStatus;
  progressPercent?: number;
  notes?: string | null;
  recommendationReason?: string | null;
}

/**
 * Creates or updates one learning item. Status and progress are normalised in
 * one place so the API and the tests share the same semantics:
 *   completed => 100% and completed_at
 *   in_progress => at least 1% and started_at
 *   dismissed/saved => completed_at cleared
 * Completion never writes to user_skills; skill mastery stays an explicit,
 * separate action.
 */
export async function upsertLearningItem(
  profileId: string,
  input: UpsertLearningItemInput
): Promise<LearningItem> {
  const existing = await getLearningItem(profileId, input.courseId);
  const now = new Date().toISOString();
  const status = input.status;

  let progress =
    input.progressPercent === undefined
      ? existing?.progressPercent ?? 0
      : Math.round(input.progressPercent);
  if (status === 'completed') progress = 100;
  if (status === 'in_progress') progress = Math.max(1, progress);
  if (status === 'saved' && !existing) progress = 0;
  progress = Math.max(0, Math.min(100, progress));

  const startedAt =
    status === 'in_progress' || status === 'completed'
      ? existing?.startedAt ?? now
      : existing?.startedAt ?? null;
  const completedAt = status === 'completed' ? existing?.completedAt ?? now : null;
  const dismissedAt = status === 'dismissed' ? now : null;

  const notes =
    input.notes === undefined ? existing?.notes ?? null : input.notes;
  const recommendationReason =
    input.recommendationReason === undefined
      ? existing?.recommendationReason ?? null
      : input.recommendationReason;

  const { data, error } = await getSupabaseServer()
    .from('user_learning_items')
    .upsert(
      {
        profile_id: profileId,
        course_id: input.courseId,
        status,
        progress_percent: progress,
        started_at: startedAt,
        completed_at: completedAt,
        dismissed_at: dismissedAt,
        notes,
        recommendation_reason: recommendationReason,
        updated_at: now,
      },
      { onConflict: 'profile_id,course_id' }
    )
    .select(
      'id, course_id, status, progress_percent, started_at, completed_at, dismissed_at, notes, recommendation_reason, created_at, updated_at'
    )
    .single();
  if (error) throw error;
  return toItem(data as LearningItemRow);
}

export async function updateLearningItem(
  profileId: string,
  courseId: string,
  patch: {
    status?: LearningStatus;
    progressPercent?: number;
    notes?: string | null;
    recommendationReason?: string | null;
  }
): Promise<LearningItem | null> {
  const existing = await getLearningItem(profileId, courseId);
  if (!existing) return null;
  return upsertLearningItem(profileId, {
    courseId,
    status: patch.status ?? existing.status,
    progressPercent:
      patch.progressPercent === undefined ? existing.progressPercent : patch.progressPercent,
    notes: patch.notes === undefined ? existing.notes : patch.notes,
    recommendationReason:
      patch.recommendationReason === undefined
        ? existing.recommendationReason
        : patch.recommendationReason,
  });
}

export async function deleteLearningItem(
  profileId: string,
  courseId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('user_learning_items')
    .delete()
    .eq('profile_id', profileId)
    .eq('course_id', courseId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

export interface UserSkillWithName {
  skillId: string;
  name: string;
  currentLevel: number;
}

/** Loads the user's skills with their catalogue names for gap scoring. */
export async function listUserSkillsWithNames(
  profileId: string
): Promise<UserSkillWithName[]> {
  const supabase = getSupabaseServer();
  const [userSkillsResult, skillsResult] = await Promise.all([
    supabase
      .from('user_skills')
      .select('proficiency, skill_id')
      .eq('user_id', profileId),
    supabase.from('skills').select('id, name'),
  ]);
  if (userSkillsResult.error) throw userSkillsResult.error;
  if (skillsResult.error) throw skillsResult.error;

  const names = new Map<string, string>();
  for (const row of (skillsResult.data ?? []) as SkillRow[]) {
    names.set(row.id, row.name);
  }

  return ((userSkillsResult.data ?? []) as UserSkillNameRow[])
    .map((row) => ({
      skillId: row.skill_id,
      name: names.get(row.skill_id) ?? '',
      currentLevel: row.proficiency ?? 0,
    }))
    .filter((row) => row.name.length > 0);
}
