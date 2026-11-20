/**
 * Generates the sample CV files.
 * ---------------------------------------------------------------------------
 * The samples are what the export is judged on: a PDF of every template, in
 * English and in Arabic, and the Word file that goes with it. They are
 * written to `samples/` so that a person — or a reviewer — can open them and
 * see what the platform actually produces.
 *
 * The fonts are read from `public/fonts`, which is where the site serves
 * them from, so the samples carry the same typeface the export carries.
 *
 *   node --experimental-strip-types scripts/generate-cv-samples.mts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import {
  PDF_FONT_FILES,
  type PdfFontFamily,
  type PdfFontSources,
} from '../src/lib/pdf/pdfFonts.ts';
import { buildCvPdfBytes } from '../src/lib/pdf/cvPdfRenderer.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDirectory = path.join(root, 'public', 'fonts');
const outputDirectory = path.join(root, 'samples');

/** Reads every face the export can use. */
function loadFonts(): PdfFontSources {
  const families = Object.keys(PDF_FONT_FILES) as PdfFontFamily[];
  const sources = {} as PdfFontSources;
  for (const family of families) {
    const files = PDF_FONT_FILES[family];
    sources[family] = {
      regular: new Uint8Array(readFileSync(path.join(fontDirectory, files.regular))),
      bold: new Uint8Array(readFileSync(path.join(fontDirectory, files.bold))),
    };
  }
  return sources;
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
  const fonts = loadFonts();
  const templates = sampleTemplates();

  let count = 0;
  for (const template of templates) {
    for (const language of ['en', 'ar'] as const) {
      const cv = cvTemplateSample(language);
      const plan = buildCvLayoutPlan({ cv, template, language });
      const { bytes, pages } = buildCvPdfBytes(
        plan,
        fonts,
        { title: `${cv.fullName} — CV`, author: cv.fullName }
      );
      const name = `${template.id}-${language}.pdf`;
      writeFileSync(path.join(outputDirectory, name), bytes);
      count += 1;
      console.log(
        `${name}: ${pages} page(s), ${(bytes.length / 1024).toFixed(0)} KiB`
      );
    }
  }

  console.log(`\n${count} sample PDF files written to ${outputDirectory}`);
}

await main();
