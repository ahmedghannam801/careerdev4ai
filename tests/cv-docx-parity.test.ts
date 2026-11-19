/**
 * The Word file keeps the shape of the template, not only its words.
 *
 * These checks are about the defects a candidate notices immediately when they
 * open the export: a Letter-sized page instead of A4, a name pushed into the
 * sidebar instead of above both columns, a column that autofits to a different
 * width than the preview, and a card or academic layout flattened into plain
 * paragraphs. Each one is asserted against the package Word actually reads.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unzipSync } from 'fflate';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

function bodyXml(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml, 'the export must contain the editable Word document body');
  return new TextDecoder().decode(xml);
}

function templateById(id: string) {
  const template = CV_TEMPLATES.find((entry) => entry.id === id);
  assert.ok(template, `the catalogue must hold ${id}`);
  return template;
}

async function build(id: string): Promise<string> {
  const template = templateById(id);
  const cv = cvTemplateSample('en');
  const buffer = await buildCvDocx({ cv, language: 'en', template });
  return bodyXml(buffer);
}

describe('the Word page', () => {
  it('is A4, not Word\'s default Letter', async () => {
    const xml = await build('modern-split');
    assert.match(xml, /<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
    assert.doesNotMatch(xml, /w:w="12240"[^>]*w:h="15840"/);
  });

  it('takes its margins from the same layout as the paper', async () => {
    const template = templateById('modern-split');
    const plan = buildCvLayoutPlan({
      cv: cvTemplateSample('en'),
      template,
      language: 'en',
    });
    const xml = await build('modern-split');
    assert.match(xml, new RegExp(`<w:pgMar[^>]*w:top="${plan.spec.marginTwips}"`));
    assert.match(xml, new RegExp(`<w:pgMar[^>]*w:left="${plan.spec.marginTwips}"`));
  });
});

describe('the Word columns', () => {
  it('puts the masthead above both columns, as the paper does', async () => {
    const xml = await build('modern-split');
    const nameAt = xml.indexOf('Layla Hassan');
    // A split masthead is itself a table, so "the first table" is not the
    // column table. The column table is the first one with a fixed grid.
    const fixedAt = xml.indexOf('<w:tblLayout w:type="fixed"/>');
    const columnTableAt = xml.lastIndexOf('<w:tbl>', fixedAt);
    assert.ok(nameAt >= 0, 'the name must be in the document');
    assert.ok(fixedAt > 0 && columnTableAt >= 0, 'a sidebar template must have a column table');
    assert.ok(
      nameAt < columnTableAt,
      'the masthead must come before the column table, not inside one of its cells'
    );
  });

  it('gives the columns a fixed share of the content width', async () => {
    const xml = await build('modern-split');
    assert.match(xml, /<w:tblLayout w:type="fixed"\/>/);
    const template = templateById('modern-split');
    const plan = buildCvLayoutPlan({
      cv: cvTemplateSample('en'),
      template,
      language: 'en',
    });
    const contentWidth = 11906 - plan.spec.marginTwips * 2;
    const asideTwips = Math.round((contentWidth * plan.spec.columns.asidePercent) / 100);
    assert.match(xml, new RegExp(`<w:gridCol w:w="${asideTwips}"`));
  });

  it('draws the accent edge of a sidebar that has one', async () => {
    const xml = await build('modern-split');
    const plan = buildCvLayoutPlan({
      cv: cvTemplateSample('en'),
      template: templateById('modern-split'),
      language: 'en',
    });
    assert.equal(plan.spec.accentPosition, 'side');
    assert.match(xml, new RegExp(`w:color="${plan.spec.accentWord}"`));
    assert.match(xml, /<w:left w:val="single"[^>]*w:sz="12"/);
  });
});

describe('the Word entry shapes', () => {
  it('keeps a card entry as a bordered box with an accent edge', async () => {
    const xml = await build('modern-card');
    const plan = buildCvLayoutPlan({
      cv: cvTemplateSample('en'),
      template: templateById('modern-card'),
      language: 'en',
    });
    // The accent edge is on the reading side: left in English, right in Arabic.
    assert.match(xml, new RegExp(`w:color="${plan.spec.accentWord}"`));
    assert.match(xml, /<w:left w:val="single"[^>]*w:sz="18"/);
    // The card is a table, not a run of loose paragraphs.
    assert.ok((xml.match(/<w:tbl>/g) ?? []).length > 1);
  });

  it('keeps an academic record as two columns, facts on one side and detail on the other', async () => {
    const xml = await build('academic-cv');
    assert.match(xml, /<w:tblLayout w:type="fixed"\/>/);
    // An academic entry is a two-cell row whose cells carry explicit widths.
    assert.ok((xml.match(/<w:tc>/g) ?? []).length >= 4);
    assert.match(xml, /<w:gridCol w:w="\d+"\/><w:gridCol w:w="\d+"\/>/);
  });
});
