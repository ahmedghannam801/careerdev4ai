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
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import('docx');

  const document = buildCvTemplateDocument(input.cv, input.language);
  const sections = orderCvSections(document.sections, input.template.structure.sectionOrder);
  const rtl = document.rtl;
  const structure = input.template.structure;
  const accent = input.template.accent.replace('#', '').toUpperCase();
  const bodyFont =
    input.template.typography === 'serif'
      ? 'Georgia'
      : input.template.typography === 'mono'
        ? 'Courier New'
        : rtl
          ? 'Arial'
          : 'Calibri';
  const baseSpacing =
    structure.density === 'compact' ? 80 : structure.density === 'spacious' ? 180 : 120;
  const headerAlignment =
    structure.header === 'centered' || structure.header === 'banner'
      ? AlignmentType.CENTER
      : structure.header === 'split' && !rtl
        ? AlignmentType.RIGHT
        : rtl
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;
  const alignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const headingAlignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  /**
   * The blocks of the document.
   *
   * A paragraph for most of it, and a table for the two-column layouts: the
   * page is a table when the template has a sidebar.
   */
  const children: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [];
  /**
   * The masthead: the name, the title and the contact line.
   *
   * It is kept apart from the sections because a template with a sidebar
   * puts it in the wide column, not above both.
   */
  const headerBlocks: InstanceType<typeof Paragraph>[] = [];

  headerBlocks.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: headerAlignment,
      bidirectional: rtl,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: document.fullName || 'Curriculum Vitae',
          bold: true,
          size: structure.header === 'compact' ? 34 : 40,
          font: bodyFont,
          rightToLeft: rtl,
        }),
      ],
    })
  );

  if (document.title) {
    headerBlocks.push(
      new Paragraph({
        alignment: headerAlignment,
        bidirectional: rtl,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: document.title,
            size: 24,
            color: accent,
            rightToLeft: rtl,
          }),
        ],
      })
    );
  }

  if (document.contact.length > 0) {
    headerBlocks.push(
      new Paragraph({
        alignment: headerAlignment,
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

  /**
   * The heading of a section.
   *
   * The numbering and the capitals are the template's, so a document exported
   * with a numbered design is numbered in Word as well as on the screen.
   */
  const heading = (section: CvDocumentSection, index: number) => {
    const prefix =
      input.template.structure.headingStyle === 'numbered'
        ? `${String(index + 1).padStart(2, '0')}  `
        : '';
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      alignment: headingAlignment,
      bidirectional: rtl,
      spacing: { before: baseSpacing + 100, after: baseSpacing },
      ...(structure.dividers !== 'none'
        ? {
            border: {
              bottom: {
                color: accent,
                size: structure.dividers === 'double' ? 12 : 8,
                style: structure.dividers === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
                space: 4,
              },
            },
          }
        : {}),
      children: [
        new TextRun({
          text: `${prefix}${section.heading}`,
          bold: true,
          size: structure.headingStyle === 'smallcaps' ? 19 : 21,
          allCaps: structure.headingStyle === 'uppercase',
          smallCaps: structure.headingStyle === 'smallcaps',
          font: structure.headingStyle === 'serif' ? 'Georgia' : bodyFont,
          rightToLeft: rtl,
        }),
      ],
    });
  };

  /**
   * The blocks of one section.
   *
   * They are collected per section rather than pushed straight onto the
   * document, because a template with a sidebar needs to know which blocks
   * belong in the narrow column before it can lay the page out.
   */
  const sectionBlocks = (
    section: CvDocumentSection,
    index: number
  ): InstanceType<typeof Paragraph>[] => {
    const blocks: InstanceType<typeof Paragraph>[] = [heading(section, index)];

    if (section.kind === 'text') {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: baseSpacing },
          children: [new TextRun({ text: section.text ?? '', size: 21, rightToLeft: rtl })],
        })
      );
      return blocks;
    }

    if (section.kind === 'inline') {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: baseSpacing },
          children: [
            new TextRun({ text: (section.inline ?? []).join('  ·  '), size: 21, rightToLeft: rtl }),
          ],
        })
      );
      return blocks;
    }

    for (const entry of section.entries) {
      const titleParts = [entry.title, entry.subtitle].filter(Boolean).join(' — ');
      blocks.push(
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
        blocks.push(
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
        blocks.push(
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
        blocks.push(
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
        blocks.push(
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
        blocks.push(
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
                    color: accent,
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

    return blocks;
  };

  const rendered = sections.map((section, index) => ({
    section,
    blocks: sectionBlocks(section, index),
  }));

  /**
   * The layout of the page.
   *
   * A template with a sidebar puts the short sections — the skills, the
   * languages, the certificates — in a narrow column and the evidence in a
   * wide one. Word carries that as a two-cell table, which is why the
   * exported document has the same shape as the preview rather than the same
   * words in a different arrangement.
   */
  const sidebarSections = input.template.structure.sidebarSections ?? [];
  const hasSidebar =
    (input.template.structure.layout === 'sidebar-left' ||
      input.template.structure.layout === 'sidebar-right') &&
    sidebarSections.length > 0;

  if (hasSidebar) {
    const inSidebar = new Set(sidebarSections);
    const sidebarBlocks = rendered
      .filter((entry) => inSidebar.has(entry.section.key))
      .flatMap((entry) => entry.blocks);
    const mainBlocks = [
      ...headerBlocks,
      ...rendered.filter((entry) => !inSidebar.has(entry.section.key)).flatMap((entry) => entry.blocks),
    ];

    const sidebarCell = new TableCell({
      width: { size: 28, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 0, right: 200 },
      children: sidebarBlocks,
    });
    const mainCell = new TableCell({
      width: { size: 72, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 200, right: 0 },
      children: mainBlocks,
    });

    const row = new TableRow({
      children:
        input.template.structure.layout === 'sidebar-left'
          ? [sidebarCell, mainCell]
          : [mainCell, sidebarCell],
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [row],
      })
    );
  } else {
    children.push(...headerBlocks);
    for (const entry of rendered) children.push(...entry.blocks);
  }

  const doc = new Document({
    creator: 'CareerDev4AI',
    title: document.fullName ? `${document.fullName} — CV` : 'CV',
    description: `CV exported with the ${input.template.name} template.`,
    styles: {
      default: {
        document: {
          run: { font: bodyFont, size: structure.density === 'compact' ? 19 : 21 },
          paragraph: { spacing: { line: structure.density === 'spacious' ? 300 : 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: structure.density === 'spacious' ? 900 : 720,
              right: structure.density === 'compact' ? 600 : 720,
              bottom: structure.density === 'spacious' ? 900 : 720,
              left: structure.density === 'compact' ? 600 : 720,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
