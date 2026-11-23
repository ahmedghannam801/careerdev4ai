import { runtimeSecret } from '../runtimeEnv.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * The sender Resend accepts without a verified domain.
 *
 * `@resend.dev` is a shared testing sender: it only delivers to the address
 * that owns the Resend account. Every other recipient needs a domain that has
 * been verified in that account, which is what `RESEND_FROM` carries. The
 * default therefore keeps the connection test working before a domain exists,
 * and it is never silently wrong: `emailDeliveryStatus` reports when the
 * deployment is still on it.
 */
const DEFAULT_SENDER = 'Aionvia <onboarding@resend.dev>';

/** The same address test the server uses for every recipient it validates. */
export function isEmailAddress(value: string | undefined | null): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** A recipient as it should be sent, or `undefined` when it is not an address. */
export function normalizeRecipient(value: string | undefined | null): string | undefined {
  if (!isEmailAddress(value)) return undefined;
  return value.trim();
}

/**
 * The address this deployment sends from.
 *
 * A sender is written the way mail clients show it — `Aionvia <hello@aionvia.app>`
 * — or as a bare address. Anything that does not carry a usable address is
 * ignored in favour of the default rather than being handed to the provider,
 * because a malformed `From` makes every message fail.
 */
export function resolveSender(): string {
  const configured = runtimeSecret('RESEND_FROM');
  if (!configured || configured.length > 320) return DEFAULT_SENDER;
  const bracketed = /<([^>]+)>/.exec(configured)?.[1];
  const address = (bracketed ?? configured).trim();
  return isEmailAddress(address) ? configured.trim() : DEFAULT_SENDER;
}

/**
 * Whether this deployment can send mail, and from where.
 *
 * The admin screen asks before it offers the button: a missing key is a
 * configuration fact, not a delivery failure, and saying so up front is more
 * useful than a rejected request.
 */
export interface EmailDeliveryStatus {
  apiKeyConfigured: boolean;
  recipientConfigured: boolean;
  sender: string;
  /**
   * True while the deployment still sends from the shared testing address,
   * which only delivers to the Resend account owner.
   */
  senderIsSharedTestAddress: boolean;
}

export function emailDeliveryStatus(): EmailDeliveryStatus {
  const sender = resolveSender();
  return {
    apiKeyConfigured: Boolean(runtimeSecret('RESEND_API_KEY')),
    recipientConfigured: Boolean(normalizeRecipient(runtimeSecret('RESEND_TEST_RECIPIENT'))),
    sender,
    senderIsSharedTestAddress: sender === DEFAULT_SENDER,
  };
}

export function buildTestEmail(recipient: string) {
  const safeRecipient = recipient.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);

  return {
    from: resolveSender(),
    to: [recipient],
    subject: 'Aionvia — email delivery test',
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aionvia email test</title></head><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#20242b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e7e8eb;border-radius:12px"><tr><td style="padding:28px 32px 12px"><div style="font-size:20px;font-weight:700;letter-spacing:-.3px">Career<span style="color:#FF5A36">Ra</span></div></td></tr><tr><td style="padding:12px 32px 32px"><div style="display:inline-block;background:#fff0ec;color:#b63c22;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700">TEST MESSAGE</div><h1 style="font-size:24px;line-height:1.3;margin:20px 0 12px">Your email connection is working</h1><p style="font-size:15px;line-height:1.65;color:#505661;margin:0 0 14px">This is a test message from Aionvia to confirm the configured email delivery service can accept mail for <strong>${safeRecipient}</strong>.</p><p style="font-size:15px;line-height:1.65;color:#505661;margin:0">No action is required. This message contains no account changes, user-generated content, or links.</p><div style="height:3px;background:#FF5A36;border-radius:2px;margin-top:26px"></div></td></tr></table><p style="font-size:12px;color:#858b95;margin:14px 0 0">Aionvia · Automated delivery test</p></td></tr></table></body></html>`,
    text: `Aionvia — TEST MESSAGE\n\nYour email connection is working.\n\nThis is a test message from Aionvia to confirm the configured email delivery service can accept mail for ${recipient}. No action is required. This message contains no account changes, user-generated content, or links.\n\nAionvia · Automated delivery test`,
  };
}

export type ResendSendResult = { ok: true; id: string } | { ok: false; status: number | null };

/**
 * Values a caller may pass instead of the deployment's own.
 *
 * The connection script checks a key before it is stored anywhere, so at that
 * moment the key and the sender are not yet in the environment. Everything the
 * application sends uses the deployment's own configuration.
 */
export interface EmailSendOptions {
  sender?: string;
  apiKey?: string;
}

/** A message the platform wants delivered. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /**
   * Extra provider headers. Used for `List-Unsubscribe` on marketing mail and
   * for a stable `X-Aionvia-Category` that the provider dashboard can filter
   * on without exposing anything about the recipient.
   */
  headers?: Record<string, string>;
}

/**
 * Sends one message through Resend.
 *
 * The key is read from the request's own environment, so the credential stays
 * in the deployment. A failure is reported as a status rather than as the
 * provider's body: that body can echo the recipient and the account, and it
 * belongs in the provider's dashboard rather than in an API response.
 */
export async function sendEmail(
  message: EmailMessage,
  idempotencyKey: string,
  options: EmailSendOptions = {},
): Promise<ResendSendResult> {
  const apiKey = options.apiKey ?? runtimeSecret('RESEND_API_KEY');
  if (!apiKey) return { ok: false, status: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: options.sender ?? resolveSender(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers && Object.keys(message.headers).length > 0
          ? { headers: message.headers }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, status: response.status };
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('id' in payload) ||
        typeof payload.id !== 'string' || !/^[-a-zA-Z0-9_]+$/.test(payload.id)) {
      return { ok: false, status: response.status };
    }
    return { ok: true, id: payload.id };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTestEmail(recipient: string, idempotencyKey: string): Promise<ResendSendResult> {
  const message = buildTestEmail(recipient);
  return sendEmail(
    { to: recipient, subject: message.subject, html: message.html, text: message.text },
    idempotencyKey,
  );
}
