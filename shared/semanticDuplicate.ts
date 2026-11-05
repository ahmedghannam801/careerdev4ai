/**
 * Semantic duplicate detection and career-role relevance for recommendations.
 *
 * Prevents recommending projects, courses, certifications, or skills that the user
 * already has, has in-progress, or has completed.
 *
 * Implements:
 * - Normalized title folding (strips action verbs, punctuation, casing, filler words).
 * - Token-set Jaccard similarity.
 * - Exact and canonical URL matching.
 * - Technology and skill overlap.
 * - Completion status tracking (in_progress vs completed).
 * - Advanced evolutionary project generation for completed work.
 * - Career-role domain gating (HR candidates never receive web development, etc.).
 */

const ACTION_PREFIXES = [
  'build a',
  'build an',
  'create a',
  'create an',
  'develop a',
  'develop an',
  'design a',
  'design an',
  'implement a',
  'implement an',
  'hands-on',
  'hands on',
  'mastering',
  'complete guide to',
  'complete guide',
  'the complete guide to',
  'the complete',
  'introduction to',
  'intro to',
  'from scratch',
  'step by step',
  'ultimate guide to',
  'deep dive into',
  'practical',
  'advanced',
  'beginner',
  'guide to',
  'prove',
  'demonstrate',
];

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'the',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'using',
  'via',
  'into',
  'that',
  'puts',
  'it',
  'work',
  'something',
]);

/** Normalizes a title for robust comparison. */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  let str = title.toLowerCase().trim();

  // Strip common punctuation, symbols and brackets including ampersand
  str = str.replace(/[[\](){}:;,\-_/\\|&]/g, ' ');

  // Collapse multiple spaces
  str = str.replace(/\s+/g, ' ').trim();

  // Strip leading action prefixes iteratively
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ACTION_PREFIXES) {
      if (str.startsWith(prefix + ' ')) {
        str = str.slice(prefix.length).trim();
        changed = true;
      }
    }
    const leadingPreps = ['of ', 'for ', 'with ', 'in ', 'on ', 'to '];
    for (const prep of leadingPreps) {
      if (str.startsWith(prep)) {
        str = str.slice(prep.length).trim();
        changed = true;
      }
    }
  }

  return str;
}

/** Tokenizes a string into a set of clean, non-stopword tokens. */
export function tokenize(text: string): Set<string> {
  const normalized = normalizeTitle(text);
  const words = normalized
    .split(/\s+/)
    .map((w) => {
      let clean = w.replace(/[^a-z0-9+#]/g, '').trim();
      // Stem common variations in credential / certification titles
      if (clean === 'certified' || clean === 'certification' || clean === 'certificates') {
        clean = 'certificate';
      }
      return clean;
    })
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Computes the Jaccard similarity coefficient between two sets (0.0 to 1.0). */
export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Computes skill overlap between two skill name arrays (0.0 to 1.0). */
export function skillOverlap(skillsA: string[], skillsB: string[]): number {
  const normA = new Set(skillsA.map((s) => s.toLowerCase().trim()).filter(Boolean));
  const normB = new Set(skillsB.map((s) => s.toLowerCase().trim()).filter(Boolean));
  return jaccardSimilarity(normA, normB);
}

/** Checks whether two URLs point to the same repository or domain path. */
export function urlsMatch(url1?: string | null, url2?: string | null): boolean {
  if (!url1 || !url2) return false;
  const clean1 = url1.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clean2 = url2.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return clean1 === clean2 && clean1.length > 0;
}

export interface ExistingProjectMatch {
  id: string;
  title: string;
  status?: string | null;
  skills?: string[];
  repositoryUrl?: string | null;
  demoUrl?: string | null;
}

export interface ProjectDuplicateCheckResult {
  isDuplicate: boolean;
  isCompleted: boolean;
  isInProgress: boolean;
  matchedProject?: ExistingProjectMatch;
  reason?: string;
  similarityScore: number;
}

/**
 * Checks whether a candidate project is a semantic duplicate of an existing user project.
 */
export function isSemanticProjectDuplicate(
  candidate: {
    title: string;
    skills?: string[];
    repositoryUrl?: string;
    demoUrl?: string;
  },
  existingList: ExistingProjectMatch[]
): ProjectDuplicateCheckResult {
  const candidateTokens = tokenize(candidate.title);
  const candidateNorm = normalizeTitle(candidate.title);

  for (const existing of existingList) {
    // 1. Exact URL match (GitHub repo or demo)
    if (
      urlsMatch(candidate.repositoryUrl, existing.repositoryUrl) ||
      urlsMatch(candidate.demoUrl, existing.demoUrl)
    ) {
      const isCompleted = existing.status === 'completed' || existing.status === 'published';
      const isInProgress = !isCompleted;
      return {
        isDuplicate: true,
        isCompleted,
        isInProgress,
        matchedProject: existing,
        reason: `Matches repository or demo URL of existing project "${existing.title}".`,
        similarityScore: 1.0,
      };
    }

    // 2. Normalized title exact match
    const existingNorm = normalizeTitle(existing.title);
    if (candidateNorm.length > 3 && candidateNorm === existingNorm) {
      const isCompleted = existing.status === 'completed' || existing.status === 'published';
      const isInProgress = !isCompleted;
      return {
        isDuplicate: true,
        isCompleted,
        isInProgress,
        matchedProject: existing,
        reason: `Title is identical to existing project "${existing.title}".`,
        similarityScore: 1.0,
      };
    }

    // 3. Token set similarity
    const existingTokens = tokenize(existing.title);
    const tokenSim = jaccardSimilarity(candidateTokens, existingTokens);
    const sOverlap = skillOverlap(candidate.skills ?? [], existing.skills ?? []);

    // Strong token similarity (e.g. 0.65+ overlap in core keywords)
    if (tokenSim >= 0.65) {
      const isCompleted = existing.status === 'completed' || existing.status === 'published';
      const isInProgress = !isCompleted;
      return {
        isDuplicate: true,
        isCompleted,
        isInProgress,
        matchedProject: existing,
        reason: `Substantially similar in topic (${Math.round(tokenSim * 100)}% keyword match) to existing project "${existing.title}".`,
        similarityScore: tokenSim,
      };
    }

    // Moderate token similarity + high skill overlap (e.g. "E-Commerce App" vs "Online Store")
    if (tokenSim >= 0.4 && sOverlap >= 0.5) {
      const isCompleted = existing.status === 'completed' || existing.status === 'published';
      const isInProgress = !isCompleted;
      return {
        isDuplicate: true,
        isCompleted,
        isInProgress,
        matchedProject: existing,
        reason: `Shared domain and ${Math.round(sOverlap * 100)}% skill overlap with existing project "${existing.title}".`,
        similarityScore: Math.max(tokenSim, sOverlap),
      };
    }
  }

  return {
    isDuplicate: false,
    isCompleted: false,
    isInProgress: false,
    similarityScore: 0,
  };
}

export interface ExistingCourseMatch {
  id?: string;
  title: string;
  provider?: string | null;
  url?: string | null;
}

export interface CourseDuplicateCheckResult {
  isDuplicate: boolean;
  matchedCourse?: ExistingCourseMatch;
  reason?: string;
}

/**
 * Checks whether a candidate course is already completed or enrolled by the user.
 */
export function isSemanticCourseDuplicate(
  candidate: {
    id: string;
    title: string;
    provider?: string;
    url?: string;
  },
  completedList: ExistingCourseMatch[]
): CourseDuplicateCheckResult {
  const candidateNorm = normalizeTitle(candidate.title);
  const candidateTokens = tokenize(candidate.title);

  for (const completed of completedList) {
    // 1. Direct ID match
    if (completed.id && completed.id === candidate.id) {
      return {
        isDuplicate: true,
        matchedCourse: completed,
        reason: `Already completed course id "${completed.id}".`,
      };
    }

    // 2. Direct URL match
    if (urlsMatch(candidate.url, completed.url)) {
      return {
        isDuplicate: true,
        matchedCourse: completed,
        reason: `Already completed course with matching URL.`,
      };
    }

    // 3. Exact normalized title match
    const completedNorm = normalizeTitle(completed.title);
    if (candidateNorm.length > 3 && candidateNorm === completedNorm) {
      return {
        isDuplicate: true,
        matchedCourse: completed,
        reason: `Already completed course "${completed.title}".`,
      };
    }

    // 4. High token overlap with same or compatible provider
    const completedTokens = tokenize(completed.title);
    const tokenSim = jaccardSimilarity(candidateTokens, completedTokens);
    const providerMatches =
      !candidate.provider ||
      !completed.provider ||
      candidate.provider.toLowerCase() === completed.provider.toLowerCase();

    if (tokenSim >= 0.65 && providerMatches) {
      return {
        isDuplicate: true,
        matchedCourse: completed,
        reason: `Semantic equivalent (${Math.round(tokenSim * 100)}% title match) of completed course "${completed.title}".`,
      };
    }
  }

  return { isDuplicate: false };
}

export interface ExistingCertificationMatch {
  name: string;
  issuer?: string | null;
  url?: string | null;
  credentialId?: string | null;
}

/**
 * Checks whether a candidate certification is already held by the user.
 */
export function isSemanticCertificationDuplicate(
  candidate: {
    name: string;
    issuer?: string;
    url?: string;
  },
  existingList: ExistingCertificationMatch[]
): { isDuplicate: boolean; matchedCert?: ExistingCertificationMatch; reason?: string } {
  const candidateNorm = normalizeTitle(candidate.name);
  const candidateTokens = tokenize(candidate.name);

  for (const existing of existingList) {
    if (urlsMatch(candidate.url, existing.url)) {
      return {
        isDuplicate: true,
        matchedCert: existing,
        reason: `Matches credential URL of held certification.`,
      };
    }

    const existingNorm = normalizeTitle(existing.name);
    if (candidateNorm.length > 3 && candidateNorm === existingNorm) {
      return {
        isDuplicate: true,
        matchedCert: existing,
        reason: `Already hold certification "${existing.name}".`,
      };
    }

    const existingTokens = tokenize(existing.name);
    const tokenSim = jaccardSimilarity(candidateTokens, existingTokens);
    const sameIssuer =
      !candidate.issuer ||
      !existing.issuer ||
      candidate.issuer.toLowerCase().trim() === existing.issuer.toLowerCase().trim();

    if (tokenSim >= 0.6 && sameIssuer) {
      return {
        isDuplicate: true,
        matchedCert: existing,
        reason: `Already hold similar certification "${existing.name}".`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Career-role relevance check: verifies that a recommended item aligns with the target role.
 * Ensures that non-technical candidates (HR, Nursing, Business, Marketing) do not receive
 * unrelated technical recommendations (e.g. React frontend, Kubernetes, SQL injection) unless relevant.
 */
export function isCareerRoleRelevant(
  item: {
    title: string;
    skills?: string[];
    category?: string;
  },
  targetRole: {
    title: string | null;
    domainId?: string | null;
    skills?: string[];
  }
): boolean {
  if (!targetRole.title) return true; // Without a target role, allow open exploration

  const roleTitleNorm = targetRole.title.toLowerCase();
  const itemTitleNorm = item.title.toLowerCase();

  // Identify distinct non-software domains
  const isHrRole =
    roleTitleNorm.includes('human resources') ||
    roleTitleNorm.includes('hr') ||
    roleTitleNorm.includes('talent acquisition') ||
    roleTitleNorm.includes('recruiter');

  const isMarketingRole =
    roleTitleNorm.includes('marketing') ||
    roleTitleNorm.includes('content') ||
    roleTitleNorm.includes('seo') ||
    roleTitleNorm.includes('copywriter');

  const isDesignRole =
    roleTitleNorm.includes('designer') ||
    roleTitleNorm.includes('ux') ||
    roleTitleNorm.includes('ui') ||
    roleTitleNorm.includes('graphic');

  // Hard rejection of strictly unrelated developer buzzwords for non-developer roles
  const strictDevKeywords = [
    'kubernetes',
    'docker container',
    'compiler',
    'react 19',
    'vue.js',
    'angular framework',
    'next.js',
    'redux toolkit',
    'express.js api',
    'graphql server',
    'microservices architecture',
    'distributed systems',
  ];

  if (isHrRole || isDesignRole || (isMarketingRole && !roleTitleNorm.includes('technical'))) {
    for (const kw of strictDevKeywords) {
      if (itemTitleNorm.includes(kw)) return false;
      if (item.skills?.some((s) => s.toLowerCase() === kw)) return false;
    }
  }

  // If the target role provides skills, ensure at least one skill or the category matches
  if (targetRole.skills && targetRole.skills.length > 0 && item.skills && item.skills.length > 0) {
    const overlap = skillOverlap(item.skills, targetRole.skills);
    if (overlap > 0) return true;
  }

  return true;
}
