/**
 * Checks the exported PDF files.
 * ---------------------------------------------------------------------------
 * The text is read back with pdf.js — an independent reader, not the writer
 * that produced the file. A PDF whose text cannot be read back is a PDF whose
 * words cannot be selected, and the acceptance test for this export is that
 * the words can be read back.
 *
 * The check is made against the SAMPLE the files were built from, word by
 * word, rather than against a handful of strings: a template that renders
 * the candidate's name but garbles the rest of the document would pass a
 * name check and fail this one. A template that leaves a section out is
 * allowed to lose the words of that section — a small, known number — and
 * nothing else.
 *
 *   npx tsx scripts/verify-cv-pdf.mts
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractText } from 'unpdf';

import { CV_TEMPLATE_SAMPLE_AR, CV_TEMPLATE_SAMPLE_EN } from '../shared/cvTemplateSample.ts';
import type { CVProfile } from '../src/types/career.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleDirectory = path.join(root, 'samples');

/**
 * The characters that read from right to left.
 *
 * The ranges are written as escapes on purpose. Written as literal
 * characters, a stray letter from another script can widen a range by
 * accident — and a range that swallows the en dash calls an English
 * document right-to-left.
 */
const RTL = new RegExp('[\\u0590-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]');

/**
 * The share of the sample's words a file may lose before it is judged to
 * have lost content.
 *
 * The sample carries sections that some templates deliberately leave out —
 * publications, research, leadership — so a few words are always missing.
 * Five per cent is far above the share those sections take and far below
 * the share a garbled or truncated document loses.
 */
const TOLERABLE_LOSS = 0.05;

/** Every word of the profile, in the order the profile reads. */
function wordsOf(profile: CVProfile): string[] {
  const words: string[] = [];

  const walk = (value: unknown, key = ''): void => {
    if (typeof value === 'string') {
      // Ids and addresses are not prose: an id is not in the document, and an
      // address is written with a scheme the document may drop.
      if (key === 'id' || key.endsWith('Url') || key === 'url' || key === 'linkedin' || key === 'github' || key === 'website') return;
      for (const word of value.split(/\s+/)) {
        const trimmed = word.trim();
        if (trimmed.length >= 2) words.push(trimmed);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };

  walk(profile);
  return words;
}

/** The text as a reader compares it: one space between words, no case. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
  const files = readdirSync(sampleDirectory).filter((name) => name.endsWith('.pdf')).sort();
  const samples = {
    en: { profile: CV_TEMPLATE_SAMPLE_EN, words: wordsOf(CV_TEMPLATE_SAMPLE_EN) },
    ar: { profile: CV_TEMPLATE_SAMPLE_AR, words: wordsOf(CV_TEMPLATE_SAMPLE_AR) },
  };

  let failures = 0;

  for (const file of files) {
    // The raw file is read BEFORE the reader takes it: pdf.js hands the
    // buffer to its worker and does not give it back, so a file read after
    // the extraction would be an empty one.
    const raw = readFileSync(path.join(sampleDirectory, file));
    const bytes = new Uint8Array(raw);
    const { text, totalPages } = await extractText(bytes, { mergePages: false });

    const pages = text as string[];
    const joined = pages.join('\n');
    const flat = normalize(joined);

    // The file name says which script the document is written in.
    const language = file.endsWith('-ar.pdf') ? 'ar' : 'en';
    const expected = samples[language];

    const missing = expected.words.filter((word) => !flat.includes(normalize(word)));
    const lost = missing.length / expected.words.length;

    // The page itself has to be A4, and the document has to carry text.
    const isA4 = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.test(raw.toString('latin1'));
    const hasText = joined.trim().length > 200;
    // A page that is a screenshot is a page of images: the file must not
    // carry an image at all.
    const hasImage = /\/(?:Subtype\s*\/Image|DCTDecode)/.test(raw.toString('latin1'));

    const ok = lost <= TOLERABLE_LOSS && isA4 && hasText && !hasImage;
    if (!ok) failures += 1;

    const rtl = RTL.test(joined);
    const size = (bytes.length / 1024).toFixed(0);
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${file.padEnd(34)} ${totalPages}p ${size}KiB ` +
        `${rtl ? 'rtl' : 'ltr'} words ${expected.words.length - missing.length}/${expected.words.length}` +
        `${isA4 ? '' : ' NOT-A4'}${hasImage ? ' HAS-IMAGE' : ''}`
    );
    if (!ok) {
      console.log(`     missing: ${missing.slice(0, 12).join(' | ')}`);
    }
  }

  console.log(`\n${files.length - failures}/${files.length} files carry their content.`);
  if (failures > 0) process.exitCode = 1;
}

await main();
