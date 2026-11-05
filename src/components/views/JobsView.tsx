/**
 * Live Jobs.
 *
 * Real vacancies, aggregated from public job boards by the job provider. The
 * provider credential stays on the server; this screen only calls the
 * application's own API.
 *
 * Three kinds of opportunity exist in the product, and this screen shows only
 * the first:
 *
 *   1. LIVE VACANCIES      — here, from the job provider.
 *   2. OPPORTUNITY CATALOGUE — volunteering, internships and youth programmes
 *                              the platform curates itself.
 *   3. LEARNING RESOURCES  — courses, certifications and tutorials.
 *
 * A vacancy is never presented as a course and a course is never presented as
 * an opening. The links to the other two are offered explicitly.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  ExternalLink,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import { LiveJobCard } from '../jobs/LiveJobCard';
import { fetchLiveJobs, type JobQuota, type JobSearchFilters, type MatchedJob } from '../../lib/jobsApi';
import { ApiRequestError } from '../../lib/apiClient';
import {
  JOB_COUNTRIES,
  JOB_COUNTRY_LABELS,
  JOB_DATE_POSTED_OPTIONS,
  JOB_EMPLOYMENT_TYPES,
  JOB_LOCATION_SUGGESTIONS,
} from '../../../shared/jobs';
import { todayIsoDate } from '../../../shared/dateRange';

type SortOrder = 'match' | 'newest';

/** The date filters, with the wording the screen shows. */
const DATE_POSTED_LABELS: Record<string, string> = {
  all: 'Any time',
  today: 'Posted today',
  '3days': 'Last 3 days',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULLTIME: 'Full-time',
  PARTTIME: 'Part-time',
  CONTRACTOR: 'Contract',
  INTERN: 'Internship',
};

interface JobsViewProps {
  onNavigate: (view: string) => void;
}

/**
 * The sentence shown when a provider search fails.
 *
 * The server sends a developer-facing message with the failure code. Showing
 * that message verbatim would put an English sentence into the Arabic
 * interface, so each failure code is given a sentence of its own here and the
 * server's text is left to the logs and the network panel.
 *
 * The kinds of failure stay distinct on screen: a missing credential and a
 * rejected credential are the owner's to fix, a rate limit is the user's to
 * wait out, and an unreachable provider is neither.
 */
const providerFailureMessage = (
  code: string | null,
  t: (key: string) => string,
): string => {
  switch (code) {
    case 'not_configured':
      return t(
        'The job provider is not configured on this server yet. The owner has to add the provider credential before live vacancies appear here.',
      );
    case 'invalid_credential':
      return t(
        'The job provider rejected this server’s credential. The owner has to replace it before live vacancies appear here.',
      );
    case 'rate_limited':
      return t(
        'The provider is limiting how often this server may search. Wait a moment and try again.',
      );
    case 'upstream_unavailable':
      return t('The job provider is not answering right now. Try again in a few minutes.');
    case 'upstream_timeout':
      return t('The job provider took too long to answer. Try again in a few minutes.');
    case 'bad_response':
      return t('The job provider sent an answer this server could not read. Try again in a few minutes.');
    default:
      return t('Live jobs could not be loaded.');
  }
};

export const JobsView: React.FC<JobsViewProps> = ({ onNavigate }) => {
  const {
    t,
    targetRole,
    isHydrated,
    bookmarkedJobIds,
    toggleBookmarkJob,
    addApplication,
  } = useCareer();

  const [filters, setFilters] = useState<JobSearchFilters>({
    query: '',
    location: '',
    country: 'eg',
    datePosted: 'week',
    remoteOnly: false,
    employmentTypes: [],
  });
  const [results, setResults] = useState<MatchedJob[]>([]);
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string | null } | null>(null);
  const [sort, setSort] = useState<SortOrder>('match');
  const [trackingId, setTrackingId] = useState<string | null>(null);
  /** The outcome of the last application the user tracked from this screen. */
  const [trackNotice, setTrackNotice] = useState<{ ok: boolean; text: string } | null>(null);

  /** The first search runs once, after the profile has loaded. */
  const startedRef = useRef(false);

  const runSearch = useCallback(async (next: JobSearchFilters) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchLiveJobs(next);
      setResults(response.jobs);
      setQuota(response.quota);
      setSource(response.source);
    } catch (caught) {
      // The failure code is kept; the server's English sentence is not shown
      // to the user, because the interface has its own sentence per code.
      const code = caught instanceof ApiRequestError ? caught.code : null;
      setResults([]);
      setError({ code });
    } finally {
      setLoading(false);
    }
  }, []);

  // The first search waits for the profile so the target role can seed it.
  useEffect(() => {
    if (!isHydrated || startedRef.current) return;
    startedRef.current = true;
    const roleTitle = targetRole.title?.trim();
    const next: JobSearchFilters = {
      ...filters,
      query: roleTitle && roleTitle.toLowerCase() !== 'target role' ? roleTitle : '',
    };
    setFilters(next);
    void runSearch(next);
  }, [isHydrated, targetRole.title, filters, runSearch]);

  const update = (patch: Partial<JobSearchFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    void runSearch(filters);
  };

  const toggleEmploymentType = (value: string) => {
    setFilters((previous) => ({
      ...previous,
      employmentTypes: previous.employmentTypes.includes(value)
        ? previous.employmentTypes.filter((entry) => entry !== value)
        : [...previous.employmentTypes, value],
    }));
  };

  /**
   * Orders the results.
   *
   * A vacancy whose fit could not be compared never sorts above one whose
   * fit could: an unknown is never treated as a good match.
   */
  const ordered = useMemo(() => {
    const copy = [...results];
    if (sort === 'match') {
      copy.sort((a, b) => {
        const left = a.match.score;
        const right = b.match.score;
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left;
      });
    } else {
      copy.sort((a, b) => {
        const left = a.job.postedAt ? new Date(a.job.postedAt).getTime() : null;
        const right = b.job.postedAt ? new Date(b.job.postedAt).getTime() : null;
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left;
      });
    }
    return copy;
  }, [results, sort]);

  const expiredCount = useMemo(() => ordered.filter((entry) => entry.job.expired).length, [ordered]);

  const linkedInSearchUrl = useMemo(() => {
    const q = filters.query?.trim() || targetRole.title?.trim() || 'Software Engineer';
    const loc = filters.location?.trim() || (filters.country === 'eg' ? 'Egypt' : '');
    const params = new URLSearchParams({
      keywords: q,
      ...(loc ? { location: loc } : {}),
    });
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  }, [filters.query, filters.location, filters.country, targetRole.title]);

  const handleTrackApplication = async (item: MatchedJob) => {
    setTrackingId(item.job.id);
    setTrackNotice(null);
    try {
      const written = await addApplication({
        jobId: item.job.id,
        company: item.job.company,
        role: item.job.title,
        location: item.job.location ?? '',
        workMode: item.job.isRemote === true ? 'Remote' : 'On-site',
        stage: 'saved',
        appliedDate: todayIsoDate(),
        nextAction: 'Apply on the employer’s page',
        notes: item.job.url ? item.job.url : '',
      });
      // The confirmation is shown only when the record was really written.
      setTrackNotice(
        written
          ? { ok: true, text: t('Tracked in your applications') }
          : { ok: false, text: t('This application could not be saved. Try again.') }
      );
    } catch {
      setTrackNotice({ ok: false, text: t('This application could not be saved. Try again.') });
    } finally {
      setTrackingId(null);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] focus:outline-none transition-colors';

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div data-tour="jobs-header-panel" className="flex flex-col justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('Live Jobs')}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Real openings, from real job boards')}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {t(
              'Every vacancy below is a live posting taken from a public job board. The fit shown is calculated from the skills in your own profile.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('volunteer')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('Curated opportunities')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('learning')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{t('Learning resources')}</span>
          </button>
        </div>
      </div>

      {/* What this screen is, and what it is not. */}
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
        <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
        <div className="space-y-1 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">
            {t('These are live vacancies, not courses and not curated programmes.')}
          </p>
          <p>
            {t(
              'The platform does not edit these postings, so the employer’s own page is where you read the full description and apply. Saving a vacancy here keeps it in your account, and tracking an application records it in your applications.'
            )}
          </p>
        </div>
      </div>

      {/* LinkedIn Authorized External Search Entry */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0A66C2]/10 text-[#0A66C2]">
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9h2.79v8.37H6.46v-8.37M7.86 6.3a1.63 1.63 0 1 0 0 3.26 1.63 1.63 0 0 0 0-3.26Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">LinkedIn Jobs</span>
              <span className="rounded bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {t('External Search')}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {t('Search verified vacancies directly on LinkedIn matching your target role and keywords.')}
            </p>
          </div>
        </div>
        <a
          href={linkedInSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#0A66C2] hover:text-[#0A66C2]"
        >
          <span>{t('Search on LinkedIn')}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Search */}
      <form
        data-tour="jobs-filter-bar"
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs"
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative w-full md:flex-1">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
              placeholder={t('Job title, role or skill')}
              aria-label={t('Job title, role or skill')}
              className={`${inputClass} ps-9`}
            />
          </div>

          <div className="relative w-full md:w-56">
            <MapPin className="absolute start-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={filters.location}
              onChange={(event) => update({ location: event.target.value })}
              placeholder={t('City')}
              aria-label={t('City')}
              className={`${inputClass} ps-9`}
              list="job-location-suggestions"
            />
            <datalist id="job-location-suggestions">
              {JOB_LOCATION_SUGGESTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {t(entry.label)}
                </option>
              ))}
            </datalist>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span>{t('Search jobs')}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <span>{t('Country')}</span>
            <select
              value={filters.country}
              onChange={(event) => update({ country: event.target.value })}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {JOB_COUNTRIES.map((code) => (
                <option key={code} value={code} className="bg-[var(--surface-main)] text-[var(--text-primary)]">
                  {t(JOB_COUNTRY_LABELS[code] ?? code.toUpperCase())}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <span>{t('Posted')}</span>
            <select
              value={filters.datePosted}
              onChange={(event) => update({ datePosted: event.target.value })}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {JOB_DATE_POSTED_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-[var(--surface-main)] text-[var(--text-primary)]">
                  {t(DATE_POSTED_LABELS[option] ?? option)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={filters.remoteOnly}
              onChange={(event) => update({ remoteOnly: event.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
            />
            <span>{t('Remote only')}</span>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {JOB_EMPLOYMENT_TYPES.map((type) => {
              const active = filters.employmentTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleEmploymentType(type)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t(EMPLOYMENT_LABELS[type] ?? type)}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {/* Result count and ordering */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          <span>
            {ordered.length} {t('live vacancies')}
          </span>
          {expiredCount > 0 && (
            <span className="text-[var(--color-warning)]">
              {t('({count} expired)').replace('{count}', String(expiredCount))}
            </span>
          )}
          {quota?.remaining !== null && quota?.remaining !== undefined && (
            <span>
              {t('Provider quota left: {count}').replace('{count}', String(quota.remaining))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">{t('Sort by')}</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
            aria-label={t('Sort by')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            <option value="match" className="bg-[var(--surface-main)] text-[var(--text-primary)]">{t('Best fit first')}</option>
            <option value="newest" className="bg-[var(--surface-main)] text-[var(--text-primary)]">{t('Newest first')}</option>
          </select>
          <button
            type="button"
            onClick={() => void runSearch(filters)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('Refresh')}</span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div role="status" className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {t('Searching live job boards…')}
          </p>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-52 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-5"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {t('Live jobs could not be loaded.')}
            </p>
            <p>{providerFailureMessage(error.code, t)}</p>
            <button
              type="button"
              onClick={() => void runSearch(filters)}
              className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)]"
            >
              {t('Try again')}
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && ordered.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t('No live vacancies matched this search')}
          description={t(
            'Try a broader title, a nearby city, a longer date range, or another country. The provider only returns openings it can currently find.'
          )}
          actionLabel={t('Clear filters')}
          onAction={() => {
            const next: JobSearchFilters = {
              query: '',
              location: '',
              country: 'eg',
              datePosted: 'month',
              remoteOnly: false,
              employmentTypes: [],
            };
            setFilters(next);
            void runSearch(next);
          }}
        />
      )}

      {/* Results */}
      {!loading && !error && ordered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ordered.map((item) => (
            <LiveJobCard
              key={item.job.id}
              item={item}
              bookmarked={bookmarkedJobIds.includes(item.job.id)}
              onToggleBookmark={toggleBookmarkJob}
              onTrackApplication={(entry) => void handleTrackApplication(entry)}
              tracking={trackingId === item.job.id}
              t={t}
            />
          ))}
        </div>
      )}

      {/* The outcome of the last tracked application. */}
      {trackNotice && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            trackNotice.ok
              ? 'border-[var(--color-success)]/25 bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
          }`}
        >
          {trackNotice.text}
        </p>
      )}

      {/* Attribution: these postings are not the platform's own. */}
      {source && (
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {source}. {t('The platform does not edit these postings, and it is not a party to any application.')}
        </p>
      )}
    </Reveal>
  );
};

export default JobsView;
