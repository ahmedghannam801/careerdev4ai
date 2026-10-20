// Server persistence for public.activities — append-only user activity feed.
//
// Ownership: profile_id = auth.users.id (profiles.id). The profileId passed in
// is always the id verified from the caller's Supabase JWT (see requireAuth);
// it is never taken from a request body, query or route param.
import { getSupabaseServer } from './supabase';

export type ActivityActionType =
  | 'completed_task'
  | 'added_project'
  | 'uploaded_cv'
  | 'applied_job'
  | 'mock_interview'
  | 'acquired_skill'
  | 'added_evidence'
  | 'saved_job'
  | 'goal_updated'
  | 'document_saved';

export const ACTIVITY_ACTION_TYPES: ActivityActionType[] = [
  'completed_task',
  'added_project',
  'uploaded_cv',
  'applied_job',
  'mock_interview',
  'acquired_skill',
  'added_evidence',
  'saved_job',
  'goal_updated',
  'document_saved',
];

export interface ActivityDTO {
  id: string;
  actionType: ActivityActionType;
  title: string;
  subtitle: string | null;
  relatedObject: string | null;
  linkView: string | null;
  /** Real timestamp — the UI formats this for display. */
  createdAt: string;
}

export interface CreateActivityInput {
  actionType: ActivityActionType;
  title: string;
  subtitle?: string;
  relatedObject?: string;
  linkView?: string;
}

interface ActivityRow {
  id: string;
  action_type: string;
  title: string;
  subtitle: string | null;
  related_object: string | null;
  link_view: string | null;
  created_at: string;
}

function toDTO(row: ActivityRow): ActivityDTO {
  return {
    id: row.id,
    actionType: row.action_type as ActivityActionType,
    title: row.title,
    subtitle: row.subtitle,
    relatedObject: row.related_object,
    linkView: row.link_view,
    createdAt: row.created_at,
  };
}

export async function listActivities(
  profileId: string,
  options: { limit?: number; actionType?: ActivityActionType } = {}
): Promise<ActivityDTO[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  let query = getSupabaseServer()
    .from('activities')
    .select('id, action_type, title, subtitle, related_object, link_view, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.actionType) {
    query = query.eq('action_type', options.actionType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ActivityRow[]).map(toDTO);
}

export async function createActivity(
  profileId: string,
  input: CreateActivityInput
): Promise<ActivityDTO> {
  const { data, error } = await getSupabaseServer()
    .from('activities')
    .insert({
      profile_id: profileId,
      action_type: input.actionType,
      title: input.title,
      subtitle: input.subtitle ?? null,
      related_object: input.relatedObject ?? null,
      link_view: input.linkView ?? null,
    })
    .select('id, action_type, title, subtitle, related_object, link_view, created_at')
    .single();
  if (error) throw error;
  return toDTO(data as ActivityRow);
}
