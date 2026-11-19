/**
 * A small, dependency-free PDF writer.
 *
 * The CV export needs a PDF file, not a print dialog: a click that produces
 * `Ahmed_Ebrahim_CV.pdf` in the downloads folder. The browser has no PDF
 * writer, so this file is the writer.
 *
 * It writes the one kind of document the CV export needs and nothing else:
 * one high-resolution JPEG per page, an invisible text layer over it so the
 * words are selectable and searchable, and link annotations so a portfolio
 * URL is still clickable. The structure is ordinary PDF 1.7 with a classic
 * cross-reference table, which every reader accepts.
 *
 * The writer is deliberately pure: it takes pages as data and returns bytes.
 * The browser part — finding the paper on the screen, paginating it and
 * rasterising each page — lives in `src/lib/cvPdfExport.ts`, so the file
 * format can be tested without a browser.
 */

import { zlibSync } from 'fflate';

/** One piece of invisible text, positioned from the page's top-left corner. */
export interface PdfText {
  text: string;
  /** Left edge, in PDF points. */
  x: number;
  /** Top edge, in PDF points. */
  top: number;
  /** Measured width, in PDF points. */
  width: number;
  /** Font size, in PDF points. */
  size: number;
}

/** One clickable rectangle, positioned from the page's top-left corner. */
export interface PdfLink {
  x: number;
  top: number;
  width: number;
  height: number;
  url: string;
}

/** One page: a JPEG and the layers drawn over it. */
export interface PdfPage {
  jpeg: Uint8Array;
  /** Pixel width of the JPEG. */
  pixelWidth: number;
  /** Pixel height of the JPEG. */
  pixelHeight: number;
  /** Page width, in PDF points. */
  width: number;
  /** Page height, in PDF points. */
  height: number;
  text?: PdfText[];
  links?: PdfLink[];
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
}

/** A4 in PDF points: 210mm × 297mm. */
export const PDF_A4_WIDTH = 595.28;
export const PDF_A4_HEIGHT = 841.89;

/**
 * The glyphs of the invisible text layer.
 *
 * A PDF text-showing operator writes CHARACTER CODES, not Unicode, and the
 * reader needs a font to decide how wide each code is. Embedding a real
 * font would mean shipping a font file for every CV language. Instead the
 * layer uses a Type 3 font whose glyphs are declared one em wide and whose
 * paint procedure draws nothing; text is shown in render mode 3 (invisible)
 * so the glyphs are never painted at all. A `ToUnicode` map turns each code
 * back into the character that produced it, which is what selection and
 * copy-and-paste read.
 *
 * A simple PDF font addresses at most 255 codes, so the characters of a
 * document are split across as many Type 3 fonts as it needs. Arabic, Latin,
 * punctuation and the Arabic-Indic digits fit in a handful.
 */
interface FontCode {
  font: number;
  code: number;
}

const MAX_CODES_PER_FONT = 200;

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
 * Assigns a character code to every distinct character of the document.
 *
 * The assignment is sorted by code point so that the same document always
 * produces the same file, byte for byte, which makes an export diffable and
 * the tests deterministic.
 */
export function buildFontMapping(pages: readonly PdfPage[]): {
  map: Map<number, FontCode>;
  fontCount: number;
} {
  const charSet = new Set<number>();
  for (const page of pages) {
    for (const run of page.text ?? []) {
      for (const character of run.text) {
        charSet.add(character.codePointAt(0) ?? 0);
      }
    }
  }
  const codePoints = [...charSet].sort((a, b) => a - b);
  const map = new Map<number, FontCode>();
  codePoints.forEach((codePoint, index) => {
    map.set(codePoint, {
      font: Math.floor(index / MAX_CODES_PER_FONT),
      code: (index % MAX_CODES_PER_FONT) + 1,
    });
  });
  return {
    map,
    fontCount: Math.ceil(codePoints.length / MAX_CODES_PER_FONT),
  };
}

/** Encodes character codes as a PDF hexadecimal string. */
function hexString(bytes: number[]): string {
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}>`;
}

/** Escapes a string for a literal PDF string. */
function literal(value: string): string {
  return `(${value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function fontName(index: number): string {
  return `F${index}`;
}

/** Characters that read right to left. */
const RTL_CHARACTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

/**
 * Writes a right-to-left run the way a PDF text layer is read back.
 *
 * A PDF has no bidi algorithm: the words of a line are stored in the order
 * they are shown, and readers reverse a right-to-left run when they extract
 * it. Storing the logical order therefore comes back reversed. Reversing
 * each contiguous right-to-left stretch — and leaving Latin words, spaces
 * and punctuation where they are — makes copy-and-paste return the text the
 * candidate wrote. The layer is invisible, so this changes nothing on the
 * page.
 */
export function textLayerOrder(text: string): string {
  let output = '';
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    output += [...buffer].reverse().join('');
    buffer = '';
  };
  for (const character of text) {
    if (RTL_CHARACTER.test(character)) {
      buffer += character;
    } else {
      flush();
      output += character;
    }
  }
  flush();
  return output;
}

/**
 * Builds the content-stream operators of one invisible line of text.
 *
 * A run is split where its characters belong to different Type 3 fonts.
 * Within a segment the horizontal scaling (`Tz`) stretches or squeezes the
 * one-em glyphs to exactly the width the real text occupied, so a selection
 * rectangle sits over the words it belongs to.
 */
function textOperators(
  run: PdfText,
  map: Map<number, FontCode>,
  pageHeight: number
): string {
  const characters = [...textLayerOrder(run.text)];
  if (characters.length === 0) return '';
  const size = run.size > 0 ? run.size : 10;
  const baseline = pageHeight - run.top - size * 0.8;

  const segments: Array<{ font: number; codes: number[]; count: number }> = [];
  for (const character of characters) {
    const codePoint = character.codePointAt(0) ?? 0;
    const code = map.get(codePoint);
    if (!code) continue;
    const last = segments[segments.length - 1];
    if (last && last.font === code.font) {
      last.codes.push(code.code);
      last.count += 1;
    } else {
      segments.push({ font: code.font, codes: [code.code], count: 1 });
    }
  }
  if (segments.length === 0) return '';

  const operators: string[] = ['BT', '3 Tr'];
  let consumed = 0;
  for (const segment of segments) {
    const natural = size * segment.count;
    const share = run.width * (segment.count / characters.length);
    const scale = natural > 0 ? Math.max(1, Math.min(1000, (share / natural) * 100)) : 100;
    const x = run.x + (run.width * consumed) / characters.length;
    operators.push(
      `/${fontName(segment.font)} ${size.toFixed(2)} Tf`,
      `${scale.toFixed(2)} Tz`,
      `1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm`,
      `${hexString(segment.codes)} Tj`
    );
    consumed += segment.count;
  }
  operators.push('ET');
  return operators.join('\n');
}

/**
 * The CMap that turns a code back into the character it stands for.
 *
 * `beginbfchar` blocks are limited to 100 entries by the specification, so
 * the map is written in blocks even when a font holds fewer characters.
 */
function toUnicodeCMap(codes: Array<{ code: number; value: number }>): string {
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
  ];
  for (let index = 0; index < codes.length; index += 100) {
    const block = codes.slice(index, index + 100);
    lines.push(`${block.length} beginbfchar`);
    for (const entry of block) {
      lines.push(
        `<${entry.code.toString(16).toUpperCase().padStart(2, '0')}> <${codePointHex(entry.value)}>`
      );
    }
    lines.push('endbfchar');
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
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

/** The JPEG image stream of one page. */
function imageStream(page: PdfPage): Uint8Array {
  const head = new TextEncoder().encode(
    `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${
      page.pixelHeight
    } /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true /Length ${
      page.jpeg.length
    } >>\nstream\n`
  );
  const tail = new TextEncoder().encode('\nendstream');
  const output = new Uint8Array(head.length + page.jpeg.length + tail.length);
  output.set(head, 0);
  output.set(page.jpeg, head.length);
  output.set(tail, head.length + page.jpeg.length);
  return output;
}

/**
 * Builds a PDF from pages of JPEGs, invisible text and links.
 *
 * Every page is one image, so the file looks exactly like the paper the
 * candidate approved — including Arabic shaping, the template's fonts and
 * its columns — while the text layer keeps the words searchable.
 */
export function buildPdf(
  pages: readonly PdfPage[],
  metadata: PdfMetadata = {}
): Uint8Array {
  if (pages.length === 0) {
    throw new Error('A PDF needs at least one page.');
  }

  const store = new PdfObjectStore();
  const encoder = new TextEncoder();
  const pagesId = store.reserve();
  const { map, fontCount } = buildFontMapping(pages);

  // The fonts are shared by every page: one Type 3 font object, one glyph
  // procedure per character code and one ToUnicode map.
  const fontIds: number[] = [];
  for (let fontIndex = 0; fontIndex < fontCount; fontIndex += 1) {
    const entries = [...map.entries()]
      .filter(([, code]) => code.font === fontIndex)
      .sort((a, b) => a[1].code - b[1].code);
    const lastCode = entries.reduce((max, [, code]) => Math.max(max, code.code), 1);

    const charProcIds = new Map<number, number>();
    for (const [, code] of entries) {
      charProcIds.set(code.code, store.add(textStream('', '1000 0 d0')));
    }

    const charProcs = [...charProcIds.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([code, id]) => `/g${code} ${id} 0 R`)
      .join(' ');
    const differences = [
      1,
      ...[...charProcIds.keys()].sort((a, b) => a - b).map((code) => `/g${code}`),
    ];
    const widths = Array.from({ length: lastCode }, () => 1000).join(' ');

    const toUnicodeId = store.add(
      textStream(
        '',
        toUnicodeCMap(
          entries
            .map(([codePoint, code]) => ({ code: code.code, value: codePoint }))
            .sort((a, b) => a.code - b.code)
        )
      )
    );

    fontIds.push(
      store.add(
        `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] ` +
          `/FontMatrix [0.001 0 0 0.001 0 0] ` +
          `/CharProcs << ${charProcs} >> ` +
          `/Encoding << /Type /Encoding /Differences [${differences.join(' ')}] >> ` +
          `/FirstChar 1 /LastChar ${lastCode} /Widths [${widths}] ` +
          `/ToUnicode ${toUnicodeId} 0 R ` +
          `/Resources << >> >>`
      )
    );
  }

  const pageIds: number[] = [];

  for (const page of pages) {
    const imageId = store.add(imageStream(page));
    const fontResources = fontIds
      .map((id, index) => `/${fontName(index)} ${id} 0 R`)
      .join(' ');

    const operators: string[] = [
      'q',
      `${page.width.toFixed(2)} 0 0 ${page.height.toFixed(2)} 0 0 cm`,
      '/Im0 Do',
      'Q',
    ];
    for (const run of page.text ?? []) {
      const operator = textOperators(run, map, page.height);
      if (operator) operators.push(operator);
    }

    const contentId = store.add(compressedStream(encoder.encode(operators.join('\n'))));

    const annotationIds: number[] = [];
    for (const link of page.links ?? []) {
      if (!/^(https?:|mailto:)/i.test(link.url)) continue;
      const bottom = page.height - (link.top + link.height);
      annotationIds.push(
        store.add(
          `<< /Type /Annot /Subtype /Link ` +
            `/Rect [${link.x.toFixed(2)} ${bottom.toFixed(2)} ${(
              link.x + link.width
            ).toFixed(2)} ${(bottom + link.height).toFixed(2)}] ` +
            `/Border [0 0 0] /A << /S /URI /URI ${literal(link.url)} >> >>`
        )
      );
    }

    pageIds.push(
      store.add(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
          `/MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> ` +
          `/Font << ${fontResources} >> >> ` +
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
    `<< /Type /Pages /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] /Count ${pageIds.length} >>`
  );

  const catalogId = store.add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const infoEntries: string[] = [];
  if (metadata.title) infoEntries.push(`/Title ${literal(metadata.title)}`);
  if (metadata.author) infoEntries.push(`/Author ${literal(metadata.author)}`);
  if (metadata.subject) infoEntries.push(`/Subject ${literal(metadata.subject)}`);
  infoEntries.push(
    `/Creator ${literal(metadata.creator ?? 'CareerRa CV Studio')}`,
    '/Producer (CareerRa)'
  );
  const infoId = store.add(`<< ${infoEntries.join(' ')} >>`);

  return store.build(catalogId, infoId);
}
