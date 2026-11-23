/**
 * Connects this deployment to XPay.
 *
 * What it does, in order, and why in this order:
 *
 *   1. reads the secret key from `XPAY_SECRET_KEY` or from a `.xpay-key` file
 *      the owner drops in the repository root (the file is deleted once the key
 *      has been stored);
 *   2. asks XPay who the merchant is and what it can charge, because a key that
 *      answers is the only proof the key works, and because the payment methods
 *      a screen advertises must be the ones this account was provisioned for;
 *   3. registers the webhook endpoint and stores the signing secret it returns
 *      — that secret is shown once, so it is written straight to the
 *      environment and the Pages project rather than printed;
 *   4. writes the key, the signing secret and the return origin to `.env` and
 *      `.dev.vars`, and uploads them as production secrets;
 *   5. reports what the account supports and what is still missing before real
 *      money can be taken.
 *
 * Nothing is written before XPay answers: a key that is rejected is not worth
 * storing anywhere.
 *
 * Run it with `npm run xpay:connect`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeAccount, discoverPaymentMethods } from '../server/xpay/account.ts';
import { XPayError } from '../server/xpay/client.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.join(ROOT, '.xpay-key');
const API = 'https://api.xpay.app';
const PAGES_PROJECT = 'aionvia';

/** The events the platform actually handles, plus the two that close a session. */
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];

function readKeyFile(): string | undefined {
  if (!fs.existsSync(KEY_FILE)) return undefined;
  return fs
    .readFileSync(KEY_FILE, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('sk_') || entry.startsWith('rk_'));
}

function readEnvValue(file: string, name: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1).trim();
  }
  return undefined;
}

function writeEnvValue(file: string, name: string, value: string): boolean {
  const exists = fs.existsSync(file);
  const contents = exists ? fs.readFileSync(file, 'utf8') : '';
  const lines = contents.length ? contents.split(/\r?\n/) : [];
  const index = lines.findIndex((line) => line.trim().startsWith(`${name}=`));

  if (index >= 0) {
    if (lines[index] === `${name}=${value}`) return false;
    lines[index] = `${name}=${value}`;
  } else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${name}=${value}`, '');
  }

  fs.writeFileSync(file, lines.join('\n'));
  return true;
}

interface ApiError {
  error?: { code?: string; message?: string };
  request_id?: string;
}

async function call<T>(
  key: string,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text.length ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const parsed = (payload ?? {}) as ApiError;
    throw new XPayError(
      parsed.error?.message ?? `XPay refused ${method} ${endpoint} (HTTP ${response.status}).`,
      response.status,
      parsed.error?.code ?? null,
      parsed.request_id ?? null
    );
  }

  return payload as T;
}

function uploadSecret(name: string, value: string): boolean {
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(
    process.execPath,
    [wrangler, 'pages', 'secret', 'put', name, '--project-name', PAGES_PROJECT],
    { cwd: ROOT, input: `${value}\n`, encoding: 'utf8', timeout: 180_000 }
  );
  return result.status === 0;
}

async function main() {
  const secretKey = (process.env.XPAY_SECRET_KEY ?? readKeyFile() ?? '').trim();
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) {
    console.error(
      [
        'No XPay secret key found.',
        '',
        'Create one in the XPay dashboard under Developer → API Keys (it starts with sk_test_ or sk_live_),',
        `then paste it on its own line in ${path.relative(ROOT, KEY_FILE)} and run this again.`,
        'The file is deleted once the key has been stored.',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const live = /^(sk|rk)_live_/.test(secretKey);
  const siteOrigin = readEnvValue(path.join(ROOT, '.env'), 'SITE_ORIGIN') ?? process.env.SITE_ORIGIN ?? 'https://aionvia.pages.dev';

  let account;
  try {
    account = normalizeAccount(await call<Record<string, unknown>>(secretKey, 'GET', '/account'));
  } catch (error) {
    const detail = error instanceof XPayError ? `${error.status} ${error.code ?? ''}`.trim() : String(error);
    console.error(`XPay refused the key (${detail}). Nothing was stored.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Merchant: ${account.displayName ?? account.id} (${account.country ?? 'country unknown'}), mode ${account.livemode ? 'live' : 'test'}.`);

  if (account.livemode !== live) {
    console.error(
      `The key is a ${live ? 'live' : 'test'} key but the account answers as ${account.livemode ? 'live' : 'test'}. Refusing to continue.`
    );
    process.exitCode = 1;
    return;
  }

  // The account decides what can be advertised. An empty list is a fact, not an
  // error: it means the processors have not been provisioned yet.
  const methods = await discoverPaymentMethods({ fresh: true });
  console.log(
    methods.methodsForEgp.length
      ? `Payment methods for EGP: ${methods.methodsForEgp.join(', ')}.`
      : 'This account cannot charge EGP yet, so no checkout can be offered. Ask XPay support to enable a processor for EGP.'
  );
  if (methods.methods.length !== methods.methodsForEgp.length) {
    console.log(`Other currencies additionally support: ${methods.methods.join(', ')}.`);
  }
  if (!methods.applePayWebsiteReady && methods.methods.includes('apple_pay')) {
    console.log('Apple Pay is available but not set up for your own website; hosted checkout needs no extra setup.');
  }

  // The signing secret is returned once, at creation. It is written straight
  // into the environment and the Pages project, never printed.
  let webhookSecret = readEnvValue(path.join(ROOT, '.env'), 'XPAY_WEBHOOK_SECRET');
  if (webhookSecret) {
    console.log('A signing secret is already stored; the endpoint is not re-registered.');
  } else {
    const endpointUrl = `${siteOrigin.replace(/\/+$/, '')}/api/xpay/webhook`;
    try {
      const endpoint = await call<{ id: string; secret?: string; url: string }>(
        secretKey,
        'POST',
        '/webhook-endpoints',
        { url: endpointUrl, description: 'Aionvia billing', enabledEvents: WEBHOOK_EVENTS }
      );
      if (!endpoint.secret) throw new Error('XPay did not return a signing secret.');
      webhookSecret = endpoint.secret;
      console.log(`Registered ${endpointUrl} (${endpoint.id}) and received its signing secret.`);
    } catch (error) {
      const detail = error instanceof XPayError ? `${error.status} ${error.code ?? ''}` : String(error);
      console.error(
        `Could not register the webhook endpoint (${detail}). Create it in the dashboard for ${endpointUrl} and paste the whsec_ secret into .env as XPAY_WEBHOOK_SECRET, then run this again.`
      );
    }
  }

  const updates: Array<[string, string]> = [
    ['XPAY_SECRET_KEY', secretKey],
    ['SITE_ORIGIN', siteOrigin],
  ];
  if (webhookSecret) updates.push(['XPAY_WEBHOOK_SECRET', webhookSecret]);
  if (live) updates.push(['XPAY_ALLOW_LIVE', 'true']);

  const changed: string[] = [];
  for (const [name, value] of updates) {
    if (writeEnvValue(path.join(ROOT, '.env'), name, value)) changed.push(`.env:${name}`);
    if (writeEnvValue(path.join(ROOT, '.dev.vars'), name, value)) changed.push(`.dev.vars:${name}`);
  }
  console.log(changed.length ? `Updated ${changed.join(', ')}.` : 'Local files already up to date.');

  let uploaded = 0;
  for (const [name, value] of updates) {
    if (uploadSecret(name, value)) uploaded += 1;
    else console.error(`Could not upload ${name}; set it with: npx wrangler pages secret put ${name} --project-name ${PAGES_PROJECT}`);
  }
  console.log(`Uploaded ${uploaded}/${updates.length} secrets to the ${PAGES_PROJECT} production environment.`);

  if (!webhookSecret) {
    console.error('Card payments stay unavailable until XPAY_WEBHOOK_SECRET is set: a payment nobody can confirm is not offered.');
  }

  if (fs.existsSync(KEY_FILE)) {
    fs.rmSync(KEY_FILE);
    console.log('Removed the key file.');
  }

  console.log(
    [
      '',
      'Before real money can be taken:',
      '  • the account must be live-activated (KYC) in the XPay dashboard;',
      '  • the default payment-method configuration must have the methods you want switched on;',
      `  • ${siteOrigin} must be the deployed origin, because it is where the customer returns.`,
      '',
      'Then redeploy: npm run cf:deploy',
    ].join('\n')
  );
}

await main();
