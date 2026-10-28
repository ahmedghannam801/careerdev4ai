// Builds the career context the AI assistant reasons over.
//
// The copilot used to build its prompt from a client-supplied `context`
// object. That meant the assistant never actually knew the user's career
// state: the facts it stated were whatever the browser chose to send, and it
// had no roadmap, learning progress, education or work history to work from.
//
// This module reads the same graph the rest of the API reads, for the
// VERIFIED user id, and turns it into a compact, domain-neutral summary. The
// copilot prompt is then grounded in the user's real state.
//
// Nothing here is specific to a career domain: the target role is resolved
// through the shared role catalogue, so an HR specialist, a nurse and a
// frontend engineer all get an equally grounded prompt.

import { getProfileDto } from '../db/profile.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { listJobApplications } from '../db/jobApplications.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';
import { listRoadmaps } from '../db/roadmap.ts';
import { getPreferences } from '../db/preferences.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import type { TargetRole } from '../../shared/careerTypes.ts';

/** Normalises a skill name the same way the frontend does. */
function normalizeSkillName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9+#]/g, '');
}

export interface AiSkillGap {
  name: string;
  current: number;
  target: number;
}

export interface AiCareerContext {
  /** The user's persona, e.g. "career_switcher". */
  careerState: string | null;
  careerGoal: string | null;
  /** The target role title as the user recorded it. */
  targetRoleTitle: string | null;
  /** The catalogue entry for the target role, when it is one we know. */
  targetRole: TargetRole | null;
  /** The catalogue slug of the target role. */
  targetRoleId: string | null;
  /** The catalogue slug of the target role's domain. */
  targetRoleDomain: string | null;
  /** The interface language the user has chosen. */
  language: 'en' | 'ar';
  /** How far the user's rated skills cover the target role's requirements. */
  skillGaps: AiSkillGap[];
  /** The user's own rated skills, including ones the role does not require. */
  currentSkills: AiCurrentSkill[];
  strengths: string[];
  education: string[];
  experience: string[];
  projects: string[];
  volunteering: string[];
  certifications: string[];
  roadmapSummary: string[];
  learningSummary: string[];
  applicationsCount: number;
  evidenceCount: number;
}

/** One of the user's own rated skills. */
export interface AiCurrentSkill {
  name: string;
  level: number;
}

/**
 * Loads the career context for the verified user id.
 *
 * Every read is scoped to `userId`, so one user can never see another's
 * context. A failure in one optional area degrades that area only — the rest
 * of the context still loads.
 */
export async function loadAiCareerContext(userId: string): Promise<AiCareerContext> {
  const [
    profile,
    skills,
    experiences,
    educations,
    projects,
    volunteering,
    certifications,
    applications,
    learningItems,
    roadmaps,
    preferences,
  ] = await Promise.all([
    getProfileDto(userId).catch(() => null),
    getUserSkills(userId).catch(() => []),
    listExperiences(userId).catch(() => []),
    listEducations(userId).catch(() => []),
    listProjects(userId).catch(() => []),
    listVolunteerExperiences(userId).catch(() => []),
    listCertifications(userId).catch(() => []),
    listJobApplications(userId).catch(() => []),
    listLearningItems(userId).catch(() => []),
    listRoadmaps(userId).catch(() => []),
    getPreferences(userId).catch(() => null),
  ]);

  const targetRoleTitle = profile?.targetRole ?? null;
  const targetRole = resolveRole(targetRoleTitle) ?? null;

  // The user's own skill levels, keyed by normalised name.
  const userLevels = new Map<string, { name: string; level: number }>();
  for (const row of skills) {
    const name = row.skill?.name ?? '';
    if (!name) continue;
    const level = row.proficiency ?? 1;
    const key = normalizeSkillName(name);
    const existing = userLevels.get(key);
    if (!existing || level > existing.level) userLevels.set(key, { name, level });
  }

  // Gaps are computed against the target role's requirements, so the model is
  // told the real distance to the role rather than a client-supplied guess.
  const skillGaps: AiSkillGap[] = [];
  const strengths: string[] = [];
  for (const required of targetRole?.requiredSkills ?? []) {
    const key = normalizeSkillName(required.name);
    const match = userLevels.get(key);
    const current = match?.level ?? 1;
    if (current >= required.minLevel) {
      strengths.push(required.name);
    } else {
      skillGaps.push({ name: required.name, current, target: required.minLevel });
    }
  }
  skillGaps.sort((a, b) => b.target - b.current - (a.target - a.current));

  const education = educations
    .map((entry) => {
      const parts = [entry.degree, entry.field, entry.institution].filter(Boolean);
      return parts.length ? parts.join(' — ') : entry.institution;
    })
    .filter(Boolean)
    .slice(0, 6);

  const experience = experiences
    .map((entry) => {
      const title = entry.role ?? '';
      const company = entry.company ? ` at ${entry.company}` : '';
      const dates = formatDateRange(entry.startDate, entry.endDate, entry.isCurrent);
      return `${title}${company}${dates ? ` (${dates})` : ''}`.trim();
    })
    .filter(Boolean)
    .slice(0, 8);

  const projectTitles = projects
    .map((entry) => {
      const goal = entry.goal ? ` — ${entry.goal}` : '';
      return `${entry.title}${goal}`;
    })
    .filter(Boolean)
    .slice(0, 8);

  // Volunteer stints are real, recorded work. The model was previously never
  // told about them, so it could not reference them when helping the user
  // with their CV or their applications.
  const volunteeringSummary = volunteering
    .map((entry) => {
      const dates = formatDateRange(entry.startDate, entry.endDate, entry.isCurrent);
      const role = entry.role ? ` (${entry.role})` : '';
      const detail = entry.description ? `: ${entry.description}` : '';
      return `${entry.organization}${role}${dates ? ` ${dates}` : ''}${detail}`;
    })
    .filter(Boolean)
    .slice(0, 6);

  const certificationNames = certifications
    .map((entry) => (entry.issuer ? `${entry.name} (${entry.issuer})` : entry.name))
    .filter(Boolean)
    .slice(0, 8);

  // The roadmap is summarised, not dumped: the model needs to know which
  // phases exist and what is still open, not every task id.
  const roadmapSummary: string[] = [];
  for (const roadmap of roadmaps ?? []) {
    for (const phase of roadmap.phases ?? []) {
      const open = (phase.milestones ?? []).flatMap((milestone) => milestone.tasks ?? []).filter(
        (task) => task.status !== 'completed' && task.status !== 'skipped',
      );
      const done = (phase.milestones ?? []).flatMap((milestone) => milestone.tasks ?? []).filter(
        (task) => task.status === 'completed',
      ).length;
      roadmapSummary.push(`${phase.title}: ${done} done, ${open.length} open`);
      if (open.length) {
        roadmapSummary.push(`  Next up: ${open.slice(0, 3).map((task) => task.title).join('; ')}`);
      }
    }
  }

  // The course TITLE is what the model needs, not the course id. An id like
  // "coursera-ml-specialization" tells the model nothing it can use.
  const courseTitles = new Map<string, string>();
  if (learningItems.some((item) => item.status !== 'dismissed')) {
    const courses = await listCourses().catch(() => []);
    for (const course of courses) courseTitles.set(course.id, course.title);
  }

  const learningSummary = (learningItems ?? [])
    .filter((item) => item.status !== 'dismissed')
    .map((item) => {
      const title = courseTitles.get(item.courseId) ?? item.courseId;
      const progress = item.progressPercent ? ` ${item.progressPercent}%` : '';
      return `${item.status}: ${title}${progress}`;
    })
    .slice(0, 8);

  // The user's own rated skills, including the ones the target role does not
  // require. Previously only role-required skills were sent, so a skill the
  // user had that the role did not ask for was invisible to the model.
  const currentSkills: AiCurrentSkill[] = Array.from(userLevels.values())
    .map((entry) => ({ name: entry.name, level: entry.level }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, 20);

  const language: 'en' | 'ar' = preferences?.language === 'ar' ? 'ar' : 'en';

  return {
    careerState: profile?.userType ?? null,
    careerGoal: profile?.careerGoal ?? null,
    targetRoleTitle,
    targetRole,
    targetRoleId: targetRole?.id ?? profile?.targetRoleId ?? null,
    targetRoleDomain: targetRole?.domainId ?? profile?.targetRoleDomain ?? null,
    language,
    skillGaps: skillGaps.slice(0, 8),
    currentSkills,
    strengths: strengths.slice(0, 8),
    education,
    experience,
    projects: projectTitles,
    volunteering: volunteeringSummary,
    certifications: certificationNames,
    roadmapSummary: roadmapSummary.slice(0, 14),
    learningSummary,
    applicationsCount: (applications ?? []).length,
    evidenceCount: 0,
  };
}

/** Formats a start/end date pair for display in the AI context. */
function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean
): string {
  const start = startDate ? formatMonthYear(startDate) : null;
  const end = isCurrent ? 'Present' : endDate ? formatMonthYear(endDate) : null;
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (end) return `Until ${end}`;
  return '';
}

/** Formats an ISO date as "Mon YYYY". */
function formatMonthYear(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Human-readable labels for the career-goal vocabulary. */
const CAREER_GOAL_LABELS: Record<string, string> = {
  get_first_job: 'land a first job',
  get_internship: 'secure an internship',
  switch_career: 'switch careers',
  get_promoted: 'get promoted',
  become_specialist: 'become a recognised specialist',
  become_manager: 'move into management',
  build_portfolio: 'build a portfolio',
  freelance: 'work as a freelancer or independent',
  explore_careers: 'explore career options',
  custom: 'pursue a custom goal',
};

/**
 * Renders the context as the system instruction block for the model.
 *
 * Only facts that are actually present are included, so the model is never
 * told about a section the user has not filled in.
 */
export function buildAiContextBlock(context: AiCareerContext): string {
  const lines: string[] = [];
  const role = context.targetRole;

  lines.push('Here is the user\'s CURRENT career state, read from their CareerPilot account:');
  lines.push(`- Persona: ${context.careerState ?? 'not set'}`);
  if (context.careerGoal) {
    const label = CAREER_GOAL_LABELS[context.careerGoal] ?? context.careerGoal;
    lines.push(`- Goal: ${label}`);
  }
  if (context.targetRoleTitle) {
    lines.push(`- Target role: ${context.targetRoleTitle}`);
  }
  if (context.targetRoleId) {
    lines.push(`- Target role id: ${context.targetRoleId}`);
  }
  if (role) {
    lines.push(`- Target role domain: ${role.category}`);
    if (context.targetRoleDomain) {
      lines.push(`- Target role domain id: ${context.targetRoleDomain}`);
    }
    lines.push(`- Target role level: ${role.level}`);
    lines.push(`- What the role actually requires: ${role.requiredSkills.map((s) => `${s.name} (level ${s.minLevel}/5)`).join('; ')}`);
    if (role.responsibilities.length) {
      lines.push(`- Core responsibilities of the role: ${role.responsibilities.slice(0, 5).join('; ')}`);
    }
  }
  // The target role is an EXPLICIT user selection, so the model is told to
  // treat it as authoritative. It may still point out that another path might
  // suit the user better, but only as a suggestion the user can act on — it
  // must never present the target role as changed.
  if (context.targetRoleTitle) {
    lines.push(
      '- The target role above was explicitly chosen by the user. Treat it as authoritative: plan, recommend and advise for THAT role.',
      '- If another career path would suit the user better, offer it only as an alternative to consider. Never state or imply that their target role has changed.',
    );
  }
  if (context.skillGaps.length) {
    lines.push(
      `- Skill gaps (current -> target): ${context.skillGaps.map((g) => `${g.name} (${g.current}->${g.target})`).join('; ')}`,
    );
  }
  if (context.currentSkills.length) {
    lines.push(
      `- Skills the user has rated, in full: ${context.currentSkills.map((s) => `${s.name} (${s.level}/5)`).join('; ')}`,
    );
  }
  if (context.strengths.length) {
    lines.push(`- Strengths already met: ${context.strengths.join('; ')}`);
  }
  if (context.experience.length) {
    lines.push(`- Work experience: ${context.experience.join('; ')}`);
  }
  if (context.education.length) {
    lines.push(`- Education: ${context.education.join('; ')}`);
  }
  if (context.projects.length) {
    lines.push(`- Projects: ${context.projects.join('; ')}`);
  }
  if (context.volunteering.length) {
    lines.push(`- Volunteer experience: ${context.volunteering.join('; ')}`);
  }
  if (context.certifications.length) {
    lines.push(`- Certifications: ${context.certifications.join('; ')}`);
  }
  if (context.roadmapSummary.length) {
    lines.push(`- Current roadmap:\n${context.roadmapSummary.map((entry) => `  ${entry}`).join('\n')}`);
  }
  if (context.learningSummary.length) {
    lines.push(`- Learning in progress: ${context.learningSummary.join('; ')}`);
  }
  lines.push(`- Job applications tracked: ${context.applicationsCount}`);

  // The user's interface language. Without this the model answers an Arabic
  // interface in English whenever the question is typed in English.
  lines.push(
    context.language === 'ar'
      ? '- The user is using the Arabic interface. Reply in Arabic (Modern Standard Arabic).'
      : '- The user is using the English interface. Reply in English.',
  );

  // The single most important rule for every prompt built on this block.
  lines.push(
    '- Use ONLY the facts above. Never invent a company, job title, date, metric, skill, certificate, project or course that is not listed here.',
    '- If you do not have the information to answer accurately, say what is missing instead of guessing.',
  );

  return lines.join('\n');
}
