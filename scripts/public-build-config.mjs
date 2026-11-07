/**
 * The public build configuration.
 *
 * WHY THIS EXISTS
 *
 * The browser bundle needs two public values — the Supabase project URL and the
 * publishable key — and it needs them at BUILD time, because Vite inlines them
 * into the bundle when it is built. They are the two values that let the
 * browser talk to Supabase Auth at all.
 *
 * That makes the build the place where authentication can silently break: if
 * the build environment does not carry these two values, the bundle is built
 * without them, `isSupabaseConfigured` is false, and the application ships with
 * EVERY sign-in method disabled — the Google, LinkedIn and GitHub buttons are
 * not rendered, and the email form answers "Authentication is not configured".
 *
 * This happened in production. The bundle was built in a clean checkout, where
 * the gitignored `.env` does not exist and the Cloudflare Pages project had no
 * build variables, so the two values were simply not there. Nothing failed:
 * the build succeeded, the site loaded, and every visitor found that no
 * sign-in method existed.
 *
 * So the values are resolved here from the sources that are actually present in
 * a clean checkout, and the build fails loudly when they cannot be found.
 *
 * THE SOURCES, IN ORDER OF PRECEDENCE
 *
 *   1. the environment  — a build variable set by the platform (Cloudflare
 *      Pages build variables, CI secrets) or exported in a shell
 *   2. `.env`           — the local source of truth; gitignored, and the file
 *      `scripts/set-pages-env.mjs` keeps in agreement with `wrangler.jsonc`
 *   3. `wrangler.jsonc`  — the committed source of truth. Its `vars` block
 *      already carries the two public values, and they are public by design:
 *      they ship inside the browser bundle either way.
 *
 * A clean checkout has source 3 and nothing else, so a build anywhere always
 * has the values. When two sources disagree the resolution fails instead of
 * picking one: a deployment that quietly serves a different project than the
 * one the operator configured is exactly the failure this module exists to
 * prevent.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The public values the browser bundle needs.
 *
 * Both are exposed to the browser by design: the publishable key is the
 * anonymous key, and the project URL is in every request the browser makes.
 * Neither is a secret, and neither is the service-role key.
 */
export const PUBLIC_BUILD_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

/**
 * Reads a `.env` file into a plain map.
 *
 * The format is the usual one: `KEY=VALUE` lines, `#` comments, and optional
 * quotes around a value. A file that does not exist yields an empty map — the
 * absence of `.env` is a normal state, not an error.
 */
export function readDotEnv(filePath) {
  const entries = {};
  if (!filePath || !fs.existsSync(filePath)) return entries;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) entries[key] = value;
  }
  return entries;
}

/**
 * Removes comments and trailing commas from JSONC.
 *
 * The scanner is string-aware, because a JSONC file that carries a URL in a
 * value — `https://…` — contains a `//` that is not a comment. A regular
 * expression would cut the value in half.
 */
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    out += char;
  }

  // A trailing comma before a closing brace or bracket is not JSON.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Reads a JSONC file into an object.
 *
 * A file that does not exist yields an empty object: the caller decides
 * whether a missing source is a problem.
 */
export function readJsonc(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(stripJsonComments(text));
  } catch (error) {
    throw new Error(`Could not read ${filePath} as JSONC: ${error.message}`);
  }
}

/**
 * Resolves the public build configuration from the available sources.
 *
 * The first source that carries a value wins, and two sources that carry
 * DIFFERENT values for the same key are a conflict: the resolution fails
 * rather than shipping a bundle that points at another project.
 *
 * @param {object} sources
 * @param {Record<string, string | undefined>} [sources.env] the process environment
 * @param {Record<string, string | undefined>} [sources.dotenv] the contents of `.env`
 * @param {Record<string, string | undefined>} [sources.wranglerVars] the `vars` block of `wrangler.jsonc`
 * @returns {{ values: Record<string, string>, origins: Record<string, string> }}
 */
export function resolvePublicBuildConfig(sources = {}) {
  const { env = {}, dotenv = {}, wranglerVars = {} } = sources;
  const values = {};
  const origins = {};
  const conflicts = [];

  for (const key of PUBLIC_BUILD_KEYS) {
    const candidates = [
      { name: 'the environment', value: env?.[key] },
      { name: '.env', value: dotenv?.[key] },
      { name: 'wrangler.jsonc', value: wranglerVars?.[key] },
    ].filter((candidate) => typeof candidate.value === 'string' && candidate.value.trim() !== '');

    if (candidates.length === 0) continue;

    const chosen = candidates[0];
    for (const other of candidates.slice(1)) {
      if (other.value.trim() !== chosen.value.trim()) {
        conflicts.push(
          `  ${key}: ${chosen.name} and ${other.name} carry different values.`
        );
      }
    }

    values[key] = chosen.value.trim();
    origins[key] = chosen.name;
  }

  if (conflicts.length > 0) {
    throw new Error(
      [
        'The public build configuration is contradictory, so the build was stopped:',
        ...conflicts,
        '',
        'Every sign-in method depends on these two values. A deployment that',
        'silently used one of them would point the browser at a different',
        'Supabase project than the one the operator configured.',
        '',
      ].join('\n')
    );
  }

  return { values, origins };
}

/**
 * The message that explains what is missing and what it costs.
 *
 * It names the symptom, because the symptom is what a reader of a failed
 * build will otherwise have to discover on the live site.
 */
function missingMessage(values, origins) {
  const missing = PUBLIC_BUILD_KEYS.filter((key) => !values[key]);
  return [
    '',
    'The public Supabase configuration is missing, so the build was stopped:',
    ...missing.map((key) => `  - ${key}`),
    '',
    'These two values are inlined into the browser bundle at build time. Without',
    'them the application ships with every sign-in method disabled: the Google,',
    'LinkedIn and GitHub buttons are not rendered, and the email form answers',
    '"Authentication is not configured".',
    '',
    'They are public by design — they are not the service-role key — and the',
    'committed source of truth is the `vars` block of `wrangler.jsonc`:',
    '',
    '  "vars": {',
    '    "VITE_SUPABASE_URL": "https://<project-ref>.supabase.co",',
    '    "VITE_SUPABASE_PUBLISHABLE_KEY": "<publishable key>"',
    '  }',
    '',
    'Resolution order: the environment, then `.env`, then `wrangler.jsonc`.',
    origins && Object.keys(origins).length > 0
      ? `Resolved so far: ${Object.entries(origins).map(([key, name]) => `${key} from ${name}`).join(', ')}.`
      : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Resolves the configuration and fails when it is incomplete.
 *
 * This is what the build calls. The build must never produce a bundle that
 * cannot sign anybody in.
 *
 * @param {object} sources the same sources as `resolvePublicBuildConfig`
 * @returns {{ values: Record<string, string>, origins: Record<string, string> }}
 */
export function requirePublicBuildConfig(sources = {}) {
  const resolved = resolvePublicBuildConfig(sources);
  const missing = PUBLIC_BUILD_KEYS.filter((key) => !resolved.values[key]);
  if (missing.length > 0) {
    throw new Error(missingMessage(resolved.values, resolved.origins));
  }
  return resolved;
}

/**
 * Reads the sources from the repository and resolves the configuration.
 *
 * @param {string} rootDir the repository root
 */
export function loadPublicBuildConfig(rootDir) {
  const dotenv = readDotEnv(path.join(rootDir, '.env'));
  const wrangler = readJsonc(path.join(rootDir, 'wrangler.jsonc'));
  return requirePublicBuildConfig({
    env: process.env,
    dotenv,
    wranglerVars: wrangler?.vars ?? {},
  });
}
