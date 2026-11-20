/**
 * Painting text on a page.
 * ---------------------------------------------------------------------------
 * The writer knows how to write a glyph. This file knows where the glyphs go:
 * it measures a line, breaks it into the lines that fit, decides which way
 * each line reads, and turns it into the drawing operations the writer takes.
 *
 * The order of the work matters, and it is the order of the document:
 *
 *   1. The text is broken into lines that fit the width it is given. The
 *      measurement is done by shaping the text, so the width is the width the
 *      font really produces — with the Arabic joining forms and the kerning
 *      already applied.
 *   2. Each line is split into the runs that read in different directions. A
 *      line that is mostly Arabic with an English phrase in it has two runs,
 *      and they are painted in the order a reader expects.
 *   3. Each run is shaped with the face it needs — the Arabic face for the
 *      Arabic, the template's face for the Latin — and painted at its place
 *      on the line.
 *
 * Everything is measured in POINTS, because that is what a PDF is written in.
 * The shared layout works in CSS pixels at 96dpi, so the conversion happens
 * once, here, and nowhere else.
 */

/** CSS pixels at 96dpi to PDF points. */
export const PX_TO_PT = 0.75;

import { bidiRuns, containsArabicScript, type BidiRun } from './bidi.ts';
import type { PdfFont, PdfFontFamily, PdfFontRegistry } from './pdfFonts.ts';
import type { PdfOp } from './pdfWriter.ts';

/** How a line sits inside the width it is given. */
export type PdfAlign = 'start' | 'center' | 'end';

/** The face a piece of text is set in. */
export interface PdfTextStyle {
  family: PdfFontFamily;
  bold: boolean;
  /** The size of the type, in points. */
  size: number;
  color: string;
  /** The space between the letters, in points. */
  letterSpacing?: number;
  /**
   * Whether the text reads from right to left.
   *
   * When it is not set, the direction of the document decides — the painter
   * is told the direction once, when it is made, so that every piece of text
   * on the page is laid out in the same frame.
   */
  rtl?: boolean;
}

/** One line of text, ready to be painted. */
export interface PdfLine {
  /** The text of the line. */
  text: string;
  /** The runs of the line, in the order they are painted. */
  runs: BidiRun[];
  /** The width of the line, in points. */
  width: number;
  /** The height of the line, in points. */
  height: number;
}

/**
 * The painter.
 *
 * It holds the fonts and turns text into drawing operations. One painter is
 * used for a whole document.
 */
export class PdfPainter {
  private readonly registry: PdfFontRegistry;
  /** The direction of the document the painter draws. */
  private readonly baseRtl: boolean;

  constructor(registry: PdfFontRegistry, baseRtl = false) {
    this.registry = registry;
    this.baseRtl = baseRtl;
  }

  /**
   * The direction a piece of text is laid out in.
   *
   * A piece of text may state its own direction — a quotation inside an
   * Arabic CV, say — and when it does not, it is laid out in the direction of
   * the document.
   */
  private direction(style: PdfTextStyle): boolean {
    return style.rtl ?? this.baseRtl;
  }

  /**
   * The face a piece of text is drawn with.
   *
   * THE SCRIPT DECIDES THE FACE, NOT THE DIRECTION
   * A run that reads from right to left is Arabic, and is drawn with the
   * Arabic face. But a run that reads from LEFT to right may still be
   * Arabic: the Arabic-Indic digits ٠١٢٣ are laid out left to right inside
   * an Arabic sentence, because a number is read the same way everywhere.
   * The template's Latin typeface has no glyph for them, so drawing them
   * with it would put a row of empty boxes on the page.
   *
   * So the face is chosen by the script of the characters, and a face that
   * cannot draw every character of the run is passed over for one that can.
   */
  private faceFor(text: string, style: PdfTextStyle): PdfFont {
    const preferred: PdfFontFamily = containsArabicScript(text) ? 'arabic' : style.family;
    const candidates: PdfFontFamily[] =
      preferred === 'arabic'
        ? ['arabic', 'sans', 'serif', 'mono']
        : [preferred, 'arabic', 'sans', 'serif', 'mono'];

    for (const family of candidates) {
      if (!this.registry.covers(family, style.bold, text)) continue;
      return this.registry.face(family, style.bold);
    }
    return this.registry.face(preferred, style.bold);
  }

  /**
   * The width of a piece of text, in points.
   *
   * The text is measured run by run, with the same face each run is painted
   * with. Measuring a whole line with one face would be wrong for a line that
   * mixes Arabic and English, and it would add glyphs to the wrong subset.
   */
  measure(text: string, style: PdfTextStyle): number {
    if (!text) return 0;
    const runs = bidiRuns(text, this.direction(style));
    return this.widthOfRuns(runs, style, text.length);
  }

  /** The width of a set of runs, in points. */
  private widthOfRuns(runs: BidiRun[], style: PdfTextStyle, characterCount: number): number {
    let width = 0;
    for (const run of runs) {
      const face = this.faceFor(run.logical, style);
      width += (face.measure(run.logical, run.rtl) / 1000) * style.size;
    }
    width += (style.letterSpacing ?? 0) * Math.max(0, characterCount - 1);
    return width;
  }

  /**
   * Breaks a piece of text into the lines that fit a width.
   *
   * The text is broken at spaces, the way a browser breaks it, and a word
   * that is longer than the line is broken between its characters so that it
   * is never cut off.
   */
  wrap(text: string, style: PdfTextStyle, maxWidth: number, lineHeight: number): PdfLine[] {
    const paragraphs = text.split('\n');
    const lines: PdfLine[] = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/(\s+)/).filter((part) => part.length > 0);
      if (words.length === 0) {
        lines.push(this.makeLine('', style, lineHeight));
        continue;
      }

      let current = '';
      for (const word of words) {
        const candidate = current + word;
        if (current && this.measure(candidate.trimEnd(), style) > maxWidth) {
          lines.push(this.makeLine(current.trimEnd(), style, lineHeight));
          current = word.trimStart();
          // A single word that cannot fit on a line of its own is broken
          // between its characters rather than allowed to run off the page.
          while (this.measure(current, style) > maxWidth && current.length > 1) {
            let cut = current.length - 1;
            while (cut > 1 && this.measure(current.slice(0, cut), style) > maxWidth) {
              cut -= 1;
            }
            lines.push(this.makeLine(current.slice(0, cut), style, lineHeight));
            current = current.slice(cut);
          }
          continue;
        }
        current = candidate;
      }
      lines.push(this.makeLine(current.trimEnd(), style, lineHeight));
    }

    return lines;
  }

  /** One line of text, with its runs resolved. */
  private makeLine(text: string, style: PdfTextStyle, lineHeight: number): PdfLine {
    const runs = bidiRuns(text, this.direction(style));
    const width = this.widthOfRuns(runs, style, text.length);
    return { text, runs, width, height: lineHeight };
  }

  /**
   * Paints a line at a place on the page.
   *
   * The runs are painted from left to right in the visual order, which is the
   * order they are already in: a right-to-left run has been reversed by the
   * bidirectional algorithm and then reversed again by the shaper, so its
   * glyphs come out the right way round.
   */
  paintLine(
    line: PdfLine,
    style: PdfTextStyle,
    x: number,
    baseline: number,
    align: PdfAlign = 'start',
    width?: number
  ): PdfOp[] {
    if (!line.runs.length) return [];

    const boxWidth = width ?? line.width;
    let cursor = x;
    if (align === 'center') cursor = x + (boxWidth - line.width) / 2;
    else if (align === 'end') cursor = x + boxWidth - line.width;

    const ops: PdfOp[] = [];
    const lineStart = cursor;
    for (const run of line.runs) {
      if (!run.logical.trim()) {
        // A run that is only spaces still occupies the space it takes.
        cursor += this.widthOfRuns([run], style, run.logical.length);
        continue;
      }
      const face = this.faceFor(run.logical, style);
      const shaped = face.shape(run.logical, run.rtl);
      if (shaped.glyphs.length === 0) continue;

      const naturals = shaped.glyphs.map(
        (glyphId) => face.naturalWidthOf(glyphId) ?? shaped.advances[0] ?? 0
      );

      ops.push({
        kind: 'text',
        fontId: face.id,
        size: style.size,
        x: cursor,
        y: baseline,
        lineStart,
        lineEnd: 0,
        glyphs: shaped.glyphs,
        naturals,
        advances: shaped.advances,
        color: style.color,
        letterSpacing: style.letterSpacing,
      });

      // The letter spacing is added after every glyph by the reader, so the
      // cursor has to move by the same amount or the next run would overlap
      // the one before it.
      cursor += (shaped.width / 1000) * style.size;
      if (style.letterSpacing) cursor += style.letterSpacing * shaped.glyphs.length;
    }

    // The line is finished, so its right edge is known. Every piece of the
    // line carries it, because a right-to-left page is mirrored around the
    // line as a whole.
    for (const op of ops) {
      if (op.kind === 'text') op.lineEnd = cursor;
    }

    return ops;
  }

  /**
   * Paints a paragraph, and returns the height it took.
   *
   * The lines are painted one under the other, and the last line is the one
   * that decides how tall the paragraph is.
   */
  paintParagraph(
    text: string,
    style: PdfTextStyle,
    x: number,
    top: number,
    maxWidth: number,
    lineHeight: number,
    align: PdfAlign = 'start'
  ): { ops: PdfOp[]; height: number; lines: PdfLine[] } {
    const lines = this.wrap(text, style, maxWidth, lineHeight);
    const ops: PdfOp[] = [];
    lines.forEach((line, index) => {
      // The baseline sits inside the line box, so the type sits on the line
      // the way it does on the paper.
      const baseline = top + index * lineHeight + lineHeight * 0.78;
      ops.push(...this.paintLine(line, style, x, baseline, align, maxWidth));
    });
    return { ops, height: lines.length * lineHeight, lines };
  }
}
