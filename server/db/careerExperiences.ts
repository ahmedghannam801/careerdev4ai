// Server persistence for the Career Experience Hub.
//
// Catalogue reads are global. Every user write uses the verified auth user id
// as profile_id; no client-supplied owner is accepted anywhere in this module.
import { getSupabaseServer } from './supabase.ts';
import type {
  CareerExperience,
  CareerExperienceRole,
  CareerExperienceSkill,
  ExperienceCertificate,
  ExperienceProgress,
  ExperienceProgressStatus,
} from '../../shared/careerExperience.ts';
import { normalizeCertificateUrl } from '../../shared/careerExperience.ts';

interface ExperienceRow {
  id: string;
  title: string;
  provider: string;
  provider_url: string | null;
  description: string;
  category: string;
  difficulty: CareerExperience['difficulty'];
  duration_hours: number | string | null;
  duration_label: string | null;
  url: string;
  domain_ids: string[] | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface SkillRow {
  experience_id: string;
  skill_name: string;
  importance: number;
}

interface RoleRow {
  experience_id: string;
  role_slug: string;
  relevance_score: number;
}

interface ProgressRow {
  id: string;
  experience_id: string;
  status: ExperienceProgressStatus;
  saved: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CertificateRow {
  id: string;
  experience_id: string;
  certificate_url: string;
  verification_status: ExperienceCertificate['status'];
  submitted_at: string;
  verified_at: string | null;
  updated_at: string;
}

function toExperience(
  row: ExperienceRow,
  skills: CareerExperienceSkill[],
  roles: CareerExperienceRole[]
): CareerExperience {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    providerUrl: row.provider_url,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    durationHours: row.duration_hours === null ? null : Number(row.duration_hours),
    durationLabel: row.duration_label,
    url: row.url,
    domainIds: (row.domain_ids ?? []) as CareerExperience['domainIds'],
    skills,
    roles,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgress(row: ProgressRow): ExperienceProgress {
  return {
    experienceId: row.experience_id,
    status: row.status,
    saved: row.saved,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCertificate(row: CertificateRow): ExperienceCertificate {
  return {
    id: row.id,
    experienceId: row.experience_id,
    certificateUrl: row.certificate_url,
    status: row.verification_status,
    submittedAt: row.submitted_at,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads every row of a table.
 *
 * PostgREST caps a response at 1000 rows. The mapping tables are small today,
 * but an unpaginated read would silently truncate them once the catalogue
 * grows past that limit.
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

/** Reads the catalogue, active rows first unless the admin asks for all. */
export async function listCareerExperiences(options: {
  includeInactive?: boolean;
} = {}): Promise<CareerExperience[]> {
  const supabase = getSupabaseServer();
  let query = supabase
    .from('career_experiences')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!options.includeInactive) query = query.eq('is_active', true);

  const [experiencesResult, skillRows, roleRows] = await Promise.all([
    query,
    readAllRows<SkillRow>('career_experience_skills', 'experience_id, skill_name, importance'),
    readAllRows<RoleRow>('career_experience_roles', 'experience_id, role_slug, relevance_score'),
  ]);
  if (experiencesResult.error) throw experiencesResult.error;

  const skillsByExperience = new Map<string, CareerExperienceSkill[]>();
  for (const row of skillRows) {
    const list = skillsByExperience.get(row.experience_id) ?? [];
    list.push({ name: row.skill_name, importance: row.importance });
    skillsByExperience.set(row.experience_id, list);
  }

  const rolesByExperience = new Map<string, CareerExperienceRole[]>();
  for (const row of roleRows) {
    const list = rolesByExperience.get(row.experience_id) ?? [];
    list.push({ roleSlug: row.role_slug, relevanceScore: row.relevance_score });
    rolesByExperience.set(row.experience_id, list);
  }

  return ((experiencesResult.data ?? []) as ExperienceRow[]).map((row) =>
    toExperience(
      row,
      (skillsByExperience.get(row.id) ?? []).sort(
        (a, b) => b.importance - a.importance || a.name.localeCompare(b.name)
      ),
      (rolesByExperience.get(row.id) ?? []).sort(
        (a, b) => b.relevanceScore - a.relevanceScore || a.roleSlug.localeCompare(b.roleSlug)
      )
    )
  );
}

/** One catalogue row, active or not. */
export async function getCareerExperience(
  experienceId: string
): Promise<CareerExperience | null> {
  const experiences = await listCareerExperiences({ includeInactive: true });
  return experiences.find((experience) => experience.id === experienceId) ?? null;
}

/** The candidate's own progress rows. */
export async function listExperienceProgress(
  profileId: string
): Promise<ExperienceProgress[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_experience_progress')
    .select('*')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProgressRow[]).map(toProgress);
}

/**
 * Reads the single row a write function returns.
 *
 * PostgREST answers a function that returns one composite row with that row,
 * and some client versions wrap it in a one-item array. Both shapes describe
 * the same result, so the module reads either.
 */
function singleRow<T>(data: unknown): T | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === 'object' ? (value as T) : null;
}

export interface UpsertProgressInput {
  status: ExperienceProgressStatus;
  saved?: boolean;
}

/**
 * Creates or updates the candidate's progress for one experience.
 *
 * The row and the certificate it supports are written by one database
 * function, so the operation is atomic: either the progress is stored and a
 * completion it no longer supports is cleared, or nothing changes at all.
 *
 * Timestamps describe what happened, not what the caller claims: a start time
 * is written when the row first becomes in-progress, and a completion time
 * when it first becomes completed. Moving back to not-started clears the
 * completion time, because the completion is no longer true.
 */
export async function upsertExperienceProgress(
  profileId: string,
  experienceId: string,
  input: UpsertProgressInput
): Promise<ExperienceProgress> {
  const { data, error } = await getSupabaseServer().rpc('career_experience_progress_set', {
    p_profile_id: profileId,
    p_experience_id: experienceId,
    p_status: input.status,
    p_saved: input.saved ?? null,
  });
  if (error) throw error;

  const row = singleRow<ProgressRow>(data);
  if (!row) throw new Error('The experience progress could not be saved.');
  return toProgress(row);
}

/**
 * Removes the candidate's own progress row.
 *
 * The certificate is evidence of this completion; removing the progress
 * removes the claim with it. Both deletes run in one database function, so a
 * failure cannot leave the certificate behind or remove it while the progress
 * survives.
 */
export async function deleteExperienceProgress(
  profileId: string,
  experienceId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer().rpc('career_experience_progress_delete', {
    p_profile_id: profileId,
    p_experience_id: experienceId,
  });
  if (error) throw error;
  return data === true;
}

/** The candidate's own certificate rows. */
export async function listExperienceCertificates(
  profileId: string
): Promise<ExperienceCertificate[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_experience_certificates')
    .select('*')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CertificateRow[]).map(toCertificate);
}

export class CertificateRequiresCompletionError extends Error {
  constructor() {
    super('Mark the experience completed before adding a certificate.');
    this.name = 'CertificateRequiresCompletionError';
  }
}

/**
 * Submits or edits the candidate's certificate link.
 *
 * The completion check, the reviewed-row guard and the write are one database
 * function, so a concurrent status change cannot leave a certificate on an
 * experience that is no longer completed.
 *
 * The certificate is `self_reported` unless a trusted review changes it. A row
 * that has already been reviewed is returned unchanged: a candidate cannot
 * overwrite a verified credential with a new link.
 */
export async function upsertExperienceCertificate(
  profileId: string,
  experienceId: string,
  certificateUrl: string
): Promise<ExperienceCertificate> {
  const validation = normalizeCertificateUrl(certificateUrl);
  if (!validation.ok || !validation.value) {
    throw new Error(validation.error ?? 'Invalid certificate link.');
  }

  const { data, error } = await getSupabaseServer().rpc(
    'career_experience_certificate_set',
    {
      p_profile_id: profileId,
      p_experience_id: experienceId,
      p_certificate_url: validation.value,
    }
  );
  if (error) {
    if (error.message?.includes('certificate_requires_completion')) {
      throw new CertificateRequiresCompletionError();
    }
    throw error;
  }

  const row = singleRow<CertificateRow>(data);
  if (!row) throw new Error('The certificate could not be saved.');
  return toCertificate(row);
}

/** Removes the candidate's own certificate submission. */
export async function deleteExperienceCertificate(
  profileId: string,
  experienceId: string
): Promise<boolean> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('user_experience_certificates')
    .delete()
    .eq('profile_id', profileId)
    .eq('experience_id', experienceId)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** The admin listing, including inactive rows. */
export async function listExperiencesForAdmin(): Promise<CareerExperience[]> {
  return listCareerExperiences({ includeInactive: true });
}

export interface ExperienceAdminPatch {
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  description?: string;
  /** An admin may correct a title, but never the provider URL. */
  title?: string;
}

/** Applies the fields an administrator is allowed to change. */
export async function updateExperienceForAdmin(
  experienceId: string,
  patch: ExperienceAdminPatch
): Promise<CareerExperience | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.isFeatured !== undefined) update.is_featured = patch.isFeatured;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.title !== undefined) update.title = patch.title;

  const { data, error } = await getSupabaseServer()
    .from('career_experiences')
    .update(update)
    .eq('id', experienceId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getCareerExperience(experienceId);
}
