/**
 * Applies the Cloudflare Pages environment variables from the local `.env`.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * The Cloudflare API never returns the value of a secret: a secret always
 * comes back as an empty string. A PATCH that re-sends `value: ""` for a
 * secret therefore WIPES the secret while keeping its name — the variable
 * still shows up in the dashboard, and the deployed worker gets an empty
 * value at runtime. That failure is invisible until a route that needs the
 * secret starts answering as if it were not configured.
 *
 * This script rebuilds the whole environment-variable map from `.env` — the
 * local source of truth — and sends every key with its real value, for both
 * the production and the preview environment. It refuses to run when a key is
 * missing from `.env`, because sending a blank value is the exact mistake it
 * exists to prevent.
 *
 * Secret values are never printed. The output lists names and types only.
 *
 * Usage:
 *   node scripts/set-pages-env.mjs
 *
 * Authentication: the Cloudflare API token is read from
 * `CLOUDFLARE_API_TOKEN`, or from the wrangler login at
 * `%APPDATA%/xdg.config/.wrangler/config/default.toml`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECT = 'careerdev4ai';
const ACCOUNT =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? '2609c1a7921f6c50f1edd82e93bff1a8';

/**
 * The secrets the worker needs at runtime.
 *
 * The background-job queue is not in this list: it is a *binding*, not a
 * variable. It is configured in `wrangler.jsonc` and applied by
 * `wrangler pages deploy`.
 */
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
 * The build-time variables. They are public by design — they already ship
 * inside the browser bundle — and they are plain text so the build can read
 * them.
 */
const PLAIN_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_MODEL'];

function fail(message) {
  console.error(`[pages-env] ${message}`);
  process.exit(1);
}

/** Reads the local `.env` into a plain map. */
function readEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) fail(`no .env found at ${envPath}`);

  const entries = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    entries[key] = value;
  }
  return entries;
}

/** Reads the Cloudflare API token, without printing it. */
function readApiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    path.join(os.homedir(), '.config', '.wrangler', 'config', 'default.toml'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const match = fs
      .readFileSync(candidate, 'utf8')
      .match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  fail(
    'no Cloudflare API token found. Set CLOUDFLARE_API_TOKEN or sign in with `npx wrangler login`.',
  );
  return '';
}

/**
 * The public variables, as the deployment configuration declares them.
 *
 * `wrangler pages deploy` applies `wrangler.jsonc` to the project, and a
 * plain-text variable that the file does not declare is cleared from the
 * project by the deployment. So the values live in the file, and this check
 * makes sure the file and `.env` still agree — a change in one that has not
 * reached the other is a bug that would otherwise show up as a broken site.
 */
function declaredVars() {
  const configPath = path.resolve(process.cwd(), 'wrangler.jsonc');
  if (!fs.existsSync(configPath)) return {};
  const text = fs.readFileSync(configPath, 'utf8');
  const start = text.indexOf('"vars"');
  if (start === -1) return {};

  const declared = {};
  const block = text.slice(start);
  const entry = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"([^"]*)"/g;
  let match;
  while ((match = entry.exec(block)) !== null) {
    declared[match[1]] = match[2];
    if (Object.keys(declared).length >= PLAIN_KEYS.length) break;
  }
  return declared;
}

const env = readEnvFile();
const token = readApiToken();

const missing = [...SECRET_KEYS, ...PLAIN_KEYS].filter((key) => !env[key]);
if (missing.length > 0) {
  fail(
    `these keys are missing or empty in .env, so their values would be wiped:\n${missing
      .map((key) => `  - ${key}`)
      .join('\n')}`,
  );
}

// The declared variables and `.env` must agree, or the deployment would carry
// one value while the local environment carries another.
const declared = declaredVars();
const drift = PLAIN_KEYS.filter((key) => declared[key] !== undefined && declared[key] !== env[key]);
if (drift.length > 0) {
  fail(
    `these variables differ between wrangler.jsonc and .env, so the deployed site and the ` +
      `local environment would disagree:\n${drift.map((key) => `  - ${key}`).join('\n')}`,
  );
}

const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`;

async function call(method, body) {
  const res = await fetch(apiUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    fail(`${method} failed: ${JSON.stringify(data.errors ?? data)}`);
  }
  return data.result;
}

function buildEnvVars() {
  const vars = {};
  for (const key of SECRET_KEYS) vars[key] = { type: 'secret_text', value: env[key] };
  for (const key of PLAIN_KEYS) vars[key] = { type: 'plain_text', value: env[key] };
  return vars;
}

/**
 * The variables the project still has that `.env` no longer names.
 *
 * The Cloudflare API MERGES the map it is given into the project's existing
 * one: a variable that is simply left out of the PATCH keeps its old value.
 * So a variable that has been removed from `.env` — a credential for a service
 * this project no longer uses — would stay on the project for ever.
 *
 * The API cannot delete one either: sending it with a null value is accepted
 * and ignored. Removing a secret is `wrangler pages secret delete`, so these
 * are reported with the exact command that removes them rather than being
 * silently left behind.
 */
function staleEnvVars(current) {
  const keep = new Set([...SECRET_KEYS, ...PLAIN_KEYS]);
  return Object.keys(current ?? {}).filter((name) => !keep.has(name));
}

const project = await call('GET');
const configs = project.deployment_configs ?? {};

// The variables that are no longer wanted are collected from what the project
// has now, before anything is sent — so a credential that has been dropped is
// reported rather than left behind unnoticed.
const stale = {
  production: staleEnvVars(configs.production?.env_vars),
  preview: staleEnvVars(configs.preview?.env_vars),
};

await call('PATCH', {
  deployment_configs: {
    production: { ...configs.production, env_vars: buildEnvVars() },
    preview: { ...configs.preview, env_vars: buildEnvVars() },
  },
});

const after = await call('GET');
for (const environment of ['production', 'preview']) {
  const vars = after.deployment_configs?.[environment]?.env_vars ?? {};
  const names = Object.keys(vars).sort();
  const secrets = names.filter((name) => vars[name]?.type === 'secret_text');
  const plain = names.filter((name) => vars[name]?.type === 'plain_text');
  console.log(
    `[pages-env] ${environment}: ${secrets.length} secrets, ${plain.length} plain-text variables`,
  );
  if (stale[environment].length > 0) {
    console.log(
      `[pages-env] ${environment}: ${stale[environment].join(', ')} are no longer in .env. ` +
        `Remove them with: npx wrangler pages secret delete <name> --project-name ${PROJECT}`,
    );
  }
}
console.log(
  '[pages-env] the values were sent. Redeploy for them to take effect: npm run cf:deploy',
);
