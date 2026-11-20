/**
 * The identity of a project.
 * ---------------------------------------------------------------------------
 * Two project rows describe the same piece of work when their titles say the
 * same thing and they were done in the same role.
 *
 * WHY THIS IS A SHARED RULE
 * The platform has more than one way to start a project: the Projects view,
 * the Profile page, and a recommendation the candidate acts on. When each of
 * them wrote its own row, the same project ended up in the list two or three
 * times — the repeated project information a candidate saw.
 *
 * The duplication was created in the WRITE path, so the rule that recognises
 * "the same project" has to be the same rule on both sides of the write: the
 * one that stops the second row being written, and the one that collapses
 * the rows that are already there.
 *
 * The comparison ignores case, spacing and punctuation, because those are
 * typing differences and not differences in the work.
 *
 * This module is pure: it touches no database, so the rule can be reasoned
 * about — and tested — on its own.
 */

/** One project row, as far as the identity rule is concerned. */
export interface ProjectIdentityRow {
  id: string;
  title?: string | null;
  role?: string | null;
  created_at?: string | null;
}

/** The key two projects are compared by. */
export function projectIdentity(
  title: string | null | undefined,
  role: string | null | undefined
): string {
  const normalise = (value: string | null | undefined) =>
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
      .trim();
  return `${normalise(title)}|${normalise(role)}`;
}

/** Whether a key describes a project at all, or an untitled one. */
export function hasProjectIdentity(key: string): boolean {
  return !key.startsWith('|') && !key.endsWith('|');
}

/**
 * Collapses the rows that describe the same project.
 *
 * The newest row wins: it carries the most recent progress, the newest
 * status and the most complete description. The older rows are NOT deleted —
 * they are simply not read as separate projects any more, so a candidate who
 * somehow ended up with two rows for one project sees one project instead of
 * the same project twice.
 *
 * A row with no title is never collapsed: it is not the same project as
 * another untitled row, it is simply an untitled project.
 */
export function collapseDuplicateProjects<T extends ProjectIdentityRow>(rows: T[]): T[] {
  const winners = new Map<string, T>();

  for (const row of rows) {
    const key = projectIdentity(row.title, row.role);
    if (!hasProjectIdentity(key)) {
      winners.set(`${key}#${row.id}`, row);
      continue;
    }
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, row);
      continue;
    }
    // The newer row is the one the candidate last worked on.
    const existingTime = Date.parse(existing.created_at ?? '') || 0;
    const rowTime = Date.parse(row.created_at ?? '') || 0;
    if (rowTime >= existingTime) winners.set(key, row);
  }

  return rows.filter((row) => {
    const key = projectIdentity(row.title, row.role);
    if (!hasProjectIdentity(key)) return true;
    return winners.get(key)?.id === row.id;
  });
}
