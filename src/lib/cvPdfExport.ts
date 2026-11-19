/**
 * The PDF export of the CV Studio.
 *
 * A click produces a real `.pdf` file. There is no print dialog, no new tab
 * and no redirect: the browser builds the file here and hands it to the
 * download machinery with the candidate's own name.
 *
 * THE FILE IS THE PAPER.
 *
 * Every page is rasterised from the very element the preview shows — the
 * template, its fonts, its colours, its columns, its Arabic shaping and its
 * page order. A second layout engine is never asked to reproduce the
 * template, because no second engine would agree with the first. Over each
 * page an invisible text layer carries the document's words, so the file is
 * selectable and searchable, and the links in the document stay clickable.
 *
 * The file format itself is written by `src/lib/pdf/pdfWriter.ts`, which is
 * pure and tested without a browser. This file is only the browser part:
 * measuring the paper, choosing page breaks, drawing each page at print
 * resolution and starting the download.
 */

import { buildPdf, PDF_A4_HEIGHT, PDF_A4_WIDTH, type PdfLink, type PdfPage, type PdfText } from './pdf/pdfWriter';
import { paginateCvDocument, type CvPageWindow } from './pdf/paginate';

/** The paper's width at 96dpi, which is A4. */
const PAPER_WIDTH_PX = 794;
/** The paper's height at 96dpi, which is A4. */
const PAPER_HEIGHT_PX = 1123;
/** CSS pixels to PDF points (72/96). */
const PX_TO_PT = 0.75;

/** The families the application loads, so the raster uses the same faces. */
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700' +
  '&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400' +
  '&family=JetBrains+Mono:wght@400;500&display=swap';

export interface CvPdfOptions {
  /** The real paper element: `[data-cv-print]`. */
  paper: HTMLElement;
  /** The document title, written into the file. */
  title: string;
  /** The candidate's name, written into the file and used for the file name. */
  author?: string;
  /** Print resolution, as a multiple of the paper's own size. */
  scale?: number;
  /** Reports the phase, so the button can say what is happening. */
  onProgress?: (phase: 'fonts' | 'pages' | 'writing') => void;
}

export interface CvPdfResult {
  bytes: Uint8Array;
  fileName: string;
  pages: number;
}

/**
 * The name the file is downloaded as.
 *
 * The requirement is the candidate's own name, not the product: a recruiter
 * receives `Ahmed_Ebrahim_CV.pdf`. Characters a file system dislikes become
 * underscores; an empty name falls back to `CV_CV.pdf`, which is still a
 * valid name rather than an empty one.
 */
export function cvPdfFileName(fullName: string | null | undefined): string {
  const cleaned = (fullName ?? '')
    // Only Latin diacritics are folded. A compatibility decomposition would
    // split an Arabic hamza off its alef and lose it from the file name.
    .replace(/[\u00c0-\u024f]/g, (character) =>
      character.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    )
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleaned || 'CV'}_CV.pdf`;
}

/**
 * Waits for the document's own fonts to be ready.
 *
 * The raster is taken from the live paper. If a web font is still swapping
 * in when the snapshot is drawn, the file would show a fallback face that
 * was never on the screen.
 */
async function waitForFonts(): Promise<void> {
  try {
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4000)),
    ]);
  } catch {
    // A browser without the Font Loading API is still allowed to export.
  }
}

/* -------------------------------------------------------------------------- */
/* The fonts of the raster                                                     */
/* -------------------------------------------------------------------------- */

let fontCssPromise: Promise<string> | null = null;

/** Fetches the application's font stylesheet once. */
function rawFontCss(): Promise<string> {
  if (!fontCssPromise) {
    fontCssPromise = fetch(GOOGLE_FONTS_URL, { cache: 'force-cache' })
      .then((response) => (response.ok ? response.text() : ''))
      .catch(() => '');
  }
  return fontCssPromise;
}

/** Converts bytes to base64 without overflowing the argument list. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Whether a font-face block covers any character the document uses. */
function blockCoversText(block: string, used: ReadonlySet<number>): boolean {
  const match = /unicode-range\s*:\s*([^;]+);/i.exec(block);
  if (!match) return true;
  return match[1].split(',').some((entry) => {
    const range = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(entry.trim());
    if (!range) return false;
    if (range[1].includes('?')) return true;
    const start = parseInt(range[1], 16);
    const end = range[2] ? parseInt(range[2], 16) : start;
    for (const codePoint of used) {
      if (codePoint >= start && codePoint <= end) return true;
    }
    return false;
  });
}

/**
 * Builds `@font-face` rules whose sources are data URLs.
 *
 * An SVG drawn as an image cannot reach a stylesheet or a font file on the
 * network: it is an isolated document. The only way the raster can use the
 * template's real typeface is to carry the face inside it, so every font the
 * document actually uses is fetched once and inlined.
 */
async function inlineFontCss(text: string): Promise<string> {
  const css = await rawFontCss();
  if (!css) return '';
  const used = new Set<number>();
  for (const character of text) used.add(character.codePointAt(0) ?? 0);

  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const kept = blocks.filter((block) => blockCoversText(block, used));
  if (kept.length === 0) return '';

  const cache = new Map<string, string>();
  const inlined = await Promise.all(
    kept.map(async (block) => {
      const urls = [...block.matchAll(/url\((https:[^)]+)\)/g)].map((match) => match[1]);
      if (urls.length === 0) return block;
      let resolved = block;
      for (const url of urls) {
        let data = cache.get(url);
        if (!data) {
          try {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`font ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            data = `data:font/woff2;base64,${toBase64(bytes)}`;
            cache.set(url, data);
          } catch {
            data = '';
          }
        }
        if (data) resolved = resolved.split(url).join(data);
      }
      return resolved;
    })
  );
  return inlined.join('\n');
}

/* -------------------------------------------------------------------------- */
/* The computed paper                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The properties copied onto the clone.
 *
 * The preview draws with inline styles, but inherited values (a heading's
 * colour, a bullet's font) and the browser's own layout (a grid's resolved
 * tracks) live only in the computed style. Copying them makes the raster
 * independent of the application's stylesheets, which an SVG image cannot
 * see.
 */
const STYLE_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'box-sizing',
  'overflow',
  'overflow-x',
  'overflow-y',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-feature-settings',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-indent',
  'white-space',
  'word-break',
  'overflow-wrap',
  'vertical-align',
  'direction',
  'unicode-bidi',
  'list-style-type',
  'list-style-position',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-content',
  'align-self',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'grid-column',
  'grid-row',
  'column-count',
  'column-gap',
  'column-rule',
  'break-inside',
  'break-after',
  'opacity',
  'z-index',
  'border-collapse',
  'border-spacing',
] as const;

/** Copies the computed style of every element of the paper onto a clone. */
function cloneWithComputedStyles(source: Element, clone: Element, depth = 0): void {
  if (depth > 80) return;
  const computed = window.getComputedStyle(source);
  const declarations: string[] = [];
  for (const property of STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
      declarations.push(`${property}:${value}`);
    } else if (property === 'display' || property === 'position') {
      declarations.push(`${property}:${value}`);
    }
  }
  if (!(source instanceof HTMLElement) || !(clone instanceof HTMLElement)) {
    // An SVG child is the only non-HTML element a CV could carry; its
    // presentation attributes are already serialised with it.
    return;
  }
  clone.style.cssText = declarations.join(';');
  const sourceChildren = [...source.children];
  const cloneChildren = [...clone.children];
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const child = cloneChildren[index];
    if (child) cloneWithComputedStyles(sourceChildren[index], child, depth + 1);
  }
}

/* -------------------------------------------------------------------------- */
/* Pagination measurements                                                     */
/* -------------------------------------------------------------------------- */

interface Measurement {
  /** The ratio between the on-screen paper and its layout size. */
  scale: number;
  /** The paper's top-left corner on the screen. */
  left: number;
  top: number;
  /** The height of the paper in its own (unscaled) pixels. */
  height: number;
  margin: number;
}

function measurePaper(paper: HTMLElement): Measurement {
  const rect = paper.getBoundingClientRect();
  const scale = paper.offsetWidth > 0 ? rect.width / paper.offsetWidth : 1;
  const computed = window.getComputedStyle(paper);
  const padding = Number.parseFloat(computed.paddingTop) || 0;
  return {
    scale: scale > 0 ? scale : 1,
    left: rect.left,
    top: rect.top,
    height: paper.offsetHeight || PAPER_HEIGHT_PX,
    margin: padding >= 0 ? padding : 34,
  };
}

/** The bottoms of the elements a page may be cut at. */
function collectBreaks(paper: HTMLElement, measurement: Measurement): number[] {
  const breaks: number[] = [];
  paper.querySelectorAll<HTMLElement>('[data-cv-block]').forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.height) return;
    const bottom = (rect.bottom - measurement.top) / measurement.scale;
    if (bottom > 1 && bottom < measurement.height) breaks.push(bottom);
  });
  return breaks;
}

/* -------------------------------------------------------------------------- */
/* The text layer and the links                                                */
/* -------------------------------------------------------------------------- */

interface AbsoluteRun {
  text: string;
  x: number;
  top: number;
  width: number;
  size: number;
}

function rectToRun(
  text: string,
  rect: DOMRect,
  measurement: Measurement
): AbsoluteRun | null {
  if (!rect.height || !rect.width || !text.trim()) return null;
  return {
    text,
    x: (rect.left - measurement.left) / measurement.scale,
    top: (rect.top - measurement.top) / measurement.scale,
    width: rect.width / measurement.scale,
    size: rect.height / measurement.scale,
  };
}

/**
 * Reads the text of the paper, line by line.
 *
 * A Range around a whole text node is enough for a node that fits on one
 * line. A wrapped paragraph returns several rectangles with no text attached
 * to them, so it is walked one character at a time and grouped by the line
 * it landed on. A CV is a few thousand characters; the walk costs a frame,
 * not a second.
 */
function collectTextRuns(paper: HTMLElement, measurement: Measurement): AbsoluteRun[] {
  const runs: AbsoluteRun[] = [];
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent ?? '';
    if (text.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0
      );
      if (rects.length <= 1) {
        const run = rectToRun(text, rects[0] ?? range.getBoundingClientRect(), measurement);
        if (run) runs.push(run);
      } else {
        runs.push(...splitNodeByLine(node, text, measurement));
      }
    }
    node = walker.nextNode();
  }
  return runs;
}

function splitNodeByLine(
  node: Node,
  text: string,
  measurement: Measurement
): AbsoluteRun[] {
  const lines: Array<{
    text: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }> = [];
  let current: (typeof lines)[number] | null = null;
  let pendingSpace = '';

  const range = document.createRange();
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      if (/\s/.test(character)) pendingSpace = ' ';
      continue;
    }
    const top = rect.top;
    if (!current || Math.abs(current.top - top) > 1) {
      current = {
        text: pendingSpace,
        left: rect.left,
        right: rect.right,
        top,
        bottom: rect.bottom,
      };
      lines.push(current);
      pendingSpace = '';
    } else {
      current.right = Math.max(current.right, rect.right);
      current.bottom = Math.max(current.bottom, rect.bottom);
    }
    current.text += character;
  }

  return lines
    .map((line) =>
      rectToRun(
        line.text.trim(),
        {
          left: line.left,
          right: line.right,
          top: line.top,
          bottom: line.bottom,
          width: line.right - line.left,
          height: line.bottom - line.top,
          x: line.left,
          y: line.top,
          toJSON: () => ({}),
        } as DOMRect,
        measurement
      )
    )
    .filter((run): run is AbsoluteRun => run !== null);
}

function collectLinks(paper: HTMLElement, measurement: Measurement): PdfLink[] {
  const links: PdfLink[] = [];
  paper.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const url = anchor.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:)/i.test(url)) return;
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const rects = [...range.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    for (const rect of rects) {
      links.push({
        x: (rect.left - measurement.left) / measurement.scale,
        top: (rect.top - measurement.top) / measurement.scale,
        width: rect.width / measurement.scale,
        height: rect.height / measurement.scale,
        url,
      });
    }
  });
  return links;
}

/* -------------------------------------------------------------------------- */
/* The raster                                                                  */
/* -------------------------------------------------------------------------- */

interface PageImage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}

function paperMarkup(
  paperHtml: string,
  fontCss: string,
  window: CvPageWindow
): string {
  // An SVG image is an isolated document: it has no stylesheets, no fonts
  // and no page. Everything it needs is inside it.
  const container = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  container.setAttribute(
    'style',
    `width:${PAPER_WIDTH_PX}px;height:${Math.ceil(
      window.end - window.start
    )}px;overflow:hidden;position:relative;background:#ffffff;`
  );

  if (fontCss) {
    const style = document.createElement('style');
    style.textContent = fontCss;
    container.appendChild(style);
  }

  const shifter = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  shifter.setAttribute(
    'style',
    `position:absolute;left:0;top:${-window.start}px;width:${PAPER_WIDTH_PX}px;`
  );
  const paperHolder = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  paperHolder.innerHTML = paperHtml;
  const paper = paperHolder.firstElementChild;
  if (paper) shifter.appendChild(paper);
  container.appendChild(shifter);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(PAPER_WIDTH_PX));
  svg.setAttribute('height', String(Math.ceil(window.end - window.start)));
  svg.setAttribute('viewBox', `0 0 ${PAPER_WIDTH_PX} ${Math.ceil(window.end - window.start)}`);
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');
  foreignObject.appendChild(container);
  svg.appendChild(foreignObject);

  return new XMLSerializer().serializeToString(svg);
}

async function rasterisePage(
  markup: string,
  scale: number,
  topInset: number,
  cropHeight: number
): Promise<PageImage> {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'sync';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('The CV could not be drawn for the PDF export.'));
      image.src = url;
    });

    const width = Math.round(PAPER_WIDTH_PX * scale);
    const height = Math.round(PAPER_HEIGHT_PX * scale);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not give the PDF export a canvas.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      0,
      Math.round(topInset * scale),
      width,
      Math.round(cropHeight * scale)
    );

    const jpeg = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('The browser could not encode a page of the PDF.'));
            return;
          }
          void result.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
        },
        'image/jpeg',
        0.92
      );
    });

    return { jpeg, pixelWidth: canvas.width, pixelHeight: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clampScale(scale: number): number {
  // A canvas has a maximum dimension and a maximum area. 2.5× A4 is about
  // 2,000 × 2,800 pixels; the cap protects a small device from a larger
  // request without ever dropping below the paper's own resolution.
  const maxByDimension = Math.min(12000 / PAPER_WIDTH_PX, 12000 / PAPER_HEIGHT_PX);
  const maxByArea = Math.sqrt(40_000_000 / (PAPER_WIDTH_PX * PAPER_HEIGHT_PX));
  return Math.max(1, Math.min(scale, maxByDimension, maxByArea));
}

/* -------------------------------------------------------------------------- */
/* The export                                                                  */
/* -------------------------------------------------------------------------- */

/** Paginates, rasterises and writes the PDF of the paper. */
export async function generateCvPdf(options: CvPdfOptions): Promise<CvPdfResult> {
  if (typeof document === 'undefined') {
    throw new Error('The PDF export needs a browser.');
  }
  const paper = options.paper;
  if (!paper || !paper.isConnected) {
    throw new Error('Open the document editor to export the CV.');
  }

  options.onProgress?.('fonts');
  await waitForFonts();

  const measurement = measurePaper(paper);
  const windows = paginateCvDocument({
    contentHeight: measurement.height,
    pageHeight: PAPER_HEIGHT_PX,
    margin: measurement.margin,
    breaks: collectBreaks(paper, measurement),
  });

  const textRuns = collectTextRuns(paper, measurement);
  const links = collectLinks(paper, measurement);
  const fontCss = await inlineFontCss(paper.textContent ?? '');

  const clone = paper.cloneNode(true) as HTMLElement;
  cloneWithComputedStyles(paper, clone);
  const paperHtml = clone.outerHTML;

  const scale = clampScale(options.scale ?? 2.5);
  const pages: PdfPage[] = [];

  for (let index = 0; index < windows.length; index += 1) {
    options.onProgress?.('pages');
    const window = windows[index];
    const markup = paperMarkup(paperHtml, fontCss, window);
    const raster = await rasterisePage(
      markup,
      scale,
      window.topInset,
      window.end - window.start
    );

    const text: PdfText[] = [];
    for (const run of textRuns) {
      if (run.top < window.start - 0.5 || run.top >= window.end - 0.5) continue;
      text.push({
        text: run.text,
        x: run.x * PX_TO_PT,
        top: (run.top - window.start + window.topInset) * PX_TO_PT,
        width: run.width * PX_TO_PT,
        size: run.size * PX_TO_PT,
      });
    }

    const pageLinks: PdfLink[] = [];
    for (const link of links) {
      if (link.top < window.start - 0.5 || link.top >= window.end - 0.5) continue;
      pageLinks.push({
        ...link,
        x: link.x * PX_TO_PT,
        top: (link.top - window.start + window.topInset) * PX_TO_PT,
        width: link.width * PX_TO_PT,
        height: link.height * PX_TO_PT,
      });
    }

    pages.push({
      jpeg: raster.jpeg,
      pixelWidth: raster.pixelWidth,
      pixelHeight: raster.pixelHeight,
      width: PDF_A4_WIDTH,
      height: PDF_A4_HEIGHT,
      text,
      links: pageLinks,
    });
  }

  options.onProgress?.('writing');
  const bytes = buildPdf(pages, {
    title: options.title,
    author: options.author,
    subject: 'Curriculum Vitae',
  });

  return {
    bytes,
    fileName: cvPdfFileName(options.author),
    pages: pages.length,
  };
}

/** Hands a PDF to the browser's download machinery. */
export function savePdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately cancels the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Generates the PDF from the live paper and downloads it. */
export async function downloadCvPdf(options: CvPdfOptions): Promise<CvPdfResult> {
  const result = await generateCvPdf(options);
  savePdf(result.bytes, result.fileName);
  return result;
}
