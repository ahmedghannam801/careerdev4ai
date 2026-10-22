// Server-side CV file storage (Supabase Storage bucket: 'cv-files').
//
// Object path convention: {user_id}/{file_id}.{ext}
//   The first segment is the owner id, which is what the bucket's RLS policies
//   compare against auth.uid(). A user therefore cannot read, overwrite or
//   delete another user's file even if they guess the file id.
//
// All operations go through the service-role client; ownership is checked
// server-side before any object is touched, so RLS is a second line of defence.
import { randomUUID } from 'crypto';
import { getSupabaseServer } from './supabase';

export const CV_BUCKET = 'cv-files';
export const MAX_CV_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/json': 'json',
};

export interface UploadedCvFile {
  path: string;
  size: number;
  fileName: string;
}

/** Maps a client mime type to a safe extension. Returns null when unsupported. */
export function extensionForMimeType(mimeType: string): string | null {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? null;
}

/**
 * Uploads a CV file into the caller's own folder.
 * `userId` must be the id verified from the caller's Supabase JWT.
 */
export async function uploadCvFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<UploadedCvFile> {
  const ext = extensionForMimeType(mimeType);
  if (!ext) {
    throw new Error('Unsupported file type');
  }
  if (buffer.length === 0) {
    throw new Error('Empty file');
  }
  if (buffer.length > MAX_CV_FILE_BYTES) {
    throw new Error('File exceeds the maximum size');
  }

  // The file id is a random UUID — never derived from the user id or a
  // sequential counter, so paths cannot be guessed.
  const fileId = randomUUID();
  const path = `${userId}/${fileId}.${ext}`;

  const { error } = await getSupabaseServer()
    .storage.from(CV_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) throw error;

  return { path, size: buffer.length, fileName };
}

/**
 * Creates a short-lived signed URL for the caller's own file.
 * Refuses any path that does not belong to the caller.
 */
export async function createCvFileDownloadUrl(
  userId: string,
  path: string
): Promise<{ url: string; expiresIn: number }> {
  if (!pathBelongsToUser(userId, path)) {
    throw new Error('Not found');
  }
  const expiresIn = 300; // 5 minutes
  const { data, error } = await getSupabaseServer()
    .storage.from(CV_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return { url: data.signedUrl, expiresIn };
}

/** Deletes a file the caller owns. Returns false when there was nothing to delete. */
export async function deleteCvFile(userId: string, path: string): Promise<boolean> {
  if (!pathBelongsToUser(userId, path)) {
    return false;
  }
  const { error } = await getSupabaseServer().storage.from(CV_BUCKET).remove([path]);
  if (error) throw error;
  return true;
}

/** True when the object path's first segment is the given user id. */
export function pathBelongsToUser(userId: string, path: string): boolean {
  if (!userId || !path) return false;
  // Reject anything that a storage backend could normalise into a different
  // object key: backslashes, empty segments, and '.'/'..' path traversal.
  if (path.includes('\\')) return false;
  const segments = path.split('/');
  if (segments.length < 2) return false;
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return segments[0] === userId;
}

/** Lists the caller's stored CV files (paths only). */
export async function listCvFiles(userId: string): Promise<string[]> {
  const { data, error } = await getSupabaseServer()
    .storage.from(CV_BUCKET)
    .list(userId, { limit: 200 });
  if (error) throw error;
  return (data ?? [])
    .filter((entry) => entry && typeof entry.name === 'string')
    .map((entry) => `${userId}/${entry.name}`);
}
