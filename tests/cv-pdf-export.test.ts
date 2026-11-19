/**
 * The PDF export: a real file, not a print dialog.
 *
 * Three promises are checked here.
 *
 * The first is the file itself: a click produces bytes that begin with the
 * PDF header, carry the right number of A4 pages, and can be read by a PDF
 * parser. The pages are rasterised from the real paper, so the file is the
 * document the candidate approved rather than a second layout.
 *
 * The second is that the words survive: an invisible text layer makes the
 * document selectable and searchable, including Arabic, and a link in the
 * document stays clickable.
 *
 * The third is that the export is direct: no print dialog and no new tab.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { extractText, getDocumentProxy } from 'unpdf';
import sharp from 'sharp';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { cvPdfFileName } from '../src/lib/cvPdfExport.ts';
import {
  buildPdf,
  buildFontMapping,
  textLayerOrder,
  PDF_A4_HEIGHT,
  PDF_A4_WIDTH,
  type PdfPage,
} from '../src/lib/pdf/pdfWriter.ts';
import { paginateCvDocument } from '../src/lib/pdf/paginate.ts';

async function whiteJpeg(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ffffff' } })
      .jpeg({ quality: 70 })
      .toBuffer()
  );
}

function page(jpeg: Uint8Array, text: PdfPage['text'] = [], links: PdfPage['links'] = []): PdfPage {
  return {
    jpeg,
    pixelWidth: 794,
    pixelHeight: 1123,
    width: PDF_A4_WIDTH,
    height: PDF_A4_HEIGHT,
    text,
    links,
  };
}

describe('the PDF file', () => {
  test('is a real PDF with one page per sheet', async () => {
    const jpeg = await whiteJpeg();
    const bytes = buildPdf(
      [page(jpeg), page(jpeg)],
      { title: 'Ahmed Ebrahim — CV', author: 'Ahmed Ebrahim' }
    );

    const header = new TextDecoder().decode(bytes.subarray(0, 8));
    const footer = new TextDecoder().decode(bytes.subarray(-8));
    assert.equal(header, '%PDF-1.7');
    assert.ok(footer.includes('%%EOF'), 'the file is finished');
    assert.ok(bytes.length > 1000, `the file has a body (${bytes.length} bytes)`);

    const pdf = await getDocumentProxy(bytes);
    assert.equal(pdf.numPages, 2, 'two sheets are two pages');
    const mediaBox = (await pdf.getPage(1)).view;
    assert.ok(
      Math.abs(mediaBox[2] - PDF_A4_WIDTH) < 1 && Math.abs(mediaBox[3] - PDF_A4_HEIGHT) < 1,
      'the page is A4'
    );
    const metadata = await pdf.getMetadata();
    assert.match(
      String((metadata.info as { Title?: string }).Title),
      /Ahmed Ebrahim/,
      'the document title is in the file'
    );
  });

  test('keeps the words selectable, in both languages', async () => {
    const jpeg = await whiteJpeg();
    const bytes = buildPdf([
      page(jpeg, [
        { text: 'Ahmed Ebrahim', x: 50, top: 60, width: 200, size: 24 },
        { text: 'أحمد إبراهيم', x: 300, top: 60, width: 180, size: 24 },
        { text: 'Senior Engineer at Acme', x: 50, top: 100, width: 250, size: 11 },
      ]),
    ]);

    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = String(extracted.text);
    assert.ok(text.includes('Ahmed Ebrahim'), 'the Latin name is selectable');
    assert.ok(text.includes('أحمد إبراهيم'), 'the Arabic name is selectable and in logical order');
    assert.ok(text.includes('Senior Engineer at Acme'), 'the employer is selectable');
  });

  test('keeps a link clickable', async () => {
    const jpeg = await whiteJpeg();
    const bytes = buildPdf([
      page(jpeg, [], [
        { x: 50, top: 200, width: 120, height: 12, url: 'https://example.com/portfolio' },
      ]),
    ]);

    const pdf = await getDocumentProxy(bytes);
    const annotations = await (await pdf.getPage(1)).getAnnotations();
    const link = annotations.find((annotation) => annotation.subtype === 'Link');
    assert.ok(link, 'the link annotation is in the file');
    assert.equal((link as { url?: string }).url, 'https://example.com/portfolio');
  });

  test('does not add a font for a document with no text', () => {
    const mapping = buildFontMapping([page(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))]);
    assert.equal(mapping.fontCount, 0);
    assert.equal(mapping.map.size, 0);
  });

  test('writes a right-to-left run in the order a reader extracts it', () => {
    assert.equal(textLayerOrder('أحمد إبراهيم'), 'دمحأ ميهاربإ');
    assert.equal(textLayerOrder('Ebrahim أحمد'), 'Ebrahim دمحأ');
    assert.equal(textLayerOrder('experience · 2020'), 'experience · 2020');
  });
});

describe('pagination', () => {
  const pageHeight = 1123;
  const margin = 34;

  test('a short document is one page', () => {
    const windows = paginateCvDocument({ contentHeight: pageHeight, pageHeight, margin });
    assert.equal(windows.length, 1);
    assert.deepEqual(windows[0], { start: 0, end: pageHeight, topInset: 0 });
  });

  test('a long document is cut at the blocks it was given', () => {
    const windows = paginateCvDocument({
      contentHeight: 3000,
      pageHeight,
      margin,
      breaks: [500, 1000, 1500, 2000, 2500],
    });

    assert.equal(windows.length, 3);
    assert.equal(windows[0].start, 0);
    assert.equal(windows[0].end, 1000, 'the first page ends at a block');
    assert.equal(windows[1].topInset, margin, 'a later page keeps a top margin');
    assert.equal(windows[1].start, 1000);
    assert.equal(windows[2].end, 3000, 'the last page reaches the end');
    assert.ok(windows.every((window) => window.end > window.start));
  });

  test('it would rather cut early than split a line', () => {
    const windows = paginateCvDocument({
      contentHeight: 2400,
      pageHeight,
      margin,
      // The only clean break in the first page is at 700.
      breaks: [700, 1700],
    });
    assert.equal(windows[0].end, 700);
  });

  test('a document with no clean break is still paginated', () => {
    const windows = paginateCvDocument({ contentHeight: 2600, pageHeight, margin });
    assert.ok(windows.length >= 3);
    assert.ok(windows.every((window) => window.end > window.start));
    assert.equal(windows[windows.length - 1].end, 2600);
  });

  test('damaged measurements do not produce an empty page', () => {
    const windows = paginateCvDocument({
      contentHeight: 500,
      pageHeight: 0,
      margin: 5000,
      breaks: [-10, 0, 900],
    });
    assert.equal(windows.length, 1);
    assert.ok(windows[0].end > windows[0].start);
  });
});

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

describe('the paper every template exports', () => {
  test('every template renders the same paper the raster reads', () => {
    const cv = cvTemplateSample('en');

    for (const template of CV_TEMPLATES) {
      const paper = renderToStaticMarkup(
        React.createElement(CvTemplateRenderer, {
          cv,
          language: 'en',
          template,
          printable: true,
        })
      );
      assert.ok(paper.includes(`data-cv-template="${template.id}"`), `${template.id} renders`);
      assert.ok(paper.includes('data-cv-print'), `${template.id} is the printable paper`);
      assert.ok(
        /data-cv-block/.test(paper),
        `${template.id} marks the blocks a page may be cut at`
      );
      assert.ok(!paper.includes('<canvas'), `${template.id} is not a picture`);
    }
  });

  test('the studio downloads a file without a print dialog', () => {
    const studio = readFileSync(
      new URL('../src/components/views/CVStudioView.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(studio.includes('downloadCvPdf'), 'the studio uses the direct PDF export');
    assert.ok(
      studio.includes("querySelector<HTMLElement>('[data-cv-print]')"),
      'the studio exports the paper it is showing'
    );
    assert.ok(!studio.includes('printCvFromFrame'), 'the print dialog is gone');
    assert.ok(!studio.includes('window.print'), 'the export does not open a print dialog');
    assert.ok(!studio.includes('win.print'), 'the export does not print a frame');
  });

  test('the exporter draws the live paper and adds a text layer', () => {
    const source = readFileSync(
      new URL('../src/lib/cvPdfExport.ts', import.meta.url),
      'utf8'
    );
    assert.ok(source.includes('buildPdf'), 'the bytes are written by the PDF writer');
    assert.ok(source.includes('collectTextRuns'), 'the text layer is built from the paper');
    assert.ok(source.includes('data-cv-block'), 'the page breaks come from the paper');
    assert.ok(source.includes('html2canvas'), 'each page is drawn from the live markup');
    assert.ok(!source.includes('window.print'), 'no print dialog is involved');
    assert.ok(!source.includes('window.open'), 'no new tab is involved');
  });
});
