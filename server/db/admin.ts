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
  describeAudienceRules,
  isAdminPermission,
  isAdminRole,
  isAnnouncementCategory,
  normaliseAudienceRules,
  permissionsFor,
  type AdminPermission,
  type AdminRole,
  type AdminStatus,
  type AnnouncementAudience,
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AudienceCondition,
  type AudienceField,
  type AudienceRuleGroup,
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

export interface AnnouncementStats {
  deliveredCount: number;
  readCount: number;
  clickedCount: number;
  /** Percentages rounded to one decimal place; 0 when nobody was reached. */
  readRate: number;
  clickRate: number;
}

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceType: AnnouncementAudience;
  audienceValues: string[];
  audienceRules: AudienceRuleGroup[];
  audienceSummary: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  linkView: string | null;
  createdBy: string | null;
  createdByName: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  recipientCount: number;
  stats: AnnouncementStats;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  thumbnail_url: string | null;
  category: string | null;
  priority: string;
  status: string;
  audience_type: string;
  audience_values: string[] | null;
  audience_rules: unknown;
  audience_summary: string | null;
  cta_text: string | null;
  cta_url: string | null;
  link_view: string | null;
  created_by: string | null;
  created_by_name: string | null;
  publish_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  recipient_count: number | null;
  created_at: string;
  updated_at: string;
}

interface AnnouncementStatsRow {
  announcement_id: string;
  delivered_count: number | null;
  read_count: number | null;
  clicked_count: number | null;
}

const ANNOUNCEMENT_COLUMNS = [
  'id',
  'title',
  'body',
  'image_url',
  'thumbnail_url',
  'category',
  'priority',
  'status',
  'audience_type',
  'audience_values',
  'audience_rules',
  'audience_summary',
  'cta_text',
  'cta_url',
  'link_view',
  'created_by',
  'created_by_name',
  'publish_at',
  'expires_at',
  'published_at',
  'archived_at',
  'recipient_count',
  'created_at',
  'updated_at',
].join(', ');

const EMPTY_STATS: AnnouncementStats = {
  deliveredCount: 0,
  readCount: 0,
  clickedCount: 0,
  readRate: 0,
  clickRate: 0,
};

function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function statsFromRow(row: AnnouncementStatsRow | undefined): AnnouncementStats {
  if (!row) return { ...EMPTY_STATS };
  const deliveredCount = row.delivered_count ?? 0;
  const readCount = row.read_count ?? 0;
  const clickedCount = row.clicked_count ?? 0;
  return {
    deliveredCount,
    readCount,
    clickedCount,
    readRate: rate(readCount, deliveredCount),
    clickRate: rate(clickedCount, deliveredCount),
  };
}

function safeRules(value: unknown): AudienceRuleGroup[] {
  try {
    return normaliseAudienceRules(value ?? []);
  } catch {
    // A malformed stored rule must not break the history screen. It resolves
    // as an empty targeting configuration rather than broadening the audience.
    return [];
  }
}

function toAnnouncement(
  row: AnnouncementRow,
  stats: AnnouncementStats = { ...EMPTY_STATS }
): AnnouncementDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    category:
      row.category && isAnnouncementCategory(row.category) ? row.category : 'general',
    priority:
      row.priority === 'critical' || row.priority === 'important' ? row.priority : 'normal',
    status:
      row.status === 'published' ||
      row.status === 'scheduled' ||
      row.status === 'expired' ||
      row.status === 'archived'
        ? row.status
        : 'draft',
    audienceType: (row.audience_type as AnnouncementAudience) ?? 'all',
    audienceValues: row.audience_values ?? [],
    audienceRules: safeRules(row.audience_rules),
    audienceSummary: row.audience_summary,
    ctaText: row.cta_text,
    ctaUrl: row.cta_url,
    linkView: row.link_view,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    publishAt: row.publish_at,
    expiresAt: row.expires_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    recipientCount: row.recipient_count ?? 0,
    stats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAnnouncementStats(
  ids: string[]
): Promise<Map<string, AnnouncementStats>> {
  const map = new Map<string, AnnouncementStats>();
  if (ids.length === 0) return map;
  const { data, error } = await getSupabaseServer()
    .from('announcement_delivery_stats')
    .select('announcement_id, delivered_count, read_count, clicked_count')
    .in('announcement_id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as AnnouncementStatsRow[]) {
    map.set(row.announcement_id, statsFromRow(row));
  }
  return map;
}

export interface AnnouncementFilters {
  status?: AnnouncementStatus;
  category?: AnnouncementCategory;
  priority?: AnnouncementPriority;
  limit?: number;
}

export async function listAnnouncements(
  filters: AnnouncementFilters = {}
): Promise<AnnouncementDTO[]> {
  let request = getSupabaseServer()
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(300, filters.limit ?? 200)));
  if (filters.status) request = request.eq('status', filters.status);
  if (filters.category) request = request.eq('category', filters.category);
  if (filters.priority) request = request.eq('priority', filters.priority);

  const { data, error } = await request;
  if (error) throw error;
  const rows = (data ?? []) as unknown as AnnouncementRow[];
  const stats = await loadAnnouncementStats(rows.map((row) => row.id));
  return rows.map((row) => toAnnouncement(row, stats.get(row.id)));
}

/* -------------------------------------------------------------------------- */
/* Audience targeting engine                                                  */
/*                                                                             */
/* Every condition resolves a set of profile ids through indexed queries.      */
/* Groups are intersected; conditions inside a group are intersected (AND) or  */
/* unioned (OR). The same function feeds the preview and the real delivery,    */
/* so the number shown to the administrator is the number that receives the    */
/* announcement.                                                               */
/* -------------------------------------------------------------------------- */

const QUERY_CHUNK = 300;
const PAGE_SIZE = 1000;

function chunks<T>(values: T[], size = QUERY_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function escapeLike(value: string): string {
  return value.replace(/[%,()]/g, ' ').trim();
}

function isUuidValue(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function unionInto(target: Set<string>, source: Iterable<string>): void {
  for (const value of source) target.add(value);
}

function intersectSets(first: Set<string>, second: Set<string>): Set<string> {
  const result = new Set<string>();
  const [small, large] = first.size <= second.size ? [first, second] : [second, first];
  for (const value of small) if (large.has(value)) result.add(value);
  return result;
}

async function collectIds(build: () => any, column = 'id'): Promise<Set<string>> {
  const result = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const value = row[column];
      if (value !== null && value !== undefined) result.add(String(value));
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return result;
}

/** Resolves a chunked `in`/`ilike` match into a set of ids from one column. */
async function matchIds(
  table: string,
  idColumn: string,
  matchColumn: string,
  values: string[],
  mode: 'in' | 'ilike',
  refine?: (query: any) => any
): Promise<Set<string>> {
  const result = new Set<string>();
  for (const chunk of chunks(values)) {
    const set = await collectIds(() => {
      let query = getSupabaseServer().from(table).select(idColumn);
      if (mode === 'in') {
        query = query.in(matchColumn, chunk);
      } else {
        query = query.or(
          chunk
            .map((value) => `${matchColumn}.ilike.%${escapeLike(value)}%`)
            .join(',')
        );
      }
      if (refine) query = refine(query);
      return query;
    }, idColumn);
    unionInto(result, set);
  }
  return result;
}

async function resolveCondition(condition: AudienceCondition): Promise<Set<string>> {
  const values = condition.values.filter((value) => value.trim().length > 0);
  if (values.length === 0) return new Set();

  switch (condition.field as AudienceField) {
    case 'career':
      return collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('target_role', values)
      );
    case 'industry':
      return collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('target_industry', values)
      );
    case 'user_type':
      return collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('user_type', values)
      );
    case 'country':
      return collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('country', values)
      );
    case 'city': {
      const byCity = await collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('city', values)
      );
      const byLocation = await matchIds('profiles', 'id', 'location', values, 'ilike');
      unionInto(byCity, byLocation);
      return byCity;
    }
    case 'university':
      return matchIds('educations', 'user_id', 'institution', values, 'ilike');
    case 'field_of_study':
      return matchIds('educations', 'user_id', 'field_of_study', values, 'ilike');
    case 'degree':
      return matchIds('educations', 'user_id', 'degree', values, 'ilike');
    case 'skill': {
      const skillIds = await matchIds('skills', 'id', 'name', values, 'ilike');
      if (skillIds.size === 0) return new Set();
      const result = new Set<string>();
      for (const chunk of chunks(Array.from(skillIds))) {
        const set = await collectIds(
          () =>
            getSupabaseServer()
              .from('user_skills')
              .select('user_id')
              .in('skill_id', chunk),
          'user_id'
        );
        unionInto(result, set);
      }
      return result;
    }
    case 'roadmap':
      return matchIds('roadmaps', 'profile_id', 'target_role_title', values, 'in');
    case 'roadmap_stage': {
      // A step is "current" when it belongs to the user's roadmap and is not
      // completed. Match the step title or its skill, then walk back to the
      // roadmap owner.
      const milestoneIds = new Set<string>();
      for (const chunk of chunks(values)) {
        const bySkill = await collectIds(
          () =>
            getSupabaseServer()
              .from('roadmap_tasks')
              .select('milestone_id')
              .neq('status', 'completed')
              .in('skill_name', chunk),
          'milestone_id'
        );
        const byTitle = await collectIds(
          () =>
            getSupabaseServer()
              .from('roadmap_tasks')
              .select('milestone_id')
              .neq('status', 'completed')
              .or(
                chunk
                  .map((value) => `title.ilike.%${escapeLike(value)}%`)
                  .join(',')
              ),
          'milestone_id'
        );
        unionInto(milestoneIds, bySkill);
        unionInto(milestoneIds, byTitle);
      }
      if (milestoneIds.size === 0) return new Set();
      const phaseIds = new Set<string>();
      for (const chunk of chunks(Array.from(milestoneIds))) {
        unionInto(
          phaseIds,
          await collectIds(
            () =>
              getSupabaseServer()
                .from('roadmap_milestones')
                .select('phase_id')
                .in('id', chunk),
            'phase_id'
          )
        );
      }
      const roadmapIds = new Set<string>();
      for (const chunk of chunks(Array.from(phaseIds))) {
        unionInto(
          roadmapIds,
          await collectIds(
            () =>
              getSupabaseServer()
                .from('roadmap_phases')
                .select('roadmap_id')
                .in('id', chunk),
            'roadmap_id'
          )
        );
      }
      if (roadmapIds.size === 0) return new Set();
      return collectIds(
        () =>
          getSupabaseServer()
            .from('roadmaps')
            .select('profile_id')
            .in('id', Array.from(roadmapIds)),
        'profile_id'
      );
    }
    case 'learning_completed':
    case 'learning_in_progress': {
      const status = condition.field === 'learning_completed' ? 'completed' : 'in_progress';
      const uuidValues = values.filter(isUuidValue);
      const courseIds = new Set<string>(uuidValues);
      for (const chunk of chunks(values.filter((value) => !isUuidValue(value)))) {
        if (chunk.length === 0) continue;
        unionInto(
          courseIds,
          await collectIds(() =>
            getSupabaseServer()
              .from('courses')
              .select('id')
              .or(chunk.map((value) => `title.ilike.%${escapeLike(value)}%`).join(','))
          )
        );
      }
      if (courseIds.size === 0) return new Set();
      const result = new Set<string>();
      for (const chunk of chunks(Array.from(courseIds))) {
        unionInto(
          result,
          await collectIds(
            () =>
              getSupabaseServer()
                .from('user_learning_items')
                .select('profile_id')
                .eq('status', status)
                .in('course_id', chunk),
            'profile_id'
          )
        );
      }
      return result;
    }
    case 'project_completed':
    case 'project_active': {
      const completed = condition.field === 'project_completed';
      const result = new Set<string>();
      for (const chunk of chunks(values)) {
        const byId = completed
          ? await collectIds(() => {
              let query = getSupabaseServer()
                .from('projects')
                .select('profile_id')
                .eq('status', 'completed')
                .in('title', chunk);
              return query;
            }, 'profile_id')
          : await collectIds(() => {
              let query = getSupabaseServer()
                .from('projects')
                .select('profile_id')
                .neq('status', 'completed')
                .in('title', chunk);
              return query;
            }, 'profile_id');
        unionInto(result, byId);
        const byContains = await matchIds(
          'projects',
          'profile_id',
          'title',
          chunk,
          'ilike',
          (query) =>
            completed ? query.eq('status', 'completed') : query.neq('status', 'completed')
        );
        unionInto(result, byContains);
      }
      return result;
    }
    case 'users': {
      const ids = values.filter(isUuidValue);
      if (ids.length === 0) return new Set();
      return collectIds(() =>
        getSupabaseServer().from('profiles').select('id').in('id', ids)
      );
    }
    default:
      return new Set();
  }
}

export async function resolveAudienceRules(
  rules: AudienceRuleGroup[]
): Promise<string[]> {
  if (rules.length === 0) return [];
  const groups: Set<string>[] = [];
  for (const group of rules) {
    let result: Set<string> | null = null;
    for (const condition of group.conditions) {
      const set = await resolveCondition(condition);
      if (result === null) {
        result = set;
      } else if (group.logic === 'or') {
        unionInto(result, set);
      } else {
        result = intersectSets(result, set);
      }
      if (result.size === 0) break;
    }
    if (result !== null) groups.push(result);
  }
  if (groups.length === 0) return [];
  let final = groups[0];
  for (let index = 1; index < groups.length; index += 1) {
    final = intersectSets(final, groups[index]);
    if (final.size === 0) break;
  }
  return Array.from(final).sort();
}

export interface LegacyAudience {
  audienceType: AnnouncementAudience;
  audienceValues: string[];
}

/** Resolves the legacy single-field audience, kept for existing announcements. */
async function resolveLegacyAudience(audience: LegacyAudience): Promise<string[]> {
  const supabase = getSupabaseServer();
  const field =
    audience.audienceType === 'target_role'
      ? 'target_role'
      : audience.audienceType === 'target_industry'
        ? 'target_industry'
        : audience.audienceType === 'user_type'
          ? 'user_type'
          : audience.audienceType === 'country'
            ? 'country'
            : null;

  if (audience.audienceType === 'all') {
    const { data, error } = await supabase.from('profiles').select('id');
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  const values = audience.audienceValues.filter((value) => value.trim().length > 0);
  if (values.length === 0) return [];

  if (audience.audienceType === 'users') {
    const ids = values.filter(isUuidValue);
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
 * Resolves the exact recipients of an announcement.
 *
 * New announcements carry targeting rules; old ones still carry a single
 * audience field. A missing value list resolves to nobody rather than silently
 * broadcasting to everyone, which is the safe direction.
 */
export async function resolveAnnouncementRecipients(
  announcement: Pick<
    AnnouncementDTO,
    'audienceType' | 'audienceValues' | 'audienceRules'
  >
): Promise<string[]> {
  if (announcement.audienceRules.length > 0) {
    return resolveAudienceRules(announcement.audienceRules);
  }
  return resolveLegacyAudience(announcement);
}

export interface AnnouncementInput {
  title: string;
  body: string;
  category?: AnnouncementCategory;
  priority?: AnnouncementPriority;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  linkView?: string | null;
  publishAt?: string | null;
  expiresAt?: string | null;
  audienceType?: AnnouncementAudience;
  audienceValues?: string[];
  audienceRules?: AudienceRuleGroup[];
}

function parsedDate(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new AdminError(`${field} is not a valid date`);
  return date.toISOString();
}

function auditSummary(
  rules: AudienceRuleGroup[],
  audienceType: AnnouncementAudience,
  audienceValues: string[]
): string {
  if (rules.length > 0) return describeAudienceRules(rules);
  if (audienceType === 'all') return 'Everyone';
  return `${audienceType}: ${audienceValues.join(' / ')}`;
}

export async function createAnnouncement(
  input: AnnouncementInput,
  admin: AdminDTO
): Promise<AnnouncementDTO> {
  let rules: AudienceRuleGroup[];
  try {
    rules = normaliseAudienceRules(input.audienceRules ?? []);
  } catch (error) {
    throw new AdminError(error instanceof Error ? error.message : 'Invalid targeting rules');
  }
  const audienceType = input.audienceType ?? 'all';
  const audienceValues = input.audienceValues ?? [];
  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .insert({
      title: input.title,
      body: input.body,
      category: input.category ?? 'general',
      priority: input.priority ?? 'normal',
      status: 'draft',
      image_url: input.imageUrl ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      cta_text: input.ctaText ?? null,
      cta_url: input.ctaUrl ?? null,
      link_view: input.linkView ?? null,
      publish_at: parsedDate(input.publishAt, 'Publish date'),
      expires_at: parsedDate(input.expiresAt, 'Expiration date'),
      audience_type: audienceType,
      audience_values: audienceValues,
      audience_rules: rules,
      audience_summary: auditSummary(rules, audienceType, audienceValues),
      created_by: admin.profileId,
      created_by_name: admin.fullName ?? admin.email,
    })
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toAnnouncement(data as unknown as AnnouncementRow);
}

export interface UpdateAnnouncementInput extends Partial<AnnouncementInput> {}

export async function updateAnnouncement(
  id: string,
  patch: UpdateAnnouncementInput
): Promise<AnnouncementDTO> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;
  if (patch.thumbnailUrl !== undefined) update.thumbnail_url = patch.thumbnailUrl;
  if (patch.ctaText !== undefined) update.cta_text = patch.ctaText;
  if (patch.ctaUrl !== undefined) update.cta_url = patch.ctaUrl;
  if (patch.linkView !== undefined) update.link_view = patch.linkView;
  if (patch.publishAt !== undefined) {
    update.publish_at = parsedDate(patch.publishAt, 'Publish date');
  }
  if (patch.expiresAt !== undefined) {
    update.expires_at = parsedDate(patch.expiresAt, 'Expiration date');
  }
  if (patch.audienceType !== undefined) update.audience_type = patch.audienceType;
  if (patch.audienceValues !== undefined) update.audience_values = patch.audienceValues;
  if (patch.audienceRules !== undefined) {
    let rules: AudienceRuleGroup[];
    try {
      rules = normaliseAudienceRules(patch.audienceRules);
    } catch (error) {
      throw new AdminError(
        error instanceof Error ? error.message : 'Invalid targeting rules'
      );
    }
    update.audience_rules = rules;
    const { data: current } = await getSupabaseServer()
      .from('announcements')
      .select('audience_type, audience_values')
      .eq('id', id)
      .maybeSingle();
    update.audience_summary = auditSummary(
      rules,
      patch.audienceType ??
        ((current?.audience_type as AnnouncementAudience | null) ?? 'all'),
      patch.audienceValues ?? ((current?.audience_values as string[] | null) ?? [])
    );
  }

  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .update(update)
    .eq('id', id)
    .in('status', ['draft', 'scheduled'])
    .select(ANNOUNCEMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminError('Only a draft or scheduled announcement can be edited', 409);
  return toAnnouncement(data as unknown as AnnouncementRow, (await loadAnnouncementStats([id])).get(id));
}

/**
 * Resolves the audience without delivering anything. This is the exact same
 * resolver publishing uses, so the preview count cannot drift from delivery.
 */
export async function previewAnnouncementAudience(input: {
  audienceType?: AnnouncementAudience;
  audienceValues?: string[];
  audienceRules?: AudienceRuleGroup[];
}): Promise<{ count: number; summary: string }> {
  let rules: AudienceRuleGroup[];
  try {
    rules = normaliseAudienceRules(input.audienceRules ?? []);
  } catch (error) {
    throw new AdminError(error instanceof Error ? error.message : 'Invalid targeting rules');
  }
  const recipients =
    rules.length > 0
      ? await resolveAudienceRules(rules)
      : await resolveLegacyAudience({
          audienceType: input.audienceType ?? 'all',
          audienceValues: input.audienceValues ?? [],
        });
  return {
    count: recipients.length,
    summary: auditSummary(rules, input.audienceType ?? 'all', input.audienceValues ?? []),
  };
}

/**
 * Delivers an announcement to its audience.
 *
 * The delivery ledger and the notification inbox are written together:
 *
 *   1. resolve the audience with the same engine the preview used;
 *   2. reuse any notifications already created for this announcement, so a
 *      retried publish never sends a second notification;
 *   3. insert the missing notifications in 500-row batches;
 *   4. upsert one delivery row per recipient (unique on announcement/user);
 *   5. mark the announcement published.
 */
export async function publishAnnouncement(id: string): Promise<AnnouncementDTO> {
  const supabase = getSupabaseServer();
  const { data: current, error: readError } = await supabase
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new AdminError('Announcement not found', 404);
  const announcement = toAnnouncement(current as unknown as AnnouncementRow);

  if (announcement.status === 'published') {
    return toAnnouncement(
      current as unknown as AnnouncementRow,
      (await loadAnnouncementStats([id])).get(id)
    );
  }
  if (announcement.status === 'archived') {
    throw new AdminError('An archived announcement cannot be published', 409);
  }
  if (announcement.status === 'expired') {
    throw new AdminError('An expired announcement cannot be published', 409);
  }

  const recipientIds = await resolveAnnouncementRecipients(announcement);
  if (recipientIds.length === 0) {
    throw new AdminError('This audience resolves to no users. Nothing was sent.', 422);
  }

  const { data: existing, error: existingError } = await supabase
    .from('notifications')
    .select('id, profile_id, created_at')
    .eq('announcement_id', id);
  if (existingError) throw existingError;

  const notifications = ((existing ?? []) as Array<{
    id: string;
    profile_id: string;
    created_at: string;
  }>).slice();
  const alreadyNotified = new Set(notifications.map((row) => row.profile_id));
  const missing = recipientIds.filter((profileId) => !alreadyNotified.has(profileId));

  const batchSize = 500;
  for (let index = 0; index < missing.length; index += batchSize) {
    const batch = missing.slice(index, index + batchSize);
    // The unique index on (announcement_id, profile_id) is the final arbiter:
    // a publish that races another publish (or the scheduler tick) inserts
    // nothing for recipients the other run already reached.
    const { error } = await supabase.from('notifications').upsert(
      batch.map((profileId) => ({
        profile_id: profileId,
        title: announcement.title,
        message: announcement.body,
        type: 'announcement',
        link_view: announcement.linkView,
        announcement_id: announcement.id,
      })),
      { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  // Read the notifications back instead of trusting what this request
  // inserted, so the ledger always points at the row the database kept even
  // when a concurrent publish won the race.
  const { data: delivered, error: deliveredError } = await supabase
    .from('notifications')
    .select('id, profile_id, created_at')
    .eq('announcement_id', id);
  if (deliveredError) throw deliveredError;

  // One delivery row per distinct recipient, even if an earlier attempt left
  // duplicate notifications behind.
  const byProfile = new Map<string, { id: string; created_at: string }>();
  for (const row of (delivered ?? []) as Array<{
    id: string;
    profile_id: string;
    created_at: string;
  }>) {
    if (!byProfile.has(row.profile_id)) {
      byProfile.set(row.profile_id, { id: row.id, created_at: row.created_at });
    }
  }
  const deliveryRows = Array.from(byProfile.entries()).map(([profileId, row]) => ({
    announcement_id: announcement.id,
    profile_id: profileId,
    notification_id: row.id,
    delivered_at: row.created_at,
  }));
  for (let index = 0; index < deliveryRows.length; index += batchSize) {
    const { error } = await supabase.from('announcement_deliveries').upsert(
      deliveryRows.slice(index, index + batchSize),
      { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('announcements')
    .update({
      status: 'published',
      published_at: now,
      publish_at: announcement.publishAt ?? now,
      archived_at: null,
      recipient_count: byProfile.size,
      updated_at: now,
    })
    .eq('id', id)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;

  return toAnnouncement(data as unknown as AnnouncementRow, (await loadAnnouncementStats([id])).get(id));
}

/** Schedules an announcement for a future server-side publish. */
export async function scheduleAnnouncement(
  id: string,
  publishAtValue: string
): Promise<AnnouncementDTO> {
  const publishAt = parsedDate(publishAtValue, 'Publish date');
  if (!publishAt) throw new AdminError('A publish date is required');
  if (new Date(publishAt).getTime() <= Date.now() + 30_000) {
    throw new AdminError('The scheduled time must be at least a minute in the future');
  }
  const { data, error } = await getSupabaseServer()
    .from('announcements')
    .update({
      status: 'scheduled',
      publish_at: publishAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['draft', 'scheduled'])
    .select(ANNOUNCEMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminError('Only a draft or scheduled announcement can be scheduled', 409);
  return toAnnouncement(data as unknown as AnnouncementRow, (await loadAnnouncementStats([id])).get(id));
}

/**
 * Server-side scheduler tick.
 *
 * Called from API traffic and from the explicit process-due endpoint. It does
 * not depend on an administrator's browser: once time passes, the next
 * server-side tick publishes the announcement and marks expired ones expired.
 */
export async function processDueAnnouncements(): Promise<{
  published: number;
  expired: number;
}> {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('announcements')
    .select('id')
    .eq('status', 'scheduled')
    .not('publish_at', 'is', null)
    .lte('publish_at', now)
    .order('publish_at', { ascending: true })
    .limit(25);
  if (error) throw error;

  let published = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    try {
      await publishAnnouncement(row.id);
      published += 1;
    } catch (publishError) {
      console.error(`Scheduled announcement ${row.id} could not be published:`, publishError);
    }
  }

  const { data: expired, error: expireError } = await supabase
    .from('announcements')
    .update({ status: 'expired', updated_at: now })
    .eq('status', 'published')
    .not('expires_at', 'is', null)
    .lte('expires_at', now)
    .select('id');
  if (expireError) throw expireError;

  return { published, expired: (expired ?? []).length };
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
  return toAnnouncement(data as unknown as AnnouncementRow, (await loadAnnouncementStats([id])).get(id));
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
