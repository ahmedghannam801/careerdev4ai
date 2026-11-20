/**
 * The PDF export: a real document, not a picture of one.
 * ---------------------------------------------------------------------------
 * The export used to rasterise the paper and write each page into the file as
 * a JPEG, with an invisible text layer on top. That is what a "print to PDF"
 * does, and it is not what a CV export should be: the words could not be
 * selected, the file was a photograph of a document, and a recruiter who
 * copied a job title out of it got whatever the text layer happened to hold.
 *
 * These tests hold the export to the promise it makes now.
 *
 *   * The file is a PDF with real text objects. The words are read back by an
 *     INDEPENDENT reader — pdf.js, through unpdf — because a file that only
 *     its own writer can read is a file nobody can read.
 *   * The page is not a picture. There is no image in the file at all: the
 *     rules, the bands and the chips are vector paths, and the type is text.
 *   * The fonts are embedded and subsetted, so the file carries its own
 *     typography and stays small.
 *   * Every template exports in both languages, and the Arabic file is laid
 *     out the way an Arabic reader reads.
 *   * Nothing is drawn outside the page, and nothing overlaps.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import { buildCvPdfBytes } from '../src/lib/pdf/cvPdfRenderer.ts';
import { PDF_FONT_FILES, type PdfFontSources } from '../src/lib/pdf/pdfFonts.ts';
import { PDF_A4_HEIGHT, PDF_A4_WIDTH } from '../src/lib/pdf/pdfWriter.ts';
import { bidiRuns, containsArabicScript } from '../src/lib/pdf/bidi.ts';
import { cvPdfFileName } from '../src/lib/cvPdfExport.ts';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The fonts the document is drawn with.
 *
 * They are read from the same folder the browser fetches them from, so the
 * test draws with the fonts that are actually shipped.
 */
function loadFonts(): PdfFontSources {
  const directory = path.join(root, 'public', 'fonts');
  const read = (file: string): Uint8Array =>
    new Uint8Array(readFileSync(path.join(directory, file)));

  return {
    sans: {
      regular: read(PDF_FONT_FILES.sans.regular),
      bold: read(PDF_FONT_FILES.sans.bold),
    },
    serif: {
      regular: read(PDF_FONT_FILES.serif.regular),
      bold: read(PDF_FONT_FILES.serif.bold),
    },
    mono: {
      regular: read(PDF_FONT_FILES.mono.regular),
      bold: read(PDF_FONT_FILES.mono.bold),
    },
    arabic: {
      regular: read(PDF_FONT_FILES.arabic.regular),
      bold: read(PDF_FONT_FILES.arabic.bold),
    },
  } as PdfFontSources;
}

const fonts = loadFonts();

/** Builds the PDF of a template, in a language, from the sample document. */
function buildPdf(
  template = CV_TEMPLATES[0],
  language: 'en' | 'ar' = 'en'
): { bytes: Uint8Array; pages: number } {
  const cv = cvTemplateSample(language);
  const plan = buildCvLayoutPlan({ cv, template, language });
  const result = buildCvPdfBytes(plan, fonts, {
    title: `${cv.fullName} — CV`,
    author: cv.fullName ?? '',
  });
  return { bytes: result.bytes, pages: result.pages };
}

/** The text of a PDF, read back by pdf.js. */
async function readText(bytes: Uint8Array): Promise<string> {
  const extracted = await extractText(bytes, { mergePages: true });
  return String(extracted.text);
}

/** The text items of a page, with the place they sit on it. */
async function readItems(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber = 1
): Promise<Array<{ text: string; x: number; y: number; width: number }>> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => {
      // A page's items are text items and marked-content items; only the
      // text items carry a string and a place.
      const textItem = item as { str?: string; transform?: number[]; width?: number };
      return {
        text: textItem.str ?? '',
        x: textItem.transform?.[4] ?? 0,
        y: textItem.transform?.[5] ?? 0,
        width: textItem.width ?? 0,
      };
    })
    .filter((item) => item.text.trim().length > 0);
}

/* -------------------------------------------------------------------------- */
/* The file                                                                    */
/* -------------------------------------------------------------------------- */

describe('the PDF file', () => {
  test('is a real PDF with a page for every sheet', async () => {
    const { bytes, pages } = buildPdf();

    const header = new TextDecoder().decode(bytes.subarray(0, 8));
    const footer = new TextDecoder().decode(bytes.subarray(-8));
    assert.equal(header, '%PDF-1.7');
    assert.ok(footer.includes('%%EOF'), 'the file is finished');
    assert.ok(bytes.length > 1000, `the file has a body (${bytes.length} bytes)`);

    const pdf = await getDocumentProxy(bytes);
    assert.equal(pdf.numPages, pages, 'every sheet is a page');
    const view = (await pdf.getPage(1)).view;
    assert.ok(
      Math.abs(view[2] - PDF_A4_WIDTH) < 1 && Math.abs(view[3] - PDF_A4_HEIGHT) < 1,
      'the page is A4'
    );
    const metadata = await pdf.getMetadata();
    assert.match(
      String((metadata.info as { Title?: string }).Title),
      /Layla Hassan/,
      'the document title is in the file'
    );
  });

  test('holds real text and not a picture of the page', async () => {
    const { bytes } = buildPdf();
    const raw = Buffer.from(bytes).toString('latin1');

    // There is no picture anywhere in the file. A page that is a picture
    // would carry an image XObject and a JPEG or PNG stream; this one has
    // neither.
    assert.ok(!raw.includes('/Subtype /Image'), 'the file holds no image');
    assert.ok(!raw.includes('/DCTDecode'), 'the file holds no JPEG');
    assert.ok(!raw.includes('/FlateDecode\n>>\nstream\nÿØ'), 'no hidden picture stream');

    const text = await readText(bytes);
    assert.ok(text.includes('Layla Hassan'), 'the candidate name is selectable');
    assert.ok(text.includes('PROFESSIONAL SUMMARY'), 'the headings are selectable');
    assert.ok(text.length > 1500, `the page holds the document (${text.length} characters)`);
  });

  test('embeds the fonts it uses, so the file carries its own typography', async () => {
    const { bytes } = buildPdf();
    const raw = Buffer.from(bytes).toString('latin1');

    assert.ok(raw.includes('/FontFile2'), 'the font program is embedded');
    assert.ok(raw.includes('/Subtype /CIDFontType2'), 'the fonts are TrueType');
    assert.ok(raw.includes('/ToUnicode'), 'the glyphs can be read back');
    assert.ok(raw.includes('/Type0'), 'the text is written as two-byte glyph identifiers');
  });

  test('keeps a link clickable', async () => {
    const { bytes } = buildPdf();
    const pdf = await getDocumentProxy(bytes);
    const annotations = await (await pdf.getPage(1)).getAnnotations();
    const links = annotations.filter((annotation) => annotation.subtype === 'Link');

    assert.ok(links.length > 0, 'the file carries link annotations');
    const urls = links.map((link) => String((link as { url?: string }).url ?? ''));
    assert.ok(
      urls.some((url) => url.includes('example.com')),
      'the links point at the candidate own links'
    );
  });

  test('is small enough to send, because the fonts are subsetted', async () => {
    const { bytes } = buildPdf();
    assert.ok(
      bytes.length < 120 * 1024,
      `the file is smaller than the fonts it draws with (${bytes.length} bytes)`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Every template, in both languages                                           */
/* -------------------------------------------------------------------------- */

describe('every template exports', () => {
  test('in English, with its own text', async () => {
    for (const template of CV_TEMPLATES) {
      const { bytes } = buildPdf(template, 'en');
      const text = await readText(bytes);
      assert.ok(text.includes('Layla Hassan'), `${template.id} carries the name`);
      assert.ok(text.length > 800, `${template.id} carries the document`);
    }
  });

  test('in Arabic, with its own text', async () => {
    for (const template of CV_TEMPLATES) {
      const { bytes } = buildPdf(template, 'ar');
      const text = await readText(bytes);
      assert.ok(text.includes('ليلى حسن'), `${template.id} carries the Arabic name`);
      assert.ok(text.length > 800, `${template.id} carries the Arabic document`);
    }
  });

  test('with the section headings of the document', async () => {
    const template = CV_TEMPLATES.find((entry) => entry.id === 'modern-split') ?? CV_TEMPLATES[0];
    const english = await readText(buildPdf(template, 'en').bytes);
    const arabic = await readText(buildPdf(template, 'ar').bytes);

    assert.ok(english.includes('WORK EXPERIENCE'), 'the English headings are there');
    assert.ok(arabic.includes('الخبرة العملية'), 'the Arabic headings are there');
  });

  /**
   * The Arabic text has to come back out of the file as the words that went
   * in.
   *
   * This is not a cosmetic check. A PDF paints its text in visual order, and
   * a reader that wants the text in reading order reverses the right-to-left
   * runs it finds. A word whose letters are carried by ONE glyph — the font
   * joins "ب" and "ر" into a single ligature — is reversed along with
   * everything else unless the ligature's characters were written in the same
   * visual order as the glyph that carries them. When they are not, "مصر"
   * comes back as "مرص" and "الخبرة" comes back as "الخربة": two different
   * words, and the reader never knows anything went wrong.
   *
   * So every word of the Arabic document is compared, letter by letter, with
   * the word that was written.
   */
  test('with the Arabic words exactly as they were written', async () => {
    const template = CV_TEMPLATES.find((entry) => entry.id === 'modern-split') ?? CV_TEMPLATES[0];
    const text = await readText(buildPdf(template, 'ar').bytes);

    const words = [
      'ليلى حسن',
      'مهندسة منتجات أولى',
      'القاهرة، مصر',
      'الخبرة العملية',
      'المؤهلات العلمية',
      'نايل كوميرس',
      'مارس ٢٠٢٢ – الآن',
    ];

    for (const word of words) {
      assert.ok(
        text.includes(word),
        `"${word}" is in the file (looked for ${[...word]
          .map((character) => character.codePointAt(0))
          .join(' ')})`
      );
    }

    // The digits of the phone number keep their order too: a number is read
    // the same way in every language, and it must not be reversed with the
    // sentence around it.
    assert.ok(text.includes('٠١٠٠ ٠٠٠ ٠٠٠٠'), 'the Arabic phone number keeps its order');
  });

  test('without a blank page', async () => {
    for (const template of CV_TEMPLATES) {
      const { bytes } = buildPdf(template, 'en');
      const pdf = await getDocumentProxy(bytes);
      for (let page = 1; page <= pdf.numPages; page += 1) {
        const items = await readItems(pdf, page);
        assert.ok(items.length > 0, `${template.id} page ${page} is not blank`);
      }
    }
  });

  test('with the whole document, even when it is long', async () => {
    const template = CV_TEMPLATES.find((entry) => entry.id === 'modern-split') ?? CV_TEMPLATES[0];
    const cv = cvTemplateSample('en');
    const long = {
      ...cv,
      summary: Array.from({ length: 120 }, (_, index) => `Long-form detail ${index + 1}`).join(' '),
      experiences: [
        ...cv.experiences,
        ...Array.from({ length: 4 }, (_, index) => ({
          ...cv.experiences[0],
          id: `exp-long-${index}`,
          role: `Engineer ${index + 1}`,
          company: `Company ${index + 1}`,
          bullets: [`A long bullet number ${index + 1} with enough words to fill a line.`],
        })),
      ],
    };

    const plan = buildCvLayoutPlan({ cv: long, template, language: 'en' });
    const { bytes, pages } = buildCvPdfBytes(plan, fonts, { title: 'Long CV' });
    assert.ok(pages > 1, `a long CV is more than one page (${pages})`);

    const text = await readText(bytes);
    assert.ok(text.includes('Long-form detail 1'), 'the first words are there');
    assert.ok(text.includes('Long-form detail 120'), 'the last words are there');
    assert.ok(text.includes('Engineer 4'), 'the last entry is there');
  });

  /**
   * The file must hold the WHOLE document.
   *
   * A section that is laid out but not drawn is the quietest failure there
   * is: the file opens, the page looks like a CV, the heading is there — and
   * the words under the heading are not. The skills block once did exactly
   * that, because the row of chips was drawn from a variable that had already
   * been emptied by the time the page was written.
   *
   * So every skill, every bullet and every entry of every template is
   * checked to be in the file.
   */
  test('with every word of every section', async () => {
    for (const template of CV_TEMPLATES) {
      for (const language of ['en', 'ar'] as const) {
        const cv = cvTemplateSample(language);
        const { bytes } = buildPdf(template, language);
        const text = await readText(bytes);

        // The words are compared as they are read out of the file: a reader
        // joins two items that sit close together, so the comparison looks
        // for the letters of the word rather than for its exact boundaries.
        const letters = (value: string) =>
          value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
        const stream = letters(text);

        const expected: Array<[string, string]> = [
          [cv.fullName ?? '', 'the name'],
          [cv.email, 'the email address'],
          [cv.location, 'the location'],
          ...cv.skillsList.map((skill) => [skill, 'the skill'] as [string, string]),
          ...cv.experiences.map(
            (experience) => [experience.company, 'the employer'] as [string, string]
          ),
          ...cv.experiences.flatMap((experience) =>
            (experience.bullets ?? []).map(
              (bullet) => [bullet, 'the bullet'] as [string, string]
            )
          ),
        ];

        for (const [value, what] of expected) {
          assert.ok(
            stream.includes(letters(value)),
            `${template.id} (${language}) carries ${what}: ${value}`
          );
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

describe('the page', () => {
  test('holds nothing outside its own margins', async () => {
    const { bytes } = buildPdf();
    const pdf = await getDocumentProxy(bytes);
    const view = (await pdf.getPage(1)).view;

    for (let number = 1; number <= pdf.numPages; number += 1) {
      const items = await readItems(pdf, number);
      for (const item of items) {
        assert.ok(item.x >= -1, `nothing hangs off the left of the page (${item.x})`);
        assert.ok(
          item.x + item.width <= view[2] + 1,
          `nothing hangs off the right of the page (${item.x + item.width})`
        );
        assert.ok(item.y >= -1 && item.y <= view[3] + 1, 'the text is on the page');
      }
    }
  });

  test('holds no two words on top of each other', async () => {
    const { bytes } = buildPdf();
    const pdf = await getDocumentProxy(bytes);

    for (let number = 1; number <= pdf.numPages; number += 1) {
      const items = await readItems(pdf, number);
      const rows = new Map<number, typeof items>();
      for (const item of items) {
        const row = Math.round(item.y);
        rows.set(row, [...(rows.get(row) ?? []), item]);
      }

      for (const [row, line] of rows) {
        const sorted = [...line].sort((a, b) => a.x - b.x);
        for (let index = 1; index < sorted.length; index += 1) {
          const previous = sorted[index - 1];
          const current = sorted[index];
          const overlap = previous.x + previous.width - current.x;
          assert.ok(
            overlap <= 1.5,
            `two pieces of text overlap on row ${row}: "${previous.text}" and "${current.text}"`
          );
        }
      }
    }
  });

  test('is laid out the other way round in Arabic', async () => {
    const template = CV_TEMPLATES.find((entry) => entry.id === 'modern-split') ?? CV_TEMPLATES[0];

    const english = await readItems(await getDocumentProxy(buildPdf(template, 'en').bytes));
    const arabic = await readItems(await getDocumentProxy(buildPdf(template, 'ar').bytes));

    // The candidate name is the first thing on the page in both languages.
    const englishName = english.find((item) => item.text.includes('Layla'));
    const arabicName = arabic.find((item) => item.text.includes('ليلى'));
    assert.ok(englishName && arabicName, 'both files carry the name');

    // In English it is on the left of the masthead; in Arabic it is on the
    // right, because that is the side the reading starts from.
    assert.ok(
      englishName.x < arabicName.x,
      `the name moves to the other side (${englishName.x} → ${arabicName.x})`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The bidirectional algorithm                                                  */
/* -------------------------------------------------------------------------- */

describe('the bidirectional algorithm', () => {
  test('leaves an English line alone', () => {
    const runs = bidiRuns('Senior Product Engineer', false);
    assert.equal(runs.map((run) => run.logical).join(''), 'Senior Product Engineer');
    assert.ok(runs.every((run) => !run.rtl), 'nothing reads from right to left');
  });

  test('puts an Arabic line in reading order', () => {
    const runs = bidiRuns('مهندسة منتجات', true);
    assert.equal(runs.map((run) => run.logical).join(''), 'مهندسة منتجات');
    assert.ok(runs.every((run) => run.rtl), 'the whole line reads from right to left');
  });

  test('keeps an English phrase inside an Arabic sentence whole', () => {
    const runs = bidiRuns('مهندسة في TypeScript', true);
    const latin = runs.find((run) => run.logical.includes('TypeScript'));
    assert.ok(latin, 'the English phrase is its own run');
    assert.ok(!latin.rtl, 'the English phrase reads from left to right');
    assert.equal(latin.logical, 'TypeScript', 'and its letters keep their order');
  });

  test('keeps a number together', () => {
    const runs = bidiRuns('مارس ٢٠٢٢ – الآن', true);
    const digits = runs.find((run) => /[٠-٩]/.test(run.logical));
    assert.ok(digits, 'the number is a run of its own');
    assert.equal(digits.logical, '٢٠٢٢', 'the digits keep the order they were written in');
  });

  test('knows the Arabic-Indic digits are Arabic', () => {
    assert.ok(containsArabicScript('٢٠٢٣'), 'the Arabic digits are Arabic script');
    assert.ok(containsArabicScript('القاهرة'), 'the Arabic letters are Arabic script');
    assert.ok(!containsArabicScript('2023'), 'the Latin digits are not Arabic script');
    assert.ok(!containsArabicScript('Layla'), 'the Latin letters are not Arabic script');
  });

  test('does not turn a left-to-right line back to front', () => {
    const runs = bidiRuns('Layla Hassan', false);
    assert.equal(runs[0].logical, 'Layla Hassan');
  });
});

/* -------------------------------------------------------------------------- */
/* The file name                                                                */
/* -------------------------------------------------------------------------- */

describe('the file name', () => {
  test('is the candidate, not the product', () => {
    assert.equal(cvPdfFileName('Ahmed Ebrahim'), 'Ahmed_Ebrahim_CV.pdf');
    assert.equal(cvPdfFileName('  Ahmed   Ebrahim  '), 'Ahmed_Ebrahim_CV.pdf');
    assert.equal(cvPdfFileName('أحمد إبراهيم'), 'أحمد_إبراهيم_CV.pdf');
    assert.equal(cvPdfFileName(''), 'CV_CV.pdf');
    assert.equal(cvPdfFileName(null), 'CV_CV.pdf');
    assert.equal(cvPdfFileName('Élodie Ngo'), 'Elodie_Ngo_CV.pdf');
  });
});

/* -------------------------------------------------------------------------- */
/* The studio                                                                  */
/* -------------------------------------------------------------------------- */

describe('the studio', () => {
  test('exports the document it is editing, without a print dialog', () => {
    const studio = readFileSync(
      new URL('../src/components/views/CVStudioView.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(studio.includes('downloadCvPdf'), 'the studio uses the direct PDF export');
    assert.ok(studio.includes('cv: activeCV'), 'it exports the document it is editing');
    assert.ok(studio.includes('template: studioTemplate'), 'it exports the chosen template');
    assert.ok(studio.includes('language: settings.resumeLanguage'), 'in the chosen language');
    assert.ok(!studio.includes('printCvFromFrame'), 'the print dialog is gone');
    assert.ok(!studio.includes('window.print'), 'the export does not open a print dialog');
    assert.ok(!studio.includes('win.print'), 'the export does not print a frame');
  });

  test('does not rasterise the paper any more', () => {
    const exporter = readFileSync(
      new URL('../src/lib/cvPdfExport.ts', import.meta.url),
      'utf8'
    );
    assert.ok(!exporter.includes('html2canvas'), 'the page is not drawn into a canvas');
    assert.ok(!exporter.includes('data-cv-block'), 'the page breaks are not read from the paper');
    assert.ok(exporter.includes('buildCvLayoutPlan'), 'the file is drawn from the layout plan');
    assert.ok(exporter.includes('buildCvPdfBytes'), 'the bytes are written by the PDF writer');
  });
});
