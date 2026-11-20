/**
 * The bidirectional algorithm, reduced to what a document needs.
 * ---------------------------------------------------------------------------
 * A PDF has no notion of direction. Its content stream holds glyphs in the
 * order they are painted, and a reader paints them from left to right. So the
 * order of the words on the page is decided HERE, before a single byte of the
 * PDF is written.
 *
 * This is the Unicode Bidirectional Algorithm (UAX #9), rules W1–W7, N1–N2,
 * I1–I2, L1 and L2, with the following two documented omissions:
 *
 *   * Explicit embedding and override controls (LRE, RLE, LRO, RLO, PDF) and
 *     the isolate controls (LRI, RLI, FSI, PDI) are treated as neutral. A CV
 *     does not contain them; a document that did would still render, but the
 *     embedding would not be honoured.
 *   * Rule N0 (paired brackets) is not implemented, so a bracket is resolved
 *     as an ordinary neutral. The difference is visible only in text that
 *     mixes brackets with Arabic inside one line, such as
 *     `(مهندس برمجيات)` — and even there the brackets stay in the right place.
 *
 * What IS implemented is the part that matters for this product: a line that
 * mixes English and Arabic — a job title in Arabic with an English employer,
 * a sentence with a number in it — is laid out in the order a reader expects.
 */

/** The bidi classes this implementation understands. */
export type BidiClass =
  | 'L'
  | 'R'
  | 'AL'
  | 'EN'
  | 'AN'
  | 'ES'
  | 'CS'
  | 'ET'
  | 'ON'
  | 'WS'
  | 'B'
  | 'S'
  | 'NSM'
  | 'BN';

/** One piece of a line, in the order it is painted. */
export interface BidiRun {
  /** The characters of the run, in VISUAL order. */
  text: string;
  /** True when the run reads from right to left. */
  rtl: boolean;
  /** The embedding level of the run. Odd levels are right to left. */
  level: number;
  /**
   * The characters of the run in LOGICAL order.
   *
   * A right-to-left run is stored visually, so its logical order is the
   * reverse. Shaping needs the logical order — the Arabic joining forms
   * depend on the neighbour on each side — and painting needs the visual one.
   */
  logical: string;
}

/* -------------------------------------------------------------------------- */
/* The character classes                                                        */
/* -------------------------------------------------------------------------- */

/** A range of code points that share one class. */
interface ClassRange {
  from: number;
  to: number;
  klass: BidiClass;
}

/**
 * The ranges that carry a class of their own.
 *
 * The list is ordered, and the first range that contains a code point wins.
 * Everything not listed is classified by the fallback below, which treats
 * letters as left-to-right and punctuation as neutral.
 */
const CLASS_RANGES: ClassRange[] = [
  // --- Explicit and formatting characters ---------------------------------
  { from: 0x0009, to: 0x0009, klass: 'S' },
  { from: 0x000a, to: 0x000a, klass: 'B' },
  { from: 0x000b, to: 0x000b, klass: 'S' },
  { from: 0x000c, to: 0x000c, klass: 'WS' },
  { from: 0x000d, to: 0x000d, klass: 'B' },
  { from: 0x001c, to: 0x001e, klass: 'B' },
  { from: 0x001f, to: 0x001f, klass: 'S' },
  { from: 0x007f, to: 0x0084, klass: 'BN' },
  { from: 0x0085, to: 0x0085, klass: 'B' },

  // --- Whitespace ---------------------------------------------------------
  { from: 0x0020, to: 0x0020, klass: 'WS' },
  { from: 0x00a0, to: 0x00a0, klass: 'CS' },
  { from: 0x1680, to: 0x1680, klass: 'WS' },
  { from: 0x2000, to: 0x200a, klass: 'WS' },
  { from: 0x2028, to: 0x2028, klass: 'WS' },
  { from: 0x2029, to: 0x2029, klass: 'B' },
  { from: 0x202f, to: 0x202f, klass: 'CS' },
  { from: 0x205f, to: 0x205f, klass: 'WS' },
  { from: 0x3000, to: 0x3000, klass: 'WS' },

  // --- European numbers ----------------------------------------------------
  { from: 0x0030, to: 0x0039, klass: 'EN' },
  { from: 0x00b2, to: 0x00b3, klass: 'EN' },
  { from: 0x00b9, to: 0x00b9, klass: 'EN' },
  { from: 0x06f0, to: 0x06f9, klass: 'EN' },
  { from: 0x2070, to: 0x2070, klass: 'EN' },
  { from: 0x2074, to: 0x2079, klass: 'EN' },
  { from: 0x2080, to: 0x2089, klass: 'EN' },
  { from: 0xff10, to: 0xff19, klass: 'EN' },

  // --- Arabic-Indic numbers ------------------------------------------------
  { from: 0x0660, to: 0x0669, klass: 'AN' },
  { from: 0x066b, to: 0x066c, klass: 'AN' },
  { from: 0x06dd, to: 0x06dd, klass: 'AN' },
  { from: 0x08e2, to: 0x08e2, klass: 'AN' },
  { from: 0x10e60, to: 0x10e7e, klass: 'AN' },
  { from: 0xfd50, to: 0xfd59, klass: 'AN' },

  // --- Separators and terminators -----------------------------------------
  { from: 0x002b, to: 0x002b, klass: 'ES' },
  { from: 0x002d, to: 0x002d, klass: 'ES' },
  { from: 0x002c, to: 0x002c, klass: 'CS' },
  { from: 0x002e, to: 0x002f, klass: 'CS' },
  { from: 0x003a, to: 0x003a, klass: 'CS' },
  { from: 0x060c, to: 0x060c, klass: 'CS' },
  { from: 0x2044, to: 0x2044, klass: 'CS' },
  { from: 0x2212, to: 0x2212, klass: 'ES' },
  { from: 0x207a, to: 0x207b, klass: 'ES' },
  { from: 0x208a, to: 0x208b, klass: 'ES' },
  { from: 0x0023, to: 0x0025, klass: 'ET' },
  { from: 0x00a2, to: 0x00a5, klass: 'ET' },
  { from: 0x00b0, to: 0x00b1, klass: 'ET' },
  { from: 0x066a, to: 0x066a, klass: 'ET' },
  { from: 0x09f2, to: 0x09f3, klass: 'ET' },
  { from: 0x20a0, to: 0x20cf, klass: 'ET' },
  { from: 0xfe5f, to: 0xfe5f, klass: 'ET' },
  { from: 0xff03, to: 0xff05, klass: 'ET' },
  { from: 0xffe0, to: 0xffe6, klass: 'ET' },

  // --- Nonspacing marks ----------------------------------------------------
  { from: 0x0300, to: 0x036f, klass: 'NSM' },
  { from: 0x0483, to: 0x0489, klass: 'NSM' },
  { from: 0x0591, to: 0x05bd, klass: 'NSM' },
  { from: 0x05bf, to: 0x05bf, klass: 'NSM' },
  { from: 0x05c1, to: 0x05c2, klass: 'NSM' },
  { from: 0x05c4, to: 0x05c5, klass: 'NSM' },
  { from: 0x05c7, to: 0x05c7, klass: 'NSM' },
  { from: 0x0610, to: 0x061a, klass: 'NSM' },
  { from: 0x064b, to: 0x065f, klass: 'NSM' },
  { from: 0x0670, to: 0x0670, klass: 'NSM' },
  { from: 0x06d6, to: 0x06dc, klass: 'NSM' },
  { from: 0x06df, to: 0x06e4, klass: 'NSM' },
  { from: 0x06e7, to: 0x06e8, klass: 'NSM' },
  { from: 0x06ea, to: 0x06ed, klass: 'NSM' },
  { from: 0x20d0, to: 0x20f0, klass: 'NSM' },
  { from: 0xfe00, to: 0xfe0f, klass: 'NSM' },
  { from: 0xfe20, to: 0xfe2f, klass: 'NSM' },

  // --- Right-to-left scripts ------------------------------------------------
  { from: 0x0590, to: 0x05ff, klass: 'R' },
  { from: 0x07c0, to: 0x085f, klass: 'R' },
  { from: 0x200f, to: 0x200f, klass: 'R' },
  { from: 0xfb1d, to: 0xfb4f, klass: 'R' },
  { from: 0x10800, to: 0x10fff, klass: 'R' },
  { from: 0x1e800, to: 0x1efff, klass: 'R' },

  // --- Arabic (strong right-to-left) ---------------------------------------
  { from: 0x0608, to: 0x0608, klass: 'AL' },
  { from: 0x060b, to: 0x060b, klass: 'AL' },
  { from: 0x060d, to: 0x060d, klass: 'AL' },
  { from: 0x061b, to: 0x064a, klass: 'AL' },
  { from: 0x066d, to: 0x066f, klass: 'AL' },
  { from: 0x0671, to: 0x06d5, klass: 'AL' },
  { from: 0x06e5, to: 0x06e6, klass: 'AL' },
  { from: 0x06ee, to: 0x06ef, klass: 'AL' },
  { from: 0x06fa, to: 0x070d, klass: 'AL' },
  { from: 0x0710, to: 0x072f, klass: 'AL' },
  { from: 0x074d, to: 0x07a5, klass: 'AL' },
  { from: 0x07b1, to: 0x07b1, klass: 'AL' },
  { from: 0x0860, to: 0x08e1, klass: 'AL' },
  { from: 0xfb50, to: 0xfdff, klass: 'AL' },
  { from: 0xfe70, to: 0xfeff, klass: 'AL' },
];

/** Characters that are strong left-to-right. */
const LEFT_TO_RIGHT_RANGES: Array<[number, number]> = [
  [0x0041, 0x005a],
  [0x0061, 0x007a],
  [0x00aa, 0x00aa],
  [0x00b5, 0x00b5],
  [0x00ba, 0x00ba],
  [0x00c0, 0x02b8],
  [0x02e0, 0x02e4],
  [0x0370, 0x0589],
  [0x0900, 0x1fff],
  [0x2c60, 0x2dff],
  [0x2e80, 0x2fdf],
  [0x3005, 0x3006],
  [0x3041, 0xd7ff],
  [0xf900, 0xfb06],
  [0xff21, 0xff3a],
  [0xff41, 0xff5a],
  [0xff66, 0xffdc],
  [0x10000, 0x10fffd],
];

function inRanges(codePoint: number, ranges: Array<[number, number]>): boolean {
  for (const [from, to] of ranges) {
    if (codePoint >= from && codePoint <= to) return true;
  }
  return false;
}

/**
 * The bidi class of one code point.
 *
 * A code point that is not in any range and is not a known letter is neutral:
 * punctuation, symbols and marks that the standard does not name. A letter
 * that is not in any range is left-to-right, which is right for every script
 * this product supports apart from the right-to-left ones, all of which are
 * listed above.
 */
export function bidiClass(codePoint: number): BidiClass {
  for (const range of CLASS_RANGES) {
    if (codePoint >= range.from && codePoint <= range.to) return range.klass;
  }
  if (inRanges(codePoint, LEFT_TO_RIGHT_RANGES)) return 'L';
  return 'ON';
}

/* -------------------------------------------------------------------------- */
/* The algorithm                                                                */
/* -------------------------------------------------------------------------- */

/** The types that count as a strong direction. */
function isStrong(type: BidiClass): boolean {
  return type === 'L' || type === 'R' || type === 'AL';
}

/** The types that count as a neutral for rules N1 and N2. */
function isNeutral(type: BidiClass): boolean {
  return type === 'B' || type === 'S' || type === 'WS' || type === 'ON';
}

/** The last strong type before an index, or null when there is none. */
function lastStrong(types: BidiClass[], before: number): BidiClass | null {
  for (let index = before; index >= 0; index -= 1) {
    if (isStrong(types[index])) return types[index];
  }
  return null;
}

/**
 * The embedding levels of a line, and the characters in visual order.
 *
 * `baseRtl` is the direction of the paragraph. The returned runs are in the
 * order they are painted: left to right across the page.
 */
export function bidiRuns(text: string, baseRtl: boolean): BidiRun[] {
  if (!text) return [];

  const characters = [...text];
  const types = characters.map((character) => bidiClass(character.codePointAt(0) ?? 0));
  const baseLevel = baseRtl ? 1 : 0;

  /* --- W1: a nonspacing mark takes the type of the character before it --- */
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] !== 'NSM') continue;
    types[index] = index === 0 ? (baseRtl ? 'R' : 'L') : types[index - 1];
  }

  /* --- W2: a European number after an Arabic letter becomes Arabic ------ */
  //
  // When there is no strong character before the number, the direction of the
  // paragraph stands in for it — the standard calls this the start-of-
  // sequence type.
  const startType: BidiClass = baseRtl ? 'R' : 'L';
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] !== 'EN') continue;
    const strong = lastStrong(types, index - 1) ?? startType;
    if (strong === 'AL') types[index] = 'AN';
  }

  /* --- W3: an Arabic letter is a strong right-to-left letter ------------- */
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === 'AL') types[index] = 'R';
  }

  /* --- W4: a single separator between two numbers takes their type ------- */
  for (let index = 1; index < types.length - 1; index += 1) {
    const type = types[index];
    if (type !== 'ES' && type !== 'CS') continue;
    const before = types[index - 1];
    const after = types[index + 1];
    if (before === 'EN' && after === 'EN') {
      types[index] = 'EN';
    } else if (type === 'CS' && before === 'AN' && after === 'AN') {
      types[index] = 'AN';
    }
  }

  /* --- W5: a sequence of terminators next to a European number ---------- */
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] !== 'ET') continue;
    let end = index;
    while (end < types.length && types[end] === 'ET') end += 1;
    const before = index > 0 ? types[index - 1] : null;
    const after = end < types.length ? types[end] : null;
    if (before === 'EN' || after === 'EN') {
      for (let inner = index; inner < end; inner += 1) types[inner] = 'EN';
    }
    index = end - 1;
  }

  /* --- W6: any separator left over is neutral --------------------------- */
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === 'ET' || types[index] === 'ES' || types[index] === 'CS') {
      types[index] = 'ON';
    }
  }

  /* --- W7: a European number after a left-to-right letter is left-to-right */
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] !== 'EN') continue;
    const strong = lastStrong(types, index - 1) ?? startType;
    if (strong === 'L') types[index] = 'L';
  }

  /* --- N1 and N2: neutrals take the direction around them --------------- */
  let index = 0;
  while (index < types.length) {
    if (!isNeutral(types[index])) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < types.length && isNeutral(types[end])) end += 1;
    const before = index > 0 ? types[index - 1] : null;
    const after = end < types.length ? types[end] : null;
    const beforeStrong = before && isStrong(before) ? before : null;
    const afterStrong = after && isStrong(after) ? after : null;
    const resolved =
      beforeStrong && afterStrong && beforeStrong === afterStrong
        ? beforeStrong
        : baseRtl
          ? 'R'
          : 'L';
    for (let inner = index; inner < end; inner += 1) types[inner] = resolved;
    index = end;
  }

  /* --- I1 and I2: the embedding levels ---------------------------------- */
  //
  // The rules are the ones the standard gives (UAX #9, section 3.3.6):
  //
  //   * In an even (left-to-right) context, a character of type R goes up one
  //     level, and a character of type AN or EN goes up two.
  //   * In an odd (right-to-left) context, a character of type L, EN or AN
  //     goes up one level.
  //
  // THE LEVEL IS THE PARAGRAPH'S, NOT A RUNNING ONE
  // The rules are applied to every character against the level the paragraph
  // gave it, not against the level of the character before it. That is what
  // keeps a number together: the digits of "2023" in an Arabic paragraph all
  // sit at level 2, so the number is read from left to right as one number,
  // and the reorder step leaves its digits in the order they were written.
  // A running level would raise each digit one level higher than the last,
  // and the number would come out reversed.
  const levels: number[] = types.map((type) => {
    if (baseLevel % 2 === 0) {
      if (type === 'R') return baseLevel + 1;
      if (type === 'AN' || type === 'EN') return baseLevel + 2;
      return baseLevel;
    }
    if (type === 'L' || type === 'AN' || type === 'EN') return baseLevel + 1;
    return baseLevel;
  });

  /* --- L1: trailing whitespace and separators go back to the base level -- */
  for (let position = types.length - 1; position >= 0; position -= 1) {
    const type = types[position];
    if (type === 'S' || type === 'B') {
      levels[position] = baseLevel;
      continue;
    }
    if (type === 'WS' || type === 'BN') {
      levels[position] = baseLevel;
      continue;
    }
    break;
  }
  for (let position = 0; position < types.length; position += 1) {
    if (types[position] !== 'WS' && types[position] !== 'BN') continue;
    // Whitespace before a separator is reset too.
    let next = position + 1;
    while (next < types.length && (types[next] === 'WS' || types[next] === 'BN')) next += 1;
    if (next < types.length && (types[next] === 'S' || types[next] === 'B')) {
      levels[position] = baseLevel;
    }
  }

  /* --- L2: reverse the runs, from the highest level down ----------------- */
  const order = characters.map((_, position) => position);
  let highest = 0;
  // The lowest ODD level that actually occurs. A line with no odd level is
  // a line that reads left to right throughout, and the rule reverses
  // nothing: reversing it would turn the line back to front.
  let lowestOdd = Number.POSITIVE_INFINITY;
  for (const value of levels) {
    if (value > highest) highest = value;
    if (value % 2 === 1 && value < lowestOdd) lowestOdd = value;
  }
  for (let current = highest; Number.isFinite(lowestOdd) && current >= lowestOdd; current -= 1) {
    let position = 0;
    while (position < order.length) {
      if (levels[order[position]] < current) {
        position += 1;
        continue;
      }
      let end = position;
      while (end < order.length && levels[order[end]] >= current) end += 1;
      const slice = order.slice(position, end).reverse();
      for (let offset = 0; offset < slice.length; offset += 1) order[position + offset] = slice[offset];
      position = end;
    }
  }

  /* --- The runs, in the order they are painted ---------------------------- */
  const runs: BidiRun[] = [];
  let start = 0;
  while (start < order.length) {
    const runLevel = levels[order[start]];
    let end = start + 1;
    while (end < order.length && levels[order[end]] === runLevel) end += 1;

    const visual = order.slice(start, end).map((position) => characters[position]);
    const visualText = visual.join('');
    const rtl = runLevel % 2 === 1;

    runs.push({
      text: visualText,
      rtl,
      level: runLevel,
      // A right-to-left run was reversed by L2, so its logical order is the
      // reverse of its visual order. Shaping needs the logical order.
      logical: rtl ? [...visualText].reverse().join('') : visualText,
    });

    start = end;
  }

  return runs;
}

/**
 * The code point ranges that make up the Arabic script.
 *
 * They include the Arabic‑Indic digits (٠١٢٣) and the percent sign (٪), which
 * are written from right to left as part of an Arabic sentence even though
 * the bidirectional algorithm gives them a left-to-right level of their own:
 * a number reads left to right in every script.
 */
const ARABIC_SCRIPT_RANGES: Array<[number, number]> = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
  [0x1ee00, 0x1eeff],
];

/**
 * Whether a piece of text is written in the Arabic script.
 *
 * WHY THIS IS NOT THE SAME AS "READS RIGHT TO LEFT"
 * A number inside an Arabic sentence — ٢٠٢٣ — is laid out left to right by the
 * bidirectional algorithm, because a number is read the same way in every
 * language. It is still Arabic script, and it still has to be drawn with the
 * Arabic face: the Latin face of the template has no glyph for it at all, and
 * the result would be a row of empty boxes.
 *
 * So the direction decides WHERE a run goes, and the script decides WHICH
 * FACE draws it. The two are separate questions, and the renderer asks both.
 */
export function containsArabicScript(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    for (const [from, to] of ARABIC_SCRIPT_RANGES) {
      if (codePoint >= from && codePoint <= to) return true;
    }
  }
  return false;
}

/**
 * Whether a line holds any right-to-left character.
 *
 * The renderer uses it to decide whether a line is measured and drawn in a
 * right-to-left frame at all.
 */
export function hasRightToLeft(text: string): boolean {
  for (const character of text) {
    const type = bidiClass(character.codePointAt(0) ?? 0);
    if (type === 'R' || type === 'AL') return true;
  }
  return false;
}
