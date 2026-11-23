/**
 * The persistent email queue.
 *
 * A message is a row before it is a request. The row records the recipient,
 * the template, the payload, the attempt count, the next time it may be tried
 * and — once the provider accepts it — the provider's own message id. The
 * worker can die, redeploy or be replaced; the row remains.
 *
 * The ordering rules that make this safe:
 *
 *   1. Write first, send second. Nothing is sent that is not recorded.
 *   2. Claim atomically. `claim_due_emails` uses FOR UPDATE SKIP LOCKED, so two
 *      sweeps cannot send the same row.
 *   3. Idempotency. Every row has a stable key that is also sent to Resend, so
 *      a retry after an ambiguous network failure is deduplicated upstream.
 *   4. Backoff. A failure is retried with exponential delay, not in a loop.
 *   5. Dead letters. A row that has used its attempts stops and stays visible.
 *   6. Suppression. Bounces, complaints and unsubscribes are checked before a
 *      request is made.
 *   7. Domain gate. Without a verified sending domain, only the Resend account
 *      owner can receive mail. Other rows are parked as `blocked` instead of
 *      being sent to fail.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { getEmailDeliveryConfig, canDeliverTo, type EmailDeliveryConfig } from './config.ts';
import { sendEmail } from './resend.ts';
import { renderEmail, type EmailPayload, type EmailTemplateId } from './templates.ts';
import {
  getEmailPreferences,
  maySendCategory,
  preferencesUrl,
  unsubscribeUrl,
  type EmailPreferencesRow,
} from './preferences.ts';

export type EmailStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'dead_letter'
  | 'suppressed'
  | 'blocked'
  | 'bounced'
  | 'complained';

export interface EmailQueueRow {
  id: string;
  user_id: string | null;
  recipient: string;
  template: string;
  category: string;
  payload: EmailPayload;
  idempotency_key: string;
  status: EmailStatus;
  attempt: number;
  max_attempts: number;
  scheduled_for: string;
  next_attempt_at: string;
  locked_at: string | null;
  lock_expires_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  announcement_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueEmailInput {
  userId: string;
  template: EmailTemplateId;
  category: string;
  payload?: EmailPayload;
  idempotencyKey: string;
  scheduledFor?: string;
  announcementId?: string | null;
}

export interface ProcessEmailSummary {
  configured: boolean;
  productionReady: boolean;
  claimed: number;
  sent: number;
  suppressed: number;
  blocked: number;
  retried: number;
  deadLettered: number;
  failed: number;
  reason: string | null;
}

const EMPTY_SUMMARY: ProcessEmailSummary = {
  configured: false,
  productionReady: false,
  claimed: 0,
  sent: 0,
  suppressed: 0,
  blocked: 0,
  retried: 0,
  deadLettered: 0,
  failed: 0,
  reason: null,
};

function backoffSeconds(attempt: number): number {
  // 1m, 2m, 4m, 8m, 16m, then 30m. The cap keeps a permanently broken row
  // from disappearing for a day without hammering the provider.
  return Math.min(30 * 60, 60 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Enqueues one message for one account.
 *
 * The recipient comes from `auth.users` inside the database function, never
 * from a caller. A repeated key returns the existing row, so an event handler
 * that runs twice does not send twice.
 */
export async function enqueueEmailForUser(input: EnqueueEmailInput): Promise<string | null> {
  const { data, error } = await getSupabaseServer().rpc('enqueue_email_for_user', {
    p_user_id: input.userId,
    p_template: input.template,
    p_category: input.category,
    p_payload: input.payload ?? {},
    p_idempotency_key: input.idempotencyKey,
    p_scheduled_for: input.scheduledFor ?? new Date().toISOString(),
    p_announcement_id: input.announcementId ?? null,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Enqueues the emails of a published announcement through one SQL statement. */
export async function enqueueAnnouncementEmails(announcementId: string): Promise<number> {
  const { data, error } = await getSupabaseServer().rpc('enqueue_announcement_emails', {
    p_announcement_id: announcementId,
  });
  if (error) throw error;
  const count = Number(data ?? 0);
  if (count > 0) {
    await getSupabaseServer().rpc('mark_announcement_email_queued', {
      p_announcement_id: announcementId,
    });
  }
  return count;
}

/** Claims up to `limit` due rows atomically. */
async function claimDue(limit: number): Promise<EmailQueueRow[]> {
  const { data, error } = await getSupabaseServer().rpc('claim_due_emails', {
    p_limit: Math.max(1, Math.min(100, limit)),
  });
  if (error) throw error;
  return (data ?? []) as EmailQueueRow[];
}

async function markRow(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('email_queue')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function recordEvent(input: {
  queueId: string;
  providerMessageId: string | null;
  recipient: string;
  eventType: string;
  providerEventId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('email_events')
    .insert({
      email_queue_id: input.queueId,
      provider_message_id: input.providerMessageId,
      recipient: input.recipient,
      event_type: input.eventType,
      provider_event_id: input.providerEventId ?? null,
      payload: input.payload ?? {},
      occurred_at: new Date().toISOString(),
    });
  // A duplicate webhook (same event id) is not a failure. A different error is
  // logged, because the delivery itself already happened and must not be
  // retried on account of the ledger.
  if (error && error.code !== '23505') {
    console.error('Could not record an email event:', error.message);
  }
}

interface RecipientContext {
  preferences: EmailPreferencesRow | null;
  name: string;
  locale: 'en' | 'ar';
}

async function loadContexts(rows: EmailQueueRow[]): Promise<Map<string, RecipientContext>> {
  const supabase = getSupabaseServer();
  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
  );
  const result = new Map<string, RecipientContext>();
  if (userIds.length === 0) return result;

  const [preferencesResult, profileResult, userPreferencesResult] = await Promise.all([
    supabase.from('email_preferences').select('*').in('user_id', userIds),
    supabase.from('profiles').select('id, preferred_name, full_name').in('id', userIds),
    supabase.from('user_preferences').select('user_id, language').in('user_id', userIds),
  ]);

  const preferences = new Map<string, EmailPreferencesRow>();
  if (!preferencesResult.error) {
    for (const row of (preferencesResult.data ?? []) as EmailPreferencesRow[]) {
      preferences.set(row.user_id, row);
    }
  }
  const names = new Map<string, string>();
  if (!profileResult.error) {
    for (const row of (profileResult.data ?? []) as Array<{
      id: string;
      preferred_name: string | null;
      full_name: string | null;
    }>) {
      names.set(row.id, (row.preferred_name ?? row.full_name ?? '').trim());
    }
  }
  const locales = new Map<string, 'en' | 'ar'>();
  if (!userPreferencesResult.error) {
    for (const row of (userPreferencesResult.data ?? []) as Array<{
      user_id: string;
      language: string | null;
    }>) {
      locales.set(row.user_id, row.language === 'ar' ? 'ar' : 'en');
    }
  }

  for (const userId of userIds) {
    result.set(userId, {
      preferences: preferences.get(userId) ?? null,
      name: names.get(userId) ?? '',
      locale: locales.get(userId) ?? 'en',
    });
  }
  return result;
}

async function suppressedRecipients(recipients: string[]): Promise<Set<string>> {
  if (recipients.length === 0) return new Set();
  const { data, error } = await getSupabaseServer()
    .from('email_suppressions')
    .select('email')
    .in('email', recipients);
  if (error) {
    // A suppression read that fails must not turn into a send. Treat every
    // recipient as suppressed for this pass; the next pass will retry.
    console.error('Could not read email suppressions:', error.message);
    return new Set(recipients);
  }
  return new Set(((data ?? []) as Array<{ email: string }>).map((row) => row.email.toLowerCase()));
}

function headersFor(transactional: boolean, token: string | undefined, category: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Aionvia-Category': category.slice(0, 60),
  };
  if (!transactional && token) {
    const url = unsubscribeUrl(token);
    headers['List-Unsubscribe'] = `<${url}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return headers;
}

/**
 * Processes one batch.
 *
 * The provider configuration is read once for the batch. When the deployment
 * cannot deliver to a recipient, the row is parked as `blocked` and says why:
 * it is visible in the admin screen and can be retried after the domain is
 * verified. It is not sent, and it is not silently dropped.
 */
export async function processEmailQueue(options: { limit?: number } = {}): Promise<ProcessEmailSummary> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  let config: EmailDeliveryConfig;
  try {
    config = await getEmailDeliveryConfig();
  } catch (error) {
    return {
      ...EMPTY_SUMMARY,
      reason: error instanceof Error ? error.message : 'The email configuration could not be read.',
    };
  }

  if (!config.apiKeyConfigured) {
    return {
      ...EMPTY_SUMMARY,
      reason: config.reason ?? 'RESEND_API_KEY is not configured.',
    };
  }

  // A provider outage on the domain check is not a reason to send. The rows
  // stay pending for the next sweep (the claim is not attempted).
  if (config.reason?.includes('Sends are paused')) {
    return {
      ...EMPTY_SUMMARY,
      configured: true,
      reason: config.reason,
    };
  }

  const summary: ProcessEmailSummary = {
    ...EMPTY_SUMMARY,
    configured: true,
    productionReady: config.productionReady,
    reason: config.reason,
  };

  const rows = await claimDue(limit);
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  const contexts = await loadContexts(rows);
  const suppressed = await suppressedRecipients(rows.map((row) => row.recipient.toLowerCase()));

  for (const row of rows) {
    const context = row.user_id ? contexts.get(row.user_id) : undefined;
    const preferences = context?.preferences ?? (row.user_id ? await getEmailPreferences(row.user_id) : null);

    if (!row.recipient || !row.recipient.includes('@')) {
      await markRow(row.id, {
        status: 'dead_letter',
        last_error: 'The recipient address is not usable.',
        lock_expires_at: null,
      });
      summary.deadLettered += 1;
      continue;
    }

    if (suppressed.has(row.recipient.toLowerCase())) {
      await markRow(row.id, {
        status: 'suppressed',
        last_error: 'The address is suppressed after a bounce, complaint or unsubscribe.',
        lock_expires_at: null,
      });
      summary.suppressed += 1;
      continue;
    }

    if (row.user_id && preferences && !maySendCategory(preferences, row.category)) {
      await markRow(row.id, {
        status: 'suppressed',
        last_error: `The account has turned off ${row.category} email.`,
        lock_expires_at: null,
      });
      summary.suppressed += 1;
      continue;
    }

    if (!canDeliverTo(config, row.recipient)) {
      await markRow(row.id, {
        status: 'blocked',
        last_error:
          config.reason ??
          'The sending domain is not verified, so this recipient cannot receive mail yet.',
        next_attempt_at: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
        lock_expires_at: null,
      });
      summary.blocked += 1;
      continue;
    }

    const locale = context?.locale ?? 'en';
    const name = context?.name ?? '';
    const transactional = row.category === 'transactional' || row.category === 'security' || row.category === 'billing_receipt';
    const token = preferences?.unsubscribe_token;
    const rendered = renderEmail({
      template: row.template,
      payload: { name, ...(row.payload ?? {}) },
      locale,
      preferencesUrl: preferencesUrl(),
      unsubscribeUrl: !transactional && token ? unsubscribeUrl(token) : undefined,
      transactional,
    });

    const result = await sendEmail(
      {
        to: row.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: headersFor(transactional, token, row.category),
      },
      row.idempotency_key,
    );

    if (result.ok) {
      const now = new Date().toISOString();
      await markRow(row.id, {
        status: 'sent',
        provider_message_id: result.id,
        sent_at: now,
        last_error: null,
        lock_expires_at: null,
      });
      await recordEvent({
        queueId: row.id,
        providerMessageId: result.id,
        recipient: row.recipient,
        eventType: 'sent',
        payload: { subject: rendered.subject, category: row.category },
      });
      summary.sent += 1;
      continue;
    }

    const status = result.status;
    if (status === 429) {
      await markRow(row.id, {
        status: 'pending',
        last_error: 'The provider rate limit was reached; the message will be retried.',
        next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        lock_expires_at: null,
      });
      summary.retried += 1;
      continue;
    }

    if (status === 401 || status === 403) {
      await markRow(row.id, {
        status: 'blocked',
        last_error:
          status === 401
            ? 'The provider rejected the API key. Fix RESEND_API_KEY and retry.'
            : (config.reason ?? 'The provider refused the sender or domain. Verify the domain and retry.'),
        lock_expires_at: null,
      });
      summary.blocked += 1;
      continue;
    }

    const attemptsExhausted = row.attempt >= row.max_attempts;
    const lastError =
      status === null
        ? 'The request did not reach the provider.'
        : `The provider refused the message (HTTP ${status}).`;

    if (attemptsExhausted) {
      await markRow(row.id, {
        status: 'dead_letter',
        last_error: lastError,
        lock_expires_at: null,
      });
      summary.deadLettered += 1;
    } else {
      await markRow(row.id, {
        status: 'failed',
        last_error: lastError,
        next_attempt_at: new Date(Date.now() + backoffSeconds(row.attempt) * 1000).toISOString(),
        lock_expires_at: null,
      });
      summary.failed += 1;
    }
  }

  return summary;
}

/** Puts an eligible row back in the queue. */
export async function retryEmail(id: string): Promise<EmailQueueRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('email_queue')
    .update({
      status: 'pending',
      attempt: 0,
      next_attempt_at: new Date().toISOString(),
      scheduled_for: new Date().toISOString(),
      locked_at: null,
      lock_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['failed', 'dead_letter', 'blocked', 'bounced', 'complained', 'sent', 'delivered'])
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as EmailQueueRow | null) ?? null;
}

/** Returns a queue row to the pending state after an operator fixed a config. */
export async function releaseBlockedEmails(): Promise<number> {
  const { data, error } = await getSupabaseServer()
    .from('email_queue')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'blocked')
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}
