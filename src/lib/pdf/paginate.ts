/**
 * Pagination of the CV paper.
 *
 * The preview draws one long sheet of A4 width. The PDF needs real pages, so
 * the sheet is cut where the document itself already breaks: at the bottom of
 * a section, an entry or a bullet. A cut inside a line of text is the last
 * resort, because a CV whose sentence is split across two pages reads worse
 * than one whose page ends a little early.
 *
 * The function is pure. It is given the measurements of the paper and the
 * candidate break positions, and it returns the windows to rasterise, so the
 * rules can be tested without a browser.
 */

/** One page: the source window and where it is placed on the page. */
export interface CvPageWindow {
  /** The top of the source window, in paper CSS pixels. */
  start: number;
  /** The bottom of the source window, in paper CSS pixels. */
  end: number;
  /** The distance from the page's top to the top of the source window. */
  topInset: number;
}

export interface CvPaginationInput {
  /** The full height of the paper, in CSS pixels. */
  contentHeight: number;
  /** One sheet, in CSS pixels (1123 at 96dpi). */
  pageHeight: number;
  /** The paper's own margin, in CSS pixels. */
  margin: number;
  /** Candidate cut positions, in CSS pixels from the paper's top. */
  breaks?: readonly number[];
}

/**
 * Cuts the paper into pages.
 *
 * The first page keeps the paper's own top margin. Later pages reserve the
 * same margin at the top and the bottom, so a document starts and ends on a
 * page the way a printed document does rather than running into the edge.
 */
export function paginateCvDocument(input: CvPaginationInput): CvPageWindow[] {
  // A measurement of zero is a damaged measurement, not a zero-height page:
  // falling back to A4 keeps a broken layout from producing a hundred slivers.
  const pageHeight =
    Number.isFinite(input.pageHeight) && input.pageHeight >= 200 ? input.pageHeight : 1123;
  const margin = Math.max(0, Math.min(input.margin, pageHeight / 4));
  const contentHeight = Math.max(1, input.contentHeight);

  // The paper reserves A4 as a minimum height. A document that fits on one
  // sheet is one page, even when its own padding brings it exactly to A4.
  if (contentHeight <= pageHeight) {
    return [{ start: 0, end: contentHeight, topInset: 0 }];
  }

  const breaks = [...new Set((input.breaks ?? []).map((value) => Math.round(value * 100) / 100))]
    .filter((value) => Number.isFinite(value) && value > 1 && value < contentHeight)
    .sort((a, b) => a - b);

  const windows: CvPageWindow[] = [];
  let start = 0;
  let topInset = 0;

  for (let page = 0; page < 64; page += 1) {
    if (start >= contentHeight - 1) break;
    const bottomInset = margin;
    const limit = Math.min(contentHeight, start + (pageHeight - topInset - bottomInset));
    if (limit <= start) break;

    let end = contentHeight <= limit ? contentHeight : limit;
    if (end < contentHeight) {
      // Prefer a break that ends an element. The page may be shortened, but
      // never to less than roughly a third of its height: a section with many
      // long entries would otherwise be split into one-line pages.
      const minimumFill = start + (limit - start) * 0.35;
      let best = -1;
      for (const position of breaks) {
        if (position <= start) continue;
        if (position > limit) break;
        if (position >= minimumFill) best = position;
      }
      if (best > start) end = best;
    }

    if (end <= start) {
      // A malformed measurement must not produce an empty page for ever.
      end = Math.min(contentHeight, start + pageHeight);
    }

    windows.push({ start, end, topInset });
    start = end;
    topInset = margin;
  }

  if (windows.length === 0) {
    return [{ start: 0, end: contentHeight, topInset: 0 }];
  }
  return windows;
}
