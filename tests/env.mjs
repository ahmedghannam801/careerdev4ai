// Deterministic test-environment loader.
//
// This is the ESM JavaScript twin of the old `tests/test-env.ts`. The runner
// (`tests/runner.mjs`) must be able to read the test credentials *before* it
// spawns anything, without depending on a TypeScript loader being healthy —
// otherwise a broken loader would mask a missing credential as a confusing
// runtime error much later in the run.
//
// Resolution order (first match wins):
//   1. the process environment (CI secrets, or an already-exported shell env)
//   2. the .env.test file in the repository root (gitignored — never committed)
//
// If a required variable is missing the run fails immediately with a clear
// message naming it, instead of failing later with a confusing auth error.
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readJsonc } from '../scripts/public-build-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root — resolved from this file, never from the working directory. */
export const REPO_ROOT = join(HERE, '..');

/** The gitignored per-machine test environment file. */
export const ENV_FILE = join(REPO_ROOT, '.env.test');

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_TEST_PROJECT_REF',
  'SUPABASE_TEST_PROJECT_EXCLUSIVE',
];

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
// Defense in depth: this public identifier is intentionally hard-coded so an
// accidental wrangler.jsonc edit cannot silently redefine the production guard.
const PRODUCTION_SUPABASE_PROJECT_REF = 'ciihprsfdojzvjnqgbxl';

function projectRefFromUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Unsafe Supabase test configuration: SUPABASE_URL must be a valid HTTPS project URL.');
  }

  const match = parsed.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !match
  ) {
    throw new Error('Unsafe Supabase test configuration: use the canonical https://<project-ref>.supabase.co URL.');
  }
  return match[1];
}

function productionProjectUrl() {
  const vars = readJsonc(join(REPO_ROOT, 'wrangler.jsonc'))?.vars ?? {};
  const productionUrl = vars.VITE_SUPABASE_URL;
  if (typeof productionUrl !== 'string' || !productionUrl) {
    throw new Error('Unsafe Supabase test configuration: could not determine the production project from wrangler.jsonc.');
  }
  if (projectRefFromUrl(productionUrl) !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('Unsafe Supabase test configuration: production project reference is missing or differs from the audited value.');
  }
  return productionUrl;
}

export function validateTestEnvironment(env, productionUrl) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      [
        'The integration suite is missing required configuration:',
        ...missing.map((key) => `  - ${key}`),
        'Set values only for a dedicated, disposable Supabase test project.',
        'Never use credentials for the production project.',
      ].join('\n')
    );
  }

  const urlProjectRef = projectRefFromUrl(env.SUPABASE_URL);
  if (!PROJECT_REF_PATTERN.test(env.SUPABASE_TEST_PROJECT_REF)) {
    throw new Error('Unsafe Supabase test configuration: SUPABASE_TEST_PROJECT_REF is not a valid project reference.');
  }
  if (urlProjectRef !== env.SUPABASE_TEST_PROJECT_REF) {
    throw new Error('Unsafe Supabase test configuration: URL project does not match SUPABASE_TEST_PROJECT_REF.');
  }
  if (urlProjectRef === projectRefFromUrl(productionUrl)) {
    throw new Error('Unsafe Supabase test configuration: integration tests are forbidden on the production Supabase project.');
  }
  if (env.SUPABASE_TEST_PROJECT_EXCLUSIVE !== 'true') {
    throw new Error('Unsafe Supabase test configuration: set SUPABASE_TEST_PROJECT_EXCLUSIVE=true only for a dedicated test project reserved for integration tests.');
  }
  if (env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Unsafe Supabase test configuration: anon and service-role credentials must be distinct.');
  }
  return env;
}

/** Minimal .env parser: KEY=VALUE lines, # comments, optional quotes. */
export function parseEnvFile(contents) {
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export function loadTestEnv() {
  if (existsSync(ENV_FILE)) {
    const fileEnv = parseEnvFile(readFileSync(ENV_FILE, 'utf-8'));
    for (const [key, value] of Object.entries(fileEnv)) {
      // An explicitly exported variable always wins over the file.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }

  const rootDotEnv = join(REPO_ROOT, '.env');
  if (existsSync(rootDotEnv)) {
    const rootEnv = parseEnvFile(readFileSync(rootDotEnv, 'utf-8'));
    for (const [key, value] of Object.entries(rootEnv)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }

  return validateTestEnvironment(process.env, productionProjectUrl());
}
