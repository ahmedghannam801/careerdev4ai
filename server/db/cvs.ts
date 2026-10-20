// Server persistence for public.cvs — the CV entity.
//
// A CV row identifies a CV document; its content lives in public.cv_versions
// (profile_json + ats_analysis). storage_path is optional and stays null
// while no file object is retained.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export interface CvDTO {
  id: string;
  name: string;
  targetRoleTitle: string | null;
  storagePath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCvInput {
  name: string;
  targetRoleTitle?: string;
  storagePath?: string;
}

export type UpdateCvInput = Partial<CreateCvInput> & { isActive?: boolean };

interface CvRow {
  id: string;
  name: string;
  target_role_title: string | null;
  storage_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, name, target_role_title, storage_path, is_active, created_at, updated_at';

function toDTO(row: CvRow): CvDTO {
  return {
    id: row.id,
    name: row.name,
    targetRoleTitle: row.target_role_title,
    storagePath: row.storage_path,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCvs(profileId: string): Promise<CvDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CvRow[]).map(toDTO);
}

export async function getCv(profileId: string, cvId: string): Promise<CvDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', cvId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CvRow) : null;
}

export async function createCv(profileId: string, input: CreateCvInput): Promise<CvDTO> {
  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .insert({
      profile_id: profileId,
      name: input.name,
      target_role_title: input.targetRoleTitle ?? null,
      storage_path: input.storagePath ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as CvRow);
}

export async function updateCv(
  profileId: string,
  cvId: string,
  updates: UpdateCvInput
): Promise<CvDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.targetRoleTitle !== undefined) patch.target_role_title = updates.targetRoleTitle ?? null;
  if (updates.storagePath !== undefined) patch.storage_path = updates.storagePath ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', cvId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CvRow) : null;
}

/**
 * Marks one CV as the active one for the profile.
 * The partial unique index (profile_id) WHERE is_active guarantees a single
 * active CV, so any other active CV is cleared first.
 */
export async function setActiveCv(profileId: string, cvId: string): Promise<CvDTO | null> {
  const { error: clearError } = await getSupabaseServer()
    .from('cvs')
    .update({ is_active: false })
    .eq('profile_id', profileId)
    .eq('is_active', true);
  if (clearError) throw clearError;

  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .update({ is_active: true })
    .eq('profile_id', profileId)
    .eq('id', cvId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CvRow) : null;
}

export async function deleteCv(profileId: string, cvId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('cvs')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', cvId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
