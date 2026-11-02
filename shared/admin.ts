/**
 * Admin hierarchy and permissions.
 *
 * The Admin Communication Center is a real, server-enforced system. Roles are
 * a fixed vocabulary; the permission set of each role is declared here so the
 * API and the UI cannot disagree about what a role may do.
 *
 * The server never trusts a permission sent by the client. It loads the admin
 * row for the verified Supabase user and checks the role's permission set.
 */

export const ADMIN_ROLES = [
  'super_admin',
  'content_admin',
  'opportunity_admin',
  'moderator',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  content_admin: 'Content Admin',
  opportunity_admin: 'Opportunity Admin',
  moderator: 'Moderator',
};

export const ADMIN_STATUSES = ['active', 'disabled'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const ADMIN_PERMISSIONS = [
  'admin.manage',
  'announcements.read',
  'announcements.write',
  'announcements.publish',
  'opportunities.read',
  'opportunities.write',
  'opportunities.verify',
  'learning.read',
  'learning.write',
  'analytics.read',
  'users.read',
  'moderation.read',
  'moderation.write',
  'audit.read',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * The permission set of each role.
 *
 * Super Admin is deliberately exhaustive. The other roles are scoped: a
 * Content Admin can publish announcements and manage learning, an Opportunity
 * Admin owns the opportunity ecosystem, a Moderator reviews and reports.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: ADMIN_PERMISSIONS,
  content_admin: [
    'announcements.read',
    'announcements.write',
    'announcements.publish',
    'learning.read',
    'learning.write',
    'analytics.read',
    'moderation.read',
  ],
  opportunity_admin: [
    'opportunities.read',
    'opportunities.write',
    'opportunities.verify',
    'analytics.read',
    'moderation.read',
  ],
  moderator: [
    'announcements.read',
    'opportunities.read',
    'learning.read',
    'moderation.read',
    'moderation.write',
  ],
};

/** The effective permissions of an admin, honouring an explicit override. */
export function permissionsFor(
  role: AdminRole,
  override?: readonly string[] | null
): AdminPermission[] {
  const base = ROLE_PERMISSIONS[role] ?? [];
  if (!override || override.length === 0) return [...base];
  const valid = new Set<string>(ADMIN_PERMISSIONS);
  // An explicit override can only narrow or extend within the known
  // vocabulary. A Super Admin always keeps every permission.
  if (role === 'super_admin') return [...ADMIN_PERMISSIONS];
  const selected = override.filter((permission): permission is AdminPermission =>
    valid.has(permission)
  );
  return Array.from(new Set(selected));
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export function isAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

/** A one-line description of what each role owns. */
export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Full access: admins, permissions, announcements, opportunities, learning and analytics.',
  content_admin: 'Creates, edits and publishes announcements, and manages learning content.',
  opportunity_admin: 'Adds, edits and verifies opportunities across the ecosystem.',
  moderator: 'Reviews content, moderates announcements and reports problematic material.',
};

/** Announcement priorities. */
export const ANNOUNCEMENT_PRIORITIES = ['normal', 'important', 'urgent'] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/** The audience a communication can be sent to. */
export const ANNOUNCEMENT_AUDIENCES = [
  'all',
  'users',
  'target_role',
  'target_industry',
  'user_type',
  'country',
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Everyone',
  users: 'Specific users',
  target_role: 'Target role',
  target_industry: 'Career field',
  user_type: 'Account type',
  country: 'Country',
};

export interface AnnouncementAudienceFilter {
  type: AnnouncementAudience;
  /** Profile ids for `users`, values for the other filtered audiences. */
  values: string[];
}

export function isAnnouncementAudience(value: string): value is AnnouncementAudience {
  return (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value);
}

export function isAnnouncementPriority(value: string): value is AnnouncementPriority {
  return (ANNOUNCEMENT_PRIORITIES as readonly string[]).includes(value);
}

export function isAnnouncementStatus(value: string): value is AnnouncementStatus {
  return (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value);
}
