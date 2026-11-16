import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

function documentXml(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml, 'the export must contain the editable Word document body');
  return new TextDecoder().decode(xml);
}

test('every CV template exports an editable DOCX with its template-specific style and content', async () => {
  const cv = cvTemplateSample('en');

  for (const template of CV_TEMPLATES) {
    const buffer = await buildCvDocx({ cv, language: 'en', template });
    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK', `${template.id} is a DOCX ZIP`);

    const xml = documentXml(buffer);
    assert.ok(xml.includes(cv.fullName), `${template.id} retains the candidate name`);
    assert.ok(xml.includes(cv.experiences[0].company), `${template.id} retains experience content`);
    assert.ok(xml.includes(template.accent.replace('#', '').toUpperCase()), `${template.id} retains its accent color`);
    assert.ok(!xml.includes('w:drawing'), `${template.id} content is not rasterized`);
  }
});

test('DOCX preserves Arabic RTL text and long multi-page content without truncating source text', async () => {
  const arabicCv = cvTemplateSample('ar');
  const arabicTemplate = CV_TEMPLATES.find((template) => template.structure.layout === 'sidebar-right')
    ?? CV_TEMPLATES[0];
  const arabicXml = documentXml(
    await buildCvDocx({ cv: arabicCv, language: 'ar', template: arabicTemplate })
  );
  assert.ok(arabicXml.includes(arabicCv.fullName), 'Arabic candidate name remains in the Word XML');
  assert.ok(arabicXml.includes('مهندسة منتجات أولى'), 'Arabic headline remains intact');
  assert.ok(arabicXml.includes(arabicCv.email), 'Latin email remains intact in the Arabic document');
  assert.match(arabicXml, /w:bidi/, 'RTL paragraph settings are present');

  const longCv = cvTemplateSample('en');
  const description = Array.from({ length: 120 }, (_, index) => `Long-form CV detail ${index + 1}`).join(' ');
  longCv.summary = description;
  const longXml = documentXml(
    await buildCvDocx({ cv: longCv, language: 'en', template: CV_TEMPLATES[0] })
  );
  assert.ok(longXml.includes('Long-form CV detail 1'), 'the first long-form detail is present');
  assert.ok(longXml.includes('Long-form CV detail 120'), 'the final long-form detail is not truncated');
});
