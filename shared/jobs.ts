/**
 * Live job vacancies — the contract shared by the server and the browser.
 *
 * The platform distinguishes three kinds of opportunity, and this module is
 * only about the first one:
 *
 *   1. LIVE VACANCIES     — postings returned by the job provider (JSearch),
 *                            which aggregates real postings from public boards.
 *   2. OPPORTUNITY CATALOGUE — the curated volunteering, internships and
 *                            youth programmes the platform publishes itself.
 *   3. LEARNING RESOURCES  — courses, certifications and tutorials.
 *
 * The three are never mixed. A vacancy in this module is a vacancy because the
 * provider said so; the module never invents an employer, a salary, a date or
 * an application link. Every optional field is `null` when the source did not
 * supply it, so the interface can say "not stated" instead of guessing.
 */

import { createSkillLookup, skillNameVariants } from './skillMatching.ts';

/* -------------------------------------------------------------------------- */
/* The shape of a vacancy                                                     */
/* -------------------------------------------------------------------------- */

/** Where the required skills of a vacancy came from. */
export type JobSkillSource = 'publisher' | 'description' | 'none';

/** One live vacancy. */
export interface LiveJob {
  /** The provider's opaque identifier. Stable, and used to save or track it. */
  id: string;
  /** The posted title. */
  title: string;
  /** The employer, exactly as the source stated it. */
  company: string;
  /** The location as the source stated it. */
  location: string | null;
  /** The two-letter country code the source reported, when it reported one. */
  country: string | null;
  /** Whether the source marked the posting as remote. `null` when unknown. */
  isRemote: boolean | null;
  /** For example "FULLTIME", "CONTRACTOR". */
  employmentType: string | null;
  /** When the posting was published, ISO-8601. `null` when the source gave no date. */
  postedAt: string | null;
  /** When the offer expires, ISO-8601. `null` when the source gave no date. */
  expiresAt: string | null;
  /**
   * True when the source stated an expiry that has already passed.
   *
   * Such a posting is shown as expired, never as a current opening.
   */
  expired: boolean;
  /** The description as the source stated it. */
  description: string | null;
  /** The link to the original posting. */
  url: string | null;
  /** The employer's own application link, when the source gave a separate one. */
  applyUrl: string | null;
  /** The board the posting came from, for example "LinkedIn". */
  publisher: string | null;
  /** The skills the posting asked for. */
  requiredSkills: string[];
  /** Where `requiredSkills` came from, so the interface can be precise. */
  skillSource: JobSkillSource;
  /** The experience the posting asked for, when stated. */
  requiredExperience: string | null;
  /** The benefits the posting listed, when stated. */
  benefits: string[];
  /** The salary the posting stated, when stated. */
  salary: string | null;
  /** The minimum education the posting asked for, when stated. */
  minEducation: string | null;
  /** The employer's logo, when the source gave one. */
  logoUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return null;
}

/** Reads a date the provider may have sent as a string or as epoch millis. */
function asIsoDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // The provider reports seconds for some fields and millis for others.
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const text = asText(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * The location the provider reported.
 *
 * JSearch splits the location across `job_city`, `job_state` and `job_country`
 * and also offers a combined `job_location`. The combined value wins; the parts
 * are joined only when the source did not give a combined value.
 */
function readLocation(raw: Record<string, unknown>): string | null {
  const combined = asText(raw.job_location);
  if (combined) return combined;
  const parts = [asText(raw.job_city), asText(raw.job_state)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length ? parts.join(', ') : null;
}

/**
 * Turns one provider record into a vacancy.
 *
 * Returns `null` when the record cannot be shown honestly — a vacancy needs at
 * least an identifier, a title and an employer. A record without them is
 * dropped rather than completed with placeholders.
 */
export function normalizeLiveJob(raw: unknown, now: Date = new Date()): LiveJob | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = asText(record.job_id) ?? asText(record.id);
  const title = asText(record.job_title) ?? asText(record.title);
  const company = asText(record.employer_name) ?? asText(record.company_name);

  if (!id || !title || !company) return null;

  const expiresAt = asIsoDate(record.job_offer_expiration_datetime) ?? asIsoDate(record.job_expiration_date);
  const postedAt = asIsoDate(record.job_posted_at_datetime) ?? asIsoDate(record.job_posted_at);

  const publishedSkills = asStringList(record.job_required_skills);

  return {
    id,
    title,
    company,
    location: readLocation(record),
    country: asText(record.job_country)?.toLowerCase() ?? null,
    isRemote: asBoolean(record.job_is_remote) ?? asBoolean(record.is_remote),
    employmentType: asText(record.job_employment_type) ?? asText(record.employment_type),
    postedAt,
    expiresAt,
    expired: expiresAt ? new Date(expiresAt).getTime() < now.getTime() : false,
    description: asText(record.job_description) ?? asText(record.description),
    url: asText(record.job_url) ?? asText(record.job_offer_url),
    applyUrl: asText(record.job_apply_link) ?? asText(record.job_apply_url),
    publisher: asText(record.job_publisher) ?? asText(record.publisher),
    requiredSkills: publishedSkills,
    skillSource: publishedSkills.length ? 'publisher' : 'none',
    requiredExperience: asText(record.job_required_experience) ?? asText(record.required_experience),
    benefits: asStringList(record.job_benefits),
    salary: asText(record.job_salary) ?? asText(record.salary),
    minEducation: asText(record.job_min_education) ?? asText(record.job_education),
    logoUrl: asText(record.job_company_logo) ?? asText(record.employer_logo),
  };
}

/**
 * Removes repeated vacancies.
 *
 * The provider aggregates several boards, so the same posting can arrive more
 * than once: once under its provider id and once under a different board's id.
 * A posting is therefore identified by its id, and failing that by the
 * combination of title, employer and location.
 */
export function dedupeLiveJobs(jobs: LiveJob[]): LiveJob[] {
  const byId = new Set<string>();
  const byFingerprint = new Set<string>();
  const result: LiveJob[] = [];

  for (const job of jobs) {
    if (byId.has(job.id)) continue;
    const fingerprint = [job.title, job.company, job.location ?? '']
      .map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim())
      .join('|');
    if (fingerprint !== '||' && byFingerprint.has(fingerprint)) continue;

    byId.add(job.id);
    if (fingerprint !== '||') byFingerprint.add(fingerprint);
    result.push(job);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Matching a vacancy against the candidate's own record                        */
/* -------------------------------------------------------------------------- */

/** How well a vacancy fits what the candidate's record actually shows. */
export interface JobSkillMatch {
  /** The vacancy's skills the candidate's record already supports. */
  matched: string[];
  /** The vacancy's skills the candidate's record does not show. */
  missing: string[];
  /**
   * The fit, 0-100.
   *
   * `null` when the comparison could not be made — the posting listed no
   * skills. A missing score is honest; a made-up one is not.
   */
  score: number | null;
}

/**
 * Compares a vacancy's skills with the skills the candidate's record shows.
 *
 * `catalogueSkills` lets the caller extract skills the publisher did not list
 * but the posting mentions. Only names that occur verbatim in the posting are
 * used, so nothing is inferred that the posting does not actually say.
 */
export function matchJobToSkills(
  job: LiveJob,
  candidateSkills: Iterable<string>,
  catalogueSkills: Iterable<string> = []
): JobSkillMatch {
  const candidateLookup = createSkillLookup(candidateSkills);

  let required = job.requiredSkills;
  let source: JobSkillSource = job.skillSource;

  if (required.length === 0) {
    // The publisher listed no skills. Look in the posting itself, but only for
    // names the platform's own catalogue already knows, written verbatim.
    const description = job.description ?? '';
    if (description) {
      const haystack = description.toLowerCase();
      const found: string[] = [];
      for (const name of new Set(catalogueSkills)) {
        if (!name || name.length < 3) continue;
        for (const variant of skillNameVariants(name)) {
          if (variant.length < 3) continue;
          if (haystack.includes(variant.toLowerCase())) {
            found.push(name);
            break;
          }
        }
      }
      if (found.length) {
        required = found;
        source = 'description';
      }
    }
  }

  if (!required.length) {
    return { matched: [], missing: [], score: null };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of required) {
    if (candidateLookup.has(skill)) matched.push(skill);
    else missing.push(skill);
  }

  const score = Math.round((matched.length / required.length) * 100);
  // Keep the provenance honest even when the caller only changed the list.
  if (source !== job.skillSource) job.skillSource = source;

  return { matched, missing, score };
}

/* -------------------------------------------------------------------------- */
/* Search parameters                                                           */
/* -------------------------------------------------------------------------- */

/** How recent a posting has to be. Mirrors the provider's own vocabulary. */
export const JOB_DATE_POSTED_OPTIONS = ['all', 'today', '3days', 'week', 'month'] as const;
export type JobDatePosted = (typeof JOB_DATE_POSTED_OPTIONS)[number];

/** The employment types the provider understands. */
export const JOB_EMPLOYMENT_TYPES = [
  'FULLTIME',
  'CONTRACTOR',
  'PARTTIME',
  'INTERN',
] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

/** The experience levels the provider understands. */
export const JOB_REQUIREMENTS = [
  'under_3_years_experience',
  'more_than_3_years_experience',
  'no_experience',
  'no_degree',
] as const;
export type JobRequirement = (typeof JOB_REQUIREMENTS)[number];

/** The countries the product can search. Egypt comes first. */
export const JOB_COUNTRIES = ['eg', 'sa', 'ae', 'qa', 'kw', 'bh', 'om', 'jo', 'gb', 'de', 'us'] as const;
export type JobCountry = (typeof JOB_COUNTRIES)[number];

/** The parameters one search accepts, after validation. */
export interface JobSearchQuery {
  /** The free-form query. Never empty. */
  query: string;
  /** The location, as free text. */
  location: string | null;
  /** The country the postings come from. Egypt by default. */
  country: string;
  /** The language of the postings. */
  language: string | null;
  /** How recent a posting has to be. */
  datePosted: JobDatePosted;
  /** Only postings marked as remote. */
  remoteOnly: boolean;
  /** The employment types, when the caller narrowed them. */
  employmentTypes: JobEmploymentType[];
  /** The experience requirements, when the caller narrowed them. */
  requirements: JobRequirement[];
  /** Which page to fetch. */
  page: number;
  /** How many pages to fetch at once. */
  numPages: number;
}

/** The defaults the product ships with: Egypt, and anything that is recent. */
export const DEFAULT_JOB_COUNTRY = 'eg';
export const DEFAULT_JOB_DATE_POSTED: JobDatePosted = 'week';

/** The longest query the provider accepts. Longer input is truncated. */
export const MAX_JOB_QUERY_LENGTH = 200;

/**
 * Validates and normalises raw query parameters.
 *
 * Every value is checked against the provider's own vocabulary, so a hostile or
 * accidental parameter cannot reach the upstream call in a shape it does not
 * accept. Unknown values fall back to the default rather than being forwarded.
 */
export function buildJobSearchQuery(params: Record<string, unknown>): JobSearchQuery {
  const rawQuery = typeof params.query === 'string' ? params.query : '';
  const rawLocation = typeof params.location === 'string' ? params.location : '';

  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, MAX_JOB_QUERY_LENGTH);
  const location = rawLocation.replace(/\s+/g, ' ').trim().slice(0, MAX_JOB_QUERY_LENGTH);

  const datePostedRaw = String(params.datePosted ?? '').trim();
  const datePosted = (JOB_DATE_POSTED_OPTIONS as readonly string[]).includes(datePostedRaw)
    ? (datePostedRaw as JobDatePosted)
    : DEFAULT_JOB_DATE_POSTED;

  const countryRaw = String(params.country ?? '').trim().toLowerCase();
  const country = /^[a-z]{2}$/.test(countryRaw) ? countryRaw : DEFAULT_JOB_COUNTRY;

  const languageRaw = String(params.language ?? '').trim().toLowerCase();
  const language = /^[a-z]{2}$/.test(languageRaw) ? languageRaw : null;

  const page = clampInt(params.page, 1, 1, 20);
  const numPages = clampInt(params.numPages, 1, 1, 2);

  return {
    query: query || 'jobs in Egypt',
    location: location || null,
    country,
    language,
    datePosted,
    remoteOnly: params.remoteOnly === true || params.remoteOnly === 'true',
    employmentTypes: readEnumList(params.employmentTypes, JOB_EMPLOYMENT_TYPES),
    requirements: readEnumList(params.requirements, JOB_REQUIREMENTS),
    page,
    numPages,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] {
  if (!value) return [];
  const parts = (Array.isArray(value) ? value : String(value).split(','))
    .map((entry) => String(entry).trim().toUpperCase())
    .filter(Boolean);
  const result: T[] = [];
  for (const part of parts) {
    const match = allowed.find((entry) => entry.toUpperCase() === part);
    if (match && !result.includes(match)) result.push(match);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Source attribution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The attribution the interface shows for every vacancy.
 *
 * The postings are not the platform's own. They come from an aggregate of
 * public boards, and the interface says so and keeps the original link.
 */
export const JOB_SOURCE_LABEL = 'Live vacancies via JSearch (aggregated from public job boards)';
export const JOB_SOURCE_ATTRIBUTION = 'JSearch';

/** The countries the platform opens with, for the location picker. */
export const JOB_LOCATION_SUGGESTIONS: Array<{ label: string; value: string; country: string }> = [
  { label: 'Cairo, Egypt', value: 'Cairo', country: 'eg' },
  { label: 'Alexandria, Egypt', value: 'Alexandria', country: 'eg' },
  { label: 'Giza, Egypt', value: 'Giza', country: 'eg' },
  { label: 'Riyadh, Saudi Arabia', value: 'Riyadh', country: 'sa' },
  { label: 'Dubai, United Arab Emirates', value: 'Dubai', country: 'ae' },
  { label: 'Doha, Qatar', value: 'Doha', country: 'qa' },
  { label: 'Kuwait City, Kuwait', value: 'Kuwait City', country: 'kw' },
  { label: 'Manama, Bahrain', value: 'Manama', country: 'bh' },
  { label: 'Muscat, Oman', value: 'Muscat', country: 'om' },
  { label: 'Amman, Jordan', value: 'Amman', country: 'jo' },
];

/**
 * The country names the screen offers, ordered for an Egypt-first product.
 *
 * These are display labels only — the provider is always given the two-letter
 * code. The interface translates them, so the Arabic screen never shows an
 * English country name next to an Arabic label.
 */
export const JOB_COUNTRY_LABELS: Record<string, string> = {
  eg: 'Egypt',
  sa: 'Saudi Arabia',
  ae: 'United Arab Emirates',
  qa: 'Qatar',
  kw: 'Kuwait',
  bh: 'Bahrain',
  om: 'Oman',
  jo: 'Jordan',
  gb: 'United Kingdom',
  de: 'Germany',
  us: 'United States',
};
