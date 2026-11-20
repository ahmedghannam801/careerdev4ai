/**
 * The PDF writer.
 * ---------------------------------------------------------------------------
 * This file writes a PDF. It writes the real thing: text objects that hold
 * glyphs, vector paths that hold shapes, and link annotations that hold
 * destinations. There is no image of the document anywhere in it.
 *
 * WHY THE WRITER IS HAND-WRITTEN
 * The document the platform produces is not a list of paragraphs — it is a
 * designed page: a masthead, a coloured band, a rule under a heading, a
 * timeline rail, a chip of colour beside a skill, two columns of different
 * widths. To reproduce that, the writer has to place each of those things at
 * an exact point on the page, in an exact colour, at an exact size, and it
 * has to embed the fonts so the file carries its own typography.
 *
 * A library that lays text out for you cannot do that: it decides where the
 * lines go, and the page stops being the page the candidate approved. So the
 * layout is decided in the renderer, and this file only writes down what it
 * is told.
 *
 * THE STRUCTURE
 *   * A `Type0` font with an `Identity-H` encoding, whose descendant is a
 *     `CIDFontType2` over an embedded TrueType subset. The characters are
 *     written as two-byte glyph identifiers, which is what lets a PDF carry
 *     Arabic, and the `ToUnicode` map ties every glyph back to the
 *     characters it stands for, which is what makes the text selectable and
 *     searchable.
 *   * Vector graphics as ordinary content-stream operators, so a rule stays a
 *     rule at any zoom and a background stays a background rather than a
 *     photograph of one.
 *   * Link annotations over the text that carries a destination.
 *
 * The structure is ordinary PDF 1.7 with a classic cross-reference table,
 * which every reader accepts.
 */

import { zlibSync } from 'fflate';
import type { PreparedFont } from './pdfFonts.ts';

/** A4 in PDF points: 210mm × 297mm. */
export const PDF_A4_WIDTH = 595.28;
export const PDF_A4_HEIGHT = 841.89;

/* -------------------------------------------------------------------------- */
/* The drawing operations                                                        */
/* -------------------------------------------------------------------------- */

/** A piece of text, positioned at a baseline. */
export interface PdfTextOp {
  kind: 'text';
  /** The resource name of the font, such as `F1`. */
  fontId: string;
  /** The size of the type, in points. */
  size: number;
  /** The left edge of the text, in points from the left of the page. */
  x: number;
  /** The baseline, in points from the top of the page. */
  y: number;
  /**
   * The left edge of the LINE the text belongs to.
   *
   * A line of mixed text is painted as several pieces — one per run of
   * characters that share a face and a direction — and the pieces are part of
   * one line. The bounds of the line are what a right-to-left page is
   * mirrored around, so that the pieces keep the order they were given.
   */
  lineStart: number;
  /** The right edge of the line the text belongs to. */
  lineEnd: number;
  /** The glyphs, in the order they are painted. */
  glyphs: number[];
  /** The width every glyph takes on its own, in 1000ths of an em. */
  naturals: number[];
  /** The width every glyph actually takes in this run, in 1000ths of an em. */
  advances: number[];
  /** The colour of the text. */
  color: string;
  /** The space added after every glyph, in points. */
  letterSpacing?: number;
}

/** A rectangle, filled and/or outlined. */
export interface PdfRectOp {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  /** The radius of the rounded corners, in points. */
  radius?: number;
}

/** A straight line. */
export interface PdfLineOp {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

/** A clickable region. */
export interface PdfLinkOp {
  kind: 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  /** The left edge of the line the link belongs to. */
  lineStart: number;
  /** The right edge of the line the link belongs to. */
  lineEnd: number;
}

/** Anything that can be drawn on a page. */
export type PdfOp = PdfTextOp | PdfRectOp | PdfLineOp | PdfLinkOp;

/** One page of the document. */
export interface PdfPage {
  /** The width of the page, in points. */
  width: number;
  /** The height of the page, in points. */
  height: number;
  /** What is drawn on the page, in the order it is drawn. */
  ops: PdfOp[];
}

/** The information about the document itself. */
export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
}

/* -------------------------------------------------------------------------- */
/* Colours                                                                      */
/* -------------------------------------------------------------------------- */

/** Turns `#rrggbb` into the three numbers PDF writes. */
function rgb(color: string): [number, number, number] {
  const hex = color.replace('#', '').trim();
  if (hex.length === 3) {
    const expanded = hex
      .split('')
      .map((character) => character + character)
      .join('');
    return rgb(`#${expanded}`);
  }
  if (hex.length !== 6) return [0, 0, 0];
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

/* -------------------------------------------------------------------------- */
/* The writer                                                                    */
/* -------------------------------------------------------------------------- */

/** Escapes a string for a literal PDF string. */
function literal(value: string): string {
  return `(${value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

/** Encodes a code point as the hexadecimal string PDF writes. */
function codePointHex(codePoint: number): string {
  if (codePoint <= 0xffff) {
    return codePoint.toString(16).toUpperCase().padStart(4, '0');
  }
  const value = codePoint - 0x10000;
  const high = 0xd800 + (value >> 10);
  const low = 0xdc00 + (value & 0x3ff);
  return `${high.toString(16).toUpperCase().padStart(4, '0')}${low
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')}`;
}

/**
 * The map that turns a glyph back into the characters it stands for.
 *
 * Without it the words in the file can be seen but not read. It is written as
 * a `ToUnicode` CMap, which every reader understands.
 *
 * EVERY ENTRY IS A `bfchar`
 * A glyph can stand for more than one character: a ligature such as "fi" is
 * one glyph and two letters, and an Arabic joining form is one glyph for one
 * letter. The `bfchar` operator takes a destination that may be several
 * UTF-16 code units long, which is how a ligature is mapped back to both of
 * its letters.
 *
 * The `bfrange` operator is not used: it maps a RANGE of character codes to
 * a range of destinations, and a single code may only have one destination.
 * Writing a ligature as a range would leave the reader with the first letter
 * only — "fi" would come back as "f" — which is exactly the sort of quiet
 * loss the text layer exists to prevent.
 */
function toUnicodeCMap(font: PreparedFont): string {
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ];

  const entries = [...font.toUnicode.entries()].sort((a, b) => a[0] - b[0]);

  for (let index = 0; index < entries.length; index += 100) {
    const block = entries.slice(index, index + 100);
    lines.push(`${block.length} beginbfchar`);
    for (const [glyphId, codePoints] of block) {
      const target = codePoints.map((codePoint) => codePointHex(codePoint)).join('');
      lines.push(
        `<${glyphId.toString(16).toUpperCase().padStart(4, '0')}> <${target}>`
      );
    }
    lines.push('endbfchar');
  }

  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

/** The widths of the glyphs, in the `W` array PDF writes. */
function widthsArray(font: PreparedFont): string {
  const widths = [...font.widths.entries()].sort((a, b) => a[0] - b[0]);
  const parts: string[] = [];
  let index = 0;
  while (index < widths.length) {
    const start = widths[index][0];
    const run: number[] = [];
    let expected = start;
    while (index < widths.length && widths[index][0] === expected) {
      run.push(Math.round(widths[index][1]));
      index += 1;
      expected += 1;
    }
    if (run.length === 1) {
      parts.push(`${start} [${run[0]}]`);
    } else {
      parts.push(`${start} [${run.join(' ')}]`);
    }
  }
  return parts.join(' ');
}

/** Serialises PDF objects and their classic cross-reference table. */
class PdfObjectStore {
  private bodies: Array<string | Uint8Array | null> = [];

  reserve(): number {
    this.bodies.push(null);
    return this.bodies.length;
  }

  set(id: number, body: string | Uint8Array): void {
    this.bodies[id - 1] = body;
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  build(rootId: number, infoId: number | null): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const push = (value: string | Uint8Array) => {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      chunks.push(bytes);
      length += bytes.length;
    };

    // A binary comment after the header tells tools the file is not text.
    push(
      new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3,
        0xcf, 0xd3, 0x0a,
      ])
    );

    const offsets: number[] = [];
    this.bodies.forEach((body, index) => {
      offsets.push(length);
      push(`${index + 1} 0 obj\n`);
      push(body ?? 'null');
      push('\nendobj\n');
    });

    const xrefStart = length;
    const size = this.bodies.length + 1;
    push(`xref\n0 ${size}\n`);
    push('0000000000 65535 f \n');
    for (const offset of offsets) {
      push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    }
    push(
      `trailer\n<< /Size ${size} /Root ${rootId} 0 R${
        infoId ? ` /Info ${infoId} 0 R` : ''
      } >>\nstartxref\n${xrefStart}\n%%EOF\n`
    );

    const output = new Uint8Array(length);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    }
    return output;
  }
}

/** An uncompressed stream with an ASCII body. */
function textStream(dictionary: string, body: string): string {
  return `<< ${dictionary} /Length ${body.length} >>\nstream\n${body}\nendstream`;
}

/** A compressed stream; the body is arbitrary binary. */
function compressedStream(bytes: Uint8Array): Uint8Array {
  const compressed = zlibSync(bytes);
  const head = new TextEncoder().encode(
    `<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`
  );
  const tail = new TextEncoder().encode('\nendstream');
  const output = new Uint8Array(head.length + compressed.length + tail.length);
  output.set(head, 0);
  output.set(compressed, head.length);
  output.set(tail, head.length + compressed.length);
  return output;
}

/* -------------------------------------------------------------------------- */
/* The content stream                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The operators that draw one page.
 *
 * The coordinates the renderer uses start at the top-left of the page,
 * because that is how a page is described; PDF starts at the bottom-left, so
 * the vertical axis is turned over on the way out.
 */
function contentStream(page: PdfPage): string {
  const operators: string[] = [];
  const height = page.height;

  for (const op of page.ops) {
    if (op.kind === 'text') {
      if (op.glyphs.length === 0) continue;
      const baseline = height - op.y;
      const size = op.size.toFixed(2);
      operators.push('BT');
      if (op.letterSpacing) {
        operators.push(`${op.letterSpacing.toFixed(2)} Tc`);
      }
      operators.push(`/${op.fontId} ${size} Tf`);
      operators.push(`1 0 0 1 ${op.x.toFixed(2)} ${baseline.toFixed(2)} Tm`);

      const [r, g, b] = rgb(op.color);
      operators.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);

      // The glyphs, with the kerning between them written as the adjustments
      // PDF understands. The adjustment after a glyph is the difference
      // between the width the font gives the glyph on its own and the width
      // it actually takes in this run, which is where the kerning lives.
      const parts: string[] = [];
      for (let index = 0; index < op.glyphs.length; index += 1) {
        parts.push(`<${op.glyphs[index].toString(16).toUpperCase().padStart(4, '0')}>`);
        if (index + 1 < op.glyphs.length) {
          const natural = op.naturals[index] ?? op.advances[index];
          const adjustment = Math.round(natural - op.advances[index]);
          if (adjustment !== 0) parts.push(String(adjustment));
        }
      }
      operators.push(`[${parts.join(' ')}] TJ`);
      if (op.letterSpacing) operators.push('0 Tc');
      operators.push('ET');
      continue;
    }

    if (op.kind === 'rect') {
      const top = height - op.y;
      const bottom = height - (op.y + op.height);
      const left = op.x;
      const right = op.x + op.width;

      if (op.fill) {
        const [r, g, b] = rgb(op.fill);
        operators.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
      }
      if (op.stroke) {
        const [r, g, b] = rgb(op.stroke);
        operators.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
        operators.push(`${(op.lineWidth ?? 1).toFixed(2)} w`);
      }

      const radius = Math.max(0, Math.min(op.radius ?? 0, op.width / 2, op.height / 2));
      if (radius > 0.01) {
        // A rounded rectangle, drawn with the four quarter circles a rounded
        // corner is made of. The control points are the standard 0.5523 of
        // the radius, which is the curve that looks like a circle.
        const k = radius * 0.5523;
        const y0 = bottom;
        const y1 = top;
        operators.push(`${left + radius} ${y0} m`);
        operators.push(`${right - radius} ${y0} l`);
        operators.push(`${right - radius + k} ${y0} ${right} ${y0 + radius - k} ${right} ${y0 + radius} c`);
        operators.push(`${right} ${y1 - radius} l`);
        operators.push(`${right} ${y1 - radius + k} ${right - radius + k} ${y1} ${right - radius} ${y1} c`);
        operators.push(`${left + radius} ${y1} l`);
        operators.push(`${left + radius - k} ${y1} ${left} ${y1 - radius + k} ${left} ${y1 - radius} c`);
        operators.push(`${left} ${y0 + radius} l`);
        operators.push(`${left} ${y0 + radius - k} ${left + radius - k} ${y0} ${left + radius} ${y0} c`);
      } else {
        operators.push(`${left} ${bottom} ${right - left} ${op.height} re`);
      }

      if (op.fill && op.stroke) operators.push('B');
      else if (op.fill) operators.push('f');
      else if (op.stroke) operators.push('S');
      continue;
    }

    if (op.kind === 'line') {
      const [r, g, b] = rgb(op.color);
      operators.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
      operators.push(`${op.width.toFixed(2)} w`);
      operators.push(`${op.x1.toFixed(2)} ${(height - op.y1).toFixed(2)} m`);
      operators.push(`${op.x2.toFixed(2)} ${(height - op.y2).toFixed(2)} l`);
      operators.push('S');
      continue;
    }
  }

  return operators.join('\n');
}

/* -------------------------------------------------------------------------- */
/* The document                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds the PDF.
 *
 * `fonts` holds the faces that were used. A face that was prepared but never
 * drawn is still written, because the writer cannot know which of its glyphs
 * ended up on the page; the cost of an unused face is small and the cost of a
 * missing one is a document that cannot be opened.
 */
export function buildPdf(
  pages: readonly PdfPage[],
  fonts: readonly PreparedFont[],
  metadata: PdfMetadata = {}
): Uint8Array {
  if (pages.length === 0) {
    throw new Error('A PDF needs at least one page.');
  }

  const store = new PdfObjectStore();
  const encoder = new TextEncoder();
  const pagesId = store.reserve();

  /* --- The fonts -------------------------------------------------------- */
  const fontObjectIds = new Map<string, number>();

  for (const font of fonts) {
    const program = font.program;
    const compressed = zlibSync(program);
    const head = encoder.encode(
      `<< /Length ${compressed.length} /Length1 ${program.length} /Filter /FlateDecode >>\nstream\n`
    );
    const tail = encoder.encode('\nendstream');
    const fileBody = new Uint8Array(head.length + compressed.length + tail.length);
    fileBody.set(head, 0);
    fileBody.set(compressed, head.length);
    fileBody.set(tail, head.length + compressed.length);
    const fileId = store.add(fileBody);

    const descriptorId = store.add(
      `<< /Type /FontDescriptor /FontName /${font.baseFont} /Flags ${font.flags} ` +
        `/FontBBox [${font.bbox.join(' ')}] /ItalicAngle ${font.italicAngle} ` +
        `/Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} ` +
        `/StemV ${font.stemV} /FontFile2 ${fileId} 0 R >>`
    );

    const cidFontId = store.add(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.baseFont} ` +
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widthsArray(font)}] ` +
        `/CIDToGIDMap /Identity >>`
    );

    const toUnicodeId = store.add(textStream('', toUnicodeCMap(font)));

    const type0Id = store.add(
      `<< /Type /Font /Subtype /Type0 /BaseFont /${font.baseFont} ` +
        `/Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] ` +
        `/ToUnicode ${toUnicodeId} 0 R >>`
    );

    fontObjectIds.set(font.id, type0Id);
  }

  /* --- The pages -------------------------------------------------------- */
  const pageIds: number[] = [];

  for (const page of pages) {
    const fontResources = fonts
      .map((font) => `/${font.id} ${fontObjectIds.get(font.id)} 0 R`)
      .join(' ');
    const content = contentStream(page);
    const contentId = store.add(compressedStream(encoder.encode(content)));

    const annotationIds: number[] = [];
    for (const op of page.ops) {
      if (op.kind !== 'link') continue;
      if (!/^(https?:|mailto:|tel:)/i.test(op.url)) continue;
      const bottom = page.height - (op.y + op.height);
      annotationIds.push(
        store.add(
          `<< /Type /Annot /Subtype /Link ` +
            `/Rect [${op.x.toFixed(2)} ${bottom.toFixed(2)} ${(op.x + op.width).toFixed(2)} ${(
              bottom + op.height
            ).toFixed(2)}] ` +
            `/Border [0 0 0] /A << /S /URI /URI ${literal(op.url)} >> >>`
        )
      );
    }

    pageIds.push(
      store.add(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
          `/MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] ` +
          `/Resources << /Font << ${fontResources} >> /ProcSet [/PDF /Text] >> ` +
          `/Contents ${contentId} 0 R` +
          (annotationIds.length
            ? ` /Annots [${annotationIds.map((id) => `${id} 0 R`).join(' ')}]`
            : '') +
          ` >>`
      )
    );
  }

  store.set(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  );

  const catalogId = store.add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const infoEntries: string[] = [];
  if (metadata.title) infoEntries.push(`/Title ${literal(metadata.title)}`);
  if (metadata.author) infoEntries.push(`/Author ${literal(metadata.author)}`);
  if (metadata.subject) infoEntries.push(`/Subject ${literal(metadata.subject)}`);
  infoEntries.push(
    `/Creator ${literal(metadata.creator ?? 'Roadmapak CV Studio')}`,
    '/Producer (Roadmapak)'
  );
  const infoId = store.add(`<< ${infoEntries.join(' ')} >>`);

  return store.build(catalogId, infoId);
}
