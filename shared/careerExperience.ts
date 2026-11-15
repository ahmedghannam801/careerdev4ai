/**
 * Career experiences — the shared vocabulary for the Career Experience Hub.
 *
 * A "career experience" is an official, self-paced virtual job simulation that
 * a candidate can complete outside the platform. The platform curates the
 * catalogue, records the candidate's own progress and stores the certificate
 * link they submit. It never claims that the completion or the certificate was
 * verified unless a trusted mechanism actually verified it.
 *
 * This module is imported by BOTH the React frontend and the API, so it must
 * stay free of any DOM or Node-only dependency.
 */

import type { CareerDomainId } from './careerDomains.ts';

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The provider that publishes the simulation.
 *
 * Only Forage is registered today. The interface is a registry rather than a
 * hard-coded string so an official API or a second provider can be added
 * without changing the database shape: the existing rows keep their own
 * `provider` value and the catalogue remains readable.
 */
export interface ExperienceProvider {
  id: 'forage';
  /** The name stored on the catalogue row and shown in the interface. */
  name: string;
  website: string;
  /** The host whose simulation pages are the official source. */
  hosts: string[];
  /** The path prefix an official simulation page uses. */
  pathPrefix: string;
  /** The bilingual label for the provider badge. */
  label: { en: string; ar: string };
}

export const EXPERIENCE_PROVIDERS: Record<ExperienceProvider['id'], ExperienceProvider> = {
  forage: {
    id: 'forage',
    name: 'Forage',
    website: 'https://www.theforage.com',
    hosts: ['www.theforage.com', 'theforage.com'],
    pathPrefix: '/simulations/',
    label: { en: 'Forage', ar: 'فورج' },
  },
};

export type ExperienceProviderId = ExperienceProvider['id'];

/** The provider a URL belongs to, or null when it is not an official page. */
export function providerForSimulationUrl(url: string | null | undefined): ExperienceProvider | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  for (const provider of Object.values(EXPERIENCE_PROVIDERS)) {
    if (!provider.hosts.includes(parsed.hostname)) continue;
    if (!parsed.pathname.startsWith(provider.pathPrefix)) continue;
    // `/simulations/<company>/<slug>`: both segments must be present, so a
    // catalogue page or a bare prefix is never treated as a simulation.
    const rest = parsed.pathname.slice(provider.pathPrefix.length).split('/').filter(Boolean);
    if (rest.length >= 2) return provider;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export const EXPERIENCE_DIFFICULTIES = ['introductory', 'intermediate', 'advanced'] as const;
export type ExperienceDifficulty = (typeof EXPERIENCE_DIFFICULTIES)[number];

export const EXPERIENCE_DIFFICULTY_LABELS: Record<
  ExperienceDifficulty,
  { en: string; ar: string }
> = {
  introductory: { en: 'Introductory', ar: 'تمهيدي' },
  intermediate: { en: 'Intermediate', ar: 'متوسط' },
  advanced: { en: 'Advanced', ar: 'متقدم' },
};

export const EXPERIENCE_PROGRESS_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type ExperienceProgressStatus = (typeof EXPERIENCE_PROGRESS_STATUSES)[number];

export const EXPERIENCE_STATUS_LABELS: Record<
  ExperienceProgressStatus,
  { en: string; ar: string }
> = {
  not_started: { en: 'Not started', ar: 'لم يبدأ' },
  in_progress: { en: 'In progress', ar: 'قيد التقدم' },
  completed: { en: 'Completed', ar: 'مكتمل' },
};

/**
 * Certificate provenance.
 *
 * `self_reported` is the only state a candidate can write: they completed the
 * simulation and pasted the link they received. `pending` and `verified` are
 * reserved for a trusted review — no interface may describe a self-reported
 * certificate as verified.
 */
export const EXPERIENCE_CERTIFICATE_STATUSES = [
  'self_reported',
  'pending',
  'verified',
] as const;
export type ExperienceCertificateStatus = (typeof EXPERIENCE_CERTIFICATE_STATUSES)[number];

export const EXPERIENCE_CERTIFICATE_LABELS: Record<
  ExperienceCertificateStatus,
  { en: string; ar: string }
> = {
  self_reported: { en: 'Self-reported', ar: 'مُبلّغ عنها ذاتياً' },
  pending: { en: 'Pending review', ar: 'بانتظار المراجعة' },
  verified: { en: 'Verified', ar: 'موثّقة' },
};

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

export interface CareerExperienceSkill {
  name: string;
  /** 1–5, curated: how central the skill is to the simulation. */
  importance: number;
}

export interface CareerExperienceRole {
  roleSlug: string;
  /** 1–100, curated relevance to the role. */
  relevanceScore: number;
}

export interface CareerExperience {
  id: string;
  title: string;
  provider: string;
  providerUrl: string | null;
  description: string;
  category: string;
  difficulty: ExperienceDifficulty;
  /** The midpoint of the provider's published time guidance, for filtering. */
  durationHours: number | null;
  /** The provider's own time guidance, shown verbatim. */
  durationLabel: string | null;
  url: string;
  domainIds: CareerDomainId[];
  skills: CareerExperienceSkill[];
  roles: CareerExperienceRole[];
  isActive: boolean;
  /** A curated placement, never inferred from a score. */
  isFeatured: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExperienceProgress {
  experienceId: string;
  status: ExperienceProgressStatus;
  saved: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ExperienceCertificate {
  id: string;
  experienceId: string;
  certificateUrl: string;
  /** The candidate's own submission unless a trusted review changed it. */
  status: ExperienceCertificateStatus;
  submittedAt: string;
  verifiedAt: string | null;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* URL rules                                                                  */
/* -------------------------------------------------------------------------- */

export interface UrlValidation {
  ok: boolean;
  value: string | null;
  error: string | null;
}

/**
 * A safe external link: HTTPS, a real host, no embedded credentials.
 *
 * The certificate URL and the simulation URL are rendered as links, so the
 * check is repeated in the interface rather than trusted from the server.
 */
export function isSafeExternalUrl(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname.includes('.')) return false;
  return true;
}

/**
 * Reads a certificate link out of untrusted input.
 *
 * A certificate is a credential, so the rule is strict: an absolute HTTPS URL
 * with a host and no credentials. Anything else is refused with a message the
 * candidate can act on.
 */
export function normalizeCertificateUrl(value: unknown): UrlValidation {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, value: null, error: 'Enter the certificate link.' };
  }
  const trimmed = value.trim();
  if (trimmed.length > 2048) {
    return { ok: false, value: null, error: 'The certificate link is too long.' };
  }
  if (!isSafeExternalUrl(trimmed)) {
    return {
      ok: false,
      value: null,
      error: 'Enter a secure HTTPS link to the certificate.',
    };
  }
  return { ok: true, value: trimmed, error: null };
}

/** True when the value is a difficulty the catalogue understands. */
export function isExperienceDifficulty(value: unknown): value is ExperienceDifficulty {
  return (
    typeof value === 'string' &&
    (EXPERIENCE_DIFFICULTIES as readonly string[]).includes(value)
  );
}

/** True when the value is a progress status the catalogue understands. */
export function isExperienceProgressStatus(
  value: unknown
): value is ExperienceProgressStatus {
  return (
    typeof value === 'string' &&
    (EXPERIENCE_PROGRESS_STATUSES as readonly string[]).includes(value)
  );
}
