/**
 * The parts of fontkit this project uses.
 * ---------------------------------------------------------------------------
 * fontkit is the OpenType engine behind PDFKit. It is the piece that applies a
 * font's own GSUB and GPOS tables, which is what gives the Arabic its joining
 * forms, and it can write a subset of the font for the PDF to embed.
 *
 * The package ships no TypeScript types, so the surface this project relies
 * on is declared here. It is deliberately small: only what the PDF engine
 * calls is described, so that a change in the way the engine uses fontkit is
 * a change in this file.
 */

declare module 'fontkit' {
  /** One glyph of a font. */
  export interface FontkitGlyph {
    /** The glyph's identifier inside the font. */
    id: number;
    /** The width of the glyph, in the font's own units. */
    advanceWidth?: number;
    /** The characters the glyph stands for. */
    codePoints?: number[];
  }

  /** A glyph after shaping. */
  export interface FontkitLayoutGlyph extends FontkitGlyph {
    codePoints: number[];
  }

  /** Where a shaped glyph sits and how far it advances. */
  export interface FontkitPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }

  /** A run of text after shaping. */
  export interface FontkitLayoutRun {
    glyphs: FontkitLayoutGlyph[];
    positions: FontkitPosition[];
  }

  /** The metrics the PDF font descriptor is written from. */
  export interface FontkitHead {
    xMin?: number;
    yMin?: number;
    xMax?: number;
    yMax?: number;
  }

  export interface FontkitHhea {
    ascender?: number;
    descender?: number;
  }

  export interface FontkitPost {
    italicAngle?: number;
  }

  /** A subset of a font: only the glyphs the document uses. */
  export interface FontkitSubset {
    /**
     * Adds a glyph to the subset and returns its identifier inside it.
     *
     * The identifier is what the PDF writes as the character code, which is
     * why the subset is built while the document is laid out.
     */
    includeGlyph(glyph: number | { id: number }): number;
    /** Writes the subset out as a TrueType font program. */
    encode(): Uint8Array;
  }

  /** A font. */
  export interface FontkitFont {
    /** The units the font's sizes are measured in. */
    unitsPerEm: number;
    head?: FontkitHead;
    hhea?: FontkitHhea;
    post?: FontkitPost;
    capHeight?: number;
    postscriptName?: string;
    /** The glyph with the given identifier. */
    getGlyph(id: number): FontkitGlyph;
    /** Whether the font has a glyph for the character. */
    hasGlyphForCodePoint(codePoint: number): boolean;
    /**
     * Shapes a piece of text.
     *
     * The script and the direction decide which of the font's tables are
     * applied: an Arabic run is shaped with the joining forms, and a
     * right-to-left run comes back in the order it is to be drawn.
     */
    layout(
      text: string,
      features?: string[],
      script?: string,
      language?: string,
      direction?: string
    ): FontkitLayoutRun;
    /** Starts a subset of this font. */
    createSubset(): FontkitSubset;
  }

  /** Opens a font from its bytes. */
  export function create(buffer: Uint8Array): FontkitFont;
}
