// Typed client for the job-bookmark endpoints.
//
// The bookmark toggle lived only in React state, so a saved job disappeared on
// the next reload and on every other device. The bookmarks are now owned rows.
//
// The job listings are supplied by an external feed (not bundled in this
// release), so a bookmark stores only the opaque job id.

// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';

export interface BookmarkDTO {
  id: string;
  jobId: string;
  createdAt: string;
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
