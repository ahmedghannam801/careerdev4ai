/**
 * Building the extraction review.
 *
 * This is the module that turns "the parser found some values" into "here
 * is every value, where it came from, how sure we are, and what is wrong
 * with it". The review screen shows exactly what this module returns; it does
 * not derive anything of its own.
 *
 * The confidence of a value is not a feeling and it is not a fixed number
 * per section. It is computed from two things that can both be checked:
 *
 *   1. Does the document actually contain this value? A value that is
 *      written in the document is evidence; a value that was assembled from
 *      several lines is an inference, and it is graded as one.
 *   2. Is the value in the place it belongs? An email address in the contact
 *      block is strong evidence. The same address found in the middle of a
 *      project description is weaker, because a CV talks about a lot of
 *      things that are not the candidate's email address.
 *
 * A value that cannot be found in the document at all is graded `low`, and a
 * value the document never stated is marked `missing`. Neither is ever
 * presented as fact.
 */

import type {
  CvExtractionReview,
  CvExtractedEntry,
  CvExtractedField,
  CvExtractedSection,
  CvConfidenceLevel,
  CvFieldEvidence,
  CvSectionKey,
  CvSourceBlock,
  CvSourceLanguage,
} from '../../shared/cvExtraction.ts';
import { CV_SECTION_KEYS, CV_SECTION_LABELS, summarizeReview } from '../../shared/cvExtraction.ts';
import type { DocumentBlock, DocumentExtraction } from './documentExtraction.ts';
import type { ParsedCv, ParsedCvSection } from './parseStructuredCv.ts';
import { parsedCvToProfile } from './parsedCvToProfile.ts';
import { validateExtraction } from './cvValidation.ts';

/* -------------------------------------------------------------------------- */
/* Normalising and locating                                                    */
/* -------------------------------------------------------------------------- */

/** Collapses whitespace and lowercases, so two spellings of one line match. */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The language of a document.
 *
 * It is measured by how much of the text is in each script rather than by a
 * guess from the first line, so an Arabic CV with an English employer name
 * in it is read as mixed, which is what it is.
 */
export function detectDocumentLanguage(text: string): CvSourceLanguage {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  if (total < 40) return 'unknown';
  const arabicShare = arabic / total;
  if (arabicShare > 0.85) return 'ar';
  if (arabicShare < 0.15) return 'en';
  return 'mixed';
}

/** Where a section's text lives, and the blocks it was made of. */
interface SectionContext {
  key: string;
  heading: string;
  text: string;
  blocks: DocumentBlock[];
}

/**
 * Finds a value inside the document.
 *
 * The search is done on the normalised text, so a value that differs only in
 * spacing or in case still counts as found â€” the document and the parser
 * both collapse whitespace before anything else.
 */
function locate(
  value: string,
  contexts: SectionContext[]
): { section: SectionContext; evidence: CvFieldEvidence } | null {
  const needle = normalize(value);
  if (!needle) return null;

  for (const context of contexts) {
    const haystack = normalize(context.text);
    if (!haystack) continue;
    const index = haystack.indexOf(needle);
    if (index === -1) continue;

    // The evidence is the block the value was found in, so the reviewer sees
    // the line the value came from rather than a summary of it.
    const block = context.blocks.find((entry) =>
      normalize(entry.text).includes(needle)
    );
    const evidence: CvFieldEvidence = {
      text: (block?.text ?? context.text).replace(/\s+/g, ' ').trim().slice(0, 300),
      page: block?.page,
    };
    return { section: context, evidence };
  }
  return null;
}

/** The section a personal detail belongs in. */
const PERSONAL_SECTIONS: string[] = ['header', 'contact'];

/**
 * Grades a value.
 *
 * The grades are the platform's, not the parser's: a value that appears in
 * the section it belongs to is `high`, a value that appears somewhere else
 * is `medium`, a value that cannot be found is `low`, and a value the
 * document never stated is `missing`.
 */
function grade(
  value: string | null | undefined,
  contexts: SectionContext[],
  expected: string[]
): { confidence: CvConfidenceLevel; evidence: CvFieldEvidence[] } {
  if (!value || !value.trim()) {
    return { confidence: 'needs-review', evidence: [] };
  }

  const found = locate(value, contexts);
  if (!found) {
    // The value was put together rather than copied out of the document.
    // It may still be right, but the document does not say it.
    return { confidence: 'low', evidence: [] };
  }

  const expectedKeys = expected.map((key) => key.toLowerCase());
  const inExpected = expectedKeys.includes(found.section.key.toLowerCase());

  // A short value is more likely to be a coincidence. "IT" appearing in the
  // skills section is evidence; "IT" appearing in a project description is
  // not much of it.
  const short = value.trim().length < 4;

  if (inExpected && !short) return { confidence: 'high', evidence: [found.evidence] };
  if (inExpected && short) return { confidence: 'medium', evidence: [found.evidence] };
  return { confidence: 'medium', evidence: [found.evidence] };
}

/** Builds one field of the review. */
function field(
  key: string,
  label: string,
  value: string | null | undefined,
  contexts: SectionContext[],
  expected: string[],
  options: { derived?: boolean; missingMessage?: string } = {}
): CvExtractedField {
  const present = Boolean(value && value.trim());
  const graded = grade(value, contexts, expected);

  if (!present) {
    return {
      key,
      label,
      value: null,
      confidence: 'needs-review',
      status: 'missing',
      evidence: [],
      issues: ['The document did not state this value.'],
    };
  }

  const issues: string[] = [];
  if (graded.confidence === 'low') {
    issues.push(
      'This value was assembled from the document rather than copied out of it, so please check it.'
    );
  }
  if (options.derived) {
    issues.push('This value was read out of the document and may need a little tidying.');
  }
  if (graded.evidence.length === 0) {
    issues.push('The document does not contain this value verbatim.');
  }

  return {
    key,
    label,
    value: value as string,
    confidence: graded.confidence,
    status: 'extracted',
    evidence: graded.evidence,
    issues,
  };
}

/**
 * Builds a field for a value the parser derived rather than copied.
 *
 * A date is the case this exists for: the document says "January 2020" and
 * the document says "2020-01-01". The value is right and it is not written
 * down, so it is graded on whether the year appears in the section.
 */
function derivedField(
  key: string,
  label: string,
  value: string | null | undefined,
  contexts: SectionContext[],
  expected: string[]
): CvExtractedField {
  if (!value || !value.trim()) {
    return {
      key,
      label,
      value: null,
      confidence: 'needs-review',
      status: 'missing',
      evidence: [],
      issues: [`The document did not state a ${label.toLowerCase()}.`],
    };
  }

  const year = value.slice(0, 4);
  const found = /^\d{4}$/.test(year)
    ? locate(year, contexts.filter((context) => expected.includes(context.key)))
    : null;

  if (!found) {
    return {
      key,
      label,
      value,
      confidence: 'low',
      status: 'extracted',
      evidence: [],
      issues: ['This date was read out of the document and could not be matched to it exactly.'],
    };
  }

  return {
    key,
    label,
    value,
    confidence: 'high',
    status: 'extracted',
    evidence: [found.evidence],
    issues: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Building the sections                                                       */
/* -------------------------------------------------------------------------- */

/** The confidence of a whole entry, taken from its fields. */
function entryConfidence(fields: Record<string, CvExtractedField>): CvConfidenceLevel {
  const values = Object.values(fields);
  if (values.length === 0) return 'low';
  if (values.some((entry) => entry.confidence === 'needs-review')) return 'needs-review';
  const scores = values.map((entry) =>
    entry.confidence === 'high' ? 1 : entry.confidence === 'medium' ? 0.75 : 0.45
  );
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  if (average >= 0.85) return 'high';
  if (average >= 0.6) return 'medium';
  return 'low';
}

function entry(
  id: string,
  label: string,
  fields: Record<string, CvExtractedField>
): CvExtractedEntry {
  const evidence: CvFieldEvidence[] = [];
  for (const value of Object.values(fields)) {
    for (const item of value.evidence) {
      if (!evidence.some((existing) => existing.text === item.text)) evidence.push(item);
    }
  }
  return {
    id,
    label,
    confidence: entryConfidence(fields),
    status: 'extracted',
    fields,
    evidence: evidence.slice(0, 4),
  };
}

/* -------------------------------------------------------------------------- */
/* The review                                                                  */
/* -------------------------------------------------------------------------- */

/** The options the caller can give the builder. */
export interface BuildExtractionReviewOptions {
  /** The name of the uploaded file, when there was one. */
  fileName?: string;
}

/**
 * Builds the review of an extracted document.
 *
 * The result is a pure function of the document: the same document always
 * produces the same review, which is what lets the candidate come back to it
 * later and see the same thing.
 */
export function buildExtractionReview(
  extraction: DocumentExtraction,
  parsed: { cv: ParsedCv; sections: ParsedCvSection[] },
  options: BuildExtractionReviewOptions = {}
): CvExtractionReview {
  const contexts: SectionContext[] = parsed.sections.map((section) => ({
    key: section.key as CvSectionKey,
    heading: section.heading,
    text: section.blocks.map((block) => block.text).join('\n'),
    blocks: section.blocks,
  }));

  const cv = parsedCvToProfile(parsed.cv);
  const sections: CvExtractedSection[] = [];

  /* -- personal ---------------------------------------------------------- */

  const personalFields: Record<string, CvExtractedField> = {
    fullName: field('fullName', 'Full name', cv.fullName, contexts, PERSONAL_SECTIONS),
    email: field('email', 'Email', cv.email, contexts, PERSONAL_SECTIONS),
    phone: field('phone', 'Phone', cv.phone, contexts, PERSONAL_SECTIONS),
    location: field('location', 'Location', cv.location, contexts, PERSONAL_SECTIONS),
    title: field('title', 'Professional title', cv.title, contexts, PERSONAL_SECTIONS, {
      derived: true,
    }),
    linkedin: field('linkedin', 'LinkedIn', cv.linkedin, contexts, PERSONAL_SECTIONS),
    github: field('github', 'GitHub', cv.github, contexts, PERSONAL_SECTIONS),
    website: field('website', 'Website', cv.website, contexts, PERSONAL_SECTIONS),
  };

  sections.push({
    key: 'personal',
    label: CV_SECTION_LABELS.personal,
    present: Object.values(personalFields).some((entry) => entry.status !== 'missing'),
    confidence: entryConfidence(personalFields),
    fields: personalFields,
    entries: [],
    issues: [],
  });

  /* -- summary ----------------------------------------------------------- */

  const summaryField = field('summary', 'Professional summary', cv.summary, contexts, ['summary']);
  sections.push({
    key: 'summary',
    label: CV_SECTION_LABELS.summary,
    present: summaryField.status !== 'missing',
    confidence: summaryField.confidence,
    fields: { summary: summaryField },
    entries: [],
    issues: [],
  });

  /* -- the list sections -------------------------------------------------- */

  const roleSection = (
    key: CvSectionKey,
    values: Array<{
      id: string;
      role: string;
      organization: string;
      period: string;
      location: string;
      bullets: string[];
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
    }>
  ): CvExtractedSection => {
    const entries = values.map((value, index) =>
      entry(
        value.id || `${key}-${index}`,
        [value.role, value.organization].filter(Boolean).join(' â€” ') || `Entry ${index + 1}`,
        {
          role: field('role', 'Role', value.role, contexts, [key]),
          organization: field('organization', 'Organisation', value.organization, contexts, [key]),
          period: derivedField('period', 'Period', value.period, contexts, [key]),
          startDate: derivedField('startDate', 'Start date', value.startDate, contexts, [key]),
          endDate: derivedField('endDate', 'End date', value.endDate, contexts, [key]),
          location: field('location', 'Location', value.location, contexts, [key]),
        }
      )
    );

    return {
      key,
      label: CV_SECTION_LABELS[key],
      present: entries.length > 0,
      confidence: entries.length
        ? entryConfidence(
            Object.assign({}, ...entries.map((item) => item.fields))
          )
        : 'needs-review',
      fields: {},
      entries,
      issues: [],
    };
  };

  sections.push(
    roleSection(
      'experience',
      cv.experiences.map((value) => ({
        id: value.id,
        role: value.role,
        organization: value.company,
        period: value.period,
        location: value.location,
        bullets: value.bullets,
        startDate: value.startDate,
        endDate: value.endDate,
        isCurrent: value.isCurrent,
      }))
    )
  );

  sections.push(
    roleSection(
      'internships',
      (cv.internships ?? []).map((value) => ({
        id: value.id,
        role: value.role,
        organization: value.organization,
        period: value.period,
        location: value.location ?? '',
        bullets: value.bullets,
        startDate: value.startDate,
        endDate: value.endDate,
        isCurrent: value.isCurrent,
      }))
    )
  );

  sections.push(
    roleSection(
      'volunteering',
      (cv.volunteering ?? []).map((value) => ({
        id: value.id,
        role: value.role,
        organization: value.organization,
        period: value.period,
        location: value.location ?? '',
        bullets: value.bullets,
      }))
    )
  );

  sections.push(
    roleSection(
      'leadership',
      (cv.leadership ?? []).map((value) => ({
        id: value.id,
        role: value.role,
        organization: value.organization,
        period: value.period ?? '',
        location: '',
        bullets: value.bullets ?? [],
      }))
    )
  );

  sections.push({
    key: 'education',
    label: CV_SECTION_LABELS.education,
    present: cv.education.length > 0,
    confidence: 'needs-review',
    fields: {},
    entries: cv.education.map((value, index) =>
      entry(value.id || `education-${index}`, [value.degree, value.institution].filter(Boolean).join(' â€” '), {
        institution: field('institution', 'Institution', value.institution, contexts, ['education']),
        degree: field('degree', 'Degree', value.degree, contexts, ['education']),
        field: field('field', 'Field of study', value.field, contexts, ['education']),
        period: derivedField('period', 'Period', value.period, contexts, ['education']),
        startDate: derivedField('startDate', 'Start date', value.startDate, contexts, ['education']),
        endDate: derivedField('endDate', 'End date', value.endDate, contexts, ['education']),
      })
    ),
    issues: [],
  });
  const educationSection = sections[sections.length - 1];
  educationSection.confidence = educationSection.entries.length
    ? entryConfidence(Object.assign({}, ...educationSection.entries.map((item) => item.fields)))
    : 'needs-review';

  sections.push({
    key: 'projects',
    label: CV_SECTION_LABELS.projects,
    present: cv.projects.length > 0,
    confidence: 'needs-review',
    fields: {},
    entries: cv.projects.map((value, index) =>
      entry(value.id || `project-${index}`, value.title, {
        title: field('title', 'Title', value.title, contexts, ['projects']),
        role: field('role', 'Role', value.role, contexts, ['projects']),
        link: field('link', 'Link', value.link, contexts, ['projects']),
      })
    ),
    issues: [],
  });
  const projectSection = sections[sections.length - 1];
  projectSection.confidence = projectSection.entries.length
    ? entryConfidence(Object.assign({}, ...projectSection.entries.map((item) => item.fields)))
    : 'needs-review';

  const skillsField = field('skills', 'Skills', cv.skillsList.join(', '), contexts, ['skills']);
  sections.push({
    key: 'skills',
    label: CV_SECTION_LABELS.skills,
    present: cv.skillsList.length > 0,
    confidence: skillsField.confidence,
    fields: { skills: skillsField },
    entries: cv.skillsList.map((skill, index) =>
      entry(`skill-${index}`, skill, {
        name: field('name', 'Skill', skill, contexts, ['skills']),
      })
    ),
    issues: [],
  });

  sections.push({
    key: 'certifications',
    label: CV_SECTION_LABELS.certifications,
    present: (cv.certificationDetails ?? []).length > 0,
    confidence: 'needs-review',
    fields: {},
    entries: (cv.certificationDetails ?? []).map((value, index) =>
      entry(value.id || `certification-${index}`, value.name, {
        name: field('name', 'Certificate', value.name, contexts, ['certifications']),
        issuer: field('issuer', 'Issuer', value.issuer, contexts, ['certifications']),
        issueDate: derivedField('issueDate', 'Issue date', value.issueDate, contexts, ['certifications']),
      })
    ),
    issues: [],
  });
  const certificationSection = sections[sections.length - 1];
  certificationSection.confidence = certificationSection.entries.length
    ? entryConfidence(Object.assign({}, ...certificationSection.entries.map((item) => item.fields)))
    : 'needs-review';

  const namedSection = (
    key: CvSectionKey,
    values: Array<{ id: string; title: string; subtitle: string; date: string; description: string }>,
    subtitleLabel: string,
    dateLabel: string
  ): CvExtractedSection => {
    const built = values.map((value, index) =>
      entry(value.id || `${key}-${index}`, value.title, {
        title: field('title', 'Title', value.title, contexts, [key]),
        subtitle: field('subtitle', subtitleLabel, value.subtitle, contexts, [key]),
        date: derivedField('date', dateLabel, value.date, contexts, [key]),
      })
    );
    return {
      key,
      label: CV_SECTION_LABELS[key],
      present: built.length > 0,
      confidence: built.length
        ? entryConfidence(Object.assign({}, ...built.map((item) => item.fields)))
        : 'needs-review',
      fields: {},
      entries: built,
      issues: [],
    };
  };

  sections.push(
    namedSection(
      'courses',
      (cv.courses ?? []).map((value, index) => ({
        id: value.id || `course-${index}`,
        title: value.title,
        subtitle: value.provider,
        date: '',
        description: value.description,
      })),
      'Provider',
      'Date'
    )
  );

  sections.push({
    key: 'languages',
    label: CV_SECTION_LABELS.languages,
    present: (cv.languages ?? []).length > 0,
    confidence: 'needs-review',
    fields: {},
    entries: (cv.languages ?? []).map((value, index) =>
      entry(value.id || `language-${index}`, value.name, {
        name: field('name', 'Language', value.name, contexts, ['languages']),
        level: field('level', 'Level', value.level ?? '', contexts, ['languages']),
      })
    ),
    issues: [],
  });
  const languageSection = sections[sections.length - 1];
  languageSection.confidence = languageSection.entries.length
    ? entryConfidence(Object.assign({}, ...languageSection.entries.map((item) => item.fields)))
    : 'needs-review';

  sections.push(
    namedSection(
      'awards',
      (cv.awards ?? []).map((value, index) => ({
        id: value.id || `award-${index}`,
        title: value.title,
        subtitle: value.issuer ?? '',
        date: value.date ?? '',
        description: value.description ?? '',
      })),
      'Issuer',
      'Date'
    )
  );

  sections.push(
    namedSection(
      'publications',
      (cv.publications ?? []).map((value, index) => ({
        id: value.id || `publication-${index}`,
        title: value.title,
        subtitle: value.publisher ?? '',
        date: value.date ?? '',
        description: value.description ?? '',
      })),
      'Publisher',
      'Date'
    )
  );

  sections.push(
    namedSection(
      'research',
      (cv.research ?? []).map((value, index) => ({
        id: value.id || `research-${index}`,
        title: value.title,
        subtitle: value.institution ?? '',
        date: value.period ?? '',
        description: value.description ?? '',
      })),
      'Institution',
      'Period'
    )
  );

  sections.push({
    key: 'links',
    label: CV_SECTION_LABELS.links,
    present: Boolean(cv.linkedin || cv.github || cv.website),
    confidence: 'needs-review',
    fields: {},
    entries: [
      ...(cv.linkedin
        ? [entry('link-linkedin', 'LinkedIn', { url: field('url', 'LinkedIn', cv.linkedin, contexts, PERSONAL_SECTIONS) })]
        : []),
      ...(cv.github
        ? [entry('link-github', 'GitHub', { url: field('url', 'GitHub', cv.github, contexts, PERSONAL_SECTIONS) })]
        : []),
      ...(cv.website
        ? [entry('link-website', 'Website', { url: field('url', 'Website', cv.website, contexts, PERSONAL_SECTIONS) })]
        : []),
    ],
    issues: [],
  });
  const linkSection = sections[sections.length - 1];
  linkSection.confidence = linkSection.entries.length
    ? entryConfidence(Object.assign({}, ...linkSection.entries.map((item) => item.fields)))
    : 'needs-review';

  // The sections come out in the order the document is read in, so the
  // review screen reads top to bottom the way the CV does.
  const ordered = CV_SECTION_KEYS.map(
    (key) => sections.find((section) => section.key === key)
  ).filter((section): section is CvExtractedSection => Boolean(section));

  const validation = validateExtraction(cv);
  const preview: CvSourceBlock[] = extraction.blocks.map((block, index) => ({
    id: `block-${index}`,
    page: block.page,
    text: block.text,
  }));

  const review: CvExtractionReview = {
    source: {
      format: extraction.format,
      fileName: options.fileName,
      pageCount: extraction.pageCount,
      layout: extraction.layout,
      characterCount: extraction.characterCount,
      wordCount: extraction.wordCount,
      language: detectDocumentLanguage(extraction.text),
      isScanned: extraction.isScanned,
    },
    cv,
    sections: ordered,
    validation,
    summary: summarizeReview({ sections: ordered, validation }),
    preview,
  };

  return review;
}
