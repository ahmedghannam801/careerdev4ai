// Server persistence for public.job_bookmarks.
//
// The "Saved Jobs" filter and the bookmark toggle lived only in React state,
// so a saved job vanished on every reload and on every device change. The
// feature could not be persisted without a table.
//
// The table stores ONLY the catalogue id (public.job_bookmarks.job_id): the
// job listings themselves are the static catalogue in src/data/jobsData.ts,
// so there is no duplicated job data that could drift from the catalogue.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export interface BookmarkDTO {
  id: string;
  jobId: string;
  createdAt: string;
}

interface BookmarkRow {
  id: string;
  job_id: string;
  created_at: string;
}

const COLUMNS = 'id, job_id, created_at';

function toDTO(row: BookmarkRow): BookmarkDTO {
  return { id: row.id, jobId: row.job_id, createdAt: row.created_at };
}

/** Reads every bookmark owned by the given profile. */
export async function listBookmarks(profileId: string): Promise<BookmarkDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('job_bookmarks')
    .select(COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as BookmarkRow[]).map(toDTO);
}

/**
 * Saves a bookmark.
 *
 * The (profile_id, job_id) unique key makes this idempotent: saving the same
 * job twice updates the existing row instead of creating a duplicate.
 */
export async function createBookmark(
  profileId: string,
  jobId: string
): Promise<BookmarkDTO> {
  const { data, error } = await getSupabaseServer()
    .from('job_bookmarks')
    .upsert(
      { profile_id: profileId, job_id: jobId },
      { onConflict: 'profile_id, job_id' }
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as BookmarkRow);
}

/** Removes a bookmark owned by the given profile. */
export async function deleteBookmark(profileId: string, jobId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('job_bookmarks')
    .delete()
    .eq('profile_id', profileId)
    .eq('job_id', jobId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
