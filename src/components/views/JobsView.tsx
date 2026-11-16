/**
 * Jobs & Internships.
 *
 * Real vacancies, aggregated from public job boards by the job provider. The
 * provider credential stays on the server; this screen only calls the
 * application's own API.
 *
 * Three kinds of opportunity exist in the product:
 *
 *   1. JOBS & INTERNSHIPS — live vacancies from the job provider.
 *   2. OPPORTUNITY CATALOGUE — volunteering and youth programmes curated by
 *                              the platform.
 *   3. LEARNING RESOURCES — courses, certifications and tutorials.
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
import { AnimatedList } from '../react-bits/AnimatedList';
import { MagnetButton } from '../react-bits/MagnetButton';
import { fetchLiveJobs, type JobQuota, type JobSearchFilters, type MatchedJob } from '../../lib/jobsApi';
import { ApiRequestError } from '../../lib/apiClient';
import { buildRouteHash } from '../../lib/routing';
import { refreshRoute } from '../../lib/useRouteParams';
import { stageTailoredCv } from '../../lib/tailoredCvHandoff';
import {
  JOB_COUNTRIES,
  JOB_COUNTRY_LABELS,
  JOB_DATE_POSTED_OPTIONS,
  JOB_KINDS,
  JOB_KIND_LABELS,
  JOB_LOCATION_SUGGESTIONS,
  JOB_SOURCE_LABELS,
  type JobKind,
} from '../../../shared/jobs';
import { todayIsoDate } from '../../../shared/dateRange';
import { CAREER_ROLES, CATALOG_SKILL_NAMES } from '../../../shared/careerRoles';
import { deriveCandidateBand, educationLevelFromText, explainJobMatch, shouldFilterSeniorJob, type JobMatchCandidate } from '../../../shared/jobMatching';

type SortOrder = 'match' | 'newest';

/** The date filters, with the wording the screen shows. */
const DATE_POSTED_LABELS: Record<string, string> = {
  all: 'Any time',
  today: 'Posted today',
  '3days': 'Last 3 days',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

/**
 * How long the screen waits before it hands the candidate to the studio.
 *
 * The studio replaces this screen, so the confirmation of the request is
 * given during a short pause rather than being lost in the change of view.
 */
const TAILOR_HANDOFF_DELAY_MS = 400;

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
      return t('Jobs & Internships could not be loaded.');
  }
};

export const JobsView: React.FC<JobsViewProps> = ({ onNavigate }) => {
  const {
    t,
    targetRole,
    profile,
    experienceLevel,
    careerIdentity,
    ownedSkills,
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
    kind: 'all',
    sources: [],
    employmentTypes: [],
  });
  const [results, setResults] = useState<MatchedJob[]>([]);
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string | null } | null>(null);
  /** When the vacancies were last read from the provider, in epoch millis. */
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [sort, setSort] = useState<SortOrder>('match');
  const [showSeniorRoles, setShowSeniorRoles] = useState<boolean | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  /** The outcome of the last application the user tracked from this screen. */
  const [trackNotice, setTrackNotice] = useState<{ ok: boolean; text: string } | null>(null);
  /** The vacancy that is on its way to the CV Studio. */
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  /** The outcome of the last request for a tailored CV. */
  const [tailorNotice, setTailorNotice] = useState<{ ok: boolean; text: string } | null>(null);

  /** The first search runs once, after the profile has loaded. */
  const startedRef = useRef(false);
  /** Prevents a slower old response from replacing a newer search. */
  const searchRequestIdRef = useRef(0);
  /** The pending trip to the studio, so it can be called off. */
  const tailorTimerRef = useRef<number | null>(null);

  const runSearch = useCallback(async (next: JobSearchFilters) => {
    const requestId = ++searchRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchLiveJobs(next);
      if (requestId !== searchRequestIdRef.current) return;
      setResults(response.jobs);
      setQuota(response.quota);
      setSource(response.source);
      // When the vacancies were actually read. The candidate is told how old
      // the list is, because a job board that was checked an hour ago is not
      // the same thing as one that was checked a minute ago.
      setLastCheckedAt(Date.now());
    } catch (caught) {
      if (requestId !== searchRequestIdRef.current) return;
      // The failure code is kept; the server's English sentence is not shown
      // to the user, because the interface has its own sentence per code.
      const code = caught instanceof ApiRequestError ? caught.code : null;
      setResults([]);
      setError({ code });
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false);
    }
  }, []);

  // The first search waits for the profile so the target role can seed it.
  useEffect(() => {
    if (!isHydrated || startedRef.current) return;
    startedRef.current = true;
    const roleTitle = targetRole?.title?.trim();
    const next: JobSearchFilters = {
      ...filters,
      query: roleTitle ?? '',
    };
    setFilters(next);
    void runSearch(next);
  }, [isHydrated, targetRole?.title ?? '', filters, runSearch]);

  const update = (patch: Partial<JobSearchFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    void runSearch(filters);
  };

  /**
   * Switches between everything, the jobs, and the internships.
   *
   * The kind is not a label on the results: it is sent to the server, which
   * asks the provider for that feed instead of fetching everything and
   * throwing most of it away here.
   */
  const selectKind = (kind: JobKind) => {
    if (filters.kind === kind) return;
    const next: JobSearchFilters = {
      ...filters,
      kind,
      // The kind already decides the employment types the provider is asked
      // for, so a type left over from the previous kind would quietly narrow
      // the new one.
      employmentTypes: [],
    };
    setFilters(next);
    void runSearch(next);
  };

  /**
   * Orders the results.
   *
   * A vacancy whose fit could not be compared never sorts above one whose
   * fit could: an unknown is never treated as a good match.
   */
  const candidate = useMemo<JobMatchCandidate>(() => {
    const educationOrder = ['high_school', 'bachelor', 'master', 'doctorate'] as const;
    const education = profile.education.map((entry) => educationLevelFromText(entry.degree)).filter((level) => level !== null);
    const educationLevel = education.sort((a, b) => educationOrder.indexOf(b) - educationOrder.indexOf(a))[0] ?? null;
    return {
      skillNames: ownedSkills.filter((skill) => skill.level > 0).map((skill) => skill.name),
      experienceLevel,
      targetOpportunityType: careerIdentity.targetOpportunityType,
      educationLevel,
      country: profile.country ?? null,
      city: profile.city ?? profile.location ?? null,
    };
  }, [profile.education, profile.country, profile.city, profile.location, ownedSkills, experienceLevel, careerIdentity.targetOpportunityType]);
  const candidateBand = useMemo(() => deriveCandidateBand(candidate), [candidate]);
  const hideSeniorByDefault = candidateBand === 'student' || candidateBand === 'intern' || candidateBand === 'entry';
  const includeSenior = showSeniorRoles ?? !hideSeniorByDefault;
  const scores = useMemo(() => new Map(results.map((item) => [item.job.id, explainJobMatch(item.job, candidate, CATALOG_SKILL_NAMES, CAREER_ROLES)])), [results, candidate]);

  const ordered = useMemo(() => {
    const copy = results.filter((item) => includeSenior || !shouldFilterSeniorJob(scores.get(item.job.id)?.jobSeniority ?? null, candidateBand));
    if (sort === 'match') {
      copy.sort((a, b) => {
        return (scores.get(b.job.id)?.score ?? 0) - (scores.get(a.job.id)?.score ?? 0);
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
  }, [results, sort, scores, includeSenior, candidateBand]);

  const expiredCount = useMemo(() => ordered.filter((entry) => entry.job.expired).length, [ordered]);

  const linkedInSearchUrl = useMemo(() => {
    // The search is seeded from the candidate's own target role. With no role
    // there is nothing to seed it with, so the keyword is left out rather
    // than filled with a default career the candidate never chose.
    const q = filters.query?.trim() || targetRole?.title?.trim() || '';
    const loc = filters.location?.trim() || (filters.country === 'eg' ? 'Egypt' : '');
    const params = new URLSearchParams({
      ...(q ? { keywords: q } : {}),
      ...(loc ? { location: loc } : {}),
    });
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  }, [filters.query, filters.location, filters.country, targetRole?.title ?? '']);

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

  /**
   * Hands a vacancy to the CV Studio, to be tailored for it.
   *
   * The posting is staged rather than put in the address bar: its
   * description is long and does not belong in a URL. The studio is opened
   * on its "improve" step, which is the tab where a job is tailored.
   */
  const handleCreateTailoredCv = (item: MatchedJob) => {
    const { job } = item;
    const description = (job.description ?? '').trim();
    if (!description) {
      setTailorNotice({
        ok: false,
        text: t('This posting gives no description, so there is nothing to tailor a CV from.'),
      });
      return;
    }

    stageTailoredCv({
      jobId: job.id,
      title: job.title,
      company: job.company,
      description,
      location: job.location ?? null,
      applyUrl: job.applyUrl ?? null,
      url: job.url ?? null,
    });

    setTailoringId(job.id);
    setTailorNotice({ ok: true, text: t('Opening the CV Studio with this posting…') });

    if (tailorTimerRef.current !== null) window.clearTimeout(tailorTimerRef.current);
    tailorTimerRef.current = window.setTimeout(() => {
      tailorTimerRef.current = null;
      setTailoringId(null);
      // The view change comes first: `onNavigate` writes the route into the
      // address bar itself, so the studio's tab is written afterwards, with
      // the router's own helper, onto the same entry.
      onNavigate('cv-studio');
      window.history.replaceState(null, '', buildRouteHash('cv-studio', { tab: 'job' }));
      refreshRoute();
    }, TAILOR_HANDOFF_DELAY_MS);
  };

  // The trip to the studio is made on a timer, so a screen that is left
  // before it fires does not pull the candidate away from where they went.
  useEffect(
    () => () => {
      if (tailorTimerRef.current !== null) window.clearTimeout(tailorTimerRef.current);
    },
    [],
  );

  const inputClass =
    'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] focus:outline-none transition-colors';

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div data-tour="jobs-header-panel" className="flex flex-col justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('Jobs & Internships')}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Real openings, from real job boards')}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {t(
              'Every vacancy below is a live posting taken from a public job board — a job or an internship, as the posting itself states. The fit shown is calculated from the skills in your own profile.'
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
            {t('These are live openings, not courses and not curated programmes.')}
          </p>
          <p>
            {t(
              'The platform does not edit these postings, so the employer’s own page is where you read the full description and apply. Saving a vacancy here keeps it in your account, and tracking an application records it in your applications.'
            )}
          </p>
        </div>
      </div>

      {/* The boards behind the postings.
          Four of them are fetched by the provider, and every posting below
          names the one it came from. The fifth, Wonderin.ai, matches roles
          inside the candidate's own account and publishes no feed, so it is
          offered as a place to search rather than pretended at. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-xs">
        <div>
          <span className="text-xs font-bold text-[var(--text-primary)]">
            {t('The boards behind these postings')}
          </span>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t(
              'Every posting below was fetched from these boards by the job provider, and each card names the board it came from.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['google_jobs', 'indeed', 'ziprecruiter', 'handshake'] as const).map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]"
            >
              {JOB_SOURCE_LABELS[source]}
            </span>
          ))}
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
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {t('Search the boards directly')}
              </span>
              <span className="rounded bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {t('External Search')}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {t('Search verified vacancies directly on LinkedIn matching your target role and keywords.')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={linkedInSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--color-primary-text)]"
          >
            <span>{t('Search on LinkedIn')}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {/* Wonderin.ai publishes no job feed: it matches roles inside the
              candidate's own account. So it is a place to search, and it is
              labelled as one rather than presented as a board the platform
              fetched from. */}
          <a
            href="https://wonderin.ai/job-matches"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--color-primary-text)]"
          >
            <span>{t('Search on Wonderin.ai')}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
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

          <MagnetButton
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span>{t('Search jobs')}</span>
          </MagnetButton>
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

          {/* The one filter that matters most: jobs and internships are
              different searches, and a candidate looking for a placement does
              not want a part-time contract offered to them. The toggle is
              three states rather than two checkboxes, because "everything" is
              a real choice. */}
          <div
            role="group"
            aria-label={t('Show')}
            className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-1"
          >
            {JOB_KINDS.map((kind) => {
              const active = filters.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => selectKind(kind)}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    active
                      ? 'border-[var(--accent-primary)] bg-[var(--surface-main)] text-[var(--color-primary-text)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t(JOB_KIND_LABELS[kind])}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <input type="checkbox" checked={includeSenior} onChange={(event) => setShowSeniorRoles(event.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent-primary)]" />
        <span>{t('Show Senior and Lead roles')}</span>
        <span>{t('Based on your profile: {level}').replace('{level}', candidateBand ?? t('Not set'))}</span>
      </label>

      {/* Result count and ordering */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {/* The count is only shown when it MEANS something.
              While the search is running there is no count yet, and printing
              "0 live vacancies" next to "Searching live job boards…" told
              the candidate the boards had nothing, which was never true. */}
          {!loading && !error && (
            <span>
              {ordered.length} {t('openings')}
            </span>
          )}
          {!loading && !error && lastCheckedAt && (
            <span>
              {t('Last checked: {time}').replace(
                '{time}',
                new Date(lastCheckedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              )}
            </span>
          )}
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
          <div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {t('Jobs & Internships could not be loaded.')}
            </p>
            <p>{providerFailureMessage(error.code, t)}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void runSearch(filters)}
                className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)]"
              >
                {t('Try again')}
              </button>
              {(() => {
                const q = (filters.query || targetRole?.title || '').trim();
                const loc = (filters.location || '').trim();
                const qEnc = encodeURIComponent(q);
                const locEnc = encodeURIComponent(loc);
                const links = [
                  {
                    label: 'LinkedIn Jobs',
                    href: `https://www.linkedin.com/jobs/search/?keywords=${qEnc}${loc ? `&location=${locEnc}` : ''}`,
                  },
                  {
                    label: 'Wuzzuf',
                    href: `https://wuzzuf.net/search/jobs/?q=${qEnc}`,
                  },
                  {
                    label: 'Glassdoor',
                    href: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${qEnc}`,
                  },
                ];
                return links.map((board) => (
                  <a
                    key={board.label}
                    href={board.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                  >
                    <span>{t('Search on')} {board.label}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && ordered.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t('No openings matched this search')}
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
              kind: 'all',
              sources: [],
              employmentTypes: [],
            };
            setFilters(next);
            void runSearch(next);
          }}
        />
      )}

      {/* Results */}
      {!loading && !error && ordered.length > 0 && (
        <AnimatedList className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ordered.map((item) => {
            const match = scores.get(item.job.id);
            return (
              <div key={item.job.id} className="space-y-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
                  <p className="text-lg font-bold text-[var(--color-primary-text)]">{t('Fit Score')}: {match?.score ?? 0}%</p>
                  <p className="mt-2 text-[11px] font-semibold">{t('Required skills')}: {match?.requiredSkills.matched.join(', ') || t('None')} · {t('Still needed')}: {match?.requiredSkills.missing.join(', ') || t('None')}</p>
                  <p className="text-[11px] font-semibold">{t('Preferred skills')}: {match?.preferredSkills.matched.join(', ') || t('None')} · {t('Still needed')}: {match?.preferredSkills.missing.join(', ') || t('None')}</p>
                  <details className="mt-3 text-[11px]">
                    <summary className="cursor-pointer font-semibold">{t('Why this Match Score?')}</summary>
                    {match?.factors.map((factor) => (
                      <p key={factor.factor} className="mt-2 text-[var(--text-secondary)]">
                        {t(factor.factor === 'requiredSkills' ? 'Required skills' : factor.factor === 'preferredSkills' ? 'Preferred skills' : factor.factor === 'experience' ? 'Experience / seniority' : factor.factor === 'education' ? 'Education' : 'Location / work type')}: {factor.score}% · {factor.weight}% · +{factor.contribution.toFixed(1)} — {factor.reason}
                      </p>
                    ))}
                  </details>
                </div>
                <LiveJobCard
                  item={item}
                  bookmarked={bookmarkedJobIds.includes(item.job.id)}
                  onToggleBookmark={toggleBookmarkJob}
                  onTrackApplication={(entry) => void handleTrackApplication(entry)}
                  onCreateTailoredCv={(entry) => handleCreateTailoredCv(entry)}
                  tracking={trackingId === item.job.id}
                  tailoring={tailoringId === item.job.id}
                  t={t}
                />
              </div>
            );
          })}
        </AnimatedList>
      )}

      {/* The outcome of the last tracked application. */}
      {trackNotice && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            trackNotice.ok
              ? 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
              : 'border-[var(--color-warning)]/30 bg-[var(--surface-secondary)] text-[var(--color-warning)]'
          }`}
        >
          {trackNotice.text}
        </p>
      )}

      {/* The outcome of the last request for a tailored CV. */}
      {tailorNotice && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            tailorNotice.ok
              ? 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
              : 'border-[var(--color-warning)]/30 bg-[var(--surface-secondary)] text-[var(--color-warning)]'
          }`}
        >
          {tailorNotice.text}
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
