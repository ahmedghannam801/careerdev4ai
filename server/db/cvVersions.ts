// Server persistence for public.cv_versions — immutable CV snapshots.
//
// Each version holds the parsed CV (profile_json) and the ATS analysis
// (ats_analysis) produced by the AI pipeline.
//
// Ownership: derived from the owning CV (cv_id -> cvs.profile_id).
import { getSupabaseServer } from './supabase';
import { getCv } from './cvs';

export interface CvVersionDTO {
  id: string;
  cvId: string;
  versionNumber: number;
  name: string;
  targetRoleTitle: string | null;
  /** The parsed CV document (structured JSON, mirrors the CVProfile shape). */
  profileJson: unknown;
  /** The ATS evaluation produced by the AI pipeline, or null. */
  atsAnalysis: unknown;
  createdAt: string;
}

export interface CreateCvVersionInput {
  cvId: string;
  name: string;
  targetRoleTitle?: string;
  profileJson: unknown;
  atsAnalysis?: unknown;
}

export type UpdateCvVersionInput = Partial<
  Pick<CreateCvVersionInput, 'name' | 'targetRoleTitle' | 'profileJson' | 'atsAnalysis'>
>;

interface CvVersionRow {
  id: string;
  cv_id: string;
  version_number: number;
  name: string;
  target_role_title: string | null;
  profile_json: unknown;
  ats_analysis: unknown;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, cv_id, version_number, name, target_role_title, profile_json, ats_analysis, created_at';

function toDTO(row: CvVersionRow): CvVersionDTO {
  return {
    id: row.id,
    cvId: row.cv_id,
    versionNumber: row.version_number,
    name: row.name,
    targetRoleTitle: row.target_role_title,
    profileJson: row.profile_json,
    atsAnalysis: row.ats_analysis,
    createdAt: row.created_at,
  };
}

/** Lists the versions of every CV owned by the profile. */
export async function listCvVersions(profileId: string): Promise<CvVersionDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('cv_versions')
    .select(
      'id, cv_id, version_number, name, target_role_title, profile_json, ats_analysis, created_at, cvs!inner(profile_id)'
    )
    .eq('cvs.profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CvVersionRow[]).map(toDTO);
}

export async function getCvVersion(
  profileId: string,
  versionId: string
): Promise<CvVersionDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('cv_versions')
    .select(
      'id, cv_id, version_number, name, target_role_title, profile_json, ats_analysis, created_at, cvs!inner(profile_id)'
    )
    .eq('cvs.profile_id', profileId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CvVersionRow) : null;
}

/**
 * Creates the next version number for the given CV.
 *
 * The CV must belong to the profile: ownership is established before anything
 * is written, so a caller can never attach a version to another user's CV.
 * Returns null when the CV is not owned by the profile.
 */
export async function createCvVersion(
  profileId: string,
  input: CreateCvVersionInput
): Promise<CvVersionDTO | null> {
  const owned = await getCv(profileId, input.cvId);
  if (!owned) return null;

  const { data: existing, error: countError } = await getSupabaseServer()
    .from('cv_versions')
    .select('version_number')
    .eq('cv_id', input.cvId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (countError) throw countError;

  const nextNumber = ((existing?.[0]?.version_number as number | undefined) ?? 0) + 1;

  const { data, error } = await getSupabaseServer()
    .from('cv_versions')
    .insert({
      cv_id: input.cvId,
      version_number: nextNumber,
      name: input.name,
      target_role_title: input.targetRoleTitle ?? null,
      profile_json: input.profileJson ?? null,
      ats_analysis: input.atsAnalysis ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as CvVersionRow);
}

export async function updateCvVersion(
  profileId: string,
  versionId: string,
  updates: UpdateCvVersionInput
): Promise<CvVersionDTO | null> {
  // PostgREST does not support filtering an UPDATE by an embedded resource,
  // so ownership is established with the same joined read used by getCvVersion
  // before the row is touched.
  const owned = await getCvVersion(profileId, versionId);
  if (!owned) return null;

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.targetRoleTitle !== undefined) patch.target_role_title = updates.targetRoleTitle ?? null;
  if (updates.profileJson !== undefined) patch.profile_json = updates.profileJson ?? null;
  if (updates.atsAnalysis !== undefined) patch.ats_analysis = updates.atsAnalysis ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('cv_versions')
    .update(patch)
    .eq('id', versionId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as CvVersionRow) : null;
}

export async function deleteCvVersion(
  profileId: string,
  versionId: string
): Promise<boolean> {
  // Verify ownership through the owning CV before deleting; a DELETE cannot be
  // filtered by the embedded cvs.profile_id column.
  const owned = await getCvVersion(profileId, versionId);
  if (!owned) return false;

  const { data, error } = await getSupabaseServer()
    .from('cv_versions')
    .delete()
    .eq('id', versionId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
