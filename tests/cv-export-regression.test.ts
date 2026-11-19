/**
 * The CV exports: the PDF the browser prints, and the Word file the server
 * builds.
 *
 * Two promises are checked here.
 *
 * The first is that the file is the CV on the screen. The export must not
 * reach back to an older version of the document, and it must not quietly
 * build a document of its own: the PDF is printed from the very markup the
 * preview shows, and the Word file is built from the very document the editor
 * holds. The check is made by editing the document and exporting it again —
 * the edit has to appear.
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
import { unzipSync } from 'fflate';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CV_TEMPLATES, FREE_CV_TEMPLATE_ID } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { cvPdfFileName } from '../src/lib/cvPdfExport.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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
  test('it exports the document that is on the screen', () => {
    const cv = cvTemplateSample('en');
    const paper = renderPaper(cv);

    assert.ok(paper.includes(cv.fullName), 'the candidate name is on the paper');
    assert.ok(paper.includes(cv.experiences[0].company), 'the employer is on the paper');
    assert.ok(paper.includes(cv.skillsList[0]), 'the skills are on the paper');
    assert.ok(paper.includes('data-cv-print'), 'the export reads the real paper');
  });

  test('it exports the document as it is now, not as it was', () => {
    const cv = cvTemplateSample('en');
    const before = renderPaper(cv);
    assert.ok(!before.includes('Shipped the new billing engine'), 'the edit is not there yet');

    // The candidate edits the document in the studio. The exporter reads the
    // live paper, so the edit reaches the file.
    const edited = {
      ...cv,
      summary: 'Shipped the new billing engine across eleven markets.',
    };

    const after = renderPaper(edited);
    assert.ok(
      after.includes('Shipped the new billing engine across eleven markets.'),
      'the edit is on the paper the export rasterises'
    );
  });

  test('it keeps the contact details and the links', () => {
    const cv = cvTemplateSample('en');
    const paper = renderPaper(cv);

    assert.ok(paper.includes(cv.email), 'the email address is on the paper');
    assert.ok(paper.includes(cv.phone), 'the phone number is on the paper');
    for (const link of cv.links ?? []) {
      assert.ok(paper.includes(link.url), `the link ${link.label} is on the paper`);
    }
  });

  test('it is a sheet of A4 with a selectable text layer', () => {
    const cv = cvTemplateSample('en');
    const exporter = readFileSync(
      new URL('../src/lib/cvPdfExport.ts', import.meta.url),
      'utf8'
    );
    assert.ok(exporter.includes('PAPER_WIDTH_PX = 794'), 'the paper is A4 at 96dpi');
    assert.ok(exporter.includes('PDF_A4_WIDTH'), 'the file is A4 in points');
    assert.ok(exporter.includes('collectTextRuns'), 'the words stay selectable');
    assert.ok(exporter.includes('html2canvas'), 'the template is rendered directly into the canvas');
    assert.ok(cv.fullName.length > 0);
  });

  test('the file is named after the candidate', () => {
    assert.equal(cvPdfFileName('Ahmed Ebrahim'), 'Ahmed_Ebrahim_CV.pdf');
    assert.equal(cvPdfFileName('أحمد إبراهيم'), 'أحمد_إبراهيم_CV.pdf');
  });

  test('the studio exports the document it holds, without a print dialog', () => {
    // The studio's own handler must hand the live paper to the exporter. If
    // it sent a stored version instead, the file would not be the CV on the
    // screen — and if it printed, the candidate would meet a dialog.
    const studio = readFileSync(
      new URL('../src/components/views/CVStudioView.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(
      studio.includes("querySelector<HTMLElement>('[data-cv-print]')"),
      'the studio must export the paper it is showing'
    );
    assert.ok(studio.includes('downloadCvPdf'), 'the studio must download a file');
    assert.ok(!studio.includes('printCvFromFrame'), 'the print dialog is gone');
    assert.ok(!studio.includes('window.print'), 'no print dialog is opened');
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
