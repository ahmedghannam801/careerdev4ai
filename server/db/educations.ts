// Server persistence for public.educations.
//
// The counterpart of server/db/experiences.ts. The table used to be written
// only by the aggregate /api/state endpoint, which replaced every row on each
// save; it now has its own module and its own routes.
//
// Verified remote schema (public.educations):
//   id, user_id (FK profiles.id), institution, degree, field_of_study,
//   start_date, end_date, is_current, description, created_at, updated_at
//
// Ownership: user_id = auth.users.id; the id is always the verified Supabase
// user id, never a client-supplied value.
//
// The frontend's UserEducationEntry shape keeps a few extra fields that have
// no column (gpa, coursework). They are folded into the text `description`
// column on write and are not returned separately — the same lossy flattening
// the aggregate endpoint produced, so the frontend contract is unchanged.
import { getSupabaseServer } from './supabase';
import { normalizeDateRange, normalizeDateValue } from './dates';

export interface EducationDTO {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CreateEducationInput {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  gpa?: string;
  coursework?: string[];
}

export type UpdateEducationInput = Partial<CreateEducationInput>;

interface EducationRow {
  id: string;
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
}

const EDUCATION_COLUMNS =
  'id, institution, degree, field_of_study, start_date, end_date, is_current, description';

function toEducation(row: EducationRow): EducationDTO {
  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    field: row.field_of_study,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    description: row.description,
  };
}

/**
 * Joins the frontend's free-text extras into the single `description` column.
 * The same format the aggregate endpoint produced, so existing rows keep
 * reading exactly as before.
 */
function educationDescription(
  description: string | undefined,
  gpa: string | undefined,
  coursework: string[] | undefined
): string | null {
  const parts: string[] = [];
  const text = (description ?? '').trim();
  if (text) parts.push(text);
  const gpaText = (gpa ?? '').trim();
  if (gpaText) parts.push(`GPA: ${gpaText}`);
  if (Array.isArray(coursework) && coursework.length > 0) {
    parts.push(coursework.filter((c) => typeof c === 'string' && c.trim()).join('\n'));
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

export async function listEducations(userId: string): Promise<EducationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('educations')
    .select(EDUCATION_COLUMNS)
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as EducationRow[]).map(toEducation);
}

export async function getEducation(
  userId: string,
  educationId: string
): Promise<EducationDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('educations')
    .select(EDUCATION_COLUMNS)
    .eq('user_id', userId)
    .eq('id', educationId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEducation(data as EducationRow) : null;
}

export async function createEducation(
  userId: string,
  input: CreateEducationInput
): Promise<EducationDTO> {
  const dates = normalizeDateRange(input.startDate, input.endDate, input.isCurrent);
  const { data, error } = await getSupabaseServer()
    .from('educations')
    .insert({
      user_id: userId,
      institution: input.institution,
      degree: input.degree ?? null,
      field_of_study: input.field ?? null,
      start_date: dates.startDate,
      end_date: dates.endDate,
      is_current: dates.isCurrent,
      description: educationDescription(input.description, input.gpa, input.coursework),
    })
    .select(EDUCATION_COLUMNS)
    .single();
  if (error) throw error;
  return toEducation(data as EducationRow);
}

export async function updateEducation(
  userId: string,
  educationId: string,
  updates: UpdateEducationInput
): Promise<EducationDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.institution !== undefined) patch.institution = updates.institution;
  if (updates.degree !== undefined) patch.degree = updates.degree;
  if (updates.field !== undefined) patch.field_of_study = updates.field;
  if (updates.startDate !== undefined) {
    patch.start_date = normalizeDateValue(updates.startDate).date;
  }
  if (updates.endDate !== undefined || updates.isCurrent !== undefined) {
    const end = normalizeDateValue(updates.endDate);
    const current = updates.isCurrent ?? end.isCurrent;
    patch.is_current = current || end.isCurrent;
    patch.end_date = current || end.isCurrent ? null : end.date;
  }
  if (
    updates.description !== undefined ||
    updates.gpa !== undefined ||
    updates.coursework !== undefined
  ) {
    patch.description = educationDescription(updates.description, updates.gpa, updates.coursework);
  }

  const { data, error } = await getSupabaseServer()
    .from('educations')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', educationId)
    .select(EDUCATION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toEducation(data as EducationRow) : null;
}

export async function deleteEducation(userId: string, educationId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('educations')
    .delete()
    .eq('user_id', userId)
    .eq('id', educationId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
