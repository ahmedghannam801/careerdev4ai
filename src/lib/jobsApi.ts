/**
 * The browser's view of the live job feed.
 *
 * The provider credential never reaches the browser: this module only calls
 * the application's own API, which calls the provider on the server.
 */

import { apiRequest } from './apiClient';
import type { JobSkillMatch, LiveJob } from '../../shared/jobs';

/** One vacancy together with the candidate's fit against it. */
export interface MatchedJob {
  job: LiveJob;
  match: JobSkillMatch;
}

/** What the provider's quota looks like. */
export interface JobQuota {
  limit: number | null;
  remaining: number | null;
}

/** One search, as the server answered it. */
export interface JobSearchResponse {
  jobs: MatchedJob[];
  quota: JobQuota;
  cached: boolean;
  source: string;
}

/** The parameters the search screen can change. */
export interface JobSearchFilters {
  query: string;
  location: string;
  country: string;
  datePosted: string;
  remoteOnly: boolean;
  employmentTypes: string[];
}

/** Builds the query string the server expects. */
function toQueryString(filters: JobSearchFilters): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('query', filters.query.trim());
  if (filters.location.trim()) params.set('location', filters.location.trim());
  if (filters.country) params.set('country', filters.country);
  if (filters.datePosted) params.set('datePosted', filters.datePosted);
  if (filters.remoteOnly) params.set('remoteOnly', 'true');
  if (filters.employmentTypes.length) {
    params.set('employmentTypes', filters.employmentTypes.join(','));
  }
  return params.toString();
}

/**
 * Searches live vacancies.
 *
 * A failure throws the shared ApiRequestError, so the screen can tell a
 * missing credential from a rate limit from a genuine outage.
 */
export async function fetchLiveJobs(filters: JobSearchFilters): Promise<JobSearchResponse> {
  const query = toQueryString(filters);
  return apiRequest<JobSearchResponse>(`/api/jobs/search${query ? `?${query}` : ''}`);
}

/** Loads one vacancy by the provider's identifier. */
export async function fetchLiveJob(jobId: string): Promise<MatchedJob & { source: string }> {
  return apiRequest<MatchedJob & { source: string }>(
    `/api/jobs/${encodeURIComponent(jobId)}`
  );
}
