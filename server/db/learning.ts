// Server persistence for the B.5 Learning Hub.
//
// Catalogue reads are global. User state writes always use the verified
// auth user id as profile_id; no client-supplied owner is accepted anywhere in
// this module.
import { getSupabaseServer } from './supabase';
import { deriveResourceType, officialThumbnail, isLearningResourceType, type LearningResourceType } from '../../shared/learningResources.ts';
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
  provider_tier: number | null;
  rating: number | string | null;
  rating_count: number | null;
  thumbnail_url: string | null;
  resource_type: string | null;
  has_certificate: boolean | null;
  certificate_included: boolean | null;
  is_featured: boolean | null;
  popularity: number | null;
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
  const resourceType: LearningResourceType =
    row.resource_type && isLearningResourceType(row.resource_type)
      ? row.resource_type
      : deriveResourceType({
          format: row.format,
          provider: row.provider,
          url: row.url,
          title: row.title,
        });

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
    providerTier:
      row.provider_tier === 1 || row.provider_tier === 2 || row.provider_tier === 3
        ? row.provider_tier
        : undefined,
    rating:
      row.rating === null || row.rating === undefined ? null : Number(row.rating),
    ratingCount: row.rating_count ?? null,
    thumbnailUrl: officialThumbnail(row.url, row.thumbnail_url),
    resourceType,
    hasCertificate: Boolean(row.has_certificate),
    certificateIncluded: Boolean(row.certificate_included),
    isFeatured: Boolean(row.is_featured),
    popularity: row.popularity ?? row.rating_count ?? 0,
    createdAt: row.created_at,
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

/**
 * Reads every row of a catalogue table.
 *
 * PostgREST caps a single response at 1000 rows, so an unpaginated read
 * silently truncates the mapping tables once the catalogue grows past that
 * limit: the API would then serve courses with missing skills and roles.
 */
async function readAllRows<T>(table: string, columns: string): Promise<T[]> {
  const supabase = getSupabaseServer();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Reads the whole catalogue with its skill and role mappings. */
export async function listCourses(): Promise<LearningCourse[]> {
  const supabase = getSupabaseServer();
  const [coursesResult, skillRows, roleRows] = await Promise.all([
    supabase.from('courses').select('*').order('title', { ascending: true }),
    readAllRows<CourseSkillRow>('course_skills', 'course_id, skill_name, importance'),
    readAllRows<CourseRoleRow>('course_roles', 'course_id, role_slug, relevance_score'),
  ]);
  if (coursesResult.error) throw coursesResult.error;

  const skillsByCourse = new Map<string, CourseSkill[]>();
  for (const row of skillRows) {
    const list = skillsByCourse.get(row.course_id) ?? [];
    list.push({ name: row.skill_name, importance: row.importance });
    skillsByCourse.set(row.course_id, list);
  }

  const rolesByCourse = new Map<string, CourseRole[]>();
  for (const row of roleRows) {
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

/** The full catalogue for a Content Admin, including unpublished fields. */
export async function listCoursesForAdmin(): Promise<LearningCourse[]> {
  return listCourses();
}

export interface AdminCoursePatch {
  resourceType?: LearningResourceType | null;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
  description?: string | null;
  hasCertificate?: boolean;
  certificateIncluded?: boolean;
}

/**
 * Updates the curation fields a Content Admin owns. The core catalogue facts
 * (title, provider, URL, skills) are not editable here: those came from a
 * verified source and editing them by hand would damage provenance.
 */
export async function updateCourseForAdmin(
  courseId: string,
  patch: AdminCoursePatch
): Promise<LearningCourse | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.resourceType !== undefined) {
    if (patch.resourceType !== null && !isLearningResourceType(patch.resourceType)) {
      throw new Error('Unknown resource type');
    }
    update.resource_type = patch.resourceType;
  }
  if (patch.isFeatured !== undefined) update.is_featured = patch.isFeatured;
  if (patch.thumbnailUrl !== undefined) update.thumbnail_url = patch.thumbnailUrl;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.hasCertificate !== undefined) update.has_certificate = patch.hasCertificate;
  if (patch.certificateIncluded !== undefined) {
    update.certificate_included = patch.certificateIncluded;
  }

  const { data, error } = await getSupabaseServer()
    .from('courses')
    .update(update)
    .eq('id', courseId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getCourse(courseId);
}
