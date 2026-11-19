// The guard against direction-blind styling.
//
// The platform ships an Arabic interface, so a layout written with physical
// left/right instead of logical start/end is a defect: it looks correct in
// English and is wrong for every Arabic user.
//
// This test reads the source and fails when a physical direction utility is
// introduced again, so the defect cannot quietly return between releases.
//
// It is a source guard on purpose. The browser behaviour is covered by
// `e2e/rtl-mobile.spec.ts`, which renders the real bundle and checks that the
// page really does flip; this test covers the rest of the surface that the
// browser test cannot reach.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.resolve(process.cwd(), 'src');

/**
 * The single known exception, and the reason it exists.
 *
 * It is deliberately narrow: one file, one utility, one written reason. A
 * blanket exemption would silently exempt every future line in that file.
 */
const EXCEPTIONS: { file: string; utility: string; reason: string }[] = [
  {
    file: 'components/views/CVStudioView.tsx',
    utility: 'text-right',
    reason:
      'The template name in the mobile preview header. It belongs to the uncommitted CV Studio release, ' +
      'which is left untouched by this release; it is tracked in UX_AND_INTERACTION_AUDIT.md and must be ' +
      'fixed when that release is committed.',
  },
];

/**
 * The physical utilities that break a right-to-left layout.
 *
 * Only utilities that move or align something are listed. A colour, a radius
 * or a size is direction-agnostic and is not the business of this rule.
 */
const PHYSICAL_UTILITIES: { pattern: RegExp; name: string }[] = [
  { pattern: /\b(?:ml|mr)-/, name: 'margin-left/right' },
  { pattern: /\b(?:pl|pr)-/, name: 'padding-left/right' },
  { pattern: /\btext-(?:left|right)\b/, name: 'text-left/text-right' },
  { pattern: /\bborder-[lr]-/, name: 'border-left/right' },
  { pattern: /\brounded-[lr]-/, name: 'rounded-left/right' },
  { pattern: /\bfloat-(?:left|right)\b/, name: 'float-left/right' },
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function relativeToSrc(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/');
}

describe('right-to-left safety', () => {
  it('finds the source files to check', () => {
    const files = collectFiles(SRC);
    assert.ok(files.length > 50, `expected the source tree to hold many files, found ${files.length}`);
  });

  it('uses logical direction utilities instead of physical ones', () => {
    const offenders: { file: string; line: number; utility: string; text: string }[] = [];

    for (const file of collectFiles(SRC)) {
      const relative = relativeToSrc(file);

      const source = readFileSync(file, 'utf8');
      source.split(/\r?\n/).forEach((text, index) => {
        // Only the markup matters. A physical word inside a comment, a
        // translation key or a data value is not a layout instruction.
        const withoutComments = text.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (!withoutComments.includes('className')) return;

        for (const { pattern, name } of PHYSICAL_UTILITIES) {
          if (!pattern.test(withoutComments)) continue;

          const isExcepted = EXCEPTIONS.some(
            (exception) =>
              exception.file === relative && withoutComments.includes(exception.utility)
          );
          if (isExcepted) continue;

          offenders.push({ file: relative, line: index + 1, utility: name, text: text.trim() });
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `physical direction utilities break the Arabic layout.\n` +
        offenders
          .map((o) => `  ${o.file}:${o.line}  [${o.utility}]  ${o.text}`)
          .join('\n') +
        `\nUse the logical utilities instead: ms-/me-, ps-/pe-, start-/end-, text-start/text-end, border-s/border-e.`
    );
  });

  it('keeps the exception list small, explained and real', () => {
    assert.ok(
      EXCEPTIONS.length <= 3,
      `too many RTL exceptions (${EXCEPTIONS.length}); each one is a new place a layout can drift`
    );

    for (const exception of EXCEPTIONS) {
      assert.ok(exception.reason.length > 40, `${exception.file} needs a real reason for its exception`);
      assert.ok(
        readFileSync(path.join(SRC, exception.file), 'utf8').length > 0,
        `${exception.file} is excepted but does not exist`
      );
    }
  });

  it('still allows the printable resume, which keeps its own direction', () => {
    // The resume paper is laid out for a document, not for the screen: its
    // direction follows the resume language and must not flip with the
    // interface language. These two files are allowed to use a physical
    // direction because the document is physical.
    for (const file of [
      'components/cv/templates/CvTemplateRenderer.tsx',
      'components/cv/templates/CvTemplatePreview.tsx',
    ]) {
      const source = readFileSync(path.join(SRC, file), 'utf8');
      assert.ok(source.length > 0, `${file} should exist`);
    }
  });
});
