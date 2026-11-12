/**
 * The review screen.
 *
 * This is where a candidate decides what goes on their CV. The upload used
 * to make that decision for them: the document was read, the fields were
 * written, and the screen that appeared afterwards reported how many fields
 * had been found. Whatever the reader got wrong was already on their CV by
 * the time they could see it.
 *
 * The order here is the other way round. The document is read, every value
 * is shown with the text it came from and a grade for how sure the reader
 * is, and nothing is written until the candidate says so.
 *
 * The three rules the screen follows:
 *
 *   - A value the reader is sure of is still editable, and a value the
 *     reader is unsure of is still editable. The grade tells the candidate
 *     where to look first; it never decides for them.
 *   - A missing field is shown as missing rather than hidden. A candidate
 *     who does not know a field was not found will assume it was found.
 *   - A section can be turned off as a whole. Rejecting a section keeps it
 *     off the CV; it does not delete what the candidate already had.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CvConfidenceLevel,
  CvExtractedField,
  CvExtractedSection,
  CvExtractionReview as CvExtractionReviewDocument,
  CvFieldStatus,
  CvSectionKey,
  CvValidationIssue,
} from '../../../shared/cvExtraction';
import { CV_SECTION_LABELS, CV_CONFIDENCE_LABELS } from '../../../shared/cvExtraction';
import type { CVProfile } from '../../types/career';
import { extractCvSection } from '../../lib/cvExtractionApi';
import { useCareer } from '../../context/CareerContext';

export type CvApplyMode = 'studio_and_profile' | 'studio_only';

interface CvExtractionReviewProps {
  /** The review the server produced. */
  review: CvExtractionReviewDocument;
  /**
   * The text the document was read from.
   *
   * It is kept so that one section can be read again without the candidate
   * having to upload the document a second time.
   */
  sourceText: string;
  /** Called with the document the candidate accepted. */
  onApply: (
    cv: CVProfile,
    selectedSections: Record<string, boolean>,
    mode: CvApplyMode
  ) => Promise<void>;
  /** Called when the candidate closes the review without applying it. */
  onClose?: () => void;
}

/* -------------------------------------------------------------------------- */
/* The document <-> the review                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How a field in the review maps onto the document.
 *
 * `list` says whether the section holds a list of entries or a single value,
 * and `props` names the property of the document each field is written to.
 */
interface SectionMapping {
  list: boolean;
  props: Record<string, string>;
}

const SECTION_MAPPINGS: Record<string, SectionMapping> = {
  personal: {
    list: false,
    props: {
      fullName: 'fullName',
      email: 'email',
      phone: 'phone',
      location: 'location',
      title: 'title',
      linkedin: 'linkedin',
      github: 'github',
      website: 'website',
    },
  },
  summary: { list: false, props: { summary: 'summary' } },
  experience: {
    list: true,
    props: {
      role: 'role',
      organization: 'company',
      period: 'period',
      startDate: 'startDate',
      endDate: 'endDate',
      location: 'location',
    },
  },
  internships: {
    list: true,
    props: {
      role: 'role',
      organization: 'organization',
      period: 'period',
      startDate: 'startDate',
      endDate: 'endDate',
      location: 'location',
    },
  },
  education: {
    list: true,
    props: {
      institution: 'institution',
      degree: 'degree',
      field: 'field',
      period: 'period',
      startDate: 'startDate',
      endDate: 'endDate',
    },
  },
  projects: {
    list: true,
    props: { title: 'title', role: 'role', link: 'link' },
  },
  skills: { list: true, props: { name: 'skillsList' } },
  certifications: {
    list: true,
    props: { name: 'name', issuer: 'issuer', issueDate: 'issueDate' },
  },
  courses: { list: true, props: { title: 'title', subtitle: 'provider' } },
  languages: { list: true, props: { name: 'name', level: 'level' } },
  volunteering: {
    list: true,
    props: {
      role: 'role',
      organization: 'organization',
      period: 'period',
      startDate: 'startDate',
      endDate: 'endDate',
    },
  },
  awards: { list: true, props: { title: 'title', subtitle: 'issuer', date: 'date' } },
  publications: {
    list: true,
    props: { title: 'title', subtitle: 'publisher', date: 'date' },
  },
  research: { list: true, props: { title: 'title', subtitle: 'institution', date: 'period' } },
  leadership: {
    list: true,
    props: { role: 'role', organization: 'organization', period: 'period' },
  },
  links: { list: false, props: {} },
};

/** The list of a section in the document, or null when it has none. */
function sectionList(cv: CVProfile, section: CvSectionKey): unknown[] | null {
  switch (section) {
    case 'experience':
      return cv.experiences ?? [];
    case 'internships':
      return cv.internships ?? [];
    case 'education':
      return cv.education ?? [];
    case 'projects':
      return cv.projects ?? [];
    case 'skills':
      return cv.skillsList ?? [];
    case 'certifications':
      return cv.certificationDetails ?? [];
    case 'courses':
      return cv.courses ?? [];
    case 'languages':
      return cv.languages ?? [];
    case 'volunteering':
      return cv.volunteering ?? [];
    case 'awards':
      return cv.awards ?? [];
    case 'publications':
      return cv.publications ?? [];
    case 'research':
      return cv.research ?? [];
    case 'leadership':
      return cv.leadership ?? [];
    default:
      return null;
  }
}

/** Writes one field of one entry of the document. */
function writeEntryField(
  cv: CVProfile,
  section: CvSectionKey,
  index: number,
  fieldKey: string,
  value: string
): CVProfile {
  const mapping = SECTION_MAPPINGS[section];
  const property = mapping?.props[fieldKey];
  if (!property) return cv;

  const list = sectionList(cv, section);
  if (!list) return cv;

  // The skills section is a list of names, not a list of objects.
  if (section === 'skills') {
    const next = [...(cv.skillsList ?? [])];
    if (index >= 0 && index < next.length) next[index] = value;
    return { ...cv, skillsList: next };
  }

  const next = list.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    return { ...(entry as Record<string, unknown>), [property]: value };
  });

  switch (section) {
    case 'experience':
      return { ...cv, experiences: next as CVProfile['experiences'] };
    case 'internships':
      return { ...cv, internships: next as CVProfile['internships'] };
    case 'education':
      return { ...cv, education: next as CVProfile['education'] };
    case 'projects':
      return { ...cv, projects: next as CVProfile['projects'] };
    case 'certifications':
      return { ...cv, certificationDetails: next as CVProfile['certificationDetails'] };
    case 'courses':
      return { ...cv, courses: next as CVProfile['courses'] };
    case 'languages':
      return { ...cv, languages: next as CVProfile['languages'] };
    case 'volunteering':
      return { ...cv, volunteering: next as CVProfile['volunteering'] };
    case 'awards':
      return { ...cv, awards: next as CVProfile['awards'] };
    case 'publications':
      return { ...cv, publications: next as CVProfile['publications'] };
    case 'research':
      return { ...cv, research: next as CVProfile['research'] };
    case 'leadership':
      return { ...cv, leadership: next as CVProfile['leadership'] };
    default:
      return cv;
  }
}

/** Writes one field of the document's header or summary. */
function writeScalarField(cv: CVProfile, section: CvSectionKey, fieldKey: string, value: string): CVProfile {
  const property = SECTION_MAPPINGS[section]?.props[fieldKey];
  if (!property) return cv;
  return { ...cv, [property]: value };
}

/* -------------------------------------------------------------------------- */
/* The confidence chips                                                        */
/* -------------------------------------------------------------------------- */

const CONFIDENCE_STYLES: Record<CvConfidenceLevel, string> = {
  high: 'bg-[var(--color-success)]/12 text-[var(--color-success)] border-[var(--color-success)]/25',
  medium: 'bg-[var(--color-warning)]/12 text-[var(--color-warning)] border-[var(--color-warning)]/25',
  low: 'bg-[var(--color-warning)]/12 text-[var(--color-warning)] border-[var(--color-warning)]/25',
  'needs-review': 'bg-[var(--color-danger)]/12 text-[var(--color-danger)] border-[var(--color-danger)]/25',
};

const CONFIDENCE_LABELS = CV_CONFIDENCE_LABELS;

const SEVERITY_STYLES: Record<CvValidationIssue['severity'], string> = {
  error: 'text-[var(--color-danger)]',
  warning: 'text-[var(--color-warning)]',
  info: 'text-[var(--text-muted)]',
};

/**
 * Fills a message template with the values it refers to.
 *
 * The template is translated first and the values are put in afterwards, so
 * the Arabic sentence is the one the translator wrote rather than an English
 * sentence with Arabic words in it.
 */
function fillTemplate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match);
}

/** The message of an issue, in the interface's language. */
function issueMessage(issue: CvValidationIssue, t: (key: string) => string): string {
  return fillTemplate(t(issue.message), issue.params);
}

/** The suggestion of an issue, in the interface's language. */
function issueSuggestion(issue: CvValidationIssue, t: (key: string) => string): string | undefined {
  if (!issue.suggestion) return undefined;
  return fillTemplate(t(issue.suggestion), issue.suggestionParams);
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

export const CvExtractionReview: React.FC<CvExtractionReviewProps> = ({
  review,
  sourceText,
  onApply,
  onClose,
}) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState<CVProfile>(review.cv);
  const [sections, setSections] = useState<CvExtractedSection[]>(review.sections);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of review.sections) initial[section.key] = section.present;
    return initial;
  });
  const [statuses, setStatuses] = useState<Record<string, CvFieldStatus>>({});
  const [activeSection, setActiveSection] = useState<CvSectionKey>(
    review.sections.find((section) => section.present)?.key ?? 'personal'
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showIssues, setShowIssues] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyMode, setApplyMode] = useState<CvApplyMode>('studio_and_profile');
  const [isRereading, setIsRereading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = review.summary;

  /** The key a field's decision is stored under. */
  const decisionKey = (section: CvSectionKey, entryId: string | null, fieldKey: string) =>
    `${section}.${entryId ?? 'section'}.${fieldKey}`;

  const setStatus = (key: string, status: CvFieldStatus) =>
    setStatuses((previous) => ({ ...previous, [key]: status }));

  const statusOf = (key: string): CvFieldStatus => statuses[key] ?? 'extracted';

  const editField = (
    section: CvSectionKey,
    entryId: string | null,
    entryIndex: number,
    fieldKey: string,
    value: string
  ) => {
    setDraft((previous) => {
      // The links section is the same three values the header carries, so
      // editing one there has to change the header and not a copy of it.
      if (section === 'links' && entryId) {
        const property = entryId.replace('link-', '') as 'linkedin' | 'github' | 'website';
        return { ...previous, [property]: value };
      }
      return entryId === null
        ? writeScalarField(previous, section, fieldKey, value)
        : writeEntryField(previous, section, entryIndex, fieldKey, value);
    });
    setStatus(decisionKey(section, entryId, fieldKey), 'edited');
  };

  /**
   * Accepts every field the reader was sure about, in one action.
   *
   * A section is kept when every value in it is either one the reader was
   * sure of, or one the candidate has already looked at. A section with a
   * value the reader was unsure of and the candidate has not touched is left
   * out, because accepting it would be accepting a guess.
   */
  const acceptHighConfidence = () => {
    const next: Record<string, boolean> = {};

    for (const section of sections) {
      let uncertain = 0;

      for (const field of Object.values(section.fields)) {
        const key = decisionKey(section.key, null, field.key);
        if (field.confidence === 'high') {
          setStatus(key, 'confirmed');
        } else if (statusOf(key) === 'extracted') {
          uncertain += 1;
        }
      }

      for (const entry of section.entries) {
        for (const field of Object.values(entry.fields)) {
          const key = decisionKey(section.key, entry.id, field.key);
          if (field.confidence === 'high') {
            setStatus(key, 'confirmed');
          } else if (statusOf(key) === 'extracted') {
            uncertain += 1;
          }
        }
      }

      next[section.key] = section.present && uncertain === 0;
    }

    setSelected(next);
  };

  /** Reads one section of the document again. */
  const rereadSection = async (sectionKey: CvSectionKey) => {
    setIsRereading(sectionKey);
    setError(null);
    try {
      const result = await extractCvSection(sourceText, sectionKey);
      setSections((previous) =>
        previous.map((section) => (section.key === sectionKey ? result.section : section))
      );
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : t('That section could not be read again.')
      );
    } finally {
      setIsRereading(null);
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    try {
      await onApply(draft, selected, applyMode);
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : t('The reviewed CV could not be saved.')
      );
    } finally {
      setIsApplying(false);
    }
  };

  const issuesFor = (sectionKey: CvSectionKey) =>
    review.validation.filter(
      (issue) => issue.path.startsWith(`${sectionKey}[`) || issue.path.startsWith(`${sectionKey}.`)
    );

  const currentSection = sections.find((section) => section.key === activeSection);

  return (
    <div className="space-y-5" data-testid="cv-extraction-review">
      {/* The headline: what was read, and how sure the reader is. */}
      <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {t('Review what was extracted')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-2xl">
              {t(
                'Nothing has been saved to your profile yet. Check each value, correct anything that is wrong, and then apply the CV.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${CONFIDENCE_STYLES[summary.confidence]}`}
            >
              {t(CONFIDENCE_LABELS[summary.confidence])} · {summary.score}%
            </span>
            <span className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('High')}: {summary.fieldsHigh} · {t('Medium')}: {summary.fieldsMedium} ·{' '}
              {t('Low')}: {summary.fieldsLow} · {t('Missing')}: {summary.fieldsMissing}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>
            {review.source.fileName ?? t('Pasted text')} ·{' '}
            {review.source.format.toUpperCase()} · {review.source.pageCount} {t('page(s)')}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {review.source.language === 'ar'
              ? t('Arabic')
              : review.source.language === 'en'
                ? t('English')
                : review.source.language === 'mixed'
                  ? t('Arabic and English')
                  : t('Unknown language')}
          </span>
          {review.source.isScanned && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--color-warning)] font-semibold">{t('This document has no text layer')}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={acceptHighConfidence}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
            {t('Accept the high-confidence values')}
          </button>
          <button
            type="button"
            onClick={() => setShowIssues((previous) => !previous)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
            {t('Issues')} ({summary.issues.errors + summary.issues.warnings})
          </button>
          <button
            type="button"
            onClick={() => setShowSource((previous) => !previous)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
          >
            <Info className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            {t('Show the original document')}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 flex items-start gap-2.5"
        >
          <CircleAlert className="w-4 h-4 text-[var(--color-danger)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
        </div>
      )}

      {/* The issues, above the fields: they are what the candidate is most
          likely to want to act on first. */}
      {showIssues && review.validation.length > 0 && (
        <div className="p-4 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('What needs a look')}
          </h3>
          {review.validation.map((issue) => (
            <button
              key={`${issue.code}-${issue.path}`}
              type="button"
              onClick={() => {
                const section = issue.path.split(/[.[]/)[0] as CvSectionKey;
                if (section) setActiveSection(section);
              }}
              className="w-full text-start p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 hover:bg-[var(--surface-secondary)] transition-colors flex items-start gap-2.5"
            >
              <span className={`shrink-0 mt-0.5 ${SEVERITY_STYLES[issue.severity]}`}>
                {issue.severity === 'info' ? (
                  <Info className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
              </span>
              <span className="space-y-0.5">
                <span className="block text-xs font-semibold text-[var(--text-primary)]">
                  {issueMessage(issue, t)}
                </span>
                {issueSuggestion(issue, t) && (
                  <span className="block text-[11px] text-[var(--text-secondary)]">
                    {issueSuggestion(issue, t)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {showSource && (
        <div className="p-4 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('The original document')}
          </h3>
          <pre className="max-h-72 overflow-auto text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--surface-secondary)]/40 rounded-xl p-3">
            {sourceText}
          </pre>
        </div>
      )}

      {/* The sections. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 space-y-2">
          {sections.map((section) => {
            const count = section.entries.length || Object.keys(section.fields).length;
            const isActive = section.key === activeSection;
            const sectionIssues = issuesFor(section.key);
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`w-full text-start p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                  isActive
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--text-primary)] truncate">
                    {t(CV_SECTION_LABELS[section.key])}
                  </span>
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    {section.present ? `${count} ${t('value(s)')}` : t('Not in the document')}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {sectionIssues.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-warning)]/15 text-[var(--color-warning)] text-[10px] font-bold">
                      {sectionIssues.length}
                    </span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${CONFIDENCE_STYLES[section.confidence].split(' ')[0]}`}
                    aria-hidden="true"
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-8 space-y-4">
          {currentSection && (
            <SectionCard
              section={currentSection}
              selected={selected[currentSection.key] !== false}
              onToggleSelected={() =>
                setSelected((previous) => ({
                  ...previous,
                  [currentSection.key]: previous[currentSection.key] === false,
                }))
              }
              expanded={expanded}
              setExpanded={setExpanded}
              statusOf={statusOf}
              decisionKey={decisionKey}
              onEdit={editField}
              onReread={() => rereadSection(currentSection.key)}
              isRereading={isRereading === currentSection.key}
              t={t}
            />
          )}
        </div>
      </div>

      {/* The decision. */}
      <div className="sticky bottom-0 p-4 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-lg space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-primary)] font-medium">
            <input
              type="radio"
              name="cv-apply-mode"
              checked={applyMode === 'studio_and_profile'}
              onChange={() => setApplyMode('studio_and_profile')}
              className="accent-[var(--accent-primary)]"
            />
            <span>{t('Apply to CV Studio & Sync with My Profile')}</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-secondary)] font-medium">
            <input
              type="radio"
              name="cv-apply-mode"
              checked={applyMode === 'studio_only'}
              onChange={() => setApplyMode('studio_only')}
              className="accent-[var(--accent-primary)]"
            />
            <span>{t('Apply to CV Studio Only')}</span>
          </label>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {applyMode === 'studio_and_profile'
              ? t('Applying updates your CV Studio document and merges kept sections into your profile records without duplicating existing entries.')
              : t('Applying saves this document in CV Studio only. Your saved profile records will not be modified.')}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('Cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              {isApplying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {isApplying
                ? t('Applying…')
                : applyMode === 'studio_and_profile'
                  ? t('Apply to CV Studio & Sync with My Profile')
                  : t('Apply to CV Studio Only')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* One section                                                                 */
/* -------------------------------------------------------------------------- */

interface SectionCardProps {
  section: CvExtractedSection;
  selected: boolean;
  onToggleSelected: () => void;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  statusOf: (key: string) => CvFieldStatus;
  decisionKey: (section: CvSectionKey, entryId: string | null, fieldKey: string) => string;
  onEdit: (
    section: CvSectionKey,
    entryId: string | null,
    entryIndex: number,
    fieldKey: string,
    value: string
  ) => void;
  onReread: () => void;
  isRereading: boolean;
  t: (key: string) => string;
}

const SectionCard: React.FC<SectionCardProps> = ({
  section,
  selected,
  onToggleSelected,
  expanded,
  setExpanded,
  statusOf,
  decisionKey,
  onEdit,
  onReread,
  isRereading,
  t,
}) => {
  const isOpen = expanded[section.key] !== false;

  return (
    <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {t(CV_SECTION_LABELS[section.key])}
          </h3>
          <span
            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${CONFIDENCE_STYLES[section.confidence]}`}
          >
            {t(CONFIDENCE_LABELS[section.confidence])}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReread}
            disabled={isRereading}
            title={t('Read this section again from the document')}
            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isRereading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {t('Read again')}
          </button>
          <button
            type="button"
            onClick={onToggleSelected}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
              selected
                ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-muted)]'
            }`}
          >
            {selected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {selected ? t('Keep this section') : t('Skip this section')}
          </button>
          <button
            type="button"
            onClick={() =>
              setExpanded((previous) => ({ ...previous, [section.key]: !isOpen }))
            }
            className="px-1.5 py-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={isOpen ? t('Collapse') : t('Expand')}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!section.present && (
        <p className="text-xs text-[var(--text-muted)] italic">
          {t('This document does not have this section.')}
        </p>
      )}

      {isOpen && (
        <div className="space-y-4">
          {Object.values(section.fields).map((field) => (
            <FieldRow
              key={`${section.key}.${field.key}`}
              field={field}
              status={statusOf(decisionKey(section.key, null, field.key))}
              onChange={(value) => onEdit(section.key, null, 0, field.key, value)}
              t={t}
            />
          ))}

          {section.entries.map((entry, index) => (
            <div
              key={entry.id}
              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--text-primary)] truncate">{entry.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${CONFIDENCE_STYLES[entry.confidence]}`}
                >
                  {t(CONFIDENCE_LABELS[entry.confidence])}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(entry.fields).map((field) => (
                  <FieldRow
                    key={`${entry.id}.${field.key}`}
                    field={field}
                    compact
                    status={statusOf(decisionKey(section.key, entry.id, field.key))}
                    onChange={(value) => onEdit(section.key, entry.id, index, field.key, value)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* One field                                                                   */
/* -------------------------------------------------------------------------- */

interface FieldRowProps {
  field: CvExtractedField;
  status: CvFieldStatus;
  onChange: (value: string) => void;
  compact?: boolean;
  t: (key: string) => string;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, status, onChange, compact, t }) => {
  const [value, setValue] = useState(field.value ?? '');
  const [showEvidence, setShowEvidence] = useState(false);

  const commit = (next: string) => {
    setValue(next);
    onChange(next);
  };

  const missing = field.status === 'missing';

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-[var(--text-secondary)]">{t(field.label)}</label>
        <div className="flex items-center gap-1.5">
          {status === 'edited' && (
            <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-surface)] text-[var(--color-primary-text)] text-[10px] font-bold">
              {t('Corrected')}
            </span>
          )}
          {status === 'confirmed' && (
            <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-success)]/12 text-[var(--color-success)] text-[10px] font-bold">
              {t('Accepted')}
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${CONFIDENCE_STYLES[field.confidence]}`}
          >
            {missing ? t('Missing') : t(CONFIDENCE_LABELS[field.confidence])}
          </span>
        </div>
      </div>

      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        placeholder={missing ? t('Not found in the document — type it here') : undefined}
        className={`w-full px-3 py-2 rounded-lg border bg-[var(--surface-main)] text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)] ${
          missing ? 'border-[var(--color-warning)]/40' : 'border-[var(--border-subtle)]'
        }`}
      />

      {field.evidence.length > 0 && (
        <button
          type="button"
          onClick={() => setShowEvidence((previous) => !previous)}
          className="text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {showEvidence ? t('Hide the source') : t('Where this came from')}
        </button>
      )}

      {showEvidence &&
        field.evidence.map((evidence, index) => (
          <p
            key={`${evidence.text}-${index}`}
            className="text-[10px] leading-relaxed text-[var(--text-muted)] bg-[var(--surface-secondary)]/50 rounded-lg px-2.5 py-1.5 border-l-2 border-[var(--border-subtle)]"
          >
            {evidence.text}
          </p>
        ))}

      {field.issues.length > 0 && (
        <ul className="space-y-0.5">
          {field.issues.map((issue, index) => (
            <li key={index} className="text-[10px] text-[var(--color-warning)] leading-relaxed">
              {t(issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
