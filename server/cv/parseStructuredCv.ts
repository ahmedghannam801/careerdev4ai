/**
 * Deterministic structured CV parser.
 *
 * This is the second stage of the staged CV pipeline. It consumes positioned
 * text blocks from `documentExtraction.ts` and produces the CV profile the
 * review UI shows. It never sends the document to an AI model as the parser of
 * record, and it never invents a value that is not present in the document:
 *
 *   - a location is only taken from the header/contact area, never from a
 *     university or employer line;
 *   - an experience entry needs a role/company line and/or an explicit date
 *     range, so a stray sentence cannot become a job;
 *   - education entries need a degree or an institution;
 *   - certifications keep their exact wording, with no invented provider or
 *     issue year.
 *
 * Every field carries evidence and a confidence score so the review UI can
 * show why a value exists and what was missing.
 */
import type { DocumentBlock, DocumentExtraction } from './documentExtraction.ts';
import { CATALOG_SKILL_NAMES } from '../../shared/careerRoles.ts';
import { normalizeProfileUrl } from '../../shared/urls.ts';
import { isSkillSectionHeader } from '../../shared/cvDedupe.ts';

export interface ParsedCvExperience {
  id: string;
  company: string;
  role: string;
  period: string;
  location: string;
  bullets: string[];
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  /**
   * The kind of engagement: Internship, Full-time, Contract and so on.
   *
   * It belongs to the record it was written in, not to a record of its own.
   * A CV that lists "Data Analyst Trainee", the training organisation, then
   * "Internship" is describing ONE placement, and the parser used to read
   * that third line as a section heading and throw it away.
   */
  employmentType?: string;
}

export interface ParsedCvEducation {
  id: string;
  institution: string;
  degree: string;
  field: string;
  period: string;
  gpa?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export interface ParsedCvProject {
  id: string;
  title: string;
  role: string;
  link?: string;
  technologies: string[];
  bullets: string[];
}

/** One internship placement, as it was read out of the document. */
export interface ParsedCvInternship {
  id: string;
  organization: string;
  role: string;
  period: string;
  location: string;
  bullets: string[];
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

/** One language the document listed. */
export interface ParsedCvLanguage {
  id: string;
  name: string;
  level: string;
}

/** One award or honour, as it was read out of the document. */
export interface ParsedCvAward {
  id: string;
  title: string;
  issuer: string;
  date: string;
  description: string;
}

/** One publication, as it was read out of the document. */
export interface ParsedCvPublication {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url: string;
  description: string;
}

/** One piece of research work, as it was read out of the document. */
export interface ParsedCvResearch {
  id: string;
  title: string;
  institution: string;
  period: string;
  description: string;
  bullets: string[];
}

/** One leadership or committee role, as it was read out of the document. */
export interface ParsedCvLeadership {
  id: string;
  organization: string;
  role: string;
  period: string;
  description: string;
  bullets: string[];
}

export interface ParsedCv {
  documentType: 'cv';
  fullName: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  linkedin: string;
  github: string;
  website: string;
  experiences: ParsedCvExperience[];
  internships: ParsedCvInternship[];
  education: ParsedCvEducation[];
  projects: ParsedCvProject[];
  skillsList: string[];
  certifications: string[];
  certificationDetails: Array<{
    name: string;
    issuer: string;
    issueDate: string;
    /** The line shown under the certificate, when the CV gave one. */
    description: string;
    /** The tools the certificate covered, when the CV listed them. */
    skills: string[];
    /** The identifier the issuing body printed on the certificate. */
    credentialId: string;
  }>;
  courses: Array<{ id: string; title: string; provider: string; date: string; description: string }>;
  languages: ParsedCvLanguage[];
  volunteering: ParsedCvInternship[];
  awards: ParsedCvAward[];
  publications: ParsedCvPublication[];
  research: ParsedCvResearch[];
  leadership: ParsedCvLeadership[];
}

export interface CvConfidence {
  overall: number;
  personal: number;
  summary: number;
  experience: number;
  education: number;
  skills: number;
  projects: number;
  certifications: number;
  internships: number;
  courses: number;
  languages: number;
  volunteering: number;
  awards: number;
  publications: number;
  research: number;
  leadership: number;
}

export interface CvEvidence {
  field: string;
  text: string;
  page?: number;
}

export interface CvExtractionMetadata {
  method: 'deterministic';
  format: DocumentExtraction['format'];
  pageCount: number;
  layout: DocumentExtraction['layout'];
  characterCount: number;
  wordCount: number;
  confidence: CvConfidence;
  evidence: CvEvidence[];
  warnings: string[];
}

export type SectionKey =
  | 'header'
  | 'contact'
  | 'summary'
  | 'experience'
  | 'internships'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'courses'
  | 'languages'
  | 'volunteering'
  | 'awards'
  | 'publications'
  | 'research'
  | 'leadership'
  | 'other';

interface SectionHeading {
  key: SectionKey;
  remainder: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  period: string;
  startIndex: number;
  endIndex: number;
  startDisplay: string;
  endDisplay: string;
}

/* -------------------------------------------------------------------------- */
/* Section detection                                                          */
/* -------------------------------------------------------------------------- */

const SECTION_PATTERNS: Array<{ key: SectionKey; pattern: RegExp }> = [
  {
    key: 'contact',
    pattern:
      /^(?:contact(?:\s+details|\s+information)?|personal\s+details|contact\s+info|معلومات?\s+التواصل|بيانات?\s+التواصل|التواصل|معلومات?\s+شخصية)$/iu,
  },
  {
    key: 'summary',
    pattern:
      /^(?:professional\s+summary|career\s+summary|executive\s+summary|summary|profile|about(?:\s+me)?|career\s+objective|objective|professional\s+profile|الملخص(?:\s+المهني)?|نبذة(?:\s+تعريفية)?(?:\s+عني)?|نبذة\s+عن\s+ moi|الهدف\s+المهني|ملخص)$/iu,
  },
  {
    key: 'experience',
    pattern:
      /^(?:work\s+experience|professional\s+experience|employment\s+(?:history|experience)|work\s+history|career\s+history|experience|employment|الخبرة\s+العملية|الخبرات|الخبرة|سجل\s+العمل|العمل|الخلفية\s+الوظيفية)$/iu,
  },
  {
    key: 'internships',
    pattern:
      /^(?:internships?|internship\s+(?:experience|programme|program)|placements?|التدريبات?|فترات?\s+التدريب|تدريبات)$/iu,
  },
  {
    key: 'education',
    pattern:
      /^(?:education(?:\s+and\s+training)?|academic\s+(?:background|history|qualifications)|educational\s+background|qualifications|المؤهلات(?:\s+العلمية)?|التعليم|الدرجات\s+العلمية|الشهادات\s+الجامعية|الخلفية\s+التعليمية)$/iu,
  },
  {
    key: 'skills',
    pattern:
      /^(?:technical\s+skills|core\s+skills|key\s+skills|professional\s+skills|skills(?:\s+and\s+tools)?|core\s+competencies|competencies|areas\s+of\s+expertise|technologies|tools(?:\s+and\s+technologies)?|tech\s+stack|المهارات(?:\s+الفنية|\s+الأساسية)?|الكفاءات|المهارات\s+والأدوات|التقنيات)$/iu,
  },
  {
    key: 'projects',
    pattern: /^(?:key\s+projects|selected\s+projects|personal\s+projects|technical\s+projects|projects|portfolio|المشاريع|مشاريع|أعمال)$/iu,
  },
  {
    key: 'certifications',
    pattern:
      /^(?:certifications?|certificates?|licenses?(?:\s+and\s+certifications?)?|credentials|professional\s+development|الشهادات(?:\s+المهنية)?|الاعتمادات|التراخيص|التطوير\s+المهني)$/iu,
  },
  {
    key: 'courses',
    pattern:
      /^(?:courses?|training(?:\s+(?:and\s+certifications|courses))?|completed\s+courses?|الدورات?(?:\s+التدريبية|\s+المكتملة)?|التدريب|الدورات\s+المكتملة)$/iu,
  },
  {
    key: 'languages',
    pattern:
      /^(?:languages(?:\s+spoken|\s+proficiency)?|spoken\s+languages|اللغات(?:\s+المتحدثة)?|المهارات\s+اللغوية)$/iu,
  },
  {
    key: 'volunteering',
    pattern:
      /^(?:volunteer(?:ing)?(?:\s+experience)?|community\s+service|العمل\s+التطوعي|التطوع|الأنشطة\s+التطوعية)$/iu,
  },
  {
    key: 'awards',
    pattern: /^(?:awards?|honou?rs?|الجوائز?(?:\s+والتكريم)?|التكريم)$/iu,
  },
  {
    key: 'publications',
    pattern:
      /^(?:publications?|published\s+works?|papers?|المنشورات|مقالات|الأبحاث\s+المنشورة|النشر)$/iu,
  },
  {
    key: 'research',
    pattern: /^(?:research(?:\s+(?:work|experience|projects))?|الأبحاث|البحث\s+العلمي|البحوث)$/iu,
  },
  {
    key: 'leadership',
    pattern:
      /^(?:leadership|leadership\s+and\s+volunteering|committee\s+roles?|القيادة|الأدوار\s+القيادية|الأنشطة\s+القيادية)$/iu,
  },
  {
    key: 'other',
    pattern:
      /^(?:interests|hobbies|references|achievements|additional\s+information|الهوايات|المراجع|معلومات\s+إضافية)$/iu,
  },
];

function cleanHeadingCandidate(text: string): string {
  return text
    .replace(/^[\s#*•·|\-–—]+/, '')
    .replace(/[\s#*•·|\-–—:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSectionHeading(text: string): SectionHeading | null {
  const clean = cleanHeadingCandidate(text);
  if (!clean || clean.length > 48) return null;
  for (const entry of SECTION_PATTERNS) {
    if (entry.pattern.test(clean)) return { key: entry.key, remainder: '' };
  }

  // "SKILLS: SQL, Python" is a heading and content on one line. The same
  // shape appears in an Arabic CV ("المهارات: SQL, Python"), so the heading
  // part is any run of letters rather than only Latin ones.
  const inline = text.match(/^([\p{L}][\p{L} &/]+?)\s*:\s*(.+)$/u);
  if (inline) {
    const heading = cleanHeadingCandidate(inline[1]);
    if (heading.length <= 40) {
      for (const entry of SECTION_PATTERNS) {
        if (entry.pattern.test(heading)) {
          return { key: entry.key, remainder: inline[2].trim() };
        }
      }
    }
  }
  return null;
}

function isBulletLine(text: string): boolean {
  return /^\s*[•●▪◦‣∙·*\-–—]\s+/.test(text);
}

function stripBullet(text: string): string {
  return text.replace(/^\s*[•●▪◦‣∙·*\-–—]\s+/, '').trim();
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The months a CV may name them by.
 *
 * Each entry is the pattern that recognises the month, the number, the
 * English short name and the Arabic one. The document's own wording is
 * kept: an Arabic CV keeps its Arabic months, because the period a
 * candidate wrote is part of what they wrote.
 */
const MONTHS: Array<[RegExp, number, string, string]> = [
  [/^jan(?:uary)?\.?$/i, 1, 'Jan', 'يناير'],
  [/^feb(?:ruary)?\.?$/i, 2, 'Feb', 'فبراير'],
  [/^mar(?:ch)?\.?$/i, 3, 'Mar', 'مارس'],
  [/^apr(?:il)?\.?$/i, 4, 'Apr', 'أبريل'],
  [/^may\.?$/i, 5, 'May', 'مايو'],
  [/^jun(?:e)?\.?$/i, 6, 'Jun', 'يونيو'],
  [/^jul(?:y)?\.?$/i, 7, 'Jul', 'يوليو'],
  [/^aug(?:ust)?\.?$/i, 8, 'Aug', 'أغسطس'],
  [/^sep(?:t(?:ember)?)?\.?$/i, 9, 'Sep', 'سبتمبر'],
  [/^oct(?:ober)?\.?$/i, 10, 'Oct', 'أكتوبر'],
  [/^nov(?:ember)?\.?$/i, 11, 'Nov', 'نوفمبر'],
  [/^dec(?:ember)?\.?$/i, 12, 'Dec', 'ديسمبر'],
  // The Arabic names of the months.
  [/^يناير$/, 1, 'Jan', 'يناير'],
  [/^فبراير$/, 2, 'Feb', 'فبراير'],
  [/^مارس$/, 3, 'Mar', 'مارس'],
  [/^أبريل$|^ابريل$/, 4, 'Apr', 'أبريل'],
  [/^مايو$/, 5, 'May', 'مايو'],
  [/^يونيو$/, 6, 'Jun', 'يونيو'],
  [/^يوليو$/, 7, 'Jul', 'يوليو'],
  [/^أغسطس$|^اغسطس$/, 8, 'Aug', 'أغسطس'],
  [/^سبتمبر$/, 9, 'Sep', 'سبتمبر'],
  [/^أكتوبر$|^اكتوبر$/, 10, 'Oct', 'أكتوبر'],
  [/^نوفمبر$/, 11, 'Nov', 'نوفمبر'],
  [/^ديسمبر$/, 12, 'Dec', 'ديسمبر'],
];

/** True when the text is written in Arabic. */
function isArabicText(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

/** The short name of a month, in the language the document is written in. */
function monthDisplay(entry: [RegExp, number, string, string], arabic: boolean): string {
  return arabic ? entry[3] : entry[2];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

interface NormalizedDateToken {
  iso: string;
  display: string;
  year: number;
  month: number;
  isCurrent: boolean;
}

function normalizeDateToken(raw: string): NormalizedDateToken | null {
  // The strip is Unicode-aware on purpose: a date written in Arabic is
  // written in Arabic letters, and a strip that only knows ASCII would
  // remove every one of them.
  const token = raw
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
  if (!token) return null;

  if (
  /^(present|current|now|today)$/i.test(token) ||
  /^(حتى الآن|حتى الان|الآن|الان|حالياً|حاليا|مستمرة|حالي)$/.test(token)
) {
    const arabic = isArabicText(token);
    return {
      iso: '',
      display: arabic ? 'حتى الآن' : 'Present',
      year: 0,
      month: 0,
      isCurrent: true,
    };
  }

  // YYYY-MM-DD
  let match = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        iso: `${year}-${pad2(month)}-${pad2(day)}`,
        display: `${MONTHS[month - 1]?.[2] ?? month} ${year}`,
        year,
        month,
        isCurrent: false,
      };
    }
  }

  // Month YYYY / Mon YYYY / Mon 'YY
  const monthYear = token.match(/^([\p{L}]+)\.?\s*['’]?(\d{2,4})$/u);
  if (monthYear) {
    const monthEntry = MONTHS.find(([regex]) => regex.test(monthYear[1]));
    if (monthEntry) {
      let year = Number(monthYear[2]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const arabic = isArabicText(monthYear[1]);
      return {
        iso: `${year}-${pad2(monthEntry[1])}-01`,
        display: `${monthDisplay(monthEntry, arabic)} ${year}`,
        year,
        month: monthEntry[1],
        isCurrent: false,
      };
    }
  }

  // MM/YYYY or MM-YYYY
  match = token.match(/^(\d{1,2})[./-](\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return {
        iso: `${year}-${pad2(month)}-01`,
        display: `${MONTHS[month - 1]?.[2] ?? month} ${year}`,
        year,
        month,
        isCurrent: false,
      };
    }
  }

  // YYYY/MM or YYYY-MM
  match = token.match(/^(\d{4})[./-](\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return {
        iso: `${year}-${pad2(month)}-01`,
        display: `${MONTHS[month - 1]?.[2] ?? month} ${year}`,
        year,
        month,
        isCurrent: false,
      };
    }
  }

  // Year only
  match = token.match(/^(19|20)\d{2}$/);
  if (match) {
    const year = Number(token);
    return {
      // A year-only date is real evidence, but the month is unknown. The
      // import layer uses the first of January only as a database representation
      // and keeps the display as the year itself.
      iso: `${year}-01-01`,
      display: String(year),
      year,
      month: 0,
      isCurrent: false,
    };
  }

  return null;
}

/**
 * The months a date may name, in the languages a CV is written in.
 *
 * The Arabic names are listed one by one rather than as a general rule: a
 * general rule would match every word in the document, and a date range is
 * found by matching a month, not by guessing.
 */
const ARABIC_MONTH_SOURCE =
  '(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)';

const DATE_TOKEN_SOURCE =
  `(?:${ARABIC_MONTH_SOURCE}\\s*\\d{2,4}|[A-Za-z]{3,9}\\.?\\s*['’]?\\d{2,4}|\\d{1,2}[./-]\\d{4}|\\d{4}[./-]\\d{1,2}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{4})`;
const DATE_RANGE_REGEX = new RegExp(
  `(${DATE_TOKEN_SOURCE})\\s*(?:–|—|-|to|until|through|\\u2013|\\u2014)\\s*(${DATE_TOKEN_SOURCE}|present|current|now|حتى\\s+الآن|حتى\\s+الان|الآن|الان|حالياً|حاليا)`,
  'i'
);

function parseDateRange(text: string): DateRange | null {
  const match = text.match(DATE_RANGE_REGEX);
  if (!match || match.index === undefined) return null;
  const start = normalizeDateToken(match[1]);
  const end = normalizeDateToken(match[2]);
  if (!start || !end) return null;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  return {
    startDate: start.iso,
    endDate: end.iso,
    isCurrent: end.isCurrent,
    period: `${start.display} – ${end.display}`,
    startIndex,
    endIndex,
    startDisplay: start.display,
    endDisplay: end.display,
  };
}

function removeDateRange(text: string, range: DateRange): string {
  return `${text.slice(0, range.startIndex)} ${text.slice(range.endIndex)}`
    .replace(/\s+/g, ' ')
    .replace(/^[\s|,;:–—-]+|[\s|,;:–—-]+$/g, '')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Contact / header                                                           */
/* -------------------------------------------------------------------------- */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const LINKEDIN_REGEX =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile)\/([A-Za-z0-9_-]+)/i;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)/i;
const URL_REGEX = /https?:\/\/[^\s<>()]+/i;
const PHONE_REGEX =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;

function normalizePhone(value: string): string {
  return value.replace(/[^\d+()\s.-]/g, '').replace(/\s+/g, ' ').trim();
}

function findPhone(text: string): string {
  for (const line of text.split('\n')) {
    const candidate = line.match(PHONE_REGEX)?.[0];
    if (!candidate) continue;
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    // Do not mistake a year range for a phone number.
    if (/^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/.test(line.trim())) continue;
    return normalizePhone(candidate);
  }
  return '';
}

function isLocationText(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 80 || /\d|@|https?:|www\./i.test(text)) return false;
  if (
    /\b(university|college|institute|school|academy|polytechnic|company|group|corp|ltd|llc|inc|bank|consulting|technologies|solutions|systems|services|department|team)\b/i.test(
      text
    )
  ) {
    return false;
  }
  // City, Country / City, State / City, Country (Remote)
  //
  // The Arabic comma is its own character, and an Arabic CV uses it, so the
  // pattern has to know about it.
  if (!/^[\p{L}][\p{L}.'’ -]{1,40}[,،]\s*[\p{L}][\p{L}.'’() -]{1,40}$/u.test(text)) {
    return false;
  }
  return true;
}

function findLocation(blocks: DocumentBlock[]): { location: string; evidence?: DocumentBlock } {
  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;
    const explicit = text.match(/\b(?:location|based\s+in|address)\s*[:\-]\s*(.+)$/i);
    if (explicit && isLocationText(explicit[1])) {
      return { location: explicit[1].trim(), evidence: block };
    }
    // Contact lines often combine several facts: "Cairo, Egypt | +20 ...".
    const segments = text.split(/\s*[|•·]\s*/).map((segment) => segment.trim());
    for (const segment of segments) {
      if (isLocationText(segment)) return { location: segment, evidence: block };
    }
    if (/^(remote|remote\s*[-–—]\s*[A-Za-z ]+)$/i.test(text)) {
      return { location: text, evidence: block };
    }
  }
  return { location: '' };
}

/**
 * The words that mean "this line is a section heading", not a name.
 *
 * The Arabic half matters: without it the Arabic heading "الملخص المهني"
 * is a two-word line of letters, and the reader takes it for a name.
 */
const NAME_EXCLUSIONS =
  /\b(resume|curriculum\s+vitae|cv|profile|summary|contact|experience|education|skills|projects|certifications|languages|objective|portfolio|linkedin|github)\b/i;
const ARABIC_NAME_EXCLUSIONS =
  /^(?:السيرة\s+الذاتية|السيرة|الملخص|الملخص\s+المهني|النبذة|نبذة|التواصل|معلومات\s+التواصل|البيانات\s+الشخصية|الخبرة|الخبرة\s+العملية|العمل|التعليم|المؤهلات|المؤهلات\s+العلمية|المهارات|المشاريع|الشهادات|الشهادات\s+المهنية|اللغات|الهدف\s+المهني|الدورات|التدريب|التدريبات|العمل\s+التطوعي|الجوائز|الأبحاث|المنشورات|القيادة|باسم|للتواصل|للتقديم)$/;

/**
 * The words that name a job.
 *
 * A line that names a job is a title, never a person's name, so the two
 * lexicons have to cover the same languages — otherwise an Arabic CV puts
 * its title where its name belongs.
 */
const ROLE_WORDS =
  /\b(engineer|engineering|developer|analyst|manager|director|consultant|specialist|coordinator|designer|architect|scientist|administrator|officer|accountant|auditor|teacher|professor|nurse|doctor|physician|technician|representative|executive|associate|lead|intern|trainee|researcher|strategist|planner|buyer|recruiter|marketer|writer|editor|producer|therapist|lawyer|attorney|paralegal|chef|driver|agent|supervisor|head|chief|owner|founder|president|vice\s+president)\b/i;
const ARABIC_ROLE_WORDS =
  /(?:\b(?:مهندس|محلل|مدير|اختصاصي|أخصائي|منسق|مصمم|باحث|محاسب|مدرس|طبيب|فني|مندوب|مسؤول|رئيس|مؤسس|متدرب|خريج|طالب|مساعد|شريك|مستشار|مخطط|مشتغل|عامل)\b|محلل\s+بيانات|مهندس\s+برمجيات|مهندس\s+خلفيه)/;

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) =>
      part.length === 0
        ? part
        : `${part[0].toLocaleUpperCase()}${part.slice(1).toLocaleLowerCase()}`
    )
    .join(' ');
}

function findName(headerBlocks: DocumentBlock[]): { name: string; evidence?: DocumentBlock } {
  const candidates: Array<{ block: DocumentBlock; score: number }> = [];
  for (let index = 0; index < Math.min(headerBlocks.length, 14); index += 1) {
    const block = headerBlocks[index];
    const text = block.text.trim();
    if (!text || text.length > 60) continue;
    if (EMAIL_REGEX.test(text) || URL_REGEX.test(text) || /\d/.test(text)) continue;
    if (NAME_EXCLUSIONS.test(text) || ARABIC_NAME_EXCLUSIONS.test(text)) continue;
    if (ROLE_WORDS.test(text) || ARABIC_ROLE_WORDS.test(text)) continue;
    if (/[:|@]/.test(text)) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((word) => /^[\p{L}][\p{L}.'’ -]*$/u.test(word))) continue;
    const capitalized = words.every(
      (word) =>
        /^[A-Z\p{Lu}]/u.test(word) ||
        /^[A-Z]{2,}$/.test(word) ||
        word.includes('-') ||
        // A script with no case — Arabic, for one — has nothing to
        // capitalise, so there is nothing for the rule to check.
        !/\p{Lu}|\p{Ll}/u.test(word)
    );
    if (!capitalized) continue;
    const score =
      (block.source === 'heading' ? 40 : 0) +
      (block.fontSize > 0 ? Math.min(30, block.fontSize) : 0) +
      (index < 3 ? 20 : 0);
    candidates.push({ block, score });
  }

  if (candidates.length === 0) return { name: '' };
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0].block;
  const name = /^[A-Z\s.'’ -]+$/.test(chosen.text.trim())
    ? titleCaseName(chosen.text.trim())
    : chosen.text.trim();
  return { name, evidence: chosen };
}

function findTitle(
  headerBlocks: DocumentBlock[],
  nameBlock: DocumentBlock | undefined
): { title: string; evidence?: DocumentBlock } {
  const nameIndex = nameBlock ? headerBlocks.indexOf(nameBlock) : -1;
  for (let index = 0; index < Math.min(headerBlocks.length, 14); index += 1) {
    if (index === nameIndex) continue;
    const block = headerBlocks[index];
    const text = block.text.trim();
    if (!text || text.length < 2 || text.length > 80) continue;
    if (EMAIL_REGEX.test(text) || URL_REGEX.test(text) || /\d/.test(text)) continue;
    if (matchSectionHeading(text) || NAME_EXCLUSIONS.test(text) || ARABIC_NAME_EXCLUSIONS.test(text)) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 8) continue;
    if (!ROLE_WORDS.test(text) && !ARABIC_ROLE_WORDS.test(text)) continue;
    return { title: text.replace(/\s*[|•·].*$/, '').trim(), evidence: block };
  }
  return { title: '' };
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                 */
/* -------------------------------------------------------------------------- */

function looksLikeRole(value: string): boolean {
  return ROLE_WORDS.test(value) || ARABIC_ROLE_WORDS.test(value);
}

/**
 * The words that name an organisation.
 *
 * The Arabic half matters for the same reason the role words do: a line
 * that names an organisation is a company, not a job title.
 */
const ARABIC_COMPANY_WORDS =
  /(?:\b(?:شركه|مجموعة|مجموعات|جامعة|جامعه|معهد|مؤسسة|موؤسسة|بنك|مستشفى|مستشفي|عياده|وكالة|استوديو|حلول|انظمة|خدمات|استشارات|شركاء|جمعيه|فريق|مكتب)\b|مجموعة\s+)/;

function looksLikeCompany(value: string): boolean {
  return (
    /\b(inc|llc|ltd|limited|corp|corporation|company|co\.|group|holdings|bank|university|college|institute|hospital|clinic|agency|studio|labs?|technologies|solutions|systems|services|consulting|partners|associates|foundation|ngo)\b/i.test(
      value
    ) || ARABIC_COMPANY_WORDS.test(value)
  );
}

function splitRoleCompany(value: string): { role: string; company: string } {
  const text = stripBullet(value).trim();
  if (!text) return { role: '', company: '' };

  const separators = [' — ', ' – ', ' | ', ' at ', ' @ ', ', '];
  for (const separator of separators) {
    const index = text.toLowerCase().indexOf(separator.toLowerCase());
    if (index <= 0) continue;
    let left = text.slice(0, index).trim();
    let right = text.slice(index + separator.length).trim();
    if (!left || !right) continue;

    // "Nile Retail Group — Senior Data Analyst" is the reverse of the common
    // "Role — Company" order. The role lexicon decides, not the position.
    if (looksLikeCompany(left) && looksLikeRole(right) && !looksLikeRole(left)) {
      [left, right] = [right, left];
    } else if (!looksLikeRole(left) && looksLikeRole(right) && looksLikeCompany(left)) {
      [left, right] = [right, left];
    }
    return { role: left, company: right };
  }

  if (looksLikeRole(text)) return { role: text, company: '' };
  if (looksLikeCompany(text)) return { role: '', company: text };
  return { role: '', company: '' };
}

function isExperienceHeaderLine(value: string): boolean {
  const text = stripBullet(value).trim();
  if (!text || text.length > 120) return false;
  if (isBulletLine(value)) return false;
  if (parseDateRange(text)) return false;
  if (matchSectionHeading(text)) return false;
  if (EMAIL_REGEX.test(text) || URL_REGEX.test(text)) return false;
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 8) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 14) return false;
  if (/[|—–]/.test(text) || /\bat\b/i.test(text)) return true;
  if (looksLikeRole(text) || looksLikeCompany(text)) return true;
  return false;
}

/**
 * The kinds of engagement a CV names.
 *
 * The canonical spelling is the one stored on the record; the list holds the
 * spellings candidates actually write.
 *
 * The patterns are ANCHORED on purpose. An unanchored "trainee" would match
 * inside "Data Analyst Trainee", and the line that names the role would be
 * read as the employment type and the role would be lost.
 */
const EMPLOYMENT_TYPE_CANONICAL: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: 'Full-time', pattern: /^(?:full[\s-]?time|fulltime)$/i },
  { canonical: 'Part-time', pattern: /^(?:part[\s-]?time|parttime)$/i },
  { canonical: 'Contract', pattern: /^(?:contract|contractor|freelance[\s-]?contract)$/i },
  { canonical: 'Freelance', pattern: /^(?:freelance|self[\s-]?employed)$/i },
  {
    canonical: 'Internship',
    pattern: /^(?:intern|internship|trainee|apprentice|training(?:[\s-]?programme|[\s-]?program)?)$/i,
  },
  { canonical: 'Volunteer', pattern: /^(?:volunteer|voluntary|community[\s-]?service)$/i },
  { canonical: 'Temporary', pattern: /^(?:temporary|temp|seasonal)$/i },
  { canonical: 'Remote', pattern: /^(?:remote|work[\s-]?from[\s-]?home|wfh)$/i },
];

/** The Arabic names of the same. */
const ARABIC_EMPLOYMENT_TYPES: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: 'Full-time', pattern: /^(?:دوام\s*كامل|عمل\s*جزئي\s*كامل)$/u },
  { canonical: 'Part-time', pattern: /^(?:دوام\s*جزئي)$/u },
  { canonical: 'Contract', pattern: /^(?:عقد|عقد\s*مؤقت)$/u },
  { canonical: 'Freelance', pattern: /^(?:عمل\s*حر|مستقل)$/u },
  { canonical: 'Internship', pattern: /^(?:تدريب|تدريب\s*عملي|متدرب)$/u },
  { canonical: 'Volunteer', pattern: /^(?:تطوع|متطوع|عمل\s*تطوعي)$/u },
];

/**
 * Reads the employment type out of a line, if the line names one.
 *
 * Two shapes are recognised:
 *
 *   * the whole line is the type — "Internship", "Full-time";
 *   * the type is in brackets on a line that also names the role —
 *     "Data Analyst Trainee (Internship)".
 *
 * The second shape returns the remaining text as well, so the caller can
 * keep the role and drop the bracket.
 */
export function parseEmploymentType(text: string): { type: string | null; rest: string } {
  const raw = stripBullet(text).trim();
  if (!raw) return { type: null, rest: '' };

  // A bracketed type: "Data Analyst Trainee (Internship)".
  const bracketed = raw.match(/^(.*?)\s*[([]([^)\]]{2,30})[)\]]\s*$/);
  if (bracketed) {
    const inner = bracketed[2].trim();
    const found = findEmploymentType(inner);
    if (found) {
      const rest = bracketed[1].trim();
      // The remainder must still be meaningful on its own; "(Internship)"
      // alone leaves nothing, which is the whole-line case.
      return { type: found, rest };
    }
  }

  // The whole line is the type.
  if (raw.length <= 40) {
    const found = findEmploymentType(raw);
    if (found) return { type: found, rest: '' };
  }

  return { type: null, rest: raw };
}

/**
 * Matches a single line against the employment-type vocabulary.
 */
function findEmploymentType(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  for (const entry of EMPLOYMENT_TYPE_CANONICAL) {
    if (entry.pattern.test(value)) return entry.canonical;
  }
  for (const entry of ARABIC_EMPLOYMENT_TYPES) {
    if (entry.pattern.test(value)) return entry.canonical;
  }
  return null;
}

/**
 * Whether a line is nothing but an employment type.
 *
 * This is what separates "Internship" written as part of an entry from the
 * "INTERNSHIPS" heading that introduces a whole section. The heading is
 * longer, shouty, or both; the type is a single ordinary word.
 */
function isEmploymentTypeLine(text: string): boolean {
  const raw = stripBullet(text).trim();
  if (!raw || raw.length > 40) return false;
  if (raw === raw.toUpperCase() && raw.length > 6) return false;
  return findEmploymentType(raw) !== null;
}

/**
 * The column labels a CV table uses, and what each one means.
 *
 * A CV table says what each column holds by labelling it, so the labels
 * are the only thing that tells the reader which value is the role and
 * which is the company.
 */
const TABLE_COLUMN_LABELS: Record<string, string> = {
  period: 'period',
  dates: 'period',
  date: 'period',
  'date range': 'period',
  role: 'role',
  position: 'role',
  'job title': 'role',
  title: 'role',
  company: 'company',
  employer: 'company',
  organisation: 'company',
  organization: 'company',
  location: 'location',
  place: 'location',
  'المدة': 'period',
  'الفترة': 'period',
  'الوظيفة': 'role',
  'المسمى': 'role',
  'الشركة': 'company',
  'جهة العمل': 'company',
  'الموقع': 'location',
};

/**
 * Reads a section that is written as a table.
 *
 * A CV table puts the label in the first cell of each column and the rows
 * under it, so the reader meets the cells one after the other: a label,
 * the values of that column, the next label, and so on. The values have
 * to be put back into rows before they can be read as roles.
 *
 * It returns null when the section is not a table, and the ordinary reader
 * takes it from there.
 */
function parseTableRoles(blocks: DocumentBlock[]): ParsedCvExperience[] | null {
  const labels: Array<{ index: number; kind: string }> = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const text = blocks[index].text.trim().toLowerCase().replace(/[:：\s]+$/, '');
    const kind = TABLE_COLUMN_LABELS[text];
    if (kind) labels.push({ index, kind });
  }
  if (labels.length < 2) return null;

  // The columns have to be the same width for the section to be a table.
  const stride = labels[1].index - labels[0].index;
  if (stride < 2) return null;
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index].index - labels[index - 1].index !== stride) return null;
  }

  const columns = new Map<string, string[]>();
  for (let index = 0; index < labels.length; index += 1) {
    const start = labels[index].index + 1;
    const end = index + 1 < labels.length ? labels[index + 1].index : blocks.length;
    columns.set(labels[index].kind, blocks.slice(start, end).map((block) => block.text.trim()));
  }

  const periods = columns.get('period') ?? [];
  const roles = columns.get('role') ?? [];
  const companies = columns.get('company') ?? [];
  const locations = columns.get('location') ?? [];
  const rowCount = Math.max(periods.length, roles.length, companies.length);
  if (rowCount === 0) return null;

  const experiences: ParsedCvExperience[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const raw = periods[row] ?? '';
    const range = parseDateRange(raw);
    const role = roles[row] ?? '';
    const company = companies[row] ?? '';
    if (!role && !company) continue;
    experiences.push({
      id: '',
      role,
      company,
      period: range?.period ?? raw,
      location: locations[row] ?? '',
      bullets: [],
      startDate: range?.startDate,
      endDate: range?.endDate,
      isCurrent: range?.isCurrent,
    });
  }

  return experiences.length ? experiences : null;
}

/**
 * A placement written as a season rather than as a range.
 *
 * "Summer 2019" is how an internship is dated, and it is a period the
 * candidate wrote, so it is kept as it stands rather than turned into a
 * range the document never said.
 */
const SEASON_PERIODS: Record<string, [number, number]> = {
  spring: [3, 6],
  summer: [6, 9],
  autumn: [9, 12],
  fall: [9, 12],
  winter: [12, 12],
};

function parseSeasonPeriod(text: string): { period: string; startDate: string; endDate: string } | null {
  const match = text.match(/^(spring|summer|autumn|fall|winter)\s+((?:19|20)\d{2})$/i);
  if (!match) return null;
  const year = Number(match[2]);
  const months = SEASON_PERIODS[match[1].toLowerCase()];
  if (!months) return null;
  return {
    period: `${match[1]} ${year}`,
    startDate: `${year}-${pad2(months[0])}-01`,
    endDate: `${year}-${pad2(months[1])}-28`,
  };
}

/**
 * Reads a section of roles: work experience, internships, volunteering or
 * leadership.
 *
 * The four sections are written the same way in every CV — a role, an
 * organisation, sometimes a place and a date range — so they are read by the
 * same reader. What differs is only what the section is called, and that is
 * decided before the reader is called.
 *
 * A section written as a table is read by the table reader instead: the
 * labels say which column is which, and reading the cells in the order
 * they appear would put the header row in the work history.
 */
export function parseExperience(blocks: DocumentBlock[]): ParsedCvExperience[] {
  const table = parseTableRoles(blocks);
  if (table) {
    return table
      .slice(0, 20)
      .map((entry, index) => ({ ...entry, id: `exp-${index + 1}` }));
  }
  const experiences: ParsedCvExperience[] = [];
  let current: ParsedCvExperience | null = null;
  let pendingRange: DateRange | null = null;

  const finish = () => {
    if (!current) return;
    if (!current.role && !current.company) {
      current = null;
      return;
    }
    const key = `${current.role.toLowerCase()}|${current.company.toLowerCase()}|${current.period.toLowerCase()}`;
    const existing = experiences.find(
      (entry) =>
        `${entry.role.toLowerCase()}|${entry.company.toLowerCase()}|${entry.period.toLowerCase()}` ===
        key
    );
    if (existing) {
      existing.bullets = Array.from(new Set([...existing.bullets, ...current.bullets]));
    } else {
      experiences.push(current);
    }
    current = null;
  };

  for (const block of blocks) {
    const raw = block.text.trim();
    if (!raw) continue;

    // The employment type belongs to the entry it is written in.
    //
    // It is read BEFORE the section-heading check, because "Internship" is
    // both a legitimate section heading and a legitimate line inside an
    // entry. The difference is whether an entry is open: a heading is
    // followed by another heading, a type is followed by the rest of the
    // entry.
    //
    // Only a line that is NOTHING BUT a type is handled here. A type in
    // brackets on a line that also names the role ("Data Analyst Trainee
    // (Internship)") is handled with the rest of that line, further down.
    const employmentType = isEmploymentTypeLine(raw) ? findEmploymentType(raw) : null;
    if (employmentType) {
      if (current && !current.employmentType) {
        // Attach it to the open entry.
        current.employmentType = employmentType;
        continue;
      }
      if (!current) {
        // No entry is open, so this line starts one: the type is known and
        // the role and the organisation come after it.
        current = {
          id: '',
          role: '',
          company: '',
          period: '',
          location: '',
          bullets: [],
          employmentType,
        };
        continue;
      }
      // An entry is already open and already has a type. This is a new
      // placement that starts with its type.
      finish();
      current = {
        id: '',
        role: '',
        company: '',
        period: '',
        location: '',
        bullets: [],
        employmentType,
      };
      continue;
    }

    if (matchSectionHeading(raw)) continue;

    const range = parseDateRange(raw);
    const bullet = isBulletLine(raw);

    // A placement written as a season — "Summer 2019 | Cairo, Egypt" — is a
    // period the candidate wrote. It is kept as it stands rather than being
    // read as a role.
    const season = range ? null : parseSeasonPeriod(raw.split(/\s*[|·]\s*/)[0].trim());
    if (season) {
      const remainder = raw.slice(raw.indexOf(season.period) + season.period.length).replace(/^[\s|,;:–—-]+/, '').trim();
      if (current && !current.period) {
        current.period = season.period;
        current.startDate = season.startDate;
        current.endDate = season.endDate;
        if (!current.location && isLocationText(remainder)) current.location = remainder;
        continue;
      }
      if (!current) {
        pendingRange = {
          startDate: season.startDate,
          endDate: season.endDate,
          isCurrent: false,
          period: season.period,
          startIndex: 0,
          endIndex: 0,
          startDisplay: season.period,
          endDisplay: season.period,
        };
        continue;
      }
    }

    if (bullet) {
      const text = stripBullet(raw);
      if (!text) continue;
      if (!current) {
        // A bullet without a preceding entry has no owner. It is not a job.
        continue;
      }
      current.bullets.push(text);
      continue;
    }

    if (range) {
      const remainder = removeDateRange(raw, range);
      if (current && !current.period) {
        current.period = range.period;
        current.startDate = range.startDate;
        current.endDate = range.endDate;
        current.isCurrent = range.isCurrent;
        if (!current.location && isLocationText(remainder)) current.location = remainder;
        continue;
      }

      const split = splitRoleCompany(remainder);
      if (split.role || split.company) {
        finish();
        current = {
          id: '',
          role: split.role,
          company: split.company,
          period: range.period,
          location: isLocationText(remainder) ? remainder : '',
          bullets: [],
          startDate: range.startDate,
          endDate: range.endDate,
          isCurrent: range.isCurrent,
        };
        if (!current.location) {
          const afterRange = raw.slice(range.endIndex).replace(/^[\s|,;:–—-]+/, '').trim();
          if (isLocationText(afterRange)) current.location = afterRange;
        }
        continue;
      }

      if (!current) {
        pendingRange = range;
        continue;
      }

      if (!current.period) {
        current.period = range.period;
        current.startDate = range.startDate;
        current.endDate = range.endDate;
        current.isCurrent = range.isCurrent;
        if (!current.location && isLocationText(remainder)) current.location = remainder;
      }
      continue;
    }

    if (isExperienceHeaderLine(raw)) {
      // A line that names the role may also name the engagement:
      // "Data Analyst Trainee (Internship)". The type belongs to the entry,
      // not to a record of its own.
      const headerEmployment = parseEmploymentType(raw);
      const headerText = headerEmployment.rest || raw;

      const split = splitRoleCompany(headerText);

      // The open entry is still open: it has no dates and no bullets yet, so
      // the lines are still describing it rather than a new one.
      const openEntry =
        current && !current.period && current.bullets.length === 0 ? current : null;

      if (openEntry) {
        // The organisation comes first and the role second — "University Data
        // Analytics Training" then "Data Analyst Trainee".
        //
        // Read on its own the organisation looks like a complete entry with no
        // role, so the parser used to close it and start a second one. The
        // fix is to hold an entry that has an organisation but no role open,
        // and fill the role in when it arrives.
        if (!openEntry.role && !openEntry.company && split.company && !split.role) {
          openEntry.company = split.company;
          continue;
        }

        // The role comes first and the organisation second — "Senior Data
        // Analyst" then "Nile Retail Group".
        if (openEntry.role && !openEntry.company && split.company && !split.role) {
          openEntry.company = split.company;
          continue;
        }

        // The organisation came first and the role arrives now.
        if (!openEntry.role && openEntry.company && split.role && !split.company) {
          openEntry.role = split.role;
          if (headerEmployment.type && !openEntry.employmentType) {
            openEntry.employmentType = headerEmployment.type;
          }
          continue;
        }

        // The entry was opened by its employment type ("Internship") and the
        // role and organisation follow it.
        if (!openEntry.role && !openEntry.company && split.role) {
          openEntry.role = split.role;
          if (split.company) openEntry.company = split.company;
          if (headerEmployment.type && !openEntry.employmentType) {
            openEntry.employmentType = headerEmployment.type;
          }
          continue;
        }

        // The entry was opened by its employment type and only the
        // organisation follows it.
        if (!openEntry.role && !openEntry.company && split.company) {
          openEntry.company = split.company;
          continue;
        }

        // The entry already has a role and an organisation. The only thing
        // this line can still add is the engagement type.
        if (headerEmployment.type && !openEntry.employmentType) {
          openEntry.employmentType = headerEmployment.type;
          continue;
        }
      }

      finish();
      current = {
        id: '',
        role: split.role,
        company: split.company,
        period: '',
        location: '',
        bullets: [],
        employmentType: headerEmployment.type ?? undefined,
      };
      if (!current.role && !current.company) {
        current.role = headerText;
      }
      if (pendingRange) {
        current.period = pendingRange.period;
        current.startDate = pendingRange.startDate;
        current.endDate = pendingRange.endDate;
        current.isCurrent = pendingRange.isCurrent;
        pendingRange = null;
      }
      continue;
    }

    if (!current) continue;
    if (!current.role && !current.company) {
      current.role = raw;
      continue;
    }
    if (!current.period && isLocationText(raw)) {
      current.location = raw;
      continue;
    }
    if (current.period || current.bullets.length > 0) {
      current.bullets.push(raw);
    } else {
      // A second descriptive line before the date belongs to the entry.
      current.bullets.push(raw);
    }
  }

  finish();

  return experiences
    .filter((entry) => entry.role.trim() || entry.company.trim())
    .slice(0, 20)
    .map((entry, index) => ({ ...entry, id: `exp-${index + 1}` }));
}

/* -------------------------------------------------------------------------- */
/* Education                                                                  */
/* -------------------------------------------------------------------------- */

const DEGREE_REGEX =
  /\b(ph\.?\s?d\.?|d\.?phil|m\.?b\.?a|b\.?s\.?c\.?|m\.?s\.?c\.?|b\.?a\.?|m\.?a\.?|b\.?eng\.?|m\.?eng\.?|bachelor(?:'s)?(?:\s+of\s+[A-Za-z ]+)?|master(?:'s)?(?:\s+of\s+[A-Za-z ]+)?|associate(?:'s)?(?:\s+of\s+[A-Za-z ]+)?|diploma|high\s+school\s+diploma|secondary\s+school)\b/i;

/**
 * The Arabic names of the degrees.
 *
 * An Arabic CV writes "بكالوريوس" where an English one writes "BSc", and
 * without this the whole education section reads as one long line.
 */
const ARABIC_DEGREE_REGEX =
  /(?:بكالوريوس|ماجستير|دكتوراه|دبلوم|ليسانس|بكالوريوس\s+هندسه|ماجستير\s+اداره|ثانوية|دبلوم\s+عالي)/u;

const INSTITUTION_REGEX =
  /\b(university|college|institute|institution|school|academy|polytechnic|faculty)\b/i;

/** The Arabic names of the institutions. */
const ARABIC_INSTITUTION_REGEX = /(?:جامعه|جامعة|معهد|كليه|كلية|مدرسه|مدرسة|اكاديمي|أكاديمي)/u;

interface EducationParts {
  institution: string;
  degree: string;
  field: string;
}

function splitDegreeField(degreeText: string): { degree: string; field: string } {
  const text = degreeText.replace(/\s+/g, ' ').trim();
  if (!text) return { degree: '', field: '' };

  const inMatch = text.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch && (DEGREE_REGEX.test(inMatch[1]) || ARABIC_DEGREE_REGEX.test(inMatch[1]))) {
    return { degree: inMatch[1].trim(), field: inMatch[2].trim() };
  }

  const arabicDegree = text.match(ARABIC_DEGREE_REGEX);
  const match = text.match(DEGREE_REGEX);
  if (!match && !arabicDegree) return { degree: '', field: text };
  const found = match?.[0] ?? arabicDegree?.[0] ?? '';
  const degree = found.trim();
  const remainder = text.slice((match?.index ?? arabicDegree?.index ?? 0) + found.length).trim();
  return { degree, field: remainder.replace(/^[,\-–—:]+/, '').trim() };
}

function parseEducationLine(value: string): EducationParts {
  const text = stripBullet(value).replace(/\s+/g, ' ').trim();
  if (!text) return { institution: '', degree: '', field: '' };

  const separators = [' — ', ' – ', ' | ', ' at ', ', '];
  for (const separator of separators) {
    const index = text.toLowerCase().indexOf(separator.toLowerCase());
    if (index <= 0) continue;
    const left = text.slice(0, index).trim();
    const right = text.slice(index + separator.length).trim();
    if (!left || !right) continue;

    const leftIsInstitution = INSTITUTION_REGEX.test(left) || ARABIC_INSTITUTION_REGEX.test(left);
    const rightIsInstitution =
      INSTITUTION_REGEX.test(right) || ARABIC_INSTITUTION_REGEX.test(right);
    const leftIsDegree = DEGREE_REGEX.test(left) || ARABIC_DEGREE_REGEX.test(left);
    const rightIsDegree = DEGREE_REGEX.test(right) || ARABIC_DEGREE_REGEX.test(right);

    if (leftIsInstitution && !rightIsInstitution) {
      const degreeParts = splitDegreeField(right);
      return { institution: left, ...degreeParts };
    }
    if (rightIsInstitution && !leftIsInstitution) {
      const degreeParts = splitDegreeField(left);
      return { institution: right, ...degreeParts };
    }
    if (leftIsDegree && !rightIsDegree) {
      const degreeParts = splitDegreeField(left);
      return { institution: right, ...degreeParts };
    }
    if (rightIsDegree && !leftIsDegree) {
      const degreeParts = splitDegreeField(right);
      return { institution: left, ...degreeParts };
    }
  }

  if (
    (INSTITUTION_REGEX.test(text) || ARABIC_INSTITUTION_REGEX.test(text)) &&
    !DEGREE_REGEX.test(text) &&
    !ARABIC_DEGREE_REGEX.test(text)
  ) {
    return { institution: text, degree: '', field: '' };
  }
  if (DEGREE_REGEX.test(text) || ARABIC_DEGREE_REGEX.test(text)) {
    // The degree and institution are in the same fragment, e.g.
    // "BSc Statistics Cairo University". Keep only the degree facts; the
    // institution is not guessed.
    const degreeParts = splitDegreeField(
      text.replace(INSTITUTION_REGEX, '').replace(ARABIC_INSTITUTION_REGEX, '').trim()
    );
    return { institution: '', ...degreeParts };
  }
  return { institution: '', degree: '', field: '' };
}

function parseEducation(blocks: DocumentBlock[]): ParsedCvEducation[] {
  const educations: ParsedCvEducation[] = [];
  let current: ParsedCvEducation | null = null;
  let pendingRange: DateRange | null = null;

  const finish = () => {
    if (!current) return;
    if (!current.institution && !current.degree) {
      current = null;
      return;
    }
    educations.push(current);
    current = null;
  };

  for (const block of blocks) {
    const raw = block.text.trim();
    if (!raw) continue;
    if (matchSectionHeading(raw)) continue;

    const range = parseDateRange(raw);
    if (range) {
      // The grade, written either as "GPA 3.7/4.0" or as "معدل 3.7 من 4".
      const gpaMatch =
        raw.match(/\bGPA\s*:?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i) ??
        raw.match(/معدل\s*:?\s*([0-9.]+)(?:\s*من\s*([0-9.]+))?/u);
      if (current && !current.period) {
        current.period = range.period;
        current.startDate = range.startDate;
        current.endDate = range.endDate;
        current.current = range.isCurrent;
        if (gpaMatch) current.gpa = gpaMatch[1].trim();
        continue;
      }
      if (!current) {
        pendingRange = range;
        continue;
      }
      continue;
    }

    if (isBulletLine(raw) && current) {
      // Coursework and honours lines belong to the entry but are not a new
      // degree; the current schema has no coursework column, so they are
      // deliberately not promoted to a field.
      continue;
    }

    const parts = parseEducationLine(raw);
    if (!parts.institution && !parts.degree) {
      // "Coursework included databases, algorithms..." is not an education
      // entry and must not create one.
      continue;
    }

    finish();
    current = {
      id: '',
      institution: parts.institution,
      degree: parts.degree,
      field: parts.field,
      period: '',
      gpa: '',
    };
    if (pendingRange) {
      current.period = pendingRange.period;
      current.startDate = pendingRange.startDate;
      current.endDate = pendingRange.endDate;
      current.current = pendingRange.isCurrent;
      pendingRange = null;
    }
  }
  finish();

  return educations
    .filter((entry) => entry.institution || entry.degree)
    .slice(0, 8)
    .map((entry, index) => ({
      ...entry,
      id: `edu-${index + 1}`,
      gpa: entry.gpa || undefined,
    }));
}

/* -------------------------------------------------------------------------- */
/* Projects / skills / certifications                                         */
/* -------------------------------------------------------------------------- */

function splitTechnologies(value: string): string[] {
  return value
    .split(/[,;|•·]/)
    .map((technology) => technology.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').trim())
    .filter((technology) => technology.length >= 1 && technology.length <= 40)
    .slice(0, 12);
}

function parseProjects(blocks: DocumentBlock[]): ParsedCvProject[] {
  const projects: ParsedCvProject[] = [];
  let current: ParsedCvProject | null = null;

  const finish = () => {
    if (!current) return;
    if (current.title) projects.push(current);
    current = null;
  };

  for (const block of blocks) {
    const raw = block.text.trim();
    if (!raw) continue;
    if (matchSectionHeading(raw)) continue;
    const bullet = isBulletLine(raw);

    if (bullet) {
      if (current) {
        const text = stripBullet(raw);
        if (text) current.bullets.push(text);
      }
      continue;
    }

    if (raw.length <= 100) {
      const split = raw.match(/^(.{3,90}?)\s+[—–-]\s+(.+)$/);
      const wordTotal = raw.split(/\s+/).filter(Boolean).length;
      // A full sentence under an existing project is its description, not a
      // second project. Without this rule, the sentence following a
      // "Project — Stack" heading was emitted as a project of its own.
      const looksLikeSentence =
        /[.!?]$/.test(raw) || wordTotal > 10 || raw.length > 70;
      if (current && looksLikeSentence && !split) {
        current.bullets.push(raw);
        continue;
      }
      finish();
      current = {
        id: '',
        title: (split?.[1] ?? raw).replace(/^[\s#*]+/, '').trim(),
        role: '',
        technologies: split?.[2] ? splitTechnologies(split[2]) : [],
        bullets: [],
      };
      const url = raw.match(URL_REGEX)?.[0];
      if (url) current.link = url;
      continue;
    }

    if (current) current.bullets.push(raw);
  }
  finish();

  return projects
    .filter((project) => project.title)
    .slice(0, 10)
    .map((project, index) => ({ ...project, id: `proj-${index + 1}` }));
}

/**
 * Multi-token skills that a PDF line wrap can split at a space. The catalogue
 * names are the primary source; the short additions cover common skills that
 * are not attached to a catalogue role (for example "A/B Testing").
 */
const KNOWN_MULTI_WORD_SKILLS = new Set(
  [
    ...CATALOG_SKILL_NAMES,
    'A/B Testing',
    'Microsoft Excel',
    'Power BI',
    'Data Analysis',
    'Data Visualisation',
    'Data Visualization',
    'Google Analytics',
    'Machine Learning',
    'Deep Learning',
    'Project Management',
  ].map((skill) => skill.toLowerCase().replace(/\s+/g, ' ').trim())
);

function parseSkills(blocks: DocumentBlock[]): string[] {
  const skills: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    let value = raw
      .replace(/^[\s\-–—•·*|]+|[\s\-–—•·*|]+$/g, '')
      .replace(/\s*\([^)]{1,30}\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value) return;
    if (value.length < 1 || value.length > 60) return;
    if (/[:@]/.test(value)) return;
    if (value.split(/\s+/).length > 6) return;
    if (/[.!?]$/.test(value)) return;
    if (/^(skills?|tools?|technologies|technical|core|competencies|expertise|languages?)$/i.test(value)) return;
    // "SOFT SKILLS" and "TECHNICAL SKILLS" are headings, not skills. The
    // single-word check above catches "Skills" but not the two-word ones,
    // so the shared heading vocabulary decides here. Without it a candidate's
    // CV imports a skill called "TECHNICAL SKILLS".
    if (isSkillSectionHeader(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    skills.push(value);
  };

  // Flatten the blocks into one token stream. A PDF text layer can split one
  // visual line into several blocks, so a skill such as "A/B Testing" may
  // arrive as "A/B" followed by "Testing". Joining only known multi-word
  // phrases keeps separate skills separate.
  const values: string[] = [];
  for (const block of blocks) {
    let text = block.text.trim();
    if (!text) continue;
    // A category label ("Programming: Python, SQL") is not a skill.
    const category = text.match(/^([A-Za-z][A-Za-z &/]{1,40})\s*:\s*(.+)$/);
    if (category) text = category[2];
    values.push(...text.split(/[,;|•·\n]/));
  }

  for (let index = 0; index < values.length; index += 1) {
    let value = values[index].trim();
    if (!value) continue;

    // A PDF line can break a skill at a slash ("A/" then "B Testing").
    if (/\/\s*$/.test(value) && index + 1 < values.length) {
      const next = values[index + 1].trim();
      if (next) {
        value = `${value} ${next}`.replace(/\/\s+/g, '/');
        index += 1;
      }
    }

    // Rejoin a wrapped known phrase one token at a time. This never
    // concatenates arbitrary adjacent skills.
    while (index + 1 < values.length) {
      const next = values[index + 1].trim();
      if (!next) {
        index += 1;
        continue;
      }
      const combined = `${value} ${next}`.replace(/\s+/g, ' ').trim();
      if (!KNOWN_MULTI_WORD_SKILLS.has(combined.toLowerCase())) break;
      value = combined;
      index += 1;
    }

    add(value);
  }

  return skills.slice(0, 40);
}

/**
 * Words that mark a line as being about a qualification.
 *
 * A line only becomes a certificate when it looks like one. Without this
 * gate a CV line such as "Led 15+ community workshops reaching 200+
 * participants" was imported as a certificate the candidate never earned.
 */
const CERTIFICATION_WORDS =
  /\b(certificat(?:e|ion|ed)|certifications|diploma|certificate|courses?|trainings?|programmes?|programs?|bootcamp|academy|workshops?|pathways?|curriculum|masterclass|nanodegree|licen[cs]e|diplomas?)\b/i;

/**
 * The Arabic names of a qualification.
 *
 * The gate above has to cover the same languages as the rest of the reader:
 * an Arabic CV says "شهادة" where an English one says "certificate", and
 * without this the certificate section of an Arabic CV reads as nothing.
 */
const ARABIC_CERTIFICATION_WORDS =
  /(?:شهادة|شهادات|دوره|دورات|بروتوكول|اعتماد|اعتمادات|رخصه|رخصة|تدريب|معتمد)/u;

/**
 * Organisations that appear as the body that issued a certificate.
 *
 * These are the names a CV actually uses. A line that mentions one of them
 * is about a qualification even when it carries no word like "certificate".
 */
const KNOWN_ISSUERS =
  /\b(coursera|udemy|edx|google|microsoft|amazon|aws|meta|facebook|linkedin|ibm|nvidia|datacamp|scaler|apna|great\s?learning|itida|nti|iti\b|hp\s?life|digital\s?egypt|mohammed\s?bin\s?rashid|university|universit(?:y|é)|institute|center|centre|academy|school|college)\b/i;

/**
 * Lines that are never a certificate, however they are worded.
 *
 * Each one is something a CV contains and an importer has to keep out of the
 * certificate list.
 */
const NEVER_A_CERTIFICATE: RegExp[] = [
  /^view\s+pdf$/i,
  /^portfolio\b/i,
  /^skills?\s*:/i,
  /^certificat(?:e|ion)s?\s*:/i,
  /^\(?\+?\d[\d\s\-()]{6,}\)?$/, // a phone number
  /https?:\/\//i, // a link
  /^[\w.+-]+@[\w-]+\.\w+$/, // an email address
  /^(?:key\s+)?achievements?$/i,
  /^(?:professional\s+)?(?:development|experience|summary|profile|education)$/i,
];

/** A past-tense verb at the start of a line means the line is a sentence. */
const SENTENCE_OPENERS =
  /^(led|managed|delivered|achieved|eliminated|built|developed|conducted|organized|organised|served|increased|reduced|designed|implemented|coordinated|established|founded|supervised|facilitated|automated|earned|completed|created|launched|supported|improved|handled|drove|grew|maintained|presented|produced|provided|reviewed|streamlined|trained|worked|reduced|generated|reduced)\b/i;

/** A month and a year, or a bare year — with or without brackets around it. */
const DATE_SEGMENT =
  /^(?:\(?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\s*\)?|\(?\s*(?:19|20)\d{2}\s*\)?)$/i;

/** The identifier an issuing body prints on the certificate. */
const CREDENTIAL_ID = /\b(?:student\s*id|cert(?:ificate)?\s*id|credential\s*id|id)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\b/i;

/** An organisation name inside a segment. */
function looksLikeIssuer(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed || trimmed.length > 70) return false;
  if (trimmed.split(/\s+/).length > 7) return false;
  if (/^[A-Z][a-z]+$/.test(trimmed) && !KNOWN_ISSUERS.test(trimmed)) return false;
  if (KNOWN_ISSUERS.test(trimmed)) return true;
  if (/\b(university|institute|academy|school|college|centre|center|labs?|ltd|inc|corp|corporation|group)\b/i.test(trimmed)) {
    return true;
  }
  // "ITIDA & NTI" — two organisations joined by an ampersand.
  if (/^[A-Za-z][A-Za-z .'-]{1,30}\s&\s[A-Za-z][A-Za-z .'-]{1,30}$/.test(trimmed)) return true;
  return false;
}

/** A comma-separated list of short tool names. */
function looksLikeSkillList(segment: string): string[] {
  const parts = segment
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [];
  // Every part has to read like a tool name: short, no full stops, no verbs.
  const usable = parts.every(
    (part) =>
      part.length <= 42 &&
      part.split(/\s+/).length <= 5 &&
      !/[.!?]/.test(part) &&
      !SENTENCE_OPENERS.test(part) &&
      !/^\d+$/.test(part)
  );
  if (!usable) return [];
  return parts;
}

/**
 * Splits a certification line into the parts it carries.
 *
 * A CV line often holds several facts in one row: the name, the body that
 * issued it, the date, the hours spent, the credential identifier and the
 * tools it covered. The separator is whatever the CV used.
 *
 * The first part is always the name. Nothing after it can become the name,
 * which is what keeps "Google Data Analytics Professional Certificate" a
 * certificate name rather than a claim that Google issued it.
 */
function splitCertificationParts(text: string): string[] {
  const columns = text
    .split(/\s*[|·•]\s*/)
    .map((column) => column.trim())
    .filter(Boolean);
  const parts: string[] = [];
  for (const column of columns) {
    // A dash inside the column separates the name from its issuer.
    for (const piece of column.split(/\s+[–—]\s+|\s+-\s+/)) {
      const trimmed = piece.trim();
      if (trimmed) parts.push(trimmed);
    }
  }
  return parts;
}

function parseCertifications(blocks: DocumentBlock[]): {
  names: string[];
  details: Array<{
    name: string;
    issuer: string;
    issueDate: string;
    description: string;
    skills: string[];
    credentialId: string;
  }>;
} {
  const names: string[] = [];
  const details: Array<{
    name: string;
    issuer: string;
    issueDate: string;
    description: string;
    skills: string[];
    credentialId: string;
  }> = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    // A PDF line often starts with the column separator.
    const raw = stripBullet(block.text).replace(/\s+/g, ' ').trim();
    const text = raw.replace(/^[|:\s]+/, '').trim();
    if (!text || text.length < 3 || text.length > 160) continue;
    if (matchSectionHeading(text)) continue;
    if (NEVER_A_CERTIFICATE.some((pattern) => pattern.test(text))) continue;

    // A qualification is a noun phrase. A sentence is not.
    if (/[.!?]$/.test(text)) continue;
    if (/%/.test(text)) continue;
    if (SENTENCE_OPENERS.test(text)) continue;
    if (text.split(/\s+/).length > 18) continue;

    const parts = splitCertificationParts(text);
    if (parts.length === 0) continue;

    // The name is the first part. Everything after it carries the facts
    // about it, and nothing after it can become the name.
    const name = parts[0];
    const rest = parts.slice(1);

    // An entry that starts with a phone number, an email address or a link
    // is contact information the layout left in this column, not a
    // qualification.
    if (/^\(?\+?\d[\d\s\-()]{5,}\)?$/.test(name)) continue;
    if (/^[\w.+-]+@[\w-]+\.\w+$/.test(name)) continue;
    if (/^https?:\/\//i.test(name)) continue;

    let issuer = '';
    let issueDate = '';
    let description = '';
    const skills: string[] = [];

    const credentialMatch = text.match(CREDENTIAL_ID);
    const credentialId = credentialMatch ? credentialMatch[1] : '';

    for (const part of rest) {
      // "(120 hrs)" and a hanging "(120 hrs" are both dropped.
      const cleaned = part
        .replace(/\(\s*\d+\s*(?:hrs?|hours?)?[^)]*\)/gi, '') // "(120 hrs)"
        .replace(/\(\s*\d+\s*(?:hrs?|hours?)?$/i, '') // "(120 hrs"
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) continue;

      if (!issueDate && DATE_SEGMENT.test(cleaned)) {
        issueDate = cleaned;
        continue;
      }
      // A credential identifier is the identifier, not a description.
      if (CREDENTIAL_ID.test(cleaned)) continue;

      const partSkills = looksLikeSkillList(cleaned);
      if (partSkills.length >= 2) {
        for (const skill of partSkills) {
          if (!skills.includes(skill)) skills.push(skill);
        }
        continue;
      }
      if (!issuer && looksLikeIssuer(cleaned)) {
        issuer = cleaned;
        continue;
      }
      if (!description && cleaned.length <= 120) {
        description = cleaned;
      }
    }

    // The evidence has to say this is a qualification. A line that mentions
    // no certificate word, no date, no issuing body and carries no
    // structure is something else on the CV.
    const hasKeyword = CERTIFICATION_WORDS.test(text) || ARABIC_CERTIFICATION_WORDS.test(text);
    // A certificate named after the body that issued it — "Microsoft Excel
    // Specialist" — carries the issuer inside the name. That is still
    // evidence that the line is about a qualification.
    const hasIssuer = Boolean(issuer) || KNOWN_ISSUERS.test(name);
    const hasDate = Boolean(issueDate);
    const hasSeparator = parts.length > 1;
    // A list of the tools a certificate covered is evidence of a
    // qualification in its own right: the document named the tools and
    // pointed them at one entry.
    const hasTools = skills.length >= 2;
    const score =
      (hasKeyword ? 2 : 0) +
      (hasIssuer ? 2 : 0) +
      (hasDate ? 1 : 0) +
      (hasSeparator ? 1 : 0) +
      (hasTools ? 2 : 0);
    if (score < 2) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    details.push({
      name,
      issuer,
      issueDate,
      description,
      skills,
      credentialId,
    });
  }

  return { names: names.slice(0, 15), details: details.slice(0, 15) };
}

/* -------------------------------------------------------------------------- */
/* The sections a CV carries beyond work, study and skills                     */
/* -------------------------------------------------------------------------- */

/**
 * A line that names one thing: a course, an award, a publication.
 *
 * These sections are read loosely on purpose. A course may be one line
 * ("Advanced Excel — Coursera, 2022") or three (title, provider, date), and
 * both are the same fact written differently. The reader therefore keeps the
 * first line as the title, takes the next lines as its detail, and pulls a
 * date out of whichever line carries one.
 */
interface NamedEntry {
  title: string;
  subtitle: string;
  date: string;
  description: string;
  bullets: string[];
  url: string;
}

function emptyNamedEntry(): NamedEntry {
  return { title: '', subtitle: '', date: '', description: '', bullets: [], url: '' };
}

/**
 * Reads a section of named entries.
 *
 * A bullet belongs to the entry above it, which is how these sections are
 * written everywhere: a title line, then the things that make it up.
 */
function parseNamedEntries(blocks: DocumentBlock[]): NamedEntry[] {
  const entries: NamedEntry[] = [];
  let current: NamedEntry | null = null;

  const finish = () => {
    if (!current) return;
    if (current.title.trim()) {
      const key = `${current.title.toLowerCase()}|${current.subtitle.toLowerCase()}`;
      const existing = entries.find(
        (entry) => `${entry.title.toLowerCase()}|${entry.subtitle.toLowerCase()}` === key
      );
      if (existing) {
        existing.bullets = Array.from(new Set([...existing.bullets, ...current.bullets]));
        if (!existing.description) existing.description = current.description;
      } else {
        entries.push(current);
      }
    }
    current = null;
  };

  for (const block of blocks) {
    const raw = block.text.trim();
    if (!raw) continue;
    if (matchSectionHeading(raw)) continue;

    if (isBulletLine(raw)) {
      const text = stripBullet(raw);
      if (!text) continue;
      if (!current) continue;
      current.bullets.push(text);
      continue;
    }

    // A line that carries a date range is the tail of an entry whose title
    // was on an earlier line.
    const range = parseDateRange(raw);
    if (range && current && current.title && !current.date) {
      current.date = range.period;
      const remainder = removeDateRange(raw, range).replace(/^[\s|,;:–—-]+/, '').trim();
      if (remainder && !current.subtitle) current.subtitle = remainder;
      continue;
    }

    // A new title line starts a new entry, unless the current entry has
    // nothing but a title yet — then this is the second half of it.
    if (current && current.title && !current.subtitle && !current.description && !current.bullets.length) {
      current.subtitle = raw;
      continue;
    }

    finish();
    current = emptyNamedEntry();
    current.title = raw;
    const inlineDate = parseDateRange(raw);
    if (inlineDate) {
      current.date = inlineDate.period;
      current.title = removeDateRange(raw, inlineDate).replace(/^[\s|,;:–—-]+/, '').trim();
    }
    const url = raw.match(URL_REGEX)?.[0];
    if (url) current.url = url;
  }
  finish();

  return entries;
}

/**
 * Reads the languages a CV lists.
 *
 * The level is whatever the document wrote beside the language — "Fluent",
 * "B2", "Native" — and it is not translated into a scale of our own.
 */
function parseLanguages(blocks: DocumentBlock[]): Array<{ name: string; level: string }> {
  const languages: Array<{ name: string; level: string }> = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const raw = block.text.trim();
    if (!raw || matchSectionHeading(raw)) continue;

    // A comma separates the languages here as well: the level of a language is
    // written inside brackets, so a comma never appears inside one.
    for (const part of raw.split(/[;|,·]/).map((entry) => entry.trim()).filter(Boolean)) {
      // "English (Fluent)", "Arabic - Native", "French: B2", "German (C1)"
      const match = part.match(/^([^(\-–—:,]+)\s*[(\-–—:,]\s*([^)\-–—:]+)\)?\s*$/);
      const name = (match ? match[1] : part).trim();
      const level = match ? match[2].trim() : '';
      if (!name || name.length > 60) continue;
      if (/^\d+$/.test(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      languages.push({ name, level });
    }
  }

  return languages.slice(0, 12);
}

/**
 * Reads the awards, publications, research and leadership sections.
 *
 * These four sections have the same shape in the document — a title and
 * something about it — so they share one reader and differ only in which
 * part of the entry they keep.
 */
function parseTitleAndBody(
  blocks: DocumentBlock[],
  options: { keepSubtitle: boolean; keepDate: boolean; keepUrl: boolean }
): NamedEntry[] {
  return parseNamedEntries(blocks)
    .map((entry) => ({
      ...entry,
      subtitle: options.keepSubtitle ? entry.subtitle : '',
      date: options.keepDate ? entry.date : '',
      url: options.keepUrl ? entry.url : '',
    }))
    .filter((entry) => entry.title.trim().length > 0);
}

/* -------------------------------------------------------------------------- */
/* Confidence / evidence                                                      */
/* -------------------------------------------------------------------------- */

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evidence(field: string, text: string, page?: number): CvEvidence {
  return {
    field,
    text: text.replace(/\s+/g, ' ').trim().slice(0, 300),
    page,
  };
}

/* -------------------------------------------------------------------------- */
/* Public parser                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The sections of the document, as they were found.
 *
 * The parser knows where every section began and ended, and that is what
 * lets the review say where a value came from: a company name read out of
 * the experience section is a different claim from the same name read out
 * of a bullet, and only the section tells them apart.
 */
export interface ParsedCvSection {
  key: SectionKey;
  /** The heading as it was written in the document. */
  heading: string;
  /** The blocks that belong to the section. */
  blocks: DocumentBlock[];
  /** Where the section begins in the document's block list. */
  startIndex: number;
  /** Where it ends. */
  endIndex: number;
}

export function parseStructuredCv(extraction: DocumentExtraction): {
  cv: ParsedCv;
  metadata: CvExtractionMetadata;
  sections: ParsedCvSection[];
} {
  const sections: Record<SectionKey, DocumentBlock[]> = {
    header: [],
    contact: [],
    summary: [],
    experience: [],
    internships: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    courses: [],
    languages: [],
    volunteering: [],
    awards: [],
    publications: [],
    research: [],
    leadership: [],
    other: [],
  };

  let currentSection: SectionKey = 'header';
  const sectionMeta = new Map<SectionKey, { heading: string; startIndex: number }>();
  let blockIndex = 0;
  for (const block of extraction.blocks) {
    const text = block.text.trim();
    if (!text) {
      blockIndex += 1;
      continue;
    }
    const heading = matchSectionHeading(text);
    if (heading) {
      currentSection = heading.key;
      if (!sectionMeta.has(currentSection)) {
        sectionMeta.set(currentSection, { heading: text, startIndex: blockIndex });
      }
      if (heading.remainder) {
        sections[currentSection].push({ ...block, text: heading.remainder });
      }
      blockIndex += 1;
      continue;
    }
    sections[currentSection].push(block);
    blockIndex += 1;
  }

  const sectionList: ParsedCvSection[] = (
    Object.keys(sections) as SectionKey[]
  ).map((key) => {
    const meta = sectionMeta.get(key);
    return {
      key,
      heading: meta?.heading ?? '',
      blocks: sections[key],
      startIndex: meta?.startIndex ?? 0,
      endIndex: meta?.startIndex ?? 0,
    };
  });

  const headerAndContact = [...sections.header, ...sections.contact];
  const contactText = [...sections.header, ...sections.contact]
    .map((block) => block.text)
    .join('\n');
  const fullText = extraction.text;
  const warnings: string[] = [];
  const evidenceList: CvEvidence[] = [];

  const email = fullText.match(EMAIL_REGEX)?.[0] ?? '';
  if (email) evidenceList.push(evidence('email', email));

  const phone = findPhone(contactText || fullText);
  if (phone) evidenceList.push(evidence('phone', phone));

  const linkedin = normalizeProfileUrl(fullText.match(LINKEDIN_REGEX)?.[0] ?? '');
  if (linkedin) evidenceList.push(evidence('linkedin', linkedin));
  const github = normalizeProfileUrl(fullText.match(GITHUB_REGEX)?.[0] ?? '');
  if (github) evidenceList.push(evidence('github', github));

  const websiteMatches = fullText.match(new RegExp(URL_REGEX.source, 'gi')) ?? [];
  const website = normalizeProfileUrl(
    websiteMatches.find(
      (url) => !/linkedin\.com|github\.com/i.test(url) && !url.includes(email)
    ) ?? ''
  );
  if (website) evidenceList.push(evidence('website', website));

  const nameMatch = findName(headerAndContact);
  if (nameMatch.name) evidenceList.push(evidence('fullName', nameMatch.name, nameMatch.evidence?.page));
  const titleMatch = findTitle(headerAndContact, nameMatch.evidence);
  if (titleMatch.title) evidenceList.push(evidence('title', titleMatch.title, titleMatch.evidence?.page));

  const locationMatch = findLocation(headerAndContact);
  if (locationMatch.location) {
    evidenceList.push(evidence('location', locationMatch.location, locationMatch.evidence?.page));
  }

  const summary = sections.summary
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  if (summary) evidenceList.push(evidence('summary', summary));

  const experiences = parseExperience(sections.experience);
  for (const experience of experiences) {
    evidenceList.push(
      evidence(
        'experience',
        `${experience.role}${experience.company ? ` — ${experience.company}` : ''}${
          experience.period ? ` (${experience.period})` : ''
        }`
      )
    );
    for (const bullet of experience.bullets.slice(0, 2)) {
      evidenceList.push(evidence('experience.bullet', bullet));
    }
  }

  const education = parseEducation(sections.education);
  for (const entry of education) {
    evidenceList.push(
      evidence(
        'education',
        `${entry.degree}${entry.degree && entry.field ? ` ${entry.field}` : entry.field}${
          entry.institution ? ` — ${entry.institution}` : ''
        }${entry.period ? ` (${entry.period})` : ''}`
      )
    );
  }

  const projects = parseProjects(sections.projects);
  for (const project of projects) {
    evidenceList.push(
      evidence(
        'project',
        `${project.title}${project.technologies.length > 0 ? ` — ${project.technologies.join(', ')}` : ''}`
      )
    );
  }

  const skillsList = parseSkills(sections.skills);
  if (skillsList.length > 0) {
    evidenceList.push(evidence('skills', skillsList.join(', ')));
  }

  const certifications = parseCertifications(sections.certifications);
  for (const certification of certifications.names) {
    evidenceList.push(evidence('certification', certification));
  }

  // The sections beyond work, study and skills. Each is read by the reader
  // that fits its shape, and each is reported only when the document really
  // had it — an absent section is an empty list, never an invented one.
  const internshipRoles = parseExperience(sections.internships);
  const internships: ParsedCvInternship[] = internshipRoles.map((entry) => ({
    id: entry.id,
    organization: entry.company,
    role: entry.role,
    period: entry.period,
    location: entry.location,
    bullets: entry.bullets,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
  }));

  const volunteeringRoles = parseExperience(sections.volunteering);
  const volunteering: ParsedCvInternship[] = volunteeringRoles.map((entry) => ({
    id: entry.id,
    organization: entry.company,
    role: entry.role,
    period: entry.period,
    location: entry.location,
    bullets: entry.bullets,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
  }));

  const leadershipRoles = parseExperience(sections.leadership);
  const leadership: ParsedCvLeadership[] = leadershipRoles.map((entry) => ({
    id: entry.id,
    organization: entry.company,
    role: entry.role,
    period: entry.period,
    description: entry.bullets.join('\n'),
    bullets: entry.bullets,
  }));

  const courseEntries = parseTitleAndBody(sections.courses, {
    keepSubtitle: true,
    keepDate: true,
    keepUrl: false,
  });
  const courses = courseEntries.map((entry) => ({
    id: entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: entry.title,
    provider: entry.subtitle,
    date: entry.date,
    description: entry.bullets.join('\n'),
  }));

  const languageEntries = parseLanguages(sections.languages);
  const languages: ParsedCvLanguage[] = languageEntries.map((entry, index) => ({
    id: `${index}-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: entry.name,
    level: entry.level,
  }));

  const awardEntries = parseTitleAndBody(sections.awards, {
    keepSubtitle: true,
    keepDate: true,
    keepUrl: false,
  });
  const awards: ParsedCvAward[] = awardEntries.map((entry) => ({
    id: entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: entry.title,
    issuer: entry.subtitle,
    date: entry.date,
    description: entry.bullets.join('\n'),
  }));

  const publicationEntries = parseTitleAndBody(sections.publications, {
    keepSubtitle: true,
    keepDate: true,
    keepUrl: true,
  });
  const publications: ParsedCvPublication[] = publicationEntries.map((entry) => ({
    id: entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: entry.title,
    publisher: entry.subtitle,
    date: entry.date,
    url: entry.url,
    description: entry.bullets.join('\n'),
  }));

  const researchEntries = parseTitleAndBody(sections.research, {
    keepSubtitle: true,
    keepDate: true,
    keepUrl: false,
  });
  const research: ParsedCvResearch[] = researchEntries.map((entry) => ({
    id: entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: entry.title,
    institution: entry.subtitle,
    period: entry.date,
    description: entry.bullets.join('\n'),
    bullets: entry.bullets,
  }));

  for (const entry of internships) {
    evidenceList.push(
      evidence('internship', `${entry.role}${entry.organization ? ` — ${entry.organization}` : ''}`)
    );
  }
  for (const entry of volunteering) {
    evidenceList.push(
      evidence('volunteering', `${entry.role}${entry.organization ? ` — ${entry.organization}` : ''}`)
    );
  }
  for (const entry of leadership) {
    evidenceList.push(
      evidence('leadership', `${entry.role}${entry.organization ? ` — ${entry.organization}` : ''}`)
    );
  }
  for (const entry of courses) evidenceList.push(evidence('course', entry.title));
  for (const entry of languages) evidenceList.push(evidence('language', entry.name));
  for (const entry of awards) evidenceList.push(evidence('award', entry.title));
  for (const entry of publications) evidenceList.push(evidence('publication', entry.title));
  for (const entry of research) evidenceList.push(evidence('research', entry.title));

  if (!nameMatch.name) warnings.push('No candidate name was found in the document header.');
  if (!email) warnings.push('No email address was found in the document.');
  if (!phone) warnings.push('No phone number was found in the document.');
  if (!locationMatch.location) {
    warnings.push(
      'No location was stated in the header/contact section, so the location was left blank.'
    );
  }
  if (experiences.length === 0) warnings.push('No work experience entries were found.');
  if (education.length === 0) warnings.push('No education entries were found.');
  if (skillsList.length === 0) warnings.push('No skills were found.');
  if (extraction.layout !== 'single-column') {
    warnings.push(
      `${extraction.layout === 'two-column' ? 'Two-column' : 'Multi-column'} layout detected; the main column was read before the sidebar.`
    );
  }
  warnings.push(...extraction.warnings);

  const bulletCount = experiences.reduce((total, entry) => total + entry.bullets.length, 0);
  const personal = clamp(
    (nameMatch.name ? 30 : 0) +
      (email ? 30 : 0) +
      (phone ? 20 : 0) +
      (locationMatch.location ? 20 : 0)
  );
  const experienceScore = experiences.length
    ? clamp(45 + Math.min(35, experiences.length * 15) + Math.min(20, bulletCount * 4))
    : 0;
  const educationScore = education.length
    ? clamp(60 + Math.min(35, education.length * 20))
    : 0;
  const skillsScore = skillsList.length
    ? clamp(40 + Math.min(55, skillsList.length * 6))
    : 0;
  const summaryScore = summary.length >= 80 ? 90 : summary.length > 0 ? 55 : 0;
  const projectsScore = projects.length ? clamp(70 + projects.length * 5) : 0;
  const certificationsScore = certifications.names.length
    ? clamp(70 + certifications.names.length * 5)
    : 0;

  // The sections beyond the core four are scored on their own and are
  // reported separately. They never move the overall score: a CV that has no
  // awards is not a worse CV, it is a CV with no awards.
  const sectionScore = (count: number): number =>
    count ? clamp(70 + Math.min(30, count * 5)) : 0;
  const internshipsScore = sectionScore(internships.length);
  const coursesScore = sectionScore(courses.length);
  const languagesScore = sectionScore(languages.length);
  const volunteeringScore = sectionScore(volunteering.length);
  const awardsScore = sectionScore(awards.length);
  const publicationsScore = sectionScore(publications.length);
  const researchScore = sectionScore(research.length);
  const leadershipScore = sectionScore(leadership.length);

  const overall = clamp(
    personal * 0.25 +
      experienceScore * 0.3 +
      educationScore * 0.15 +
      skillsScore * 0.15 +
      summaryScore * 0.1 +
      projectsScore * 0.03 +
      certificationsScore * 0.02
  );

  const cv: ParsedCv = {
    documentType: 'cv',
    fullName: nameMatch.name,
    email,
    phone,
    location: locationMatch.location,
    title: titleMatch.title,
    summary,
    linkedin,
    github,
    website,
    experiences,
    internships,
    education,
    projects,
    skillsList,
    certifications: certifications.names,
    certificationDetails: certifications.details,
    courses,
    languages,
    volunteering,
    awards,
    publications,
    research,
    leadership,
  };

  return {
    cv,
    sections: sectionList,
    metadata: {
      method: 'deterministic',
      format: extraction.format,
      pageCount: extraction.pageCount,
      layout: extraction.layout,
      characterCount: extraction.characterCount,
      wordCount: extraction.wordCount,
      confidence: {
        overall,
        personal,
        summary: summaryScore,
        experience: experienceScore,
        education: educationScore,
        skills: skillsScore,
        projects: projectsScore,
        certifications: certificationsScore,
        internships: internshipsScore,
        courses: coursesScore,
        languages: languagesScore,
        volunteering: volunteeringScore,
        awards: awardsScore,
        publications: publicationsScore,
        research: researchScore,
        leadership: leadershipScore,
      },
      evidence: evidenceList.slice(0, 80),
      warnings,
    },
  };
}
