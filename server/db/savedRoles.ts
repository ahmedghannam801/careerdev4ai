// Server persistence for public.saved_roles.
//
// A saved role is a bookmarked career role (the TargetRole catalogue entry).
// The catalogue itself stays in source code; payload_json keeps a copy of the
// role so the saved entry survives catalogue changes.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export interface SavedRoleDTO {
  id: string;
  roleId: string;
  title: string;
  category: string | null;
  level: string | null;
  /** The saved catalogue payload (TargetRole shape). */
  payload: unknown;
  savedAt: string;
}

export interface CreateSavedRoleInput {
  roleId: string;
  title: string;
  category?: string;
  level?: string;
  payload?: unknown;
}

interface SavedRoleRow {
  id: string;
  role_id: string;
  title: string;
  category: string | null;
  level: string | null;
  payload_json: unknown;
  saved_at: string;
}

const SELECT_COLUMNS = 'id, role_id, title, category, level, payload_json, saved_at';

function toDTO(row: SavedRoleRow): SavedRoleDTO {
  return {
    id: row.id,
    roleId: row.role_id,
    title: row.title,
    category: row.category,
    level: row.level,
    payload: row.payload_json,
    savedAt: row.saved_at,
  };
}

export async function listSavedRoles(profileId: string): Promise<SavedRoleDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('saved_roles')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SavedRoleRow[]).map(toDTO);
}

export async function createSavedRole(
  profileId: string,
  input: CreateSavedRoleInput
): Promise<SavedRoleDTO> {
  const { data, error } = await getSupabaseServer()
    .from('saved_roles')
    .upsert(
      {
        profile_id: profileId,
        role_id: input.roleId,
        title: input.title,
        category: input.category ?? null,
        level: input.level ?? null,
        payload_json: input.payload ?? null,
      },
      { onConflict: 'profile_id,role_id' }
    )
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as SavedRoleRow);
}

export async function deleteSavedRole(
  profileId: string,
  roleId: string
): Promise<boolean> {
  // The client identifies a saved role by its catalogue role id.
  const { data, error } = await getSupabaseServer()
    .from('saved_roles')
    .delete()
    .eq('profile_id', profileId)
    .eq('role_id', roleId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
