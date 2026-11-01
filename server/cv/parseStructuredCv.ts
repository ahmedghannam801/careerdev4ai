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

type SectionKey =
  | 'header'
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
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
    pattern: /^(?:contact(?:\s+details|\s+information)?|personal\s+details|contact\s+info)$/i,
  },
  {
    key: 'summary',
    pattern:
      /^(?:professional\s+summary|career\s+summary|executive\s+summary|summary|profile|about(?:\s+me)?|career\s+objective|objective|professional\s+profile)$/i,
  },
  {
    key: 'experience',
    pattern:
      /^(?:work\s+experience|professional\s+experience|employment\s+(?:history|experience)|work\s+history|career\s+history|experience|employment)$/i,
  },
  {
    key: 'education',
    pattern:
      /^(?:education(?:\s+and\s+training)?|academic\s+(?:background|history|qualifications)|educational\s+background|qualifications|education)$/i,
  },
  {
    key: 'skills',
    pattern:
      /^(?:technical\s+skills|core\s+skills|key\s+skills|professional\s+skills|skills(?:\s+and\s+tools)?|core\s+competencies|competencies|areas\s+of\s+expertise|technologies|tools(?:\s+and\s+technologies)?|tech\s+stack)$/i,
  },
  {
    key: 'projects',
    pattern: /^(?:key\s+projects|selected\s+projects|personal\s+projects|technical\s+projects|projects|portfolio)$/i,
  },
  {
    key: 'certifications',
    pattern:
      /^(?:certifications?|certificates?|licenses?(?:\s+and\s+certifications?)?|credentials|professional\s+development|courses|training)$/i,
  },
  {
    key: 'languages',
    pattern: /^(?:languages(?:\s+spoken|\s+proficiency)?|spoken\s+languages)$/i,
  },
  {
    key: 'other',
    pattern:
      /^(?:interests|hobbies|references|awards|achievements|publications|volunteer(?:\s+experience)?|additional\s+information)$/i,
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

  // "SKILLS: SQL, Python" is a heading and content on one line.
  const inline = text.match(/^([A-Za-z][A-Za-z &/]+?)\s*:\s*(.+)$/);
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

const MONTHS: Array<[RegExp, number, string]> = [
  [/^jan(?:uary)?\.?$/i, 1, 'Jan'],
  [/^feb(?:ruary)?\.?$/i, 2, 'Feb'],
  [/^mar(?:ch)?\.?$/i, 3, 'Mar'],
  [/^apr(?:il)?\.?$/i, 4, 'Apr'],
  [/^may\.?$/i, 5, 'May'],
  [/^jun(?:e)?\.?$/i, 6, 'Jun'],
  [/^jul(?:y)?\.?$/i, 7, 'Jul'],
  [/^aug(?:ust)?\.?$/i, 8, 'Aug'],
  [/^sep(?:t(?:ember)?)?\.?$/i, 9, 'Sep'],
  [/^oct(?:ober)?\.?$/i, 10, 'Oct'],
  [/^nov(?:ember)?\.?$/i, 11, 'Nov'],
  [/^dec(?:ember)?\.?$/i, 12, 'Dec'],
];

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
  const token = raw
    .replace(/\s+/g, ' ')
    .replace(/^[^\w\d]+|[^\w\d]+$/g, '')
    .trim();
  if (!token) return null;

  if (/^(present|current|now|today)$/i.test(token)) {
    return { iso: '', display: 'Present', year: 0, month: 0, isCurrent: true };
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
  const monthYear = token.match(/^([A-Za-z]+)\.?\s*['’]?(\d{2,4})$/);
  if (monthYear) {
    const monthEntry = MONTHS.find(([regex]) => regex.test(monthYear[1]));
    if (monthEntry) {
      let year = Number(monthYear[2]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return {
        iso: `${year}-${pad2(monthEntry[1])}-01`,
        display: `${monthEntry[2]} ${year}`,
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

const DATE_TOKEN_SOURCE =
  '(?:[A-Za-z]{3,9}\\.?\\s*[\'’]?\\d{2,4}|\\d{1,2}[./-]\\d{4}|\\d{4}[./-]\\d{1,2}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{4})';
const DATE_RANGE_REGEX = new RegExp(
  `(${DATE_TOKEN_SOURCE})\\s*(?:–|—|-|to|until|through|\\u2013|\\u2014)\\s*(${DATE_TOKEN_SOURCE}|present|current|now)`,
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
  if (!/^[\p{L}][\p{L}.'’ -]{1,40},\s*[\p{L}][\p{L}.'’() -]{1,40}$/u.test(text)) {
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

const NAME_EXCLUSIONS =
  /\b(resume|curriculum\s+vitae|cv|profile|summary|contact|experience|education|skills|projects|certifications|languages|objective|portfolio|linkedin|github)\b/i;

const ROLE_WORDS =
  /\b(engineer|engineering|developer|analyst|manager|director|consultant|specialist|coordinator|designer|architect|scientist|administrator|officer|accountant|auditor|teacher|professor|nurse|doctor|physician|technician|representative|executive|associate|lead|intern|trainee|researcher|strategist|planner|buyer|recruiter|marketer|writer|editor|producer|therapist|lawyer|attorney|paralegal|chef|driver|agent|supervisor|head|chief|owner|founder|president|vice\s+president)\b/i;

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
    if (NAME_EXCLUSIONS.test(text) || ROLE_WORDS.test(text)) continue;
    if (/[:|@]/.test(text)) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((word) => /^[\p{L}][\p{L}.'’ -]*$/u.test(word))) continue;
    const capitalized = words.every(
      (word) =>
        /^[A-Z\p{Lu}]/u.test(word) || /^[A-Z]{2,}$/.test(word) || word.includes('-')
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
    if (matchSectionHeading(text) || NAME_EXCLUSIONS.test(text)) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 8) continue;
    if (!ROLE_WORDS.test(text)) continue;
    return { title: text.replace(/\s*[|•·].*$/, '').trim(), evidence: block };
  }
  return { title: '' };
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                 */
/* -------------------------------------------------------------------------- */

function looksLikeRole(value: string): boolean {
  return ROLE_WORDS.test(value);
}

function looksLikeCompany(value: string): boolean {
  return /\b(inc|llc|ltd|limited|corp|corporation|company|co\.|group|holdings|bank|university|college|institute|hospital|clinic|agency|studio|labs?|technologies|solutions|systems|services|consulting|partners|associates|foundation|ngo)\b/i.test(
    value
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

function parseExperience(blocks: DocumentBlock[]): ParsedCvExperience[] {
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
    if (matchSectionHeading(raw)) continue;

    const range = parseDateRange(raw);
    const bullet = isBulletLine(raw);

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
      const split = splitRoleCompany(raw);
      // "Senior Data Analyst" followed by "Nile Retail Group" is one entry
      // split across two lines. Merge the company into the open entry.
      if (
        current &&
        !current.period &&
        current.bullets.length === 0 &&
        current.role &&
        !current.company &&
        split.company &&
        !split.role
      ) {
        current.company = split.company;
        continue;
      }

      finish();
      current = {
        id: '',
        role: split.role,
        company: split.company,
        period: '',
        location: '',
        bullets: [],
      };
      if (!current.role && !current.company) {
        current.role = raw;
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

const INSTITUTION_REGEX =
  /\b(university|college|institute|institution|school|academy|polytechnic|faculty)\b/i;

interface EducationParts {
  institution: string;
  degree: string;
  field: string;
}

function splitDegreeField(degreeText: string): { degree: string; field: string } {
  const text = degreeText.replace(/\s+/g, ' ').trim();
  if (!text) return { degree: '', field: '' };

  const inMatch = text.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch && DEGREE_REGEX.test(inMatch[1])) {
    return { degree: inMatch[1].trim(), field: inMatch[2].trim() };
  }

  const match = text.match(DEGREE_REGEX);
  if (!match) return { degree: '', field: text };
  const degree = match[0].trim();
  const remainder = text.slice((match.index ?? 0) + match[0].length).trim();
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

    const leftIsInstitution = INSTITUTION_REGEX.test(left);
    const rightIsInstitution = INSTITUTION_REGEX.test(right);
    const leftIsDegree = DEGREE_REGEX.test(left);
    const rightIsDegree = DEGREE_REGEX.test(right);

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

  if (INSTITUTION_REGEX.test(text) && !DEGREE_REGEX.test(text)) {
    return { institution: text, degree: '', field: '' };
  }
  if (DEGREE_REGEX.test(text)) {
    // The degree and institution are in the same fragment, e.g.
    // "BSc Statistics Cairo University". Keep only the degree facts; the
    // institution is not guessed.
    const degreeParts = splitDegreeField(
      text.replace(INSTITUTION_REGEX, '').trim()
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
      const gpaMatch = raw.match(/\bGPA\s*:?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i);
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

/** A month and a year, or a bare year. */
const DATE_SEGMENT =
  /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}|(?:19|20)\d{2})$/i;

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
    const hasKeyword = CERTIFICATION_WORDS.test(text);
    const hasIssuer = Boolean(issuer);
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

export function parseStructuredCv(extraction: DocumentExtraction): {
  cv: ParsedCv;
  metadata: CvExtractionMetadata;
} {
  const sections: Record<SectionKey, DocumentBlock[]> = {
    header: [],
    contact: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    other: [],
  };

  let currentSection: SectionKey = 'header';
  for (const block of extraction.blocks) {
    const text = block.text.trim();
    if (!text) continue;
    const heading = matchSectionHeading(text);
    if (heading) {
      currentSection = heading.key;
      if (heading.remainder) {
        sections[currentSection].push({ ...block, text: heading.remainder });
      }
      continue;
    }
    sections[currentSection].push(block);
  }

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
    education,
    projects,
    skillsList,
    certifications: certifications.names,
    certificationDetails: certifications.details,
  };

  return {
    cv,
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
      },
      evidence: evidenceList.slice(0, 80),
      warnings,
    },
  };
}
