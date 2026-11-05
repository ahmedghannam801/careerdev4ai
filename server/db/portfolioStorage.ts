// Server-side portfolio & certificate file storage (Supabase Storage bucket: 'portfolio-attachments').
//
// Object path convention: {user_id}/{file_id}.{ext}
// The bucket is public-read, so uploaded screenshots and certificates produce
// immediate public URLs for frontend preview while mutations are strictly owned by {user_id}.

import { randomUUID } from 'crypto';
import { getSupabaseServer } from './supabase.ts';

export const PORTFOLIO_BUCKET = 'portfolio-attachments';
export const MAX_PORTFOLIO_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

export interface UploadedPortfolioFile {
  path: string;
  size: number;
  fileName: string;
  publicUrl: string;
}

export function extensionForPortfolioMimeType(mimeType: string): string | null {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? null;
}

/**
 * Uploads a portfolio screenshot, thumbnail, or certification file into the caller's folder.
 */
export async function uploadPortfolioFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<UploadedPortfolioFile> {
  const ext = extensionForPortfolioMimeType(mimeType);
  if (!ext) {
    throw new Error('Unsupported file type. Allowed: PNG, JPEG, WebP, GIF, SVG, PDF.');
  }
  if (buffer.length === 0) {
    throw new Error('Empty file');
  }
  if (buffer.length > MAX_PORTFOLIO_FILE_BYTES) {
    throw new Error('File exceeds the 10 MB maximum limit');
  }

  const fileId = randomUUID();
  const path = `${userId}/${fileId}.${ext}`;

  const { error } = await getSupabaseServer()
    .storage.from(PORTFOLIO_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) throw error;

  const { data } = getSupabaseServer()
    .storage.from(PORTFOLIO_BUCKET)
    .getPublicUrl(path);

  return {
    path,
    size: buffer.length,
    fileName,
    publicUrl: data.publicUrl,
  };
}

