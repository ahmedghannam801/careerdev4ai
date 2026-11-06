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
  'subscriptions.read',
  'subscriptions.manage',
  'payments.read',
  'payments.confirm',
  'credits.read',
  'credits.grant',
  'revenue.read',
  'coupons.manage',
  'plans.manage',
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
    'subscriptions.read',
    'revenue.read',
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
    'payments.read',
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

/** Announcement priorities. Critical is reserved for genuine platform-wide notices. */
export const ANNOUNCEMENT_PRIORITIES = ['normal', 'important', 'critical'] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  normal: 'Normal',
  important: 'Important',
  critical: 'Critical',
};

export const ANNOUNCEMENT_STATUSES = [
  'draft',
  'scheduled',
  'published',
  'expired',
  'archived',
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_CATEGORIES = [
  'general',
  'learning',
  'opportunity',
  'platform',
  'event',
  'deadline',
  'security',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  general: 'General',
  learning: 'Learning',
  opportunity: 'Opportunity',
  platform: 'Platform',
  event: 'Event',
  deadline: 'Deadline',
  security: 'Security',
};

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

export function isAnnouncementCategory(value: string): value is AnnouncementCategory {
  return (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Audience targeting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The fields the targeting engine can resolve.
 *
 * Each field maps to real, stored data. Fields the product does not collect
 * (for example an academic year) are deliberately absent: a filter that can
 * never match would be a lie in the UI.
 */
export const AUDIENCE_FIELDS = [
  'career',
  'industry',
  'user_type',
  'country',
  'city',
  'university',
  'field_of_study',
  'degree',
  'skill',
  'roadmap',
  'roadmap_stage',
  'learning_completed',
  'learning_in_progress',
  'project_completed',
  'project_active',
  'users',
] as const;

export type AudienceField = (typeof AUDIENCE_FIELDS)[number];

export const AUDIENCE_FIELD_LABELS: Record<AudienceField, string> = {
  career: 'Career / target role',
  industry: 'Career field',
  user_type: 'Account type',
  country: 'Country',
  city: 'City / governorate',
  university: 'University',
  field_of_study: 'Faculty / field of study',
  degree: 'Degree',
  skill: 'Skill',
  roadmap: 'Enrolled roadmap (target role)',
  roadmap_stage: 'Roadmap step not completed',
  learning_completed: 'Completed course',
  learning_in_progress: 'Course in progress',
  project_completed: 'Completed project',
  project_active: 'Active project',
  users: 'Specific users (profile IDs)',
};

/** Fields whose values are chosen from a known list instead of free text. */
export const AUDIENCE_SUGGESTION_FIELDS = [
  'career',
  'industry',
  'user_type',
  'skill',
  'university',
  'field_of_study',
  'degree',
  'roadmap',
] as const;

export interface AudienceCondition {
  field: AudienceField;
  values: string[];
}

export interface AudienceRuleGroup {
  logic: 'and' | 'or';
  conditions: AudienceCondition[];
}

export const AUDIENCE_LIMITS = {
  groups: 6,
  conditionsPerGroup: 12,
  valuesPerCondition: 100,
  valueLength: 120,
} as const;

export function isAudienceField(value: string): value is AudienceField {
  return (AUDIENCE_FIELDS as readonly string[]).includes(value);
}

export function isAudienceLogic(value: string): value is 'and' | 'or' {
  return value === 'and' || value === 'or';
}

/** Whether a set of rules is usable. An empty array means "legacy audience". */
export function hasAudienceRules(rules: unknown): rules is AudienceRuleGroup[] {
  return Array.isArray(rules) && rules.length > 0;
}

/**
 * Validates and normalises targeting rules coming from the client.
 *
 * The server calls this before anything is stored. Unknown fields, empty
 * conditions and oversized inputs are rejected rather than silently ignored,
 * so a malformed rule cannot broaden an audience.
 */
export function normaliseAudienceRules(input: unknown): AudienceRuleGroup[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('Targeting rules must be a list of groups');
  if (input.length > AUDIENCE_LIMITS.groups) {
    throw new Error(`At most ${AUDIENCE_LIMITS.groups} targeting groups are allowed`);
  }

  const groups: AudienceRuleGroup[] = [];
  for (const rawGroup of input) {
    if (!rawGroup || typeof rawGroup !== 'object') {
      throw new Error('Each targeting group must be an object');
    }
    const group = rawGroup as Record<string, unknown>;
    const logic = group.logic === undefined ? 'and' : String(group.logic);
    if (!isAudienceLogic(logic)) throw new Error('A targeting group logic must be and or or');
    const rawConditions = group.conditions;
    if (!Array.isArray(rawConditions)) {
      throw new Error('Each targeting group needs a conditions list');
    }
    if (rawConditions.length === 0) continue;
    if (rawConditions.length > AUDIENCE_LIMITS.conditionsPerGroup) {
      throw new Error(
        `At most ${AUDIENCE_LIMITS.conditionsPerGroup} conditions are allowed per group`
      );
    }

    const conditions: AudienceCondition[] = [];
    for (const rawCondition of rawConditions) {
      if (!rawCondition || typeof rawCondition !== 'object') {
        throw new Error('Each condition must be an object');
      }
      const condition = rawCondition as Record<string, unknown>;
      const field = String(condition.field ?? '');
      if (!isAudienceField(field)) {
        throw new Error(`Unknown targeting field: ${field || '(empty)'}`);
      }
      if (!Array.isArray(condition.values)) {
        throw new Error('Each targeting condition needs a values list');
      }
      const values = Array.from(
        new Set(
          condition.values
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
        )
      );
      if (values.length === 0) continue;
      if (values.length > AUDIENCE_LIMITS.valuesPerCondition) {
        throw new Error(
          `At most ${AUDIENCE_LIMITS.valuesPerCondition} values are allowed per condition`
        );
      }
      if (values.some((value) => value.length > AUDIENCE_LIMITS.valueLength)) {
        throw new Error(`Targeting values must be at most ${AUDIENCE_LIMITS.valueLength} characters`);
      }
      conditions.push({ field, values });
    }
    if (conditions.length > 0) groups.push({ logic, conditions });
  }
  return groups;
}

/** A readable one-line summary of the targeting, stored with the announcement. */
export function describeAudienceRules(rules: AudienceRuleGroup[]): string {
  if (rules.length === 0) return 'Legacy audience';
  return rules
    .map(
      (group) =>
        `(${group.conditions
          .map(
            (condition) =>
              `${AUDIENCE_FIELD_LABELS[condition.field]}: ${condition.values.join(' / ')}`
          )
          .join(group.logic === 'or' ? ' OR ' : ' AND ')})`
    )
    .join(' AND ');
}
