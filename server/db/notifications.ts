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
  'subscription',
  'payment',
  'payment_success',
  'payment_failed',
  'subscription_expired',
  'credits',
  'referral',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDTO {
  id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  read: boolean;
  clicked: boolean;
  linkView: string | null;
  /** Set when this notification was delivered by an announcement. */
  announcementId: string | null;
  /** Announcement priority, so the bell can distinguish a critical notice. */
  priority: 'normal' | 'important' | 'critical' | null;
  /**
   * The translation key of the title, when the notification has one. The
   * drawer renders this instead of the literal title, so the notification is
   * shown in the reader's own language.
   */
  titleKey: string | null;
  /** The values the translated title and message need. */
  params: Record<string, unknown>;
  createdAt: string;
}

export interface CreateNotificationInput {
  title: string;
  message?: string;
  type?: NotificationType;
  linkView?: string;
  /** The translation key of the title, so the drawer can localise it. */
  titleKey?: string;
  /** The values the translated title and message need. */
  params?: Record<string, unknown>;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string | null;
  type: string;
  read_at: string | null;
  clicked_at: string | null;
  link_view: string | null;
  announcement_id: string | null;
  title_key: string | null;
  params: Record<string, unknown> | null;
  created_at: string;
}

const COLUMNS =
  'id, title, message, type, read_at, clicked_at, link_view, announcement_id, title_key, params, created_at';

function toNotification(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: (row.type as NotificationType) ?? 'system',
    // The frontend's model is a boolean; the database stores the moment it
    // was read (NULL = still unread), which carries more information.
    read: row.read_at !== null,
    clicked: row.clicked_at !== null,
    linkView: row.link_view,
    announcementId: row.announcement_id,
    priority: null,
    titleKey: row.title_key ?? null,
    params: row.params ?? {},
    createdAt: row.created_at,
  };
}

export async function listNotifications(profileId: string): Promise<NotificationDTO[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const notifications = ((data ?? []) as NotificationRow[]).map(toNotification);

  // Announcement priority is not duplicated into every notification row; it is
  // read from the announcement for the notifications actually returned.
  const announcementIds = Array.from(
    new Set(
      notifications
        .map((notification) => notification.announcementId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (announcementIds.length > 0) {
    const { data: announcements, error: announcementError } = await supabase
      .from('announcements')
      .select('id, priority')
      .in('id', announcementIds);
    if (announcementError) throw announcementError;
    const priorities = new Map(
      ((announcements ?? []) as Array<{ id: string; priority: string }>).map((row) => [
        row.id,
        row.priority,
      ])
    );
    for (const notification of notifications) {
      const priority = notification.announcementId
        ? priorities.get(notification.announcementId)
        : null;
      if (priority === 'critical' || priority === 'important' || priority === 'normal') {
        notification.priority = priority;
      }
    }
  }
  return notifications;
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
      title_key: input.titleKey ?? null,
      params: input.params ?? {},
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
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from('notifications')
    .update({ read_at: now })
    .eq('profile_id', profileId)
    .eq('id', notificationId)
    .select('id, announcement_id');
  if (error) throw error;
  const row = (data ?? [])[0] as
    | { id: string; announcement_id: string | null }
    | undefined;
  if (!row) return false;
  if (row.announcement_id) {
    // Keep the delivery ledger and the inbox in agreement. The API is the
    // only writer, so a read in the drawer is a real delivery read.
    const { error: deliveryError } = await getSupabaseServer()
      .from('announcement_deliveries')
      .update({ read_at: now })
      .eq('notification_id', row.id)
      .is('read_at', null);
    if (deliveryError) throw deliveryError;
  }
  return true;
}

/** Marks every unread notification of the caller as read. */
export async function markAllNotificationsRead(profileId: string): Promise<number> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServer();
  const { data: unread, error: readError } = await supabase
    .from('notifications')
    .select('id, announcement_id')
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (readError) throw readError;

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: now })
    .eq('profile_id', profileId)
    .is('read_at', null)
    .select('id');
  if (error) throw error;

  const announcementNotificationIds = (
    (unread ?? []) as Array<{ id: string; announcement_id: string | null }>
  )
    .filter((row) => Boolean(row.announcement_id))
    .map((row) => row.id);
  for (let index = 0; index < announcementNotificationIds.length; index += 300) {
    const { error: deliveryError } = await supabase
      .from('announcement_deliveries')
      .update({ read_at: now })
      .in('notification_id', announcementNotificationIds.slice(index, index + 300))
      .is('read_at', null);
    if (deliveryError) throw deliveryError;
  }

  return (data ?? []).length;
}

/**
 * Records that the caller followed a notification's CTA.
 *
 * Click tracking is part of the delivery ledger; it is never inferred from a
 * page view. Returns the stored link target so the caller can navigate.
 */
export async function recordNotificationClick(
  profileId: string,
  notificationId: string
): Promise<{ found: boolean; linkView: string | null }> {
  const supabase = getSupabaseServer();
  const { data: current, error: readError } = await supabase
    .from('notifications')
    .select('id, announcement_id, link_view, read_at')
    .eq('profile_id', profileId)
    .eq('id', notificationId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return { found: false, linkView: null };

  const now = new Date().toISOString();
  // Following a CTA means the notification was seen. Marking it read here keeps
  // the bell, the ledger and the analytics consistent in a single request.
  const wasUnread = current.read_at === null;
  const patch: Record<string, unknown> = { clicked_at: now };
  if (wasUnread) patch.read_at = now;

  const { error } = await supabase
    .from('notifications')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', notificationId);
  if (error) throw error;

  if (current.announcement_id) {
    const deliveryPatch: Record<string, unknown> = { clicked_at: now };
    if (wasUnread) deliveryPatch.read_at = now;
    const { error: deliveryError } = await supabase
      .from('announcement_deliveries')
      .update(deliveryPatch)
      .eq('notification_id', notificationId);
    if (deliveryError) throw deliveryError;
  }
  return { found: true, linkView: current.link_view as string | null };
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
