/**
 * The document model shared by the on-screen preview and the DOCX export.
 *
 * The preview and the exported file must not be two different documents. Both
 * are built from this model, so a section that appears on the paper appears in
 * the file, in the same order, with the same wording. Nothing is invented
 * here: a field the candidate left empty produces no section, and a section
 * with no content is omitted rather than printed as a heading over white
 * space.
 */

import type { CVProfile } from '../src/types/career.ts';
import {
  DEFAULT_CV_SECTION_ORDER,
  type CvSectionKey,
} from './cvTemplates.ts';
import {
  isResumeRtl,
  resumeDirection,
  resumeSectionHeading,
  type ResumeDirection,
  type ResumeLanguage,
} from './resumeLanguage.ts';

export interface CvDocumentLink {
  label: string;
  url: string;
}

export interface CvDocumentEntry {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  location?: string;
  description?: string;
  bullets: string[];
  tags: string[];
  url?: string;
}

export type CvDocumentSectionKind = 'text' | 'entries' | 'inline';

export interface CvDocumentSection {
  key: CvSectionKey;
  heading: string;
  kind: CvDocumentSectionKind;
  text?: string;
  inline?: string[];
  entries: CvDocumentEntry[];
}

export interface CvDocument {
  fullName: string;
  title: string;
  contact: string[];
  links: CvDocumentLink[];
  sections: CvDocumentSection[];
  language: ResumeLanguage;
  direction: ResumeDirection;
  rtl: boolean;
}

const hasText = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Joins the parts of a title without leaving a stray separator. */
function joinParts(parts: Array<string | null | undefined>, separator = ' — '): string {
  return parts.filter(hasText).join(separator);
}

function section(
  key: CvSectionKey,
  language: ResumeLanguage,
  content: Omit<CvDocumentSection, 'key' | 'heading'>
): CvDocumentSection {
  return {
    key,
    heading: resumeSectionHeading(language, key),
    ...content,
  };
}

function entriesSection(
  key: CvSectionKey,
  language: ResumeLanguage,
  entries: CvDocumentEntry[]
): CvDocumentSection {
  return section(key, language, { kind: 'entries', entries });
}

/**
 * Builds the document from the candidate's CV.
 *
 * The section order here is the canonical order. A template reorders the
 * sections it shows, but the content of each one is decided once, here, so a
 * template cannot accidentally drop a field.
 */
export function buildCvTemplateDocument(
  cv: CVProfile,
  language: ResumeLanguage = 'en'
): CvDocument {
  const hiddenSkills = new Set((cv.hiddenSkills ?? []).map((skill) => skill.toLowerCase()));
  const skills = (cv.skillsList ?? []).filter(
    (skill) => skill.trim() && !hiddenSkills.has(skill.trim().toLowerCase())
  );

  const links: CvDocumentLink[] = (cv.links ?? [])
    .filter((link) => link.enabled && link.url.trim())
    .map((link) => ({ label: link.label?.trim() || link.url.trim(), url: link.url.trim() }));

  const sections: CvDocumentSection[] = [];

  if (hasText(cv.summary)) {
    sections.push(
      section('summary', language, {
        kind: 'text',
        text: cv.summary.trim(),
        entries: [],
      })
    );
  }

  if ((cv.experiences ?? []).length > 0) {
    sections.push(
      entriesSection(
        'experience',
        language,
        cv.experiences.map((entry) => ({
          id: entry.id,
          title: entry.role,
          subtitle: entry.company,
          meta: entry.period,
          location: entry.location,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: [],
        }))
      )
    );
  }

  if ((cv.projects ?? []).length > 0) {
    sections.push(
      entriesSection(
        'projects',
        language,
        cv.projects.map((entry) => ({
          id: entry.id,
          title: entry.title,
          subtitle: entry.role,
          description: entry.description,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: (entry.technologies ?? []).filter(hasText),
          url: entry.link,
        }))
      )
    );
  }

  if ((cv.education ?? []).length > 0) {
    sections.push(
      entriesSection(
        'education',
        language,
        cv.education.map((entry) => {
          // A field of study recorded as a full stop is a typo in the profile,
          // not a subject. "B.Sc in ." must never reach the document.
          const field = /[a-z]/i.test(entry.field ?? '') ? entry.field : '';
          const qualification = joinParts([entry.degree, field], ' in ');
          return {
            id: entry.id,
            title: qualification || entry.institution,
            subtitle: qualification ? entry.institution : undefined,
            meta: entry.period,
            description: entry.description,
            bullets: [],
            tags: entry.gpa ? [`GPA ${entry.gpa}`] : [],
          };
        })
      )
    );
  }

  if (skills.length > 0) {
    sections.push(
      section('skills', language, {
        kind: 'inline',
        inline: skills,
        entries: [],
      })
    );
  }

  const certificationEntries: CvDocumentEntry[] = [];
  for (const [index, entry] of (cv.certificationDetails ?? []).entries()) {
    if (!hasText(entry.name)) continue;
    certificationEntries.push({
      id: entry.id ?? `cert-${index}`,
      title: entry.name,
      subtitle: entry.issuer,
      meta: entry.issueDate,
      description: entry.description,
      bullets: [],
      tags: (entry.skills ?? []).filter(hasText),
      url: entry.credentialUrl,
    });
  }
  // Older CV snapshots carry only the names. They are still certificates the
  // candidate holds, so they are shown rather than silently dropped.
  for (const [index, name] of (cv.certifications ?? []).entries()) {
    if (!hasText(name)) continue;
    if (certificationEntries.some((entry) => entry.title.toLowerCase() === name.toLowerCase())) {
      continue;
    }
    certificationEntries.push({
      id: `cert-name-${index}`,
      title: name,
      bullets: [],
      tags: [],
    });
  }
  if (certificationEntries.length > 0) {
    sections.push(entriesSection('certifications', language, certificationEntries));
  }

  if ((cv.courses ?? []).length > 0) {
    sections.push(
      entriesSection(
        'courses',
        language,
        (cv.courses ?? []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          subtitle: entry.provider,
          description: entry.description,
          bullets: [],
          tags: [],
        }))
      )
    );
  }

  if ((cv.internships ?? []).length > 0) {
    sections.push(
      entriesSection(
        'internships',
        language,
        (cv.internships ?? []).map((entry) => ({
          id: entry.id,
          title: entry.role,
          subtitle: entry.organization,
          meta: entry.period,
          location: entry.location,
          description: entry.description,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: [],
        }))
      )
    );
  }

  if ((cv.volunteering ?? []).length > 0) {
    sections.push(
      entriesSection(
        'volunteering',
        language,
        (cv.volunteering ?? []).map((entry) => ({
          id: entry.id,
          title: entry.role,
          subtitle: entry.organization,
          meta: entry.period,
          location: entry.location,
          description: entry.description,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: [],
        }))
      )
    );
  }

  if ((cv.languages ?? []).length > 0) {
    sections.push(
      section('languages', language, {
        kind: 'inline',
        inline: (cv.languages ?? [])
          .filter((entry) => hasText(entry.name))
          .map((entry) =>
            hasText(entry.level) ? `${entry.name.trim()} (${entry.level.trim()})` : entry.name.trim()
          ),
        entries: [],
      })
    );
  }

  if ((cv.awards ?? []).length > 0) {
    sections.push(
      entriesSection(
        'awards',
        language,
        (cv.awards ?? []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          subtitle: entry.issuer,
          meta: entry.date,
          description: entry.description,
          bullets: [],
          tags: [],
        }))
      )
    );
  }

  if ((cv.publications ?? []).length > 0) {
    sections.push(
      entriesSection(
        'publications',
        language,
        (cv.publications ?? []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          subtitle: entry.publisher,
          meta: entry.date,
          description: entry.description,
          bullets: [],
          tags: [],
          url: entry.url,
        }))
      )
    );
  }

  if ((cv.research ?? []).length > 0) {
    sections.push(
      entriesSection(
        'research',
        language,
        (cv.research ?? []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          subtitle: entry.institution,
          meta: entry.period,
          description: entry.description,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: [],
        }))
      )
    );
  }

  if ((cv.leadership ?? []).length > 0) {
    sections.push(
      entriesSection(
        'leadership',
        language,
        (cv.leadership ?? []).map((entry) => ({
          id: entry.id,
          title: entry.role,
          subtitle: entry.organization,
          meta: entry.period,
          description: entry.description,
          bullets: (entry.bullets ?? []).filter(hasText),
          tags: [],
        }))
      )
    );
  }

  if (links.length > 0) {
    sections.push(
      section('links', language, {
        kind: 'entries',
        entries: links.map((link, index) => ({
          id: `link-${index}`,
          title: link.label,
          url: link.url,
          bullets: [],
          tags: [],
        })),
      })
    );
  }

  return {
    fullName: cv.fullName?.trim() ?? '',
    title: cv.title?.trim() ?? '',
    contact: [cv.email, cv.phone, cv.location].filter(hasText).map((value) => value.trim()),
    links,
    sections,
    language,
    direction: resumeDirection(language),
    rtl: isResumeRtl(language),
  };
}

/**
 * Reorders the document's sections to a template's reading order.
 *
 * Sections the template does not name are appended rather than dropped: an
 * administrator's metadata can move a section but can never delete the
 * candidate's content by forgetting to list it.
 */
export function orderCvSections(
  sections: readonly CvDocumentSection[],
  order: readonly CvSectionKey[]
): CvDocumentSection[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const ordered: CvDocumentSection[] = [];
  for (const key of order) {
    const found = byKey.get(key);
    if (found) {
      ordered.push(found);
      byKey.delete(key);
    }
  }
  for (const key of DEFAULT_CV_SECTION_ORDER) {
    const found = byKey.get(key);
    if (found) {
      ordered.push(found);
      byKey.delete(key);
    }
  }
  for (const remaining of byKey.values()) ordered.push(remaining);
  return ordered;
}

/** Splits a document into the main column and the aside column of a layout. */
export function splitCvSections(
  sections: readonly CvDocumentSection[],
  sidebarSections: readonly CvSectionKey[]
): { main: CvDocumentSection[]; aside: CvDocumentSection[] } {
  const sidebar = new Set(sidebarSections);
  return {
    main: sections.filter((section) => !sidebar.has(section.key)),
    aside: sections.filter((section) => sidebar.has(section.key)),
  };
}

/**
 * The document as plain text.
 *
 * Used by the DOCX export and by tests that check content preservation
 * without depending on the file format. Every line the candidate wrote is
 * present, once, in reading order.
 */
export function cvDocumentToPlainText(document: CvDocument): string {
  const lines: string[] = [];
  if (document.fullName) lines.push(document.fullName);
  if (document.title) lines.push(document.title);
  if (document.contact.length > 0) lines.push(document.contact.join(' · '));
  for (const section of document.sections) {
    lines.push('', section.heading);
    if (section.kind === 'text' && section.text) lines.push(section.text);
    if (section.kind === 'inline') lines.push((section.inline ?? []).join(' · '));
    for (const entry of section.entries) {
      lines.push(joinParts([entry.title, entry.subtitle]));
      if (entry.meta) lines.push(entry.meta);
      if (entry.location) lines.push(entry.location);
      if (entry.description) lines.push(entry.description);
      for (const bullet of entry.bullets) lines.push(`- ${bullet}`);
      if (entry.tags.length > 0) lines.push(entry.tags.join(' · '));
      if (entry.url) lines.push(entry.url);
    }
  }
  return lines.join('\n').trim();
}
