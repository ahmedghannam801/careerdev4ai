/**
 * The formats a CV may be uploaded in.
 *
 * The upload path is crossed by three layers, and they used to disagree about
 * what a file is:
 *
 *   - the API, which decided whether a file was allowed at all,
 *   - the storage layer, which decided what to call the stored object,
 *   - the bucket, which decided whether the stored object was welcome.
 *
 * A `.doc` that a browser reports as `application/octet-stream` passed the
 * first gate and was refused by the second, so the upload was accepted and
 * then rejected with a generic message and nothing was saved. The lists are
 * written down once here, so the three layers cannot drift apart again.
 *
 * The rules are the same everywhere:
 *
 *   - A file must match BOTH its extension and one of the MIME types declared
 *     for that extension, so a renamed or crafted upload cannot pass the
 *     format check under a false identity.
 *   - The type a file is STORED as is decided by its extension, not by the
 *     MIME type the browser happened to declare. A Word file is stored as a
 *     Word file whatever the browser called it.
 *   - The size limit is one number, and the browser is told what it is before
 *     the file is sent, so an oversized file is refused in the interface
 *     instead of after the upload.
 */

/* -------------------------------------------------------------------------- */
/* The limit                                                                   */
/* -------------------------------------------------------------------------- */

/** The largest CV file the platform accepts, in bytes. */
export const CV_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** The same limit, written for a person to read. */
export const CV_UPLOAD_MAX_LABEL = '10 MB';

/* -------------------------------------------------------------------------- */
/* The formats                                                                 */
/* -------------------------------------------------------------------------- */

export interface CvUploadFormat {
  /** The extension, including the dot. */
  extension: string;
  /**
   * The MIME types a browser may declare for this extension.
   *
   * `application/octet-stream` and `application/zip` are here because a
   * browser that does not know a format sends the file as a plain byte
   * stream, and a `.docx` IS a zip. Refusing those would refuse real CVs.
   */
  mimeTypes: readonly string[];
  /** The type the file is stored as. */
  storageMime: string;
  /** The extension of the stored object, without the dot. */
  storageExtension: string;
}

/**
 * The accepted formats, in the order they are offered to the candidate.
 *
 * Supported: PDF, DOCX, DOC, TXT, JSON.
 */
export const CV_UPLOAD_FORMATS: readonly CvUploadFormat[] = [
  {
    extension: '.pdf',
    mimeTypes: ['application/pdf', 'application/octet-stream', 'application/x-pdf'],
    storageMime: 'application/pdf',
    storageExtension: 'pdf',
  },
  {
    extension: '.docx',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
      'application/x-zip-compressed',
    ],
    storageMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storageExtension: 'docx',
  },
  {
    extension: '.doc',
    mimeTypes: [
      'application/msword',
      'application/vnd.ms-word',
      'application/octet-stream',
      'application/x-msword',
    ],
    storageMime: 'application/msword',
    storageExtension: 'doc',
  },
  {
    extension: '.txt',
    mimeTypes: ['text/plain'],
    storageMime: 'text/plain',
    storageExtension: 'txt',
  },
  {
    extension: '.json',
    mimeTypes: ['application/json'],
    storageMime: 'application/json',
    storageExtension: 'json',
  },
];

/** The accepted extensions, for the file picker's `accept` attribute. */
export const CV_UPLOAD_EXTENSIONS: readonly string[] = CV_UPLOAD_FORMATS.map(
  (format) => format.extension
);

/** The accepted MIME types, for the file picker's `accept` attribute. */
export const CV_UPLOAD_MIME_TYPES: readonly string[] = CV_UPLOAD_FORMATS.flatMap(
  (format) => format.mimeTypes
);

/** The formats a candidate can upload, written for the interface. */
export function cvUploadFormatsLabel(): string {
  return CV_UPLOAD_FORMATS.map((format) => format.extension.slice(1).toUpperCase()).join(', ');
}

/* -------------------------------------------------------------------------- */
/* Looking a file up                                                           */
/* -------------------------------------------------------------------------- */

/** The lower-cased extension of a file name, including the dot. */
export function cvUploadExtension(fileName: string): string {
  const name = fileName.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot) : '';
}

/** The format a file name claims, or null when the extension is not accepted. */
export function cvUploadFormatFor(fileName: string): CvUploadFormat | null {
  const extension = cvUploadExtension(fileName);
  return CV_UPLOAD_FORMATS.find((format) => format.extension === extension) ?? null;
}

/** The MIME type a browser may declare, without its parameters. */
export function cvUploadMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/**
 * Whether a file may be uploaded.
 *
 * The extension and the declared type must agree, and the file must be
 * within the size limit.
 */
export function isCvUploadAllowed(input: {
  fileName: string;
  mimeType: string;
  size?: number;
}): boolean {
  const format = cvUploadFormatFor(input.fileName);
  if (!format) return false;
  if (!format.mimeTypes.includes(cvUploadMimeType(input.mimeType))) return false;
  if (typeof input.size === 'number' && input.size > CV_UPLOAD_MAX_BYTES) return false;
  return true;
}

/**
 * The type a file is stored as.
 *
 * It is decided by the extension, so a Word file that a browser reported as a
 * byte stream is still stored as a Word file.
 */
export function cvUploadStorageMime(fileName: string): string | null {
  return cvUploadFormatFor(fileName)?.storageMime ?? null;
}

/** The extension of the stored object, without the dot. */
export function cvUploadStorageExtension(fileName: string): string | null {
  return cvUploadFormatFor(fileName)?.storageExtension ?? null;
}

/** The extension a stored MIME type corresponds to, without the dot. */
export function cvUploadExtensionForStorageMime(mimeType: string): string | null {
  const mime = cvUploadMimeType(mimeType);
  return CV_UPLOAD_FORMATS.find((format) => format.storageMime === mime)?.storageExtension ?? null;
}

/* -------------------------------------------------------------------------- */
/* The reasons                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Why a file was refused.
 *
 * The reason is a code, not a sentence, so the server can answer in its own
 * words and the interface can answer in the candidate's language.
 */
export type CvUploadRejection = 'unsupported_type' | 'too_large';

/** The reason a file was refused, or null when the file is acceptable. */
export function cvUploadRejection(input: {
  fileName: string;
  mimeType: string;
  size?: number;
}): CvUploadRejection | null {
  const format = cvUploadFormatFor(input.fileName);
  if (!format) return 'unsupported_type';
  if (!format.mimeTypes.includes(cvUploadMimeType(input.mimeType))) return 'unsupported_type';
  if (typeof input.size === 'number' && input.size > CV_UPLOAD_MAX_BYTES) return 'too_large';
  return null;
}

/**
 * The server's own wording for a refusal.
 *
 * The API answers in one language; the interface renders its own.
 */
export function cvUploadRejectionMessage(reason: CvUploadRejection): string {
  if (reason === 'too_large') {
    return `This file is larger than ${CV_UPLOAD_MAX_LABEL}. Please choose a smaller file.`;
  }
  return `Unsupported file type. Please upload a ${cvUploadFormatsLabel()} file.`;
}
