/**
 * Stripe HTTP routes.
 *
 *   POST /api/stripe/checkout-session   authenticated, starts a hosted checkout
 *   POST /api/stripe/portal-session     authenticated, opens the Customer Portal
 *   GET  /api/stripe/status             authenticated, mirror of the subscription
 *   POST /api/stripe/webhook            Stripe only, signature verified
 *
 * The webhook is the one route that must never sit behind `requireAuth`: the
 * caller is Stripe, not a candidate. Its authentication is the signature over
 * the exact bytes of the body.
 */

import type { Express, NextFunction, Request, Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/require-auth.ts';
import { StripeError } from './client.ts';
import {
  describeStripeConfig,
  getStripeConfig,
  StripeConfigError,
} from './config.ts';
import {
  createCheckoutSession,
  createPortalSession,
  getStripeBillingSummary,
} from './service.ts';
import { validateStripeCatalog } from './catalog.ts';
import { verifyStripeSignature } from './signature.ts';
import { processStripeEvent } from './webhooks.ts';
import type { StripeEvent } from './types.ts';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Picks the origin for Stripe's success/cancel redirects.
 *
 * Only an origin the deployment already trusts is used. Falling back to
 * SITE_ORIGIN means a forged Origin header can never turn the endpoint into an
 * open redirect.
 */
function resolveOrigin(req: Request): string {
  const config = getStripeConfig();
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (origin && (origin === config.siteOrigin || configuredOrigins().includes(origin))) {
    return origin;
  }

  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return `http://${host}`;
  }

  return config.siteOrigin;
}

function fail(res: Response, error: unknown, context: string): Response {
  if (error instanceof StripeConfigError) {
    console.error(`Stripe is not configured (${context}):`, error.message);
    return res.status(503).json({
      error: error.message,
      code: 'STRIPE_NOT_CONFIGURED',
    });
  }

  if (error instanceof StripeError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    console.error(`Stripe error (${context}):`, error.status, error.type, error.code, error.message);
    return res.status(status).json({
      error: error.message,
      code: error.code ?? 'STRIPE_ERROR',
    });
  }

  console.error(`Stripe route failed (${context}):`, error);
  return res.status(500).json({ error: 'Card payment request failed.' });
}

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * A tiny in-process limiter, matching the rest of the API.
 *
 * The API runs as one Express app per isolate; a per-isolate limiter is not a
 * global quota, but it does stop a single client from looping Checkout Session
 * creation or hammering the status endpoint. `requireAuth` still does the
 * primary work of tying the request to one account.
 */
function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();

  return function rateLimit(req: AuthedRequest, res: Response, next: NextFunction): void {
    const now = Date.now();
    const identity = req.authUser?.id ?? req.ip ?? 'anonymous';
    const bucket = buckets.get(identity);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identity, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many billing requests. Please wait a moment and try again.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    next();
  };
}

const checkoutRateLimit = createRateLimiter(20, 60_000);
const statusRateLimit = createRateLimiter(120, 60_000);

export function registerStripeRoutes(app: Express): void {
  app.post(
    '/api/stripe/checkout-session',
    requireAuth,
    checkoutRateLimit,
    async (req: AuthedRequest, res: Response) => {
      try {
        const planCode = String(req.body?.planCode ?? '').trim();
        const billingCycle = String(req.body?.billingCycle ?? 'monthly').trim();
        const promotionCode = req.body?.promotionCode
          ? String(req.body.promotionCode).trim()
          : null;
        // The candidate may ask for their birthday discount. The server
        // decides whether it applies and what it is worth; the request only
        // carries the wish, never the amount.
        const applyBirthdayReward = req.body?.applyBirthdayReward === true;

        if (!planCode) {
          return res.status(400).json({ error: 'planCode is required' });
        }
        if (planCode.length > 64) {
          return res.status(400).json({ error: 'planCode is invalid' });
        }
        if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
          return res.status(400).json({ error: 'billingCycle must be "monthly" or "annual"' });
        }
        if (promotionCode && promotionCode.length > 128) {
          return res.status(400).json({ error: 'promotionCode is invalid' });
        }

        const result = await createCheckoutSession({
          profileId: req.authUser!.id,
          email: req.authUser!.email ?? null,
          planCode,
          billingCycle,
          origin: resolveOrigin(req),
          promotionCode,
          applyBirthdayReward,
        });

        return res.json({ success: true, ...result });
      } catch (error) {
        return fail(res, error, 'checkout-session');
      }
    }
  );

  app.post(
    '/api/stripe/portal-session',
    requireAuth,
    checkoutRateLimit,
    async (req: AuthedRequest, res: Response) => {
      try {
        const result = await createPortalSession(req.authUser!.id, resolveOrigin(req));
        return res.json({ success: true, ...result });
      } catch (error) {
        return fail(res, error, 'portal-session');
      }
    }
  );

  app.get(
    '/api/stripe/status',
    requireAuth,
    statusRateLimit,
    async (req: AuthedRequest, res: Response) => {
      try {
        const summary = await getStripeBillingSummary(req.authUser!.id);

        // Price validation is an operator diagnostic and costs a Stripe API
        // call (cached for five minutes). The Pricing page does not need it on
        // every render, so it is opt-in.
        let priceValidation: Awaited<ReturnType<typeof validateStripeCatalog>> | null = null;
        if (req.query.validate === '1' && summary.configured) {
          try {
            priceValidation = await validateStripeCatalog();
          } catch (error) {
            console.error('Stripe price validation failed:', error);
            priceValidation = {
              ok: false,
              checked: 0,
              issues: [
                {
                  lookupKey: '*',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Stripe price validation failed.',
                },
              ],
            };
          }
        }

        return res.json({ success: true, ...summary, priceValidation });
      } catch (error) {
        return fail(res, error, 'status');
      }
    }
  );

  app.post('/api/stripe/webhook', async (req: RawBodyRequest, res: Response) => {
    // A webhook that cannot be verified is worse than one that is not
    // processed: answering 200 would tell Stripe to stop retrying a payment
    // the candidate has already made.
    let config;
    try {
      config = getStripeConfig();
    } catch (error) {
      console.error('Stripe webhook rejected: Stripe is not configured.', error);
      return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    if (!config.webhookSecret) {
      console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not set.');
      return res.status(503).json({ error: 'Webhook signing secret is not configured.' });
    }

    const signatureHeader =
      typeof req.headers['stripe-signature'] === 'string'
        ? req.headers['stripe-signature']
        : null;

    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing raw body' });
    }

    const valid = await verifyStripeSignature(rawBody, signatureHeader, config.webhookSecret);
    if (!valid) {
      console.error('Stripe webhook rejected: invalid signature.');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let event: StripeEvent<unknown>;
    try {
      event = JSON.parse(rawBody) as StripeEvent<unknown>;
    } catch {
      return res.status(400).json({ error: 'Malformed event body' });
    }

    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      return res.status(400).json({ error: 'Malformed event body' });
    }

    // The signing secret already scopes a delivery to one endpoint in one
    // mode, but checking `livemode` explicitly turns a mis-pasted secret (or a
    // test event sent to the live endpoint) into a clear 400 instead of a
    // silently ignored or, worse, applied test entitlement.
    const expectedLive = config.mode === 'live';
    if (Boolean(event.livemode) !== expectedLive) {
      console.error(
        `Stripe webhook ${event.id} rejected: livemode=${Boolean(event.livemode)} but the server is in ${config.mode} mode.`
      );
      return res.status(400).json({ error: 'Event mode does not match the configured Stripe mode' });
    }

    // On a Connect endpoint `event.account` names the connected account. This
    // project is a direct (single-account) integration, so the check is only
    // applied when an account id is configured; the key itself is already
    // scoped to its account.
    if (config.accountId && event.account && event.account !== config.accountId) {
      console.error(`Stripe webhook ${event.id} rejected: account mismatch.`);
      return res.status(400).json({ error: 'Event account does not match the configured account' });
    }

    try {
      const result = await processStripeEvent(event);
      return res.json(result);
    } catch (error) {
      console.error(`Stripe webhook ${event.id} (${event.type}) failed:`, error);
      // 500 makes Stripe retry with backoff, which is what we want while the
      // failure is transient. The event row records the error for inspection.
      return res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  // Read-only diagnostics for an operator. It never returns a secret, and it
  // is authenticated so the deployment's configuration is not public.
  app.get(
    '/api/stripe/diagnostics',
    requireAuth,
    statusRateLimit,
    async (_req: AuthedRequest, res: Response) => {
      const config = describeStripeConfig();
      if (config.mode === 'disabled') {
        return res.json({ success: true, config, priceValidation: null });
      }

      try {
        const priceValidation = await validateStripeCatalog();
        return res.json({ success: true, config, priceValidation });
      } catch (error) {
        return res.json({
          success: true,
          config,
          priceValidation: {
            ok: false,
            checked: 0,
            issues: [
              {
                lookupKey: '*',
                message: error instanceof Error ? error.message : 'Price validation failed.',
              },
            ],
          },
        });
      }
    }
  );
}
