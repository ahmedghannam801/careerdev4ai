/**
 * Resend webhooks.
 *
 * Resend signs each delivery with Svix. The signature covers the exact bytes
 * of the request, the Svix message id and the timestamp, so the body is
 * verified before it is parsed. A delivery older than five minutes is refused:
 * a captured request must not be replayable.
 *
 * The ledger is written from the provider's own events. Nothing in the admin
 * dashboard invents a delivery figure; it counts these rows.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { suppressEmail } from './preferences.ts';

const MAX_SKEW_MS = 5 * 60_000;

interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function readHeaders(headers: Record<string, unknown>): WebhookHeaders {
  const get = (name: string): string | null => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return typeof value === 'string' ? value : null;
  };
  return {
    id: get('svix-id'),
    timestamp: get('svix-timestamp'),
    signature: get('svix-signature'),
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/**
 * Verifies a Svix signature. The secret is `whsec_<base64>`.
 *
 * The header may carry several signatures (`v1,<a> v1,<b>`) during a secret
 * rotation, so every candidate is checked. One match is enough.
 */
export async function verifyResendSignature(
  rawBody: string,
  headers: Record<string, unknown>,
  secret: string,
): Promise<boolean> {
  const { id, timestamp, signature } = readHeaders(headers);
  if (!id || !timestamp || !signature) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    return false;
  }

  const secretBytes = secret.startsWith('whsec_')
    ? base64ToBytes(secret.slice('whsec_'.length))
    : new TextEncoder().encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  );
  const expected = new Uint8Array(signed);

  for (const part of signature.split(/\s+/)) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    try {
      if (timingSafeEqual(expected, base64ToBytes(value))) return true;
    } catch {
      // A signature that is not valid base64 is simply not a match.
    }
  }
  return false;
}

export interface WebhookOutcome {
  received: true;
  handled: string;
  duplicate: boolean;
  queueId: string | null;
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    created_at?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    [key: string]: unknown;
  };
}

function eventTime(event: ResendEvent): string {
  const created = event.created_at ?? event.data?.created_at;
  if (typeof created === 'string') {
    const date = new Date(created);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function recipientOf(event: ResendEvent): string {
  const to = event.data?.to;
  if (Array.isArray(to)) return String(to[0] ?? '');
  return typeof to === 'string' ? to : '';
}

/** Handles one verified event. */
export async function handleResendEvent(
  event: ResendEvent,
  providerEventId: string | null,
): Promise<WebhookOutcome> {
  const type = typeof event.type === 'string' ? event.type : '';
  const messageId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
  const recipient = recipientOf(event);
  const occurredAt = eventTime(event);
  const supabase = getSupabaseServer();

  interface QueueLookup {
    id: string;
    status: string;
    recipient: string;
    category: string;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
  }
  let queueRow: QueueLookup | null = null;

  if (messageId) {
    const { data, error } = await supabase
      .from('email_queue')
      .select('id, status, recipient, category, delivered_at, opened_at, clicked_at')
      .eq('provider_message_id', messageId)
      .maybeSingle();
    if (!error) queueRow = data as QueueLookup | null;
  }

  // Write the ledger first. The unique indexes make a repeated webhook a
  // no-op rather than a second row.
  const { error: eventError } = await supabase.from('email_events').insert({
    email_queue_id: queueRow?.id ?? null,
    provider_message_id: messageId,
    recipient: recipient || queueRow?.recipient || null,
    event_type: type || 'unknown',
    provider_event_id: providerEventId,
    payload: event as unknown as Record<string, unknown>,
    occurred_at: occurredAt,
  });

  if (eventError) {
    if (eventError.code === '23505') {
      return { received: true, handled: type, duplicate: true, queueId: queueRow?.id ?? null };
    }
    throw eventError;
  }

  if (!queueRow) {
    return { received: true, handled: type, duplicate: false, queueId: null };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  switch (type) {
    case 'email.sent':
      if (queueRow.status === 'processing' || queueRow.status === 'pending') {
        patch.status = 'sent';
        patch.sent_at = occurredAt;
      }
      break;
    case 'email.delivered':
      patch.status = 'delivered';
      patch.delivered_at = queueRow.delivered_at ?? occurredAt;
      break;
    case 'email.opened':
      patch.opened_at = queueRow.opened_at ?? occurredAt;
      break;
    case 'email.clicked':
      patch.clicked_at = queueRow.clicked_at ?? occurredAt;
      if (!queueRow.opened_at) patch.opened_at = occurredAt;
      break;
    case 'email.bounced': {
      patch.status = 'bounced';
      patch.bounced_at = occurredAt;
      const bounceType = event.data?.bounce?.type;
      patch.last_error = `The provider reported a bounce (${String(bounceType ?? 'unknown')}).`;
      break;
    }
    case 'email.complained':
      patch.status = 'complained';
      patch.complained_at = occurredAt;
      patch.last_error = 'The recipient marked the message as spam.';
      break;
    case 'email.failed':
      patch.status = 'failed';
      patch.last_error = 'The provider reported a delivery failure.';
      break;
    default:
      break;
  }

  if (Object.keys(patch).length > 1) {
    const { error } = await supabase.from('email_queue').update(patch).eq('id', queueRow.id);
    if (error) throw error;
  }

  // A hard bounce or a complaint is never retried, and the address is not
  // mailed again. Transactional mail is included: an address that bounces does
  // not become deliverable because the message was a receipt.
  if (type === 'email.bounced' || type === 'email.complained') {
    const email = recipient || queueRow.recipient;
    await suppressEmail(email, type === 'email.bounced' ? 'bounce' : 'complaint', 'resend_webhook', {
      providerMessageId: messageId,
      providerEventId,
      bounce: event.data?.bounce ?? null,
    });
  }

  return { received: true, handled: type, duplicate: false, queueId: queueRow.id };
}
