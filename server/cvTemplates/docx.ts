/**
 * The editable DOCX export.
 *
 * The PDF export is the browser's print of the real rendered template, which
 * is what keeps Arabic shaping and the exact layout. A DOCX cannot carry that
 * layout, so this file does the next best thing honestly: it writes the same
 * document model — the same sections, in the same order, with the same words,
 * in the same type, in the same colours, on the same page — as editable Word
 * paragraphs. Nothing is rasterised and nothing is invented.
 *
 * THE LAYOUT COMES FROM ONE PLACE. Everything this file knows about margins,
 * type, colour, bullets, numbering and columns comes from the shared layout
 * (shared/cvLayout.ts), which is the same description the on-screen preview
 * draws from. A change to a template's density or a template's bullet glyph
 * changes the paper and the file together, because there is only one decision
 * to change.
 *
 * Where the two formats cannot agree, the approximation is made here and is
 * marked as an approximation. The alternatives — a Word bullet list where the
 * paper has an accent-coloured arrow, a page margin of half an inch where the
 * paper has a third, a heading numbered twice — were all real divergences, and
 * they are gone.
 */

import type { CVProfile } from '../../src/types/career.ts';
import type { ResumeLanguage } from '../../shared/resumeLanguage.ts';
import type { CvTemplateDefinition } from '../../shared/cvTemplates.ts';
import type { CvDocumentEntry, CvDocumentSection } from '../../shared/cvTemplateDocument.ts';
import {
  CV_INLINE_SEPARATOR_WORD,
  CV_INK_WORD,
  buildCvLayoutPlan,
  cvDividerDecoration,
  cvHeaderDecoration,
  cvHeadingDecoration,
  cvSkillsDecoration,
  cvPixelsToTwips,
  type CvLayoutSection,
} from '../../shared/cvLayout.ts';

export interface CvDocxInput {
  cv: CVProfile;
  language: ResumeLanguage;
  template: CvTemplateDefinition;
}

/**
 * A sheet of A4 in twips: 210 × 297 mm.
 *
 * Word's default is US Letter. Without an explicit page size the exported CV
 * was 216 mm wide and 279 mm tall, so the same document that filled one sheet
 * on the paper preview could spill onto a second page in Word and every margin
 * measured against the wrong width.
 */
const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;

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
    SectionType,
    ShadingType,
    TabStopType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import('docx');

  const plan = buildCvLayoutPlan({
    cv: input.cv,
    template: input.template,
    language: input.language,
  });
  const spec = plan.spec;
  const document = plan.document;
  const rtl = document.rtl;

  const accent = spec.accentWord;
  const bodyFont = spec.bodyFont.word;
  const headingFont = spec.headingFont.word;
  const bodyFontDeclaration = {
    name: bodyFont,
    ascii: bodyFont,
    hAnsi: bodyFont,
    cs: rtl ? 'IBM Plex Sans Arabic' : bodyFont,
  };
  const headingFontDeclaration = {
    name: headingFont,
    ascii: headingFont,
    hAnsi: headingFont,
    cs: rtl ? 'IBM Plex Sans Arabic' : headingFont,
  };
  const bodySize = spec.bodySizeHalfPoints;
  const smallSize = Math.round(bodySize * 0.92);
  const headingSize = spec.headingSizeHalfPoints;
  const lineSpacing = Math.round(240 * spec.lineHeight);
  const contentWidth = A4_WIDTH_TWIPS - spec.marginTwips * 2;

  const alignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const headingAlignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  const headingDecoration = cvHeadingDecoration(spec);
  const divider = cvDividerDecoration(spec);
  const header = cvHeaderDecoration(spec);

  /** The alignment a masthead is set in, in the direction of the document. */
  const headerAlignment =
    header.alignment === 'center'
      ? AlignmentType.CENTER
      : rtl
        ? header.alignment === 'end'
          ? AlignmentType.LEFT
          : AlignmentType.RIGHT
        : header.alignment === 'end'
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;

  /** A border of the thickness the paper draws, in Word's eighths of a point. */
  const borderSize = (pixels: number): number => Math.max(2, Math.round(pixels * 6));

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  /**
   * The blocks of the document.
   *
   * A paragraph for most of it, and a table for the two-column layouts: the
   * page is a table when the template has a sidebar.
   */
  const children: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [];

  /* ---------------------------------------------------------------------- */
  /* The masthead                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * The masthead: the name, the title and the contact line.
   *
   * It is kept apart from the sections because a template with a sidebar
   * puts it in the wide column, not above both.
   */
  const headerBlocks: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [];

  // The paper paints the name in the page ink, not in Word's automatic black.
  // Passing no colour produced a black masthead beside a slate-grey body.
  const nameRun = (size: number, color: string = CV_INK_WORD.page) =>
    new TextRun({
      text: document.fullName || 'Curriculum Vitae',
      bold: true,
      size,
      color,
      font: headingFontDeclaration,
      rightToLeft: rtl,
    });

  const titleRun = (size: number, color: string, caps: boolean) =>
    new TextRun({
      text: document.title,
      size,
      color,
      allCaps: caps,
      font: bodyFontDeclaration,
      rightToLeft: rtl,
    });

  const contactRun = (size: number, color: string) =>
    new TextRun({
      text: document.headerContact.join(CV_INLINE_SEPARATOR_WORD),
      size,
      color,
      font: bodyFontDeclaration,
      rightToLeft: rtl,
    });

  /**
   * The professional links of the masthead.
   *
   * Word needs an ExternalHyperlink per destination, so the line is built from
   * runs and hyperlinks rather than one string: a link printed in the file is
   * a link the reader can click.
   */
  const headerLinksParagraph = (
    linkAlignment: typeof headerAlignment,
    color: string
  ) => {
    if (document.headerLinks.length === 0) return null;
    const children: Array<InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>> = [];
    document.headerLinks.forEach((link, index) => {
      if (index > 0) {
        children.push(
          new TextRun({
            text: CV_INLINE_SEPARATOR_WORD,
            size: smallSize,
            color,
            rightToLeft: rtl,
          })
        );
      }
      children.push(
        new ExternalHyperlink({
          link: link.url,
          children: [
            new TextRun({
              text: link.label || link.url,
              size: smallSize,
              color,
              underline: {},
              rightToLeft: rtl,
            }),
          ],
        })
      );
    });
    return new Paragraph({
      alignment: linkAlignment,
      bidirectional: rtl,
      spacing: { after: 80 },
      children,
    });
  };

  /** The rule that closes a masthead. */
  const ruleParagraph = (color: string, size: number, double = false) =>
    new Paragraph({
      spacing: { before: 80, after: 160 },
      border: {
        bottom: {
          color,
          size,
          style: double ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
          space: 1,
        },
      },
      children: [new TextRun({ text: '', size: 2 })],
    });

  if (header.kind === 'monogram') {
    // The monogram is a badge of colour beside the name. Word draws it as a
    // shaded cell beside the text, which is the closest it can come to a
    // circle without rasterising the document.
    const initials = document.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    const badgeWidth = Math.round(contentWidth * 0.12);
    const detailWidth = contentWidth - badgeWidth;

    const badgeCell = new TableCell({
      width: { size: badgeWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 0, right: 0 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: rtl,
          children: [
            new TextRun({
              text: initials,
              bold: true,
              size: 36,
              color: 'FFFFFF',
              font: headingFont,
              rightToLeft: rtl,
            }),
          ],
        }),
      ],
    });

    const detailCell = new TableCell({
      width: { size: detailWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 0, bottom: 0, left: 200, right: 0 },
      children: [
        new Paragraph({
          alignment: headerAlignment,
          bidirectional: rtl,
          spacing: { after: 40 },
          children: [nameRun(Math.round(header.nameSizePx * 1.5))],
        }),
        ...(document.title
          ? [
              new Paragraph({
                alignment: headerAlignment,
                bidirectional: rtl,
                spacing: { after: 40 },
                children: [
                  titleRun(
                    smallSize,
                    header.titleColor === 'body' ? CV_INK_WORD.body : accent,
                    header.titleAllCaps
                  ),
                ],
              }),
            ]
          : []),
        ...(document.headerContact.length > 0
          ? [
              new Paragraph({
                alignment: headerAlignment,
                bidirectional: rtl,
                children: [contactRun(smallSize, CV_INK_WORD.secondary)],
              }),
            ]
          : []),
      ],
    });

    headerBlocks.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [badgeWidth, detailWidth],
        visuallyRightToLeft: rtl,
        borders: noBorders,
        rows: [new TableRow({ children: [badgeCell, detailCell] })],
      })
    );
  } else if (header.kind === 'split') {
    // The name on one side and the contact on the other. Word has no
    // "space between", so the two halves are cells in a row.
    const nameWidth = Math.round(contentWidth * 0.52);
    const contactWidth = contentWidth - nameWidth;

    const nameCell = new TableCell({
      width: { size: nameWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.BOTTOM,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [
        new Paragraph({
          alignment: headerAlignment,
          bidirectional: rtl,
          spacing: { after: 40 },
          children: [nameRun(Math.round(header.nameSizePx * 1.5))],
        }),
        ...(document.title
          ? [
              new Paragraph({
                alignment: headerAlignment,
                bidirectional: rtl,
                children: [
                  titleRun(
                    smallSize,
                    header.titleColor === 'body' ? CV_INK_WORD.body : accent,
                    header.titleAllCaps
                  ),
                ],
              }),
            ]
          : []),
      ],
    });

    const contactCell = new TableCell({
      width: { size: contactWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.BOTTOM,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children:
        document.headerContact.length > 0
          ? [
              new Paragraph({
                alignment: rtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
                bidirectional: rtl,
                children: [contactRun(smallSize, CV_INK_WORD.secondary)],
              }),
            ]
          : [],
    });

    headerBlocks.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [nameWidth, contactWidth],
        visuallyRightToLeft: rtl,
        borders: noBorders,
        rows: [new TableRow({ children: [nameCell, contactCell] })],
      })
    );
    if (header.rule !== 'none') {
      headerBlocks.push(ruleParagraph(accent, 16));
    }
  } else if (header.kind === 'banner') {
    // The banner is a band of colour across the top of the page.
    const bannerText = [
      new Paragraph({
        alignment: headerAlignment,
        bidirectional: rtl,
        spacing: { after: 60 },
        children: [nameRun(Math.round(header.nameSizePx * 1.5), 'FFFFFF')],
      }),
      ...(document.title
        ? [
            new Paragraph({
              alignment: headerAlignment,
              bidirectional: rtl,
              spacing: { after: 60 },
              children: [titleRun(smallSize, 'FFFFFF', header.titleAllCaps)],
            }),
          ]
        : []),
      ...(document.headerContact.length > 0
        ? [
            new Paragraph({
              alignment: headerAlignment,
              bidirectional: rtl,
              children: [contactRun(smallSize, 'FFFFFF')],
            }),
          ]
        : []),
    ];

    headerBlocks.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [contentWidth],
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: contentWidth, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
                margins: { top: 240, bottom: 240, left: 240, right: 240 },
                children: bannerText,
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // The mastheads that read down the page.
    const blocks: InstanceType<typeof Paragraph>[] = [];

    if (header.kind === 'stacked') {
      blocks.push(
        new Paragraph({
          spacing: { before: 0, after: 80 },
          border: {
            bottom: { color: accent, size: 30, style: BorderStyle.SINGLE, space: 1 },
          },
          children: [new TextRun({ text: '', size: 2 })],
        })
      );
    }

    blocks.push(
      new Paragraph({
        alignment: headerAlignment,
        bidirectional: rtl,
        spacing: { after: document.title ? 40 : 80 },
        children: [
          nameRun(
            Math.round(header.nameSizePx * 1.5),
            header.kind === 'editorial' ? CV_INK_WORD.heading : undefined
          ),
        ],
      })
    );

    if (document.title) {
      blocks.push(
        new Paragraph({
          alignment: headerAlignment,
          bidirectional: rtl,
          spacing: { after: 60 },
          children: [
            titleRun(
              smallSize,
              header.titleColor === 'body' ? CV_INK_WORD.body : accent,
              header.titleAllCaps
            ),
          ],
        })
      );
    }

    if (document.headerContact.length > 0) {
      blocks.push(
        new Paragraph({
          alignment: headerAlignment,
          bidirectional: rtl,
          spacing: { after: 120 },
          children: [contactRun(smallSize, CV_INK_WORD.secondary)],
        })
      );
    }

    if (header.rule === 'accent') {
      blocks.push(ruleParagraph(accent, 16));
    } else if (header.rule === 'thin') {
      blocks.push(ruleParagraph(CV_INK_WORD.hairline, 6));
    } else if (header.rule === 'double') {
      blocks.push(ruleParagraph(accent, 18, true));
    }

    headerBlocks.push(...blocks);
  }

  // The links the candidate keeps in the masthead are written after the
  // masthead itself, so every header shape carries them without each branch
  // having to repeat the paragraph.
  const headerLinkLine = headerLinksParagraph(headerAlignment, accent);
  if (headerLinkLine) headerBlocks.push(headerLinkLine);

  /* ---------------------------------------------------------------------- */
  /* The sections                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * The heading of a section.
   *
   * The numbering and the capitals are the template's, so a document exported
   * with a numbered design is numbered in Word as well as on the screen — and
   * it is numbered the SAME way, which means the number comes from the shared
   * layout and not from a second count made here.
   */
  const heading = (entry: CvLayoutSection) => {
    const prefix =
      spec.headingStyle === 'numbered'
        ? `${String(entry.number + 1).padStart(2, '0')}  `
        : '';

    const ruleColor = headingDecoration.ruleColor.replace('#', '').toUpperCase();
    const startBorderKey = rtl ? 'right' : 'left';
    const ruleBorder =
      headingDecoration.rule === 'bottom'
        ? {
            bottom: {
              color: ruleColor,
              size: borderSize(headingDecoration.ruleWidthPx),
              style: headingDecoration.ruleDouble ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              space: 4,
            },
          }
        : headingDecoration.rule === 'start'
          ? {
              [startBorderKey]: {
                color: ruleColor,
                size: borderSize(headingDecoration.ruleWidthPx),
                style: BorderStyle.SINGLE,
                space: 6,
              },
            }
          : null;

    const runs: InstanceType<typeof TextRun>[] = [];
    if (prefix) {
      runs.push(
        new TextRun({
          text: prefix,
          bold: true,
          size: headingSize,
          color: accent,
          font: headingFontDeclaration,
          rightToLeft: rtl,
        })
      );
    }
    if (spec.showIcons) {
      // The paper draws a small square of colour beside the heading. The file
      // draws the same square as a character, because a character is the only
      // shape a Word paragraph can carry.
      runs.push(
        new TextRun({
          text: '▪',
          size: headingSize,
          color: accent,
          font: headingFontDeclaration,
          rightToLeft: rtl,
        })
      );
    }
    runs.push(
      new TextRun({
        text: entry.section.heading,
        bold: true,
        size: headingSize,
        color: CV_INK_WORD.heading,
        allCaps: headingDecoration.allCaps,
        smallCaps: headingDecoration.smallCaps,
        italics: headingDecoration.italic,
        font: headingFontDeclaration,
        rightToLeft: rtl,
      })
    );

    const shading =
      divider.kind === 'block' && divider.fill
        ? { type: ShadingType.CLEAR, fill: divider.fill.replace('#', '').toUpperCase(), color: 'auto' }
        : undefined;

    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      alignment: headingAlignment,
      bidirectional: rtl,
      spacing: { before: cvPixelsToTwips(spec.metrics.gap), after: cvPixelsToTwips(7) },
      keepNext: true,
      ...(ruleBorder ? { border: ruleBorder } : {}),
      ...(shading ? { shading } : {}),
      children: runs,
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
    entry: CvLayoutSection,
    availableWidth: number = contentWidth
  ): Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> => {
    const section = entry.section;
    const blocks: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
      heading(entry),
    ];

    if (section.kind === 'text') {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: cvPixelsToTwips(spec.metrics.gap) },
          children: [
            new TextRun({
              text: section.text ?? '',
              size: bodySize,
              color: CV_INK_WORD.body,
              rightToLeft: rtl,
            }),
          ],
        })
      );
      return blocks;
    }

    if (section.kind === 'inline') {
      blocks.push(...inlineBlocks(section, availableWidth));
      return blocks;
    }

    // Each entry decides its own shape: a card is a bordered one-cell table, an
    // academic record is a two-cell record, and the rest are paragraphs. The
    // section only preserves the order.
    for (const cvEntry of section.entries) {
      blocks.push(...entryBlock(cvEntry, availableWidth));
    }
    return blocks;
  };

  /**
   * A list of words: the skills, or the languages.
   *
   * The paper sets the skills as chips, as bars, as columns or as groups. Word
   * has no chips, so the file comes as close as the format allows and says
   * which shape it is standing in for.
   */
  const inlineBlocks = (
    section: CvDocumentSection,
    availableWidth: number = contentWidth
  ): InstanceType<typeof Paragraph>[] => {
    const items = section.inline ?? [];
    if (items.length === 0) return [];
    const decoration = cvSkillsDecoration(spec, section.key);

    if (decoration.columns > 1) {
      // The paper sets the words in two columns. Word sets them in a table.
      const colWidth = Math.floor(availableWidth / decoration.columns);
      const colWidths = Array.from({ length: decoration.columns }, (_, i) =>
        i === decoration.columns - 1 ? availableWidth - colWidth * (decoration.columns - 1) : colWidth
      );
      const rows: InstanceType<typeof TableRow>[] = [];
      const perColumn = Math.ceil(items.length / decoration.columns);
      for (let index = 0; index < perColumn; index += 1) {
        const cells: InstanceType<typeof TableCell>[] = [];
        for (let column = 0; column < decoration.columns; column += 1) {
          const item = items[column * perColumn + index];
          cells.push(
            new TableCell({
              width: { size: colWidths[column], type: WidthType.DXA },
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [
                new Paragraph({
                  alignment,
                  bidirectional: rtl,
                  spacing: { after: 20 },
                  children: [
                    new TextRun({
                      text: item ?? '',
                      size: bodySize,
                      color: CV_INK_WORD.body,
                      rightToLeft: rtl,
                    }),
                  ],
                }),
              ],
            })
          );
        }
        rows.push(new TableRow({ children: cells }));
      }
      return [
        new Table({
          width: { size: availableWidth, type: WidthType.DXA },
          columnWidths: colWidths,
          layout: TableLayoutType.FIXED,
          visuallyRightToLeft: rtl,
          borders: noBorders,
          rows,
        }) as unknown as InstanceType<typeof Paragraph>,
      ];
    }

    if (decoration.marker) {
      // The bars and the groups put a mark in front of every word. The file
      // writes the same mark, in the accent colour.
      return items.map(
        (item) =>
          new Paragraph({
            alignment,
            bidirectional: rtl,
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `${decoration.marker}  `,
                size: bodySize,
                color: decoration.markerAccent ? accent : CV_INK_WORD.secondary,
                font: bodyFontDeclaration,
                rightToLeft: rtl,
              }),
              new TextRun({
                text: item,
                size: bodySize,
                color: CV_INK_WORD.body,
                font: bodyFontDeclaration,
                rightToLeft: rtl,
              }),
            ],
          })
      );
    }

    // Visually distinct Word-native shaded chips
    if (spec.skillsStyle === 'chips' || decoration.mode === 'chips') {
      const chipRuns: InstanceType<typeof TextRun>[] = [];
      const chipFill = 'F1F5F9';
      items.forEach((item, index) => {
        if (index > 0) {
          chipRuns.push(new TextRun({ text: '   ', size: bodySize, font: bodyFontDeclaration }));
        }
        chipRuns.push(
          new TextRun({
            text: `  ${item}  `,
            size: smallSize,
            color: CV_INK_WORD.body,
            shading: {
              type: ShadingType.CLEAR,
              fill: chipFill,
              color: 'auto',
            },
            font: bodyFontDeclaration,
            rightToLeft: rtl,
          })
        );
      });
      return [
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: cvPixelsToTwips(spec.metrics.gap), line: Math.round(lineSpacing * 1.35) },
          children: chipRuns,
        }),
      ];
    }

    // The plain inline line is one paragraph of words separated by inline separator.
    return [
      new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { after: cvPixelsToTwips(spec.metrics.gap) },
        children: [
          new TextRun({
            text: items.join(CV_INLINE_SEPARATOR_WORD),
            size: bodySize,
            color: CV_INK_WORD.body,
            font: bodyFontDeclaration,
            rightToLeft: rtl,
          }),
        ],
      }),
    ];
  };

  /**
   * One entry of a section.
   *
   * The paper sets the title, the date and the employer in a particular way
   * for each entry style, and the file sets them the same way.
   */
  const entryInline = spec.entryStyle === 'inline' || spec.entryStyle === 'grid';

  // The parts of an entry are built separately because two layouts read them
  // in two places: an academic record puts what the thing was on one side and
  // what it involved on the other. Composing the same paragraphs twice is what
  // kept the two halves of that layout in step.
  const entryTitle = (entry: CvDocumentEntry, tabWidth: number = contentWidth) => {
    const titleRuns: InstanceType<typeof TextRun>[] = [
      new TextRun({
        text:
          entryInline && entry.subtitle
            ? `${entry.title} — ${entry.subtitle}`
            : entry.title,
        bold: true,
        size: bodySize,
        color: CV_INK_WORD.heading,
        font: headingFont,
        rightToLeft: rtl,
      }),
    ];

    if (entry.meta) {
      // The paper puts the date at the far end of the title's line. A tab
      // with a right stop puts it at the far end of the paragraph.
      titleRuns.push(
        new TextRun({
          text: `\t${entry.meta}`,
          size: smallSize,
          color: CV_INK_WORD.muted,
          rightToLeft: rtl,
        })
      );
    }

    return new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { before: 60, after: 20 },
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: tabWidth }],
      children: titleRuns,
    });
  };

  const entrySubtitle = (entry: CvDocumentEntry) =>
    new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: entry.subtitle ?? '',
          size: bodySize,
          color: CV_INK_WORD.secondary,
          rightToLeft: rtl,
        }),
      ],
    });

  const entryLocation = (entry: CvDocumentEntry) =>
    new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: entry.location ?? '',
          size: smallSize,
          color: CV_INK_WORD.muted,
          rightToLeft: rtl,
        }),
      ],
    });

  const entryDescription = (entry: CvDocumentEntry) =>
    new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { after: 30 },
      children: [
        new TextRun({
          text: entry.description ?? '',
          size: bodySize,
          color: CV_INK_WORD.body,
          rightToLeft: rtl,
        }),
      ],
    });

  const entryBullets = (entry: CvDocumentEntry): InstanceType<typeof Paragraph>[] =>
    entry.bullets.map((bullet) => {
      const runs: InstanceType<typeof TextRun>[] = [];
      if (spec.bulletGlyph) {
        // The paper writes the bullet into the line, in the accent colour.
        // The file writes the SAME character: Word's own bullet list cannot
        // be given the template's colour, so using it would print a black
        // round bullet where the paper prints an accent-coloured arrow.
        runs.push(
          new TextRun({
            text: `${spec.bulletGlyph}  `,
            size: bodySize,
            color: accent,
            font: bodyFont,
            rightToLeft: rtl,
          })
        );
      }
      runs.push(
        new TextRun({ text: bullet, size: bodySize, color: CV_INK_WORD.body, rightToLeft: rtl })
      );
      return new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { after: 20 },
        indent: spec.bulletGlyph ? { left: 200, hanging: 200 } : undefined,
        children: runs,
      });
    });

  const entryTags = (entry: CvDocumentEntry) =>
    new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: entry.tags.join(CV_INLINE_SEPARATOR_WORD),
          size: smallSize,
          color: CV_INK_WORD.secondary,
          rightToLeft: rtl,
        }),
      ],
    });

  const entryUrl = (entry: CvDocumentEntry) =>
    new Paragraph({
      alignment,
      bidirectional: rtl,
      spacing: { after: 40 },
      children: [
        new ExternalHyperlink({
          link: entry.url ?? '',
          children: [
            new TextRun({
              text: entry.url ?? '',
              size: smallSize,
              color: accent,
              underline: {},
              rightToLeft: rtl,
            }),
          ],
        }),
      ],
    });

  /**
   * The shape of a card on the paper, as a one-cell table in Word.
   *
   * The preview draws a card as a bordered box with an accent edge on the
   * reading side. Word's table can carry exactly those borders, so a card
   * template no longer exports as plain paragraphs and loses its structure.
   */
  const cardTable = (
    blocks: InstanceType<typeof Paragraph>[],
    accentEdge: boolean,
    availableWidth: number = contentWidth
  ) => {
    const edge = accentEdge
      ? {
          style: BorderStyle.SINGLE,
          size: 18,
          color: accent,
        }
      : {
          style: BorderStyle.SINGLE,
          size: 4,
          color: CV_INK_WORD.rule,
        };

    return new Table({
      width: { size: availableWidth, type: WidthType.DXA },
      columnWidths: [availableWidth],
      layout: TableLayoutType.FIXED,
      visuallyRightToLeft: rtl,
      borders: {
        ...noBorders,
        top: { style: BorderStyle.SINGLE, size: 4, color: CV_INK_WORD.rule },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: CV_INK_WORD.rule },
        // "Inline start" is the left in a left-to-right document and the right
        // in an Arabic one.
        ...(rtl ? { right: edge } : { left: edge }),
        ...(rtl ? { left: noBorders.left } : { right: noBorders.right }),
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: availableWidth, type: WidthType.DXA },
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: blocks,
            }),
          ],
        }),
      ],
    });
  };

  const entryBlock = (
    entry: CvDocumentEntry,
    availableWidth: number = contentWidth
  ): Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> => {
    const detail: InstanceType<typeof Paragraph>[] = [];
    if (!entryInline && entry.subtitle) detail.push(entrySubtitle(entry));
    if (entry.location) detail.push(entryLocation(entry));
    if (entry.description) detail.push(entryDescription(entry));
    detail.push(...entryBullets(entry));
    if (entry.tags.length > 0) detail.push(entryTags(entry));
    if (entry.url) detail.push(entryUrl(entry));

    if (spec.layout === 'academic') {
      // What the record was on one side, what it involved on the other — the
      // same two-column record the paper draws.
      const leftWidth = Math.round(availableWidth * 0.388);
      const rightWidth = availableWidth - leftWidth;
      const left: InstanceType<typeof Paragraph>[] = [entryTitle(entry, leftWidth)];
      if (entry.subtitle) left.push(entrySubtitle(entry));
      return [
        new Table({
          width: { size: availableWidth, type: WidthType.DXA },
          columnWidths: [leftWidth, rightWidth],
          layout: TableLayoutType.FIXED,
          visuallyRightToLeft: rtl,
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: leftWidth, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  margins: { top: 0, bottom: 80, left: 0, right: 120 },
                  children: left,
                }),
                new TableCell({
                  width: { size: rightWidth, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  margins: { top: 0, bottom: 80, left: 120, right: 0 },
                  children: detail,
                }),
              ],
            }),
          ],
        }),
      ];
    }

    const blocks: InstanceType<typeof Paragraph>[] = [entryTitle(entry, availableWidth), ...detail];

    if (spec.layout === 'timeline' || spec.entryStyle === 'timeline') {
      const railWidth = 360;
      const contentEntryWidth = Math.max(availableWidth - railWidth, 1000);
      const railBorderKey = rtl ? 'left' : 'right';
      const railAlignment = rtl ? AlignmentType.LEFT : AlignmentType.RIGHT;

      const railCell = new TableCell({
        width: { size: railWidth, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: {
          ...noBorders,
          [railBorderKey]: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: accent,
          },
        },
        margins: rtl
          ? { top: 20, bottom: 0, left: 60, right: 0 }
          : { top: 20, bottom: 0, left: 0, right: 60 },
        children: [
          new Paragraph({
            alignment: railAlignment,
            bidirectional: rtl,
            spacing: { before: 20, after: 0 },
            children: [
              new TextRun({
                text: '●',
                size: 16,
                color: accent,
                font: bodyFontDeclaration,
                rightToLeft: rtl,
              }),
            ],
          }),
        ],
      });

      const contentCell = new TableCell({
        width: { size: contentEntryWidth, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: noBorders,
        margins: rtl
          ? { top: 0, bottom: 80, left: 0, right: 120 }
          : { top: 0, bottom: 80, left: 120, right: 0 },
        children: [entryTitle(entry, contentEntryWidth), ...detail],
      });

      return [
        new Table({
          width: { size: availableWidth, type: WidthType.DXA },
          columnWidths: [railWidth, contentEntryWidth],
          layout: TableLayoutType.FIXED,
          visuallyRightToLeft: rtl,
          borders: noBorders,
          rows: [
            new TableRow({
              children: [railCell, contentCell],
            }),
          ],
        }),
      ];
    }

    if (spec.layout === 'cards' || spec.entryStyle === 'card') {
      return [cardTable(blocks, true, availableWidth)];
    }
    if (spec.entryStyle === 'grid') {
      return [cardTable(blocks, false, availableWidth)];
    }

    return blocks;
  };

  const asideTwips = Math.round(
    (contentWidth * spec.columns.asidePercent) / 100
  );
  const mainTwips = contentWidth - asideTwips;
  const mainWidth = spec.hasSidebar ? mainTwips : contentWidth;
  const asideWidth = asideTwips;

  const rendered = plan.main.map((entry) => ({ entry, blocks: sectionBlocks(entry, mainWidth) }));
  const renderedAside = plan.aside.map((entry) => ({ entry, blocks: sectionBlocks(entry, asideWidth) }));

  /* ---------------------------------------------------------------------- */
  /* The page                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * The layout of the page.
   *
   * A template with a sidebar puts the short sections — the skills, the
   * languages, the certificates — in a narrow column and the evidence in a
   * wide one. Word carries that as a two-cell table, which is why the
   * exported document has the same shape as the preview rather than the same
   * words in a different arrangement. The share of the page the narrow column
   * takes comes from the shared layout, so it is the same share as the paper.
   */
  // The masthead spans the page, exactly as it does on the paper. It used to
  // be pushed into the wide cell of a sidebar layout, which put the candidate's
  // name inside the column and left the top of the narrow column empty.
  if (spec.hasSidebar) children.push(...headerBlocks);

  if (spec.hasSidebar) {
    const sidebarBlocks = renderedAside.flatMap((entry) => entry.blocks);
    const mainBlocks = rendered.flatMap((entry) => entry.blocks);

    // Explicit twips and a fixed grid: Word otherwise autofits the sidebar to
    // its longest word, so the same CV had a different column share from the
    // preview and from another copy of Word.
    const asideTwips = Math.round(
      (contentWidth * spec.columns.asidePercent) / 100
    );
    const mainTwips = contentWidth - asideTwips;

    const sidebarBorderKey = rtl ? 'right' : 'left';
    const sidebarCell = new TableCell({
      width: { size: asideTwips, type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      margins: rtl
        ? { top: 0, bottom: 0, left: 240, right: 0 }
        : { top: 0, bottom: 0, left: 0, right: 240 },
      // The paper draws the narrow column as a column, with an accent edge
      // when the template asks for one.
      ...(spec.accentPosition === 'side'
        ? {
            borders: {
              ...noBorders,
              [sidebarBorderKey]: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: accent,
              },
            },
          }
        : {}),
      children: sidebarBlocks,
    });
    const mainCell = new TableCell({
      width: { size: mainTwips, type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      margins: rtl
        ? { top: 0, bottom: 0, left: 0, right: 240 }
        : { top: 0, bottom: 0, left: 240, right: 0 },
      children: mainBlocks,
    });

    const row = new TableRow({
      cantSplit: false,
      children: spec.asideFirst
        ? [sidebarCell, mainCell]
        : [mainCell, sidebarCell],
    });

    children.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: spec.asideFirst
          ? [asideTwips, mainTwips]
          : [mainTwips, asideTwips],
        layout: TableLayoutType.FIXED,
        visuallyRightToLeft: rtl,
        borders: noBorders,
        rows: [row],
      })
    );
  } else if (!spec.twoColumn) {
    children.push(...headerBlocks);
    for (const entry of rendered) children.push(...entry.blocks);
    for (const entry of renderedAside) children.push(...entry.blocks);
  }

  const sections = [];
  if (spec.twoColumn) {
    if (headerBlocks.length > 0) {
      sections.push({
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
            },
            margin: {
              top: spec.marginTwips,
              right: spec.marginTwips,
              bottom: spec.marginTwips,
              left: spec.marginTwips,
            },
          },
        },
        children: headerBlocks,
      });
    }
    const bodyBlocks = [...rendered, ...renderedAside].flatMap((entry) => entry.blocks);
    sections.push({
      properties: {
        type: SectionType.CONTINUOUS,
        page: {
          size: {
            width: A4_WIDTH_TWIPS,
            height: A4_HEIGHT_TWIPS,
          },
          margin: {
            top: spec.marginTwips,
            right: spec.marginTwips,
            bottom: spec.marginTwips,
            left: spec.marginTwips,
          },
        },
        column: {
          count: 2,
          space: 360,
          separate: spec.layout === 'editorial',
        },
      },
      children: bodyBlocks,
    });
  } else {
    sections.push({
      properties: {
        page: {
          // A4, stated explicitly. Word's default Letter made the exported
          // page 6 mm wider and 18 mm shorter than the sheet the candidate
          // sees, which changed both the line wraps and the page count.
          size: {
            width: A4_WIDTH_TWIPS,
            height: A4_HEIGHT_TWIPS,
          },
          margin: {
            top: spec.marginTwips,
            right: spec.marginTwips,
            bottom: spec.marginTwips,
            left: spec.marginTwips,
          },
        },
      },
      children,
    });
  }

  const doc = new Document({
    creator: 'Roadmapak',
    title: document.fullName ? `${document.fullName} — CV` : 'CV',
    description: `CV exported with the ${input.template.name} template.`,
    styles: {
      default: {
        document: {
          run: { font: bodyFontDeclaration, size: bodySize },
          paragraph: { spacing: { line: lineSpacing } },
        },
      },
    },
    sections,
  });

  return Packer.toBuffer(doc);
}
