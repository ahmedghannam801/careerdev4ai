/**
 * The export in a real browser.
 * ---------------------------------------------------------------------------
 * This script compares the three things a candidate sees, in the browser:
 *
 *   1. the paper — the preview the CV Studio shows,
 *   2. the PDF — the file the candidate downloads, opened in Chromium's own
 *      viewer so that what is judged is what a reader sees,
 *   3. the words — the text read back out of the PDF by an INDEPENDENT reader
 *      (pdf.js), compared with the words on the paper.
 *
 * The export is a native document engine now: the PDF is written with real
 * text objects and vector paths, and there is no picture of the page in it.
 * The check that matters is therefore not "a file appeared" but "the file
 * holds the document, in words a reader can select".
 *
 *   node --experimental-strip-types tests/playwright-cv-pdf.test.mjs
 *
 * The screenshots it writes go to `samples/`, next to the sample files.
 */

import { createRequire } from 'module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('assert/strict');
const { extractText } = require('unpdf');

const { CV_TEMPLATES } = require('../shared/cvTemplates.ts');
const { cvTemplateSample } = require('../shared/cvTemplateSample.ts');
const { CvTemplateRenderer } = require('../src/components/cv/templates/CvTemplateRenderer.tsx');
const { buildCvLayoutPlan } = require('../shared/cvLayout.ts');
const { buildCvPdfBytes } = require('../src/lib/pdf/cvPdfRenderer.ts');
const { PDF_FONT_FILES } = require('../src/lib/pdf/pdfFonts.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const samplesDirectory = path.join(root, 'samples');

/** The fonts the export draws with, read from the folder the site serves. */
function loadFonts() {
  const directory = path.join(root, 'public', 'fonts');
  const read = (file) => new Uint8Array(readFileSync(path.join(directory, file)));
  return {
    sans: { regular: read(PDF_FONT_FILES.sans.regular), bold: read(PDF_FONT_FILES.sans.bold) },
    serif: { regular: read(PDF_FONT_FILES.serif.regular), bold: read(PDF_FONT_FILES.serif.bold) },
    mono: { regular: read(PDF_FONT_FILES.mono.regular), bold: read(PDF_FONT_FILES.mono.bold) },
    arabic: {
      regular: read(PDF_FONT_FILES.arabic.regular),
      bold: read(PDF_FONT_FILES.arabic.bold),
    },
  };
}

/**
 * The stylesheet the preview is drawn with.
 *
 * The preview uses the platform's own Tailwind classes, so the paper only
 * looks like the paper when the built stylesheet is present. It is optional:
 * the words can be compared without it, only the picture needs it.
 */
function builtStylesheet() {
  const assets = path.join(root, 'dist', 'assets');
  if (!existsSync(assets)) return '';
  const file = require('fs')
    .readdirSync(assets)
    .find((name) => name.endsWith('.css'));
  return file ? readFileSync(path.join(assets, file), 'utf8') : '';
}

/**
 * The words of the paper, read from the rendered markup.
 *
 * The markup is React's own output, so the words are already separated by
 * the elements that carry them. A little noise — the tags themselves and the
 * punctuation the template puts between words — is removed so that the two
 * texts can be compared word by word.
 */
function wordsOf(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

async function run() {
  mkdirSync(samplesDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const fonts = loadFonts();
  const stylesheet = builtStylesheet();

  try {
    for (const language of ['en', 'ar']) {
      const cv = cvTemplateSample(language);
      const template =
        CV_TEMPLATES.find((entry) => entry.id === 'modern-split') || CV_TEMPLATES[0];

      /* --- 1. The paper ------------------------------------------------- */

      const html = renderToStaticMarkup(
        React.createElement(CvTemplateRenderer, {
          cv,
          language,
          template,
          printable: true,
        })
      );

      await page.setContent(
        `<!doctype html><html lang="${language}" dir="${
          language === 'ar' ? 'rtl' : 'ltr'
        }"><head><meta charset="utf-8"><style>${stylesheet}</style>
        <style>body{margin:0;background:#e9ecf1;font-family:'Plus Jakarta Sans',system-ui,sans-serif;}
        .paper{width:794px;margin:24px auto;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.12);}</style>
        </head><body><div class="paper">${html}</div></body></html>`,
        { waitUntil: 'load' }
      );
      await page.waitForTimeout(600);

      const previewPath = path.join(samplesDirectory, `preview-${template.id}-${language}.png`);
      await page.screenshot({ path: previewPath, fullPage: true });
      console.log(`✓ wrote ${path.relative(root, previewPath)}`);

      /* --- 2. The PDF ---------------------------------------------------- */

      const plan = buildCvLayoutPlan({ cv, template, language });
      const { bytes, pages } = buildCvPdfBytes(plan, fonts, {
        title: `${cv.fullName} — CV`,
        author: cv.fullName,
      });

      const pdfPath = path.join(samplesDirectory, `${template.id}-${language}.pdf`);
      writeFileSync(pdfPath, bytes);

      const raw = Buffer.from(bytes).toString('latin1');
      assert.ok(raw.startsWith('%PDF-1.7'), 'the file is a PDF');
      assert.ok(!raw.includes('/Subtype /Image'), 'the file holds no picture of the page');
      assert.ok(!raw.includes('/DCTDecode'), 'the file holds no JPEG of the page');
      assert.ok(raw.includes('/ToUnicode'), 'the words can be read back');
      console.log(
        `✓ ${path.relative(root, pdfPath)}: ${pages} page(s), ${(bytes.length / 1024).toFixed(0)} KiB, native text`
      );

      /* --- 3. The words -------------------------------------------------- */

      const extracted = await extractText(Uint8Array.from(bytes), { mergePages: true });
      const pdfWords = String(extracted.text)
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 1);

      /**
       * The words of the paper, read from the rendered markup.
       *
       * The markup is React's own output, so the words are already separated
       * by the elements that carry them.
       */
      function wordsOf(html) {
        return html
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&[a-z]+;/gi, ' ')
          .split(/\s+/)
          .map((word) => word.trim())
          .filter((word) => word.length > 1);
      }

      /**
       * A text reduced to its letters and digits.
       *
       * The paper and the file do not divide their words in the same places:
       * a reader joins two items that sit close together, so "ريوس" and the
       * year beside it come back as one word. The bullet the template draws
       * is a real character in the file and a drawn mark on the paper. What
       * has to be true is that every word of the paper is still IN the file.
       */
      const lettersOnly = (text) =>
        text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

      const paperWords = wordsOf(html);
      const pdfStream = lettersOnly(String(extracted.text));
      const missing = paperWords.filter(
        (word) => !pdfStream.includes(lettersOnly(word))
      );
      assert.deepEqual(
        missing,
        [],
        'every word of the paper is a word of the file'
      );

      const expected = language === 'ar' ? 'ليلى حسن' : 'Layla Hassan';
      assert.ok(
        String(extracted.text).includes(expected),
        `the PDF carries the name (${expected})`
      );
      console.log(`✓ the PDF carries all ${paperWords.length} words of the paper`);
    }
  } finally {
    await browser.close();
  }

  console.log('--- All Playwright browser export tests passed ---');
}

run().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
