/**
 * The PDF export of the CV Studio.
 * ---------------------------------------------------------------------------
 * A click produces a real `.pdf` file. There is no print dialog, no new tab
 * and no redirect: the browser builds the file here and hands it to the
 * download machinery with the candidate's own name.
 *
 * THE FILE IS THE PAPER.
 *
 * The file is written with PDF's own objects: text objects that hold glyphs,
 * vector paths that hold the rules, the bands and the chips, and link
 * annotations that hold the destinations. The words in the file are the words
 * of the CV — selectable, searchable, copyable — and the page is drawn with
 * the template's own typography, colours and columns. There is no picture of
 * the document in it.
 *
 * THE PAPER AND THE FILE ARE THE SAME DOCUMENT.
 *
 * Both are drawn from one layout plan (`shared/cvLayout.ts`), which is the
 * same plan the DOCX export writes. A template that changes its accent
 * colour, its density or its bullet glyph changes the preview, the PDF and
 * the Word file together, because there is only one decision to change.
 *
 * The Arabic is shaped by the font itself: the joining forms, the marks and
 * the reading order are decided by the font's own tables, so the Arabic of
 * the file is the Arabic of the paper.
 */

import type { CVProfile } from '../types/career.ts';
import type { ResumeLanguage } from '../../shared/resumeLanguage.ts';
import type { CvTemplateDefinition } from '../../shared/cvTemplates.ts';
import { buildCvLayoutPlan } from '../../shared/cvLayout.ts';
import { buildCvPdfBytes } from './pdf/cvPdfRenderer.ts';
import { loadPdfFonts } from './pdf/pdfFonts.ts';

/** The paper's width at 96dpi, which is A4. */
export const PAPER_WIDTH_PX = 794;
/** The paper's height at 96dpi, which is A4. */
export const PAPER_HEIGHT_PX = 1123;

export interface CvPdfOptions {
  /** The candidate's document. */
  cv: CVProfile;
  /** The template the paper is drawn with. */
  template: CvTemplateDefinition;
  /** The language of the document. */
  language?: ResumeLanguage;
  /** The document title, written into the file. */
  title?: string;
  /** The candidate's name, written into the file and used for the file name. */
  author?: string;
  /** Reports the phase, so the button can say what is happening. */
  onProgress?: (phase: 'fonts' | 'pages' | 'writing') => void;
  /** Where the embedded fonts are served from. */
  fontBaseUrl?: string;
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
    .replace(/[À-ɏ]/g, (character) =>
      character.normalize('NFD').replace(/[̀-ͯ]/g, '')
    )
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleaned || 'CV'}_CV.pdf`;
}

/**
 * Generates the PDF of a document.
 *
 * The fonts are fetched once and the document is then drawn from the layout
 * plan, so the file is the paper rather than a picture of it.
 */
export async function generateCvPdf(options: CvPdfOptions): Promise<CvPdfResult> {
  if (typeof document === 'undefined') {
    throw new Error('The PDF export needs a browser.');
  }

  options.onProgress?.('fonts');
  const fonts = await loadPdfFonts(options.fontBaseUrl ?? '/fonts');

  options.onProgress?.('pages');
  const plan = buildCvLayoutPlan({
    cv: options.cv,
    template: options.template,
    language: options.language ?? 'en',
  });

  options.onProgress?.('writing');
  const author = options.author ?? options.cv.fullName ?? '';
  const { bytes, pages } = buildCvPdfBytes(plan, fonts, {
    title: options.title ?? `${author} — CV`,
    author,
  });

  return {
    bytes,
    fileName: cvPdfFileName(options.author ?? options.cv.fullName),
    pages,
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

/** Generates the PDF from the document and downloads it. */
export async function downloadCvPdf(options: CvPdfOptions): Promise<CvPdfResult> {
  const result = await generateCvPdf(options);
  savePdf(result.bytes, result.fileName);
  return result;
}
