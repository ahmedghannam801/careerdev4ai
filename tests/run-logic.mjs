// The runner for the test files that need no database.
//
// WHY THIS EXISTS
//
// `tests/runner.mjs` runs every test file, and it needs an explicitly
// designated, non-production Supabase test project before it will start. That
// project is only configured in an opt-in manual CI run, so the files the
// project itself describes as "Pure" — the ones that need no key and no
// database — were only ever executed when somebody remembered to run the
// integration job.
//
// This runner executes exactly those files, with no credentials and no
// database, so that the bulk of the suite is enforced on every push.
//
// HOW A FILE IS CLASSIFIED
//
// A test file is "pure" when nothing it imports (directly or through another
// module) reaches `tests/helpers.ts` or `tests/env.mjs`. Those two modules are
// the only ones that talk to Supabase, so reaching them means the file needs
// the harness. The import graph is followed rather than guessed from the file
// name, so a test that pulls in the harness indirectly is still classified
// correctly.
//
// This file is plain ESM JavaScript, like `tests/runner.mjs`, so that a loader
// problem is reported as a loader problem.

import { spawn } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TESTS_DIR, '..');

/** The modules that make a test file depend on the database harness. */
const HARNESS_MODULES = [join(TESTS_DIR, 'helpers.ts'), join(TESTS_DIR, 'env.mjs')];

/** Extensions tried when an import has no file extension. */
const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json'];

/**
 * The test files this runner owns: every `*.test.ts` directly inside `tests/`.
 *
 * The `tests/vitest/` folder belongs to Vitest (`npm run test:run`), which
 * runs in a browser-like environment, and is deliberately left out.
 */
function listTestFiles() {
  return readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => join(TESTS_DIR, name))
    .sort();
}

/** Every relative import specifier in a source file. */
function relativeImports(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /\bimport\s+['"](\.[^'"]+)['"]/g,
    /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

/** Resolves an import specifier to a file on disk, or null when it is not one. */
function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one; try the next extension.
    }
  }
  for (const extension of RESOLVE_EXTENSIONS) {
    if (extension === '') continue;
    const candidate = join(base, `index${extension}`);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one either.
    }
  }
  return null;
}

/**
 * True when the file reaches the database harness, directly or indirectly.
 *
 * The graph is walked once per file and memoised, because the same module is
 * reached by many test files.
 */
const needsHarnessCache = new Map();

function needsHarness(file, seen = new Set()) {
  if (needsHarnessCache.has(file)) return needsHarnessCache.get(file);

  // A cycle stops the walk; a cycle cannot introduce a dependency that the
  // files inside it do not already have.
  if (seen.has(file)) return false;
  seen.add(file);

  let result = false;
  for (const harness of HARNESS_MODULES) {
    if (file === harness) {
      result = true;
      break;
    }
  }

  if (!result) {
    let source = '';
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      source = '';
    }
    for (const specifier of relativeImports(source)) {
      const resolved = resolveSpecifier(file, specifier);
      if (!resolved) continue;
      if (needsHarness(resolved, seen)) {
        result = true;
        break;
      }
    }
  }

  // Only the outermost call may write the cache; an inner call may still be
  // walking the graph.
  if (seen.size === 1) needsHarnessCache.set(file, result);
  return result;
}

/**
 * The test files that can run without the database.
 */
function selectPureFiles() {
  const all = listTestFiles();
  const pure = [];
  const needsHarnessFiles = [];
  for (const file of all) {
    if (needsHarness(file)) needsHarnessFiles.push(file);
    else pure.push(file);
  }
  return { pure, needsHarnessFiles };
}

/**
 * Test files that need a credential this environment does not have.
 *
 * A file listed here is SKIPPED, never reported as passed. The notice below
 * states it plainly, so a skipped file is visible in the output rather than
 * quietly absent.
 */
const CREDENTIAL_GATED = [
  // The provider configuration and the live provider calls. They need an AI
  // provider key; without one the provider cannot serve them.
  { file: 'openrouter.test.ts', needs: 'an AI provider key (GEMINI_API_KEY or OPENROUTER_API_KEY)' },
];

function credentialGatedFiles(pureFiles) {
  const available = [];
  const gated = [];
  for (const file of pureFiles) {
    const name = relative(TESTS_DIR, file);
    const requirement = CREDENTIAL_GATED.find((entry) => entry.file === name);
    if (!requirement) {
      available.push(file);
      continue;
    }
    const hasKey =
      Boolean(process.env.GEMINI_API_KEY) || Boolean(process.env.OPENROUTER_API_KEY);
    if (hasKey) {
      available.push(file);
    } else {
      gated.push({ file, needs: requirement.needs });
    }
  }
  return { available, gated };
}

function log(message) {
  console.log(`[logic] ${message}`);
}

/** Loads the repository's `.env` into the process environment, if it has one. */
function loadLocalEnv() {
  try {
    const source = readFileSync(join(REPO_ROOT, '.env'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^["']/, '')
        .replace(/["']$/, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No `.env` in this checkout. That is normal in CI.
  }
}

const { pure, needsHarnessFiles } = selectPureFiles();

// The local `.env` is loaded first, so a checkout that has a provider key
// runs the provider tests instead of skipping them.
loadLocalEnv();

const { available, gated } = credentialGatedFiles(pure);

log(`found ${listTestFiles().length} test files`);
log(`${needsHarnessFiles.length} need the database harness and are left to \`npm test\``);
log(`${available.length} run here without a database`);

for (const entry of gated) {
  log(`SKIPPED (not passed): ${entry.file} needs ${entry.needs}`);
}

if (available.length === 0) {
  console.error('[logic] there is nothing to run.');
  process.exit(1);
}

const loaderArgs = ['--test', '--import', 'tsx', '--test-concurrency=4'];
const child = spawn(process.execPath, [...loaderArgs, ...available], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[logic] the test run was stopped by ${signal}.`);
    process.exit(1);
  }
  log(
    code === 0
      ? 'the database-free suite passed.'
      : 'the database-free suite FAILED.'
  );
  process.exit(code ?? 1);
});
