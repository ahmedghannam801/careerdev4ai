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

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root — resolved from this file, never from the working directory. */
export const REPO_ROOT = join(HERE, '..');

/** The gitignored per-machine test environment file. */
export const ENV_FILE = join(REPO_ROOT, '.env.test');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

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

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      [
        '',
        'The test suite is missing required Supabase credentials:',
        ...missing.map((key) => `  - ${key}`),
        '',
        'Set them in the environment, or put them in a .env.test file at the',
        'repository root (this file is gitignored and must never be committed):',
        '',
        '  SUPABASE_URL=https://<project-ref>.supabase.co',
        '  SUPABASE_ANON_KEY=<publishable key>',
        '  SUPABASE_SERVICE_ROLE_KEY=<service role key>',
        '',
        'See .env.test.example for a ready-to-copy template.',
        '',
        'The suite only creates and deletes its own `cp-test-*` identities; it',
        'never truncates and never touches rows it did not create.',
        '',
      ].join('\n')
    );
  }
  return process.env;
}
