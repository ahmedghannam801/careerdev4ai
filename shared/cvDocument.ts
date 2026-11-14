/**
 * Turning the platform's records into a CV document.
 *
 * The studio could only ever show a document the user had imported or typed
 * by hand. Everything the platform already knew about them — their rated
 * skills, their experience, their projects, their volunteering, the courses
 * they finished, their certificates — was orphaned from the CV.
 *
 * This module maps that data onto the document the editor works with. It is
 * shared by the client and the server so the two can never disagree about
 * what a document section means, and it is deliberately one-directional:
 *
 *   - it never invents a value. A field the user has not supplied stays
 *     empty, and the studio says so rather than filling the gap;
 *   - it never invents a metric. The candidate's own words are carried
 *     across as they were written;
 *   - it keeps the ids, so every entry can be traced back to the record it
 *     came from — which is what lets the assistant ground its writing.
 */

import type { CVProfile, CVLink } from '../src/types/career.ts';

import {
  canonicalizeSkills,
  dedupeSummaryParagraphs,
  dropEmptyExperience,
  mergeEducationRecords,
} from './cvCanonical.ts';
import { dedupeCertifications, dedupeExperience, dedupeProjects } from './cvDedupe.ts';

/** The shape the platform's records arrive in. */
export interface CvSourceProfile {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  title?: string | null;
  summary?: string | null;
}

export interface CvSourceExperience {
  id: string;
  role: string;
  company: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
  bullets?: string[];
}

export interface CvSourceEducation {
  id: string;
  institution: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
}

export interface CvSourceProject {
  id: string;
  title: string;
  role?: string | null;
  link?: string | null;
  technologies?: string[];
  skills?: string[];
  bullets?: string[];
  description?: string | null;
}

export interface CvSourceVolunteering {
  id: string;
  organization: string;
  role: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
  achievements?: string[];
  responsibilities?: string[];
}

export interface CvSourceCertification {
  id: string;
  name: string;
  issuer?: string | null;
  issueDate?: string | null;
  description?: string | null;
  expiryDate?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
  /** The skills and tools the certificate produced. */
  skills?: string[];
}

export interface CvSourceCourse {
  id: string;
  title: string;
  provider: string;
  description?: string | null;
}

export interface CvSourceSkill {
  name: string;
  level: number;
}

export interface CvSourceLink {
  id: string;
  kind: string;
  label?: string | null;
  url: string;
}

/** Everything the platform knows about the user, ready to become a document. */
export interface CvSourceData {
  profile?: CvSourceProfile | null;
  experiences?: CvSourceExperience[];
  education?: CvSourceEducation[];
  projects?: CvSourceProject[];
  volunteering?: CvSourceVolunteering[];
  certifications?: CvSourceCertification[];
  courses?: CvSourceCourse[];
  skills?: CvSourceSkill[];
  links?: CvSourceLink[];
}

/** The kinds of link a CV can carry. */
export const CV_LINK_KINDS: readonly string[] = [
  'linkedin',
  'github',
  'portfolio',
  'behance',
  'dribbble',
  'kaggle',
  'medium',
  'personalWebsite',
  'other',
];

/**
 * The label shown for a link kind.
 *
 * A kind the application does not know is still shown — the user named it,
 * so hiding it would lose something they supplied — but it is labelled with
 * the kind itself rather than guessed at.
 */
export function cvLinkLabel(kind: string, fallback?: string | null): string {
  const trimmed = fallback?.trim();
  if (trimmed) return trimmed;
  switch (kind) {
    case 'linkedin':
      return 'LinkedIn';
    case 'github':
      return 'GitHub';
    case 'portfolio':
      return 'Portfolio';
    case 'behance':
      return 'Behance';
    case 'dribbble':
      return 'Dribbble';
    case 'kaggle':
      return 'Kaggle';
    case 'medium':
      return 'Medium';
    case 'personalWebsite':
      return 'Website';
    default:
      return 'Link';
  }
}

/**
 * Formats a start/end pair for a CV line.
 *
 * A current role says "Present"; a role with no recorded end date says
 * nothing rather than guessing one.
 */
export function formatCvPeriod(
  startDate?: string | null,
  endDate?: string | null,
  isCurrent?: boolean
): string {
  const start = startDate ? formatCvDate(startDate) : '';
  const end = isCurrent ? 'Present' : endDate ? formatCvDate(endDate) : '';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

/** Formats an ISO date as "Mon YYYY". */
function formatCvDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * Splits a free-text description into bullet points.
 *
 * A description the user wrote as a paragraph becomes one bullet, because
 * splitting it on sentences would invent a structure they did not choose.
 * New lines, on the other hand, are a structure they did choose.
 */
export function descriptionToBullets(description?: string | null): string[] {
  if (!description || !description.trim()) return [];
  const lines = description
    .split('\n')
    .map((line) => line.replace(/^[-•*\s]+/, '').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [description.trim()];
}

/**
 * Whether a value is worth putting on a CV.
 *
 * A field of study recorded as a full stop is a typo in the profile, not a
 * subject. Rendering it would put "B.Sc in ." on the document, which reads
 * as an error the candidate did not make.
 */
function isMeaningfulCvValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return /[a-z]/i.test(value);
}

/**
 * Builds the CV document from the platform's records.
 *
 * An existing document is merged rather than replaced, so a user who has
 * already written a summary keeps it: this fills in what is missing and
 * leaves everything they wrote alone.
 *
 * "Leaves it alone" is per field, not per section. A candidate who wrote
 * three bullets for a role keeps those three bullets, and the record's own
 * description is not added on top of them — that would read as two versions
 * of the same work. Where the candidate wrote nothing, the record's text is
 * used.
 */
export function buildCvDocument(source: CvSourceData, existing?: Partial<CVProfile>): CVProfile {
  const profile = source.profile ?? {};

  /**
   * The records are canonicalised before they are written.
   *
   * A candidate describes the same degree in two slightly different ways,
   * rates the same skill under two names, and leaves an empty row in their
   * experience by mistake. Writing those straight onto the CV produces the
   * unreadable list the QA audit found. The canonical module folds the
   * duplicates together and drops the rows that say nothing — without
   * discarding a word the candidate actually wrote.
   */
  const experiences = dedupeExperience(dropEmptyExperience(source.experiences ?? []));
  const education = mergeEducationRecords(source.education ?? []);
  const projects = dedupeProjects(source.projects ?? []);
  const volunteering = source.volunteering ?? [];
  const certifications = dedupeCertifications(source.certifications ?? []);
  const courses = source.courses ?? [];
  const skills = source.skills ?? [];
  const links = source.links ?? [];

  /**
   * The summary, with a paragraph that repeats another one removed.
   *
   * The candidate's own summary is kept — it is folded rather than replaced,
   * so a summary they wrote by hand survives the merge.
   */
  const summary = dedupeSummaryParagraphs(
    existing?.summary?.trim() || profile.summary?.trim() || ''
  );

  const previousLinks = existing?.links ?? [];
  const previousLinkIds = new Set(previousLinks.map((link) => link.id));

  const documentLinks: CVLink[] = links.map((link) => ({
    id: link.id,
    kind: link.kind,
    label: cvLinkLabel(link.kind, link.label),
    url: link.url,
    // A link the user has already chosen for this CV keeps that choice; a
    // link they have not seen before is shown.
    enabled: previousLinkIds.has(link.id)
      ? previousLinks.find((entry) => entry.id === link.id)?.enabled ?? true
      : true,
  }));

  // What the candidate has already written, keyed by the record it belongs
  // to. The merge is per field, so their own wording for one role is kept
  // while the rest of the document is still filled from the records.
  const previousExperiences = new Map((existing?.experiences ?? []).map((entry) => [entry.id, entry]));
  const previousEducation = new Map((existing?.education ?? []).map((entry) => [entry.id, entry]));
  const previousProjects = new Map((existing?.projects ?? []).map((entry) => [entry.id, entry]));
  const previousVolunteering = new Map(
    (existing?.volunteering ?? []).map((entry) => [entry.id, entry])
  );
  const previousCourses = new Map((existing?.courses ?? []).map((entry) => [entry.id, entry]));
  const previousCertifications = existing?.certificationDetails ?? [];

  return {
    fullName: existing?.fullName?.trim() || profile.fullName?.trim() || '',
    email: existing?.email?.trim() || profile.email?.trim() || '',
    phone: existing?.phone?.trim() || profile.phone?.trim() || '',
    location: existing?.location?.trim() || profile.location?.trim() || '',
    title: existing?.title?.trim() || profile.title?.trim() || '',
    summary,

    experiences: experiences.map((entry) => {
      const previous = previousExperiences.get(entry.id);
      return {
        id: entry.id,
        company: entry.company,
        role: entry.role,
        period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
        location: entry.location ?? '',
        bullets:
          previous?.bullets?.length
            ? previous.bullets
            : entry.bullets?.length
              ? entry.bullets
              : descriptionToBullets(entry.description),
        startDate: entry.startDate ?? undefined,
        endDate: entry.endDate ?? undefined,
        isCurrent: entry.isCurrent,
      };
    }),

    education: education.map((entry) => {
      const previous = previousEducation.get(entry.id);
      return {
        id: entry.id,
        // The institution never repeats its own name inside itself.
        institution: entry.institution ?? '',
        degree: entry.degree ?? '',
        field: isMeaningfulCvValue(entry.field) ? entry.field! : '',
        period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
        startDate: entry.startDate ?? undefined,
        endDate: entry.endDate ?? undefined,
        current: entry.isCurrent,
        description: previous?.description ?? entry.description ?? '',
      };
    }),

    projects: projects.map((entry) => {
      const previous = previousProjects.get(entry.id);
      return {
        id: entry.id,
        title: entry.title,
        role: entry.role ?? '',
        link: entry.link ?? undefined,
        technologies: entry.technologies?.length ? entry.technologies : entry.skills ?? [],
        bullets:
          previous?.bullets?.length
            ? previous.bullets
            : entry.bullets?.length
              ? entry.bullets
              : descriptionToBullets(entry.description),
        description: previous?.description ?? entry.description ?? '',
      };
    }),

    /**
     * The skills, canonicalised.
     *
     * "SQL" and "SQL Fundamentals" become one "SQL", with the specific
     * wording kept beside it as a specialisation, so the candidate can see
     * exactly what was folded in and edit it if they disagree.
     */
    skillsList: canonicalizeSkills(skills).map((skill) =>
      skill.specializations.length > 0
        ? `${skill.name} (${skill.specializations.join(', ')})`
        : skill.name
    ),

    certifications: certifications.map((entry) => entry.name),
    certificationDetails: certifications.map((entry, index) => {
      const previous = previousCertifications[index];
      return {
        id: entry.id,
        name: entry.name,
        issuer: entry.issuer ?? '',
        issueDate: entry.issueDate ?? '',
        // The wording is the candidate's own, so a description they wrote on
        // this CV survives; the record fills the gap when they wrote none.
        description: previous?.description ?? entry.description ?? '',
        expiryDate: entry.expiryDate ?? previous?.expiryDate,
        credentialId: entry.credentialId ?? previous?.credentialId,
        credentialUrl: entry.credentialUrl ?? previous?.credentialUrl,
        skills: entry.skills?.length ? entry.skills : (previous?.skills ?? []),
      };
    }),

    links: documentLinks,

    volunteering: volunteering.map((entry) => {
      const previous = previousVolunteering.get(entry.id);
      return {
        id: entry.id,
        organization: entry.organization,
        role: entry.role,
        period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
        location: entry.location ?? '',
        description: previous?.description ?? entry.description ?? '',
        bullets:
          previous?.bullets?.length
            ? previous.bullets
            : entry.achievements?.length
              ? entry.achievements
              : entry.responsibilities?.length
                ? entry.responsibilities
                : descriptionToBullets(entry.description),
      };
    }),

    courses: courses.map((entry) => {
      const previous = previousCourses.get(entry.id);
      return {
        id: entry.id,
        title: entry.title,
        provider: entry.provider,
        description: previous?.description ?? entry.description ?? '',
      };
    }),

    // The sections the platform has no record type for are the document's
    // own. An existing document keeps them; a new one has none yet.
    internships: existing?.internships ?? [],
    languages: existing?.languages ?? [],
    awards: existing?.awards ?? [],
    publications: existing?.publications ?? [],
    research: existing?.research ?? [],
    leadership: existing?.leadership ?? [],
  };
}
