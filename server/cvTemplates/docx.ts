/**
 * The editable DOCX export.
 *
 * The PDF export is the browser's print of the real rendered template, which
 * is what keeps Arabic shaping and the exact layout. A DOCX cannot carry that
 * layout, so this file does the next best thing honestly: it writes the same
 * document model — the same sections, in the same order, with the same words —
 * as editable Word paragraphs. Nothing is rasterised and nothing is invented.
 */

import type { CVProfile } from '../../src/types/career.ts';
import type { ResumeLanguage } from '../../shared/resumeLanguage.ts';
import type { CvTemplateDefinition } from '../../shared/cvTemplates.ts';
import {
  buildCvTemplateDocument,
  orderCvSections,
  type CvDocumentSection,
} from '../../shared/cvTemplateDocument.ts';

export interface CvDocxInput {
  cv: CVProfile;
  language: ResumeLanguage;
  template: CvTemplateDefinition;
}

/**
 * Builds the DOCX file.
 *
 * The `docx` package is loaded on demand: a candidate who never exports a
 * Word file never pays for the parser at startup.
 */
export async function buildCvDocx(input: CvDocxInput): Promise<Buffer> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import('docx');

  const document = buildCvTemplateDocument(input.cv, input.language);
  const sections = orderCvSections(document.sections, input.template.structure.sectionOrder);
  const rtl = document.rtl;
  const alignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const headingAlignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  const children: InstanceType<typeof Paragraph>[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment,
      bidirectional: rtl,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: document.fullName || 'Curriculum Vitae',
          bold: true,
          size: 40,
          rightToLeft: rtl,
        }),
      ],
    })
  );

  if (document.title) {
    children.push(
      new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: document.title,
            size: 24,
            color: input.template.accent.replace('#', ''),
            rightToLeft: rtl,
          }),
        ],
      })
    );
  }

  if (document.contact.length > 0) {
    children.push(
      new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { after: 160 },
        border: {
          bottom: { color: 'E2E8F0', size: 6, style: BorderStyle.SINGLE, space: 6 },
        },
        children: [
          new TextRun({
            text: document.contact.join('  ·  '),
            size: 19,
            color: '475569',
            rightToLeft: rtl,
          }),
        ],
      })
    );
  }

  const heading = (section: CvDocumentSection, index: number) => {
    const prefix =
      input.template.structure.headingStyle === 'numbered'
        ? `${String(index + 1).padStart(2, '0')}  `
        : '';
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: headingAlignment,
        bidirectional: rtl,
        spacing: { before: 220, after: 80 },
        border: {
          bottom: {
            color: input.template.accent.replace('#', ''),
            size: 8,
            style: BorderStyle.SINGLE,
            space: 4,
          },
        },
        children: [
          new TextRun({
            text: `${prefix}${section.heading}`,
            bold: true,
            size: 21,
            allCaps: input.template.structure.headingStyle === 'uppercase',
            rightToLeft: rtl,
          }),
        ],
      })
    );
  };

  sections.forEach((section, index) => {
    heading(section, index);

    if (section.kind === 'text') {
      children.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 100 },
          children: [new TextRun({ text: section.text ?? '', size: 21, rightToLeft: rtl })],
        })
      );
      return;
    }

    if (section.kind === 'inline') {
      children.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: (section.inline ?? []).join('  ·  '), size: 21, rightToLeft: rtl }),
          ],
        })
      );
      return;
    }

    for (const entry of section.entries) {
      const titleParts = [entry.title, entry.subtitle].filter(Boolean).join(' — ');
      children.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { before: 80, after: 20 },
          keepNext: true,
          children: [
            new TextRun({ text: titleParts, bold: true, size: 21, rightToLeft: rtl }),
            ...(entry.meta
              ? [
                  new TextRun({
                    text: `   ${entry.meta}`,
                    size: 18,
                    color: '64748B',
                    rightToLeft: rtl,
                  }),
                ]
              : []),
          ],
        })
      );

      if (entry.location) {
        children.push(
          new Paragraph({
            alignment,
            bidirectional: rtl,
            spacing: { after: 20 },
            children: [
              new TextRun({ text: entry.location, size: 18, color: '64748B', rightToLeft: rtl }),
            ],
          })
        );
      }

      if (entry.description) {
        children.push(
          new Paragraph({
            alignment,
            bidirectional: rtl,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: entry.description, size: 20, rightToLeft: rtl }),
            ],
          })
        );
      }

      for (const bullet of entry.bullets) {
        children.push(
          new Paragraph({
            alignment,
            bidirectional: rtl,
            bullet: { level: 0 },
            spacing: { after: 20 },
            children: [new TextRun({ text: bullet, size: 20, rightToLeft: rtl })],
          })
        );
      }

      if (entry.tags.length > 0) {
        children.push(
          new Paragraph({
            alignment,
            bidirectional: rtl,
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: entry.tags.join('  ·  '),
                size: 18,
                color: '475569',
                rightToLeft: rtl,
              }),
            ],
          })
        );
      }

      if (entry.url) {
        children.push(
          new Paragraph({
            alignment,
            bidirectional: rtl,
            spacing: { after: 40 },
            children: [
              new ExternalHyperlink({
                link: entry.url,
                children: [
                  new TextRun({
                    text: entry.url,
                    size: 18,
                    color: input.template.accent.replace('#', ''),
                    underline: {},
                    rightToLeft: rtl,
                  }),
                ],
              }),
            ],
          })
        );
      }
    }
  });

  const doc = new Document({
    creator: 'CareerDev4AI',
    title: document.fullName ? `${document.fullName} — CV` : 'CV',
    description: `CV exported with the ${input.template.name} template.`,
    styles: {
      default: {
        document: {
          run: { font: rtl ? 'Arial' : 'Calibri', size: 21 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
