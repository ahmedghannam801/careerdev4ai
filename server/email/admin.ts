/**
 * Read models for the administrator email screen.
 *
 * Every figure comes from `email_queue` and `email_events`, which are written
 * by the queue and by the Resend webhook. Nothing here estimates, models or
 * invents a delivery statistic.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { getEmailDeliveryConfig, type EmailDeliveryConfig } from './config.ts';
import type { EmailQueueRow, EmailStatus } from './queue.ts';

export interface EmailStatusCounts {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  suppressed: number;
  blocked: number;
  bounced: number;
  complained: number;
}

export interface EmailEventCounts {
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
}

export interface EmailCampaignSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  audienceSummary: string | null;
  recipientCount: number;
  publishedAt: string | null;
  emailSentAt: string | null;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  blocked: number;
  bounced: number;
}

export interface EmailAdminOverview {
  config: EmailDeliveryConfig;
  counts: EmailStatusCounts;
  events: EmailEventCounts;
  last30Days: EmailEventCounts;
  campaigns: EmailCampaignSummary[];
  recent: EmailQueueRow[];
  recentEvents: Array<{
    id: string;
    eventType: string;
    recipient: string | null;
    providerMessageId: string | null;
    occurredAt: string;
  }>;
}

const STATUSES: EmailStatus[] = [
  'pending',
  'processing',
  'sent',
  'delivered',
  'failed',
  'dead_letter',
  'suppressed',
  'blocked',
  'bounced',
  'complained',
];

async function countStatus(status: EmailStatus): Promise<number> {
  const { count, error } = await getSupabaseServer()
    .from('email_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

function emptyEventCounts(): EmailEventCounts {
  return { delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0 };
}

function tallyEvents(rows: Array<{ event_type: string }>): EmailEventCounts {
  const counts = emptyEventCounts();
  for (const row of rows) {
    if (row.event_type === 'email.delivered') counts.delivered += 1;
    else if (row.event_type === 'email.bounced') counts.bounced += 1;
    else if (row.event_type === 'email.complained') counts.complained += 1;
    else if (row.event_type === 'email.opened') counts.opened += 1;
    else if (row.event_type === 'email.clicked') counts.clicked += 1;
  }
  return counts;
}

export async function getEmailAdminOverview(): Promise<EmailAdminOverview> {
  const supabase = getSupabaseServer();
  const [config, statusCounts] = await Promise.all([
    getEmailDeliveryConfig(),
    Promise.all(STATUSES.map((status) => countStatus(status))),
  ]);

  const byStatus = new Map<EmailStatus, number>();
  STATUSES.forEach((status, index) => byStatus.set(status, statusCounts[index]));

  const counts: EmailStatusCounts = {
    total: statusCounts.reduce((sum, value) => sum + value, 0),
    pending: byStatus.get('pending') ?? 0,
    processing: byStatus.get('processing') ?? 0,
    sent: byStatus.get('sent') ?? 0,
    delivered: byStatus.get('delivered') ?? 0,
    failed: byStatus.get('failed') ?? 0,
    deadLetter: byStatus.get('dead_letter') ?? 0,
    suppressed: byStatus.get('suppressed') ?? 0,
    blocked: byStatus.get('blocked') ?? 0,
    bounced: byStatus.get('bounced') ?? 0,
    complained: byStatus.get('complained') ?? 0,
  };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const [allEvents, recentEvents, recent] = await Promise.all([
    supabase.from('email_events').select('event_type').limit(20_000),
    supabase
      .from('email_events')
      .select('id, event_type, recipient, provider_message_id, occurred_at')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase
      .from('email_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // The all-time event figures are the same ledger, grouped in memory. The
  // table is bounded by real deliveries rather than by users, and the admin
  // screen asks for this once at a time.
  const events = tallyEvents((allEvents.data ?? []) as Array<{ event_type: string }>);
  const last30 = tallyEvents(
    (recentEvents.data ?? []) as Array<{ event_type: string }>,
  );

  const campaigns = await listEmailCampaigns();

  return {
    config,
    counts,
    events,
    last30Days: last30,
    campaigns,
    recent: (recent.data ?? []) as EmailQueueRow[],
    recentEvents: ((recentEvents.data ?? []) as Array<{
      id: string;
      event_type: string;
      recipient: string | null;
      provider_message_id: string | null;
      occurred_at: string;
    }>).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      recipient: row.recipient,
      providerMessageId: row.provider_message_id,
      occurredAt: row.occurred_at,
    })),
  };
}

export async function listEmailCampaigns(): Promise<EmailCampaignSummary[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('announcements')
    .select(
      'id, title, status, priority, audience_summary, recipient_count, published_at, email_sent_at',
    )
    .eq('email_enabled', true)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    audience_summary: string | null;
    recipient_count: number;
    published_at: string | null;
    email_sent_at: string | null;
  }>;
  if (rows.length === 0) return [];

  const { data: queueRows, error: queueError } = await supabase
    .from('email_queue')
    .select('announcement_id, status')
    .in(
      'announcement_id',
      rows.map((row) => row.id),
    )
    .limit(20_000);
  if (queueError) throw queueError;

  const tally = new Map<string, Record<string, number>>();
  for (const row of (queueRows ?? []) as Array<{ announcement_id: string; status: string }>) {
    const key = row.announcement_id;
    const current = tally.get(key) ?? {};
    current[row.status] = (current[row.status] ?? 0) + 1;
    tally.set(key, current);
  }

  return rows.map((row) => {
    const counts = tally.get(row.id) ?? {};
    const sent = counts.sent ?? 0;
    const delivered = counts.delivered ?? 0;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      audienceSummary: row.audience_summary,
      recipientCount: row.recipient_count ?? 0,
      publishedAt: row.published_at,
      emailSentAt: row.email_sent_at,
      queued: Object.values(counts).reduce((sum, value) => sum + value, 0),
      sent,
      delivered,
      failed: (counts.failed ?? 0) + (counts.dead_letter ?? 0),
      blocked: counts.blocked ?? 0,
      bounced: (counts.bounced ?? 0) + (counts.complained ?? 0),
    };
  });
}

export interface EmailLogFilters {
  status?: EmailStatus;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listEmailLogs(filters: EmailLogFilters = {}): Promise<EmailQueueRow[]> {
  let request = getSupabaseServer()
    .from('email_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .range(
      Math.max(0, filters.offset ?? 0),
      Math.max(0, filters.offset ?? 0) + Math.max(1, Math.min(200, filters.limit ?? 50)) - 1,
    );
  if (filters.status && STATUSES.includes(filters.status)) request = request.eq('status', filters.status);
  if (filters.category) request = request.eq('category', filters.category);
  if (filters.search) {
    const term = filters.search.replace(/[%_,()]/g, ' ').trim();
    if (term) request = request.or(`recipient.ilike.%${term}%,template.ilike.%${term}%`);
  }
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as EmailQueueRow[];
}

export async function getEmailLog(id: string): Promise<{
  email: EmailQueueRow | null;
  events: Array<Record<string, unknown>>;
}> {
  const supabase = getSupabaseServer();
  const [{ data: email, error }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('email_queue').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('email_events')
      .select('id, event_type, recipient, provider_message_id, occurred_at, created_at')
      .eq('email_queue_id', id)
      .order('occurred_at', { ascending: true }),
  ]);
  if (error) throw error;
  if (eventsError) throw eventsError;
  return {
    email: (email as EmailQueueRow | null) ?? null,
    events: (events ?? []) as Array<Record<string, unknown>>,
  };
}

/** The label shown on the admin chart for each stored status. */
export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Sending',
  sent: 'Accepted',
  delivered: 'Delivered',
  failed: 'Retrying',
  dead_letter: 'Failed',
  suppressed: 'Suppressed',
  blocked: 'Blocked',
  bounced: 'Bounced',
  complained: 'Complaint',
};
