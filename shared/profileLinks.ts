/**
 * The rules for editing a professional link.
 *
 * A link has two halves that live in different places. The URL and the label
 * belong to the candidate's profile; the order and the on/off switch belong to
 * one CV. The editor used to write the URL into the CV on every keystroke and
 * then compare the input against the already-updated value on blur, so the
 * comparison was always false and the edit never reached the profile.
 *
 * This module keeps the decision in one pure place: what changed, whether the
 * new URL is usable, and what patch the API should receive. The editor and the
 * regression test use the same function, so they cannot disagree.
 */

import { normalizeProfileUrl } from './urls.ts';

/** The editable fields of a link. */
export interface ProfileLinkDraft {
  label: string;
  url: string;
}

/** The stored values a draft is compared against. */
export interface ProfileLinkSnapshot {
  label: string | null;
  url: string;
}

/** The subset of a link the PATCH endpoint accepts. */
export interface ProfileLinkPatch {
  label?: string | null;
  url?: string;
}

/** Why a URL cannot be saved, or `null` when it can. */
export type ProfileLinkUrlError = 'empty' | 'invalid' | null;

/** The result of comparing a draft with its stored link. */
export interface ProfileLinkDiff {
  /** The fields that actually changed. Empty when nothing did. */
  patch: ProfileLinkPatch;
  /** The normalised URL, when the draft contains a usable one. */
  url: string;
  /** Why the draft URL cannot be saved, or `null` when it can. */
  urlError: ProfileLinkUrlError;
}

/**
 * Validates and normalises a URL for a profile link.
 *
 * A bare host such as `linkedin.com/in/name` is accepted and gains `https://`.
 * A `javascript:` URL, a relative path or a value with no host is rejected,
 * because the value is rendered as an external link.
 */
export function validateProfileLinkUrl(value: string | null | undefined): {
  valid: boolean;
  url: string;
  error: ProfileLinkUrlError;
} {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { valid: false, url: '', error: 'empty' };
  const normalized = normalizeProfileUrl(raw);
  if (!normalized) return { valid: false, url: '', error: 'invalid' };
  return { valid: true, url: normalized, error: null };
}

/** The draft a stored link starts from. */
export function profileLinkDraft(snapshot: ProfileLinkSnapshot): ProfileLinkDraft {
  return {
    label: snapshot.label ?? '',
    url: snapshot.url ?? '',
  };
}

/**
 * Compares a draft with the stored link.
 *
 * The URL is normalised before it is compared, so typing `https://` in front
 * of a URL the profile already holds is not treated as a change. An empty
 * label is sent as `null`, which resets the link to its kind's default label
 * instead of saving a blank one.
 */
export function diffProfileLink(
  original: ProfileLinkSnapshot,
  draft: ProfileLinkDraft
): ProfileLinkDiff {
  const patch: ProfileLinkPatch = {};

  const originalLabel = (original.label ?? '').trim();
  const nextLabel = draft.label.trim();
  if (nextLabel !== originalLabel) {
    patch.label = nextLabel || null;
  }

  const originalUrl = (normalizeProfileUrl(original.url) || original.url).trim();
  const rawNextUrl = draft.url.trim();
  const validation = validateProfileLinkUrl(rawNextUrl);

  if (rawNextUrl !== originalUrl) {
    if (!validation.valid) {
      return { patch, url: '', urlError: validation.error };
    }
    patch.url = validation.url;
  } else if (!validation.valid) {
    // The stored value should already be valid, but if it is not, saving the
    // unchanged row must not silently write an unsafe URL back.
    return { patch, url: '', urlError: validation.error };
  }

  return { patch, url: validation.url, urlError: null };
}

/** True when the diff would write something. */
export function hasProfileLinkChanges(diff: ProfileLinkDiff): boolean {
  return Object.keys(diff.patch).length > 0;
}
