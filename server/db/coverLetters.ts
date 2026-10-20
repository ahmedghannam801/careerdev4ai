// Server persistence for public.cover_letters — the canonical source for
// cover letters. There is deliberately NO separate documents table: the
// CareerDocument view-model is derived from cover_letters, cvs/cv_versions,
// profile_certifications and projects.
//
// Shape mirrors the current CoverLetter type exactly.
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export interface CoverLetterDTO {
  id: string;
  title: string;
  company: string;
  role: string;
  jobDescription: string | null;
  content: string;
  keyHighlights: string[];
  /** Static job catalogue reference (source code, not a table). */
  targetJobId: string | null;
  /** FK -> public.job_applications(id), ON DELETE SET NULL. */
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCoverLetterInput {
  title: string;
  company: string;
  role: string;
  jobDescription?: string;
  content: string;
  keyHighlights?: string[];
  targetJobId?: string;
  applicationId?: string;
}

export type UpdateCoverLetterInput = Partial<CreateCoverLetterInput>;

interface CoverLetterRow {
  id: string;
  title: string;
  company: string;
  role: string;
  job_description: string | null;
  content: string;
  key_highlights: unknown;
  target_job_id: string | null;
  application_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, title, company, role, job_description, content, key_highlights, target_job_id, application_id, created_at, updated_at';

function toHighlights(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toDTO(row: CoverLetterRow): CoverLetterDTO {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    content: row.content,
    keyHighlights: toHighlights(row.key_highlights),
    targetJobId: row.target_job_id,
    applicationId: row.application_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCoverLetters(profileId: string): Promise<CoverLetterDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('cover_letters')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CoverLetterRow[]).map(toDTO);
}

export async function getCoverLetter(
  profileId: string,
  coverLetterId: string
): Promise<CoverLetterDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('cover_letters')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', coverLetterId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CoverLetterRow) : null;
}

export async function createCoverLetter(
  profileId: string,
  input: CreateCoverLetterInput
): Promise<CoverLetterDTO> {
  const { data, error } = await getSupabaseServer()
    .from('cover_letters')
    .insert({
      profile_id: profileId,
      title: input.title,
      company: input.company,
      role: input.role,
      job_description: input.jobDescription ?? null,
      content: input.content,
      key_highlights: input.keyHighlights ?? [],
      target_job_id: input.targetJobId ?? null,
      application_id: input.applicationId ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as CoverLetterRow);
}

export async function updateCoverLetter(
  profileId: string,
  coverLetterId: string,
  updates: UpdateCoverLetterInput
): Promise<CoverLetterDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.company !== undefined) patch.company = updates.company;
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.jobDescription !== undefined) patch.job_description = updates.jobDescription ?? null;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.keyHighlights !== undefined) patch.key_highlights = updates.keyHighlights;
  if (updates.targetJobId !== undefined) patch.target_job_id = updates.targetJobId ?? null;
  if (updates.applicationId !== undefined) patch.application_id = updates.applicationId ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('cover_letters')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', coverLetterId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CoverLetterRow) : null;
}

export async function deleteCoverLetter(
  profileId: string,
  coverLetterId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('cover_letters')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', coverLetterId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
