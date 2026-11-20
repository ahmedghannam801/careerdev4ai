/**
 * Scans the working tree for UTF-8 mojibake.
 *
 * The signature is a byte sequence that was valid UTF-8, read as a single-byte
 * code page and written back out as UTF-8: the em dash and the Arabic
 * characters in the text turn into their Latin-1 stand-ins.
 *
 * Only the files a single-byte code page was applied to are affected, and the
 * whole of such a file is affected, because the misreading happened on read.
 *
 * A PowerShell 5.1 `Get-Content` without an explicit `-Encoding` reads a file
 * without a byte-order mark as the system ANSI code page. Use this script
 * after any edit made that way, and edit files with an editor that reads and
 * writes UTF-8 explicitly.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.dyad',
  '.freebuff',
  'dist',
  'dist-android',
  'dist-jobs',
  'dist-legacy-redirect',
  'coverage',
  'docs',
  'design-references',
  'android',
  'samples',
  '.qa',
  '.tmp-qa',
  'test-results',
]);

/**
 * The detector's own file.
 *
 * It has to hold the sequences it looks for, so it always matches itself.
 */
const EXCLUDED_FILES = new Set(['detect-mojibake.mjs']);

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.html', '.css', '.md', '.txt']);

/** The tell-tale sequences of a mis-decoded UTF-8 file. */
const MOJIBAKE = /[ÂÃØØÙ][-¿]|â€|Ã©|Ã¨|Ã¼|Ø[\x80-\xBF]/;

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

let affected = 0;
for await (const file of walk(ROOT)) {
  if (!EXTENSIONS.has(path.extname(file))) continue;
  if (EXCLUDED_FILES.has(path.basename(file))) continue;
  const text = await readFile(file, 'utf8');
  if (!MOJIBAKE.test(text)) continue;
  affected += 1;
  const line = text.split(/\r?\n/).find((candidate) => MOJIBAKE.test(candidate)) ?? '';
  console.log(`${path.relative(ROOT, file)}\n    ${line.trim().slice(0, 120)}`);
}

console.log(`\n${affected} file(s) carry mojibake.`);
process.exitCode = affected === 0 ? 0 : 1;
