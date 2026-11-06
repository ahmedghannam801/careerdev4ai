// Typed client for the collection order endpoint.
//
// The order of the experience, the education, the certifications, the
// languages and the projects is part of the CV, so it is stored on the server
// rather than re-derived from a date on every read.
//
// The collection is named here, not taken from a URL, so the client can only
// ever ask for one of the five collections the server supports.

import { apiRequest as request } from './apiClient';

export const ORDERED_COLLECTIONS = [
  'experiences',
  'educations',
  'certifications',
  'languages',
  'projects',
] as const;

export type OrderedCollection = (typeof ORDERED_COLLECTIONS)[number];

/**
 * Stores the order of a collection.
 *
 * `ids` is the order the candidate wants, most important first. The server
 * returns the order that was actually stored, which is the list it knows
 * about — a row created in another session is kept, at the end.
 */
export async function reorderProfileCollection(
  collection: OrderedCollection,
  ids: string[]
): Promise<string[]> {
  const data = await request<{
    success: boolean;
    collection: OrderedCollection;
    order: string[];
  }>('/api/profile/reorder', {
    method: 'POST',
    body: JSON.stringify({ collection, ids }),
  });
  return Array.isArray(data.order) ? data.order : ids;
}

/**
 * Moves one entry in an ordered list and returns the new list.
 *
 * The list is returned rather than mutated so a caller can put it straight
 * back into its state without having to work out which two items moved.
 */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}
