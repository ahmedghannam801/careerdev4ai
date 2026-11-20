/**
 * The fonts of the PDF, and the shaping that turns words into glyphs.
 * ---------------------------------------------------------------------------
 * A PDF draws glyphs, not letters. This module is the bridge between the two:
 * it holds the fonts, asks fontkit to shape a run of text into the glyphs the
 * font actually has (with the Arabic joining forms applied), measures how wide
 * those glyphs are, and records the mapping back to the characters so the
 * text can be selected, searched and copied out of the finished file.
 *
 * WHY FONTKIT
 * Fontkit is the OpenType engine behind PDFKit, and it is the part that
 * matters here: it applies the font's own GSUB and GPOS tables, which is what
 * produces the joined forms of Arabic (ﺑ, ﺒ, ﺤ …) and the marks that sit on
 * top of a letter. A library that only maps characters to glyphs one by one
 * would write Arabic as a row of isolated letters, which is not Arabic.
 *
 * The glyphs come back in VISUAL order for a right-to-left run — fontkit
 * reverses them itself — so the renderer can paint them from left to right
 * without knowing anything about direction.
 *
 * THE FONTS ARE EMBEDDED
 * Every font is written into the PDF as a subset: only the glyphs the
 * document actually uses are kept. That is what makes the file small, and it
 * is also what makes the text extractable — a `ToUnicode` map ties every
 * glyph in the file back to the characters it stands for.
 *
 * THE FONTS ARE LICENSED FOR THIS
 * Every family here is under the SIL Open Font License 1.1, which permits
 * embedding in a document that is given away. The licence of each family
 * travels with the file in `public/fonts/LICENSES.md`.
 */

import * as fontkit from 'fontkit';

import { containsArabicScript } from './bidi.ts';

/* -------------------------------------------------------------------------- */
/* The families                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The typeface families a template can ask for.
 *
 * These are the same three the paper uses — a sans body, a serif for the
 * editorial templates and a mono for the technical ones — plus the Arabic
 * face, which carries Arabic and, in a right-to-left document, the whole
 * document.
 */
export type PdfFontFamily = 'sans' | 'serif' | 'mono' | 'arabic';

/** The file name of each face of each family. */
export const PDF_FONT_FILES: Record<PdfFontFamily, { regular: string; bold: string }> = {
  sans: {
    regular: 'PlusJakartaSans-Regular.ttf',
    bold: 'PlusJakartaSans-Bold.ttf',
  },
  serif: {
    regular: 'Gelasio-Regular.ttf',
    bold: 'Gelasio-Bold.ttf',
  },
  mono: {
    regular: 'RobotoMono-Regular.ttf',
    bold: 'RobotoMono-Bold.ttf',
  },
  arabic: {
    regular: 'IBMPlexSansArabic-Regular.ttf',
    bold: 'IBMPlexSansArabic-Bold.ttf',
  },
};

/** The bytes of one family's two weights. */
export interface PdfFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

/** Every family's bytes, ready to be shaped. */
export type PdfFontSources = Record<PdfFontFamily, PdfFontBytes>;

/* -------------------------------------------------------------------------- */
/* One face                                                                     */
/* -------------------------------------------------------------------------- */

/** A shaped run of text: the glyphs to paint, and how wide they are. */
export interface ShapedRun {
  /** The glyph ids, in the order they are painted. */
  glyphs: number[];
  /**
   * The advance of every glyph, in 1000ths of an em.
   *
   * The first is the glyph's own width; the rest include the kerning, so the
   * sum is the true width of the run.
   */
  advances: number[];
  /** The width of the run, in 1000ths of an em. */
  width: number;
  /** True when the run reads from right to left. */
  rtl: boolean;
}

/** A font, ready to be written into the PDF. */
export interface PreparedFont {
  /** The resource name, such as `F1`. */
  id: string;
  /** The subset font program. */
  program: Uint8Array;
  /** The width of every glyph in the subset, in 1000ths of an em. */
  widths: Map<number, number>;
  /** The characters every glyph in the subset stands for. */
  toUnicode: Map<number, number[]>;
  /** The bounding box of the font, in 1000ths of an em. */
  bbox: [number, number, number, number];
  /** The ascent, in 1000ths of an em. */
  ascent: number;
  /** The descent, in 1000ths of an em. */
  descent: number;
  /** The height of a capital letter, in 1000ths of an em. */
  capHeight: number;
  /** The italic angle, in degrees. */
  italicAngle: number;
  /** A rough stem width, in 1000ths of an em. */
  stemV: number;
  /** The PDF font flags. */
  flags: number;
  /** The PostScript name of the face. */
  baseFont: string;
}

/** The fontkit font, as this module needs it. */
type KitFont = fontkit.FontkitFont;

/** The fontkit subset, as this module needs it. */
interface KitSubset {
  includeGlyph(glyph: number | { id: number }): number;
  encode(): Uint8Array;
}

/**
 * One face of one family, with the subset it accumulates.
 *
 * A face is used for one document. The subset grows as the document is laid
 * out, and `prepare()` turns it into the resource the writer embeds.
 */
export class PdfFont {
  readonly id: string;

  private readonly kit: KitFont;
  private readonly subset: KitSubset;
  private readonly originalToSubset = new Map<number, number>();
  private readonly widths = new Map<number, number>();
  private readonly toUnicode = new Map<number, number[]>();
  private readonly unitsPerEm: number;
  private readonly scale: number;

  constructor(id: string, kit: KitFont) {
    this.id = id;
    this.kit = kit;
    this.unitsPerEm = this.kit.unitsPerEm || 1000;
    this.scale = 1000 / this.unitsPerEm;
    this.subset = (this.kit as unknown as { createSubset(): KitSubset }).createSubset();
  }

  /**
   * Whether this face carries every character of a piece of text.
   *
   * The renderer asks this before it picks a face, so a character that the
   * template's own typeface does not have — an Arabic-Indic digit, a rare
   * symbol — is drawn with a face that has it rather than with an empty box.
   */
  covers(text: string): boolean {
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x20) continue;
      if (!this.kit.hasGlyphForCodePoint(codePoint)) return false;
    }
    return true;
  }

  /** The width of one glyph, in 1000ths of an em. */
  private naturalWidth(glyphId: number): number {
    const glyph = this.kit.getGlyph(glyphId);
    return (glyph.advanceWidth ?? 0) * this.scale;
  }

  /** The subset glyph id of an original glyph id. */
  private subsetGlyph(glyphId: number): number {
    const known = this.originalToSubset.get(glyphId);
    if (known !== undefined) return known;
    const subsetId = this.subset.includeGlyph(glyphId);
    this.originalToSubset.set(glyphId, subsetId);
    if (!this.widths.has(subsetId)) {
      this.widths.set(subsetId, Math.round(this.naturalWidth(glyphId)));
    }
    return subsetId;
  }

  /**
   * Shapes a run of text into the glyphs to paint.
   *
   * `text` is the LOGICAL order of the run: the order the characters were
   * written in. For a right-to-left run the Arabic joining forms depend on
   * that order, and fontkit returns the glyphs in the visual order they must
   * be painted in.
   */
  shape(text: string, rtl: boolean): ShapedRun {
    if (!text) return { glyphs: [], advances: [], width: 0, rtl };

    // The script is decided by the CHARACTERS, not by the direction. An
    // Arabic-Indic number inside an Arabic sentence is laid out left to right
    // by the bidirectional algorithm, but it is still Arabic script and only
    // the Arabic face has a glyph for it.
    const script = containsArabicScript(text) ? 'arab' : 'latn';
    const run = this.kit.layout(text, [], script, undefined, rtl ? 'rtl' : 'ltr');

    const glyphs: number[] = [];
    const advances: number[] = [];
    let width = 0;

    for (let index = 0; index < run.glyphs.length; index += 1) {
      const glyph = run.glyphs[index];
      const position = run.positions[index];
      const originalId = glyph.id;
      const subsetId = this.subsetGlyph(originalId);
      glyphs.push(subsetId);

      const actual = Math.round((position?.xAdvance ?? 0) * this.scale);
      advances.push(actual);
      width += actual;

      // The characters the glyph stands for. fontkit keeps them through the
      // substitutions that produce the Arabic joining forms, so a joined
      // letter still maps back to the letter the candidate typed.
      //
      // Glyph zero is the "missing glyph" box, and it is given no characters:
      // a character the font does not have must read as nothing rather than
      // as the first character that happened to be missing.
      //
      // THE ORDER OF A LIGATURE'S CHARACTERS MATTERS
      // A glyph may stand for more than one character: the font joins "ب" and
      // "ر" into a single ligature, and that one glyph has to read back as
      // both letters.
      //
      // The order of those letters depends on which way the run reads, and
      // this is the one place where the two conventions meet.
      //
      // A PDF stores its text in the order it is PAINTED. For a right-to-left
      // run that is the visual order — the letters run from the right of the
      // line to the left, which is the order the shaper returns them in. A
      // reader that wants the text back in reading order applies the
      // bidirectional algorithm to what it reads, which means it reverses the
      // right-to-left run.
      //
      // So the characters of a ligature have to be written in the same visual
      // order as the glyph that carries them: the reader will reverse the
      // whole run, ligature included, and only a ligature written in visual
      // order comes back as the letters that were typed. Writing them the
      // other way round turns "مصر" into "مرص" — two different words.
      //
      // A left-to-right run is its own reverse, so there the characters are
      // written as they are.
      //
      // The first use of a glyph decides its entry, because a `ToUnicode` map
      // holds one destination per glyph. That is safe here: a glyph that
      // stands for more than one character is an Arabic ligature, and an
      // Arabic ligature only ever appears in a right-to-left run. The Arabic
      // face does draw the Arabic-Indic digits in a left-to-right run, but a
      // digit is one character and reversing one character changes nothing.
      const codePoints = glyph.codePoints ?? [];
      if (originalId !== 0 && codePoints.length > 0 && !this.toUnicode.has(subsetId)) {
        this.toUnicode.set(subsetId, rtl ? [...codePoints].reverse() : [...codePoints]);
      }
    }

    return { glyphs, advances, width, rtl };
  }

  /**
   * The width a glyph takes on its own, in 1000ths of an em.
   *
   * This is the width the PDF's `W` array carries. The difference between it
   * and the width the glyph actually takes in a run is the kerning, and it is
   * written into the file as the adjustment between the two glyphs.
   */
  naturalWidthOf(subsetGlyphId: number): number {
    return this.widths.get(subsetGlyphId) ?? 0;
  }

  /**
   * The width of a piece of text, in 1000ths of an em.
   *
   * The text is shaped, so the measurement includes the joining forms and the
   * kerning of the font itself.
   */
  measure(text: string, rtl: boolean): number {
    return this.shape(text, rtl).width;
  }

  /** Turns the accumulated subset into the resource the writer embeds. */
  prepare(): PreparedFont {
    const head = this.kit.head ?? {};
    const hhea = this.kit.hhea ?? {};
    const post = this.kit.post ?? {};

    const bbox = (head as { xMin?: number; yMin?: number; xMax?: number; yMax?: number });
    const scale = this.scale;

    const name = this.kit.postscriptName ?? this.id;

    return {
      id: this.id,
      program: this.subset.encode(),
      widths: this.widths,
      toUnicode: this.toUnicode,
      bbox: [
        Math.round((bbox.xMin ?? 0) * scale),
        Math.round((bbox.yMin ?? 0) * scale),
        Math.round((bbox.xMax ?? 0) * scale),
        Math.round((bbox.yMax ?? 0) * scale),
      ],
      ascent: Math.round((hhea.ascender ?? 800) * scale),
      descent: Math.round((hhea.descender ?? -200) * scale),
      capHeight: Math.round((this.kit.capHeight ?? 700) * scale),
      italicAngle: Math.round(((post as { italicAngle?: number }).italicAngle ?? 0) * 100) / 100,
      stemV: 80,
      flags: 4,
      baseFont: name.replace(/[^A-Za-z0-9]/g, ''),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* The registry                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every face the document may use, keyed by family and weight.
 *
 * The renderer asks for a family and a weight; the registry hands back the
 * face. Faces are created lazily, so a document that never uses the serif
 * never loads the serif.
 */
export class PdfFontRegistry {
  private readonly sources: PdfFontSources;
  private readonly faces = new Map<string, PdfFont>();
  /** The parsed font of each family and weight, shared with the faces. */
  private readonly kits = new Map<string, KitFont>();
  private counter = 0;

  constructor(sources: PdfFontSources) {
    this.sources = sources;
  }

  /**
   * The parsed font of a family at a weight.
   *
   * The font is parsed once and shared: the face and the coverage check both
   * need it, and parsing eight faces twice for one export is a waste the
   * candidate pays for in the time the export takes.
   */
  private kitFor(family: PdfFontFamily, bold: boolean): KitFont {
    const key = `${family}:${bold ? 'bold' : 'regular'}`;
    const existing = this.kits.get(key);
    if (existing) return existing;

    const bytes = this.sources[family];
    const kit = fontkit.create(bold ? bytes.bold : bytes.regular) as KitFont;
    this.kits.set(key, kit);
    return kit;
  }

  /** Whether a family carries every character of a piece of text. */
  covers(family: PdfFontFamily, bold: boolean, text: string): boolean {
    if (!text) return true;
    const kit = this.kitFor(family, bold);
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x20) continue;
      if (!kit.hasGlyphForCodePoint(codePoint)) return false;
    }
    return true;
  }

  /** The face of a family at a weight. */
  face(family: PdfFontFamily, bold: boolean): PdfFont {
    const key = `${family}:${bold ? 'bold' : 'regular'}`;
    const existing = this.faces.get(key);
    if (existing) return existing;

    this.counter += 1;
    const face = new PdfFont(`F${this.counter}`, this.kitFor(family, bold));
    this.faces.set(key, face);
    return face;
  }

  /** Every face that was used, ready to be written into the PDF. */
  prepare(): PreparedFont[] {
    return [...this.faces.values()].map((face) => face.prepare());
  }
}

/* -------------------------------------------------------------------------- */
/* Loading the fonts                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Loads the fonts over the network.
 *
 * The browser fetches them from the site, once, and the export waits for
 * them. The files are small — a few hundred kilobytes together — and they
 * are cached by the browser after the first export.
 */
export async function loadPdfFonts(
  baseUrl = '/fonts',
  fetchImpl: typeof fetch = fetch
): Promise<PdfFontSources> {
  const families = Object.keys(PDF_FONT_FILES) as PdfFontFamily[];

  const entries = await Promise.all(
    families.map(async (family) => {
      const files = PDF_FONT_FILES[family];
      const [regular, bold] = await Promise.all([
        fetchImpl(`${baseUrl}/${files.regular}`).then(readFontResponse),
        fetchImpl(`${baseUrl}/${files.bold}`).then(readFontResponse),
      ]);
      return [family, { regular, bold }] as const;
    })
  );

  return Object.fromEntries(entries) as PdfFontSources;
}

async function readFontResponse(response: Response): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`The font ${response.url} could not be loaded (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
