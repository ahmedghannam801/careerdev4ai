// Server persistence for public.experiences and public.educations.
//
// These two tables are the ONLY entities that previously had no dedicated
// backend module: they were written only by the aggregate /api/state endpoint,
// which replaced every row on each save. They now have their own module and
// their own routes, so the aggregate path can no longer destroy them.
//
// Verified remote schema (public.experiences):
//   id, user_id (FK profiles.id), company, job_title, employment_type,
//   start_date, end_date, is_current, location, description, created_at, updated_at
//
// Verified remote schema (public.educations):
//   id, user_id (FK profiles.id), institution, degree, field_of_study,
//   start_date, end_date, is_current, description, created_at, updated_at
//
// Ownership: user_id = auth.users.id; the id is always the verified Supabase
// user id, never a client-supplied value.
//
// The frontend's UserExperienceEntry shape keeps a few
// extra fields that have no column (achievements, skillsUsed, gpa, coursework).
// They are folded into the text `description` column on write and are not
// returned separately — the same lossy flattening the aggregate endpoint
// produced, kept here so the existing frontend contract is unchanged.
import { getSupabaseServer } from './supabase';
import {
  DateValidationError,
  normalizeDateRange,
  normalizeDateValue,
  validateDateRange,
} from './dates';

export interface ExperienceDTO {
  id: string;
  role: string;
  company: string;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CreateExperienceInput {
  role: string;
  company: string;
  employmentType?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
}

export type UpdateExperienceInput = Partial<CreateExperienceInput>;

interface ExperienceRow {
  id: string;
  company: string;
  job_title: string | null;
  employment_type: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
}

const EXPERIENCE_COLUMNS =
  'id, company, job_title, employment_type, location, start_date, end_date, is_current, description';

function toExperience(row: ExperienceRow): ExperienceDTO {
  return {
    id: row.id,
    role: row.job_title ?? '',
    company: row.company,
    employmentType: row.employment_type,
    location: row.location,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    description: row.description,
  };
}

/**
 * Joins the frontend's free-text extras into the single `description` column.
 * The achievements array is newline-joined; the same format the aggregate
 * endpoint produced, so existing rows keep reading exactly as before.
 */
function experienceDescription(
  description: string | undefined,
  achievements: string[] | undefined
): string | null {
  const parts: string[] = [];
  const text = (description ?? '').trim();
  if (text) parts.push(text);
  if (Array.isArray(achievements) && achievements.length > 0) {
    parts.push(achievements.filter((a) => typeof a === 'string' && a.trim()).join('\n'));
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

// ---- experiences ----

export async function listExperiences(userId: string): Promise<ExperienceDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('experiences')
    .select(EXPERIENCE_COLUMNS)
    .eq('user_id', userId)
    // The candidate's order comes first. The start date is only the
    // tiebreak, so rows that have never been reordered keep the order they
    // always had.
    .order('sort_order', { ascending: true })
    .order('start_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ExperienceRow[]).map(toExperience);
}

export async function getExperience(
  userId: string,
  experienceId: string
): Promise<ExperienceDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('experiences')
    .select(EXPERIENCE_COLUMNS)
    .eq('user_id', userId)
    .eq('id', experienceId)
    .maybeSingle();
  if (error) throw error;
  return data ? toExperience(data as ExperienceRow) : null;
}

export async function createExperience(
  userId: string,
  input: CreateExperienceInput
): Promise<ExperienceDTO> {
  const dates = normalizeDateRange(input.startDate, input.endDate, input.isCurrent);
  // A role that ended before it started is a contradiction. A role that ran
  // from 2019 to 2021 is not.
  const problem = validateDateRange(dates.startDate, dates.endDate, dates.isCurrent);
  if (problem) throw new DateValidationError(problem);
  const { data, error } = await getSupabaseServer()
    .from('experiences')
    .insert({
      user_id: userId,
      company: input.company,
      job_title: input.role,
      employment_type: input.employmentType ?? null,
      location: input.location ?? null,
      start_date: dates.startDate,
      end_date: dates.endDate,
      is_current: dates.isCurrent,
      description: experienceDescription(input.description, input.achievements),
    })
    .select(EXPERIENCE_COLUMNS)
    .single();
  if (error) throw error;
  return toExperience(data as ExperienceRow);
}

export async function updateExperience(
  userId: string,
  experienceId: string,
  updates: UpdateExperienceInput
): Promise<ExperienceDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.role !== undefined) patch.job_title = updates.role;
  if (updates.company !== undefined) patch.company = updates.company;
  if (updates.employmentType !== undefined) patch.employment_type = updates.employmentType;
  if (updates.location !== undefined) patch.location = updates.location;
  if (updates.startDate !== undefined) {
    patch.start_date = normalizeDateValue(updates.startDate).date;
  }
  if (updates.endDate !== undefined || updates.isCurrent !== undefined) {
    const end = normalizeDateValue(updates.endDate);
    const current = updates.isCurrent ?? end.isCurrent;
    patch.is_current = current || end.isCurrent;
    patch.end_date = current || end.isCurrent ? null : end.date;
  }
  if (updates.description !== undefined || updates.achievements !== undefined) {
    patch.description = experienceDescription(updates.description, updates.achievements);
  }

  // The chronology is checked against the record as it will be after the
  // change, not against the patch alone: moving only the start date can make
  // a record contradictory.
  if (updates.startDate !== undefined || updates.endDate !== undefined || updates.isCurrent !== undefined) {
    const { data: current, error: readError } = await getSupabaseServer()
      .from('experiences')
      .select('start_date, end_date, is_current')
      .eq('user_id', userId)
      .eq('id', experienceId)
      .maybeSingle();
    if (readError) throw readError;
    if (current) {
      const row = current as { start_date: string | null; end_date: string | null; is_current: boolean };
      const startDate = patch.start_date !== undefined ? patch.start_date : row.start_date;
      const endDate = patch.end_date !== undefined ? patch.end_date : row.end_date;
      const isCurrent = patch.is_current !== undefined ? patch.is_current : row.is_current;
      const problem = validateDateRange(startDate, endDate, isCurrent);
      if (problem) throw new DateValidationError(problem);
    }
  }

  const { data, error } = await getSupabaseServer()
    .from('experiences')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', experienceId)
    .select(EXPERIENCE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toExperience(data as ExperienceRow) : null;
}

export async function deleteExperience(userId: string, experienceId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('experiences')
    .delete()
    .eq('user_id', userId)
    .eq('id', experienceId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
