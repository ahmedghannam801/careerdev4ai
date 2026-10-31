// Shared types and the deterministic Learning Hub recommendation engine.
//
// The engine is deliberately pure: it receives a completed snapshot of the
// catalogue, the user's role, skills, roadmap and learning state, and returns
// ranked candidates with an explicit score breakdown. It never calls an LLM.
// The AI layer receives only these already-ranked candidates.
//
// Relevance-gated scoring
// -----------------------
// Generic course metadata (a beginner level, English, a short duration, the
// preferred format and a free price) must never be enough to promote a course.
// The total is therefore gated by role relevance:
//
//   total = 100 × relevance × (0.85 + 0.15 × genericFit)
//
// `relevance` is driven by the user's real gaps, the target role, the role's
// own skills, the roadmap and an explicit focus skill. `genericFit` can only
// move the total by 15 points, so it cannot overpower relevance. A course with
// no role/gap/roadmap signal lands below 50 and can never be labelled the
// next best step.

import {
  GOAL_LEARNING_CATEGORIES,
  categoryServesDomain,
} from '../../shared/learningCategories.ts';
import {
  createSkillLookup,
  skillMatchConfidence,
} from '../../shared/skillMatching.ts';

export type Availability =
  | 'free'
  | 'free_with_limitations'
  | 'audit'
  | 'free_course_paid_certificate'
  | 'paid'
  | 'youtube_free';

export type LearningFormat =
  | 'course'
  | 'professional_certificate'
  | 'learning_path'
  | 'tutorial'
  | 'video'
  | 'playlist';

export type LearningStatus = 'saved' | 'in_progress' | 'completed' | 'dismissed';

export type BudgetPreference = 'free_only' | 'low' | 'any';

export type ExperienceLevel = 'entry' | 'mid' | 'senior';

export interface CourseSkill {
  name: string;
  importance: number;
}

export interface CourseRole {
  roleSlug: string;
  relevanceScore: number;
}

export interface LearningCourse {
  id: string;
  title: string;
  provider: string;
  providerUrl: string | null;
  category: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  durationHours: number | null;
  language: string;
  url: string;
  availability: Availability;
  availabilityNote: string | null;
  format: LearningFormat;
  description: string | null;
  isVerified: boolean;
  skills: CourseSkill[];
  roles: CourseRole[];
}

export interface LearningItem {
  id: string;
  courseId: string;
  status: LearningStatus;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  notes: string | null;
  recommendationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleSkill {
  name: string;
  category?: string;
  minLevel: number;
}

export interface RoleContext {
  slug: string;
  title: string;
  level: string;
  /** The career domain the role belongs to, used to match catalogue categories. */
  domainId?: string;
  requiredSkills: RoleSkill[];
  preferredSkills: RoleSkill[];
}

export interface UserSkillContext {
  name: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
}

export interface LearningContext {
  careerGoal: string;
  targetRole: RoleContext | null;
  userSkills: UserSkillContext[];
  roadmapSkills: string[];
  roadmapCourseIds: string[];
  experienceLevel: ExperienceLevel;
  language: 'en' | 'ar';
  preferredFormat: LearningFormat | 'any';
  weeklyHours: number;
  budget: BudgetPreference;
  completedCourseIds: string[];
  savedCourseIds: string[];
  dismissedCourseIds: string[];
  focusSkill?: string;
}

export interface ScoreBreakdown {
  gap: number;
  role: number;
  roadmap: number;
  goal: number;
  level: number;
  language: number;
  format: number;
  time: number;
  budget: number;
  saved: number;
  focus: number;
  /** 0-100. The relevance gate applied to the total. */
  relevance: number;
  /** 0-100. How well the course's skills match the role's own skills. */
  roleSkill: number;
  /** 0-100. Whether the course category belongs to the role's domain. */
  domain: number;
  /** 0-100. Presentation/metadata fit. Capped to a 15-point influence. */
  genericFit: number;
  total: number;
}

export interface AddressedGap {
  skill: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
}

export interface LearningRecommendation {
  course: LearningCourse;
  score: number;
  reason: string;
  deterministicReason: string;
  matchedSkills: string[];
  gapsAddressed: AddressedGap[];
  roleRelevance: number;
  breakdown: ScoreBreakdown;
  /** True when a role/gap/roadmap/focus signal — not metadata — drives the score. */
  strongSignal: boolean;
  aiExplanation?: string;
  aiSkillGap?: string;
  aiRoadmapLink?: string;
}

export type RecommendationMode = 'next_step' | 'exploration';

export interface RecommendationResult {
  recommendations: LearningRecommendation[];
  /** Null when no candidate clears the strong-signal bar. */
  nextStep: LearningRecommendation | null;
  mode: RecommendationMode;
  explorationReason: string | null;
  aiUsed: boolean;
  aiFallbackReason: string | null;
  generatedAt: string;
}

/** The display weights, retained for the per-factor breakdown. */
const WEIGHTS = {
  gap: 35,
  role: 22,
  roadmap: 12,
  goal: 6,
  level: 6,
  language: 3,
  format: 3,
  time: 4,
  budget: 5,
  saved: 4,
  focus: 10,
} as const;

/**
 * The minimum score and relevance for a course to be presented as the single
 * "next best step". Anything below this is exploration, not a directive.
 */
export const NEXT_STEP_MIN_SCORE = 50;
export const NEXT_STEP_MIN_RELEVANCE = 0.5;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function availabilityLabel(course: LearningCourse): string {
  switch (course.availability) {
    case 'free':
      return 'Free';
    case 'free_with_limitations':
      return 'Free with limitations';
    case 'audit':
      return 'Free to audit';
    case 'free_course_paid_certificate':
      return 'Free course, paid certificate';
    case 'paid':
      return 'Paid';
    case 'youtube_free':
      return 'Free on YouTube';
  }
}

function formatLabel(format: LearningFormat): string {
  return format.replace(/_/g, ' ');
}

/** Builds the effective gap map, including role skills the user has not added yet. */
export function buildGapMap(context: LearningContext): Map<string, UserSkillContext> {
  const gaps = new Map<string, UserSkillContext>();
  const add = (name: string, currentLevel: number, targetLevel: number) => {
    const existing = gaps.get(name);
    const current = existing ? Math.max(existing.currentLevel, currentLevel) : currentLevel;
    const target = Math.max(existing?.targetLevel ?? 0, targetLevel);
    gaps.set(name, {
      name,
      currentLevel: current,
      targetLevel: target,
      gap: Math.max(0, target - current),
    });
  };

  for (const skill of context.userSkills) {
    add(skill.name, skill.currentLevel, skill.targetLevel);
  }
  if (context.targetRole) {
    for (const skill of context.targetRole.requiredSkills) {
      add(skill.name, 0, skill.minLevel);
    }
    for (const skill of context.targetRole.preferredSkills) {
      add(skill.name, 0, skill.minLevel);
    }
  }
  return gaps;
}

function levelFit(courseLevel: LearningCourse['level'], experience: ExperienceLevel): number {
  const matrix: Record<ExperienceLevel, Record<LearningCourse['level'], number>> = {
    entry: { Beginner: 1, Intermediate: 0.62, Advanced: 0.22 },
    mid: { Beginner: 0.58, Intermediate: 1, Advanced: 0.64 },
    senior: { Beginner: 0.32, Intermediate: 0.72, Advanced: 1 },
  };
  return matrix[experience][courseLevel];
}

/**
 * How well a course serves the user's career goal.
 *
 * A course in the user's target-role domain is directly relevant whatever
 * their goal is, so it scores well. Otherwise the goal's category list is
 * consulted. A category that neither list knows about is treated as NEUTRAL
 * rather than penalised: the old hard-coded technical list meant every
 * course in a new discipline scored 0.25 for every goal.
 */
function goalFit(
  course: LearningCourse,
  careerGoal: string,
  targetRole?: RoleContext | null
): number {
  const goalCategories = GOAL_LEARNING_CATEGORIES[careerGoal] ?? [];
  const servesDomain = categoryServesDomain(course.category, targetRole?.domainId);
  const suitsGoal = goalCategories.includes(course.category);

  let score: number;
  if (servesDomain && suitsGoal) score = 0.9;
  else if (servesDomain) score = 0.75;
  else if (suitsGoal) score = 0.7;
  else if (goalCategories.length === 0) score = 0.5;
  else score = 0.45;

  if (careerGoal === 'get_first_job' || careerGoal === 'get_internship') {
    if (course.level === 'Beginner') score += 0.1;
  }
  if (careerGoal === 'become_specialist' || careerGoal === 'get_promoted') {
    if (course.level !== 'Beginner') score += 0.1;
  }
  if (careerGoal === 'build_portfolio') {
    if (course.format === 'professional_certificate' || course.format === 'tutorial') score += 0.1;
  }
  return clamp01(score);
}

function timeFit(course: LearningCourse, weeklyHours: number): number {
  const duration = course.durationHours ?? 0;
  if (!duration) return 0.6;
  const monthHours = Math.max(1, weeklyHours) * 4;
  const quarterHours = Math.max(1, weeklyHours) * 12;
  if (duration <= monthHours) return 1;
  if (duration <= quarterHours) return 0.65;
  return 0.3;
}

function budgetFit(course: LearningCourse, budget: BudgetPreference): number {
  switch (course.availability) {
    case 'free':
    case 'youtube_free':
      return 1;
    case 'audit':
      return budget === 'free_only' ? 1 : 0.9;
    case 'free_course_paid_certificate':
      return budget === 'free_only' ? 1 : 0.85;
    case 'free_with_limitations':
      return budget === 'free_only' ? 0.9 : 0.75;
    case 'paid':
      return budget === 'any' ? 0.35 : 0;
  }
}

function isAllowedByBudget(course: LearningCourse, budget: BudgetPreference): boolean {
  if (budget !== 'free_only') return true;
  return course.availability !== 'paid';
}

function formatReason(
  course: LearningCourse,
  roleTitle: string | null,
  matchedSkills: string[],
  gaps: AddressedGap[],
  roadmapMatches: string[]
): string {
  const parts: string[] = [];
  const topGaps = gaps.slice(0, 2);
  if (topGaps.length > 0) {
    const gapText = topGaps
      .map((gap) => `${gap.skill} (${gap.currentLevel}/5 to ${gap.targetLevel}/5)`)
      .join(' and ');
    parts.push(`Closes your ${gapText} gap${topGaps.length > 1 ? 's' : ''}.`);
  } else if (matchedSkills.length > 0) {
    parts.push(`Builds ${matchedSkills.slice(0, 2).join(' and ')}.`);
  } else {
    parts.push('Adds a new skill area to your profile.');
  }

  if (roleTitle) {
    parts.push(`Directly relevant to your target role, ${roleTitle}.`);
  }
  if (roadmapMatches.length > 0) {
    parts.push(`Maps to your roadmap focus on ${roadmapMatches.slice(0, 2).join(' and ')}.`);
  }
  parts.push(`${course.provider}; ${formatLabel(course.format)}; ${availabilityLabel(course)}.`);
  return parts.join(' ');
}

export interface ScoreCourseOptions {
  /** Set to false to include courses the user has already completed. */
  excludeCompleted?: boolean;
}

/**
 * Scores one course. Exported so the ranking can be tested at the factor level.
 * `null` means the course is excluded (dismissed, completed if requested, or
 * over budget when the user asked for free-only learning).
 */
export function scoreCourse(
  course: LearningCourse,
  context: LearningContext,
  options: ScoreCourseOptions = {}
): LearningRecommendation | null {
  if (context.dismissedCourseIds.includes(course.id)) return null;
  if (options.excludeCompleted !== false && context.completedCourseIds.includes(course.id)) {
    return null;
  }
  if (!isAllowedByBudget(course, context.budget)) return null;

  const gapMap = buildGapMap(context);
  const gapLookup = createSkillLookup(gapMap.keys());

  const targetSlug = context.targetRole?.slug ?? null;
  const roleMatch = targetSlug
    ? course.roles.find((role) => role.roleSlug === targetSlug)
    : undefined;
  const roleRelevance = roleMatch ? roleMatch.relevanceScore / 100 : 0;

  // A course can name the same capability differently from the role catalogue.
  // Resolve each course skill to at most one gap and keep its strongest
  // contribution, so five phrasings of "SQL" cannot inflate the gap score.
  const matchedGaps = new Map<string, number>();
  for (const skill of course.skills) {
    const hit = gapLookup.find(skill.name, 0.8);
    if (!hit) continue;
    matchedGaps.set(hit.name, Math.max(matchedGaps.get(hit.name) ?? 0, skill.importance * hit.confidence));
  }
  const matchedSkills = [...matchedGaps.keys()];

  const gapsAddressed: AddressedGap[] = [];
  let gapRaw = 0;
  for (const [name, importance] of matchedGaps) {
    const gap = gapMap.get(name);
    if (!gap) continue;
    const gapNorm = clamp01(gap.gap / 4);
    const importanceNorm = clamp01(importance / 5);
    gapRaw += gapNorm * importanceNorm;
    if (gap.gap > 0) {
      gapsAddressed.push({
        skill: gap.name,
        currentLevel: gap.currentLevel,
        targetLevel: gap.targetLevel,
        gap: gap.gap,
      });
    }
  }
  const gapScore = clamp01(gapRaw / 2.4);

  // How strongly the course's own skills are the target role's skills. This is
  // the signal that a generic category can never fake: HTML/CSS has no motion
  // role skill, so it earns nothing here for a Motion & Video Designer.
  const roleSkillLevels = new Map<string, { required: boolean; minLevel: number }>();
  if (context.targetRole) {
    for (const skill of context.targetRole.requiredSkills) {
      roleSkillLevels.set(skill.name, { required: true, minLevel: skill.minLevel });
    }
    for (const skill of context.targetRole.preferredSkills) {
      if (!roleSkillLevels.has(skill.name)) {
        roleSkillLevels.set(skill.name, { required: false, minLevel: skill.minLevel });
      }
    }
  }
  const roleSkillLookup = createSkillLookup(roleSkillLevels.keys());
  const roleMatches = new Map<string, number>();
  for (const skill of course.skills) {
    const hit = roleSkillLookup.find(skill.name, 0.8);
    if (!hit) continue;
    const roleSkill = roleSkillLevels.get(hit.name);
    if (!roleSkill) continue;
    const contribution =
      (roleSkill.minLevel / 5) *
      (skill.importance / 5) *
      (roleSkill.required ? 1 : 0.7) *
      hit.confidence;
    roleMatches.set(hit.name, Math.max(roleMatches.get(hit.name) ?? 0, contribution));
  }
  const roleSkillRaw = [...roleMatches.values()].reduce((sum, value) => sum + value, 0);
  const roleSkillScore = clamp01(roleSkillRaw / 1.5);

  const roadmapLookup = createSkillLookup(context.roadmapSkills);
  const roadmapSkillMatches = [
    ...new Set(
      course.skills
        .map((skill) => roadmapLookup.find(skill.name, 0.8)?.name)
        .filter((name): name is string => Boolean(name))
    ),
  ];
  const roadmapCourseMatch = context.roadmapCourseIds.includes(course.id);
  const roadmapScore = roadmapCourseMatch ? 1 : clamp01(roadmapSkillMatches.length / 2);

  const focusScore =
    context.focusSkill &&
    course.skills.some(
      (skill) => skillMatchConfidence(skill.name, context.focusSkill!) >= 0.8
    )
      ? 1
      : 0;

  const languageScore = course.language.toLowerCase().startsWith(context.language) ? 1 : 0.3;
  const formatScore =
    context.preferredFormat === 'any' || course.format === context.preferredFormat ? 1 : 0.45;
  const savedScore = context.savedCourseIds.includes(course.id) ? 1 : 0;
  const budgetScore = budgetFit(course, context.budget);
  const goalScore = goalFit(course, context.careerGoal, context.targetRole);
  const domainScore = categoryServesDomain(course.category, context.targetRole?.domainId) ? 1 : 0;

  const genericFit = clamp01(
    levelFit(course.level, context.experienceLevel) * 0.45 +
      languageScore * 0.15 +
      formatScore * 0.1 +
      timeFit(course, context.weeklyHours) * 0.2 +
      budgetScore * 0.1
  );

  // Direct signals. Goal/domain are deliberately weak: they describe the
  // discipline, not this user's next requirement.
  const directRelevance = Math.max(
    roleRelevance,
    roleSkillScore * 0.95,
    gapScore * 0.8,
    roadmapScore * 0.85,
    focusScore,
    savedScore * 0.5
  );
  const weakRelevance = Math.max(goalScore * 0.4, domainScore * 0.35);
  const relevance = clamp01(Math.max(directRelevance, weakRelevance));

  const total = round(
    100 * relevance * (0.85 + 0.15 * genericFit)
  );

  const strongSignal = Boolean(
    roleRelevance >= 0.7 ||
      (roleSkillScore >= 0.45 && (gapScore > 0 || roleRelevance > 0)) ||
      (gapScore >= 0.35 && relevance >= 0.5) ||
      (roadmapScore >= 0.5 && relevance >= 0.5) ||
      (focusScore > 0 && relevance >= 0.6)
  );

  const breakdown: ScoreBreakdown = {
    gap: round(WEIGHTS.gap * gapScore),
    role: round(WEIGHTS.role * roleRelevance),
    roadmap: round(WEIGHTS.roadmap * roadmapScore),
    goal: round(WEIGHTS.goal * goalScore),
    level: round(WEIGHTS.level * levelFit(course.level, context.experienceLevel)),
    language: round(WEIGHTS.language * languageScore),
    format: round(WEIGHTS.format * formatScore),
    time: round(WEIGHTS.time * timeFit(course, context.weeklyHours)),
    budget: round(WEIGHTS.budget * budgetScore),
    saved: round(WEIGHTS.saved * savedScore),
    focus: round(focusScore * WEIGHTS.focus),
    relevance: round(relevance * 100),
    roleSkill: round(roleSkillScore * 100),
    domain: round(domainScore * 100),
    genericFit: round(genericFit * 100),
    total,
  };

  const sortedGaps = [...gapsAddressed].sort((a, b) => b.gap - a.gap);
  const reason = formatReason(
    course,
    context.targetRole?.title ?? null,
    matchedSkills,
    sortedGaps,
    roadmapSkillMatches
  );

  return {
    course,
    score: breakdown.total,
    reason,
    deterministicReason: reason,
    matchedSkills,
    gapsAddressed: sortedGaps,
    roleRelevance: round(roleRelevance, 3),
    breakdown,
    strongSignal,
  };
}

export interface RankOptions extends ScoreCourseOptions {
  limit?: number;
}

/** Deterministic ranking. Ties break on role relevance and then on title. */
export function rankCourses(
  courses: LearningCourse[],
  context: LearningContext,
  options: RankOptions = {}
): LearningRecommendation[] {
  const limit = Math.max(1, Math.min(40, options.limit ?? 12));
  const ranked: LearningRecommendation[] = [];
  for (const course of courses) {
    const scored = scoreCourse(course, context, options);
    if (scored) ranked.push(scored);
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.roleRelevance !== a.roleRelevance) return b.roleRelevance - a.roleRelevance;
    return a.course.title.localeCompare(b.course.title);
  });
  return ranked.slice(0, limit);
}

/** True when a recommendation is strong enough to be called the next step. */
export function isStrongNextStep(recommendation: LearningRecommendation): boolean {
  return (
    recommendation.score >= NEXT_STEP_MIN_SCORE &&
    recommendation.breakdown.relevance >= NEXT_STEP_MIN_RELEVANCE * 100 &&
    recommendation.strongSignal
  );
}

export interface NextStepDecision {
  nextStep: LearningRecommendation | null;
  mode: RecommendationMode;
  explorationReason: string | null;
}

/**
 * Selects at most one next step. When nothing clears the bar, the caller gets
 * an explicit exploration state and a reason — never a weak course presented
 * as a directive.
 */
export function selectNextStep(
  recommendations: LearningRecommendation[],
  context: Pick<LearningContext, 'targetRole'>
): NextStepDecision {
  const candidate = recommendations.find(isStrongNextStep) ?? null;
  if (candidate) {
    return { nextStep: candidate, mode: 'next_step', explorationReason: null };
  }

  const roleTitle = context.targetRole?.title;
  const explorationReason = roleTitle
    ? `No catalogue course is strongly aligned with ${roleTitle} right now. The options below are broader exploration, not a recommended next step.`
    : 'Choose a target role first so courses can be ranked against real requirements.';

  return { nextStep: null, mode: 'exploration', explorationReason };
}
