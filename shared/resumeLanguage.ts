/**
 * The resume language.
 *
 * The platform has three separate languages and they are easy to confuse:
 *
 *  - the INTERFACE language is the language the application itself is written
 *    in. It is chosen in the header and in Settings, and it changes every
 *    label on the screen.
 *  - the RESUME language is the language the candidate's CV is written in. It
 *    is chosen in the CV Studio, and it changes the document, the section
 *    headings on it, and the language the assistant writes in when it is
 *    asked for CV content.
 *  - the AI RESPONSE language is the language every other generated answer is
 *    written in. It lives in Settings.
 *
 * Changing the resume language must NOT change the interface language: an
 * Arabic interface with an English CV is an ordinary thing to want, and a
 * candidate preparing an English CV for an international employer should not
 * have the whole product flip into Arabic because they did.
 *
 * The resume language also must not rewrite the facts. An employer, a
 * university, a certification body and a certificate name are proper nouns:
 * they are written the way the issuer writes them. What the resume language
 * changes is the wording around them — the section headings, the bullet
 * phrasing, the summary, and anything the assistant generates.
 */

/** The languages a CV can be written in. */
export type ResumeLanguage = 'ar' | 'en';

/** The writing direction of a language. */
export type ResumeDirection = 'rtl' | 'ltr';

export interface ResumeLanguageOption {
  code: ResumeLanguage;
  /** The name of the language, written in that language. */
  nativeLabel: string;
  /** The name of the language, written in English. */
  englishLabel: string;
  direction: ResumeDirection;
}

/**
 * The languages on offer.
 *
 * The native label comes first so the picker reads correctly in both
 * directions: an Arabic speaker sees "العربية" first, and an English speaker
 * sees "English" first.
 */
export const RESUME_LANGUAGES: readonly ResumeLanguageOption[] = [
  { code: 'ar', nativeLabel: 'العربية', englishLabel: 'Arabic', direction: 'rtl' },
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', direction: 'ltr' },
];

/** The language a CV is written in when the candidate has not chosen one. */
export const DEFAULT_RESUME_LANGUAGE: ResumeLanguage = 'en';

/** True when the value is one of the languages a CV can be written in. */
export function isResumeLanguage(value: unknown): value is ResumeLanguage {
  return typeof value === 'string' && (RESUME_LANGUAGES as readonly { code: string }[]).some((entry) => entry.code === value);
}

/**
 * Turns anything into a usable resume language.
 *
 * A stored value that is missing, stale or corrupted falls back to the
 * default rather than putting the document into a language nobody asked for.
 */
export function normalizeResumeLanguage(value: unknown): ResumeLanguage {
  if (isResumeLanguage(value)) return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered.startsWith('ar')) return 'ar';
    if (lowered.startsWith('en')) return 'en';
  }
  return DEFAULT_RESUME_LANGUAGE;
}

/** The writing direction of a resume language. */
export function resumeDirection(language: ResumeLanguage): ResumeDirection {
  return RESUME_LANGUAGES.find((entry) => entry.code === language)?.direction ?? 'ltr';
}

/** True when the resume is written right to left. */
export function isResumeRtl(language: ResumeLanguage): boolean {
  return resumeDirection(language) === 'rtl';
}

/**
 * The label for a language.
 *
 * The native name is used, because a candidate looking for "the language of
 * my CV" is looking for it in their own words.
 */
export function resumeLanguageLabel(code: ResumeLanguage): string {
  const option = RESUME_LANGUAGES.find((entry) => entry.code === code);
  if (!option) return RESUME_LANGUAGES[0].nativeLabel;
  return option.nativeLabel;
}

/**
 * The name of a language as the AI is told about it.
 *
 * The model writes better when it is told the name of the language in that
 * language, so the Arabic option says "Arabic" in Arabic and the English
 * option says "English" in English.
 */
export function resumeLanguageInstruction(code: ResumeLanguage): string {
  return code === 'ar'
    ? 'Write the answer in Arabic.'
    : 'Write the answer in English.';
}

/**
 * The section headings of a CV, in the language the CV is written in.
 *
 * These are the headings printed on the document itself. They are not the
 * interface labels: the interface label for "Summary" may be translated, but
 * the heading printed on an English CV is "Professional Summary" whatever the
 * interface is set to.
 */
export const RESUME_SECTION_HEADINGS: Record<ResumeLanguage, Record<string, string>> = {
  en: {
    summary: 'Professional Summary',
    experience: 'Work Experience',
    education: 'Education',
    projects: 'Projects',
    skills: 'Core Skills & Technologies',
    certifications: 'Certifications',
    volunteering: 'Volunteering',
    courses: 'Completed Courses',
    languages: 'Languages',
    links: 'Links',
    awards: 'Awards',
  },
  ar: {
    summary: 'الملخص المهني',
    experience: 'الخبرة العملية',
    education: 'المؤهلات العلمية',
    projects: 'المشاريع',
    skills: 'المهارات والتقنيات الأساسية',
    certifications: 'الشهادات',
    volunteering: 'العمل التطوعي',
    courses: 'الدورات المكتملة',
    languages: 'اللغات',
    links: 'الروابط',
    awards: 'الجوائز',
  },
};

/**
 * The heading for one section, in the language the CV is written in.
 *
 * An unknown section falls back to the English heading rather than to an
 * empty label, because a document with a blank heading is worse than a
 * document with an English one.
 */
export function resumeSectionHeading(
  language: ResumeLanguage,
  section: string
): string {
  const table = RESUME_SECTION_HEADINGS[language] ?? RESUME_SECTION_HEADINGS.en;
  return table[section] ?? RESUME_SECTION_HEADINGS.en[section] ?? section;
}
