/**
 * The layout of a CV: one description, shared by the paper and the file.
 *
 * The preview and the DOCX export are two renderings of the same document. If
 * each of them decides for itself how wide the margin is, which bullet glyph
 * is used, how a heading is numbered or how the skills are laid out, then the
 * document a candidate downloads is not the document they approved on screen,
 * and the whole point of the preview is lost.
 *
 * So every layout decision is made HERE, once, and both renderers read it:
 *
 *  - the preview (src/components/cv/templates/CvTemplateRenderer.tsx) draws the
 *    paper from the layout in this file;
 *  - the DOCX export (server/cvTemplates/docx.ts) writes the file from the
 *    same layout.
 *
 * The two formats cannot carry everything alike. A Word file has no chips and
 * no newspaper columns, and the honest thing is to come as close as the format
 * allows rather than to pretend. Every such approximation is marked in this
 * file, and the two renderers share the same decision, so the approximation is
 * at least the SAME approximation on both sides.
 */

import type { CVProfile } from '../src/types/career.ts';
import {
  DEFAULT_CV_SECTION_ORDER,
  isCvSectionKey,
  type CvBulletStyle,
  type CvDensity,
  type CvDividerStyle,
  type CvEntryStyle,
  type CvHeaderStyle,
  type CvHeadingStyle,
  type CvSectionKey,
  type CvSkillsStyle,
  type CvTemplateDefinition,
  type CvTemplateLayout,
  type CvTemplateStructure,
  type CvTypography,
} from './cvTemplates.ts';
import {
  buildCvTemplateDocument,
  orderCvSections,
  splitCvSections,
  type CvDocument,
  type CvDocumentSection,
} from './cvTemplateDocument.ts';
import type { ResumeLanguage } from './resumeLanguage.ts';

/* -------------------------------------------------------------------------- */
/* The sheet                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A sheet of A4 at 96dpi.
 *
 * The renderer lays the document out at this width, and the preview scales it
 * to whatever space it has. The page box is a real A4 sheet rather than a
 * guessed minimum, so a preview can say how many pages a document will print
 * as and a thumbnail can show the whole document rather than a cropped top.
 */
export const CV_PAGE_WIDTH = 794;
export const CV_PAGE_HEIGHT = 1123;

/**
 * The units of the two formats.
 *
 * The paper is laid out in CSS pixels at 96dpi. Word measures margins in
 * twips (a twentieth of a point, 1440 to the inch) and type in half-points.
 * These two conversions are the only place the two systems meet.
 */
export const CV_TWIPS_PER_PIXEL = 15;
export const CV_HALF_POINTS_PER_PIXEL = 1.5;

/** Converts a measurement of the paper into Word's margin unit. */
export function cvPixelsToTwips(pixels: number): number {
  return Math.round(pixels * CV_TWIPS_PER_PIXEL);
}

/** Converts the size of the body type on the paper into Word's type unit. */
export function cvPixelsToHalfPoints(pixels: number): number {
  return Math.round(pixels * CV_HALF_POINTS_PER_PIXEL);
}

/* -------------------------------------------------------------------------- */
/* Density                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The measurements a density describes.
 *
 * Exported so that the preview can work out how many sheets of A4 a document
 * would print as: the page's own margin is part of the measurement.
 */
export interface CvDensityMetrics {
  /** The size of the body type, in pixels at 96dpi. */
  font: number;
  /** The line height, as a multiple of the type size. */
  line: number;
  /** The space between two sections, in pixels. */
  gap: number;
  /** The page margin, in pixels. */
  pad: number;
}

export const CV_TEMPLATE_DENSITY: Record<CvDensity, CvDensityMetrics> = {
  compact: { font: 10.2, line: 1.36, gap: 9, pad: 26 },
  standard: { font: 11.4, line: 1.46, gap: 14, pad: 34 },
  spacious: { font: 12.3, line: 1.6, gap: 19, pad: 42 },
};

/* -------------------------------------------------------------------------- */
/* Typography                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One typeface, as the paper sees it and as Word sees it.
 *
 * The paper uses a CSS stack, so it falls back gracefully when a face is
 * missing. Word names a single face and substitutes its own when that face is
 * absent, so the Word face is the one that is present on every Word install
 * and reads closest to the stack. The two are declared together so that the
 * relationship between them is visible in one place.
 */
export interface CvFontFace {
  /** The CSS font stack used on the paper. */
  css: string;
  /** The Word font used in the exported file. */
  word: string;
}

const CV_SANS_FACE: CvFontFace = {
  css: 'Inter, ui-sans-serif, system-ui, sans-serif',
  word: 'Calibri',
};

const CV_SERIF_FACE: CvFontFace = {
  css: 'Georgia, "Times New Roman", serif',
  word: 'Georgia',
};

const CV_MONO_FACE: CvFontFace = {
  css: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
  word: 'Courier New',
};

/**
 * The typeface a template's typography asks for.
 *
 * A "mixed" document is the one case where the body and the headings differ:
 * a sans body under a serif heading. Everything else uses one face throughout.
 */
export function cvFontFace(typography: CvTypography, part: 'body' | 'heading'): CvFontFace {
  if (typography === 'serif') return CV_SERIF_FACE;
  if (typography === 'mono') return CV_MONO_FACE;
  if (typography === 'mixed') return part === 'heading' ? CV_SERIF_FACE : CV_SANS_FACE;
  return CV_SANS_FACE;
}

/* -------------------------------------------------------------------------- */
/* The small decorative decisions                                               */
/* -------------------------------------------------------------------------- */

/**
 * The character a bullet is marked with.
 *
 * The paper writes the character into the line, in the accent colour. The
 * exported file writes the SAME character, for the same reason: Word's own
 * bullet list cannot be given the template's colour, so a file that used it
 * would show a black round bullet where the paper shows an accent-coloured
 * arrow.
 */
export function cvBulletGlyph(style: CvBulletStyle): string | null {
  switch (style) {
    case 'disc':
      return '•';
    case 'dash':
      return '–';
    case 'square':
      return '▪';
    case 'arrow':
      return '→';
    default:
      return null;
  }
}

/**
 * The character that separates two items in a list.
 *
 * The paper separates with a narrow dot; the file uses the same dot with the
 * breathing room a Word paragraph needs to stay legible.
 */
export const CV_INLINE_SEPARATOR = ' · ';
export const CV_INLINE_SEPARATOR_WORD = '  ·  ';

/** The marker the paper draws beside a heading when a template shows icons. */
export const CV_HEADING_MARK = '▪';

/* -------------------------------------------------------------------------- */
/* Columns                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two columns of a template with a sidebar.
 *
 * The paper measures the columns in fractions of the content width. The file
 * measures them in percentages of the page. Both are derived from the same
 * numbers here, so the narrow column is the same share of the page in the
 * preview and in the export.
 */
export interface CvColumnMetrics {
  /** The narrowest the aside column may become, in pixels. */
  asideMinPx: number;
  /** The weight of the aside column, in fractions. */
  asideFr: number;
  /** The weight of the main column, in fractions. */
  mainFr: number;
  /** The space between the columns, in pixels. */
  gapPx: number;
  /** The share of the content width the aside column takes, in percent. */
  asidePercent: number;
  /** The share of the content width the main column takes, in percent. */
  mainPercent: number;
}

export function cvColumnMetrics(density: CvDensity): CvColumnMetrics {
  const compact = density === 'compact';
  const asideMinPx = compact ? 118 : 132;
  const asideFr = compact ? 0.42 : 0.46;
  const mainFr = 1;
  const gapPx = density === 'compact' ? 14 : density === 'spacious' ? 26 : 20;
  const asideShare = asideFr / (asideFr + mainFr);
  return {
    asideMinPx,
    asideFr,
    mainFr,
    gapPx,
    asidePercent: Math.round(asideShare * 100),
    mainPercent: Math.round((1 - asideShare) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* The ink                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The greys of the document.
 *
 * They are declared here so that the paper and the file are printed with the
 * same greys, and so that a new template does not invent a shade of its own.
 */
export const CV_INK = {
  /** The colour of the page itself. */
  page: '#1e293b',
  /** The colour of a heading. */
  heading: '#0f172a',
  /** The colour of body text. */
  body: '#334155',
  /** The colour of a secondary line, such as an employer. */
  secondary: '#475569',
  /** The colour of a quiet line, such as a date. */
  muted: '#64748b',
  /** The colour of a rule. */
  rule: '#e2e8f0',
  /** The colour of a hairline. */
  hairline: '#cbd5e1',
} as const;

/** The same greys, as Word writes them. */
export const CV_INK_WORD: Record<keyof typeof CV_INK, string> = {
  page: '1E293B',
  heading: '0F172A',
  body: '334155',
  secondary: '475569',
  muted: '64748B',
  rule: 'E2E8F0',
  hairline: 'CBD5E1',
};

/**
 * A tint of the accent, blended towards white.
 *
 * The paper draws a tinted band with an alpha channel. Word shades with a
 * solid colour, so the file needs the same band as a solid one. The tint is
 * computed here, once, so both sides pick the same shade.
 */
export function cvAccentTint(accent: string, strength = 0.07): string {
  const hex = accent.replace('#', '');
  if (hex.length !== 6) return accent;
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    const mixed = Math.round(value * strength + 255 * (1 - strength));
    return Math.max(0, Math.min(255, mixed));
  });
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/* -------------------------------------------------------------------------- */
/* The decorations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How a section heading is set.
 *
 * The decisions are here; the paper turns them into CSS and the file turns
 * them into Word properties.
 */
export interface CvHeadingDecoration {
  /** The typeface of the heading. */
  font: CvFontFace;
  /** Whether the heading is set in capitals. */
  allCaps: boolean;
  /** Whether the heading is set in small capitals. */
  smallCaps: boolean;
  /** Whether the heading is slanted. */
  italic: boolean;
  /** The space between the letters. */
  letterSpacing: string;
  /** The weight of the heading. */
  fontWeight: number;
  /** The rule that sits under or beside the heading. */
  rule: 'none' | 'bottom' | 'start';
  /** The colour of the rule. */
  ruleColor: string;
  /** The thickness of the rule, in pixels. */
  ruleWidthPx: number;
  /** Whether the rule is doubled. */
  ruleDouble: boolean;
}

export function cvHeadingDecoration(spec: CvLayoutSpec): CvHeadingDecoration {
  const base: CvHeadingDecoration = {
    font: spec.headingFont,
    allCaps: false,
    smallCaps: false,
    italic: false,
    letterSpacing: '0.08em',
    fontWeight: 700,
    rule: 'none',
    ruleColor: spec.accent,
    ruleWidthPx: 1,
    ruleDouble: false,
  };

  switch (spec.headingStyle) {
    case 'uppercase':
      return { ...base, allCaps: true };
    case 'smallcaps':
      return { ...base, smallCaps: true, letterSpacing: '0.05em' };
    case 'serif':
      return {
        ...base,
        font: CV_SERIF_FACE,
        italic: true,
        fontWeight: 700,
        letterSpacing: '0.01em',
      };
    case 'numbered':
      return { ...base, letterSpacing: '0.03em' };
    case 'bar':
      return {
        ...base,
        allCaps: true,
        rule: 'start',
        ruleColor: spec.accent,
        ruleWidthPx: 3,
      };
    case 'underline':
      return {
        ...base,
        allCaps: true,
        rule: 'bottom',
        ruleColor: spec.accent,
        ruleWidthPx: spec.dividers === 'double' ? 3 : 1,
        ruleDouble: spec.dividers === 'double',
      };
    default:
      return base;
  }
}

/**
 * How the rule that divides two sections is drawn.
 */
export interface CvDividerDecoration {
  /** Whether there is a rule at all. */
  kind: 'none' | 'bottom' | 'block';
  /** The colour of the rule. */
  color: string;
  /** The thickness of the rule, in pixels. */
  widthPx: number;
  /** Whether the rule is doubled. */
  double: boolean;
  /** The fill of a banded divider, when it is banded. */
  fill: string | null;
}

export function cvDividerDecoration(spec: CvLayoutSpec): CvDividerDecoration {
  switch (spec.dividers) {
    case 'line':
      return { kind: 'bottom', color: CV_INK.rule, widthPx: 1, double: false, fill: null };
    case 'double':
      return { kind: 'bottom', color: spec.accent, widthPx: 3, double: true, fill: null };
    case 'accent':
      return { kind: 'bottom', color: spec.accent, widthPx: 2, double: false, fill: null };
    case 'block':
      return {
        kind: 'block',
        color: spec.accent,
        widthPx: 3,
        double: false,
        fill: cvAccentTint(spec.accent, 0.07),
      };
    default:
      return { kind: 'none', color: spec.accent, widthPx: 0, double: false, fill: null };
  }
}

/**
 * How the masthead is set.
 */
export interface CvHeaderDecoration {
  kind: CvHeaderStyle;
  /** The size of the name, in pixels. */
  nameSizePx: number;
  /** Where the masthead sits. */
  alignment: 'start' | 'center' | 'end';
  /** Whether the title is set in capitals. */
  titleAllCaps: boolean;
  /** Whether the title is slanted. */
  titleItalic: boolean;
  /** The colour of the title. */
  titleColor: 'accent' | 'body';
  /** Whether the masthead is a band of accent colour. */
  banner: boolean;
  /** Whether the masthead carries a monogram. */
  monogram: boolean;
  /** The rule that closes the masthead. */
  rule: 'none' | 'accent' | 'thin' | 'double';
}

export function cvHeaderDecoration(spec: CvLayoutSpec): CvHeaderDecoration {
  const base: CvHeaderDecoration = {
    kind: spec.header,
    nameSizePx: 29,
    alignment: 'center',
    titleAllCaps: true,
    titleItalic: false,
    titleColor: 'accent',
    banner: false,
    monogram: false,
    rule: 'none',
  };

  switch (spec.header) {
    case 'left':
      return { ...base, nameSizePx: 30, alignment: 'start', rule: 'accent' };
    case 'banner':
      return { ...base, nameSizePx: 33, alignment: 'start', banner: true };
    case 'split':
      return { ...base, nameSizePx: 31, alignment: 'start', rule: 'accent' };
    case 'monogram':
      return { ...base, nameSizePx: 27, alignment: 'start', monogram: true };
    case 'stacked':
      return { ...base, nameSizePx: 30, alignment: 'start', rule: 'accent' };
    case 'editorial':
      return {
        ...base,
        nameSizePx: 38,
        alignment: 'start',
        titleAllCaps: false,
        titleItalic: true,
        titleColor: 'body',
        rule: 'double',
      };
    case 'compact':
      return { ...base, nameSizePx: 24, alignment: 'start', rule: 'thin' };
    default:
      return base;
  }
}

/**
 * How an entry inside a section is set.
 */
export interface CvEntryDecoration {
  /** Whether the title and the subtitle share one line. */
  titleWithSubtitle: boolean;
  /** Whether the date shares the title's line. */
  metaOnTitleLine: boolean;
  /** Whether the location and the description follow the title block. */
  detailsAfter: boolean;
  /** Whether the entries are laid out as a two-column grid. */
  grid: boolean;
  /** Whether the entries are laid out as cards. */
  card: boolean;
  /** Whether the entries carry a timeline rail. */
  timeline: boolean;
}

export function cvEntryDecoration(spec: CvLayoutSpec): CvEntryDecoration {
  const inline = spec.entryStyle === 'inline' || spec.entryStyle === 'grid';
  return {
    titleWithSubtitle: inline,
    metaOnTitleLine: true,
    detailsAfter: true,
    grid: spec.entryStyle === 'grid' || spec.layout === 'cards',
    card: spec.entryStyle === 'card' || spec.layout === 'cards',
    timeline: spec.entryStyle === 'timeline' || spec.layout === 'timeline',
  };
}

/**
 * How a list of skills is set.
 */
export interface CvSkillsDecoration {
  mode: CvSkillsStyle;
  /** The character that separates two skills on one line. */
  separator: string;
  /** The number of columns the skills are set in. */
  columns: number;
  /** The marker that stands in front of a skill, when the style uses one. */
  marker: string | null;
  /** The colour of the marker. */
  markerAccent: boolean;
}

export function cvSkillsDecoration(
  spec: CvLayoutSpec,
  key?: CvSectionKey
): CvSkillsDecoration {
  // The skills section follows the template's style. Every other list of
  // words — the languages, for instance — is simply a line of words.
  const mode: CvSkillsStyle = key === 'skills' ? spec.skillsStyle : 'inline';
  switch (mode) {
    case 'chips':
      return { mode, separator: CV_INLINE_SEPARATOR, columns: 1, marker: null, markerAccent: false };
    case 'bars':
      return { mode, separator: CV_INLINE_SEPARATOR, columns: 1, marker: '▬', markerAccent: true };
    case 'columns':
      return { mode, separator: CV_INLINE_SEPARATOR, columns: 2, marker: null, markerAccent: false };
    case 'grouped':
      return { mode, separator: CV_INLINE_SEPARATOR, columns: 1, marker: '/', markerAccent: true };
    default:
      return { mode: 'inline', separator: CV_INLINE_SEPARATOR, columns: 1, marker: null, markerAccent: false };
  }
}

/* -------------------------------------------------------------------------- */
/* The order of the sections                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The order the candidate chose.
 *
 * A candidate may reorder the sections of their own document. The order they
 * choose replaces the order the template proposes, because the template's
 * order is a default and the candidate's is a decision. The template still
 * decides everything else: which column a section lives in, how it is set, how
 * it is divided.
 *
 * A section the candidate did not mention keeps the place the template gave
 * it, so a partially ordered document is still a complete one.
 */
export function resolveCvSectionOrder(
  templateOrder: readonly CvSectionKey[],
  candidateOrder?: readonly string[] | null
): readonly CvSectionKey[] {
  if (!candidateOrder || candidateOrder.length === 0) return templateOrder;

  const chosen: CvSectionKey[] = [];
  const seen = new Set<CvSectionKey>();
  for (const key of candidateOrder) {
    if (!isCvSectionKey(key) || seen.has(key)) continue;
    seen.add(key);
    chosen.push(key);
  }
  if (chosen.length === 0) return templateOrder;

  const resolved = [...chosen];
  for (const key of templateOrder) {
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(key);
  }
  return resolved;
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything the two renderers need to know about the shape of the document.
 *
 * This is the description. The preview and the export are two ways of
 * following it.
 */
export interface CvLayoutSpec {
  /* The document's shape */
  layout: CvTemplateLayout;
  header: CvHeaderStyle;
  dividers: CvDividerStyle;
  headingStyle: CvHeadingStyle;
  bulletStyle: CvBulletStyle;
  entryStyle: CvEntryStyle;
  skillsStyle: CvSkillsStyle;
  density: CvDensity;
  accentPosition: CvTemplateStructure['accentPosition'];
  showIcons: boolean;

  /* The measurements */
  metrics: CvDensityMetrics;
  columns: CvColumnMetrics;

  /* The colour */
  /** The accent colour, as it appears on the paper. */
  accent: string;
  /** The accent colour, as Word writes it. */
  accentWord: string;

  /* The type */
  typography: CvTypography;
  bodyFont: CvFontFace;
  headingFont: CvFontFace;
  /** The size of the body type on the paper, in pixels. */
  bodySizePx: number;
  /** The size of the body type in the file, in half-points. */
  bodySizeHalfPoints: number;
  /** The size of a section heading on the paper, in pixels. */
  headingSizePx: number;
  /** The size of a section heading in the file, in half-points. */
  headingSizeHalfPoints: number;
  /** The line height, as a multiple of the type size. */
  lineHeight: number;

  /* The page */
  /** The page margin on the paper, in pixels. */
  marginPx: number;
  /** The page margin in the file, in twips. */
  marginTwips: number;

  /* The details that used to be decided twice */
  /** The character a bullet is marked with, or null when there is no marker. */
  bulletGlyph: string | null;
  /** The order the sections are read in. */
  sectionOrder: readonly CvSectionKey[];
  /** Sections the candidate hid from the printed document. */
  hiddenSections: readonly CvSectionKey[];
  /** The sections placed in the narrow column. */
  sidebarSections: readonly CvSectionKey[];
  /** Whether the document has a narrow column at all. */
  hasSidebar: boolean;
  /** Whether the narrow column comes before the wide one. */
  asideFirst: boolean;
  /** Whether the body reads across two columns. */
  twoColumn: boolean;
}

/**
 * A section and the place it holds in the document.
 *
 * The number is the one printed before a numbered heading. It is counted
 * WITHIN a column, because that is how the paper reads: the wide column
 * numbers its own sections from one, and the narrow column numbers its own.
 */
export interface CvLayoutSection {
  section: CvDocumentSection;
  /** The position of the section inside its column, counting from zero. */
  number: number;
  /** The column the section is drawn in. */
  column: 'main' | 'aside';
}

/**
 * The document and its layout, resolved together.
 *
 * Both renderers take this and nothing else, so neither of them can decide
 * anything on its own.
 */
export interface CvLayoutPlan {
  spec: CvLayoutSpec;
  document: CvDocument;
  /** Every section, in reading order. */
  sections: CvDocumentSection[];
  /** Sections the candidate hid; they are in `sections` but not in a column. */
  hiddenSections: readonly CvSectionKey[];
  /** The sections of the wide column. */
  main: CvLayoutSection[];
  /** The sections of the narrow column. */
  aside: CvLayoutSection[];
  /** The order the candidate chose, when they chose one. */
  candidateOrder: readonly CvSectionKey[] | null;
}

/** Turns a hex colour into the six digits Word writes. */
export function cvAccentWord(accent: string): string {
  return accent.replace('#', '').toUpperCase();
}

/**
 * Works out the layout of a document.
 *
 * The heading size follows the body size, exactly as it does on the paper:
 * a heading is a little larger than the text under it.
 */
function buildSpec(
  template: CvTemplateDefinition,
  sectionOrder: readonly CvSectionKey[],
  layout?: CVProfile['layout']
): CvLayoutSpec {
  const structure = template.structure;
  const metrics = CV_TEMPLATE_DENSITY[structure.density];
  const headingSizePx = Math.round(metrics.font * 0.92 * 10) / 10;
  const supportsSidebar =
    structure.layout === 'sidebar-left' || structure.layout === 'sidebar-right';
  // The template proposes which sections live in the narrow column. The
  // candidate may move a section to the other column, but only a template
  // that HAS two columns can honour that move — a single-column template is
  // not silently turned into a sidebar by a stale preference.
  const sidebar = new Set<CvSectionKey>(structure.sidebarSections ?? []);
  if (supportsSidebar && layout?.sectionColumns) {
    for (const [key, column] of Object.entries(layout.sectionColumns)) {
      if (!isCvSectionKey(key)) continue;
      if (column === 'aside') sidebar.add(key);
      else if (column === 'main') sidebar.delete(key);
    }
  }
  const sidebarSections = [...sidebar];
  const hasSidebar = supportsSidebar && sidebarSections.length > 0;
  // Hiding a section is a printing decision, not a deletion: the key stays in
  // the order of the document, so showing it again restores its place.
  const hiddenSections = [...new Set((layout?.hiddenSections ?? []).filter(isCvSectionKey))];

  return {
    layout: structure.layout,
    header: structure.header,
    dividers: structure.dividers,
    headingStyle: structure.headingStyle,
    bulletStyle: structure.bulletStyle,
    entryStyle: structure.entryStyle,
    skillsStyle: structure.skillsStyle,
    density: structure.density,
    accentPosition: structure.accentPosition,
    showIcons: structure.showIcons,

    metrics,
    columns: cvColumnMetrics(structure.density),

    accent: template.accent,
    accentWord: cvAccentWord(template.accent),

    typography: template.typography,
    bodyFont: cvFontFace(template.typography, 'body'),
    headingFont: cvFontFace(template.typography, 'heading'),
    bodySizePx: metrics.font,
    bodySizeHalfPoints: cvPixelsToHalfPoints(metrics.font),
    headingSizePx,
    headingSizeHalfPoints: cvPixelsToHalfPoints(headingSizePx),
    lineHeight: metrics.line,

    marginPx: metrics.pad,
    marginTwips: cvPixelsToTwips(metrics.pad),

    bulletGlyph: cvBulletGlyph(structure.bulletStyle),
    sectionOrder,
    hiddenSections,
    sidebarSections,
    hasSidebar,
    asideFirst:
      structure.layout === 'sidebar-left' ||
      (structure.layout === 'editorial' && sidebarSections.length > 0),
    twoColumn:
      !hasSidebar && (structure.layout === 'split' || structure.layout === 'editorial'),
  };
}

/**
 * Resolves a document and its template into one plan.
 *
 * Everything that decides what the document looks like happens here: the
 * order of the sections, the column each one is drawn in, and the number a
 * numbered heading carries.
 */
export function buildCvLayoutPlan(options: {
  cv: CVProfile;
  template: CvTemplateDefinition;
  language?: ResumeLanguage;
}): CvLayoutPlan {
  const { cv, template, language = 'en' } = options;
  const document = buildCvTemplateDocument(cv, language);

  const candidateOrder = normalizeCandidateOrder(cv.sectionOrder);
  const sectionOrder = resolveCvSectionOrder(template.structure.sectionOrder, candidateOrder);
  const spec = buildSpec(template, sectionOrder, cv.layout);

  const ordered = orderCvSections(document.sections, sectionOrder);
  const hidden = new Set(spec.hiddenSections);
  const visible = ordered.filter((section) => !hidden.has(section.key));
  const { main, aside } = splitCvSections(visible, spec.sidebarSections);

  return {
    spec,
    document,
    // `sections` is the whole document, including the parts the candidate hid,
    // because the layout editor has to offer a hidden section back.
    sections: ordered,
    hiddenSections: spec.hiddenSections,
    main: main.map((section, number) => ({ section, number, column: 'main' as const })),
    aside: aside.map((section, number) => ({ section, number, column: 'aside' as const })),
    candidateOrder,
  };
}

/**
 * The candidate's own order, when it is one.
 *
 * A stored order that is empty, that names nothing, or that names the same
 * section twice is not an order. It is treated as no order at all, so a
 * damaged record falls back to the template's rather than to a document with
 * sections missing from it.
 */
export function normalizeCandidateOrder(
  value: readonly string[] | null | undefined
): readonly CvSectionKey[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const keys: CvSectionKey[] = [];
  const seen = new Set<CvSectionKey>();
  for (const key of value) {
    if (!isCvSectionKey(key) || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys.length > 0 ? keys : null;
}

/**
 * The sections a candidate may put on their document.
 *
 * The list is the document's own sections, in the template's reading order,
 * so the reorder control offers exactly the sections that are on the paper.
 */
export function cvOrderableSections(
  plan: CvLayoutPlan
): Array<{
  key: CvSectionKey;
  heading: string;
  column: 'main' | 'aside';
  hidden: boolean;
}> {
  const hidden = new Set(plan.hiddenSections);
  const inAside = new Set(plan.aside.map((entry) => entry.section.key));
  const sidebarProposal = new Set(plan.spec.sidebarSections);
  return plan.sections.map((section) => {
    const isHidden = hidden.has(section.key);
    // A hidden section is not in a column, so its column is read from the
    // layout's proposal rather than from the rendered page.
    const column =
      inAside.has(section.key) || (isHidden && sidebarProposal.has(section.key))
        ? 'aside'
        : 'main';
    return { key: section.key, heading: section.heading, column, hidden: isHidden };
  });
}

/**
 * Whether a template has two columns for the layout editor to move between.
 *
 * A split or editorial document reads across two text columns, but a section
 * cannot be lifted from one into the other there: the text flows. Only a
 * template with a real sidebar can hold a section in a column the candidate
 * chose.
 */
export function cvTemplateSupportsSidebar(template: CvTemplateDefinition): boolean {
  return (
    template.structure.layout === 'sidebar-left' ||
    template.structure.layout === 'sidebar-right'
  );
}

/**
 * The order every document falls back to.
 *
 * A template proposes an order; this is the order a document has before a
 * template proposes anything.
 */
export const CV_FALLBACK_SECTION_ORDER = DEFAULT_CV_SECTION_ORDER;
