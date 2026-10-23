// Typed client for the job-bookmark endpoints.
//
// The bookmark toggle lived only in React state, so a saved job disappeared on
// the next reload and on every other device. The bookmarks are now owned rows.
//
// The job listings are supplied by an external feed (not bundled in this
// release), so a bookmark stores only the opaque job id.

import { getAccessToken } from './supabase';

export interface BookmarkDTO {
  id: string;
  jobId: string;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchBookmarks(): Promise<BookmarkDTO[]> {
  const data = await request<{ success: boolean; bookmarks: BookmarkDTO[] }>('/api/bookmarks');
  return data.bookmarks ?? [];
}

export async function createBookmark(jobId: string): Promise<BookmarkDTO> {
  const data = await request<{ success: boolean; bookmark: BookmarkDTO }>('/api/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  });
  return data.bookmark;
}

export async function deleteBookmark(jobId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/bookmarks/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
}
