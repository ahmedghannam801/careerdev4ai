/**
 * Learning-resource link rules.
 *
 * The roadmap's primary action opens the real learning source directly. That
 * is only safe when the stored URL is an absolute http(s) URL: a missing,
 * relative, malformed or `javascript:` value must never become an external
 * action that looks like it will open a course.
 *
 * Kept in `shared/` so the UI and the regression tests use the same rule.
 */

/** True when `value` is an absolute http(s) URL that can be opened safely. */
export function isSafeExternalUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The URL a Start Learning action should open, or `null` when there is no
 * verified source. Callers must render no external action for `null`.
 */
export function learningActionUrl(value: string | null | undefined): string | null {
  return isSafeExternalUrl(value) ? value.trim() : null;
}
