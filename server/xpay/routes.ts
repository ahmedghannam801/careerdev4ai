/**
 * XPay HTTP routes.
 *
 *   POST /api/xpay/checkout-session        authenticated, starts a hosted checkout
 *   GET  /api/xpay/status                  authenticated, what this candidate bought
 *   POST /api/xpay/session/:id/sync        authenticated, reconciles one session
 *   POST /api/xpay/webhook                 XPay only, signature verified
 *   GET  /api/xpay/diagnostics             admin, what the merchant account can do
 *
 * The webhook is the one route that must never sit behind `requireAuth`: the
 * caller is XPay, not a candidate. Its authentication is the signature over the
 * exact bytes of the body, checked before the body is parsed.
 */

import type { Express, NextFunction, Request, Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/require-auth.ts';
import { requireAdmin, requirePermission } from '../admin/permissions.ts';
import { describeXPayConfig, getXPayConfig, XPayConfigError } from './config.ts';
import { discoverPaymentMethods, getXPayAccount } from './account.ts';
import { XPayError } from './client.ts';
import {
  createXPayCheckoutForProfile,
  getXPayBillingStatus,
  reconcileXPaySession,
  XPayCheckoutError,
} from './service.ts';
import { verifyXPaySignature } from './signature.ts';
import { processXPayEvent, type XPayEvent } from './webhooks.ts';
import type { BillingCycle } from '../../shared/subscriptions.ts';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.authUser?.id ?? req.ip ?? 'anonymous';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      res.status(429).json({ error: 'Too many requests. Try again in a moment.', code: 'RATE_LIMITED' });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const checkoutRateLimit = createRateLimiter(20, 60_000);
const statusRateLimit = createRateLimiter(120, 60_000);

const ALLOWED_ORIGIN_FALLBACK = 'https://aionvia.pages.dev';

function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Picks the origin for the return and cancel redirects.
 *
 * Only an origin the deployment already trusts is used, which keeps a forged
 * Origin header from turning the endpoint into an open redirect. A local host
 * is allowed in development because that is where the return page is being
 * built; it is never the deployment's configured origin.
 */
function resolveOrigin(req: Request): string {
  const siteOrigin = (process.env.SITE_ORIGIN ?? '').trim() || ALLOWED_ORIGIN_FALLBACK;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (origin && (origin === siteOrigin || configuredOrigins().includes(origin))) return origin;

  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;

  return siteOrigin;
}

function fail(res: Response, error: unknown, context: string): Response {
  if (error instanceof XPayConfigError) {
    console.error(`XPay is not configured (${context}):`, error.message);
    return res.status(503).json({ error: error.message, code: 'XPAY_NOT_CONFIGURED' });
  }

  if (error instanceof XPayCheckoutError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }

  if (error instanceof XPayError) {
    // A 401 is the operator's problem (the key), and saying so is more useful
    // than reporting a payment failure the candidate cannot act on. The
    // provider's own text stays in the log.
    console.error(`XPay error (${context}):`, error.status, error.code, error.detail ?? error.message);
    if (error.status === 401 || error.status === 403) {
      return res.status(503).json({
        error: 'Card payments are unavailable: this server’s XPay key was rejected.',
        code: 'XPAY_AUTH_FAILED',
      });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Too many payment attempts. Try again shortly.', code: 'RATE_LIMITED' });
    }
    return res.status(error.status === 0 ? 504 : 502).json({
      error: 'The payment provider could not be reached. Try again in a moment.',
      code: error.code ?? 'XPAY_UNAVAILABLE',
    });
  }

  console.error(`XPay request failed (${context}):`, error);
  return res.status(500).json({ error: 'The payment request failed.', code: 'XPAY_ERROR' });
}

export function registerXPayRoutes(app: Express): void {
  app.post(
    '/api/xpay/checkout-session',
    requireAuth,
    checkoutRateLimit,
    async (req: AuthedRequest, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const planCode = body.planCode === undefined ? undefined : String(body.planCode).trim();
        const packId = body.packId === undefined ? undefined : String(body.packId).trim();
        const rawCycle = body.billingCycle === undefined ? 'monthly' : String(body.billingCycle).trim();
        const couponCode = body.couponCode ? String(body.couponCode).trim() : null;
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
        const locale = body.locale === 'ar' ? 'ar' : 'en';

        if (!planCode && !packId) {
          return res.status(400).json({ error: 'A plan or a credit pack is required.' });
        }
        if (planCode && planCode.length > 64) {
          return res.status(400).json({ error: 'That plan code is not valid.' });
        }
        if (packId && !/^pack_[a-z0-9_]{1,32}$/.test(packId)) {
          return res.status(400).json({ error: 'That credit pack is not valid.' });
        }
        if (rawCycle !== 'monthly' && rawCycle !== 'annual') {
          return res.status(400).json({ error: 'The billing cycle must be monthly or annual.' });
        }
        if (couponCode && couponCode.length > 64) {
          return res.status(400).json({ error: 'That coupon code is not valid.' });
        }
        if (idempotencyKey && !/^[A-Za-z0-9:_-]{8,255}$/.test(idempotencyKey)) {
          return res.status(400).json({ error: 'That idempotency key is not valid.' });
        }

        const result = await createXPayCheckoutForProfile({
          profileId: req.authUser!.id,
          email: req.authUser!.email ?? null,
          origin: resolveOrigin(req),
          locale,
          planCode,
          packId,
          billingCycle: rawCycle as BillingCycle,
          couponCode,
          idempotencyKey,
        });

        return res.json({ success: true, ...result });
      } catch (error) {
        return fail(res, error, 'checkout-session');
      }
    }
  );

  app.get('/api/xpay/status', requireAuth, statusRateLimit, async (req: AuthedRequest, res: Response) => {
    try {
      const status = await getXPayBillingStatus(req.authUser!.id);
      return res.json({ success: true, status });
    } catch (error) {
      return fail(res, error, 'status');
    }
  });

  app.post(
    '/api/xpay/session/:sessionId/sync',
    requireAuth,
    statusRateLimit,
    async (req: AuthedRequest, res: Response) => {
      try {
        const sessionId = String(req.params.sessionId ?? '').trim();
        const result = await reconcileXPaySession(sessionId, { profileId: req.authUser!.id });
        return res.json({
          success: true,
          // The screen needs the truth about the money, not a redirect flag.
          status: result.session.status,
          paymentStatus: result.session.paymentStatus,
          paid: result.session.paymentStatus === 'paid',
          purchase: result.purchase
            ? {
                planCode: result.purchase.plan_code,
                billingCycle: result.purchase.billing_cycle,
                credits: result.purchase.credits,
                accessEndsAt: result.purchase.access_ends_at,
              }
            : null,
          voucher: {
            reference: result.stored?.voucher_reference ?? null,
            expiresAt: result.stored?.voucher_expires_at ?? null,
},
        });
      } catch (error) {
        return fail(res, error, 'session-sync');
      }
    }
  );

  app.post('/api/xpay/webhook', async (req: RawBodyRequest, res: Response) => {
    // A webhook that cannot be verified is worse than one that is not
    // processed: answering 200 would tell XPay to stop retrying a payment the
    // candidate has already made.
    let webhookSecret: string | null = null;
    try {
      webhookSecret = getXPayConfig().webhookSecret;
    } catch (error) {
      console.error('XPay webhook rejected: XPay is not configured.', error);
      return res.status(503).json({ error: 'XPay is not configured.' });
    }

    if (!webhookSecret) {
      console.error('XPay webhook rejected: XPAY_WEBHOOK_SECRET is not set.');
      return res.status(503).json({ error: 'Webhook signing secret is not configured.' });
    }

    const signatureHeader =
      typeof req.headers['xpay-signature'] === 'string'
        ? req.headers['xpay-signature']
        : Array.isArray(req.headers['xpay-signature'])
          ? req.headers['xpay-signature'][0] ?? null
          : null;

    // The exact bytes, captured before any parser ran. Re-serialising the
    // parsed JSON changes whitespace and key order and breaks the signature.
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing raw body' });
    }

    const verified = await verifyXPaySignature(rawBody, signatureHeader, webhookSecret);
    if (!verified.valid) {
      // The reason is logged and the caller learns nothing: an attacker must
      // not be able to probe which check failed.
      console.error(`XPay webhook rejected: ${verified.reason}.`);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let event: XPayEvent;
    try {
      event = JSON.parse(rawBody) as XPayEvent;
    } catch {
      return res.status(400).json({ error: 'Malformed event body' });
    }

    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      return res.status(400).json({ error: 'Malformed event body' });
    }

    // The signing secret already scopes a delivery to one endpoint in one mode,
    // but a test event reaching the live endpoint is worth refusing loudly
    // rather than applying a test entitlement to a live account.
    const expectedLive = getXPayConfig().mode === 'live';
    if (typeof event.livemode === 'boolean' && event.livemode !== expectedLive) {
      console.error(
        `XPay webhook ${event.id} rejected: livemode=${event.livemode} but the server is in ${expectedLive ? 'live' : 'test'} mode.`
      );
      return res.status(400).json({ error: 'Event mode does not match the configured XPay mode' });
    }

    try {
      const result = await processXPayEvent(event);
      return res.json(result);
    } catch (error) {
      console.error(`XPay webhook ${event.id} (${event.type}) failed:`, error);
      // 500 makes XPay retry, which is what we want while the failure is
      // transient. The event row records the error for inspection.
      return res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  // Read-only diagnostics for an operator. It never returns a secret, and it is
  // authenticated so the deployment's merchant configuration is not public.
  app.get(
    '/api/xpay/diagnostics',
    requireAuth,
    requireAdmin,
    requirePermission('admin.manage'),
    statusRateLimit,
    async (_req: AuthedRequest, res: Response) => {
      const config = describeXPayConfig();
      if (!config.configured) {
        return res.json({ success: true, config, account: null, paymentMethods: null });
      }

      try {
        const [account, paymentMethods] = await Promise.all([
          getXPayAccount({ fresh: true }),
          discoverPaymentMethods({ fresh: true }),
        ]);
        return res.json({
          success: true,
          config,
          account: {
            id: account.id,
            displayName: account.displayName,
            country: account.country,
            defaultCurrency: account.defaultCurrency,
            defaultLocale: account.defaultLocale,
            livemode: account.livemode,
            wallets: account.wallets,
          },
          paymentMethods,
        });
      } catch (error) {
        return res.json({
          success: true,
          config,
          account: null,
          paymentMethods: null,
          error:
            error instanceof XPayError
              ? { status: error.status, code: error.code }
              : { status: null, code: 'account_unavailable' },
        });
      }
    }
  );
}
