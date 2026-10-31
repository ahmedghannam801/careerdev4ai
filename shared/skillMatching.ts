/**
 * Skill-name matching shared by the catalog, the recommendation engine and
 * the coverage audit.
 *
 * Role definitions and course metadata are authored independently, so the same
 * skill is often written in slightly different ways:
 *
 *   role:   "Figma"
 *   course: "Figma & Design Systems"
 *
 *   role:   "Motion Graphics (After Effects)"
 *   course: "After Effects & Motion Graphics"
 *
 * Exact string equality therefore loses a large part of the catalogue. This
 * module canonicalises names (case, accents, plurals, punctuation, spelling
 * variants), expands parenthetical alternatives, and finally allows a
 * conservative token-subset match. It never uses fuzzy edit distance: two
 * unrelated skills must not become interchangeable just because they share a
 * few letters.
 */

/** Words that carry no matching signal. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'using',
  'via',
  'with',
  'your',
]);

/**
 * Words that end in "s" but are not plurals. Singularising them would corrupt
 * the token (devops -> devop), which makes unrelated skills look closer.
 */
const NON_PLURAL_S_WORDS = new Set([
  'analytics',
  'analysis',
  'aws',
  'business',
  'chaos',
  'devops',
  'economics',
  'ethics',
  'gcp',
  'genetics',
  'https',
  'ios',
  'kubernetes',
  'linguistics',
  'logistics',
  'mathematics',
  'microservices',
  'news',
  'physics',
  'politics',
  'sales',
  'series',
  'species',
  'statistics',
  'visual basics',
]);

/**
 * Phrase-level spelling and vocabulary variants, applied after the name has
 * been lower-cased and stripped of punctuation. Longer phrases must come
 * first so "business communication" wins over a bare "communication" rule.
 */
const PHRASE_ALIASES: Array<[string, string]> = [
  ['business communication', 'communication'],
  ['client communication', 'communication'],
  ['interpersonal communication', 'communication'],
  ['stakeholder communication', 'communication'],
  ['written communication', 'communication'],
  ['presentation and storytelling', 'presentation'],
  ['presentation and reporting', 'presentation'],
  ['presentation and rationale', 'presentation'],
  ['reporting and dashboarding', 'reporting'],
  ['project management and cost awareness', 'project management'],
  ['programme and project management', 'project management'],
  ['quality management system', 'quality management'],
  ['quality management systems', 'quality management'],
  ['search engine optimization', 'seo'],
  ['search engine optimisation', 'seo'],
  ['customer relationship management', 'crm'],
  ['human resources', 'hr'],
  ['user experience', 'ux'],
  ['user interface', 'ui'],
  ['business intelligence', 'bi'],
  ['key performance indicator', 'kpi'],
  ['key performance indicators', 'kpi'],
  ['continuous integration', 'ci cd'],
  ['continuous delivery', 'ci cd'],
  ['continuous deployment', 'ci cd'],
  ['artificial intelligence', 'ai'],
  ['machine learning', 'machine learning'],
  ['go to market', 'gtm'],
  ['r programming', 'r'],
  ['microsoft excel', 'spreadsheet'],
  ['advanced excel', 'spreadsheet'],
  ['excel spreadsheets', 'spreadsheet'],
  ['spreadsheet modelling', 'spreadsheet modeling'],
  ['spreadsheet modeling', 'spreadsheet modeling'],
  ['data visualisation', 'data visualization'],
  ['data modelling', 'data modeling'],
  ['process optimisation', 'process optimization'],
  ['optimisation', 'optimization'],
  ['organisation', 'organization'],
  ['organisational', 'organizational'],
  ['behaviour', 'behavior'],
  ['behavioural', 'behavioral'],
  ['programme', 'program'],
  ['modelling', 'modeling'],
  ['visualisation', 'visualization'],
  ['analyse', 'analyze'],
  ['analysing', 'analyzing'],
  ['licence', 'license'],
  ['defence', 'defense'],
  ['centre', 'center'],
];

/** Single-token variants applied after tokenisation. */
const TOKEN_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  k8s: 'kubernetes',
  spreadsheet: 'spreadsheet',
  spreadsheets: 'spreadsheet',
  excel: 'spreadsheet',
  sql: 'sql',
  postgres: 'postgresql',
  gcp: 'googlecloud',
  aws: 'amazonwebservices',
  azure: 'microsoftazure',
  adobe: 'adobe',
  ae: 'aftereffects',
  'c#': 'csharp',
  'c++': 'cplusplus',
};

function singularize(token: string): string {
  if (NON_PLURAL_S_WORDS.has(token)) return token;
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (
    token.length > 3 &&
    token.endsWith('s') &&
    !token.endsWith('ss') &&
    !token.endsWith('us') &&
    !token.endsWith('is')
  ) {
    return token.slice(0, -1);
  }
  return token;
}

function applyPhraseAliases(value: string): string {
  let next = ` ${value} `;
  for (const [from, to] of PHRASE_ALIASES) {
    next = next.split(` ${from} `).join(` ${to} `);
  }
  return next.trim();
}

/** Canonical, comparable key for one skill name. */
export function canonicalSkillKey(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bvs\.?\b/g, 'versus')
    .replace(/\bw\//g, 'with ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliased = applyPhraseAliases(base);
  return aliased
    .split(' ')
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? singularize(token))
    .join(' ');
}

/** Significant tokens of a skill name. */
export function skillTokens(name: string): string[] {
  const cached = tokenCache.get(name);
  if (cached) return cached;
  const tokens = canonicalSkillKey(name)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token));
  tokenCache.set(name, tokens);
  return tokens;
}

/**
 * Tokens that describe a *kind* of work rather than a distinctive capability.
 * Shared only by these words, two skills must not be treated as the same:
 * "System Design" is not "Electrical System Design", and "Database Design" is
 * not "Structural Analysis & Design".
 */
const GENERIC_SKILL_TOKENS = new Set([
  'analysis',
  'analytics',
  'basic',
  'business',
  'cloud',
  'communication',
  'concept',
  'content',
  'control',
  'data',
  'design',
  'development',
  'digital',
  'distribution',
  'documentation',
  'engineering',
  'finance',
  'fundamental',
  'management',
  'marketing',
  'method',
  'operation',
  'planning',
  'practice',
  'principles',
  'process',
  'product',
  'project',
  'quality',
  'research',
  'risk',
  'safety',
  'sales',
  'security',
  'service',
  'software',
  'strategy',
  'support',
  'system',
  'technical',
  'technology',
  'testing',
  'tool',
]);

function splitAlternatives(value: string): string[] {
  return value
    .split(/[/,&]|\band\b|\bor\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.replace(/[^a-z0-9]/gi, '').length >= 2);
}

/** Slash/comma lists only: "Excel / Spreadsheets Modeling" is two subjects. */
function splitListAlternatives(value: string): string[] {
  return value
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter((part) => part.replace(/[^a-z0-9]/gi, '').length >= 2);
}

const variantCache = new Map<string, string[]>();
const tokenCache = new Map<string, string[]>();

/**
 * Every comparable form of a skill name: the full name, the name without its
 * parenthetical qualifier, each parenthetical alternative, and each
 * slash/ampersand alternative. "Motion Graphics (After Effects)" therefore
 * matches both "Motion Graphics" and "After Effects".
 */
export function skillNameVariants(name: string): string[] {
  const cached = variantCache.get(name);
  if (cached) return cached;

  const variants = new Set<string>();
  const add = (value: string) => {
    const key = canonicalSkillKey(value);
    if (key) variants.add(key);
  };

  add(name);

  const withoutParentheses = name.replace(/\([^)]*\)/g, ' ');
  add(withoutParentheses);

  const parentheticals = [...name.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
  for (const group of parentheticals) {
    for (const part of splitAlternatives(group)) add(part);
  }

  for (const part of splitListAlternatives(withoutParentheses)) add(part);

  const result = [...variants];
  variantCache.set(name, result);
  return result;
}

/**
 * Confidence that two skill names describe the same capability.
 *
 * 1    exact canonical match or a declared alternative
 * 0.8  one name's meaningful tokens are all contained in the other's
 * 0.55 the names share most tokens (near-synonym wording)
 * 0    no defensible relation
 */
export function skillMatchConfidence(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;

  const variantsA = skillNameVariants(a);
  const variantsB = new Set(skillNameVariants(b));
  if (variantsA.some((variant) => variantsB.has(variant))) return 1;

  let best = 0;
  for (const left of variantsA) {
    const leftTokens = left.split(' ').filter((token) => token && !STOP_WORDS.has(token));
    if (leftTokens.length === 0) continue;
    for (const right of variantsB) {
      const rightTokens = right.split(' ').filter((token) => token && !STOP_WORDS.has(token));
      if (rightTokens.length === 0) continue;

      const rightSet = new Set(rightTokens);
      const intersection = leftTokens.filter((token) => rightSet.has(token));
      if (intersection.length === 0) continue;

      // A single shared character ("R", "C") is not a relation.
      if (intersection.every((token) => token.length < 2)) continue;

      // Sharing only generic words ("design", "management", "data") is not a
      // relation either. At least one distinctive token must be shared.
      if (!intersection.some((token) => !GENERIC_SKILL_TOKENS.has(token))) continue;

      const shortest = Math.min(leftTokens.length, rightTokens.length);
      const longest = Math.max(leftTokens.length, rightTokens.length);
      const coverage = intersection.length / shortest;
      const union = new Set([...leftTokens, ...rightTokens]).size;
      const jaccard = intersection.length / union;

      if (coverage >= 0.8) {
        best = Math.max(best, 0.8);
      } else if (coverage >= 0.6 && jaccard >= 0.4 && longest <= shortest + 3) {
        best = Math.max(best, 0.55);
      }
    }
  }
  return best;
}

export function skillsMatch(a: string, b: string): boolean {
  return skillMatchConfidence(a, b) > 0;
}

export interface SkillLookup {
  /** Returns the original catalogue name and the match confidence. */
  find(name: string, minimumConfidence?: number): { name: string; confidence: number } | null;
  /** True when the name matches any candidate. */
  has(name: string, minimumConfidence?: number): boolean;
}

/**
 * Builds a reusable lookup for one side of a comparison (for example all gap
 * skill names). An exact canonical hit wins before any relational match.
 */
export function createSkillLookup(candidates: Iterable<string>): SkillLookup {
  const names = [...new Set(candidates)];
  const byKey = new Map<string, string>();
  for (const name of names) {
    for (const variant of skillNameVariants(name)) {
      if (!byKey.has(variant)) byKey.set(variant, name);
    }
  }

  return {
    find(name, minimumConfidence = 0.55) {
      for (const variant of skillNameVariants(name)) {
        const exact = byKey.get(variant);
        if (exact) return { name: exact, confidence: 1 };
      }
      let best: { name: string; confidence: number } | null = null;
      for (const candidate of names) {
        const confidence = skillMatchConfidence(name, candidate);
        if (confidence >= minimumConfidence && (!best || confidence > best.confidence)) {
          best = { name: candidate, confidence };
        }
      }
      return best;
    },
    has(name, minimumConfidence = 0.55) {
      return this.find(name, minimumConfidence) !== null;
    },
  };
}
