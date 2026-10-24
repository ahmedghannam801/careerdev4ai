// Builds the LearningContext from the persisted CareerPilot graph.
//
// The Learning Hub never trusts a client-supplied career profile: target role,
// skills, roadmap and learning state are read from PostgreSQL using the
// verified user id. Only presentation preferences (weekly time, budget,
// format, an explicit target-role override and a roadmap focus skill) come from
// the request.

import { getProfile } from '../db/profiles.ts';
import { getPreferences } from '../db/preferences.ts';
import { getRoadmap } from '../db/roadmap.ts';
import {
  listCourses,
  listLearningItems,
  listUserSkillsWithNames,
} from '../db/learning.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import type {
  BudgetPreference,
  ExperienceLevel,
  LearningContext,
  LearningCourse,
  LearningFormat,
  RoleContext,
  UserSkillContext,
} from './recommendation.ts';

export interface RecommendationPreferences {
  targetRoleId?: string;
  targetRoleTitle?: string;
  language?: 'en' | 'ar';
  preferredFormat?: LearningFormat | 'any';
  weeklyHours?: number;
  budget?: BudgetPreference;
  focusSkill?: string;
  limit?: number;
}

function experienceFromProfile(
  userType: string | null,
  yearsOfExperience: string | null,
  roleLevel: string | null
): ExperienceLevel {
  const years = Number.parseInt(yearsOfExperience ?? '', 10);
  if (Number.isFinite(years)) {
    if (years >= 5) return 'senior';
    if (years >= 2) return 'mid';
    return 'entry';
  }
  if (userType === 'working_professional' || userType === 'career_switcher') {
    return roleLevel === 'Senior' || roleLevel === 'Lead' ? 'senior' : 'mid';
  }
  return 'entry';
}

function findRole(preferences: RecommendationPreferences, persistedTitle: string | null): RoleContext | null {
  const byId = preferences.targetRoleId
    ? resolveRole(preferences.targetRoleId)
    : undefined;
  const persisted = preferences.targetRoleTitle ?? persistedTitle ?? '';
  const byTitle = resolveRole(persisted);
  const role = byId ?? byTitle;
  if (!role) return null;
  return {
    slug: role.id,
    title: role.title,
    level: role.level,
    domainId: role.domainId,
    requiredSkills: role.requiredSkills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      minLevel: skill.minLevel,
    })),
    preferredSkills: role.preferredSkills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      minLevel: skill.minLevel,
    })),
  };
}

function mostCommonFormat(
  items: { courseId: string; status: string }[],
  courseFormats: Map<string, LearningFormat>
): LearningFormat | null {
  const counts = new Map<LearningFormat, number>();
  for (const item of items) {
    if (item.status !== 'completed' && item.status !== 'in_progress') continue;
    const format = courseFormats.get(item.courseId);
    if (!format) continue;
    counts.set(format, (counts.get(format) ?? 0) + 1);
  }
  let best: LearningFormat | null = null;
  let bestCount = 0;
  for (const [format, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && format < best)) {
      best = format;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

export interface BuiltLearningContext {
  context: LearningContext;
  limit: number;
  courses: LearningCourse[];
}

export async function buildLearningContext(
  profileId: string,
  preferences: RecommendationPreferences = {}
): Promise<BuiltLearningContext> {
  const [profile, prefs, roadmap, items, userSkills, courses] = await Promise.all([
    getProfile(profileId),
    getPreferences(profileId),
    getRoadmap(profileId),
    listLearningItems(profileId),
    listUserSkillsWithNames(profileId),
    listCourses(),
  ]);

  const targetRole = findRole(preferences, profile?.target_role ?? null);
  const roleSkills = new Map<string, number>();
  if (targetRole) {
    for (const skill of [...targetRole.requiredSkills, ...targetRole.preferredSkills]) {
      roleSkills.set(skill.name, Math.max(roleSkills.get(skill.name) ?? 0, skill.minLevel));
    }
  }

  const skillContexts: UserSkillContext[] = userSkills.map((skill) => {
    const targetLevel = roleSkills.get(skill.name) ?? skill.currentLevel;
    return {
      name: skill.name,
      currentLevel: skill.currentLevel,
      targetLevel,
      gap: Math.max(0, targetLevel - skill.currentLevel),
    };
  });

  const tasks = roadmap?.phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) => milestone.tasks)
  ) ?? [];
  const roadmapSkills = [
    ...new Set(
      tasks
        .map((task) => task.skillName?.trim() ?? '')
        .filter((name) => name.length > 0)
    ),
  ];
  const roadmapCourseIds = [
    ...new Set(
      tasks
        .map((task) => task.resourceId?.trim() ?? '')
        .filter((id) => id.length > 0)
    ),
  ];

  const courseFormats = new Map<string, LearningFormat>();
  // The course format is not present on the learning item; the catalogue
  // supplies it. The derived preference is intentionally conservative and is
  // only used after the user has engaged with the same format at least twice.
  for (const course of courses) {
    courseFormats.set(course.id, course.format);
  }

  const completedCourseIds = items.filter((item) => item.status === 'completed').map((item) => item.courseId);
  const savedCourseIds = items.filter((item) => item.status === 'saved').map((item) => item.courseId);
  const dismissedCourseIds = items.filter((item) => item.status === 'dismissed').map((item) => item.courseId);

  const explicitFormat = preferences.preferredFormat;
  const derivedFormat =
    items.length > 0
      ? mostCommonFormat(items, courseFormats)
      : null;

  const weeklyHours = Math.max(1, Math.min(40, preferences.weeklyHours ?? 5));
  const budget: BudgetPreference = preferences.budget ?? 'free_only';
  const language =
    preferences.language ??
    (prefs?.language === 'ar' ? 'ar' : 'en');

  return {
    context: {
      careerGoal: profile?.career_goal ?? 'explore_careers',
      targetRole,
      userSkills: skillContexts,
      roadmapSkills,
      roadmapCourseIds,
      experienceLevel: experienceFromProfile(
        profile?.user_type ?? null,
        (profile as { years_of_experience?: string | null } | null)?.years_of_experience ?? null,
        targetRole?.level ?? null
      ),
      language,
      preferredFormat: explicitFormat ?? derivedFormat ?? 'any',
      weeklyHours,
      budget,
      completedCourseIds,
      savedCourseIds,
      dismissedCourseIds,
      focusSkill: preferences.focusSkill?.trim().slice(0, 80) || undefined,
    },
    limit: Math.max(1, Math.min(20, preferences.limit ?? 12)),
    courses,
  };
}
