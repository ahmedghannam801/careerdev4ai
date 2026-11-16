/**
 * Adapters for the official opportunity sources.
 *
 * Everything in this module is pure: it turns the text of a published page
 * into a record the catalogue can store. The network lives in `fetch.ts` and
 * the database in `sync.ts`, so the rules that decide what a deadline is, or
 * which career a programme belongs to, can be tested without either.
 *
 * The guiding rule for all of it: **nothing is invented**. A date is only
 * recorded when the source published one; a cost is only recorded when the
 * source states it; a career is only attached when the page actually names
 * the domain, the role or the skill. When the source is silent, the field
 * stays empty and the record says so.
 */

import { CAREER_DOMAINS, type CareerDomainId } from '../../shared/careerDomains.ts';
import { ROLE_DEFINITION_LIST } from '../../shared/careerRoles.ts';
import type { OpportunityAudience, OpportunityKind } from '../../shared/opportunities.ts';

/** One record discovered from a source, before it is stored. */
export interface DiscoveredOpportunity {
  /** The source's own identifier for the item. Used for idempotency. */
  externalId: string;
  title: string;
  organization: string;
  description: string;
  /** The country the opportunity is offered in. */
  country: string;
  /** The page the record was read from. */
  sourceUrl: string;
  /** The page a candidate applies through, when the source publishes one. */
  applicationUrl: string | null;
  publishedAt: string | null;
  deadline: string | null;
  /** The deadline exactly as the source worded it. */
  deadlineText: string | null;
  /** Whether the source named a day or only a month. */
  deadlinePrecision: 'day' | 'month' | null;
  cohort: string | null;
  trainingHours: number | null;
  costType: 'free' | 'paid' | 'unspecified';
  costNote: string | null;
  eligibility: string | null;
  participationMode: 'onsite' | 'online' | 'hybrid' | 'unspecified';
  opportunityKind: OpportunityKind;
  opportunityType: 'program' | 'event' | 'ongoing' | 'remote';
  category: string;
  domainIds: string[];
  roleSlugs: string[];
  requiredSkills: string[];
  skillsGained: string[];
  audience: OpportunityAudience[];
  location: string;
  isRemote: boolean;
  /** How much the parser trusts this record, 0-100. */
  confidence: number;
}

/** An item read from a source's list page. */
export interface SourceListItem {
  externalId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  /** The summary the list page itself carried, when it carried one. */
  description?: string | null;
}

/** The detail of one announcement, read from its own page. */
export interface SourceDetail {
  title: string | null;
  /** The body text, with links flattened to markers. */
  body: string;
  /** The links found in the body, in document order. */
  links: Array<{ href: string; context: string }>;
  publishedAt: string | null;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
};

/** Decodes the HTML entities the sources use. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const decoded = ENTITIES[entity.toLowerCase()];
    return decoded ?? match;
  });
}

/**
 * Resolves a link against a page's address.
 *
 * The sources link in both ways: with an absolute address, with a path that
 * starts at the root, and with a path relative to the page. Resolving is the
 * only way to get all three right.
 */
export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Removes tags and collapses whitespace. */
export function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function monthNumber(name: string): number | null {
  return MONTHS[name.trim().toLowerCase()] ?? null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a date as an ISO calendar day. */
export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The last day of a month, used when a source names only the month. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// MCIT — announcements
// ---------------------------------------------------------------------------

/**
 * Reads the announcement list.
 *
 * MCIT publishes each announcement as an article with a day, a month and a
 * year, and a link that carries the announcement's own numeric id.
 */
export function parseMcitAnnouncementList(html: string): SourceListItem[] {
  const items: SourceListItem[] = [];
  const blocks = html.split(/<article class='\s*media'\s*>/i);

  for (const block of blocks.slice(1)) {
    const link = /<a class="title"[^>]*href='([^']+)'[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;

    const href = link[1].trim();
    const idMatch = /\/Announcement\/(\d+)/i.exec(href);
    if (!idMatch) continue;

    const title = toPlainText(link[2]).trim();
    if (!title) continue;

    const dayMatch = /ColoredDate\s*"[^>]*>\s*(\d{1,2})\s*</i.exec(block);
    const monthMatch = />\s*([A-Za-z]{3,9})\s*(\d{4})\s*</i.exec(block);

    let publishedAt: string | null = null;
    if (dayMatch && monthMatch) {
      const month = monthNumber(monthMatch[1]);
      const year = Number.parseInt(monthMatch[2], 10);
      if (month) publishedAt = toIsoDate(year, month, Number.parseInt(dayMatch[1], 10));
    }

    items.push({
      externalId: idMatch[1],
      title,
      url: resolveUrl('https://mcit.gov.eg/', href),
      publishedAt,
    });
  }

  return items;
}

/**
 * Reads one announcement's own page.
 *
 * The body is a single `brief` span. Its links are kept with the words that
 * surround them, because "To apply for the basic level, kindly click here"
 * and "To apply for the advanced level, kindly click here" carry the same
 * label and different meanings.
 */
export function parseMcitAnnouncementDetail(html: string): SourceDetail {
  const titleMatch = /<div class="title"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const title = titleMatch ? toPlainText(titleMatch[1]).trim() : null;

  const bodyMatch = /<span class="brief">([\s\S]*?)<\/span>/i.exec(html);
  const rawBody = bodyMatch ? bodyMatch[1] : '';

  const links: Array<{ href: string; context: string }> = [];
  const markers: string[] = [];
  let markerIndex = 0;

  const withMarkers = rawBody.replace(
    /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string) => {
      const marker = `[[link${markerIndex}]]`;
      markerIndex += 1;
      links.push({ href: decodeEntities(href).trim(), context: '' });
      markers.push(marker);
      return marker;
    },
  );

  const body = toPlainText(withMarkers);

  // Give every link the sentence it sits in, so the caller can tell an
  // application link from a "more information" link.
  for (const link of links) {
    const index = links.indexOf(link);
    const marker = markers[index];
    const position = body.indexOf(marker);
    if (position < 0) continue;
    const before = body.slice(Math.max(0, position - 160), position);
    const sentenceStart = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
    );
    link.context = before.slice(sentenceStart + 1).trim();
  }

  const cleanBody = body.replace(/\[\[link\d+\]\]/g, ' ').replace(/\s+/g, ' ').trim();

  const dayMatch = /ColoredDate\s*"[^>]*>\s*(\d{1,2})\s*</i.exec(html);
  const monthMatch = />\s*([A-Za-z]{3,9})\s*(\d{4})\s*</i.exec(html);
  let publishedAt: string | null = null;
  if (dayMatch && monthMatch) {
    const month = monthNumber(monthMatch[1]);
    const year = Number.parseInt(monthMatch[2], 10);
    if (month) publishedAt = toIsoDate(year, month, Number.parseInt(dayMatch[1], 10));
  }

  return { title, body: cleanBody, links, publishedAt };
}

// ---------------------------------------------------------------------------
// NTI — programme cards
// ---------------------------------------------------------------------------

/**
 * Reads the programme cards from the NTI home page.
 *
 * Each card has a heading, a short description and a "More Details" link to
 * the programme's own page.
 */
export function parseNtiProgramCards(html: string): SourceListItem[] {
  const items: SourceListItem[] = [];
  const cards = html.split(/<div class="card_about">/i);

  for (const card of cards.slice(1)) {
    const heading = /<h5>([\s\S]*?)<\/h5>/i.exec(card);
    if (!heading) continue;
    const title = toPlainText(heading[1]).trim();
    if (!title) continue;

    const link = /<a href="([^"]+)"[^>]*>\s*More Details\s*<\/a>/i.exec(card);
    if (!link) continue;

    const description = /<p>([\s\S]*?)<\/p>/i.exec(card);
    const href = link[1].trim();

    items.push({
      externalId: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      title,
      // The cards link with a relative path, sometimes with and sometimes
      // without a leading slash, so the link is resolved against the site
      // rather than concatenated onto it.
      url: resolveUrl('https://www.nti.sci.eg/', href),
      publishedAt: null,
      description: description ? toPlainText(description[1]).trim() : null,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/**
 * The words a source uses when it means a deadline.
 *
 * They are looked for *before* the date rather than next to it, because a
 * source writes "the deadline for applications is November 15" as often as it
 * writes "the deadline is November 15".
 */
const DEADLINE_KEYWORD =
  /\b(deadline|closing date|last date|apply by|register by|submit by|must be (?:submitted|applied)|applications? (?:close|are due|deadline)|closes on|closing on)\b/i;

/** How far back from a date the deadline word may be. */
const DEADLINE_KEYWORD_WINDOW = 90;

/**
 * Finds the deadline the source published.
 *
 * The date is looked for on its own and the deadline word is looked for
 * shortly before it, rather than the other way round: the wording varies
 * ("the deadline for applications is November 15", "applications close on 20
 * November", "register by November"), and a phrase that demands one fixed
 * wording would miss most of them.
 *
 * The year is taken from the announcement's own publication date, which is
 * how a reader of the page would work it out: a deadline in a month that has
 * not happened yet is in the next year. When the source named only a month,
 * the last day of that month is recorded and the precision is marked 'month'
 * so the interface can show what was actually published.
 */
export function detectDeadline(
  text: string,
  publishedAt: string | null,
): { date: string | null; text: string | null; precision: 'day' | 'month' | null } {
  // A date that names a day: "November 15" or "15 November".
  const dayPattern =
    /(?:\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?)|(?:\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:\s*,?\s*(\d{4}))?)/gi;

  for (const match of text.matchAll(dayPattern)) {
    const phrase = match[0].trim();
    const parsed = parseDatePhrase(phrase, publishedAt);
    if (!parsed || parsed.precision !== 'day') continue;

    const before = text.slice(Math.max(0, (match.index ?? 0) - DEADLINE_KEYWORD_WINDOW), match.index ?? 0);
    if (!DEADLINE_KEYWORD.test(before)) continue;

    return { date: parsed.date, text: phrase, precision: 'day' };
  }

  // A date that names only a month. The word has to be right next to it:
  // "the deadline is November" names a month, while a month named anywhere
  // else in the text does not.
  const monthPattern = /\b([A-Za-z]{3,9})\b/g;
  for (const match of text.matchAll(monthPattern)) {
    const month = monthNumber(match[1]);
    if (!month) continue;

    const before = text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0);
    if (!DEADLINE_KEYWORD.test(before)) continue;

    const parsed = parseDatePhrase(match[1], publishedAt);
    if (!parsed) continue;

    return { date: parsed.date, text: match[1].trim(), precision: 'month' };
  }

  return { date: null, text: null, precision: null };
}

function parseDatePhrase(
  phrase: string,
  publishedAt: string | null,
): { date: string; precision: 'day' | 'month' } | null {
  const cleaned = phrase.replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1').replace(/,/g, ' ').trim();

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/.exec(cleaned);
  if (dayFirst) {
    const month = monthNumber(dayFirst[2]);
    if (!month) return null;
    const year = resolveYear(dayFirst[3] ? Number.parseInt(dayFirst[3], 10) : null, month, publishedAt);
    return { date: toIsoDate(year, month, Number.parseInt(dayFirst[1], 10)), precision: 'day' };
  }

  const monthFirst = /^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s+(\d{4}))?$/.exec(cleaned);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]);
    if (!month) return null;
    const year = resolveYear(monthFirst[3] ? Number.parseInt(monthFirst[3], 10) : null, month, publishedAt);
    return { date: toIsoDate(year, month, Number.parseInt(monthFirst[2], 10)), precision: 'day' };
  }

  const monthOnly = /^([A-Za-z]{3,9})(?:\s+(\d{4}))?$/.exec(cleaned);
  if (monthOnly) {
    const month = monthNumber(monthOnly[1]);
    if (!month) return null;
    const year = resolveYear(monthOnly[2] ? Number.parseInt(monthOnly[2], 10) : null, month, publishedAt);
    return { date: toIsoDate(year, month, lastDayOfMonth(year, month)), precision: 'month' };
  }

  return null;
}

function resolveYear(explicit: number | null, month: number, publishedAt: string | null): number {
  if (explicit) return explicit;
  if (!publishedAt) return new Date().getUTCFullYear();
  const [year, publishedMonth] = publishedAt.split('-').map((part) => Number.parseInt(part, 10));
  // A deadline in a month that has already passed belongs to the next year.
  return month < publishedMonth ? year + 1 : year;
}

/** Finds the cohort, edition or intake the source named. */
export function detectCohort(text: string): string | null {
  const match = /(\d{1,2}(?:st|nd|rd|th))\s+(cohort|batch|edition|intake|round)\b/i.exec(text);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

/** Finds the training volume the source stated, in hours. */
export function detectTrainingHours(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d{1,4})\s*(?:-\s*\d{1,4}\s*)?hours?\b/gi));
  let total = 0;
  let found = false;
  for (const match of matches) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  if (!found) return null;
  return total > 0 ? total : null;
}

/** Finds how the programme is delivered. */
export function detectParticipationMode(text: string): 'onsite' | 'online' | 'hybrid' | 'unspecified' {
  const haystack = text.toLowerCase();
  const online = /\b(on-?line|remote|virtual|via (?:zoom|teams|google meet))\b/.test(haystack);
  const onsite = /\b(on-?site|in-?person|at the (?:premises|centre|center|institute)|face-?to-?face)\b/.test(haystack);
  const hybrid = /\bhybrid\b/.test(haystack);

  if (hybrid) return 'hybrid';
  if (online && onsite) return 'hybrid';
  if (online) return 'online';
  if (onsite) return 'onsite';
  return 'unspecified';
}

/** Finds what the programme costs, when the source says. */
export function detectCost(text: string): { type: 'free' | 'paid' | 'unspecified'; note: string | null } {
  const haystack = text.toLowerCase();
  if (/\bfull scholarship\b|\bscholarship\b|\bfree of charge\b|\bfor free\b|\bno registration fee\b/.test(haystack)) {
    return { type: 'free', note: null };
  }
  if (/\bfee\b|\bfees\b|\bpaid (?:programme|course|training)\b|\bregistration fee\b|\bprice\b|\bcost\b/.test(haystack)) {
    const sentence = sentenceContaining(text, /\bfees?\b|\bpaid\b|\bregistration fee\b|\bprice\b|\bcost\b/i);
    return { type: 'paid', note: sentence };
  }
  return { type: 'unspecified', note: null };
}

function sentenceContaining(text: string, pattern: RegExp): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (pattern.test(sentence)) return sentence.trim().slice(0, 300);
  }
  return null;
}

/** Finds the eligibility the source stated. */
export function detectEligibility(text: string): string | null {
  const patterns = [
    /(?:applicants?|participants?|candidates?|students?|graduates?)[^.]{0,220}?\b(?:must|should|are required|need to|have to)\b[^.]{0,220}\./i,
    /\b(?:eligibility|eligible|who can apply|target(?:ed)? audience)\b[^.]{0,220}\./i,
    /\b(?:open to|aimed at|for (?:university students|students|graduates|non-specialists|beginners|youth))\b[^.]{0,220}\./i,
    /\brequirements?\b[^.]{0,220}\./i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = match[0].trim();
    if (value.length > 12) return value.slice(0, 400);
  }
  return null;
}

/** Finds the audience the programme is for. */
export function detectAudience(text: string): OpportunityAudience[] {
  const haystack = text.toLowerCase();
  const audience: OpportunityAudience[] = [];

  if (/university students?|college students?|bachelor|undergraduate|students? at/.test(haystack)) {
    audience.push('university_students');
  }
  if (/fresh graduates?|new graduates?|recent graduates?|graduates? (?:of|from)/.test(haystack)) {
    audience.push('fresh_graduates');
  }
  if (/\byouth\b|\bages? (?:1[6-9]|2\d)\b|\bteenagers?\b/.test(haystack)) audience.push('youth');
  if (/professionals?|working |employees?|practitioners/.test(haystack)) audience.push('professionals');
  if (/\bwomen\b|\bfemale\b/.test(haystack)) audience.push('women');

  return audience.length ? audience : ['everyone'];
}

/** Picks the kind of opportunity the title describes. */
export function classifyKind(title: string, body: string): OpportunityKind {
  const haystack = `${title} ${body}`.toLowerCase();

  if (/\b(hackathon|codeathon|ideathon)\b/.test(haystack)) return 'hackathon';
  if (/\b(scholarship|studentship|fully[- ]funded)\b/.test(haystack)) return 'scholarship';
  if (/\bfellowship\b/.test(haystack)) return 'fellowship';
  if (/\binternship\b|\bintern\b/.test(haystack)) return 'internship';
  if (/\bbootcamp\b/.test(haystack)) return 'bootcamp';
  if (/\bconference\b|\bsummit\b|\bexpo\b|\btech night\b/.test(haystack)) return 'conference';
  if (/\bwebinar\b/.test(haystack)) return 'webinar';
  if (/\bworkshop\b/.test(haystack)) return 'workshop';
  if (/\bcertification\b|\bcertified\b|\bcertificate program/.test(haystack)) return 'certification';
  if (/\bcompetition\b|\bcontest\b|\bchallenge\b/.test(haystack)) return 'competition';
  if (/\bentrepreneurship\b|\bstartup\b|\bventure\b/.test(haystack)) return 'entrepreneurship';
  if (/\bvolunteer\w*\b/.test(haystack)) return 'volunteering';
  if (/\bacademy\b|\bacademies\b/.test(haystack)) return 'career_development';
  if (/\bcourse\b|\btraining\b|\bacademy\b|\bcurriculum\b/.test(haystack)) return 'training';

  return 'technology';
}

/** Picks the opportunity type: a one-off event, a programme, or rolling. */
export function classifyType(
  kind: OpportunityKind,
  title: string,
  body: string,
): 'program' | 'event' | 'ongoing' | 'remote' {
  const haystack = `${title} ${body}`.toLowerCase();
  if (kind === 'conference' || kind === 'webinar' || kind === 'competition' || kind === 'hackathon') {
    return 'event';
  }
  if (/\b(accepting applications|now open|registration (?:is )?open|enrol|apply now|applications?)\b/.test(haystack)) {
    return 'program';
  }
  if (/\b(rolling|ongoing|year[- ]round|throughout the year)\b/.test(haystack)) return 'ongoing';
  return 'program';
}

// ---------------------------------------------------------------------------
// Mapping a programme onto the career taxonomy
// ---------------------------------------------------------------------------

/** Keywords that are too broad to say anything about a career. */
const DOMAIN_STOP_KEYWORDS = new Set([
  'training', 'program', 'project', 'plan', 'content', 'quality', 'audit', 'security',
]);

/**
 * Finds the career domains the page names.
 *
 * A domain is attached when the page literally contains one of its
 * keywords, with the source's own default domains always included. Nothing
 * is attached on inference.
 */
export function mapDomains(
  text: string,
  defaultDomainIds: string[] = [],
): CareerDomainId[] {
  const haystack = ` ${text.toLowerCase()} `;
  const found = new Set<CareerDomainId>();

  for (const domain of CAREER_DOMAINS) {
    for (const keyword of domain.keywords) {
      if (DOMAIN_STOP_KEYWORDS.has(keyword)) continue;
      const pattern = new RegExp(`(?<![a-z])${escapeRegExp(keyword.toLowerCase())}(?![a-z])`, 'i');
      if (pattern.test(haystack)) {
        found.add(domain.slug);
        break;
      }
    }
  }

  for (const domainId of defaultDomainIds) {
    if (isCareerDomainId(domainId)) found.add(domainId);
  }

  return [...found];
}

function isCareerDomainId(value: string): value is CareerDomainId {
  return CAREER_DOMAINS.some((domain) => domain.slug === value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the roles the page names.
 *
 * A role is attached when the page literally contains the role's title or one
 * of its declared aliases, or when it names one of the role's own skills. A
 * role is never guessed from a vague resemblance.
 */
export function mapRoles(text: string): string[] {
  const haystack = text.toLowerCase();
  const roles = new Set<string>();

  for (const role of ROLE_DEFINITION_LIST) {
    const names = [role.title, ...(role.aliases ?? [])];
    if (
      names.some((name) =>
        // A page writes "Data Analysts" as readily as "Data Analyst", so the
        // name is matched with an optional plural.
        new RegExp(`(?<![a-z])${escapeRegExp(name.toLowerCase())}s?(?![a-z])`, 'i').test(haystack),
      )
    ) {
      roles.add(role.id);
      continue;
    }
    const skillHit = (role.coreSkills ?? []).some((skill) =>
      new RegExp(`(?<![a-z])${escapeRegExp(skill.name.toLowerCase())}(?![a-z])`, 'i').test(haystack),
    );
    if (skillHit) roles.add(role.id);
  }

  return [...roles];
}

/**
 * Finds the skills the page names, using the role catalogue's own skill
 * vocabulary.
 */
export function mapSkills(text: string): string[] {
  const haystack = text.toLowerCase();
  const skills = new Set<string>();

  for (const role of ROLE_DEFINITION_LIST) {
    for (const skill of role.coreSkills ?? []) {
      if (skill.name.length < 3) continue;
      if (
        new RegExp(`(?<![a-z])${escapeRegExp(skill.name.toLowerCase())}(?![a-z])`, 'i').test(haystack)
      ) {
        skills.add(skill.name);
      }
    }
  }

  return [...skills];
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** How many days before a deadline an opportunity counts as closing soon. */
export const CLOSING_SOON_DAYS = 7;

/**
 * Works out whether an opportunity is upcoming, open, closing soon or closed.
 *
 * The clock is the publication date, not "now": a deadline that has already
 * passed relative to the announcement is closed, and one that is still in the
 * future relative to it is open or closing soon. An opportunity with no
 * deadline stays open, because a rolling programme has not closed.
 */
export function computeStatus(
  deadline: string | null,
  publishedAt: string | null,
  now: Date = new Date(),
): 'upcoming' | 'open' | 'closing_soon' | 'closed' | 'archived' | 'verification_required' {
  if (!deadline) return 'open';

  const deadlineTime = Date.parse(`${deadline}T23:59:59Z`);
  const reference = publishedAt ? Date.parse(`${publishedAt}T00:00:00Z`) : now.getTime();
  const nowTime = now.getTime();

  if (Number.isNaN(deadlineTime)) return 'open';
  if (deadlineTime < reference) return 'closed';
  if (deadlineTime < nowTime) return 'closed';

  const daysLeft = (deadlineTime - nowTime) / (1000 * 60 * 60 * 24);
  if (daysLeft <= CLOSING_SOON_DAYS) return 'closing_soon';

  // A programme that opens later than today has not started yet.
  if (publishedAt && Date.parse(`${publishedAt}T00:00:00Z`) > nowTime) return 'upcoming';

  return 'open';
}
