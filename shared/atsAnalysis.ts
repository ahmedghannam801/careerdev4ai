// ATS analysis helpers shared by the client and the server-side tests.
//
// Two integrity rules are encoded here:
//   1. An analysis belongs to the role it was generated for. It must never be
//      presented as an alignment score for a different target role.
//   2. A failed audit must carry the server's real reason (including provider
//      quota limits) so the UI can show an actionable message.

export interface AtsAnalysisFailure {
  message: string;
  code: string | null;
  retryAfterSeconds: number | null;
}

export interface AtsAnalysisRoleContext {
  /** The role recorded on the analysis/CV version, or null when unknown. */
  roleTitle: string | null;
  /** True when the recorded role differs from the current target role. */
  isStale: boolean;
}

function normalizeRole(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Resolves how an ATS analysis should be labelled.
 *
 * The analysis role is authoritative because the score was computed against
 * that role's keywords. When it differs from the current target role the
 * caller must show a refresh warning instead of implying the score is current.
 */
export function resolveAtsAnalysisRole(
  analysisRoleTitle: string | null | undefined,
  currentRoleTitle: string | null | undefined
): AtsAnalysisRoleContext {
  const analysisRole = normalizeRole(analysisRoleTitle);
  const currentRole = normalizeRole(currentRoleTitle);
  return {
    roleTitle: analysisRole || null,
    isStale: Boolean(
      analysisRole &&
        currentRole &&
        analysisRole.toLowerCase() !== currentRole.toLowerCase()
    ),
  };
}

/**
 * True when an analysis recorded for `analysisRoleTitle` can be used as the
 * alignment score for `currentRoleTitle`. An unrecorded role is treated as
 * unverified, not as a match.
 */
export function isAtsAnalysisForRole(
  analysisRoleTitle: string | null | undefined,
  currentRoleTitle: string | null | undefined
): boolean {
  const analysisRole = normalizeRole(analysisRoleTitle);
  const currentRole = normalizeRole(currentRoleTitle);
  return Boolean(analysisRole && currentRole && analysisRole.toLowerCase() === currentRole.toLowerCase());
}

/**
 * Parses the body of a failed /api/optimize-cv response.
 *
 * Unknown shapes still produce a message with the HTTP status, so a gateway
 * error or a truncated body is never silently swallowed.
 */
export function parseAtsAnalysisFailure(payload: unknown, status: number): AtsAnalysisFailure {
  const body =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const rawMessage = typeof body.error === 'string' ? body.error.trim() : '';
  const rawCode = typeof body.code === 'string' ? body.code.trim() : '';
  const rawRetry = typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : Number.NaN;
  const retryAfterSeconds =
    Number.isFinite(rawRetry) && rawRetry > 0 ? Math.ceil(rawRetry) : null;

  return {
    message:
      rawMessage ||
      `The ATS audit could not be completed (the server returned ${status}). Nothing was changed.`,
    code: rawCode || null,
    retryAfterSeconds,
  };
}

/**
 * Formats a provider retry window as short human text, or null when there is
 * no meaningful wait to report.
 */
export function formatRetryDelay(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourText = `${hours} hour${hours === 1 ? '' : 's'}`;
  return minutes > 0 ? `${hourText} ${minutes} minute${minutes === 1 ? '' : 's'}` : hourText;
}
