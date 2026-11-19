/**
 * The browser's view of the live job feed.
 *
 * The provider credential never reaches the browser: this module only calls
 * the application's own API, which calls the provider on the server.
 *
 * The explanation of a match is computed on the server as well, against the
 * candidate's own record read from the database. The browser is shown the
 * answer; it does not work one out for itself, so the score beside a posting
 * is always the same number the server would give.
 */

import { apiRequest } from './apiClient';
import type { JobKind, JobSourceId, LiveJob } from '../../shared/jobs';
import type { JobMatchBreakdown } from '../../shared/jobMatching';

/** One vacancy together with the candidate's fit against it. */
export interface MatchedJob {
  job: LiveJob;
  /**
   * The explanation, as the server computed it.
   *
   * It carries the score, the factors that produced it, the skills the
   * candidate meets and misses, and the semantic factor when one was
   * measured. The semantic factor is absent rather than zero when there was
   * no comparison to make.
   */
  match: JobMatchBreakdown;
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
  /** When the job boards were read, as an ISO timestamp. */
  checkedAt: string;
  /** Which boards were read, and which could not be. */
  boardsRead?: string[];
  boardsFailed?: string[];
}

/** One recommended vacancy, and why it was recommended. */
export interface JobRecommendation {
  job: LiveJob;
  match: JobMatchBreakdown;
  /** Why this posting is here, in one sentence. */
  reason: string;
  /** The terms that drove the recommendation. */
  highlights: string[];
}

/** What the recommendation was based on, so it can be shown. */
export interface RecommendationBasis {
  skillCount: number;
  experienceLevel: string | null;
  targetOpportunityType: string | null;
  educationLevel: string | null;
  location: string | null;
  targetRole: string | null;
}

/** The recommendations, as the server answered them. */
export interface JobRecommendationResponse {
  recommendations: JobRecommendation[];
  quota: JobQuota;
  cached: boolean;
  source: string;
  checkedAt: string;
  boardsRead?: string[];
  boardsFailed?: string[];
  candidate: RecommendationBasis;
}

/** One posting in a comparison. */
export interface JobComparisonEntry {
  job: LiveJob;
  match: JobMatchBreakdown;
  /** The skills this posting asks for that the candidate meets. */
  met: string[];
  /** The skills this posting asks for that the candidate does not meet. */
  missing: string[];
  /** The factor that carried this posting's score. */
  strongestFactor: string | null;
}

/** Two or more postings, side by side. */
export interface JobComparison {
  entries: JobComparisonEntry[];
  /** The skills every posting asks for. */
  commonRequirements: string[];
  /** The skills only one posting asks for, by posting identifier. */
  uniqueRequirements: Record<string, string[]>;
  /** The factors each posting leads on, by posting identifier. */
  leadsOn: Record<string, string[]>;
}

/** The parameters the search screen can change. */
export interface JobSearchFilters {
  query: string;
  location: string;
  country: string;
  datePosted: string;
  remoteOnly: boolean;
  /**
   * What the candidate is looking at: everything, jobs, or internships.
   *
   * The kind is sent to the server rather than applied in the browser, so the
   * provider is asked for the right feed instead of the browser throwing away
   * most of what was fetched.
   */
  kind: JobKind;
  /** The boards the candidate narrowed the search to. */
  sources: JobSourceId[];
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
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.sources.length) params.set('sources', filters.sources.join(','));
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

/**
 * Asks the server what this candidate should look at.
 *
 * The server builds the search from the candidate's own record, so this needs
 * no query text. The filters are the ones the search screen already offers.
 */
export async function fetchRecommendedJobs(
  filters?: Partial<JobSearchFilters>,
  limit = 12
): Promise<JobRecommendationResponse> {
  const params = new URLSearchParams();
  if (filters?.location?.trim()) params.set('location', filters.location.trim());
  if (filters?.country) params.set('country', filters.country);
  if (filters?.datePosted) params.set('datePosted', filters.datePosted);
  if (filters?.remoteOnly) params.set('remoteOnly', 'true');
  if (filters?.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters?.sources?.length) params.set('sources', filters.sources.join(','));
  if (filters?.employmentTypes?.length) {
    params.set('employmentTypes', filters.employmentTypes.join(','));
  }
  params.set('limit', String(limit));

  return apiRequest<JobRecommendationResponse>(`/api/jobs/recommend?${params.toString()}`);
}

/**
 * Compares postings side by side.
 *
 * The browser names the postings; the server reads them and scores them. The
 * filters travel with the request so the server reads the same list the
 * candidate was looking at.
 */
export async function compareJobs(
  jobIds: string[],
  filters?: Partial<JobSearchFilters>
): Promise<{ comparison: JobComparison; missing: string[] }> {
  return apiRequest<{ comparison: JobComparison; missing: string[] }>('/api/jobs/compare', {
    method: 'POST',
    body: JSON.stringify({
      jobIds,
      filters: {
        query: filters?.query ?? '',
        location: filters?.location ?? '',
        country: filters?.country ?? '',
        datePosted: filters?.datePosted ?? '',
        remoteOnly: filters?.remoteOnly ?? false,
        kind: filters?.kind ?? 'all',
        sources: filters?.sources ?? [],
        employmentTypes: filters?.employmentTypes ?? [],
      },
    }),
  });
}
