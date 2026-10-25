/**
 * Normalizes a profile URL before it is stored.
 *
 * CVs routinely print a bare host such as `linkedin.com/in/name`. The API
 * intentionally accepts only absolute http(s) URLs because the values are
 * rendered as links, so a bare host must gain a scheme before it reaches the
 * profile endpoint. Anything that is not an http(s) URL with a host is
 * rejected instead of being guessed at.
 */
export function normalizeProfileUrl(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}
