// Server persistence for public.notifications.
//
// The notifications drawer used to render two hard-coded entries that lived
// only in React state, so the read/unread state was lost on every reload and
// real users were shown fabricated content. The table is the source of truth.
//
// Verified remote schema (public.notifications):
//   id, profile_id (FK profiles.id), title, message, type, read_at, link_view,
//   created_at
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export const NOTIFICATION_TYPES = [
  'interview',
  'roadmap',
  'application',
  'achievement',
  'system',
  'announcement',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDTO {
  id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  read: boolean;
  linkView: string | null;
  /** Set when this notification was delivered by an announcement. */
  announcementId: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  title: string;
  message?: string;
  type?: NotificationType;
  linkView?: string;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string | null;
  type: string;
  read_at: string | null;
  link_view: string | null;
  announcement_id: string | null;
  created_at: string;
}

const COLUMNS = 'id, title, message, type, read_at, link_view, announcement_id, created_at';

function toNotification(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: (row.type as NotificationType) ?? 'system',
    // The frontend's model is a boolean; the database stores the moment it
    // was read (NULL = still unread), which carries more information.
    read: row.read_at !== null,
    linkView: row.link_view,
    announcementId: row.announcement_id,
    createdAt: row.created_at,
  };
}

export async function listNotifications(profileId: string): Promise<NotificationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .select(COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(toNotification);
}

export async function createNotification(
  profileId: string,
  input: CreateNotificationInput
): Promise<NotificationDTO> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .insert({
      profile_id: profileId,
      title: input.title,
      message: input.message ?? null,
      type: input.type ?? 'system',
      link_view: input.linkView ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toNotification(data as NotificationRow);
}

/** Marks a notification as read. Returns false when it is not the caller's. */
export async function markNotificationRead(
  profileId: string,
  notificationId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('id', notificationId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Marks every unread notification of the caller as read. */
export async function markAllNotificationsRead(profileId: string): Promise<number> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

/** Deletes a notification owned by the caller. */
export async function deleteNotification(
  profileId: string,
  notificationId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', notificationId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Deletes every notification owned by the caller (the "Clear" action). */
export async function clearNotifications(profileId: string): Promise<number> {
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .delete()
    .eq('profile_id', profileId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}
