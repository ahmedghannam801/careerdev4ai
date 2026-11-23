/**
 * Daily and weekly digests.
 *
 * A digest is built from records the platform already holds. It is not a list
 * of everything: each section is filtered to the candidate's target role and
 * ordered newest-first, and a digest with nothing in it is not sent.
 *
 * The trigger is the Cloudflare cron, so the digest does not depend on the
 * candidate opening the site. Idempotency is one key per account per period,
 * which means a sweep that runs every five minutes still sends one digest a
 * day and one a week.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { ROLE_DEFINITION_LIST } from '../../shared/careerRoles.ts';
import { searchAllJobs } from '../jobs/feed.ts';
import { enqueueEmailForUser } from './queue.ts';
import type { EmailPreferencesRow } from './preferences.ts';

export interface DigestItem {
  title: string;
  meta?: string;
  url?: string;
}

export interface DigestSection {
  title: string;
  items: DigestItem[];
}

export interface DigestContent {
  title: string;
  preheader: string;
  message: string;
  sections: DigestSection[];
}

export type DigestKind = 'daily' | 'weekly';

interface DigestUser {
  userId: string;
  email: string | null;
  targetRole: string | null;
  locale: 'en' | 'ar';
  name: string;
  preferences: EmailPreferencesRow;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday of the ISO week, as YYYY-MM-DD. */
function weekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return dayKey(copy);
}

function slugForRoleTitle(title: string | null): string | null {
  const needle = (title ?? '').trim().toLowerCase();
  if (!needle) return null;
  for (const role of ROLE_DEFINITION_LIST) {
    if (role.title.trim().toLowerCase() === needle) return role.id;
  }
  return null;
}

function safeLink(value: string | null | undefined, fallback = 'https://aionvia.pages.dev'): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function labels(locale: 'en' | 'ar') {
  return locale === 'ar'
    ? {
        jobs: 'وظائف جديدة',
        opportunities: 'فرص جديدة',
        learning: 'موارد تعلم',
        volunteering: 'فرص تطوع',
        projects: 'مشاريع وتحديات',
        announcements: 'تحديثات المنصة',
        progress: 'تقدمك',
        applications: 'طلباتك',
        completed: 'أكملت',
        inProgress: 'قيد التقدم',
        readiness: 'جاهزيتك',
        titleDaily: 'ملخصك اليومي',
        titleWeekly: 'ملخصك الأسبوعي',
        preheaderDaily: 'أهم ما يستحق انتباهك اليوم.',
        preheaderWeekly: 'حصيلة أسبوعك وفرص الأسبوع القادم.',
        messageDaily: 'اخترنا لك عدداً صغيراً من العناصر المناسبة لهدفك المهني.',
        messageWeekly: 'هذا ما تحرك هذا الأسبوع، وما يستحق أن تبدأ به الأسبوع القادم.',
        progressLine: (completed: number, progress: number) =>
          `أكملت ${completed} عنصراً، ولديك ${progress} قيد التقدم.`,
      }
    : {
        jobs: 'New jobs',
        opportunities: 'New opportunities',
        learning: 'Learning resources',
        volunteering: 'Volunteering',
        projects: 'Projects & challenges',
        announcements: 'Platform updates',
        progress: 'Your progress',
        applications: 'Your applications',
        completed: 'Completed',
        inProgress: 'In progress',
        readiness: 'Readiness',
        titleDaily: 'Your daily digest',
        titleWeekly: 'Your weekly career summary',
        preheaderDaily: 'The few things worth your attention today.',
        preheaderWeekly: 'What moved this week, and what to start next.',
        messageDaily: 'A short, relevant selection for your career goal.',
        messageWeekly: 'Here is what moved this week, and what is worth starting next week.',
        progressLine: (completed: number, progress: number) =>
          `You completed ${completed} item${completed === 1 ? '' : 's'} and have ${progress} in progress.`,
      };
}

/**
 * One job search per target role per digest sweep.
 *
 * The job boards are the slowest and most quota-sensitive source. Many
 * candidates share a role, so the search is cached by role for the duration of
 * the sweep instead of being repeated for every account.
 */
const jobCache = new Map<string, DigestItem[]>();

async function jobsForRole(role: string | null): Promise<DigestItem[]> {
  const query = (role ?? '').trim();
  if (!query) return [];
  const key = query.toLowerCase();
  if (jobCache.has(key)) return jobCache.get(key)!;

  try {
    const result = await searchAllJobs({ query, kind: 'jobs', limit: 5 });
    const items = result.jobs.slice(0, 5).map((job) => ({
      title: job.title,
      meta: [job.company, job.location].filter(Boolean).join(' · '),
      url: safeLink(job.url, 'https://aionvia.pages.dev/#/jobs'),
    }));
    jobCache.set(key, items);
    return items;
  } catch (error) {
    // A board outage is not a digest failure. The other sections still carry
    // the message, and the next sweep tries the boards again.
    console.error('Digest job search failed:', error instanceof Error ? error.message : error);
    jobCache.set(key, []);
    return [];
  }
}

const digestCache = { at: 0, opportunities: [] as Array<Record<string, unknown>> };

async function recentOpportunities(): Promise<Array<Record<string, unknown>>> {
  if (Date.now() - digestCache.at < 5 * 60_000) return digestCache.opportunities;
  const { data, error } = await getSupabaseServer()
    .from('volunteer_opportunities')
    .select('id, title, organization, role_slugs, opportunity_kind, source_url, created_at, location, deadline')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  digestCache.opportunities = (data ?? []) as Array<Record<string, unknown>>;
  digestCache.at = Date.now();
  return digestCache.opportunities;
}

async function buildContent(
  user: DigestUser,
  kind: DigestKind,
  since: string,
): Promise<DigestContent | null> {
  const supabase = getSupabaseServer();
  const copy = labels(user.locale);
  const roleSlug = slugForRoleTitle(user.targetRole);
  const sections: DigestSection[] = [];

  const jobs = await jobsForRole(user.targetRole);
  if (jobs.length > 0) sections.push({ title: copy.jobs, items: jobs });

  const opportunities = await recentOpportunities();
  const matchedOpportunities = opportunities.filter((row) => {
    const created = String(row.created_at ?? '');
    if (created && created < since) return false;
    const roleSlugs = Array.isArray(row.role_slugs) ? (row.role_slugs as string[]) : [];
    if (!roleSlug) return true;
    return roleSlugs.length === 0 || roleSlugs.includes(roleSlug);
  });
  const opportunityItems = matchedOpportunities.slice(0, 5).map((row) => ({
    title: String(row.title ?? ''),
    meta: [row.organization, row.opportunity_kind, row.location].filter(Boolean).join(' · '),
    url: safeLink(
      typeof row.source_url === 'string' ? row.source_url : null,
      'https://aionvia.pages.dev/#/volunteer',
    ),
  }));
  if (opportunityItems.length > 0) {
    const volunteering = matchedOpportunities
      .filter((row) => row.opportunity_kind === 'volunteering')
      .slice(0, 4)
      .map((row) => ({
        title: String(row.title ?? ''),
        meta: [row.organization, row.location].filter(Boolean).join(' · '),
        url: 'https://aionvia.pages.dev/#/volunteer',
      }));
    sections.push({ title: copy.opportunities, items: opportunityItems });
    if (volunteering.length > 0) sections.push({ title: copy.volunteering, items: volunteering });
  }

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, provider, url, created_at, category')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);
  const courseItems = ((courses ?? []) as Array<Record<string, unknown>>).map((row) => ({
    title: String(row.title ?? ''),
    meta: String(row.provider ?? ''),
    url: `https://aionvia.pages.dev/#/learning`,
  }));
  if (courseItems.length > 0) sections.push({ title: copy.learning, items: courseItems });

  const { data: experiences } = await supabase
    .from('career_experiences')
    .select('id, title, provider, url, created_at, category')
    .gte('created_at', since)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);
  const projectItems = ((experiences ?? []) as Array<Record<string, unknown>>).map((row) => ({
    title: String(row.title ?? ''),
    meta: String(row.provider ?? row.category ?? ''),
    url: 'https://aionvia.pages.dev/#/experiences',
  }));
  if (projectItems.length > 0) sections.push({ title: copy.projects, items: projectItems });

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, published_at, link_view')
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(3);
  const announcementItems = ((announcements ?? []) as Array<Record<string, unknown>>).map((row) => ({
    title: String(row.title ?? ''),
    meta: String(row.body ?? '').slice(0, 140),
    url: `https://aionvia.pages.dev/#/${String(row.link_view ?? 'dashboard')}`,
  }));
  if (announcementItems.length > 0) {
    sections.push({ title: copy.announcements, items: announcementItems });
  }

  // The weekly digest also reports the candidate's own activity. A daily
  // digest is about what is new; a weekly one is about what changed.
  if (kind === 'weekly') {
    const [learning, applications, roadmap] = await Promise.all([
      supabase
        .from('user_learning_items')
        .select('status, completed_at, updated_at')
        .eq('profile_id', user.userId)
        .gte('updated_at', since),
      supabase
        .from('job_applications')
        .select('company, role, stage, last_updated')
        .eq('profile_id', user.userId)
        .gte('last_updated', since)
        .order('last_updated', { ascending: false })
        .limit(5),
      supabase
        .from('roadmaps')
        .select('title, readiness_pct, updated_at')
        .eq('profile_id', user.userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const learningRows = (learning.data ?? []) as Array<{ status: string }>;
    const completed = learningRows.filter((row) => row.status === 'completed').length;
    const inProgress = learningRows.filter((row) => row.status === 'in_progress').length;
    const progressItems: DigestItem[] = [];
    if (learningRows.length > 0) {
      progressItems.push({
        title: copy.progressLine(completed, inProgress),
        meta: copy.progress,
        url: 'https://aionvia.pages.dev/#/learning',
      });
    }
    const applicationRows = (applications.data ?? []) as Array<{
      company: string | null;
      role: string | null;
      stage: string | null;
    }>;
    for (const row of applicationRows.slice(0, 4)) {
      progressItems.push({
        title: [row.role, row.company].filter(Boolean).join(' · '),
        meta: row.stage ?? copy.applications,
        url: 'https://aionvia.pages.dev/#/applications',
      });
    }
    const roadmapRow = roadmap.data as { title?: string; readiness_pct?: number } | null;
    if (roadmapRow?.title) {
      progressItems.push({
        title: roadmapRow.title,
        meta: `${copy.readiness}: ${Math.round(Number(roadmapRow.readiness_pct ?? 0))}%`,
        url: 'https://aionvia.pages.dev/#/roadmap',
      });
    }
    if (progressItems.length > 0) {
      sections.push({ title: copy.progress, items: progressItems });
    }
  }

  const withContent = sections.filter((section) => section.items.length > 0);
  if (withContent.length === 0) return null;

  return {
    title: kind === 'daily' ? copy.titleDaily : copy.titleWeekly,
    preheader: kind === 'daily' ? copy.preheaderDaily : copy.preheaderWeekly,
    message: kind === 'daily' ? copy.messageDaily : copy.messageWeekly,
    sections: withContent,
  };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

export interface DigestSweepSummary {
  dailyQueued: number;
  weeklyQueued: number;
  skipped: number;
  failed: number;
}

/**
 * Queues the digests that are due.
 *
 * The sweep is bounded (`maxUsers`) so one cron run cannot exceed the
 * worker's CPU window. The rows that are not reached are picked up by the next
 * run; idempotency keys make that safe.
 */
export async function enqueueDueDigests(options: {
  now?: Date;
  maxUsers?: number;
  force?: boolean;
} = {}): Promise<DigestSweepSummary> {
  const now = options.now ?? new Date();
  const maxUsers = Math.max(1, Math.min(200, options.maxUsers ?? 40));
  const summary: DigestSweepSummary = { dailyQueued: 0, weeklyQueued: 0, skipped: 0, failed: 0 };

  const isWeeklyDay = now.getUTCDay() === 1;
  const dailyStart = startOfDay(now);
  const weeklyStart = startOfWeek(now);
  const dailySince = new Date(dailyStart.getTime() - 24 * 60 * 60_000).toISOString();
  const weeklySince = new Date(weeklyStart.getTime() - 7 * 24 * 60 * 60_000).toISOString();

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('email_preferences')
    .select('*')
    .eq('email_enabled', true)
    .eq('unsubscribed_all', false)
    .or('daily_digest.eq.true,weekly_digest.eq.true')
    .order('last_weekly_digest_at', { ascending: true, nullsFirst: true })
    .limit(maxUsers);

  if (error) throw error;

  const rows = (data ?? []) as EmailPreferencesRow[];
  const userIds = rows.map((row) => row.user_id);

  const [profilesResult, localeResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, target_role, preferred_name, full_name')
      .in('id', userIds),
    supabase.from('user_preferences').select('user_id, language').in('user_id', userIds),
  ]);

  const profiles = new Map<
    string,
    { target_role: string | null; preferred_name: string | null; full_name: string | null }
  >();
  for (const profile of (profilesResult.data ?? []) as Array<{
    id: string;
    target_role: string | null;
    preferred_name: string | null;
    full_name: string | null;
  }>) {
    profiles.set(profile.id, profile);
  }
  const locales = new Map<string, 'en' | 'ar'>();
  for (const localeRow of (localeResult.data ?? []) as Array<{
    user_id: string;
    language: string | null;
  }>) {
    locales.set(localeRow.user_id, localeRow.language === 'ar' ? 'ar' : 'en');
  }

  for (const row of rows) {
    const kind: DigestKind | null =
      isWeeklyDay && row.weekly_digest
        ? 'weekly'
        : row.daily_digest
          ? 'daily'
          : null;
    if (!kind) {
      summary.skipped += 1;
      continue;
    }

    if (!options.force) {
      if (kind === 'daily') {
        if (row.last_daily_digest_at && new Date(row.last_daily_digest_at) >= dailyStart) {
          summary.skipped += 1;
          continue;
        }
        if (now.getUTCHours() < row.digest_hour) {
          summary.skipped += 1;
          continue;
        }
      } else if (row.last_weekly_digest_at && new Date(row.last_weekly_digest_at) >= weeklyStart) {
        summary.skipped += 1;
        continue;
      }
    }

    // Profile fields are read in one batch above; a dialect that returns them
    // nested and one that flattens them are both handled.
    const profile = profiles.get(row.user_id) ?? {
      target_role: null,
      preferred_name: null,
      full_name: null,
    };

    const user: DigestUser = {
      userId: row.user_id,
      email: null,
      targetRole: profile.target_role ?? null,
      locale: locales.get(row.user_id) ?? 'en',
      name: (profile.preferred_name ?? profile.full_name ?? '').trim(),
      preferences: row,
    };

    try {
      const content = await buildContent(user, kind, kind === 'daily' ? dailySince : weeklySince);
      if (!content) {
        summary.skipped += 1;
        continue;
      }

      const key = `digest:${kind}:${row.user_id}:${kind === 'daily' ? dayKey(now) : weekKey(now)}`;
      await enqueueEmailForUser({
        userId: row.user_id,
        template: kind === 'daily' ? 'digest_daily' : 'digest_weekly',
        category: kind === 'daily' ? 'daily_digest' : 'weekly_digest',
        payload: {
          name: user.name,
          title: content.title,
          preheader: content.preheader,
          message: content.message,
          sections: content.sections,
          actionUrl: 'https://aionvia.pages.dev/#/dashboard',
          actionLabel: 'Open Aionvia',
        },
        idempotencyKey: key,
      });

      const patch =
        kind === 'daily'
          ? { last_daily_digest_at: now.toISOString() }
          : { last_weekly_digest_at: now.toISOString() };
      await supabase.from('email_preferences').update(patch).eq('user_id', row.user_id);

      if (kind === 'daily') summary.dailyQueued += 1;
      else summary.weeklyQueued += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`Digest for ${row.user_id} could not be queued:`, error);
    }
  }

  return summary;
}
