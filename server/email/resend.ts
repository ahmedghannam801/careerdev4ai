import { runtimeSecret } from '../runtimeEnv.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SENDER = 'CareerDev4AI <onboarding@resend.dev>';

export function buildTestEmail(recipient: string) {
  const safeRecipient = recipient.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);

  return {
    from: SENDER,
    to: [recipient],
    subject: 'CareerDev4AI — email delivery test',
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CareerDev4AI email test</title></head><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#20242b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e7e8eb;border-radius:12px"><tr><td style="padding:28px 32px 12px"><div style="font-size:20px;font-weight:700;letter-spacing:-.3px">CareerDev<span style="color:#FF5A36">4AI</span></div></td></tr><tr><td style="padding:12px 32px 32px"><div style="display:inline-block;background:#fff0ec;color:#b63c22;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700">TEST MESSAGE</div><h1 style="font-size:24px;line-height:1.3;margin:20px 0 12px">Your email connection is working</h1><p style="font-size:15px;line-height:1.65;color:#505661;margin:0 0 14px">This is a test message from CareerDev4AI to confirm the configured email delivery service can accept mail for <strong>${safeRecipient}</strong>.</p><p style="font-size:15px;line-height:1.65;color:#505661;margin:0">No action is required. This message contains no account changes, user-generated content, or links.</p><div style="height:3px;background:#FF5A36;border-radius:2px;margin-top:26px"></div></td></tr></table><p style="font-size:12px;color:#858b95;margin:14px 0 0">CareerDev4AI · Automated delivery test</p></td></tr></table></body></html>`,
    text: `CareerDev4AI — TEST MESSAGE\n\nYour email connection is working.\n\nThis is a test message from CareerDev4AI to confirm the configured email delivery service can accept mail for ${recipient}. No action is required. This message contains no account changes, user-generated content, or links.\n\nCareerDev4AI · Automated delivery test`,
  };
}

export type ResendSendResult = { ok: true; id: string } | { ok: false; status: number | null };

export async function sendTestEmail(recipient: string, idempotencyKey: string): Promise<ResendSendResult> {
  const apiKey = runtimeSecret('RESEND_API_KEY');
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
      body: JSON.stringify(buildTestEmail(recipient)),
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
