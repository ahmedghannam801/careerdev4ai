// The order of the entries that appear on a CV.
//
// WHY THIS MODULE EXISTS
// ----------------------
// A CV is an ordered document: the experience at the top is read longest, and
// a candidate who worked at two employers wants the one that matters first.
// Until now the order was never stored. Every list was re-sorted by the
// server on every read — by start date, by issue date, by name, by creation
// time — so the order a candidate chose was thrown away the moment they
// saved it.
//
// This module stores the order. It is deliberately narrow:
//
//   - the table is chosen from a fixed list, never from the request, so a
//     crafted request cannot name a table the candidate does not own;
//   - the owner is always the verified user id, so a row that belongs to
//     somebody else can never be moved;
//   - the whole collection is renumbered, not just the rows in the request,
//     so the stored order is always complete and consistent. A row the
//     client did not know about keeps its relative position at the end
//     instead of jumping to the top.

import { getSupabaseServer } from './supabase';

/** The collections whose order is stored. */
export const ORDERED_COLLECTIONS = [
  'experiences',
  'educations',
  'certifications',
  'languages',
  'projects',
] as const;

export type OrderedCollection = (typeof ORDERED_COLLECTIONS)[number];

/**
 * The table and the owner column for each collection.
 *
 * A collection that is not in this map cannot be reordered at all. The name
 * is used to build the query, so it must never come from the request.
 */
const COLLECTION_TABLES: Record<
  OrderedCollection,
  { table: string; ownerColumn: string }
> = {
  experiences: { table: 'experiences', ownerColumn: 'user_id' },
  educations: { table: 'educations', ownerColumn: 'user_id' },
  certifications: { table: 'profile_certifications', ownerColumn: 'profile_id' },
  languages: { table: 'profile_languages', ownerColumn: 'profile_id' },
  projects: { table: 'projects', ownerColumn: 'profile_id' },
};

/** True when the collection is one whose order is stored. */
export function isOrderedCollection(value: unknown): value is OrderedCollection {
  return (
    typeof value === 'string' &&
    (ORDERED_COLLECTIONS as readonly string[]).includes(value)
  );
}

/**
 * Writes the new order of a collection.
 *
 * `ids` is the order the candidate wants, most important first. Rows that
 * are not named keep their relative order and are placed after the named
 * ones, so a row created in another session is never silently dropped to the
 * top of the list.
 *
 * Returns the ids in the order that was actually stored, so the caller can
 * put its own list into exactly that order.
 */
export async function reorderCollection(
  ownerId: string,
  collection: OrderedCollection,
  ids: readonly string[]
): Promise<string[]> {
  const target = COLLECTION_TABLES[collection];
  if (!target) throw new Error('Unknown collection');

  const supabase = getSupabaseServer();

  // Every row the owner has, so the stored order is complete.
  const { data: rows, error: readError } = await supabase
    .from(target.table)
    .select('id')
    .eq(target.ownerColumn, ownerId);
  if (readError) throw readError;

  const ownedIds = (rows ?? []).map((row) => (row as { id: string }).id);
  const owned = new Set(ownedIds);

  // The named ids, in the requested order, and only the ones the owner
  // actually has. A repeated id is kept once.
  const named: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !owned.has(id) || seen.has(id)) continue;
    seen.add(id);
    named.push(id);
  }

  // Everything else keeps its current relative order and goes after.
  const rest = ownedIds.filter((id) => !seen.has(id));
  const finalOrder = [...named, ...rest];

  // The order is written one row at a time. There are never more than a
  // handful of entries in any of these collections, and a single statement
  // with a CASE expression is not available through the client.
  for (let index = 0; index < finalOrder.length; index += 1) {
    const { error } = await supabase
      .from(target.table)
      .update({ sort_order: index })
      .eq(target.ownerColumn, ownerId)
      .eq('id', finalOrder[index]);
    if (error) throw error;
  }

  return finalOrder;
}
