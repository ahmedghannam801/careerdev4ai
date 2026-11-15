/**
 * Deterministic matching for the Career Experience Hub.
 *
 * The ranking is a pure function of the curated catalogue and the candidate's
 * own career graph. No model is called, no statistic is invented and the same
 * inputs always produce the same order. The interface explains a match only
 * with the signals that actually fired.
 */

import type {
  CareerExperience,
  ExperienceProgress,
} from './careerExperience.ts';

export type ExperienceMatchReasonCode =
  | 'target_domain'
  | 'target_role'
  | 'skill_gap'
  | 'roadmap'
  | 'learning'
  | 'level'
  | 'explore';

export interface ExperienceMatchReason {
  code: ExperienceMatchReasonCode;
  /** The skills that produced the signal, when the reason is skill-based. */
  skills?: string[];
}

export interface ExperienceMatchContext {
  /** The stable catalogue id of the target role. */
  targetRoleSlug?: string | null;
  targetRoleTitle?: string | null;
  /** The parent domain of the target role. */
  targetDomainId?: string | null;
  /** The target role's required skill names. */
  requiredSkills?: string[];
  /** The skills the candidate is missing for the target role. */
  gapSkills?: string[];
  /** The skills named by unfinished roadmap steps. */
  roadmapSkills?: string[];
  /** The skills covered by learning the candidate has already completed. */
  learningSkills?: string[];
  /** The skills the candidate has actually rated or added. */
  ownedSkills?: Array<{ name: string; level: number }>;
  /** student | intern | junior | mid | senior | lead. */
  experienceLevel?: string | null;
}

export interface ExperienceMatch {
  experience: CareerExperience;
  /** 0–100. Used for ordering, not presented as a probability. */
  score: number;
  reasons: ExperienceMatchReason[];
  matchedSkills: string[];
  gapSkillsAddressed: string[];
  /** True when a domain, role, gap, roadmap or learning signal fired. */
  strongSignal: boolean;
}

export interface RankExperiencesOptions {
  /** Completed experiences are left out unless explicitly requested. */
  includeCompleted?: boolean;
  /** Cap the list; omitted means every eligible experience. */
  limit?: number;
}

const LEVEL_DIFFICULTY: Record<string, 'introductory' | 'intermediate' | 'advanced'> = {
  student: 'introductory',
  intern: 'introductory',
  junior: 'intermediate',
  mid: 'intermediate',
  senior: 'advanced',
  lead: 'advanced',
};

const DIFFICULTY_ORDER = ['introductory', 'intermediate', 'advanced'] as const;

/** Lowercased, punctuation-tolerant skill key used for comparisons. */
export function skillKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Builds the set of normalised names, dropping blanks and duplicates. */
function toKeySet(names: readonly string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const name of names ?? []) {
    if (typeof name !== 'string') continue;
    const key = skillKey(name);
    if (key) set.add(key);
  }
  return set;
}

/** Adds names to `target` when they are not present yet. */
function collectMatches(
  experience: CareerExperience,
  keys: Set<string>
): string[] {
  const matched: string[] = [];
  for (const skill of experience.skills) {
    if (!keys.has(skillKey(skill.name))) continue;
    if (matched.some((name) => skillKey(name) === skillKey(skill.name))) continue;
    matched.push(skill.name);
  }
  return matched;
}

/** One skill reason per code, with every contributing skill attached. */
function pushReason(
  reasons: ExperienceMatchReason[],
  code: ExperienceMatchReasonCode,
  skills?: string[]
): void {
  const existing = reasons.find((reason) => reason.code === code);
  if (existing) {
    if (skills?.length) {
      const current = new Set((existing.skills ?? []).map(skillKey));
      for (const skill of skills) {
        if (current.has(skillKey(skill))) continue;
        current.add(skillKey(skill));
        existing.skills = [...(existing.skills ?? []), skill];
      }
    }
    return;
  }
  reasons.push(skills?.length ? { code, skills } : { code });
}

function levelScore(
  difficulty: CareerExperience['difficulty'],
  experienceLevel: string | null | undefined
): number {
  const wanted = LEVEL_DIFFICULTY[String(experienceLevel ?? '').toLowerCase()];
  if (!wanted) return 0;
  const wantedIndex = DIFFICULTY_ORDER.indexOf(wanted);
  const actualIndex = DIFFICULTY_ORDER.indexOf(difficulty);
  const distance = Math.abs(wantedIndex - actualIndex);
  if (distance === 0) return 6;
  if (distance === 1) return 3;
  return 0;
}

/**
 * Scores one experience against the candidate's context.
 *
 * The weights sum to more than 100 on purpose: a candidate can have every
 * signal at once. The published score is clamped, and the ORDER is what the
 * weights decide, not a claim about an exact probability.
 */
export function scoreExperience(
  experience: CareerExperience,
  context: ExperienceMatchContext,
  progress?: ExperienceProgress | null
): ExperienceMatch {
  const reasons: ExperienceMatchReason[] = [];
  const requiredSkills = toKeySet(context.requiredSkills);
  const gapSkills = toKeySet(context.gapSkills);
  const roadmapSkills = toKeySet(context.roadmapSkills);
  const learningSkills = toKeySet(context.learningSkills);

  let score = 5;
  let strongSignal = false;

  // The role's own domain is the strongest single signal.
  if (
    context.targetDomainId &&
    (experience.domainIds as readonly string[]).includes(context.targetDomainId)
  ) {
    score += 30;
    strongSignal = true;
    pushReason(reasons, 'target_domain');
  }

  // An explicit role mapping is even more specific than the domain.
  const roleMatch = Boolean(
    context.targetRoleSlug &&
      experience.roles.some((role) => role.roleSlug === context.targetRoleSlug)
  );
  if (roleMatch) {
    score += 25;
    strongSignal = true;
    pushReason(reasons, 'target_role');
  }

  // Skills the candidate is missing but the simulation practices.
  const gapMatches = collectMatches(experience, gapSkills);
  if (gapMatches.length > 0) {
    score += Math.min(20, gapMatches.length * 10);
    strongSignal = true;
    pushReason(reasons, 'skill_gap', gapMatches);
  }

  // Skills the target role requires, which the candidate may already hold.
  const requiredMatches = collectMatches(experience, requiredSkills);
  if (requiredMatches.length > 0) {
    score += Math.min(10, requiredMatches.length * 3);
    pushReason(reasons, 'target_role', requiredMatches);
  }

  // Skills an unfinished roadmap step names.
  const roadmapMatches = collectMatches(experience, roadmapSkills);
  if (roadmapMatches.length > 0) {
    score += Math.min(8, roadmapMatches.length * 4);
    strongSignal = true;
    pushReason(reasons, 'roadmap', roadmapMatches);
  }

  // Skills already covered by a completed learning resource.
  const learningMatches = collectMatches(experience, learningSkills);
  if (learningMatches.length > 0) {
    score += Math.min(6, learningMatches.length * 3);
    strongSignal = true;
    pushReason(reasons, 'learning', learningMatches);
  }

  const level = levelScore(experience.difficulty, context.experienceLevel);
  if (level > 0) {
    score += level;
    pushReason(reasons, 'level');
  }

  // A simulation already under way is worth finishing before starting another.
  if (progress?.status === 'in_progress') {
    score += 4;
    strongSignal = true;
  }

  // A curated placement only breaks ties between otherwise equal matches.
  if (experience.isFeatured) score += 2;

  const matchedSkills = Array.from(
    new Set([...gapMatches, ...requiredMatches, ...roadmapMatches, ...learningMatches])
  );

  if (reasons.length === 0) pushReason(reasons, 'explore');

  return {
    experience,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    matchedSkills,
    gapSkillsAddressed: gapMatches,
    strongSignal,
  };
}

/**
 * Ranks the catalogue for the candidate.
 *
 * Completed experiences are excluded by default: a recommendation shelf that
 * keeps offering work already finished is noise. The completed shelf reads
 * the progress rows directly instead.
 */
export function rankExperiences(
  experiences: readonly CareerExperience[],
  context: ExperienceMatchContext = {},
  progress: readonly ExperienceProgress[] = [],
  options: RankExperiencesOptions = {}
): ExperienceMatch[] {
  const progressByExperience = new Map(
    progress.map((row) => [row.experienceId, row])
  );

  const ranked = experiences
    .filter((experience) => experience.isActive !== false)
    .filter((experience) => {
      if (options.includeCompleted) return true;
      return progressByExperience.get(experience.id)?.status !== 'completed';
    })
    .map((experience) =>
      scoreExperience(experience, context, progressByExperience.get(experience.id))
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const featured =
        Number(Boolean(b.experience.isFeatured)) -
        Number(Boolean(a.experience.isFeatured));
      if (featured !== 0) return featured;
      if (a.experience.sortOrder !== b.experience.sortOrder) {
        return a.experience.sortOrder - b.experience.sortOrder;
      }
      return a.experience.title.localeCompare(b.experience.title);
    });

  return typeof options.limit === 'number'
    ? ranked.slice(0, Math.max(0, options.limit))
    : ranked;
}

/** The experience to put first, or null when the catalogue is empty. */
export function selectNextExperience(
  matches: readonly ExperienceMatch[]
): ExperienceMatch | null {
  return matches.find((match) => match.strongSignal) ?? matches[0] ?? null;
}
