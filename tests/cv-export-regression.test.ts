/**
 * The CV exports: the PDF the browser builds, and the Word file the server
 * builds.
 *
 * Two promises are checked here.
 *
 * The first is that the file is the CV on the screen. The export must not
 * reach back to an older version of the document, and it must not quietly
 * build a document of its own: the PDF is drawn from the very layout plan the
 * preview is drawn from, and the Word file is built from the very document the
 * editor holds. The check is made by editing the document and exporting it
 * again — the edit has to appear.
 *
 * The second is that the export is a real file: not empty, not a picture of a
 * CV, carrying the candidate's contact details and links, laid out in the
 * direction the language reads, and long enough to hold a long CV.
 *
 * Everything here runs without a database.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CV_TEMPLATES, FREE_CV_TEMPLATE_ID } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { cvPdfFileName } from '../src/lib/cvPdfExport.ts';
import { buildCvPdfBytes } from '../src/lib/pdf/cvPdfRenderer.ts';
import { PDF_FONT_FILES, type PdfFontSources } from '../src/lib/pdf/pdfFonts.ts';
import { PDF_A4_HEIGHT, PDF_A4_WIDTH } from '../src/lib/pdf/pdfWriter.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const freeTemplate =
  CV_TEMPLATES.find((template) => template.id === FREE_CV_TEMPLATE_ID) ?? CV_TEMPLATES[0];

function renderPaper(cv: ReturnType<typeof cvTemplateSample>, template = freeTemplate): string {
  return renderToStaticMarkup(
    React.createElement(CvTemplateRenderer, {
      cv,
      language: 'en' as const,
      template,
      printable: true,
    })
  );
}

/**
 * The fonts the document is drawn with.
 *
 * They are read from the folder the browser fetches them from, so the test
 * draws with the fonts that are actually shipped.
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

/** Builds the PDF of a document, from the same plan the preview is drawn from. */
function buildPdf(
  cv: ReturnType<typeof cvTemplateSample>,
  template = freeTemplate,
  language: 'en' | 'ar' = 'en'
): Uint8Array {
  const plan = buildCvLayoutPlan({ cv, template, language });
  return buildCvPdfBytes(plan, fonts, {
    title: `${cv.fullName} — CV`,
    author: cv.fullName ?? '',
  }).bytes;
}

/**
 * The text of a PDF, read back by pdf.js.
 *
 * pdf.js hands the file's buffer to its worker and does not give it back, so
 * every reader is given its own copy of the bytes.
 */
async function readPdfText(bytes: Uint8Array): Promise<string> {
  const extracted = await extractText(Uint8Array.from(bytes), { mergePages: true });
  return String(extracted.text);
}

function documentXml(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml, 'the export must contain the editable Word document body');
  return new TextDecoder().decode(xml);
}

/* -------------------------------------------------------------------------- */
/* The PDF                                                                     */
/* -------------------------------------------------------------------------- */

describe('the PDF export', () => {
  test('it exports the document that is on the screen', async () => {
    const cv = cvTemplateSample('en');
    const paper = renderPaper(cv);
    const text = await readPdfText(buildPdf(cv));

    assert.ok(paper.includes(cv.fullName), 'the candidate name is on the paper');
    assert.ok(text.includes(cv.fullName), 'the candidate name is in the file');
    assert.ok(text.includes(cv.experiences[0].company), 'the employer is in the file');
    assert.ok(text.includes(cv.skillsList[0]), 'the skills are in the file');
  });

  test('it exports the document as it is now, not as it was', async () => {
    const cv = cvTemplateSample('en');
    const before = await readPdfText(buildPdf(cv));
    assert.ok(!before.includes('Shipped the new billing engine'), 'the edit is not there yet');

    // The candidate edits the document in the studio. The exporter draws the
    // document in hand, so the edit reaches the file.
    const edited = {
      ...cv,
      summary: 'Shipped the new billing engine across eleven markets.',
    };

    const after = await readPdfText(buildPdf(edited));
    assert.ok(
      after.includes('Shipped the new billing engine across eleven markets.'),
      'the edit is in the file'
    );
  });

  test('it keeps the contact details and the links', async () => {
    const cv = cvTemplateSample('en');
    const bytes = buildPdf(cv);
    const text = await readPdfText(bytes);

    assert.ok(text.includes(cv.email), 'the email address is in the file');
    assert.ok(text.includes(cv.phone), 'the phone number is in the file');

    // The links are real link annotations, so they can be clicked in a reader.
    // They are read back by pdf.js, not by the writer that made them. They
    // may fall on any page, so every page is read.
    const pdf = await getDocumentProxy(Uint8Array.from(bytes));
    const urls: string[] = [];
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const annotations = await (await pdf.getPage(page)).getAnnotations();
      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link') continue;
        urls.push(String((annotation as { url?: string }).url ?? ''));
      }
    }

    for (const link of cv.links ?? []) {
      assert.ok(text.includes(link.url), `the link ${link.label} is written on the page`);
      assert.ok(
        urls.some((url) => url.includes(link.url)),
        `the link ${link.label} is clickable (${urls.join(', ')})`
      );
    }
  });

  test('it is a sheet of A4 with a selectable text layer', async () => {
    const cv = cvTemplateSample('en');
    const bytes = buildPdf(cv);

    // The raw file is read before the readers take it: pdf.js hands the
    // buffer to its worker and does not give it back.
    const source = new TextDecoder('latin1').decode(bytes);

    const mediaBox = source.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox, 'the page declares its size');
    assert.ok(
      Math.abs(Number(mediaBox[1]) - PDF_A4_WIDTH) < 1,
      `the page is A4 wide (${mediaBox[1]})`
    );
    assert.ok(
      Math.abs(Number(mediaBox[2]) - PDF_A4_HEIGHT) < 1,
      `the page is A4 tall (${mediaBox[2]})`
    );

    // The page is drawn, not photographed. There is no image in the file at
    // all: every rule, band and chip is a vector path and every word is a
    // text object.
    assert.ok(!source.includes('/Subtype /Image'), 'the file holds no image of the page');
    assert.ok(!source.includes('/DCTDecode'), 'the file holds no JPEG of the page');

    const text = await readPdfText(bytes);
    assert.ok(text.length > 800, `the page carries words (${text.length} characters)`);

    // The exporter is the native writer. It must not have fallen back to
    // photographing the paper.
    const exporter = readFileSync(path.join(root, 'src', 'lib', 'cvPdfExport.ts'), 'utf8');
    const writer = readFileSync(path.join(root, 'src', 'lib', 'pdf', 'pdfWriter.ts'), 'utf8');
    assert.ok(exporter.includes('PAPER_WIDTH_PX = 794'), 'the paper is A4 at 96dpi');
    assert.ok(writer.includes('PDF_A4_WIDTH'), 'the file is A4 in points');
    assert.ok(exporter.includes('buildCvPdfBytes'), 'the file is written by the PDF writer');
    assert.ok(!exporter.includes('html2canvas'), 'the paper is not rasterised');
    assert.ok(!exporter.includes('collectTextRuns'), 'the words are real text objects');
  });

  test('the file is named after the candidate', () => {
    assert.equal(cvPdfFileName('Ahmed Ebrahim'), 'Ahmed_Ebrahim_CV.pdf');
    assert.equal(cvPdfFileName('أحمد إبراهيم'), 'أحمد_إبراهيم_CV.pdf');
  });

  test('the studio exports the document it holds, without a print dialog', () => {
    // The studio's own handler must hand the live document to the exporter.
    // If it sent a stored version instead, the file would not be the CV on the
    // screen — and if it printed, the candidate would meet a dialog.
    const studio = readFileSync(
      path.join(root, 'src', 'components', 'views', 'CVStudioView.tsx'),
      'utf8'
    );
    assert.ok(studio.includes('downloadCvPdf'), 'the studio must download a file');
    assert.ok(studio.includes('cv: activeCV'), 'the studio must export the document it holds');
    assert.ok(!studio.includes('printCvFromFrame'), 'the print dialog is gone');
    assert.ok(!studio.includes('window.print'), 'no print dialog is opened');
    assert.ok(!studio.includes('html2canvas'), 'the paper is not rasterised');
    assert.ok(
      !studio.includes("querySelector<HTMLElement>('[data-cv-print]')"),
      'the exporter does not read the page back'
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The Word file                                                               */
/* -------------------------------------------------------------------------- */

describe('the Word export', () => {
  test('it is a real file, not an empty one', async () => {
    const cv = cvTemplateSample('en');
    const buffer = await buildCvDocx({ cv, language: 'en', template: freeTemplate });

    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK', 'the file is a Word ZIP');
    assert.ok(buffer.length > 5000, `the file has a body (${buffer.length} bytes)`);
    const xml = documentXml(buffer);
    assert.ok(xml.length > 1000, 'the Word document has content');
  });

  test('it holds the document that is on the screen', async () => {
    const cv = cvTemplateSample('en');
    const xml = documentXml(await buildCvDocx({ cv, language: 'en', template: freeTemplate }));

    assert.ok(xml.includes(cv.fullName), 'the candidate name is in the file');
    assert.ok(xml.includes(cv.experiences[0].company), 'the employer is in the file');
    assert.ok(xml.includes(cv.experiences[0].bullets[0]), 'the bullet is in the file');
  });

  test('it holds the document as it is now, not as it was', async () => {
    const cv = cvTemplateSample('en');
    const before = documentXml(
      await buildCvDocx({ cv, language: 'en', template: freeTemplate })
    );
    assert.ok(!before.includes('Shipped the new billing engine'), 'the edit is not there yet');

    const edited = {
      ...cv,
      summary: 'Shipped the new billing engine across eleven markets.',
    };
    const after = documentXml(
      await buildCvDocx({ cv: edited, language: 'en', template: freeTemplate })
    );
    assert.ok(
      after.includes('Shipped the new billing engine across eleven markets.'),
      'the edit is in the file'
    );
  });

  test('it keeps the contact details and the links', async () => {
    const cv = cvTemplateSample('en');
    const buffer = await buildCvDocx({ cv, language: 'en', template: freeTemplate });
    const xml = documentXml(buffer);

    assert.ok(xml.includes(cv.email), 'the email address is in the file');
    assert.ok(xml.includes(cv.phone), 'the phone number is in the file');
    for (const link of cv.links ?? []) {
      assert.ok(xml.includes(link.url), `the link ${link.label} is in the file`);
    }
  });

  test('it follows the template the candidate chose', async () => {
    const cv = cvTemplateSample('en');

    // The template decides the order the sections are read in.
    const ordered = CV_TEMPLATES.find(
      (template) =>
        template.structure.sectionOrder[0] !== freeTemplate.structure.sectionOrder[0]
    );
    assert.ok(ordered, 'the library holds a template with another reading order');

    const plan = buildCvLayoutPlan({ cv, template: ordered, language: 'en' });
    const xml = documentXml(
      await buildCvDocx({ cv, language: 'en', template: ordered })
    );

    // The sections appear in the order the chosen template asks for.
    const positions = plan.sections
      .filter((section) => section.entries.length > 0 || section.text)
      .map((section) => ({ heading: section.heading, at: xml.indexOf(section.heading) }))
      .filter((entry) => entry.at >= 0);

    assert.ok(positions.length >= 2, 'the file holds more than one section');
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(
        positions[index].at > positions[index - 1].at,
        `${ordered.id} printed "${positions[index].heading}" before "${positions[index - 1].heading}"`
      );
    }
  });

  test('two templates produce two different files', async () => {
    const cv = cvTemplateSample('en');
    const first = documentXml(
      await buildCvDocx({ cv, language: 'en', template: CV_TEMPLATES[0] })
    );
    const second = documentXml(
      await buildCvDocx({ cv, language: 'en', template: CV_TEMPLATES[1] })
    );
    assert.notEqual(first, second, 'the chosen template must change the file');
  });

  test('it reads right to left for an Arabic CV', async () => {
    const arabic = cvTemplateSample('ar');
    const xml = documentXml(
      await buildCvDocx({ cv: arabic, language: 'ar', template: freeTemplate })
    );
    assert.ok(xml.includes(arabic.fullName), 'the Arabic name is in the file');
    assert.match(xml, /w:bidi/, 'the file is laid out right to left');
  });

  test('it holds a long CV without cutting it short', async () => {
    const cv = cvTemplateSample('en');
    const long = {
      ...cv,
      summary: Array.from({ length: 200 }, (_, index) => `Long-form detail ${index + 1}`).join(
        ' '
      ),
    };
    const xml = documentXml(await buildCvDocx({ cv: long, language: 'en', template: freeTemplate }));
    assert.ok(xml.includes('Long-form detail 1'), 'the first detail is in the file');
    assert.ok(xml.includes('Long-form detail 200'), 'the last detail is in the file');
  });

  test('the studio sends the document it holds, not a stored version', () => {
    const studio = readFileSync(
      new URL('../src/components/views/CVStudioView.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(
      studio.includes('cv: activeCV'),
      'the studio must export the document it is editing'
    );

    const api = readFileSync(new URL('../src/lib/cvTemplatesApi.ts', import.meta.url), 'utf8');
    assert.ok(
      api.includes('cv: input.cv'),
      'the request must carry the document itself'
    );
  });
});
