/**
 * Server persistence for the administrative layer.
 *
 * Every function in this module is called from a route that has already
 * verified the caller's Supabase token and loaded their admin row. Nothing
 * here accepts a client-supplied role or permission.
 *
 * The service-role client bypasses RLS, so the permission checks live in
 * `server/admin/permissions.ts` and the guards in this module (a Super Admin
 * cannot be the last one removed, an announcement cannot be published without
 * recipients) are the real boundary.
 */

import { getSupabaseServer } from './supabase';
import {
  ADMIN_PERMISSIONS,
  isAdminPermission,
  isAdminRole,
  permissionsFor,
  type AdminPermission,
  type AdminRole,
  type AdminStatus,
  type AnnouncementAudience,
  type AnnouncementPriority,
  type AnnouncementStatus,
} from '../../shared/admin.ts';

export class AdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
  }
}

export interface AdminDTO {
  id: string;
  profileId: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
  status: AdminStatus;
  /** The effective permissions, after the role and any override. */
  permissions: AdminPermission[];
  createdBy: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminRow {
  id: string;
  profile_id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  permissions: string[] | null;
  created_by: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

const ADMIN_COLUMNS =
  'id, profile_id, email, full_name, role, status, permissions, created_by, last_active_at, created_at, updated_at';

function toAdmin(row: AdminRow): AdminDTO {
  const role: AdminRole = isAdminRole(row.role) ? row.role : 'moderator';
  const status: AdminStatus = row.status === 'disabled' ? 'disabled' : 'active';
  const override = (row.permissions ?? []).filter((permission): permission is AdminPermission =>
    isAdminPermission(permission)
  );
  return {
    id: row.id,
    profileId: row.profile_id,
    email: row.email,
    fullName: row.full_name,
    role,
    status,
    permissions: status === 'disabled' ? [] : permissionsFor(role, override),
    createdBy: row.created_by,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Loads the administrator attached to a verified profile, if any. */
export async function getAdminByProfileId(profileId: string): Promise<AdminDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('admin_users')
    .select(ADMIN_COLUMNS)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data ? toAdmin(data as AdminRow) : null;
}

/** Records activity without making the request fail if the touch fails. */
export async function touchAdmin(adminId: string): Promise<void> {
  try {
    await getSupabaseServer()
      .from('admin_users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', adminId);
  } catch {
    // Activity is informational; never block a real action on it.
  }
}

export async function listAdmins(): Promise<AdminDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('admin_users')
    .select(ADMIN_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AdminRow[]).map(toAdmin);
}

async function countActiveSuperAdmins(excludeId?: string): Promise<number> {
  let query = getSupabaseServer()
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .eq('status', 'active');
  if (excludeId) query = query.neq('id', excludeId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Finds an auth user by email. Administrators are identified by the verified
 * account email, never by a free-text name, so two people cannot be confused.
 */
export async function findAuthUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  fullName: string | null;
} | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const supabase = getSupabaseServer();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((user) => (user.email ?? '').toLowerCase() === target);
    if (found) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', found.id)
        .maybeSingle();
      return {
        id: found.id,
        email: found.email ?? email.trim(),
        fullName: (profile?.full_name as string | null) ?? null,
      };
    }
    if (users.length < 200) break;
  }
  return null;
}

export interface CreateAdminInput {
  email: string;
  role: AdminRole;
  permissions?: string[];
}

export async function createAdmin(
  input: CreateAdminInput,
  createdByProfileId: string | null
): Promise<AdminDTO> {
  if (!isAdminRole(input.role)) throw new AdminError('Unknown admin role');
  const user = await findAuthUserByEmail(input.email);
  if (!user) throw new AdminError('No account exists with that email address', 404);

  const existing = await getAdminByProfileId(user.id);
  if (existing) throw new AdminError('That account is already an administrator', 409);

  const override = (input.permissions ?? []).filter(isAdminPermission);
  const { data, error } = await getSupabaseServer()
    .from('admin_users')
    .insert({
      profile_id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: input.role,
      status: 'active',
      permissions: override,
      created_by: createdByProfileId,
    })
    .select(ADMIN_COLUMNS)
    .single();
  if (error) throw error;
  return toAdmin(data as AdminRow);
}

export interface UpdateAdminInput {
  role?: AdminRole;
  status?: AdminStatus;
  permissions?: string[] | null;
  fullName?: string | null;
}

export async function updateAdmin(
  adminId: string,
  patch: UpdateAdminInput
): Promise<AdminDTO> {
  const { data: current, error: readError } = await getSupabaseServer()
    .from('admin_users')
    .select(ADMIN_COLUMNS)
    .eq('id', adminId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new AdminError('Administrator not found', 404);
  const row = current as AdminRow;

  if (patch.role !== undefined && !isAdminRole(patch.role)) {
    throw new AdminError('Unknown admin role');
  }
  if (patch.status !== undefined && patch.status !== 'active' && patch.status !== 'disabled') {
    throw new AdminError('Unknown admin status');
  }

  // The platform must always have at least one active Super Admin.
  const losesSuperAdmin =
    row.role === 'super_admin' &&
    ((patch.role !== undefined && patch.role !== 'super_admin') ||
      patch.status === 'disabled');
  if (losesSuperAdmin && (await countActiveSuperAdmins(row.id)) === 0) {
    throw new AdminError('The last active Super Admin cannot be demoted or disabled', 409);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.fullName !== undefined) update.full_name = patch.fullName;
  if (patch.permissions !== undefined) {
    update.permissions = (patch.permissions ?? []).filter(isAdminPermission);
  }

  const { data, error } = await getSupabaseServer()
    .from('admin_users')
    .update(update)
    .eq('id', adminId)
    .select(ADMIN_COLUMNS)
    .single();
  if (error) throw error;
  return toAdmin(data as AdminRow);
}

export async function removeAdmin(adminId: string): Promise<void> {
  const { data, error } = await getSupabaseServer()
    .from('admin_users')
    .select(ADMIN_COLUMNS)
    .eq('id', adminId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminError('Administrator not found', 404);
  const row = data as AdminRow;
  if (row.role === 'super_admin' && (await countActiveSuperAdmins(row.id)) === 0) {
    throw new AdminError('The last active Super Admin cannot be removed', 409);
  }
  const { error: deleteError } = await getSupabaseServer()
    .from('admin_users')
    .delete()
    .eq('id', adminId);
  if (deleteError) throw deleteError;
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                              */
/* -------------------------------------------------------------------------- */

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceType: AnnouncementAudience;
  audienceValues: string[];
  linkView: string | null;
  createdBy: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  audience_type: string;
  audience_values: string[] | null;
  link_view: string | null;
  created_by: string | null;
  created_by_name: string | null;
  published_at: string | null;
  archived_at: string | null;
  recipient_count: number | null;
  created_at: string;
  updated_at: string;
}

const ANNOUNCEMENT_COLUMNS =
  'id, title, body, priority, status, audience_type, audience_values, link_view, created_by, created_by_name, published_at, archived_at, recipient_count, created_at, updated_at';

function toAnnouncement(row: AnnouncementRow): AnnouncementDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority:
      row.priority === 'urgent' || row.priority === 'important' ? row.priority : 'normal',
    status:
      row.status === 'published' || row.status === 'archived' ? row.status : 'draft',
    audienceType: (row.audience_type as AnnouncementAudience) ?? 'all',
    audienceValues: row.audience_values ?? [],
    linkView: row.link_view,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    recipientCount: row.recipient_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAnnouncements(): Promise<AnnouncementDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as AnnouncementRow[]).map(toAnnouncement);
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  priority?: AnnouncementPriority;
  audienceType: AnnouncementAudience;
  audienceValues?: string[];
  linkView?: string | null;
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  admin: AdminDTO
): Promise<AnnouncementDTO> {
  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .insert({
      title: input.title,
      body: input.body,
      priority: input.priority ?? 'normal',
      status: 'draft',
      audience_type: input.audienceType,
      audience_values: input.audienceValues ?? [],
      link_view: input.linkView ?? null,
      created_by: admin.profileId,
      created_by_name: admin.fullName ?? admin.email,
    })
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toAnnouncement(data as AnnouncementRow);
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  priority?: AnnouncementPriority;
  audienceType?: AnnouncementAudience;
  audienceValues?: string[];
  linkView?: string | null;
}

export async function updateAnnouncement(
  id: string,
  patch: UpdateAnnouncementInput
): Promise<AnnouncementDTO> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.audienceType !== undefined) update.audience_type = patch.audienceType;
  if (patch.audienceValues !== undefined) update.audience_values = patch.audienceValues;
  if (patch.linkView !== undefined) update.link_view = patch.linkView;

  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .update(update)
    .eq('id', id)
    .eq('status', 'draft')
    .select(ANNOUNCEMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminError('Only a draft announcement can be edited', 409);
  return toAnnouncement(data as AnnouncementRow);
}

/**
 * Resolves the profile ids an announcement targets.
 *
 * A missing value list for a filtered audience resolves to nobody rather than
 * silently broadcasting to everyone. That is the safe direction: a mistake
 * sends fewer messages, not more.
 */
export async function resolveAnnouncementRecipients(
  announcement: Pick<AnnouncementDTO, 'audienceType' | 'audienceValues'>
): Promise<string[]> {
  const supabase = getSupabaseServer();
  const field =
    announcement.audienceType === 'target_role'
      ? 'target_role'
      : announcement.audienceType === 'target_industry'
        ? 'target_industry'
        : announcement.audienceType === 'user_type'
          ? 'user_type'
          : announcement.audienceType === 'country'
            ? 'country'
            : null;

  if (announcement.audienceType === 'all') {
    const { data, error } = await supabase.from('profiles').select('id');
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  const values = announcement.audienceValues.filter((value) => value.trim().length > 0);
  if (values.length === 0) return [];

  if (announcement.audienceType === 'users') {
    const ids = values.filter((value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('profiles').select('id').in('id', ids);
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  if (!field) return [];
  const { data, error } = await supabase.from('profiles').select('id').in(field, values);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Publishes an announcement by delivering one notification per recipient.
 *
 * Delivery is idempotent for an already-published announcement: re-publishing
 * returns the existing recipient count rather than sending the message twice.
 */
export async function publishAnnouncement(
  id: string,
  admin: AdminDTO
): Promise<AnnouncementDTO> {
  const supabase = getSupabaseServer();
  const { data: current, error: readError } = await supabase
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new AdminError('Announcement not found', 404);
  const announcement = toAnnouncement(current as AnnouncementRow);

  if (announcement.status === 'published') return announcement;
  if (announcement.status === 'archived') {
    throw new AdminError('An archived announcement cannot be published', 409);
  }

  const recipientIds = await resolveAnnouncementRecipients(announcement);
  if (recipientIds.length === 0) {
    throw new AdminError('This audience resolves to no users. Nothing was sent.', 422);
  }

  const now = new Date().toISOString();
  const chunkSize = 500;
  for (let index = 0; index < recipientIds.length; index += chunkSize) {
    const batch = recipientIds.slice(index, index + chunkSize);
    const { error } = await supabase.from('notifications').insert(
      batch.map((profileId) => ({
        profile_id: profileId,
        title: announcement.title,
        message: announcement.body,
        type: 'announcement',
        link_view: announcement.linkView,
        announcement_id: announcement.id,
      }))
    );
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from('announcements')
    .update({
      status: 'published',
      published_at: now,
      archived_at: null,
      recipient_count: recipientIds.length,
      updated_at: now,
    })
    .eq('id', id)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toAnnouncement(data as AnnouncementRow);
}

export async function archiveAnnouncement(id: string): Promise<AnnouncementDTO> {
  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(ANNOUNCEMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminError('Announcement not found', 404);
  return toAnnouncement(data as AnnouncementRow);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await getSupabaseServer().from('announcements').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Users, analytics and audit                                                 */
/* -------------------------------------------------------------------------- */

export interface AdminUserSummary {
  id: string;
  fullName: string | null;
  username: string | null;
  targetRole: string | null;
  targetIndustry: string | null;
  userType: string | null;
  country: string | null;
}

export async function searchProfiles(query: string): Promise<AdminUserSummary[]> {
  let request = getSupabaseServer()
    .from('profiles')
    .select('id, full_name, username, target_role, target_industry, user_type, country')
    .order('full_name', { ascending: true })
    .limit(50);
  const term = query.trim();
  if (term) {
    const escaped = term.replace(/[%,()]/g, ' ');
    request = request.or(
      `full_name.ilike.%${escaped}%,username.ilike.%${escaped}%,target_role.ilike.%${escaped}%`
    );
  }
  const { data, error } = await request;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    fullName: (row.full_name as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    targetRole: (row.target_role as string | null) ?? null,
    targetIndustry: (row.target_industry as string | null) ?? null,
    userType: (row.user_type as string | null) ?? null,
    country: (row.country as string | null) ?? null,
  }));
}

export interface AdminAnalytics {
  users: number;
  admins: number;
  courses: number;
  opportunities: number;
  learningItems: number;
  completedLearning: number;
  notifications: number;
  announcements: number;
  publishedAnnouncements: number;
  activeOpportunities: number;
}

interface CountFilter {
  eq: (column: string, value: unknown) => CountFilter;
}

async function countRows(
  table: string,
  apply?: (query: CountFilter) => CountFilter
): Promise<number> {
  let query = getSupabaseServer().from(table).select('id', { count: 'exact', head: true });
  if (apply) {
    query = apply(query as unknown as CountFilter) as unknown as typeof query;
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [
    users,
    admins,
    courses,
    opportunities,
    learningItems,
    completedLearning,
    notifications,
    announcements,
    publishedAnnouncements,
    activeOpportunities,
  ] = await Promise.all([
    countRows('profiles'),
    countRows('admin_users'),
    countRows('courses'),
    countRows('volunteer_opportunities'),
    countRows('user_learning_items'),
    countRows('user_learning_items', (query) => query.eq('status', 'completed')),
    countRows('notifications'),
    countRows('announcements'),
    countRows('announcements', (query) => query.eq('status', 'published')),
    countRows('volunteer_opportunities', (query) => query.eq('is_active', true)),
  ]);

  return {
    users,
    admins,
    courses,
    opportunities,
    learningItems,
    completedLearning,
    notifications,
    announcements,
    publishedAnnouncements,
    activeOpportunities,
  };
}

export interface AuditEntryInput {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Writes an audit entry. A failure is logged, never allowed to fail the action. */
export async function logAdminAction(admin: AdminDTO, entry: AuditEntryInput): Promise<void> {
  try {
    await getSupabaseServer().from('admin_audit_log').insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.error('Failed to write admin audit entry:', error);
  }
}

/** The most recent audit entries, for a Super Admin's review screen. */
export async function listAuditLog(limit = 100): Promise<
  Array<{
    id: string;
    adminEmail: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>
> {
  const { data, error } = await getSupabaseServer()
    .from('admin_audit_log')
    .select('id, admin_email, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    adminEmail: (row.admin_email as string | null) ?? null,
    action: String(row.action),
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  }));
}

export { ADMIN_PERMISSIONS };
