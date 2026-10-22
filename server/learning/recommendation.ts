// Shared types and the deterministic Learning Hub recommendation engine.
//
// The engine is deliberately pure: it receives a completed snapshot of the
// catalogue, the user's role, skills, roadmap and learning state, and returns
// ranked candidates with an explicit score breakdown. It never calls an LLM.
// The AI layer receives only these already-ranked candidates.

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
  aiExplanation?: string;
  aiSkillGap?: string;
  aiRoadmapLink?: string;
}

export interface RecommendationResult {
  recommendations: LearningRecommendation[];
  aiUsed: boolean;
  aiFallbackReason: string | null;
  generatedAt: string;
}

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

const GOAL_CATEGORIES: Record<string, string[]> = {
  get_first_job: ['Programming', 'Data', 'Frontend', 'Cloud', 'Cybersecurity'],
  get_internship: ['Programming', 'Data', 'Frontend', 'Cybersecurity'],
  switch_career: ['Programming', 'Data', 'Frontend', 'Cloud', 'Cybersecurity'],
  get_promoted: ['Product', 'Data', 'Cloud', 'AI'],
  become_specialist: ['AI', 'Data', 'Cloud', 'Cybersecurity'],
  become_manager: ['Product', 'Data'],
  build_portfolio: ['Frontend', 'Backend', 'Data', 'Design'],
  freelance: ['Frontend', 'Backend', 'Design'],
  explore_careers: ['Programming', 'Data', 'AI', 'Design', 'Product'],
  custom: [],
};

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

function goalFit(course: LearningCourse, careerGoal: string): number {
  const categories = GOAL_CATEGORIES[careerGoal] ?? [];
  let score = categories.includes(course.category) ? 0.8 : 0.25;
  if (careerGoal === 'get_first_job' || careerGoal === 'get_internship') {
    if (course.level === 'Beginner') score += 0.2;
  }
  if (careerGoal === 'become_specialist' || careerGoal === 'get_promoted') {
    if (course.level !== 'Beginner') score += 0.15;
  }
  if (careerGoal === 'build_portfolio') {
    if (course.format === 'professional_certificate' || course.format === 'tutorial') score += 0.15;
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
  const targetSlug = context.targetRole?.slug ?? null;
  const roleMatch = targetSlug
    ? course.roles.find((role) => role.roleSlug === targetSlug)
    : undefined;
  const roleRelevance = roleMatch ? roleMatch.relevanceScore / 100 : 0;

  const matchedSkills = course.skills
    .map((skill) => skill.name)
    .filter((name) => gapMap.has(name));

  const gapsAddressed: AddressedGap[] = [];
  let gapRaw = 0;
  for (const skill of course.skills) {
    const gap = gapMap.get(skill.name);
    if (!gap) continue;
    const gapNorm = clamp01(gap.gap / 4);
    const importanceNorm = clamp01(skill.importance / 5);
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

  const roadmapSkillMatches = course.skills
    .map((skill) => skill.name)
    .filter((name) => context.roadmapSkills.includes(name));
  const roadmapCourseMatch = context.roadmapCourseIds.includes(course.id);
  const roadmapScore = roadmapCourseMatch ? 1 : clamp01(roadmapSkillMatches.length / 2);

  const focusMatch =
    context.focusSkill &&
    course.skills.some(
      (skill) => skill.name.toLowerCase() === context.focusSkill!.toLowerCase()
    );
  const focusScore = focusMatch ? 1 : 0;

  const languageScore = course.language.toLowerCase().startsWith(context.language) ? 1 : 0.3;
  const formatScore =
    context.preferredFormat === 'any' || course.format === context.preferredFormat ? 1 : 0.45;
  const savedScore = context.savedCourseIds.includes(course.id) ? 1 : 0;
  const budgetScore = budgetFit(course, context.budget);

  const breakdown: ScoreBreakdown = {
    gap: round(WEIGHTS.gap * gapScore),
    role: round(WEIGHTS.role * roleRelevance),
    roadmap: round(WEIGHTS.roadmap * roadmapScore),
    goal: round(WEIGHTS.goal * goalFit(course, context.careerGoal)),
    level: round(WEIGHTS.level * levelFit(course.level, context.experienceLevel)),
    language: round(WEIGHTS.language * languageScore),
    format: round(WEIGHTS.format * formatScore),
    time: round(WEIGHTS.time * timeFit(course, context.weeklyHours)),
    budget: round(WEIGHTS.budget * budgetScore),
    saved: round(WEIGHTS.saved * savedScore),
    focus: round(focusScore * WEIGHTS.focus),
    total: 0,
  };
  breakdown.total = round(
    breakdown.gap +
      breakdown.role +
      breakdown.roadmap +
      breakdown.goal +
      breakdown.level +
      breakdown.language +
      breakdown.format +
      breakdown.time +
      breakdown.budget +
      breakdown.saved +
      breakdown.focus
  );

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
