/**
 * Career search.
 *
 * The catalogue now spans every major career domain, so a plain
 * `title.includes(query)` filter is no longer good enough: users type
 * "fin analyst", "supply chain", "HR" or "teach", and they expect to find
 * "Financial Analyst", "Supply Chain Manager", "Human Resources" and
 * "Teacher".
 *
 * This module implements a small, dependency-free fuzzy matcher:
 *   - normalisation (case, accents, punctuation, common abbreviations);
 *   - exact / prefix / substring matching on titles and aliases;
 *   - token matching, so every query word must appear somewhere;
 *   - subsequence matching, so "financ anal" still finds "Financial Analyst";
 *   - edit-distance matching, so a typo or two is forgiven;
 *   - domain matching, so "engineering" surfaces the whole domain.
 *
 * The same function is used by the global search modal, the role picker and
 * the API, so a query behaves identically everywhere.
 */

import { CAREER_DOMAINS, type CareerDomain, type CareerDomainId } from './careerDomains.ts';
import { CAREER_ROLES } from './careerRoles.ts';
import type { TargetRole } from './careerTypes.ts';

/** Abbreviations that users type for domains and roles. */
const DOMAIN_ALIASES: Record<string, string[]> = {
  'human-resources': ['hr', 'human resources', 'people', 'people ops', 'personnel', 'talent', 'recruiting'],
  'data': ['data', 'analytics', 'bi', 'data science', 'data analytics'],
  technology: ['tech', 'software', 'it', 'information technology', 'programming', 'developer'],
  engineering: ['engineering', 'engineer', 'manufacturing', 'mechanical', 'civil', 'electrical'],
  design: ['design', 'designer', 'creative', 'graphics', 'ux', 'ui', 'brand'],
  product: ['product', 'product owner', 'pm', 'program', 'programme'],
  business: ['business', 'management', 'consulting', 'operations', 'analyst', 'strategy'],
  operations: ['operations', 'supply chain', 'logistics', 'procurement', 'warehouse', 'inventory'],
  finance: ['finance', 'financial', 'accounting', 'accountant', 'investment', 'treasury', 'tax'],
  marketing: ['marketing', 'growth', 'seo', 'content', 'brand', 'social media'],
  sales: ['sales', 'revenue', 'account management', 'business development', 'bdr'],
  healthcare: ['healthcare', 'health', 'clinical', 'medical', 'nursing', 'patient', 'pharmacy'],
  education: ['education', 'teaching', 'teacher', 'school', 'training', 'curriculum'],
  legal: ['legal', 'law', 'compliance', 'contracts', 'paralegal', 'risk'],
  security: ['security', 'cyber', 'cybersecurity', 'infosec', 'soc', 'assurance'],
};

/** Normalised text used for all comparisons. */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#/\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Removes spaces and punctuation, for compact comparisons. */
function compact(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9+#]/g, '');
}

/** Levenshtein distance, bounded for performance. */
export function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > max) return max + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}

/** True when `query` characters appear in `target` in order (not necessarily adjacent). */
function isSubsequence(query: string, target: string): boolean {
  let index = 0;
  for (const character of target) {
    if (character === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return query.length === 0;
}

export interface CareerSearchMatch {
  role: TargetRole;
  score: number;
  /** Which field produced the match — useful for UI hints. */
  matchedOn: 'title' | 'alias' | 'domain' | 'skill' | 'description';
}

export interface CareerSearchResult {
  roles: CareerSearchMatch[];
  domains: { domain: CareerDomain; score: number }[];
  query: string;
}

const MAX_ROLE_RESULTS = 24;

/**
 * Scores one role against a normalised query.
 *
 * Returns 0 when the role does not match at all.
 */
export function scoreRole(role: TargetRole, rawQuery: string): CareerSearchMatch | null {
  const query = normalizeSearchText(rawQuery);
  if (!query) return null;

  const title = normalizeSearchText(role.title);
  const titleCompact = compact(role.title);
  const queryCompact = compact(rawQuery);
  const domainLabel = normalizeSearchText(role.category);
  const domainKeywords = normalizeSearchText(
    (DOMAIN_ALIASES[role.domainId] ?? []).concat(CAREER_DOMAINS.find((d) => d.slug === role.domainId)?.keywords ?? []).join(' '),
  );
  const aliases = role.aliases.map(normalizeSearchText);
  const skills = role.requiredSkills.map((skill) => normalizeSearchText(skill.name));
  const overview = normalizeSearchText(role.overview);

  // 1. Exact and near-exact title matches.
  if (title === query || titleCompact === queryCompact) {
    return { role, score: 1000, matchedOn: 'title' };
  }
  if (titleCompact === queryCompact || title.startsWith(query)) {
    return { role, score: 900 - title.length, matchedOn: 'title' };
  }

  // 2. Alias hits are a strong signal — users search "HR", "nurse", "PM".
  for (const alias of aliases) {
    if (alias === query || compact(alias) === queryCompact) {
      return { role, score: 820, matchedOn: 'alias' };
    }
  }

  // 3. Every query word must appear somewhere in the role.
  const tokens = query.split(' ').filter(Boolean);
  const haystacks = [title, domainLabel, domainKeywords, overview, ...aliases];
  const allTokensMatch = tokens.every((token) =>
    haystacks.some((field) => field.includes(token)) ||
    skills.some((skill) => skill.includes(token)),
  );
  if (allTokensMatch && tokens.length > 0) {
    const inTitle = tokens.filter((token) => title.includes(token)).length;
    return {
      role,
      score: 500 + inTitle * 80 - (title.length / 20),
      matchedOn: inTitle > 0 ? 'title' : 'description',
    };
  }

  // 4. Whole-title substring, including a match inside the title only.
  if (title.includes(query)) {
    return { role, score: 700 - title.length, matchedOn: 'title' };
  }
  for (const alias of aliases) {
    if (alias.includes(query)) {
      return { role, score: 640, matchedOn: 'alias' };
    }
  }

  // 5. A single token hitting a skill name is still a useful result.
  if (tokens.length === 1) {
    for (const skill of skills) {
      if (skill.includes(tokens[0]) || tokens[0].includes(skill)) {
        return { role, score: 420, matchedOn: 'skill' };
      }
    }
  }

  // 6. Subsequence match — forgiving of missing characters.
  if (tokens.length <= 3 && isSubsequence(query.replace(/\s+/g, ''), titleCompact)) {
    return { role, score: 360, matchedOn: 'title' };
  }

  // 7. Typo tolerance: compare the query against the title and each alias.
  const tolerance = queryCompact.length <= 4 ? 1 : queryCompact.length <= 8 ? 2 : 3;
  if (titleCompact.length >= 4 && editDistance(queryCompact, titleCompact, tolerance) <= tolerance) {
    return { role, score: 320, matchedOn: 'title' };
  }
  for (const alias of aliases) {
    const aliasCompact = compact(alias);
    if (aliasCompact.length >= 4 && editDistance(queryCompact, aliasCompact, tolerance) <= tolerance) {
      return { role, score: 300, matchedOn: 'alias' };
    }
  }
  for (const skill of skills) {
    const skillCompact = compact(skill);
    if (skillCompact.length >= 5 && editDistance(queryCompact, skillCompact, tolerance + 1) <= tolerance) {
      return { role, score: 240, matchedOn: 'skill' };
    }
  }

  return null;
}

/** Scores a domain against a normalised query. */
export function scoreDomain(domain: CareerDomain, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;
  const label = normalizeSearchText(domain.label);
  const summary = normalizeSearchText(domain.summary);
  const aliases = (DOMAIN_ALIASES[domain.slug] ?? []).map(normalizeSearchText);

  if (compact(label) === compact(rawQuery)) return 1000;
  if (label.startsWith(query)) return 900;
  if (label.includes(query)) return 780;
  for (const alias of aliases) {
    if (alias === query || compact(alias) === compact(rawQuery)) return 840;
    if (alias.includes(query)) return 700;
  }
  if (summary.includes(query)) return 520;

  const tokens = query.split(' ').filter(Boolean);
  if (tokens.length && tokens.every((token) => label.includes(token) || summary.includes(token) || aliases.some((alias) => alias.includes(token)))) {
    return 620;
  }
  const labelCompact = compact(label);
  const tolerance = query.length <= 5 ? 1 : 2;
  if (labelCompact.length >= 4 && editDistance(compact(rawQuery), labelCompact, tolerance) <= tolerance) {
    return 400;
  }
  return 0;
}

/**
 * Searches roles and domains.
 *
 * Results are ordered by score, then alphabetically so the order is stable
 * between renders.
 */
export function searchCareerCatalog(rawQuery: string, options?: { limit?: number }): CareerSearchResult {
  const query = rawQuery.trim();
  const limit = options?.limit ?? MAX_ROLE_RESULTS;

  if (!query) {
    return { roles: [], domains: [], query };
  }

  const roles: CareerSearchMatch[] = [];
  for (const role of CAREER_ROLES) {
    const match = scoreRole(role, query);
    if (match) roles.push(match);
  }
  roles.sort((a, b) => b.score - a.score || a.role.title.localeCompare(b.role.title));

  const domains: { domain: CareerDomain; score: number }[] = [];
  for (const domain of CAREER_DOMAINS) {
    const score = scoreDomain(domain, query);
    if (score > 0) domains.push({ domain, score });
  }
  domains.sort((a, b) => b.score - a.score || a.domain.label.localeCompare(b.domain.label));

  return { roles: roles.slice(0, limit), domains: domains.slice(0, 8), query };
}

/**
 * Words that describe a LEVEL of a role rather than the role itself.
 *
 * The catalogue holds roles, not grades: "Senior Financial Analyst" is a
 * Financial Analyst who happens to be senior. These modifiers are therefore
 * removed before a free-text title is matched, so a CV that says "Senior
 * Financial Analyst" still resolves to the Financial Analyst role.
 */
const SENIORITY_MODIFIERS = [
  'senior',
  'junior',
  'lead',
  'principal',
  'staff',
  'associate',
  'apprentice',
  'entry level',
  'entry-level',
  'graduate',
  'intern',
  'trainee',
  'director',
  'head of',
  'chief',
  'vice president',
  'vp',
];

/** Escapes a literal for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes any seniority modifier from a free-text title. */
export function stripSeniorityModifier(value: string): string {
  let result = normalizeSearchText(value);
  for (const modifier of SENIORITY_MODIFIERS) {
    result = result.replace(
      new RegExp(`(^|\\s)${escapeRegExp(modifier)}(?=\\s|$)`, 'g'),
      ' '
    );
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Suggests a target role for a free-text job title.
 *
 * Used when a CV or profile mentions a role we do not have in the catalogue.
 * Returns the closest catalogue role, or undefined when nothing is close
 * enough to be a defensible suggestion.
 */
export function suggestClosestRole(freeText: string): TargetRole | undefined {
  const rawNeedle = compact(freeText);
  if (rawNeedle.length < 3) return undefined;

  // Both the raw text and the text with any seniority modifier removed are
  // tried. The raw text keeps a match on a role whose name genuinely contains
  // one of those words; the stripped text is what makes "Senior Financial
  // Analyst" resolve to "Financial Analyst".
  const needles = [rawNeedle];
  const stripped = compact(stripSeniorityModifier(freeText));
  if (stripped && stripped !== rawNeedle) needles.push(stripped);

  let best: { role: TargetRole; score: number } | undefined;

  for (const role of CAREER_ROLES) {
    // A title match is worth more than an alias match: an alias such as
    // "trainer" is a loose synonym, the title is the role itself.
    const candidates: { value: string; weight: number }[] = [
      { value: role.title, weight: 1 },
      ...role.aliases.map((alias) => ({ value: alias, weight: 0.92 })),
    ];

    for (const needle of needles) {
      for (const candidate of candidates) {
        const target = compact(candidate.value);
        if (!target) continue;
        const distance = editDistance(needle, target, 6);
        const ratio = 1 - distance / Math.max(needle.length, target.length);
        if (distance > 3 && ratio < 0.72) continue;
        // An exact match on the role name is the strongest signal there is.
        const exactBonus = needle === target ? 12 : 0;
        const score = ratio * 100 * candidate.weight + exactBonus - distance;
        if (!best || score > best.score) best = { role, score };
      }
    }
  }

  return best?.role;
}

export type { CareerDomain, CareerDomainId };
