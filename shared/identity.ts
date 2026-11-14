/**
 * One identity, everywhere.
 *
 * WHY THIS MODULE EXISTS
 * The QA audit found the same person being called different things in
 * different corners of the product: the topbar said "Nour" (from the auth
 * account), the sidebar said the full name (from the profile), and the
 * Dashboard said something else again. Editing a name in Profile did not
 * change the header until the page was reloaded, and the avatar in the
 * sidebar and the avatar in the topbar could be different pictures of the
 * same person.
 *
 * This module is the one place that decides what the candidate is called and
 * what their avatar is. Every surface reads it, so they cannot disagree.
 *
 * THE ORDER OF PREFERENCE
 *   1. The profile's preferred name — the candidate chose it.
 *   2. The profile's full name — what they typed in.
 *   3. The auth account's name — what they signed up with.
 *   4. Nothing. The caller decides what to show instead of a name.
 *
 * The preferred name comes first because a candidate who tells the platform
 * what to call them means it.
 */

/** The identity inputs the platform knows about. */
export interface IdentityInput {
  /** The profile's full name. */
  name?: string | null;
  /** The name the candidate prefers to be called. */
  preferredName?: string | null;
  /** The name on the authentication account. */
  accountName?: string | null;
}

/** The identity every surface renders. */
export interface CandidateIdentity {
  /** The name to show. Empty when the candidate has never given one. */
  displayName: string;
  /** The initials to show in an avatar chip. */
  initials: string;
  /** True when the candidate has not given a name yet. */
  isAnonymous: boolean;
}

/**
 * The candidate's name, resolved once.
 *
 * Every name is trimmed, and an empty string counts as no name — a field
 * that was cleared is not a name made of spaces.
 */
export function resolveDisplayName(input: IdentityInput): string {
  const candidates = [input.preferredName, input.name, input.accountName];
  for (const candidate of candidates) {
    const trimmed = (candidate ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/**
 * The initials for an avatar chip.
 *
 * Two letters where there are two words, one where there is one. An Arabic
 * name is split on spaces like any other, because Arabic names are written
 * with spaces too.
 */
export function resolveInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) {
    // One word: take its first two letters, so "Sara" reads as "SA" rather
    // than a single letter floating in a circle.
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/**
 * The full identity of the candidate.
 *
 * This is what the topbar, the sidebar, the Dashboard and the CV Studio all
 * render.
 */
export function resolveIdentity(input: IdentityInput): CandidateIdentity {
  const displayName = resolveDisplayName(input);
  return {
    displayName,
    initials: resolveInitials(displayName),
    isAnonymous: displayName.length === 0,
  };
}

/**
 * The first name, for a compact header.
 *
 * The topbar has room for one word. The last word is dropped because the
 * family name is the one the candidate already knows.
 */
export function resolveFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words[0] ?? '';
}
