/**
 * The AI-credit and CV-activity monitor of the Admin Center.
 *
 * The platform hands every account a daily free-credit allowance and spends
 * those credits on AI actions. An administrator could see a candidate's own
 * balance, but not the economy behind it: how much was given out, what it was
 * spent on, which operations failed, and how much CV work the platform
 * actually produced.
 *
 * This module reads that story from the credit ledger, the daily-grant
 * summary and the CV tables. It is a read-only window: it never grants,
 * consumes or refunds a credit. Every route re-checks the caller with the
 * existing admin middleware, so the Admin Center tab is a convenience and not
 * the security boundary.
 *
 * The daily allowance is granted on an Africa/Cairo day, so every day bucket
 * here is a Cairo day as well. Mixing UTC days with Cairo grant days would
 * split a grant and the consumption it paid for across two rows of the report.
 */

import type { Express, Response } from 'express';
import { requireAuth } from '../auth/require-auth.ts';
import {
  requireAdmin,
  requireAnyPermission,
  requirePermission,
  type AdminRequest,
} from './permissions.ts';
import { getSupabaseServer } from '../db/supabase.ts';
import {
  AI_CREDIT_ACTIONS,
  CREDIT_OPERATIONS,
  type AICreditAction,
} from '../../shared/credits.ts';

/** The zone the daily allowance is granted in. */
const CAIRO = 'Africa/Cairo';

/** The action the Learning Hub spends its credits on. */
const LEARNING_HUB_ACTION: AICreditAction = 'learning_recommendation';

/**
 * The actions that produce or refine a CV.
 *
 * The cover letter is a separate document with its own weight, so it is not
 * part of the CV family this report follows.
 */
const CV_ACTIONS: readonly AICreditAction[] = [
  'cv_generation',
  'cv_tailoring',
  'cv_ats_analysis',
];

/**
 * How many ledger rows one report may read.
 *
 * The report aggregates in memory because the platform exposes no aggregate
 * view for it. The cap keeps a busy ledger from turning an admin screen into a
 * full table dump; a report that reaches the cap says so.
 */
const MAX_SCAN_ROWS = 20000;

/** The longest window a report may cover. */
const MAX_WINDOW_DAYS = 90;

/** The longest page a ledger view may return. */
const MAX_PAGE_SIZE = 200;

const cairoDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const cairoPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface DailyGrantRow {
  grant_day: string;
  accounts_granted: number | null;
  credits_granted: number | null;
  credits_remaining: number | null;
  accounts_with_credits: number | null;
}

interface LedgerScanRow {
  profile_id: string;
  amount: number;
  running_balance: number;
  operation: string;
  ai_action_type: string | null;
  created_at: string;
}

interface BalanceScanRow {
  profile_id: string;
  running_balance: number;
  created_at: string;
}

interface CvActivityRow {
  id: string;
  template_id: string | null;
  template_tier: string | null;
  created_at: string;
}

interface CvTemplateRow {
  template_id: string;
  name_en: string | null;
  name_ar: string | null;
  tier: string | null;
}

/** The Cairo calendar day of an instant, as `YYYY-MM-DD`. */
function cairoDayOf(at: Date): string {
  return cairoDayFormatter.format(at);
}

/** The offset of the Cairo zone at an instant, in milliseconds. */
function cairoOffsetMs(at: Date): number {
  const parts = cairoPartsFormatter.formatToParts(at);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second')
  );
  return asUtc - at.getTime();
}

/**
 * The instant a Cairo day starts.
 *
 * The offset is read from the zone itself instead of being written down, so
 * the cut stays on grant day even if the zone's offset ever changes.
 */
function cairoDayStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - cairoOffsetMs(guess));
}

/** The Cairo day a number of days before another Cairo day. */
function shiftDay(day: string, days: number): string {
  const base = new Date(`${day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Reads a bounded integer from the query, or reports that the value is not usable. */
function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/** Reads an optional text filter and trims it. */
function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** The days of a window, oldest first, as Cairo days. */
function windowDays(firstDay: string, days: number): string[] {
  const list: string[] = [];
  for (let index = 0; index < days; index += 1) {
    list.push(shiftDay(firstDay, index));
  }
  return list;
}

interface DayTotals {
  consumed: number;
  refunded: number;
  learningHub: number;
}

function emptyDayTotals(): DayTotals {
  return { consumed: 0, refunded: 0, learningHub: 0 };
}

/**
 * The credit summary of the window.
 *
 * Grants come from the administrative summary of the daily allowance, and
 * consumption and refunds come from the ledger. The two are read separately
 * because the grant view knows about the allowance while the ledger knows
 * about every credit, including the ones a subscription or a payment brought.
 */
export async function buildCreditSummary(days: number) {
  const supabase = getSupabaseServer();
  const today = cairoDayOf(new Date());
  const firstDay = shiftDay(today, -(days - 1));
  const windowStart = cairoDayStart(firstDay);

  const [grantsResult, ledgerResult, balanceResult] = await Promise.all([
    supabase
      .from('admin_daily_credit_summary')
      .select(
        'grant_day, accounts_granted, credits_granted, credits_remaining, accounts_with_credits'
      )
      .gte('grant_day', firstDay)
      .order('grant_day', { ascending: true }),
    supabase
      .from('ai_credit_ledger')
      .select('profile_id, amount, running_balance, operation, ai_action_type, created_at')
      .gte('created_at', windowStart.toISOString())
      .limit(MAX_SCAN_ROWS),
    // The newest ledger row of an account carries its balance, so the report
    // reads the ledger from the present backwards and keeps the first row it
    // sees for each account.
    supabase
      .from('ai_credit_ledger')
      .select('profile_id, running_balance, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_SCAN_ROWS),
  ]);

  if (grantsResult.error) throw grantsResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  if (balanceResult.error) throw balanceResult.error;

  const grantRows = (grantsResult.data ?? []) as DailyGrantRow[];
  const ledgerRows = (ledgerResult.data ?? []) as LedgerScanRow[];
  const balanceRows = (balanceResult.data ?? []) as BalanceScanRow[];

  const grantsByDay = new Map<string, DailyGrantRow>();
  for (const row of grantRows) {
    grantsByDay.set(row.grant_day, row);
  }

  const ledgerByDay = new Map<string, DayTotals>();
  const consumptionByAction = new Map<string, { credits: number; operations: number }>();
  let windowConsumed = 0;
  let windowRefunded = 0;
  let windowLearningHub = 0;

  for (const row of ledgerRows) {
    const day = cairoDayOf(new Date(row.created_at));
    if (!ledgerByDay.has(day)) ledgerByDay.set(day, emptyDayTotals());
    const totals = ledgerByDay.get(day)!;

    if (row.operation === 'consume') {
      // A consumption is stored as a negative amount, so the report reads the
      // size of the spend rather than its sign.
      const spent = Math.abs(row.amount);
      totals.consumed += spent;
      windowConsumed += spent;
      if (row.ai_action_type === LEARNING_HUB_ACTION) {
        totals.learningHub += spent;
        windowLearningHub += spent;
      }
      const action = row.ai_action_type ?? 'unlabelled';
      const bucket = consumptionByAction.get(action) ?? { credits: 0, operations: 0 };
      bucket.credits += spent;
      bucket.operations += 1;
      consumptionByAction.set(action, bucket);
    } else if (row.operation === 'refund') {
      const refunded = Math.abs(row.amount);
      totals.refunded += refunded;
      windowRefunded += refunded;
    }
  }

  const latestBalance = new Map<string, number>();
  for (const row of balanceRows) {
    if (!latestBalance.has(row.profile_id)) {
      latestBalance.set(row.profile_id, row.running_balance);
    }
  }
  let accountsWithBalance = 0;
  for (const balance of latestBalance.values()) {
    if (balance > 0) accountsWithBalance += 1;
  }

  const daily = windowDays(firstDay, days).map((day) => {
    const grant = grantsByDay.get(day);
    const totals = ledgerByDay.get(day) ?? emptyDayTotals();
    return {
      day,
      accountsGranted: grant?.accounts_granted ?? 0,
      creditsGranted: grant?.credits_granted ?? 0,
      creditsUnused: grant?.credits_remaining ?? 0,
      accountsWithCredits: grant?.accounts_with_credits ?? 0,
      creditsConsumed: totals.consumed,
      creditsRefunded: totals.refunded,
      learningHubConsumed: totals.learningHub,
    };
  });

  const todayRow = daily[daily.length - 1];

  return {
    success: true as const,
    window: {
      days,
      from: firstDay,
      to: today,
      timezone: CAIRO,
    },
    today: {
      day: todayRow.day,
      accountsGranted: todayRow.accountsGranted,
      creditsGranted: todayRow.creditsGranted,
      creditsUnused: todayRow.creditsUnused,
      creditsConsumed: todayRow.creditsConsumed,
      creditsRefunded: todayRow.creditsRefunded,
      learningHubConsumed: todayRow.learningHubConsumed,
    },
    totals: {
      accountsGranted: daily.reduce((sum, row) => sum + row.accountsGranted, 0),
      creditsGranted: daily.reduce((sum, row) => sum + row.creditsGranted, 0),
      creditsUnused: daily.reduce((sum, row) => sum + row.creditsUnused, 0),
      creditsConsumed: windowConsumed,
      creditsRefunded: windowRefunded,
      learningHubConsumed: windowLearningHub,
      learningHubShare:
        windowConsumed > 0 ? Number((windowLearningHub / windowConsumed).toFixed(4)) : 0,
      accountsWithBalance,
      accountsObserved: latestBalance.size,
      // A report that stopped at the cap cannot claim to have seen every
      // account, so it says that instead of quietly under-reporting.
      balanceScanTruncated: balanceRows.length >= MAX_SCAN_ROWS,
      ledgerScanTruncated: ledgerRows.length >= MAX_SCAN_ROWS,
    },
    daily,
    consumptionByAction: Array.from(consumptionByAction.entries())
      .map(([action, bucket]) => ({ action, credits: bucket.credits, operations: bucket.operations }))
      .sort((left, right) => right.credits - left.credits),
    learningHub: {
      actionType: LEARNING_HUB_ACTION,
      creditsConsumed: windowLearningHub,
      shareOfConsumption:
        windowConsumed > 0 ? Number((windowLearningHub / windowConsumed).toFixed(4)) : 0,
    },
  };
}

/**
 * The CV activity of the window.
 *
 * The CV table records the template a CV was made with, so the report can say
 * how many CVs were produced, which template tier they used, and what the CV
 * work cost in credits.
 */
export async function buildCvActivity(days: number) {
  const supabase = getSupabaseServer();
  const today = cairoDayOf(new Date());
  const firstDay = shiftDay(today, -(days - 1));
  const windowStart = cairoDayStart(firstDay);

  const [cvsResult, templatesResult, ledgerResult] = await Promise.all([
    supabase
      .from('cvs')
      .select('id, template_id, template_tier, created_at')
      .gte('created_at', windowStart.toISOString())
      .limit(MAX_SCAN_ROWS),
    supabase.from('cv_templates').select('template_id, name_en, name_ar, tier'),
    supabase
      .from('ai_credit_ledger')
      .select('amount, operation, ai_action_type, created_at')
      .gte('created_at', windowStart.toISOString())
      .in('ai_action_type', CV_ACTIONS as unknown as string[])
      .limit(MAX_SCAN_ROWS),
  ]);

  if (cvsResult.error) throw cvsResult.error;
  if (templatesResult.error) throw templatesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const cvRows = (cvsResult.data ?? []) as CvActivityRow[];
  const templateRows = (templatesResult.data ?? []) as CvTemplateRow[];
  const ledgerRows = (ledgerResult.data ?? []) as Array<{
    amount: number;
    operation: string;
    ai_action_type: string | null;
    created_at: string;
  }>;

  const templateNames = new Map<string, CvTemplateRow>();
  for (const row of templateRows) {
    templateNames.set(row.template_id, row);
  }

  const cvsByDay = new Map<string, { created: number; free: number; premium: number }>();
  const templateUsage = new Map<string, number>();
  let freeTemplates = 0;
  let premiumTemplates = 0;
  let withoutTemplate = 0;

  for (const row of cvRows) {
    const day = cairoDayOf(new Date(row.created_at));
    if (!cvsByDay.has(day)) cvsByDay.set(day, { created: 0, free: 0, premium: 0 });
    const totals = cvsByDay.get(day)!;
    totals.created += 1;
    if (row.template_tier === 'premium') {
      totals.premium += 1;
      premiumTemplates += 1;
    } else if (row.template_tier === 'free') {
      totals.free += 1;
      freeTemplates += 1;
    }
    const templateId = row.template_id ?? 'without-template';
    templateUsage.set(templateId, (templateUsage.get(templateId) ?? 0) + 1);
    if (!row.template_id) withoutTemplate += 1;
  }

  const cvCreditsByAction = new Map<string, { credits: number; operations: number }>();
  let cvCreditsConsumed = 0;
  for (const row of ledgerRows) {
    if (row.operation !== 'consume') continue;
    const spent = Math.abs(row.amount);
    cvCreditsConsumed += spent;
    const action = row.ai_action_type ?? 'unlabelled';
    const bucket = cvCreditsByAction.get(action) ?? { credits: 0, operations: 0 };
    bucket.credits += spent;
    bucket.operations += 1;
    cvCreditsByAction.set(action, bucket);
  }

  const daily = windowDays(firstDay, days).map((day) => {
    const totals = cvsByDay.get(day) ?? { created: 0, free: 0, premium: 0 };
    return {
      day,
      cvsCreated: totals.created,
      freeTemplates: totals.free,
      premiumTemplates: totals.premium,
    };
  });

  const topTemplates = Array.from(templateUsage.entries())
    .map(([templateId, count]) => {
      const template = templateNames.get(templateId);
      return {
        templateId,
        nameEn: template?.name_en ?? null,
        nameAr: template?.name_ar ?? null,
        tier: template?.tier ?? null,
        cvsCreated: count,
      };
    })
    .sort((left, right) => right.cvsCreated - left.cvsCreated)
    .slice(0, 10);

  return {
    success: true as const,
    window: {
      days,
      from: firstDay,
      to: today,
      timezone: CAIRO,
    },
    totals: {
      cvsCreated: cvRows.length,
      freeTemplates,
      premiumTemplates,
      withoutTemplate,
      cvCreditsConsumed,
      cvOperations: Array.from(cvCreditsByAction.values()).reduce(
        (sum, bucket) => sum + bucket.operations,
        0
      ),
    },
    daily,
    topTemplates,
    creditConsumption: Array.from(cvCreditsByAction.entries())
      .map(([action, bucket]) => ({ action, credits: bucket.credits, operations: bucket.operations }))
      .sort((left, right) => right.credits - left.credits),
  };
}

/**
 * The routes of the credit monitor.
 *
 * They are mounted by the application next to the other administrative
 * modules, and every one of them checks the caller's role and permission
 * before it reads anything.
 */
export function registerCreditMonitorRoutes(app: Express): void {
  app.get(
    '/api/admin/credits/summary',
    requireAuth,
    requireAdmin,
    requirePermission('credits.read'),
    async (req: AdminRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const days = readInteger(req.query.days, 14, 1, MAX_WINDOW_DAYS);
      if (days === null) {
        return res.status(400).json({ error: `days must be a whole number between 1 and ${MAX_WINDOW_DAYS}` });
      }
      try {
        return res.json(await buildCreditSummary(days));
      } catch (error) {
        console.error('Failed to load the AI credit summary:', error);
        return res.status(500).json({ error: 'Failed to load the AI credit summary' });
      }
    }
  );

  app.get(
    '/api/admin/credits/failures',
    requireAuth,
    requireAdmin,
    requirePermission('credits.read'),
    async (req: AdminRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const limit = readInteger(req.query.limit, 50, 1, MAX_PAGE_SIZE);
      if (limit === null) {
        return res.status(400).json({ error: `limit must be a whole number between 1 and ${MAX_PAGE_SIZE}` });
      }
      try {
        const { data, error } = await getSupabaseServer()
          .from('ai_credit_failures')
          .select(
            `
              id, profile_id, ai_action_type, credits_attempted, refunded,
              failure_reason, http_status, created_at,
              profiles:profile_id(full_name, username)
            `
          )
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) {
          // A deployment that has not been migrated yet still has a working
          // credit summary, so the panel reports an empty list instead of a
          // broken screen.
          console.error('Failed to load the failed credit operations:', error);
          return res.json({ success: true, failures: [], available: false });
        }
        const rows = (data ?? []) as Array<{
          id: string;
          profile_id: string;
          ai_action_type: string | null;
          credits_attempted: number | null;
          refunded: boolean | null;
          failure_reason: string | null;
          http_status: number | null;
          created_at: string;
          profiles: Array<{ full_name: string | null; username: string | null }> | null;
        }>;
        return res.json({
          success: true,
          available: true,
          failures: rows.map((row) => ({
            id: row.id,
            profileId: row.profile_id,
            candidateName: row.profiles?.[0]?.full_name ?? null,
            candidateUsername: row.profiles?.[0]?.username ?? null,
            aiActionType: row.ai_action_type,
            creditsAttempted: row.credits_attempted ?? 0,
            refunded: row.refunded === true,
            failureReason: row.failure_reason,
            httpStatus: row.http_status,
            createdAt: row.created_at,
          })),
        });
      } catch (error) {
        console.error('Failed to load the failed credit operations:', error);
        return res.status(500).json({ error: 'Failed to load the failed credit operations' });
      }
    }
  );

  app.get(
    '/api/admin/credits/ledger',
    requireAuth,
    requireAdmin,
    requirePermission('credits.read'),
    async (req: AdminRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const limit = readInteger(req.query.limit, 100, 1, MAX_PAGE_SIZE);
      const offset = readInteger(req.query.offset, 0, 0, MAX_SCAN_ROWS);
      if (limit === null || offset === null) {
        return res.status(400).json({ error: 'limit and offset must be whole numbers' });
      }
      const action = readText(req.query.action, 64);
      if (action && !AI_CREDIT_ACTIONS.includes(action as AICreditAction)) {
        return res.status(400).json({ error: 'Unknown AI action' });
      }
      const operation = readText(req.query.operation, 16);
      if (operation && !CREDIT_OPERATIONS.includes(operation as (typeof CREDIT_OPERATIONS)[number])) {
        return res.status(400).json({ error: 'Unknown credit operation' });
      }

      try {
        let query = getSupabaseServer()
          .from('ai_credit_ledger')
          .select(
            `
              id, profile_id, amount, running_balance, operation, source_type,
              ai_action_type, description, created_at,
              profiles:profile_id(full_name, username)
            `
          )
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (action) query = query.eq('ai_action_type', action);
        if (operation) query = query.eq('operation', operation);
        const { data, error } = await query;
        if (error) throw error;

        const rows = (data ?? []) as Array<{
          id: string;
          profile_id: string;
          amount: number;
          running_balance: number;
          operation: string;
          source_type: string;
          ai_action_type: string | null;
          description: string | null;
          created_at: string;
          profiles: Array<{ full_name: string | null; username: string | null }> | null;
        }>;
        return res.json({
          success: true,
          limit,
          offset,
          entries: rows.map((row) => ({
            id: row.id,
            profileId: row.profile_id,
            candidateName: row.profiles?.[0]?.full_name ?? null,
            candidateUsername: row.profiles?.[0]?.username ?? null,
            amount: row.amount,
            runningBalance: row.running_balance,
            operation: row.operation,
            sourceType: row.source_type,
            aiActionType: row.ai_action_type,
            description: row.description,
            createdAt: row.created_at,
          })),
        });
      } catch (error) {
        console.error('Failed to load the credit ledger:', error);
        return res.status(500).json({ error: 'Failed to load the credit ledger' });
      }
    }
  );

  app.get(
    '/api/admin/cv/activity',
    requireAuth,
    requireAdmin,
    // The CV screen is read by the roles that own the credit economy and the
    // ones that own the templates, so either permission opens it.
    requireAnyPermission(['credits.read', 'plans.manage']),
    async (req: AdminRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const days = readInteger(req.query.days, 14, 1, MAX_WINDOW_DAYS);
      if (days === null) {
        return res.status(400).json({ error: `days must be a whole number between 1 and ${MAX_WINDOW_DAYS}` });
      }
      try {
        return res.json(await buildCvActivity(days));
      } catch (error) {
        console.error('Failed to load the CV activity:', error);
        return res.status(500).json({ error: 'Failed to load the CV activity' });
      }
    }
  );
}
