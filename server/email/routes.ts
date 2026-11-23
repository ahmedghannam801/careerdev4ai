/**
 * The HTTP surface of the email system.
 *
 *   User
 *     GET   /api/email/preferences          read the signed-in account's choices
 *     PATCH /api/email/preferences          apply a change immediately
 *     GET   /api/email/unsubscribe?token=   one-click unsubscribe (HTML)
 *     POST  /api/email/unsubscribe          the same, for a form or JSON client
 *
 *   Provider
 *     POST  /api/email/webhook              Resend (Svix signature verified)
 *
 *   Administration (permission-checked)
 *     GET   /api/admin/email/overview
 *     GET   /api/admin/email/logs
 *     GET   /api/admin/email/logs/:id
 *     POST  /api/admin/email/:id/retry
 *     POST  /api/admin/email/process
 *     POST  /api/admin/email/digests
 *     POST  /api/admin/email/release-blocked
 *     POST  /api/admin/email/preview
 *     POST  /api/admin/email/domain
 *     POST  /api/admin/email/domain/:id/verify
 *     GET   /api/admin/email/suppressions
 *
 * The unsubscribe routes are the only public ones. They accept the opaque
 * token from the message and nothing else; they cannot be used to enumerate
 * accounts.
 */

import type { Express, Request, Response } from 'express';
import { requireAuth } from '../auth/require-auth.ts';
import { requireAdmin, requireAnyPermission, requirePermission } from '../admin/permissions.ts';
import { logAdminAction, AdminError } from '../db/admin.ts';
import { runtimeSecret } from '../runtimeEnv.ts';
import { createResendDomain, getEmailDeliveryConfig, verifyResendDomain } from './config.ts';
import {
  getEmailPreferences,
  findPreferencesByToken,
  toPreferencesDTO,
  updateEmailPreferences,
  type EmailPreferenceKey,
} from './preferences.ts';
import {
  processEmailQueue,
  releaseBlockedEmails,
  retryEmail,
  enqueueAnnouncementEmails,
  type EmailStatus,
} from './queue.ts';
import { enqueueDueDigests } from './digest.ts';
import { getEmailAdminOverview, getEmailLog, listEmailLogs } from './admin.ts';
import { handleResendEvent, verifyResendSignature } from './webhook.ts';
import { renderEmail, type EmailLocale, type EmailTemplateId } from './templates.ts';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function emailRateLimit() {
  // A small in-process guard on the public unsubscribe route. It prevents a
  // script from walking guessed tokens without turning a legitimate retry
  // into a lockout.
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: () => void) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > 30) {
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
    return next();
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unsubscribePage(input: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  status: number;
}): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)} · Aionvia</title>
  <style>
    :root{color-scheme:light}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#20242b;padding:24px;box-sizing:border-box}
    .card{width:100%;max-width:520px;background:#fff;border:1px solid #e7e8eb;border-radius:16px;padding:32px 28px;box-sizing:border-box}
    .brand{font-size:20px;font-weight:800;letter-spacing:-.4px}
    .brand span{color:#FF5A36}
    .bar{height:3px;width:44px;background:#FF5A36;border-radius:2px;margin:16px 0 24px}
    h1{font-size:24px;line-height:1.3;margin:0 0 12px}
    p{font-size:15px;line-height:1.7;color:#5b6270;margin:0 0 16px}
    a.button{display:inline-block;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 20px;border-radius:10px}
    .muted{font-size:12px;color:#9aa0aa;margin-top:22px}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">Aion<span>via</span></div>
    <div class="bar"></div>
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.body)}</p>
    ${input.action ? `<a class="button" href="${escapeHtml(input.action.href)}">${escapeHtml(input.action.label)}</a>` : ''}
    <p class="muted">Aionvia · Email preferences</p>
  </main>
</body>
</html>`;
}

export function registerEmailRoutes(app: Express): void {
  /* ------------------------------ User settings ---------------------------- */

  app.get('/api/email/preferences', requireAuth, async (req: Request, res: Response) => {
    try {
      const row = await getEmailPreferences(req.authUser!.id);
      if (!row) return res.status(404).json({ error: 'Email preferences not found' });
      return res.json({ success: true, preferences: toPreferencesDTO(row) });
    } catch (error) {
      console.error('Failed to read email preferences:', error);
      return res.status(500).json({ error: 'Failed to read email preferences' });
    }
  });

  const PREFERENCE_KEYS: EmailPreferenceKey[] = [
    'emailEnabled',
    'securityAlerts',
    'billingUpdates',
    'applicationUpdates',
    'interviewUpdates',
    'roadmapUpdates',
    'jobAlerts',
    'opportunityAlerts',
    'learningUpdates',
    'volunteeringUpdates',
    'projectUpdates',
    'assessmentUpdates',
    'careerRecommendations',
    'announcements',
    'dailyDigest',
    'weeklyDigest',
  ];

  app.patch('/api/email/preferences', requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const updates: Partial<Record<EmailPreferenceKey, boolean>> = {};
      for (const key of PREFERENCE_KEYS) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'boolean') {
          return res.status(400).json({ error: `${key} must be true or false` });
        }
        updates[key] = body[key];
      }

      let digestHour: number | undefined;
      if (body.digestHour !== undefined) {
        if (
          typeof body.digestHour !== 'number' ||
          !Number.isInteger(body.digestHour) ||
          body.digestHour < 0 ||
          body.digestHour > 23
        ) {
          return res.status(400).json({ error: 'digestHour must be a whole hour between 0 and 23' });
        }
        digestHour = body.digestHour;
      }

      let unsubscribeAll: boolean | undefined;
      if (body.unsubscribeAll !== undefined) {
        if (typeof body.unsubscribeAll !== 'boolean') {
          return res.status(400).json({ error: 'unsubscribeAll must be true or false' });
        }
        unsubscribeAll = body.unsubscribeAll;
      }

      if (Object.keys(updates).length === 0 && digestHour === undefined && unsubscribeAll === undefined) {
        return res.status(400).json({ error: 'No preferences to update' });
      }

      const row = await updateEmailPreferences(
        req.authUser!.id,
        { ...updates, ...(digestHour !== undefined ? { digestHour } : {}), ...(unsubscribeAll !== undefined ? { unsubscribeAll } : {}) },
        'settings',
      );
      return res.json({ success: true, preferences: toPreferencesDTO(row) });
    } catch (error) {
      console.error('Failed to save email preferences:', error);
      return res.status(500).json({ error: 'Failed to save email preferences' });
    }
  });

  /* ------------------------------ Unsubscribe ------------------------------ */

  const unsubscribeLimiter = emailRateLimit();

  const unsubscribe = async (
    token: string,
    wantsHtml: boolean,
    res: Response,
  ): Promise<Response> => {
    const row = await findPreferencesByToken(token);
    if (!row) {
      if (wantsHtml) {
        return res.status(404).type('html').send(
          unsubscribePage({
            title: 'This unsubscribe link is not valid',
            body: 'The link may have been shortened or expired. You can change every email setting from your Aionvia account instead.',
            action: { href: 'https://aionvia.pages.dev/#/settings?tab=notifications', label: 'Open email settings' },
            status: 404,
          }),
        );
      }
      return res.status(404).json({ error: 'This unsubscribe link is not valid' });
    }

    const updated = await updateEmailPreferences(row.user_id, { unsubscribeAll: true }, 'unsubscribe-link');
    if (wantsHtml) {
      return res.status(200).type('html').send(
        unsubscribePage({
          title: 'You are unsubscribed',
          body: 'You will no longer receive opportunity, digest or announcement emails. Account, security and payment emails will still be sent because they are part of your account. You can turn any category back on in settings.',
          action: { href: 'https://aionvia.pages.dev/#/settings?tab=notifications', label: 'Manage email settings' },
          status: 200,
        }),
      );
    }
    return res.json({ success: true, unsubscribedAll: updated.unsubscribed_all });
  };

  app.get('/api/email/unsubscribe', unsubscribeLimiter, async (req: Request, res: Response) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      return await unsubscribe(token, true, res);
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return res.status(500).type('html').send(
        unsubscribePage({
          title: 'The request could not be completed',
          body: 'Please try the link again in a moment, or change your email settings from your account.',
          action: { href: 'https://aionvia.pages.dev/#/settings?tab=notifications', label: 'Open email settings' },
          status: 500,
        }),
      );
    }
  });

  app.post('/api/email/unsubscribe', unsubscribeLimiter, async (req: Request, res: Response) => {
    try {
      const token =
        typeof req.body?.token === 'string'
          ? req.body.token
          : req.query.token;
      if (typeof token !== 'string' || !token) {
        return res.status(400).json({ error: 'A token is required' });
      }
      return await unsubscribe(token, false, res);
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return res.status(500).json({ error: 'The unsubscribe request could not be completed' });
    }
  });

  /* -------------------------------- Webhook -------------------------------- */

  app.post('/api/email/webhook', async (req: RawBodyRequest, res: Response) => {
    const secret = runtimeSecret('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      console.error('Resend webhook rejected: RESEND_WEBHOOK_SECRET is not set.');
      return res.status(503).json({ error: 'Webhook signing secret is not configured.' });
    }

    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!rawBody) return res.status(400).json({ error: 'Missing raw body' });

    const valid = await verifyResendSignature(
      rawBody,
      req.headers as unknown as Record<string, unknown>,
      secret,
    );
    if (!valid) {
      console.error('Resend webhook rejected: invalid signature.');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: 'Malformed event body' });
    }

    const providerEventId =
      typeof req.headers['svix-id'] === 'string' ? req.headers['svix-id'] : null;

    try {
      const outcome = await handleResendEvent(event, providerEventId);
      return res.json(outcome);
    } catch (error) {
      console.error('Resend webhook handling failed:', error);
      // A 500 makes Resend retry. The ledger is idempotent, so a retry is safe.
      return res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  /* ------------------------------ Administration --------------------------- */

  const adminRead = [
    requireAuth,
    requireAdmin,
    requireAnyPermission(['admin.manage', 'announcements.read', 'analytics.read']),
  ];

  app.get('/api/admin/email/overview', ...adminRead, async (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, overview: await getEmailAdminOverview() });
    } catch (error) {
      console.error('Failed to read the email overview:', error);
      return res.status(500).json({ error: 'Failed to read the email overview' });
    }
  });

  app.get('/api/admin/email/logs', ...adminRead, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const logs = await listEmailLogs({
        status: status as EmailStatus | undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: Number(req.query.limit ?? 50),
        offset: Number(req.query.offset ?? 0),
      });
      return res.json({ success: true, logs });
    } catch (error) {
      console.error('Failed to read email logs:', error);
      return res.status(500).json({ error: 'Failed to read the email logs' });
    }
  });

  app.get('/api/admin/email/logs/:id', ...adminRead, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid email id' });
      const log = await getEmailLog(id);
      if (!log.email) return res.status(404).json({ error: 'Email not found' });
      return res.json({ success: true, ...log });
    } catch (error) {
      console.error('Failed to read the email log:', error);
      return res.status(500).json({ error: 'Failed to read the email log' });
    }
  });

  app.post(
    '/api/admin/email/:id/retry',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid email id' });
        const row = await retryEmail(id);
        if (!row) return res.status(409).json({ error: 'This email cannot be retried' });
        await logAdminAction(req.admin!, {
          action: 'email.retry',
          entityType: 'email_queue',
          entityId: id,
          metadata: { template: row.template, recipient: row.recipient },
        });
        return res.json({ success: true, email: row });
      } catch (error) {
        console.error('Failed to retry the email:', error);
        return res.status(500).json({ error: 'Failed to retry the email' });
      }
    },
  );

  app.post(
    '/api/admin/email/process',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const limit = Number(req.body?.limit ?? 20);
        const summary = await processEmailQueue({ limit });
        const digests = req.body?.digests === true ? await enqueueDueDigests({ force: true, maxUsers: 20 }) : null;
        await logAdminAction(req.admin!, {
          action: 'email.process',
          entityType: 'email_queue',
          metadata: { ...summary, ...(digests ? { digests: { ...digests } } : {}) },
        });
        return res.json({ success: true, summary, digests });
      } catch (error) {
        console.error('Failed to process the email queue:', error);
        return res.status(500).json({ error: 'Failed to process the email queue' });
      }
    },
  );

  app.post(
    '/api/admin/email/digests',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const summary = await enqueueDueDigests({
          force: req.body?.force === true,
          maxUsers: Number(req.body?.maxUsers ?? 40),
        });
        await logAdminAction(req.admin!, {
          action: 'email.digests',
          entityType: 'email_queue',
          metadata: { ...summary },
        });
        return res.json({ success: true, ...summary });
      } catch (error) {
        console.error('Failed to queue digests:', error);
        return res.status(500).json({ error: 'Failed to queue the digests' });
      }
    },
  );

  app.post(
    '/api/admin/email/release-blocked',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const released = await releaseBlockedEmails();
        await logAdminAction(req.admin!, {
          action: 'email.release_blocked',
          entityType: 'email_queue',
          metadata: { released },
        });
        return res.json({ success: true, released });
      } catch (error) {
        console.error('Failed to release blocked email:', error);
        return res.status(500).json({ error: 'Failed to release the blocked email' });
      }
    },
  );

  app.post('/api/admin/email/preview', ...adminRead, async (req: Request, res: Response) => {
    try {
      const template = String(req.body?.template ?? 'generic_notification') as EmailTemplateId;
      const locale: EmailLocale = req.body?.locale === 'ar' ? 'ar' : 'en';
      const rendered = renderEmail({
        template,
        payload: req.body?.payload ?? {},
        locale,
        preferencesUrl: 'https://aionvia.pages.dev/#/settings?tab=notifications',
        unsubscribeUrl: 'https://aionvia.pages.dev/api/email/unsubscribe?token=preview',
      });
      return res.json({ success: true, preview: rendered });
    } catch (error) {
      console.error('Failed to render the email preview:', error);
      return res.status(400).json({ error: 'Failed to render the preview' });
    }
  });

  app.post(
    '/api/admin/email/domain',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const name = String(req.body?.name ?? '').trim().toLowerCase();
        if (!/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(name)) {
          return res.status(400).json({ error: 'Enter a valid domain, for example aionvia.app' });
        }
        const domain = await createResendDomain(name);
        await logAdminAction(req.admin!, {
          action: 'email.domain_created',
          entityType: 'resend_domain',
          entityId: domain.id,
          metadata: { name: domain.name },
        });
        return res.status(201).json({ success: true, domain, config: await getEmailDeliveryConfig() });
      } catch (error) {
        console.error('Failed to create the sending domain:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create the sending domain',
        });
      }
    },
  );

  app.post(
    '/api/admin/email/domain/:id/verify',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id ?? '');
        if (!id) return res.status(400).json({ error: 'A domain id is required' });
        const domain = await verifyResendDomain(id);
        await logAdminAction(req.admin!, {
          action: 'email.domain_verified',
          entityType: 'resend_domain',
          entityId: id,
          metadata: { status: domain.status },
        });
        return res.json({ success: true, domain, config: await getEmailDeliveryConfig() });
      } catch (error) {
        console.error('Failed to verify the sending domain:', error);
        return res.status(502).json({
          error: error instanceof Error ? error.message : 'Failed to verify the sending domain',
        });
      }
    },
  );

  app.get('/api/admin/email/suppressions', ...adminRead, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await (await import('../db/supabase.ts')).getSupabaseServer()
        .from('email_suppressions')
        .select('email, reason, source, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.json({ success: true, suppressions: data ?? [] });
    } catch (error) {
      console.error('Failed to read email suppressions:', error);
      return res.status(500).json({ error: 'Failed to read the suppressions' });
    }
  });

  /* ---------------------------- Campaign email send ------------------------ */

  /**
   * Sends the email half of an already-published announcement.
   *
   * The announcement itself is created and published through the existing
   * administrative routes, which own targeting and the delivery ledger. This
   * route only turns that ledger into queued email, and it is idempotent.
   */
  app.post(
    '/api/admin/email/campaigns/:id/send',
    requireAuth,
    requireAdmin,
    requirePermission('announcements.publish'),
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid announcement id' });
        const queued = await enqueueAnnouncementEmails(id);
        await logAdminAction(req.admin!, {
          action: 'email.campaign_send',
          entityType: 'announcement',
          entityId: id,
          metadata: { queued },
        });
        return res.json({ success: true, queued });
      } catch (error) {
        console.error('Failed to queue the announcement email:', error);
        if (error instanceof AdminError) {
          return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Failed to queue the campaign email' });
      }
    },
  );
}
