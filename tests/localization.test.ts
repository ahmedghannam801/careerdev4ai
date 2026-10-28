/**
 * Localisation completeness.
 *
 * The application renders English source text in the components and looks the
 * string up in the Arabic catalogue. A string that is not in the catalogue
 * silently falls back to English, which is how a partially translated
 * product hides its own gaps.
 *
 * This test finds every `t('...')` call in the source and checks that the
 * Arabic catalogue has an entry for it. It reports the exact coverage, so
 * the number can be measured instead of asserted.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { AR_STRINGS, missingArabicStrings } from '../src/translations/sourceStrings.ts';

const SRC = join(import.meta.dirname, '..', 'src');

/** Every source file that may contain a `t('...')` call. */
function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** The source strings passed to `t(...)` across the application. */
function collectTranslatableSources(): string[] {
  const sources = new Set<string>();
  const pattern = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;

  for (const file of collectSourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      // The captured text is the raw source literal, so the escapes are
      // still in it. The runtime key is the unescaped value, which is what
      // the catalogue is keyed by.
      const value = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (!value) continue;
      // A legacy catalogue key is handled by the keyed translation object,
      // not by the source-string catalogue.
      if (/^[a-z][A-Za-z0-9]*$/.test(value) && !value.includes(' ')) {
        continue;
      }
      sources.add(value);
    }
  }
  return Array.from(sources);
}

describe('localisation', () => {
  const sources = collectTranslatableSources();

  it('finds the translatable strings in the source', () => {
    assert.ok(
      sources.length > 50,
      `expected the source to contain many translatable strings, found ${sources.length}`
    );
  });

  it('has an Arabic entry for every translated string', () => {
    const missing = missingArabicStrings(sources);
    assert.deepEqual(
      missing,
      [],
      `these strings have no Arabic entry:\n${missing.map((value) => `  - ${value}`).join('\n')}`
    );
  });

  it('never returns an empty Arabic string', () => {
    const empty = Object.entries(AR_STRINGS)
      .filter(([, value]) => !value || !value.trim())
      .map(([key]) => key);
    assert.deepEqual(empty, [], `these entries are empty:\n${empty.join('\n')}`);
  });

  it('keeps placeholders intact in every translation', () => {
    const broken: string[] = [];
    for (const [source, translation] of Object.entries(AR_STRINGS)) {
      const sourceTokens = source.match(/\{[^}]+\}/g) ?? [];
      const translationTokens = translation.match(/\{[^}]+\}/g) ?? [];
      const missing = sourceTokens.filter((token) => !translationTokens.includes(token));
      if (missing.length > 0) {
        broken.push(`${source}: missing ${missing.join(', ')}`);
      }
    }
    assert.deepEqual(broken, [], `placeholder mismatch:\n${broken.join('\n')}`);
  });

  it('reports the coverage it has achieved', () => {
    const covered = sources.filter((source) => Boolean(AR_STRINGS[source])).length;
    const pct = sources.length === 0 ? 0 : Math.round((covered / sources.length) * 100);
    console.log(
      `      localisation coverage: ${covered}/${sources.length} source strings (${pct}%)`
    );
    assert.ok(covered > 0);
  });

  it('measures how much user-facing text is still routed through t()', () => {
    /**
     * Counts the user-facing literals that are still rendered as raw English.
     *
     * This is the honest measure of how much of the interface is translated:
     * a string only reaches Arabic when it goes through `t()`.
     */
    const jsxText = />\s*([A-Z][A-Za-z0-9][^<>{}\n]{2,60}?)\s*</g;
    const prop = /\b(?:title|aria-label|placeholder|label|description|emptyMessage|helperText|subtitle|tooltip|message|alt)\s*=\s*"([A-Z][^"]{2,80})"/g;

    let total = 0;
    const byFile: Record<string, number> = {};

    for (const file of collectSourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      let count = 0;
      for (const match of text.matchAll(jsxText)) count += 1;
      for (const match of text.matchAll(prop)) count += 1;
      if (count > 0) {
        byFile[relative(SRC, file)] = count;
        total += count;
      }
    }

    const translated = sources.length;
    console.log(
      `      raw English literals still in the components: ${total} (${translated} strings routed through t())`
    );
    const worst = Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file, count]) => `${file}: ${count}`);
    if (worst.length > 0) console.log(`      largest remaining: ${worst.join(', ')}`);

    assert.ok(total >= 0);
  });
});
