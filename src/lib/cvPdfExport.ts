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
 * page order. Over each page an invisible text layer carries the document's
 * words, so the file is selectable and searchable, and the links stay clickable.
 *
 * Direct DOM-to-canvas rendering via html2canvas ensures canvases remain untainted
 * so canvas.toBlob() generates valid JPEG buffers without SecurityError.
 * The file format itself is written by `src/lib/pdf/pdfWriter.ts`.
 */

import { buildPdf, PDF_A4_HEIGHT, PDF_A4_WIDTH, type PdfLink, type PdfPage, type PdfText } from './pdf/pdfWriter';
import { paginateCvDocument } from './pdf/paginate';

/** The paper's width at 96dpi, which is A4. */
export const PAPER_WIDTH_PX = 794;
/** The paper's height at 96dpi, which is A4. */
export const PAPER_HEIGHT_PX = 1123;
/** CSS pixels to PDF points (72/96). */
export const PX_TO_PT = 0.75;

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
 * The candidate's own name: a recruiter receives `Ahmed_Ebrahim_CV.pdf`.
 */
export function cvPdfFileName(fullName: string | null | undefined): string {
  const cleaned = (fullName ?? '')
    .replace(/[\u00c0-\u024f]/g, (character) =>
      character.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    )
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleaned || 'CV'}_CV.pdf`;
}

/**
 * Waits for the document's own fonts to be ready before drawing.
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
/* Pagination measurements                                                     */
/* -------------------------------------------------------------------------- */

interface Measurement {
  scale: number;
  left: number;
  top: number;
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
    const lineHeight = rect.height > 0 ? rect.height : 16;
    if (!current || Math.abs(current.top - top) > lineHeight * 0.5) {
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
      current.left = Math.min(current.left, rect.left);
      current.right = Math.max(current.right, rect.right);
      current.top = Math.min(current.top, rect.top);
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

function clampScale(scale: number): number {
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

  // Mount an unscaled clone off-screen at exactly PAPER_WIDTH_PX to prevent
  // preview transforms (e.g. transform: scale(0.69)) from shrinking the canvas
  // or distorting line measurements and pagination offsets.
  const host = document.createElement('div');
  host.setAttribute('data-cv-pdf-host', 'true');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${PAPER_WIDTH_PX}px`;
  host.style.minWidth = `${PAPER_WIDTH_PX}px`;
  host.style.maxWidth = `${PAPER_WIDTH_PX}px`;
  host.style.zIndex = '-9999';
  host.style.opacity = '1';
  host.style.pointerEvents = 'none';
  host.style.transform = 'none';
  host.style.background = '#ffffff';

  const clone = paper.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.width = `${PAPER_WIDTH_PX}px`;
  clone.style.minWidth = `${PAPER_WIDTH_PX}px`;
  clone.style.maxWidth = `${PAPER_WIDTH_PX}px`;
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const measurement = measurePaper(clone);
    const windows = paginateCvDocument({
      contentHeight: measurement.height,
      pageHeight: PAPER_HEIGHT_PX,
      margin: measurement.margin,
      breaks: collectBreaks(clone, measurement),
    });

    const textRuns = collectTextRuns(clone, measurement);
    const links = collectLinks(clone, measurement);

    const scale = clampScale(options.scale ?? 2.5);

    options.onProgress?.('pages');

    // Load html2canvas dynamically to paint the DOM directly without foreignObject
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default ?? html2canvasModule;

    // Render the un-tainted canvas directly from the unscaled clone
    const fullCanvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: PAPER_WIDTH_PX,
    });

    const width = Math.round(PAPER_WIDTH_PX * scale);
    const height = Math.round(PAPER_HEIGHT_PX * scale);
    const pages: PdfPage[] = [];

    for (let index = 0; index < windows.length; index += 1) {
      const window = windows[index];
      const cropHeight = window.end - window.start;

      // Create an A4 page canvas
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.max(1, width);
      pageCanvas.height = Math.max(1, height);
      const context = pageCanvas.getContext('2d');
      if (!context) throw new Error('The browser could not give the PDF export a canvas.');

      // Pure white A4 page background
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      // Slice the window corresponding to this page from fullCanvas
      const sx = 0;
      const sy = Math.round(window.start * scale);
      const sWidth = Math.min(fullCanvas.width, width);
      const sHeight = Math.min(fullCanvas.height - sy, Math.round(cropHeight * scale));

      const dx = 0;
      const dy = Math.round(window.topInset * scale);
      const dWidth = sWidth;
      const dHeight = sHeight;

      if (sHeight > 0 && sWidth > 0) {
        context.drawImage(fullCanvas, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
      }

      const jpeg = await new Promise<Uint8Array>((resolve, reject) => {
        pageCanvas.toBlob(
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
          url: link.url,
        });
      }

      pages.push({
        jpeg,
        pixelWidth: pageCanvas.width,
        pixelHeight: pageCanvas.height,
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
  } finally {
    host.remove();
  }
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
