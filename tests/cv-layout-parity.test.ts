/**
 * The paper and the Word file are the same document.
 *
 * A candidate approves a CV on the screen and then downloads it. If the file
 * that arrives is not the document they approved, the preview is a lie, and
 * the whole point of having one is lost.
 *
 * These checks compare the two renderings directly: the same sections in the
 * same order, the same bullet, the same margin, the same type size, the same
 * numbering. They are written against the rendered output of both sides
 * rather than against the code that produces them, so a change that quietly
 * pulls the two apart fails here.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { unzipSync } from 'fflate';

import { CV_TEMPLATES } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import {
  buildCvLayoutPlan,
  cvPixelsToHalfPoints,
  cvPixelsToTwips,
} from '../shared/cvLayout.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import { buildCvDocx } from '../server/cvTemplates/docx.ts';

function documentXml(buffer: Buffer): string {
  const archive = unzipSync(new Uint8Array(buffer));
  const xml = archive['word/document.xml'];
  assert.ok(xml, 'the export must contain the editable Word document body');
  return new TextDecoder().decode(xml);
}

/**
 * The destinations of the links in the file.
 *
 * Word keeps a hyperlink's target in the relationships part of the package and
 * points at it from the body, so a link in the file is only really a link when
 * the relationship carries the destination.
 */
function documentLinkTargets(buffer: Buffer): string[] {
  const archive = unzipSync(new Uint8Array(buffer));
  const rels = archive['word/_rels/document.xml.rels'];
  if (!rels) return [];
  const xml = new TextDecoder().decode(rels);
  const targets: string[] = [];
  const pattern = /Target="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) targets.push(match[1]);
  return targets;
}

/** The text of the file, in the order the file reads. */
function fileText(xml: string): string[] {
  const runs: string[] = [];
  const pattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    runs.push(
      match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    );
  }
  return runs;
}

/**
 * The sections as the file reads them.
 *
 * A template with a sidebar puts the narrow column first or last, so the
 * order of the file is not always the order of the document; this follows the
 * layout and reads the file the way the layout says it is read.
 *
 * The headings are matched one after another rather than all at once: a word
 * that is a heading may also appear inside an entry, and the claim being
 * checked is the ORDER of the sections, not the absence of a word.
 */
function fileSectionOrder(
  xml: string,
  headings: string[]
): Array<{ heading: string; index: number }> {
  const text = fileText(xml);
  const found: Array<{ heading: string; index: number }> = [];
  let cursor = 0;
  for (const heading of headings) {
    let at = -1;
    for (let index = cursor; index < text.length; index += 1) {
      if (text[index].includes(heading)) {
        at = index;
        break;
      }
    }
    found.push({ heading, index: at });
    if (at >= 0) cursor = at + 1;
  }
  return found;
}

describe('the CV paper and the CV Word file are the same document', () => {
  it('carries the same sections in the same order for every template', async () => {
    const cv = cvTemplateSample('en');

    for (const template of CV_TEMPLATES) {
      const plan = buildCvLayoutPlan({ cv, template, language: 'en' });

      // The order the FILE reads in: a sidebar template reads the narrow
      // column first or last, exactly as the layout says.
      const expected = plan.spec.hasSidebar
        ? plan.spec.asideFirst
          ? [...plan.aside, ...plan.main]
          : [...plan.main, ...plan.aside]
        : plan.main;

      const xml = documentXml(
        await buildCvDocx({ cv, language: 'en', template })
      );
      const found = fileSectionOrder(
        xml,
        expected.map((entry) => entry.section.heading)
      );

      for (const entry of found) {
        assert.ok(
          entry.index >= 0,
          `${template.id} keeps the section "${entry.heading}" in the Word file`
        );
      }
      for (let index = 1; index < found.length; index += 1) {
        assert.ok(
          found[index].index > found[index - 1].index,
          `${template.id} reads "${found[index - 1].heading}" before "${found[index].heading}" in the Word file, as on the paper`
        );
      }
    }
  });

  it('marks a bullet the way the paper marks it', async () => {
    const cv = cvTemplateSample('en');

    for (const template of CV_TEMPLATES) {
      const plan = buildCvLayoutPlan({ cv, template, language: 'en' });
      const glyph = plan.spec.bulletGlyph;
      if (!glyph) continue;

      const xml = documentXml(
        await buildCvDocx({ cv, language: 'en', template })
      );
      assert.ok(
        xml.includes(glyph),
        `${template.id} marks its bullets with the same character the paper uses`
      );
      assert.ok(
        !xml.includes('<w:numPr>'),
        `${template.id} does not fall back to a Word bullet list, which cannot carry the template's colour`
      );
    }
  });

  it('has the margin of the paper', async () => {
    const cv = cvTemplateSample('en');

    for (const template of CV_TEMPLATES) {
      const plan = buildCvLayoutPlan({ cv, template, language: 'en' });
      const expected = cvPixelsToTwips(plan.spec.metrics.pad);

      const xml = documentXml(
        await buildCvDocx({ cv, language: 'en', template })
      );
      const margins = /<w:pgMar[^>]*>/.exec(xml);
      assert.ok(margins, `${template.id} sets the page margins`);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const value = new RegExp(`w:${side}="(\\d+)"`).exec(margins[0]);
        assert.ok(value, `${template.id} sets the ${side} margin`);
        assert.equal(
          Number(value[1]),
          expected,
          `${template.id} keeps the ${side} margin of the paper`
        );
      }
    }
  });

  it('is set in the type of the paper', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find(
      (candidate) => candidate.structure.entryStyle === 'stacked'
    ) ?? CV_TEMPLATES[0];
    const plan = buildCvLayoutPlan({ cv, template, language: 'en' });

    const xml = documentXml(await buildCvDocx({ cv, language: 'en', template }));
    const bodySize = cvPixelsToHalfPoints(plan.spec.metrics.font);

    // A bullet is body text, so its run carries the body size.
    const bullet = cv.experiences[0].bullets[0];
    const at = xml.indexOf(bullet);
    assert.ok(at > 0, 'the Word file carries the bullet');
    const window = xml.slice(Math.max(0, at - 600), at);
    const size = /<w:sz w:val="(\d+)"\/>/g;
    let last: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = size.exec(window)) !== null) last = match[1];
    assert.equal(
      Number(last),
      bodySize,
      'the Word file sets the body at the size the paper sets it'
    );
  });

  it('numbers a numbered template the same way on both sides', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find(
      (candidate) => candidate.structure.headingStyle === 'numbered'
    );
    if (!template) return;

    const plan = buildCvLayoutPlan({ cv, template, language: 'en' });
    const first = plan.main[0];
    assert.ok(first, 'the numbered template has a first section');

    const paper = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv,
        template,
        language: 'en',
        printable: true,
      })
    );
    assert.ok(
      paper.includes('01'),
      'the paper numbers its first section'
    );

    const xml = documentXml(await buildCvDocx({ cv, language: 'en', template }));
    assert.ok(
      fileText(xml).some((run) => run.includes('01')),
      'the Word file numbers its first section the same way'
    );
  });
});

describe('the order of the sections', () => {
  it('is the candidate\'s, not the template\'s, once the candidate chooses one', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES.find(
      (candidate) => candidate.structure.layout === 'single'
    ) ?? CV_TEMPLATES[0];

    const before = buildCvLayoutPlan({ cv, template, language: 'en' });
    const original = before.sections.map((section) => section.key);
    assert.ok(original.length > 2, 'the template proposes a real order');

    // The candidate puts the last section first.
    const chosen = [...original].reverse();
    const reordered = { ...cv, sectionOrder: chosen };
    const after = buildCvLayoutPlan({ cv: reordered, template, language: 'en' });

    assert.deepEqual(
      after.sections.map((section) => section.key),
      chosen,
      'the paper follows the order the candidate chose'
    );

    const xml = documentXml(
      await buildCvDocx({ cv: reordered, language: 'en', template })
    );
    const headings = after.main.map((entry) => entry.section.heading);
    const found = fileSectionOrder(xml, headings);
    for (let index = 1; index < found.length; index += 1) {
      assert.ok(
        found[index].index > found[index - 1].index,
        'the Word file follows the order the candidate chose'
      );
    }
  });

  it('falls back to the template when the stored order is damaged', () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const expected = buildCvLayoutPlan({ cv, template, language: 'en' }).sections.map(
      (section) => section.key
    );

    for (const damaged of [
      ['not-a-section', 'also-not-a-section'],
      [],
      ['summary', 'summary', 'summary'],
    ]) {
      const plan = buildCvLayoutPlan({
        cv: { ...cv, sectionOrder: damaged as never },
        template,
        language: 'en',
      });
      assert.deepEqual(
        plan.sections.map((section) => section.key),
        expected,
        `a damaged order (${JSON.stringify(damaged)}) leaves the template's order in place`
      );
    }
  });

  it('keeps a section the candidate did not mention in the template\'s place', () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const full = buildCvLayoutPlan({ cv, template, language: 'en' }).sections.map(
      (section) => section.key
    );

    const partial = buildCvLayoutPlan({
      cv: { ...cv, sectionOrder: [full[full.length - 1]] },
      template,
      language: 'en',
    }).sections.map((section) => section.key);

    assert.equal(partial.length, full.length, 'no section is lost');
    assert.equal(
      partial[0],
      full[full.length - 1],
      'the section the candidate named comes first'
    );
    assert.deepEqual(
      [...partial.slice(1)].sort(),
      [...full.slice(0, -1)].sort(),
      'the sections the candidate did not name keep the template\'s set'
    );
  });
});

/**
 * The language of the document.
 *
 * An Arabic CV is a different document, not an English one with Arabic words
 * in it: it reads right to left, and the Word file has to read right to left
 * too, or the file the candidate sends to an employer is set the wrong way.
 */
describe('an Arabic CV', () => {
  it('is laid out right to left on the paper', () => {
    const cv = cvTemplateSample('ar');
    const template = CV_TEMPLATES[0];

    const paper = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv,
        template,
        language: 'ar',
        printable: true,
      })
    );

    assert.ok(paper.includes('dir="rtl"'), 'the Arabic paper is laid out right to left');
    assert.ok(paper.includes('lang="ar"'), 'the Arabic paper says it is in Arabic');
  });

  it('is set right to left in the Word file', async () => {
    const cv = cvTemplateSample('ar');
    const template = CV_TEMPLATES[0];

    const xml = documentXml(await buildCvDocx({ cv, language: 'ar', template }));

    assert.ok(xml.includes('<w:bidi'), 'the Arabic Word file reads right to left');
    assert.ok(xml.includes('<w:rtl'), 'the Arabic Word file sets its runs right to left');
  });

  it('carries the same sections in the same order as the paper', async () => {
    const cv = cvTemplateSample('ar');
    const template = CV_TEMPLATES[0];

    const plan = buildCvLayoutPlan({ cv, template, language: 'ar' });
    const expected = plan.spec.hasSidebar
      ? plan.spec.asideFirst
        ? [...plan.aside, ...plan.main]
        : [...plan.main, ...plan.aside]
      : plan.main;

    const xml = documentXml(await buildCvDocx({ cv, language: 'ar', template }));
    const found = fileSectionOrder(
      xml,
      expected.map((entry) => entry.section.heading)
    );

    for (const entry of found) {
      assert.ok(
        entry.index >= 0,
        `the Arabic Word file keeps the section "${entry.heading}"`
      );
    }
    for (let index = 1; index < found.length; index += 1) {
      assert.ok(
        found[index].index > found[index - 1].index,
        `the Arabic Word file reads "${found[index - 1].heading}" before "${found[index].heading}", as the paper does`
      );
    }
  });
});

/**
 * The layout the candidate chose.
 *
 * A decision the candidate made about their own document has to reach BOTH
 * renderings. A layout that only the preview knows about is a layout the
 * exported file quietly ignores, which is the exact failure this whole
 * mechanism exists to prevent.
 */
describe('the layout the candidate chose', () => {
  it('keeps the contact details out of the masthead in both renderings', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const moved = { ...cv, layout: { contactPlacement: 'section' as const } };

    const plan = buildCvLayoutPlan({ cv: moved, template, language: 'en' });
    assert.equal(plan.document.headerContact.length, 0, 'the masthead prints no contact details');
    const contactSection = plan.sections.find((section) => section.key === 'contact');
    assert.ok(contactSection, 'the contact details are a section of their own');

    const paper = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv: moved,
        template,
        language: 'en',
        printable: true,
      })
    );
    assert.ok(
      paper.includes(contactSection.heading),
      'the paper prints the contact section'
    );

    const xml = documentXml(await buildCvDocx({ cv: moved, language: 'en', template }));
    assert.ok(
      fileText(xml).some((run) => run.includes(cv.email)),
      'the Word file prints the contact details'
    );
  });

  it('moves the professional links into the masthead in both renderings', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const moved = { ...cv, layout: { linksPlacement: 'header' as const } };

    const plan = buildCvLayoutPlan({ cv: moved, template, language: 'en' });
    assert.equal(plan.document.headerLinks.length, 3, 'the masthead prints the three links');
    assert.ok(
      !plan.sections.some((section) => section.key === 'links'),
      'the links are no longer a section of their own'
    );

    const paper = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv: moved,
        template,
        language: 'en',
        printable: true,
      })
    );
    for (const link of plan.document.headerLinks) {
      assert.ok(
        paper.includes(`href="${link.url}"`),
        `the paper carries the link to ${link.url}`
      );
    }

    const buffer = await buildCvDocx({ cv: moved, language: 'en', template });
    const xml = documentXml(buffer);
    const targets = documentLinkTargets(buffer);
    for (const link of plan.document.headerLinks) {
      assert.ok(
        targets.includes(link.url),
        `the Word file carries the link to ${link.url}`
      );
    }
    assert.ok(
      xml.includes('<w:hyperlink'),
      'the links in the Word file are clickable hyperlinks'
    );
  });

  it('moves one link on its own, leaving the others where they were', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const moved = {
      ...cv,
      links: (cv.links ?? []).map((link) =>
        link.id === 'link-2' ? { ...link, placement: 'header' as const } : link
      ),
    };

    const plan = buildCvLayoutPlan({ cv: moved, template, language: 'en' });
    assert.equal(plan.document.headerLinks.length, 1, 'only the chosen link is in the masthead');
    assert.equal(
      plan.document.headerLinks[0].url,
      'https://github.com/example-layla',
      'the chosen link is the one the candidate moved'
    );

    const linksSection = plan.sections.find((section) => section.key === 'links');
    assert.ok(linksSection, 'the other links are still a section');
    assert.equal(
      linksSection.entries.length,
      2,
      'the other two links are in the section'
    );
  });

  it('reorders the entries inside a section on the paper and in the file', async () => {
    const cv = cvTemplateSample('en');
    const template = CV_TEMPLATES[0];
    const experiences = cv.experiences;
    const reordered = {
      ...cv,
      layout: {
        entryOrder: {
          experience: [experiences[1].id, experiences[0].id],
        },
      },
    };

    const plan = buildCvLayoutPlan({ cv: reordered, template, language: 'en' });
    const section = plan.sections.find((entry) => entry.key === 'experience');
    assert.ok(section, 'the experience section is there');
    assert.equal(
      section.entries[0].id,
      experiences[1].id,
      'the paper reads the entries in the order the candidate chose'
    );

    const xml = documentXml(await buildCvDocx({ cv: reordered, language: 'en', template }));
    const first = xml.indexOf(experiences[1].company);
    const second = xml.indexOf(experiences[0].company);
    assert.ok(first > 0 && second > first, 'the Word file reads the entries in the same order');
  });
});

