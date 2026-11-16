import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { buildCvPrintHtml } from '../src/lib/cvPdfExport.ts';

const styles = {
  links: ['/assets/app.css'],
  inline: ['.cv-template { font-family: Georgia; border-top: 4px solid #2563eb; }'],
};

test('PDF print uses the real preview renderer for every template and preserves the actual paper', () => {
  const cv = cvTemplateSample('en');

  for (const template of CV_TEMPLATES) {
    const paper = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, { cv, language: 'en', template, printable: true })
    );
    const html = buildCvPrintHtml({
      paperHtml: paper,
      title: `${cv.fullName} - ${template.id}`,
      language: 'en',
      direction: 'ltr',
      styles,
    });

    assert.ok(paper.includes(`data-cv-template="${template.id}"`), `${template.id} renders`);
    assert.ok(html.includes(paper), `${template.id} preview markup is printed without remapping`);
    assert.ok(html.includes('href="/assets/app.css"'), `${template.id} retains preview stylesheets`);
    assert.ok(html.includes(styles.inline[0]), `${template.id} retains template styling`);
    assert.ok(html.includes('@page { size: A4; margin: 0; }'), `${template.id} uses A4 page rules`);
    assert.ok(!html.includes('border: 0 !important'), `${template.id} keeps template accent borders`);
    assert.ok(!html.includes('<canvas') && !html.includes('data:image/'), `${template.id} is not rasterized`);
  }

  const arabicCv = cvTemplateSample('ar');
  const arabicTemplate = CV_TEMPLATES[0];
  const arabicPaper = renderToStaticMarkup(
    React.createElement(CvTemplateRenderer, {
      cv: arabicCv,
      language: 'ar',
      template: arabicTemplate,
      printable: true,
    })
  );
  const arabicHtml = buildCvPrintHtml({
    paperHtml: arabicPaper,
    title: `${arabicCv.fullName} - Resume`,
    language: 'ar',
    direction: 'rtl',
    styles,
  });
  assert.ok(arabicHtml.includes(arabicPaper), 'Arabic preview markup is printed intact');
  assert.ok(arabicHtml.includes('lang="ar" dir="rtl"'), 'Arabic document direction is retained');
  assert.ok(arabicHtml.includes(arabicCv.email), 'mixed Arabic and Latin text is retained');
  assert.ok(arabicHtml.includes('break-inside: avoid'), 'headings and list rows avoid page splits');
});
