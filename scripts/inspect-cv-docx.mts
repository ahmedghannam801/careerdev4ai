/**
 * Inspects the Word files the export produces.
 * ---------------------------------------------------------------------------
 * The DOCX is accepted on its structure, not on its size: the claim is that
 * the file holds an editable Word document — paragraphs, runs, tables, cells,
 * hyperlinks, section properties — and not a picture of the paper.
 *
 * This script opens the package of every sample and counts what is inside
 * it, so the claim can be checked by looking rather than by trusting. The
 * files it writes go to `samples/`, next to the PDF samples.
 *
 *   node --experimental-strip-types scripts/inspect-cv-docx.mts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'samples');

/** Counts how many times a pattern appears in the document body. */
function count(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) ?? []).length;
}

/** The structure of one Word file. */
interface Structure {
  paragraphs: number;
  runs: number;
  tables: number;
  cells: number;
  rows: number;
  hyperlinks: number;
  sectionProperties: number;
  pageBreaks: number;
  bidiParagraphs: number;
  rtlRuns: number;  images: number;
  headers: number;
  footers: number;
  characters: number;
}

function inspect(buffer: Uint8Array): Structure {
  const archive = unzipSync(buffer);
  const xml = new TextDecoder().decode(archive['word/document.xml']);

  // The words of the document, out of the runs that carry them.
  const characters = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .length;

  const names = Object.keys(archive);

  return {
    paragraphs: count(xml, /<w:p(?:\s[^>]*)?>/g),
    runs: count(xml, /<w:r(?:\s[^>]*)?>/g),
    tables: count(xml, /<w:tbl>/g),
    cells: count(xml, /<w:tc>/g),
    rows: count(xml, /<w:tr(?:\s[^>]*)?>/g),
    hyperlinks: count(xml, /<w:hyperlink(?:\s[^>]*)?>/g),
    sectionProperties: count(xml, /<w:sectPr(?:\s[^>]*)?>/g),
    pageBreaks: count(xml, /<w:br[^>]*w:type="page"/g),
    // The library writes the flag with its value: `w:bidi` with no value
    // means "on", `w:bidi w:val="0"` means "off". Only the ones that are on
    // are counted, because an English document writes the flag off on every
    // paragraph and a count that included them would say nothing.
    bidiParagraphs: count(xml, /<w:bidi(?:\s[^>]*)?\/>/g) -
      count(xml, /<w:bidi\s+w:val="(?:0|false)"\s*\/>/g),
    rtlRuns:
      count(xml, /<w:rtl(?:\s[^>]*)?\/>/g) -
      count(xml, /<w:rtl\s+w:val="(?:0|false)"\s*\/>/g),
    images: names.filter((name) => name.startsWith('word/media/')).length,
    headers: names.filter((name) => /^word\/header\d+\.xml$/.test(name)).length,
    footers: names.filter((name) => /^word\/footer\d+\.xml$/.test(name)).length,
    characters,
  };
}

/** The templates the samples cover: every family of every layout. */
function sampleTemplates() {
  const seen = new Set<string>();
  const chosen: typeof CV_TEMPLATES = [];
  for (const template of CV_TEMPLATES) {
    const key = [
      template.structure.layout,
      template.structure.header,
      template.structure.entryStyle,
      template.structure.skillsStyle,
      template.structure.density,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(template);
  }
  return chosen;
}

async function main() {
  mkdirSync(outputDirectory, { recursive: true });

  console.log(
    [
      'template'.padEnd(18),
      'lang'.padEnd(5),
      'KiB'.padStart(6),
      '¶'.padStart(5),
      'runs'.padStart(6),
      'tbl'.padStart(5),
      'cell'.padStart(6),
      'link'.padStart(5),
      'sect'.padStart(5),
      'bidi'.padStart(6),
      'rtl'.padStart(6),
      'img'.padStart(4),
      'chars'.padStart(7),
    ].join(' ')
  );

  for (const template of sampleTemplates()) {
    for (const language of ['en', 'ar'] as const) {
      const cv = cvTemplateSample(language);
      const buffer = await buildCvDocx({ cv, language, template });
      const name = `${template.id}-${language}.docx`;
      writeFileSync(path.join(outputDirectory, name), buffer);

      const structure = inspect(buffer);
      console.log(
        [
          template.id.padEnd(18),
          language.padEnd(5),
          (buffer.length / 1024).toFixed(0).padStart(6),
          String(structure.paragraphs).padStart(5),
          String(structure.runs).padStart(6),
          String(structure.tables).padStart(5),
          String(structure.cells).padStart(6),
          String(structure.hyperlinks).padStart(5),
          String(structure.sectionProperties).padStart(5),
          String(structure.bidiParagraphs).padStart(6),
          String(structure.rtlRuns).padStart(6),
          String(structure.images).padStart(4),
          String(structure.characters).padStart(7),
        ].join(' ')
      );
    }
  }

  console.log(`\nThe Word files are in ${outputDirectory}`);
}

await main();
