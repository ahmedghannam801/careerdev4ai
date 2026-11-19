import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

function documentXml(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml, 'the export must contain word/document.xml');
  return new TextDecoder().decode(xml);
}

describe('DOCX OpenXML template fidelity improvements', () => {
  it('renders timeline templates with Word-native rail tables and accent nodes', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find((t) => t.id === 'professional-timeline');
    assert.ok(template, 'professional-timeline template exists');

    const buffer = await buildCvDocx({ cv, language: 'en', template });
    const xml = documentXml(buffer);

    // Node glyph ● in accent
    assert.ok(xml.includes('●'), 'timeline must include node glyph ●');
    // Rail border (right border in LTR)
    assert.match(xml, /<w:right w:val="single"[^>]*w:sz="8"/, 'timeline must have right rail border in LTR');
    // Table layout fixed
    assert.match(xml, /<w:tblLayout w:type="fixed"\/>/);
  });

  it('renders timeline rail on the left in Arabic RTL', async () => {
    const cv = cvTemplateSample('ar');
    const template = CV_TEMPLATES.find((t) => t.id === 'professional-timeline');
    assert.ok(template);

    const buffer = await buildCvDocx({ cv, language: 'ar', template });
    const xml = documentXml(buffer);

    // Rail border (left border in RTL)
    assert.match(xml, /<w:left w:val="single"[^>]*w:sz="8"/, 'timeline must have left rail border in RTL');
    assert.ok(xml.includes('●'));
  });

  it('renders skills chips with Word-native shading instead of flattening', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find((t) => t.id === 'modern-professional');
    assert.ok(template, 'modern-professional template exists');

    const buffer = await buildCvDocx({ cv, language: 'en', template });
    const xml = documentXml(buffer);

    // Shading on skills chips runs
    assert.match(xml, /<w:shd [^>]*w:fill="F1F5F9"/, 'chips must be shaded');
  });

  it('renders two-column templates with native Word continuous column flow', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find((t) => t.id === 'creative-editorial');
    assert.ok(template, 'creative-editorial template exists');

    const buffer = await buildCvDocx({ cv, language: 'en', template });
    const xml = documentXml(buffer);

    // Native Word columns element
    assert.match(xml, /<w:cols [^>]*w:num="2"/, 'two-column templates must use 2 columns');
    assert.match(xml, /<w:cols [^>]*w:space="360"/, 'two-column templates must set column space');
    assert.match(xml, /<w:type w:val="continuous"\/>/, 'must use continuous section break');
  });

  it('exports all 37 templates successfully without throwing', async () => {
    const enCv = cvTemplateSample('en');
    const arCv = cvTemplateSample('ar');
    assert.equal(CV_TEMPLATES.length, 37, 'exactly 37 templates configured');

    for (const t of CV_TEMPLATES) {
      const enBuf = await buildCvDocx({ cv: enCv, language: 'en', template: t });
      assert.ok(enBuf.length > 5000, `${t.id} (EN) generates valid buffer (${enBuf.length} bytes)`);

      const arBuf = await buildCvDocx({ cv: arCv, language: 'ar', template: t });
      assert.ok(arBuf.length > 5000, `${t.id} (AR) generates valid buffer (${arBuf.length} bytes)`);
    }
  });
});
