/**
 * Hiding a section is a printing decision, not a deletion.
 *
 * The candidate's words stay on the document and in the records it is built
 * from, so showing a section again puts it back where it was. These checks
 * cover the plan both renderers read, and the two renderings themselves.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { unzipSync } from 'fflate';

import { CV_TEMPLATES, type CvSectionKey } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvLayoutPlan, cvOrderableSections } from '../shared/cvLayout.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

const template = CV_TEMPLATES.find((entry) => entry.id === 'modern-split')!;
const sample = cvTemplateSample('en');

const planWith = (hiddenSections: string[]) =>
  buildCvLayoutPlan({
    cv: { ...sample, layout: { hiddenSections: hiddenSections as CvSectionKey[] } },
    template,
    language: 'en',
  });

const visibleKeys = (plan: ReturnType<typeof buildCvLayoutPlan>) =>
  [...plan.main, ...plan.aside].map((entry) => entry.section.key);

function docxText(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml);
  return new TextDecoder().decode(xml).replace(/<[^>]+>/g, ' ');
}

describe('hidden CV sections', () => {
  it('leaves a hidden section out of both columns', () => {
    const plan = planWith(['skills']);
    assert.deepEqual(plan.hiddenSections, ['skills']);
    assert.ok(!visibleKeys(plan).includes('skills'));
    assert.ok(visibleKeys(plan).includes('experience'));
  });

  it('keeps the hidden section in the document so it can come back', () => {
    const plan = planWith(['skills']);
    assert.ok(plan.sections.some((section) => section.key === 'skills'));
    const again = buildCvLayoutPlan({
      cv: { ...sample, layout: {} },
      template,
      language: 'en',
    });
    assert.ok(visibleKeys(again).includes('skills'));
  });

  it('offers the hidden section to the layout editor, marked hidden', () => {
    const plan = planWith(['skills']);
    const row = cvOrderableSections(plan).find((section) => section.key === 'skills');
    assert.ok(row, 'a hidden section must still be offered');
    assert.equal(row.hidden, true);
    assert.equal(row.column, 'aside');
    const experience = cvOrderableSections(plan).find(
      (section) => section.key === 'experience'
    );
    assert.equal(experience?.hidden, false);
  });

  it('ignores a stored key that is not a section', () => {
    const plan = planWith(['not-a-section', 'skills']);
    assert.deepEqual(plan.hiddenSections, ['skills']);
  });

  it('removes the section from the paper and from the Word file', async () => {
    const cv = { ...sample, layout: { hiddenSections: ['skills' as const] } };
    const markup = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv,
        templateId: 'modern-split',
        language: 'en',
        catalog: CV_TEMPLATES,
      })
    );
    const hiddenHeading = buildCvLayoutPlan({ cv: sample, template, language: 'en' })
      .sections.find((section) => section.key === 'skills')?.heading;
    assert.ok(hiddenHeading);
    assert.ok(!markup.includes(`>${hiddenHeading}<`));

    const buffer = await buildCvDocx({ cv, language: 'en', template });
    assert.ok(!docxText(buffer).includes(hiddenHeading));
  });
});
