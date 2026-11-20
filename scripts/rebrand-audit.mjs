/**
 * Roadmapak rebrand — final consistency audit.
 * -----------------------------------------------------------------------------
 * Searches the whole repository for the previous brand names, the previous
 * production origin, the previous logo asset paths and the previous document
 * metadata, and classifies every remaining occurrence.
 *
 * The classification is not a judgement call per line: each occurrence falls
 * into one of the four categories the migration allows.
 *
 *   A. Migration redirect      — the pointer from the old origin to the new one
 *   B. Historical record       — a report or a log that describes a past state
 *   C. Explicit compatibility  — an allowlist that must keep serving the old
 *                                address for a while
 *   D. Internal identifier     — a name that cannot be renamed from here: a
 *                                live Stripe price key, a database function, a
 *                                browser storage key, an application id, a
 *                                Cloudflare resource name
 *
 * Anything else is an unclassified leftover and is reported as a failure.
 *
 * Run with:  node scripts/rebrand-audit.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The patterns that must not survive anywhere in the runtime tree. */
const FORBIDDEN = [
  { pattern: /careerpilot-(icon|logo)\.png/g, what: 'the previous logo asset path' },
  { pattern: /CareerRa\b/g, what: 'the previous brand name' },
  { pattern: /Careerra\b/g, what: 'the previous brand name' },
];

/**
 * The allowed patterns, with the category each belongs to.
 *
 * The order matters: the first match wins, so the more specific patterns are
 * listed first.
 */
const ALLOWED = [
  {
    category: 'D. Internal identifier',
    pattern: /careerdev4ai-jobs(-dlq)?/g,
    what: 'the Cloudflare Queue resource name (producer and consumer must agree)',
  },
  {
    category: 'D. Internal identifier',
    pattern: /com\.careerpilot\.ai/g,
    what: 'the Android application id and the native OAuth deep-link scheme',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerpilot_(set_updated_at|handle_new_user|daily_credit_allowance|active_plan_code|egypt_date|egypt_next_reset|experience_levels)/g,
    what: 'a PostgreSQL function name owned by the database',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerpilot_(settings|profile|target_role|skills|ai_preferences|notification_preferences|privacy_preferences|token|user)/g,
    what: 'a browser storage key holding the reader’s own state',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerdev4ai_(settings|profile|target_role|skills|ai_preferences|notification_preferences|privacy_preferences|token|user|product_tour_state|feedback_invited)/g,
    what: 'a browser storage key holding the reader’s own state',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerdev4ai:(cv-draft|cv-saved-at):/g,
    what: 'a browser storage key holding an unsaved CV draft',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerdev4ai\.(credits|roadmap\.)/g,
    what: 'a browser storage key holding cached state',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerdev4ai:open-tour/g,
    what: 'an internal DOM event name',
  },
  {
    category: 'D. Internal identifier',
    pattern: /careerpilot4ai/g,
    what: 'the previous Pages project name, kept as a separate deployment',
  },
  {
    category: 'C. Explicit compatibility',
    pattern: /careerdev4ai\.pages\.dev/g,
    what: 'the predecessor origin, kept listed as a valid redirect target',
    /**
     * A report that quotes the predecessor origin is a historical record; it
     * describes a deployment that happened, it does not point anywhere. Only
     * the live configuration may cite the old origin on purpose.
     */
    refine: (relative) =>
      relative.startsWith('docs\\') || relative.startsWith('docs/') ||
      relative.startsWith('design-references\\') || relative.startsWith('design-references/')
        ? 'B. Historical record'
        : 'C. Explicit compatibility',
  },
  {
    category: 'B. Historical record',
    pattern: /CareerDev4AI/g,
    what: 'the previous name in a past report or a log',
  },
  {
    category: 'B. Historical record',
    pattern: /careerdev4ai@/g,
    what: 'a test-run artifact',
  },
];

/** Directories that are build output, dependencies or third-party copies. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.dyad',
  '.freebuff',
  '.tmp-qa',
  'dist',
  'dist-android',
  'dist-jobs',
  'dist-legacy-redirect',
  'coverage',
  'android',
  'samples',
  '.qa',
  'test-results',
  '.wrangler',
]);

/** Files whose content is generated, or which are not part of the product. */
const EXCLUDED_FILES = new Set([
  'package-lock.json',
  '.test-output.txt',
  'test-output.log',
  'verify.log',
  '.careerpilot_state.json',
  'skills-lock.json',
  // The audit script names the forbidden patterns in order to search for them.
  'rebrand-audit.mjs',
  // The migration report is the historical record of the rename. It has to
  // name the previous brand and the previous logo paths, because saying what
  // was renamed is the whole point of the document.
  'ROADMAPAK_MIGRATION_REPORT.md',
]);

const EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc',
  '.html', '.css', '.txt', '.md', '.webmanifest', '.yml', '.yaml',
]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const files = [];
for await (const file of walk(ROOT)) {
  const name = path.basename(file);
  if (EXCLUDED_FILES.has(name)) continue;
  if (!EXTENSIONS.has(path.extname(file)) && name !== '.env') continue;
  files.push(file);
}

const findings = [];
let unclassified = 0;

for (const file of files) {
  const relative = path.relative(ROOT, file);
  const text = await readFile(file, 'utf8');

  for (const { pattern, what } of FORBIDDEN) {
    const regex = new RegExp(pattern.source, 'g');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      regex.lastIndex = 0;
      if (!regex.test(line)) return;
      unclassified += 1;
      findings.push({
        category: 'UNCLASSIFIED',
        relative,
        line: index + 1,
        what,
        excerpt: line.trim().slice(0, 110),
      });
    });
  }

  for (const { category, pattern, what, refine } of ALLOWED) {
    const regex = new RegExp(pattern.source, 'g');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      regex.lastIndex = 0;
      if (!regex.test(line)) return;
      findings.push({
        category: refine ? refine(relative) : category,
        relative,
        line: index + 1,
        what,
        excerpt: line.trim().slice(0, 110),
      });
    });
  }
}

const byCategory = new Map();
for (const finding of findings) {
  const list = byCategory.get(finding.category) ?? [];
  list.push(finding);
  byCategory.set(finding.category, list);
}

console.log('\n=== Roadmapak rebrand — final consistency audit ===\n');

for (const category of [...byCategory.keys()].sort()) {
  const list = byCategory.get(category);
  const filesTouched = new Set(list.map((finding) => finding.relative));
  console.log(`${category} — ${list.length} occurrence(s) across ${filesTouched.size} file(s)`);
  for (const finding of list) {
    console.log(`   ${finding.relative}:${finding.line}  (${finding.what})`);
  }
  console.log('');
}

console.log(`Total occurrences: ${findings.length}`);
console.log(`Unclassified leftovers: ${unclassified}`);
console.log(unclassified === 0 ? '\nAUDIT PASSED — every remaining occurrence is classified.\n' : '\nAUDIT FAILED\n');

process.exitCode = unclassified === 0 ? 0 : 1;
