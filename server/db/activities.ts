// Server persistence for public.activities — append-only user activity feed.
//
// Ownership: profile_id = auth.users.id (profiles.id). The profileId passed in
// is always the id verified from the caller's Supabase JWT (see requireAuth);
// it is never taken from a request body, query or route param.
//
// IDEMPOTENCY
// The feed is "append-only" for a user, not append-only per request. Pressing
// "Save" twice, retrying a failed response, or having the same confirmation
// arrive from two screens used to add the same action twice — and the Recent
// Activity panel then counted it twice. The id is therefore deterministic:
//
//   id = uuid(sha1(profileId | actionType | title | relatedObject | clientKey))
//
// A repeat of the same action targets the same primary key, the insert
// conflicts, and the row that already exists is returned. No migration is
// needed: `activities.id` is already a uuid primary key, so the database
// enforces the rule that the application derives.
import { createHash } from 'node:crypto';
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
  /**
   * An optional caller-supplied key for an action that is repeated on
   * purpose (for example one activity per calendar day). When absent, the key
   * is derived from what the action says, so the same action is never logged
   * twice.
   */
  idempotencyKey?: string;
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

function normalizeActivityPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The seed for the deterministic id.
 *
 * The client key is included only when one was supplied, so two different
 * clients that describe the same action the same way still land on the same
 * row — which is the whole point.
 */
export function activityIdempotencySeed(
  profileId: string,
  input: Pick<
    CreateActivityInput,
    'actionType' | 'title' | 'relatedObject' | 'idempotencyKey'
  >
): string {
  return [
    profileId,
    input.actionType,
    normalizeActivityPart(input.title),
    normalizeActivityPart(input.relatedObject),
    normalizeActivityPart(input.idempotencyKey),
  ].join('|');
}

/**
 * A deterministic UUID (version 5 layout) derived from a string.
 *
 * The layout matters: Postgres stores the id as `uuid`, and a value with the
 * wrong version/variant nibbles is still a uuid but reads as malformed in
 * tooling. The bytes themselves are a SHA-1 digest, which is all the identity
 * needs — this is not a security boundary.
 */
export function deterministicActivityId(seed: string): string {
  const hex = createHash('sha1').update(seed, 'utf8').digest('hex');
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const ACTIVITY_COLUMNS = 'id, action_type, title, subtitle, related_object, link_view, created_at';

export async function listActivities(
  profileId: string,
  options: { limit?: number; actionType?: ActivityActionType } = {}
): Promise<ActivityDTO[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  let query = getSupabaseServer()
    .from('activities')
    .select(ACTIVITY_COLUMNS)
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

/**
 * Records one action, exactly once.
 *
 * A repeat of the same action is not an error: the existing row is returned,
 * so the client can replace its copy by id instead of adding a second one.
 */
export async function createActivity(
  profileId: string,
  input: CreateActivityInput
): Promise<ActivityDTO> {
  const id = deterministicActivityId(activityIdempotencySeed(profileId, input));

  const { data, error } = await getSupabaseServer()
    .from('activities')
    .insert({
      id,
      profile_id: profileId,
      action_type: input.actionType,
      title: input.title,
      subtitle: input.subtitle ?? null,
      related_object: input.relatedObject ?? null,
      link_view: input.linkView ?? null,
    })
    .select(ACTIVITY_COLUMNS)
    .single();

  if (!error) return toDTO(data as ActivityRow);

  // 23505 = unique_violation. The action was already logged; return that row.
  if ((error as { code?: string }).code === '23505') {
    const { data: existing, error: readError } = await getSupabaseServer()
      .from('activities')
      .select(ACTIVITY_COLUMNS)
      // The owner is part of the lookup as well: a deterministic id can only
      // ever return the caller's own row, never another user's.
      .eq('id', id)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return toDTO(existing as ActivityRow);
  }

  throw error;
}
