// Client-side shapes for the B.5 Learning Hub. These mirror the JSON returned
// by /api/learning/*; the database remains the source of truth.

export type CourseAvailability =
  | 'free'
  | 'free_with_limitations'
  | 'audit'
  | 'free_course_paid_certificate'
  | 'paid'
  | 'youtube_free';

export type CourseFormat =
  | 'course'
  | 'professional_certificate'
  | 'learning_path'
  | 'tutorial'
  | 'video'
  | 'playlist';

export type LearningStatus = 'saved' | 'in_progress' | 'completed' | 'dismissed';

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';

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
  level: CourseLevel;
  durationHours: number | null;
  language: string;
  url: string;
  availability: CourseAvailability;
  availabilityNote: string | null;
  format: CourseFormat;
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

export interface RecommendationContextSummary {
  careerGoal: string;
  targetRoleSlug: string | null;
  targetRoleTitle: string | null;
  experienceLevel: 'entry' | 'mid' | 'senior';
  weeklyHours: number;
  budget: 'free_only' | 'low' | 'any';
  preferredFormat: CourseFormat | 'any';
  skillGapCount: number;
  roadmapSkillCount: number;
}

export interface RecommendationResult {
  recommendations: LearningRecommendation[];
  aiUsed: boolean;
  aiFallbackReason: string | null;
  generatedAt: string;
  context?: RecommendationContextSummary;
}

export interface LearningPreferences {
  targetRoleId?: string;
  targetRoleTitle?: string;
  language?: 'en' | 'ar';
  preferredFormat?: CourseFormat | 'any';
  weeklyHours?: number;
  budget?: 'free_only' | 'low' | 'any';
  focusSkill?: string;
  limit?: number;
  ai?: boolean;
}
