/**
 * The PDF rendering of a CV.
 * ---------------------------------------------------------------------------
 * This file draws the document the candidate sees. It draws it with PDF
 * primitives — glyphs, rectangles, lines — instead of with a picture of it.
 *
 * ONE SOURCE OF TRUTH
 * The renderer reads the layout plan from `shared/cvLayout.ts`, which is the
 * same plan the on-screen preview draws and the same plan the DOCX export
 * writes. Nothing here decides what the document looks like: the template
 * says how wide the columns are, which colour the accent is, how a heading is
 * set, where the divider goes, and this file follows. A change to a
 * template's density or a template's bullet glyph changes the paper and the
 * file together, because there is only one decision to change.
 *
 * THE PAGE IS A PAGE
 * The page is A4 and it is divided the way the paper divides it: a margin, a
 * masthead, and then either one column, two columns of different widths, or
 * two equal columns of running text. The columns are laid out independently
 * and flow onto the next sheet when they run out of room, so a CV that is
 * longer than one page keeps its shape instead of being squeezed.
 */

import {
  CV_INK,
  cvAccentTint,
  cvDividerDecoration,
  cvEntryDecoration,
  cvHeaderDecoration,
  cvHeadingDecoration,
  cvSkillsDecoration,
  type CvLayoutPlan,
  type CvLayoutSection,
  type CvLayoutSpec,
} from '../../../shared/cvLayout.ts';
import type {
  CvDocument,
  CvDocumentEntry,
  CvDocumentSection,
} from '../../../shared/cvTemplateDocument.ts';
import { PdfPainter, PX_TO_PT, type PdfAlign, type PdfTextStyle } from './pdfPainter.ts';
import {
  PdfFontRegistry,
  type PdfFontFamily,
  type PdfFontSources,
  type PreparedFont,
} from './pdfFonts.ts';
import {
  buildPdf,
  PDF_A4_HEIGHT,
  PDF_A4_WIDTH,
  type PdfOp,
  type PdfPage,
} from './pdfWriter.ts';

/* -------------------------------------------------------------------------- */
/* The pieces of a page                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One piece of the document.
 *
 * A piece knows how tall it is and how to draw itself at a place on the page.
 * The document is a list of pieces; the paginator decides which of them are on
 * which sheet.
 */
interface Piece {
  /** The height of the piece, in points. */
  height: number;
  /** True when the piece must not be the last one on a page. */
  keepWithNext?: boolean;
  /** Draws the piece with its own top-left corner at (x, y). */
  draw(x: number, y: number): PdfOp[];
}

/* -------------------------------------------------------------------------- */
/* The renderer                                                                  */
/* -------------------------------------------------------------------------- */

/** The result of rendering a document. */
export interface CvPdfDocument {
  pages: PdfPage[];
  fonts: PreparedFont[];
}

/** CSS pixels to points. */
const px = (value: number): number => value * PX_TO_PT;

/** The typeface family a template's typography asks for. */
function familyFor(spec: CvLayoutSpec, part: 'body' | 'heading'): PdfFontFamily {
  if (spec.typography === 'serif') return 'serif';
  if (spec.typography === 'mono') return 'mono';
  if (spec.typography === 'mixed') return part === 'heading' ? 'serif' : 'sans';
  return 'sans';
}

/** The letter spacing of a heading, in em, read from the shared decoration. */
function letterSpacingEm(value: string): number {
  const match = /(-?[\d.]+)\s*em/.exec(value);
  return match ? Number.parseFloat(match[1]) : 0;
}

/**
 * Renders a CV into PDF pages.
 *
 * The fonts are passed in rather than loaded here, so that the same renderer
 * runs in the browser and in the tests.
 */
export function renderCvPdf(plan: CvLayoutPlan, fonts: PdfFontSources): CvPdfDocument {
  const registry = new PdfFontRegistry(fonts);
  // The painter is told the direction of the document once, so every piece of
  // text on the page is laid out in the same frame.
  const painter = new PdfPainter(registry, plan.spec.rtl);

  const spec = plan.spec;
  const document = plan.document;

  const margin = px(spec.marginPx);
  const contentWidth = PDF_A4_WIDTH - margin * 2;
  const contentHeight = PDF_A4_HEIGHT - margin * 2;

  /* --- The masthead ----------------------------------------------------- */
  const header = buildHeader(painter, spec, document, contentWidth, margin);

  const bodyTop = margin + header.height;

  /* --- The columns ------------------------------------------------------ */
  const hasSidebar = plan.aside.length > 0;

  // The widths of the columns are decided first, because the content has to
  // be laid out in the width it will be printed in: a paragraph measured in
  // the width of the page would run over the column it belongs to.
  const columns = spec.columns;
  const columnGap = px(columns.gapPx);
  const asideWidth = hasSidebar
    ? Math.max(
        px(columns.asideMinPx),
        (contentWidth - columnGap) * (columns.asideFr / (columns.asideFr + columns.mainFr))
      )
    : contentWidth;
  const mainWidth = hasSidebar ? contentWidth - columnGap - asideWidth : contentWidth;

  const asideFirst = spec.asideFirst;
  const asideX = asideFirst ? margin : margin + mainWidth + columnGap;
  const mainX = asideFirst ? margin + asideWidth + columnGap : margin;

  // A split or an editorial document reads across two equal columns of
  // running text rather than down two columns of different widths.
  const newspaperGap = px(spec.density === 'compact' ? 16 : 24);
  const newspaperWidth = (contentWidth - newspaperGap) / 2;

  const mainPieces = buildColumn(
    painter,
    spec,
    plan.main,
    hasSidebar ? mainWidth : spec.twoColumn ? newspaperWidth : contentWidth
  );
  const asidePieces = hasSidebar ? buildColumn(painter, spec, plan.aside, asideWidth) : [];

  /* --- The pagination --------------------------------------------------- */
  const pages: PdfPage[] = [];

  // The first sheet carries the masthead, so it has less room than the
  // sheets that follow, and the sheets that follow start at the top margin
  // rather than below the masthead.
  const firstPageHeight = contentHeight - header.height;
  const bodyTopFor = (index: number): number => (index === 0 ? bodyTop : margin);

  if (hasSidebar) {
    const asideSlices = paginate(asidePieces, contentHeight, firstPageHeight);
    const mainSlices = paginate(mainPieces, contentHeight, firstPageHeight);
    const pageCount = Math.max(asideSlices.length, mainSlices.length);

    for (let index = 0; index < pageCount; index += 1) {
      const ops: PdfOp[] = [];
      const top = bodyTopFor(index);
      if (index === 0) ops.push(...header.ops);
      ops.push(...drawSlice(asideSlices[index] ?? [], asideX, top, asideWidth));
      ops.push(...drawSlice(mainSlices[index] ?? [], mainX, top, mainWidth));
      pages.push({ width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT, ops });
    }
  } else if (spec.twoColumn) {
    // The text flows down the first column, across into the second, and on
    // to the next sheet.
    const columnSlices = paginate(mainPieces, contentHeight, firstPageHeight);

    for (let index = 0; index * 2 < columnSlices.length; index += 1) {
      const ops: PdfOp[] = [];
      const top = bodyTopFor(index);
      if (index === 0) ops.push(...header.ops);
      const first = columnSlices[index * 2];
      const second = columnSlices[index * 2 + 1];
      ops.push(...drawSlice(first ?? [], margin, top, newspaperWidth));
      ops.push(...drawSlice(second ?? [], margin + newspaperWidth + newspaperGap, top, newspaperWidth));
      pages.push({ width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT, ops });
    }
  } else {
    const slices = paginate(mainPieces, contentHeight, firstPageHeight);
    for (let index = 0; index < slices.length; index += 1) {
      const ops: PdfOp[] = [];
      const top = bodyTopFor(index);
      if (index === 0) ops.push(...header.ops);
      ops.push(...drawSlice(slices[index], margin, top, contentWidth));
      pages.push({ width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT, ops });
    }
  }

  if (pages.length === 0) {
    pages.push({ width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT, ops: header.ops });
  }

  // A right-to-left document is the same design read the other way round.
  const finalPages = spec.rtl ? pages.map(mirrorPage) : pages;

  return { pages: finalPages, fonts: registry.prepare() };
}

/* -------------------------------------------------------------------------- */
/* The right-to-left page                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors a page for a right-to-left document.
 *
 * WHY THE WHOLE PAGE IS MIRRORED
 * The preview draws the same design with `direction: rtl`, and the browser
 * does exactly this: the columns swap sides, the name of the candidate moves
 * to the right of the masthead, the date of an entry moves to the left of its
 * title, and the text of a paragraph starts at the right edge of its column.
 * Mirroring the finished page reproduces all of it at once, without a second
 * copy of the layout rules to keep in step with the first.
 *
 * THE TEXT OF A LINE IS MIRRORED AS A WHOLE
 * A line of mixed text is painted as several pieces — an Arabic phrase, a
 * number, an English word — and the pieces keep the order the bidirectional
 * algorithm gave them. Mirroring each piece on its own would turn the line
 * back to front, so the line is moved as one: the same distance is added to
 * every piece of it, which puts the line at its place on the other side of
 * the page and leaves the pieces in the order they were given.
 *
 * THE WORDS THEMSELVES ARE NOT MIRRORED
 * The Arabic was shaped in its reading order before it was drawn, and the
 * glyphs keep the order they were shaped in.
 */
function mirrorPage(page: PdfPage): PdfPage {
  const width = page.width;

  return {
    ...page,
    ops: page.ops.map((op): PdfOp => {
      if (op.kind === 'text' || op.kind === 'link') {
        // The line moves to the other side of the page; the pieces of the line
        // move with it.
        const shift = width - op.lineEnd - op.lineStart;
        return { ...op, x: op.x + shift };
      }
      if (op.kind === 'rect') {
        return { ...op, x: width - op.x - op.width };
      }
      return { ...op, x1: width - op.x1, x2: width - op.x2 };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The pagination                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Cuts a column into the slices that fit one sheet.
 *
 * A piece that does not fit moves to the next sheet whole, so a heading is
 * never left at the foot of a page and an entry is never cut in half. A
 * paragraph is already cut into its lines, so it is the one thing that can
 * cross a page boundary.
 *
 * The first sheet holds the masthead, so it has less room than the sheets
 * that follow. That room is given as `firstPageHeight`; without it the last
 * pieces of the first sheet would be laid out below the foot of the page.
 */
function paginate(
  pieces: Piece[],
  contentHeight: number,
  firstPageHeight: number = contentHeight
): Piece[][] {
  const slices: Piece[][] = [];
  let current: Piece[] = [];
  let used = 0;
  let limit = firstPageHeight;

  const flush = () => {
    slices.push(current);
    current = [];
    used = 0;
    limit = contentHeight;
  };

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const next = pieces[index + 1];

    if (current.length > 0 && used + piece.height > limit) {
      flush();
    } else if (
      current.length > 0 &&
      piece.keepWithNext &&
      next &&
      used + piece.height + next.height > limit
    ) {
      // A heading whose section does not fit moves to the next sheet with
      // it, so the two are never separated.
      flush();
    }

    current.push(piece);
    used += piece.height;
  }

  if (current.length > 0) slices.push(current);
  return slices;
}

/** Draws a slice of a column at its place on the page. */
function drawSlice(slice: Piece[], x: number, top: number, width: number): PdfOp[] {
  const ops: PdfOp[] = [];
  let y = top;
  for (const piece of slice) {
    ops.push(...piece.draw(x, y));
    y += piece.height;
  }
  return ops;
}

/* -------------------------------------------------------------------------- */
/* The masthead                                                                  */
/* -------------------------------------------------------------------------- */

/** The masthead, and how tall it is. */
interface HeaderResult {
  ops: PdfOp[];
  /** The height of the masthead, measured from the top margin. */
  height: number;
}

/**
 * Builds the masthead.
 *
 * There is one masthead per template family — a band of colour, a monogram
 * beside the name, a name on one side and the contact on the other — and each
 * one is drawn from the decoration the shared layout describes.
 */
function buildHeader(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  document: CvDocument,
  contentWidth: number,
  margin: number
): HeaderResult {
  const decoration = cvHeaderDecoration(spec);
  const accent = spec.accent;
  const ops: PdfOp[] = [];

  const nameStyle: PdfTextStyle = {
    family: familyFor(spec, 'heading'),
    bold: true,
    size: px(decoration.nameSizePx),
    color: CV_INK.page,
  };
  const titleStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: true,
    size: px(spec.bodySizePx) * 0.95,
    color: decoration.titleColor === 'body' ? CV_INK.body : accent,
  };
  const contactStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx) * 0.94,
    color: CV_INK.secondary,
  };

  const title = decoration.titleAllCaps ? document.title.toUpperCase() : document.title;
  const contactText = document.headerContact.join(' · ');
  const align: PdfAlign =
    decoration.alignment === 'center'
      ? 'center'
      : decoration.alignment === 'end'
        ? 'end'
        : 'start';

  const lineHeight = (style: PdfTextStyle) => style.size * spec.lineHeight;

  /** Draws a line of text and returns how much room it takes. */
  const text = (
    value: string,
    style: PdfTextStyle,
    x: number,
    y: number,
    width: number,
    textAlign: PdfAlign = align
  ): number => {
    if (!value) return 0;
    const height = lineHeight(style);
    const painted = painter.paintParagraph(value, style, x, y, width, height, textAlign);
    ops.push(...painted.ops);
    return painted.height;
  };

  let y = margin;

  switch (decoration.kind) {
    case 'banner': {
      // The band runs the whole width of the sheet, past the margins, which
      // is what makes it read as a band and not as a coloured block.
      const padding = Math.max(px(20), margin - px(6));
      const inner = contentWidth + margin * 2 - padding * 2;
      const bandHeight =
        lineHeight(nameStyle) +
        (document.title ? lineHeight(titleStyle) + px(4) : 0) +
        (contactText ? lineHeight(contactStyle) + px(8) : 0) +
        padding * 2;

      ops.push({
        kind: 'rect',
        x: 0,
        y: 0,
        width: PDF_A4_WIDTH,
        height: bandHeight,
        fill: accent,
      });

      let innerY = padding;
      const namePainted = painter.paintParagraph(
        document.fullName,
        { ...nameStyle, color: '#ffffff' },
        padding,
        innerY,
        inner,
        lineHeight(nameStyle),
        align
      );
      ops.push(...namePainted.ops);
      innerY += namePainted.height;

      if (document.title) {
        const titlePainted = painter.paintParagraph(
          title,
          { ...titleStyle, color: '#ffffff' },
          padding,
          innerY,
          inner,
          lineHeight(titleStyle),
          align
        );
        ops.push(...titlePainted.ops);
        innerY += titlePainted.height;
      }

      if (contactText) {
        const contactPainted = painter.paintParagraph(
          contactText,
          { ...contactStyle, color: '#ffffff' },
          padding,
          innerY,
          inner,
          lineHeight(contactStyle),
          align
        );
        ops.push(...contactPainted.ops);
        innerY += contactPainted.height;
      }

      y = bandHeight + px(spec.metrics.gap);
      break;
    }

    case 'split': {
      const nameWidth = contentWidth * 0.52;
      const contactWidth = contentWidth - nameWidth;
      const rightX = margin + nameWidth;

      let leftY = y;
      leftY += text(document.fullName, nameStyle, margin, leftY, nameWidth, 'start');
      if (document.title) {
        leftY += text(title, titleStyle, margin, leftY, nameWidth, 'start');
      }
      if (contactText) {
        const painted = painter.paintParagraph(
          contactText,
          contactStyle,
          rightX,
          y,
          contactWidth,
          lineHeight(contactStyle),
          'end'
        );
        ops.push(...painted.ops);
      }
      y = Math.max(leftY, y + lineHeight(contactStyle)) + px(10);
      ops.push({
        kind: 'rect',
        x: margin,
        y,
        width: contentWidth,
        height: px(2),
        fill: accent,
      });
      y += px(2) + px(spec.metrics.gap);
      break;
    }

    case 'monogram': {
      const badge = px(48);
      const initials = document.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
      const textX = margin + badge + px(12);
      const textWidth = contentWidth - badge - px(12);

      ops.push({
        kind: 'rect',
        x: margin,
        y,
        width: badge,
        height: badge,
        fill: accent,
        radius: badge / 2,
      });
      const initialsPainted = painter.paintParagraph(
        initials,
        {
          family: familyFor(spec, 'heading'),
          bold: true,
          size: px(18),
          color: '#ffffff',
        },
        margin,
        y + (badge - px(18) * 1.2) / 2,
        badge,
        px(18) * 1.2,
        'center'
      );
      ops.push(...initialsPainted.ops);

      let innerY = y;
      innerY += text(document.fullName, nameStyle, textX, innerY, textWidth, 'start');
      if (document.title) {
        innerY += text(title, titleStyle, textX, innerY, textWidth, 'start');
      }
      if (contactText) {
        innerY += text(contactText, contactStyle, textX, innerY, textWidth, 'start');
      }
      y = Math.max(y + badge, innerY) + px(spec.metrics.gap);
      break;
    }

    case 'stacked': {
      ops.push({
        kind: 'rect',
        x: margin,
        y,
        width: contentWidth,
        height: px(5),
        fill: accent,
      });
      y += px(5) + px(9);
      y += text(document.fullName, nameStyle, margin, y, contentWidth);
      if (document.title) y += text(title, titleStyle, margin, y, contentWidth);
      if (contactText) y += text(contactText, contactStyle, margin, y, contentWidth);
      y += px(spec.metrics.gap);
      break;
    }

    case 'editorial': {
      y += text(
        document.fullName,
        { ...nameStyle, color: CV_INK.heading },
        margin,
        y,
        contentWidth
      );
      if (document.title) {
        y += text(
          title,
          {
            family: familyFor(spec, 'body'),
            bold: false,
            size: px(spec.bodySizePx) * 1.05,
            color: CV_INK.body,
          },
          margin,
          y + px(4),
          contentWidth
        );
      }
      if (contactText) {
        y += text(contactText, contactStyle, margin, y + px(7), contentWidth);
      }
      y += px(9);
      ops.push({
        kind: 'rect',
        x: margin,
        y,
        width: contentWidth,
        height: px(3),
        fill: accent,
      });
      ops.push({
        kind: 'rect',
        x: margin,
        y: y + px(1),
        width: contentWidth,
        height: px(1),
        fill: accent,
      });
      y += px(3) + px(spec.metrics.gap);
      break;
    }

    case 'compact': {
      const titleWidth = contentWidth * 0.5;
      y += text(document.fullName, nameStyle, margin, y, contentWidth, 'start');
      if (document.title) {
        const painted = painter.paintParagraph(
          title,
          { ...titleStyle, size: px(spec.bodySizePx) * 0.96 },
          margin + titleWidth,
          y - lineHeight(nameStyle) + px(2),
          contentWidth - titleWidth,
          lineHeight(titleStyle),
          'end'
        );
        ops.push(...painted.ops);
      }
      if (contactText) {
        y += text(contactText, contactStyle, margin, y + px(3), contentWidth);
      }
      y += px(6);
      ops.push({
        kind: 'rect',
        x: margin,
        y,
        width: contentWidth,
        height: px(1),
        fill: CV_INK.hairline,
      });
      y += px(1) + px(spec.metrics.gap);
      break;
    }

    case 'left':
    default: {
      if (decoration.kind === 'left') {
        y += text(document.fullName, nameStyle, margin, y, contentWidth, 'start');
        if (document.title) y += text(title, titleStyle, margin, y, contentWidth, 'start');
        if (contactText) {
          y += text(contactText, contactStyle, margin, y + px(6), contentWidth, 'start');
        }
        y += px(9);
        ops.push({
          kind: 'rect',
          x: margin,
          y,
          width: contentWidth,
          height: px(2),
          fill: accent,
        });
        y += px(2);
      } else {
        y += text(document.fullName, nameStyle, margin, y, contentWidth, 'center');
        if (document.title) y += text(title, titleStyle, margin, y, contentWidth, 'center');
        if (contactText) {
          y += text(contactText, contactStyle, margin, y + px(5), contentWidth, 'center');
        }
        y += px(9);
        ops.push({
          kind: 'rect',
          x: margin,
          y,
          width: contentWidth,
          height: px(1),
          fill: CV_INK.rule,
        });
        y += px(1);
      }
      y += px(spec.metrics.gap);
      break;
    }
  }

  /* --- The links of the masthead ----------------------------------------- */
  if (document.headerLinks.length > 0) {
    const linkStyle: PdfTextStyle = {
      family: familyFor(spec, 'body'),
      bold: false,
      size: px(spec.bodySizePx) * 0.9,
      color: accent,
    };
    const labels = document.headerLinks.map((link) => link.label || link.url);
    const label = labels.join(' · ');
    const linkHeight = linkStyle.size * spec.lineHeight;
    const painted = painter.paintParagraph(
      label,
      linkStyle,
      margin,
      y + px(3),
      contentWidth,
      linkHeight,
      align
    );
    ops.push(...painted.ops);

    // Each link is a link: the region that carries it is an annotation.
    let linkX = margin;
    const totalWidth = painted.lines.reduce((sum, line) => sum + line.width, 0);
    if (align === 'center') linkX = margin + (contentWidth - totalWidth) / 2;
    else if (align === 'end') linkX = margin + contentWidth - totalWidth;

    labels.forEach((entry, index) => {
      const share = entry.length / Math.max(1, label.length);
      const width = totalWidth * share;
      ops.push({
        kind: 'link',
        x: linkX,
        y: y + px(3),
        width,
        height: linkHeight,
        url: document.headerLinks[index]?.url ?? '',
        lineStart: linkX,
        lineEnd: linkX + totalWidth,
      });
      linkX += width;
    });

    y += px(3) + painted.height;
  }

  return { ops, height: y - margin };
}

/* -------------------------------------------------------------------------- */
/* The columns                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Builds the pieces of one column.
 *
 * A column is the masthead's opposite: a list of sections, each a heading and
 * a body, laid out one after the other with the gap the template asks for.
 */
function buildColumn(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  sections: CvLayoutSection[],
  contentWidth: number
): Piece[] {
  const pieces: Piece[] = [];
  const gap = px(spec.metrics.gap);

  sections.forEach((entry, index) => {
    if (index > 0) pieces.push({ height: gap, draw: () => [] });
    pieces.push(...buildSection(painter, spec, entry, contentWidth));
  });

  return pieces;
}

/** The heading of a section and its body. */
function buildSection(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  entry: CvLayoutSection,
  contentWidth: number
): Piece[] {
  const pieces: Piece[] = [];
  pieces.push(buildHeading(painter, spec, entry, contentWidth));
  pieces.push(...buildSectionBody(painter, spec, entry.section, contentWidth));
  return pieces;
}

/** The heading of a section. */
function buildHeading(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  entry: CvLayoutSection,
  contentWidth: number
): Piece {
  const decoration = cvHeadingDecoration(spec);
  const divider = cvDividerDecoration(spec);
  const accent = spec.accent;

  const headingSize = px(spec.headingSizePx);
  const style: PdfTextStyle = {
    family: familyFor(spec, 'heading'),
    bold: true,
    size: headingSize,
    color: CV_INK.heading,
    letterSpacing: headingSize * letterSpacingEm(decoration.letterSpacing),
  };

  const label = decoration.allCaps ? entry.section.heading.toUpperCase() : entry.section.heading;
  const prefix = spec.headingStyle === 'numbered' ? `${String(entry.number + 1).padStart(2, '0')}  ` : '';
  const marker = spec.showIcons ? '▪ ' : '';
  const accentPart = `${prefix}${marker}`;

  const textWidth = contentWidth - (decoration.rule === 'start' ? px(8) : 0);
  const headingHeight = headingSize * spec.lineHeight;

  // The marker and the number are in the accent colour; the heading itself is
  // in the ink colour, and it starts where the marker ended.
  const accentWidth = accentPart ? painter.measure(accentPart, style) : 0;
  const labelPainted = painter.paintParagraph(
    label,
    style,
    0,
    0,
    Math.max(px(20), textWidth - accentWidth),
    headingHeight,
    'start'
  );
  const accentPainted = accentPart
    ? painter.paintParagraph(accentPart, { ...style, color: accent }, 0, 0, textWidth, headingHeight, 'start')
    : { ops: [] as PdfOp[], height: 0, lines: [] };

  const inner = [
    ...accentPainted.ops.map((op) => (op.kind === 'text' ? { ...op } : op)),
    ...labelPainted.ops.map((op) =>
      op.kind === 'text'
        ? {
            ...op,
            x: op.x + accentWidth,
            // The bounds of the line move with the words, because a
            // right-to-left page is mirrored around the line.
            lineStart: op.lineStart + accentWidth,
            lineEnd: op.lineEnd + accentWidth,
          }
        : op
    ),
  ];

  const blockPadding = divider.kind === 'block' ? px(4) : 0;
  const height = headingHeight;
  const totalHeight = height + blockPadding * 2 + (divider.kind === 'bottom' ? px(4) : 0);

  return {
    height: totalHeight,
    keepWithNext: true,
    draw: (x, y) => {
      const drawn: PdfOp[] = [];
      if (divider.kind === 'block') {
        drawn.push({
          kind: 'rect',
          x,
          y,
          width: contentWidth,
          height: totalHeight,
          fill: divider.fill ?? cvAccentTint(accent, 0.07),
        });
        drawn.push({
          kind: 'rect',
          x,
          y,
          width: px(3),
          height: totalHeight,
          fill: divider.color,
        });
      }
      for (const op of inner) {
        drawn.push(
          op.kind === 'text'
            ? {
                ...op,
                x: op.x + x,
                y: op.y + y,
                // The line moves with the words: the bounds of the line say
                // where the line sits on the page, and a right-to-left page is
                // mirrored around it.
                lineStart: op.lineStart + x,
                lineEnd: op.lineEnd + x,
              }
            : op
        );
      }
      if (divider.kind === 'bottom') {
        drawn.push({
          kind: 'rect',
          x,
          y: y + height + blockPadding,
          width: contentWidth,
          height: px(divider.widthPx),
          fill: divider.color,
        });
      }
      if (decoration.rule === 'bottom') {
        drawn.push({
          kind: 'rect',
          x,
          y: y + height + blockPadding,
          width: contentWidth,
          height: px(decoration.ruleWidthPx),
          fill: decoration.ruleColor,
        });
      }
      if (decoration.rule === 'start') {
        drawn.push({
          kind: 'rect',
          x,
          y,
          width: px(decoration.ruleWidthPx),
          height: height,
          fill: decoration.ruleColor,
        });
      }
      return drawn;
    },
  };
}

/** The body of a section. */
function buildSectionBody(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  section: CvDocumentSection,
  contentWidth: number
): Piece[] {
  const pieces: Piece[] = [];

  if (section.kind === 'text' && section.text) {
    pieces.push(
      ...buildParagraph(painter, spec, section.text, contentWidth, {
        family: familyFor(spec, 'body'),
        bold: false,
        size: px(spec.bodySizePx),
        color: CV_INK.body,
      })
    );
    return pieces;
  }

  if (section.kind === 'inline') {
    pieces.push(...buildSkills(painter, spec, section.inline ?? [], contentWidth, section.key));
    return pieces;
  }

  const entries = section.entries;
  const entryStyle = cvEntryDecoration(spec);

  entries.forEach((entry, index) => {
    if (index > 0) {
      pieces.push({
        height: spec.density === 'compact' ? px(7) : spec.density === 'spacious' ? px(12) : px(9),
        draw: () => [],
      });
    }
    pieces.push(...buildEntry(painter, spec, entry, contentWidth, entryStyle));
  });

  return pieces;
}

/**
 * A paragraph, cut into its lines.
 *
 * Each line is a piece of its own, so a paragraph that is longer than the
 * rest of the page crosses the boundary instead of being pushed whole onto
 * the next sheet.
 */
function buildParagraph(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  text: string,
  contentWidth: number,
  style: PdfTextStyle
): Piece[] {
  const lineHeight = style.size * spec.lineHeight;
  const lines = painter.wrap(text, style, contentWidth, lineHeight);

  return lines.map((line) => ({
    height: lineHeight,
    draw: (x, y) => {
      const baseline = y + lineHeight * 0.78;
      return painter.paintLine(line, style, x, baseline, 'start', contentWidth);
    },
  }));
}

/* -------------------------------------------------------------------------- */
/* The entries                                                                   */
/* -------------------------------------------------------------------------- */

/** One entry of a section: a role, a project, a qualification. */
function buildEntry(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  entry: CvDocumentEntry,
  contentWidth: number,
  decoration: ReturnType<typeof cvEntryDecoration>
): Piece[] {
  const accent = spec.accent;

  const titleStyle: PdfTextStyle = {
    family: familyFor(spec, 'heading'),
    bold: true,
    size: px(spec.bodySizePx),
    color: CV_INK.heading,
  };
  const subtitleStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx) * 0.96,
    color: CV_INK.secondary,
  };
  const metaStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx),
    color: CV_INK.muted,
  };
  const bodyStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx),
    color: CV_INK.body,
  };
  const smallStyle: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx) * 0.92,
    color: CV_INK.secondary,
  };

  const inline = decoration.titleWithSubtitle;
  const card = decoration.card || spec.layout === 'cards';
  const grid = decoration.grid && !card;
  const timeline = decoration.timeline || spec.layout === 'timeline';
  const academic = spec.layout === 'academic';

  const padding = card
    ? px(spec.density === 'compact' ? 7 : 10)
    : grid
      ? px(spec.density === 'compact' ? 6 : 9)
      : 0;
  const innerWidth = contentWidth - padding * 2;

  /* --- The parts of the entry -------------------------------------------- */
  const titleValue = inline && entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title;

  const titlePieces = buildTitleRow(
    painter,
    spec,
    titleValue,
    entry.meta,
    titleStyle,
    metaStyle,
    innerWidth
  );

  const subtitlePieces = !inline && entry.subtitle
    ? buildParagraph(painter, spec, entry.subtitle, innerWidth, subtitleStyle)
    : [];

  const locationPieces = entry.location
    ? buildParagraph(painter, spec, entry.location, innerWidth, { ...smallStyle, color: CV_INK.muted })
    : [];

  const descriptionPieces = entry.description
    ? buildParagraph(painter, spec, entry.description, innerWidth, bodyStyle)
    : [];

  const bulletPieces = buildBullets(painter, spec, entry.bullets, innerWidth);

  const tagPieces = entry.tags.length > 0
    ? buildParagraph(painter, spec, entry.tags.join(' · '), innerWidth, smallStyle)
    : [];

  const urlPieces = entry.url ? buildLink(painter, spec, entry.url, innerWidth) : [];

  /* --- The academic record: two columns inside the entry ------------------ */
  if (academic) {
    const leftWidth = innerWidth * 0.95 * (1 / 2.45);
    const rightWidth = innerWidth - leftWidth - px(10);

    // The two columns are narrower than the entry, so their text is measured
    // and broken against their own width. A line that was broken for the whole
    // entry would run over the column it belongs to.
    const leftPieces = [
      ...buildTitleRow(
        painter,
        spec,
        titleValue,
        entry.meta,
        titleStyle,
        metaStyle,
        leftWidth
      ),
      ...(!inline && entry.subtitle
        ? buildParagraph(painter, spec, entry.subtitle, leftWidth, subtitleStyle)
        : []),
      ...metaOnly(painter, spec, entry, leftWidth, metaStyle),
    ];
    const rightPieces = [
      ...(entry.location
        ? buildParagraph(painter, spec, entry.location, rightWidth, {
            ...smallStyle,
            color: CV_INK.muted,
          })
        : []),
      ...(entry.description
        ? buildParagraph(painter, spec, entry.description, rightWidth, bodyStyle)
        : []),
      ...buildBullets(painter, spec, entry.bullets, rightWidth),
      ...(entry.tags.length > 0
        ? buildParagraph(painter, spec, entry.tags.join(' · '), rightWidth, smallStyle)
        : []),
      ...(entry.url ? buildLink(painter, spec, entry.url, rightWidth) : []),
    ];

    const leftHeight = leftPieces.reduce((sum, piece) => sum + piece.height, 0);
    const rightHeight = rightPieces.reduce((sum, piece) => sum + piece.height, 0);

    return [
      {
        height: Math.max(leftHeight, rightHeight),
        draw: (x, y) => {
          const drawn: PdfOp[] = [];
          let innerY = y;
          for (const piece of leftPieces) {
            drawn.push(...piece.draw(x, innerY));
            innerY += piece.height;
          }
          innerY = y;
          for (const piece of rightPieces) {
            drawn.push(...piece.draw(x + leftWidth + px(10), innerY));
            innerY += piece.height;
          }
          return drawn;
        },
      },
    ];
  }

  /* --- The timeline: a rail beside the entry ------------------------------ */
  if (timeline) {
    const railWidth = px(9);
    const content = [
      ...titlePieces,
      ...subtitlePieces,
      ...locationPieces,
      ...descriptionPieces,
      ...bulletPieces,
      ...tagPieces,
      ...urlPieces,
    ];
    const height = content.reduce((sum, piece) => sum + piece.height, 0);

    return [
      {
        height,
        draw: (x, y) => {
          const drawn: PdfOp[] = [];
          // The marker: a ring of the accent colour with a white centre.
          drawn.push({
            kind: 'rect',
            x: x + px(1),
            y: y + px(3),
            width: px(7),
            height: px(7),
            fill: '#ffffff',
            stroke: accent,
            lineWidth: px(2),
            radius: px(3.5),
          });
          // The rail that joins one entry to the next.
          drawn.push({
            kind: 'rect',
            x: x + px(4),
            y: y + px(11),
            width: px(1),
            height: Math.max(0, height - px(11)),
            fill: CV_INK.hairline,
          });
          let innerY = y;
          for (const piece of content) {
            drawn.push(...piece.draw(x + railWidth + px(10), innerY));
            innerY += piece.height;
          }
          return drawn;
        },
      },
    ];
  }

  const pieces = [
    ...titlePieces,
    ...subtitlePieces,
    ...locationPieces,
    ...descriptionPieces,
    ...bulletPieces,
    ...tagPieces,
    ...urlPieces,
  ];

  /* --- The card: a box with a rule down its leading edge ------------------ */
  if (!card && !grid) return pieces;

  const innerHeight = pieces.reduce((sum, piece) => sum + piece.height, 0);

  return [
    {
      height: innerHeight + padding * 2,
      draw: (x, y) => {
        const drawn: PdfOp[] = [];
        drawn.push({
          kind: 'rect',
          x,
          y,
          width: contentWidth,
          height: innerHeight + padding * 2,
          fill: '#ffffff',
          stroke: CV_INK.rule,
          lineWidth: px(1),
          radius: px(card ? 6 : 5),
        });
        if (card) {
          drawn.push({
            kind: 'rect',
            x,
            y,
            width: px(3),
            height: innerHeight + padding * 2,
            fill: accent,
          });
        }
        let innerY = y + padding;
        for (const piece of pieces) {
          drawn.push(...piece.draw(x + padding, innerY));
          innerY += piece.height;
        }
        return drawn;
      },
    },
  ];
}

/** The date of an entry, on its own line — the academic record's left column. */
function metaOnly(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  entry: CvDocumentEntry,
  contentWidth: number,
  metaStyle: PdfTextStyle
): Piece[] {
  if (!entry.meta) return [];
  return buildParagraph(painter, spec, entry.meta, contentWidth, metaStyle);
}

/**
 * The title of an entry and the date that sits beside it.
 *
 * The date is pushed to the far end of the line, which is what the paper
 * does with a flex row.
 */
function buildTitleRow(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  title: string,
  meta: string | undefined,
  titleStyle: PdfTextStyle,
  metaStyle: PdfTextStyle,
  contentWidth: number
): Piece[] {
  const lineHeight = titleStyle.size * spec.lineHeight;
  const metaWidth = meta ? painter.measure(meta, metaStyle) : 0;
  const titleWidth = Math.max(px(40), contentWidth - (meta ? metaWidth + px(10) : 0));

  const titleLines = painter.wrap(title, titleStyle, titleWidth, lineHeight);
  const metaLines = meta ? painter.wrap(meta, metaStyle, metaWidth + px(2), lineHeight) : [];

  const height = Math.max(titleLines.length, metaLines.length) * lineHeight;

  return [
    {
      height,
      draw: (x, y) => {
        const drawn: PdfOp[] = [];
        titleLines.forEach((line, index) => {
          const baseline = y + index * lineHeight + lineHeight * 0.78;
          drawn.push(...painter.paintLine(line, titleStyle, x, baseline, 'start', titleWidth));
        });
        metaLines.forEach((line, index) => {
          const baseline = y + index * lineHeight + lineHeight * 0.78;
          drawn.push(
            ...painter.paintLine(line, metaStyle, x + contentWidth - metaWidth, baseline, 'end', metaWidth)
          );
        });
        return drawn;
      },
    },
  ];
}

/** The bullets of an entry. */
function buildBullets(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  bullets: string[],
  contentWidth: number
): Piece[] {
  const pieces: Piece[] = [];
  const glyph = spec.bulletGlyph;
  const style: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx),
    color: CV_INK.body,
  };
  const lineHeight = style.size * spec.lineHeight;

  for (const bullet of bullets) {
    if (!glyph) {
      pieces.push(...buildParagraph(painter, spec, bullet, contentWidth, style));
      continue;
    }
    const markerWidth = px(14);
    const textWidth = contentWidth - markerWidth;
    const lines = painter.wrap(bullet, style, textWidth, lineHeight);
    pieces.push({
      height: lines.length * lineHeight + px(3),
      draw: (x, y) => {
        const drawn: PdfOp[] = [];
        const marker = painter.paintParagraph(
          glyph,
          { ...style, color: spec.accent },
          x,
          y,
          markerWidth,
          lineHeight,
          'start'
        );
        drawn.push(...marker.ops);
        lines.forEach((line, index) => {
          const baseline = y + px(3) + index * lineHeight + lineHeight * 0.78;
          drawn.push(...painter.paintLine(line, style, x + markerWidth, baseline, 'start', textWidth));
        });
        return drawn;
      },
    });
  }

  return pieces;
}

/** A link, drawn in the accent colour and clickable. */
function buildLink(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  url: string,
  contentWidth: number
): Piece[] {
  const style: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx) * 0.92,
    color: spec.accent,
  };
  const lineHeight = style.size * spec.lineHeight;
  const lines = painter.wrap(url, style, contentWidth, lineHeight);

  return [
    {
      height: lines.length * lineHeight + px(2),
      draw: (x, y) => {
        const drawn: PdfOp[] = [];
        lines.forEach((line, index) => {
          const baseline = y + index * lineHeight + lineHeight * 0.78;
          drawn.push(...painter.paintLine(line, style, x, baseline, 'start', contentWidth));
          drawn.push({
            kind: 'rect',
            x,
            y: y + index * lineHeight + lineHeight * 0.88,
            width: line.width,
            height: px(1),
            fill: spec.accent,
          });
        });
        drawn.push({
          kind: 'link',
          x,
          y,
          width: Math.min(contentWidth, lines[0]?.width ?? 0),
          height: lines.length * lineHeight,
          url,
          lineStart: x,
          lineEnd: x + (lines[0]?.width ?? 0),
        });
        return drawn;
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* The skills                                                                    */
/* -------------------------------------------------------------------------- */

/** A list of skills, in the style the template asks for. */
function buildSkills(
  painter: PdfPainter,
  spec: CvLayoutSpec,
  skills: string[],
  contentWidth: number,
  key: Parameters<typeof cvSkillsDecoration>[1]
): Piece[] {
  if (skills.length === 0) return [];
  const decoration = cvSkillsDecoration(spec, key);
  const style: PdfTextStyle = {
    family: familyFor(spec, 'body'),
    bold: false,
    size: px(spec.bodySizePx),
    color: CV_INK.body,
  };

  if (decoration.mode === 'chips') {
    // A chip is a pill of colour with a word in it. The chips are laid out
    // in rows, the way the paper wraps them.
    const pieces: Piece[] = [];
    let row: Array<{ label: string; width: number }> = [];
    let rowWidth = 0;

    const flush = () => {
      if (row.length === 0) return;

      // THE ROW IS COPIED, NOT SHARED
      // A piece is drawn later, when the document is paginated and the piece
      // is given its place on the page. The row is therefore captured by
      // VALUE here: a piece that closed over the variable itself would draw
      // whatever the variable held at that later moment — which, after the
      // last flush, is nothing at all. The whole skills block would be an
      // empty band, and the file would carry the heading without the words
      // under it.
      const chips = row;
      const rowHeight = style.size * 1.9;

      pieces.push({
        height: rowHeight,
        draw: (x, y) => {
          const drawn: PdfOp[] = [];
          let cursor = x;
          for (const chip of chips) {
            drawn.push({
              kind: 'rect',
              x: cursor,
              y: y + px(1),
              width: chip.width,
              height: rowHeight - px(2),
              fill: cvAccentTint(spec.accent, 0.05),
              stroke: cvAccentTint(spec.accent, 0.33),
              lineWidth: px(1),
              radius: (rowHeight - px(2)) / 2,
            });
            const painted = painter.paintParagraph(
              chip.label,
              { ...style, size: style.size * 0.92 },
              cursor + px(7),
              y + px(1),
              chip.width - px(14),
              rowHeight - px(2),
              'center'
            );
            drawn.push(...painted.ops);
            cursor += chip.width + px(5);
          }
          return drawn;
        },
      });

      row = [];
      rowWidth = 0;
    };

    for (const skill of skills) {
      const width = painter.measure(skill, { ...style, size: style.size * 0.92 }) + px(14);
      if (rowWidth + width > contentWidth && row.length > 0) flush();
      row.push({ label: skill, width });
      rowWidth += width + px(5);
    }
    flush();
    return pieces;
  }

  if (decoration.mode === 'bars') {
    return skills.map((skill) => {
      const lineHeight = style.size * spec.lineHeight;
      return {
        height: lineHeight + px(4),
        draw: (x: number, y: number) => {
          const drawn: PdfOp[] = [];
          drawn.push({
            kind: 'rect',
            x,
            y: y + lineHeight * 0.45,
            width: px(12),
            height: px(3),
            fill: spec.accent,
          });
          const painted = painter.paintParagraph(
            skill,
            style,
            x + px(18),
            y,
            contentWidth - px(18),
            lineHeight,
            'start'
          );
          drawn.push(...painted.ops);
          return drawn;
        },
      };
    });
  }

  if (decoration.mode === 'columns') {
    // Two columns of words, filled down the first and then the second.
    const columnWidth = (contentWidth - px(14)) / 2;
    const perColumn = Math.ceil(skills.length / 2);
    const left = skills.slice(0, perColumn);
    const right = skills.slice(perColumn);
    const lineHeight = style.size * spec.lineHeight;
    const rows = Math.max(left.length, right.length);

    return [
      {
        height: rows * lineHeight,
        draw: (x, y) => {
          const drawn: PdfOp[] = [];
          for (let index = 0; index < rows; index += 1) {
            if (left[index]) {
              drawn.push(
                ...painter.paintParagraph(
                  left[index],
                  style,
                  x,
                  y + index * lineHeight,
                  columnWidth,
                  lineHeight,
                  'start'
                ).ops
              );
            }
            if (right[index]) {
              drawn.push(
                ...painter.paintParagraph(
                  right[index],
                  style,
                  x + columnWidth + px(14),
                  y + index * lineHeight,
                  columnWidth,
                  lineHeight,
                  'start'
                ).ops
              );
            }
          }
          return drawn;
        },
      },
    ];
  }

  if (decoration.mode === 'grouped') {
    return skills.map((skill) => {
      const lineHeight = style.size * spec.lineHeight;
      return {
        height: lineHeight + px(3),
        draw: (x: number, y: number) => {
          const drawn: PdfOp[] = [];
          drawn.push(
            ...painter.paintParagraph(
              decoration.marker ?? '/',
              { ...style, color: spec.accent },
              x,
              y,
              px(14),
              lineHeight,
              'start'
            ).ops
          );
          drawn.push(
            ...painter.paintParagraph(skill, style, x + px(14), y, contentWidth - px(14), lineHeight, 'start')
              .ops
          );
          return drawn;
        },
      };
    });
  }

  // The plain list: the words on one line, separated by a dot.
  const lineHeight = style.size * spec.lineHeight;
  const text = skills.join(' · ');
  const lines = painter.wrap(text, style, contentWidth, lineHeight);
  return lines.map((line) => ({
    height: lineHeight,
    draw: (x: number, y: number) => {
      const baseline = y + lineHeight * 0.78;
      return painter.paintLine(line, style, x, baseline, 'start', contentWidth);
    },
  }));
}

/* -------------------------------------------------------------------------- */
/* The document                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds the PDF file of a CV.
 *
 * This is the entry point the export calls: it takes the plan and the fonts
 * and returns the bytes of the file.
 */
export function buildCvPdfBytes(
  plan: CvLayoutPlan,
  fonts: PdfFontSources,
  metadata: { title?: string; author?: string } = {}
): { bytes: Uint8Array; pages: number } {
  const rendered = renderCvPdf(plan, fonts);
  const bytes = buildPdf(rendered.pages, rendered.fonts, {
    title: metadata.title,
    author: metadata.author,
    subject: 'Curriculum Vitae',
  });
  return { bytes, pages: rendered.pages.length };
}
