/**
 * Receipt file validation.
 *
 * A receipt is a screenshot or a document from a wallet or a bank. It is
 * evidence that a candidate claims to have paid, so it is stored on the
 * server, and the file that is stored has to be what it claims to be.
 *
 * The declared content type comes from the browser and proves nothing. The
 * bytes do: the signature at the start of a file says what it really is. A
 * file that does not carry a known signature is refused, so a renamed script,
 * an archive or an executable cannot end up in the receipt bucket.
 */

export interface ReceiptFileCheck {
  /** The type the bytes actually are. */
  detected: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  /** The bytes that were checked. */
  bytes: number;
}

/**
 * The bytes of an uploaded file.
 *
 * The upload layer hands over a Node buffer, but the type it declares also
 * allows a plain byte array. The signature is read from the front of the
 * bytes, so both are accepted.
 */
export type ReceiptBytes = Buffer | Uint8Array;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

/**
 * Detects the real type of a file from its leading bytes.
 */
export function detectReceiptType(buffer: ReceiptBytes): ReceiptFileCheck['detected'] | null {
  if (!buffer || buffer.length < 4) return null;

  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // PDF: %PDF-
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Checks that a receipt is a file the platform accepts.
 *
 * The declared type, the file name and the bytes must all agree. When they
 * do not, the file is refused — the check never "repairs" a mismatch by
 * trusting the browser.
 */
export function assertReceiptFileIsAllowed(input: {
  buffer: ReceiptBytes;
  contentType?: string | null;
  filename?: string | null;
}): ReceiptFileCheck {
  const { buffer, contentType, filename } = input;

  const detected = detectReceiptType(buffer);
  if (!detected) {
    throw new Error(
      'The receipt must be a JPEG, PNG, WebP or PDF file. The uploaded file is not one of those.'
    );
  }

  const declared = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (declared && !ALLOWED_TYPES.has(declared)) {
    throw new Error('The receipt must be a JPEG, PNG, WebP or PDF file.');
  }

  if (declared && declared !== detected) {
    throw new Error('The receipt file does not match its file type.');
  }

  const extension = (filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('The receipt must be a JPEG, PNG, WebP or PDF file.');
  }

  return { detected, bytes: buffer.length };
}
