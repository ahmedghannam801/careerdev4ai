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

/** A sheet of A4 in twips: 210mm wide. */
const A4_WIDTH_TWIPS = 11906;

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
    ShadingType,
    TabStopType,
    Table,
    TableCell,
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

  const nameRun = (size: number, color?: string) =>
    new TextRun({
      text: document.fullName || 'Curriculum Vitae',
      bold: true,
      size,
      font: headingFont,
      rightToLeft: rtl,
      ...(color ? { color } : {}),
    });

  const titleRun = (size: number, color: string, caps: boolean) =>
    new TextRun({
      text: document.title,
      size,
      color,
      allCaps: caps,
      rightToLeft: rtl,
    });

  const contactRun = (size: number, color: string) =>
    new TextRun({
      text: document.contact.join(CV_INLINE_SEPARATOR_WORD),
      size,
      color,
      rightToLeft: rtl,
    });

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

    const badgeCell = new TableCell({
      width: { size: 12, type: WidthType.PERCENTAGE },
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
      width: { size: 88, type: WidthType.PERCENTAGE },
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
        ...(document.contact.length > 0
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
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [new TableRow({ children: [badgeCell, detailCell] })],
      })
    );
  } else if (header.kind === 'split') {
    // The name on one side and the contact on the other. Word has no
    // "space between", so the two halves are cells in a row.
    const nameCell = new TableCell({
      width: { size: 52, type: WidthType.PERCENTAGE },
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
      width: { size: 48, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.BOTTOM,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children:
        document.contact.length > 0
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
        width: { size: 100, type: WidthType.PERCENTAGE },
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
      ...(document.contact.length > 0
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
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 100, type: WidthType.PERCENTAGE },
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

    if (document.contact.length > 0) {
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
              left: {
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
          font: headingFont,
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
          font: headingFont,
          rightToLeft: rtl,
        })
      );
    }
    runs.push(
      new TextRun({
        text: entry.section.heading,
        bold: true,
        size: headingSize,
        allCaps: headingDecoration.allCaps,
        smallCaps: headingDecoration.smallCaps,
        italics: headingDecoration.italic,
        font: headingDecoration.font.word,
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
    entry: CvLayoutSection
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
          children: [new TextRun({ text: section.text ?? '', size: bodySize, rightToLeft: rtl })],
        })
      );
      return blocks;
    }

    if (section.kind === 'inline') {
      blocks.push(...inlineBlocks(section));
      return blocks;
    }

    const entryBlocks = section.entries.map((cvEntry) => entryBlock(cvEntry));
    const grid = spec.entryStyle === 'grid' || spec.layout === 'cards';

    if (grid && entryBlocks.length > 0) {
      // A card grid is a two-column grid on the paper. Word draws it as a
      // two-column table, one entry to a cell.
      const rows: InstanceType<typeof TableRow>[] = [];
      for (let index = 0; index < entryBlocks.length; index += 2) {
        const pair = entryBlocks.slice(index, index + 2);
        rows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                margins: { top: 0, bottom: 120, left: 0, right: 120 },
                children: pair[0],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                margins: { top: 0, bottom: 120, left: 120, right: 0 },
                children: pair[1] ?? [],
              }),
            ],
          })
        );
      }
      blocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders,
          rows,
        })
      );
      return blocks;
    }

    for (const block of entryBlocks) blocks.push(...block);
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
    section: CvDocumentSection
  ): InstanceType<typeof Paragraph>[] => {
    const items = section.inline ?? [];
    if (items.length === 0) return [];
    const decoration = cvSkillsDecoration(spec, section.key);

    if (decoration.columns > 1) {
      // The paper sets the words in two columns. Word sets them in a table.
      const rows: InstanceType<typeof TableRow>[] = [];
      const perColumn = Math.ceil(items.length / decoration.columns);
      for (let index = 0; index < perColumn; index += 1) {
        const cells: InstanceType<typeof TableCell>[] = [];
        for (let column = 0; column < decoration.columns; column += 1) {
          const item = items[column * perColumn + index];
          cells.push(
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [
                new Paragraph({
                  alignment,
                  bidirectional: rtl,
                  spacing: { after: 20 },
                  children: [
                    new TextRun({ text: item ?? '', size: bodySize, rightToLeft: rtl }),
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
          width: { size: 100, type: WidthType.PERCENTAGE },
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
                font: bodyFont,
                rightToLeft: rtl,
              }),
              new TextRun({ text: item, size: bodySize, rightToLeft: rtl }),
            ],
          })
      );
    }

    // The chips and the plain line are one paragraph of words. A chip cannot
    // be drawn in Word, so the words are laid out as the paper lays them out:
    // on one line, separated by the same dot.
    return [
      new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { after: cvPixelsToTwips(spec.metrics.gap) },
        children: [
          new TextRun({
            text: items.join(CV_INLINE_SEPARATOR_WORD),
            size: bodySize,
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
  const entryBlock = (
    entry: CvDocumentEntry
  ): Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> => {
    const blocks: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
    const inline = spec.entryStyle === 'inline' || spec.entryStyle === 'grid';

    const titleRuns: InstanceType<typeof TextRun>[] = [
      new TextRun({
        text: inline && entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title,
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

    blocks.push(
      new Paragraph({
        alignment,
        bidirectional: rtl,
        spacing: { before: 60, after: 20 },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        children: titleRuns,
      })
    );

    if (!inline && entry.subtitle) {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: entry.subtitle,
              size: bodySize,
              color: CV_INK_WORD.secondary,
              rightToLeft: rtl,
            }),
          ],
        })
      );
    }

    if (entry.location) {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: entry.location,
              size: smallSize,
              color: CV_INK_WORD.muted,
              rightToLeft: rtl,
            }),
          ],
        })
      );
    }

    if (entry.description) {
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 30 },
          children: [
            new TextRun({
              text: entry.description,
              size: bodySize,
              color: CV_INK_WORD.body,
              rightToLeft: rtl,
            }),
          ],
        })
      );
    }

    for (const bullet of entry.bullets) {
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
      runs.push(new TextRun({ text: bullet, size: bodySize, rightToLeft: rtl }));
      blocks.push(
        new Paragraph({
          alignment,
          bidirectional: rtl,
          spacing: { after: 20 },
          indent: spec.bulletGlyph ? { left: 200, hanging: 200 } : undefined,
          children: runs,
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
              text: entry.tags.join(CV_INLINE_SEPARATOR_WORD),
              size: smallSize,
              color: CV_INK_WORD.secondary,
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
                  size: smallSize,
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

    return blocks;
  };

  const rendered = plan.main.map((entry) => ({ entry, blocks: sectionBlocks(entry) }));
  const renderedAside = plan.aside.map((entry) => ({ entry, blocks: sectionBlocks(entry) }));

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
  if (spec.hasSidebar) {
    const sidebarBlocks = renderedAside.flatMap((entry) => entry.blocks);
    const mainBlocks = [
      ...headerBlocks,
      ...rendered.flatMap((entry) => entry.blocks),
    ];

    const sidebarCell = new TableCell({
      width: { size: spec.columns.asidePercent, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 0, right: 200 },
      children: sidebarBlocks,
    });
    const mainCell = new TableCell({
      width: { size: spec.columns.mainPercent, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 200, right: 0 },
      children: mainBlocks,
    });

    const row = new TableRow({
      children: spec.asideFirst
        ? [sidebarCell, mainCell]
        : [mainCell, sidebarCell],
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [row],
      })
    );
  } else if (spec.twoColumn) {
    // A split or an editorial document reads across two columns rather than
    // down one. The paper flows the text across the columns; Word cannot
    // flow a paragraph across cells, so the sections are divided between two
    // columns, which is the same reading order on the same page.
    const half = Math.ceil(rendered.length / 2);
    const leftBlocks = [
      ...headerBlocks,
      ...rendered.slice(0, half).flatMap((entry) => entry.blocks),
    ];
    const rightBlocks = rendered.slice(half).flatMap((entry) => entry.blocks);

    const leftCell = new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 0, right: 200 },
      children: leftBlocks,
    });
    const rightCell = new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: 200, right: 0 },
      children: rightBlocks,
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: spec.layout === 'editorial'
          ? {
              ...noBorders,
              insideVertical: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: accent,
              },
            }
          : noBorders,
        rows: [new TableRow({ children: [leftCell, rightCell] })],
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
          run: { font: bodyFont, size: bodySize },
          paragraph: { spacing: { line: lineSpacing } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: spec.marginTwips,
              right: spec.marginTwips,
              bottom: spec.marginTwips,
              left: spec.marginTwips,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
