/**
 * Uploads the Pages secrets to a project with the Wrangler CLI.
 *
 * WHY THE CLI AND NOT THE REST API
 *
 * `scripts/set-pages-env.mjs` speaks to the Cloudflare REST API directly. That
 * works with an API token, but the credential `wrangler login` stores is an
 * OAuth token, and the REST API refuses it (HTTP 401, code 10000) even though
 * Wrangler itself uses the same token successfully. The CLI handles the OAuth
 * exchange, so it is the only path that works with a Wrangler login.
 *
 * The values come from `.env`, which is the single local source of truth. The
 * secret file is written to a temporary path, uploaded, and removed.
 *
 * Usage:
 *   node scripts/set-pages-secrets.mjs [project]
 *   node scripts/set-pages-secrets.mjs [project] --check   (verify only, upload nothing)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((value) => value !== '--check');
const CHECK_ONLY = process.argv.includes('--check');
const PROJECT = args[0] ?? 'aionvia';

/** The secrets the worker needs at request time. */
const SECRET_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'INDEXNOW_KEY',
  'GA4_PROPERTY_ID',
  'GA4_CLIENT_ID',
  'GA4_CLIENT_SECRET',
  'JSEARCH_RAPIDAPI_KEY',
];

/**
 * The optional secrets.
 *
 * A key that is not configured in `.env` is left out rather than sent blank:
 * a secret with an empty value is worse than an absent one, because the server
 * would refuse every request that needs it instead of reporting that the
 * feature is not configured.
 *
 * The payment gateway's credentials are deliberately absent. The platform does
 * not sell anything at the moment, so there is no gateway for a deployment to
 * hold a key for, and an unused live key in a project is a liability.
 */
const OPTIONAL_SECRET_KEYS = [
  'RESEND_API_KEY',
  'RESEND_FROM',
  'RESEND_TEST_RECIPIENT',
];

function readEnvFile() {
  const envPath = path.join(ROOT, '.env');
  const entries = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    entries[key] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return entries;
}

const env = readEnvFile();
const missing = SECRET_KEYS.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`[pages-secrets] missing from .env: ${missing.join(', ')}`);
  process.exit(1);
}

/**
 * Checks the AI credential before anything is uploaded.
 *
 * A Pages secret cannot be read back once it is set, so an upload REPLACES the
 * value that is running in production. If the key in `.env` has stopped
 * working — a deleted service account, a revoked key — the upload would
 * silently swap a working production credential for a broken one, and every AI
 * feature would start failing at request time with nothing in the deployment
 * to show for it.
 *
 * The platform also falls back from Gemini to OpenRouter without reporting
 * it, so a broken Gemini key does not announce itself: the features keep
 * working on the fallback until that one is exhausted too.
 *
 * So the credential is checked HERE, first, and the upload does not happen if
 * it does not answer. The key is never printed.
 */
async function preflightAiCredential() {
  const key = env.GEMINI_API_KEY;
  if (!key) return;

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
  let response;
  try {
    response = await fetch(endpoint, { headers: { 'x-goog-api-key': key } });
  } catch (error) {
    console.error(`[pages-secrets] the Gemini credential could not be reached: ${error?.message ?? error}`);
    process.exit(1);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json())?.error?.message ?? '';
    } catch {
      // The body is not JSON; the status alone is enough to stop.
    }
    console.error(
      `[pages-secrets] the Gemini credential in .env is not working (HTTP ${response.status}).` +
        (detail ? ` ${detail}` : '')
    );
    console.error(
      '[pages-secrets] nothing was uploaded. Uploading a key that does not work would replace a working production secret with a broken one.'
    );
    process.exit(1);
  }

  // The check passed. Say which live models the credential can actually see,
  // so a model that is no longer served is noticed here rather than at the
  // moment a candidate presses "start".
  try {
    const body = await response.json();
    const models = (body?.models ?? []).map((entry) => String(entry?.name ?? '').replace(/^models\//, ''));
    const liveModels = models.filter((name) => name.includes('live') || name.includes('native-audio'));
    console.log(
      `[pages-secrets] the Gemini credential works. ${models.length} model(s) visible;` +
        ` live model(s): ${liveModels.length ? liveModels.join(', ') : 'none listed'}.`
    );
  } catch {
    console.log('[pages-secrets] the Gemini credential works.');
  }

  await checkLiveCredential(key);
}

/**
 * Checks that the credential can still mint a Live session credential.
 *
 * Reading the models above proves the key answers ordinary requests. It does
 * NOT prove the key can start a live interview: minting a Live credential
 * goes through the token service, which requires the service account bound to
 * the key to be active. A key can therefore serve every text feature and
 * still be refused by the Live API with
 * `ACCOUNT_STATE_INVALID — the bound service account is deleted or disabled`.
 *
 * That is a warning rather than a block: the credential is usable for
 * everything else, and refusing to upload it would be worse than uploading it
 * with this one feature clearly reported as broken.
 *
 * The token is requested, checked and thrown away. It is never printed and
 * never used.
 */
async function checkLiveCredential(key) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
  const inMinutes = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime: inMinutes(30),
        newSessionExpireTime: inMinutes(10),
        liveConnectConstraints: {
          model: 'models/gemini-3.8-live',
          config: { responseModalities: ['AUDIO'] },
        },
      }),
    });
  } catch (error) {
    console.warn(
      `[pages-secrets] WARNING: the live interviewer could not be checked (${error?.message ?? error}).`
    );
    return;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json())?.error?.message ?? '';
    } catch {
      // The body is not JSON; the status alone is enough to report.
    }
    console.warn(
      `[pages-secrets] WARNING: the credential cannot mint a live session credential` +
        ` (HTTP ${response.status}).${detail ? ` ${detail}` : ''}`
    );
    console.warn(
      '[pages-secrets] The spoken interview will not start until the service account bound to the key is active again.'
    );
    return;
  }

  console.log('[pages-secrets] the credential can start a live interview.');
}

await preflightAiCredential();

if (CHECK_ONLY) {
  console.log('[pages-secrets] --check: nothing was uploaded.');
  process.exit(0);
}

const payload = {};
for (const key of [...SECRET_KEYS, ...OPTIONAL_SECRET_KEYS]) {
  if (env[key]) payload[key] = env[key];
}

const tempFile = path.join(os.tmpdir(), `pages-secrets-${PROJECT}-${process.pid}.json`);
fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf8');

try {
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler', 'pages', 'secret', 'bulk', tempFile, '--project-name', PROJECT],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    console.error(`[pages-secrets] the upload failed with status ${result.status}`);
    process.exitCode = result.status ?? 1;
  } else {
    console.log(`[pages-secrets] ${Object.keys(payload).length} secret(s) uploaded to ${PROJECT}.`);
  }
} finally {
  fs.rmSync(tempFile, { force: true });
}
