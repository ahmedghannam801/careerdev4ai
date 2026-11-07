/**
 * The extraction review, as the client sees it.
 *
 * Three calls, and the order matters:
 *
 *   extractCv()          reads a document and writes nothing
 *   extractCvSection()   reads one section of it again
 *   importReviewedCv()   writes the document the candidate accepted
 *
 * The first two are pure reads. The third is the only one that changes
 * anything, and it is idempotent, so a retry after a dropped connection
 * cannot create a second copy of the candidate's history.
 */

import { apiRequest, ApiRequestError } from './apiClient';
import type {
  CvExtractedSection,
  CvExtractionReview,
  CvReviewedImportResult,
  CvSectionKey,
  CvValidationIssue,
} from '../../shared/cvExtraction';
import type { CVProfile } from '../types/career';

export interface ExtractCvOptions {
  /** The file to read. When there is none, the pasted text is sent instead. */
  file?: File | null;
  /** The pasted text, when the candidate pasted instead of uploading. */
  text?: string;
  signal?: AbortSignal;
}

export interface ExtractCvResponse {
  review: CvExtractionReview;
  /**
   * The document the reader found, in the shape the studio works with.
   *
   * It is a reading and not a change: the candidate's CV has not been
   * touched. A caller that only wants to look at the CV — the analyzer
   * measuring a file — uses this; a caller that wants the candidate to adopt
   * it uses the review, and the import route.
   */
  document: CVProfile;
  extractionQuality: 'high' | 'medium' | 'low' | 'failed';
}

export interface ExtractCvSectionResponse {
  section: CvExtractedSection;
  issues: CvValidationIssue[];
  summary: CvExtractionReview['summary'];
}

/** Reads a document and builds its review. Nothing is written. */
export async function extractCv(
  options: ExtractCvOptions
): Promise<ExtractCvResponse> {
  const headers: Record<string, string> = {};
  let body: BodyInit;

  if (options.file) {
    const form = new FormData();
    form.append('file', options.file);
    body = form;
  } else if (options.text) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ text: options.text });
  } else {
    throw new ApiRequestError(400, 'No document was given.', 'no_document');
  }

  const response = await apiRequest<{
    success: boolean;
    review: CvExtractionReview;
    document: CVProfile;
    extractionQuality: ExtractCvResponse['extractionQuality'];
  }>('/api/cv/extract', {
    method: 'POST',
    headers,
    body,
    signal: options.signal,
  });

  return {
    review: response.review,
    document: response.document,
    extractionQuality: response.extractionQuality,
  };
}

/** Reads one section of a document again. */
export async function extractCvSection(
  text: string,
  section: CvSectionKey,
  options: { signal?: AbortSignal } = {}
): Promise<ExtractCvSectionResponse> {
  return apiRequest<ExtractCvSectionResponse>('/api/cv/extract/section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, section }),
    signal: options.signal,
  });
}

/** The outcome of a reviewed import, with the version it was stored as. */
export interface ReviewedImportOutcome extends CvReviewedImportResult {
  /** The CV the document was stored against. */
  cvId?: string | null;
  /** The version the reviewed document was stored as. */
  cvVersionId?: string | null;
}

/** Writes the reviewed document into the candidate's records. */
export async function importReviewedCv(
  cv: CVProfile,
  selectedSections: Record<string, boolean>
): Promise<ReviewedImportOutcome> {
  return apiRequest<ReviewedImportOutcome>('/api/cv/import/reviewed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv, selectedSections }),
  });
}
