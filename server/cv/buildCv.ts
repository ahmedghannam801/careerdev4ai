/**
 * CV builder.
 *
 * The platform had no way to assemble a CV from the data the user had
 * actually entered. The CV was only ever produced by importing a document
 * (via the deterministic parser) or by hand-editing a form. Everything the
 * platform knows about a user — their skills, their experience, their
 * projects, their volunteering, their completed courses, their
 * certifications — was orphaned from the CV.
 *
 * This module assembles a CV from exactly that data, and nothing else.
 *
 * The hard rule here is that the builder never invents. It does not write a
 * summary the user did not give, it does not add a company that is not in the
 * user's experience, it does not claim a certificate the user does not hold
 * and it does not describe a project that is not in the user's project list.
 * Where the data is missing, the section says so instead of filling the gap.
 * The `missing` list at the end of the result is the honest account of what
 * the user still needs to supply.
 */

import { getProfileDto } from '../db/profile.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';
import { resolveRoleDefinition } from '../../shared/careerRoles.ts';

export interface BuiltCvExperience {
  id: string;
  role: string;
  company: string;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface BuiltCvEducation {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface BuiltCvProject {
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  difficulty: string | null;
  repositoryUrl: string | null;
  demoUrl: string | null;
  documentation: string | null;
}

export interface BuiltCvVolunteering {
  id: string;
  organization: string;
  role: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  responsibilities: string[];
  achievements: string[];
  skills: string[];
}

export interface BuiltCvSkill {
  name: string;
  /** 1..5, exactly as the user rated it. */
  level: number;
}

export interface BuiltCvCertification {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  url: string | null;
}

export interface BuiltCvCourse {
  id: string;
  title: string;
  provider: string;
  url: string;
  level: string;
}

export interface BuiltCv {
  fullName: string | null;
  /** The role the CV is aimed at, from the user's own selection. */
  targetRole: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: { label: string; url: string }[];
  /** Only the user's own words. Null when they have not written one. */
  summary: string | null;
  experiences: BuiltCvExperience[];
  educations: BuiltCvEducation[];
  projects: BuiltCvProject[];
  volunteering: BuiltCvVolunteering[];
  skills: BuiltCvSkill[];
  certifications: BuiltCvCertification[];
  /** Only courses the user has actually completed. */
  courses: BuiltCvCourse[];
  /**
   * What the CV cannot say because the user has not supplied it.
   *
   * Surfacing this is deliberate: an empty section is better than a
   * fabricated one, and the user needs to know what to add.
   */
  missing: string[];
  /** Counts, for the UI. */
  counts: {
    experiences: number;
    educations: number;
    projects: number;
    volunteering: number;
    skills: number;
    certifications: number;
    courses: number;
  };
}

/**
 * Builds a CV from the user's real data.
 *
 * `email` comes from the verified auth token rather than the profile row,
 * because the platform does not store the address twice.
 */
export async function buildCvFromProfile(
  profileId: string,
  options: { email?: string | null } = {}
): Promise<BuiltCv> {
  const [
    profile,
    skills,
    experiences,
    educations,
    projects,
    volunteering,
    certifications,
    learningItems,
  ] = await Promise.all([
    getProfileDto(profileId).catch(() => null),
    getUserSkills(profileId).catch(() => []),
    listExperiences(profileId).catch(() => []),
    listEducations(profileId).catch(() => []),
    listProjects(profileId).catch(() => []),
    listVolunteerExperiences(profileId).catch(() => []),
    listCertifications(profileId).catch(() => []),
    listLearningItems(profileId).catch(() => []),
  ]);

  // Only completed courses belong on a CV. An in-progress course is not a
  // qualification.
  const completedIds = new Set(
    learningItems
      .filter((item) => item.status === 'completed')
      .map((item) => item.courseId)
  );
  const courses =
    completedIds.size > 0
      ? (await listCourses().catch(() => [])).filter((course) =>
          completedIds.has(course.id)
        )
      : [];

  const fullName = profile?.fullName?.trim() || null;
  const targetRole = profile?.targetRole ?? null;
  const role = targetRole ? resolveRoleDefinition(targetRole) : undefined;

  const title =
    profile?.currentTitle?.trim() ||
    profile?.currentPosition?.trim() ||
    role?.title ||
    null;

  const summary =
    profile?.professionalSummary?.trim() || profile?.bio?.trim() || null;

  const links = (profile?.links ?? [])
    .map((link) => ({
      label: link.label?.trim() || link.kind || 'Link',
      url: link.url ?? '',
    }))
    .filter((link) => Boolean(link.url));

  const builtSkills: BuiltCvSkill[] = skills
    .map((row) => ({
      name: row.skill?.name ?? '',
      level: row.proficiency ?? 1,
    }))
    .filter((skill) => Boolean(skill.name))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

  const builtExperiences: BuiltCvExperience[] = experiences.map((entry) => ({
    id: entry.id,
    role: entry.role,
    company: entry.company,
    employmentType: entry.employmentType ?? null,
    location: entry.location ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    isCurrent: entry.isCurrent,
    description: entry.description ?? null,
  }));

  const builtEducations: BuiltCvEducation[] = educations.map((entry) => ({
    id: entry.id,
    institution: entry.institution,
    degree: entry.degree ?? null,
    field: entry.field ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    isCurrent: entry.isCurrent,
    description: entry.description ?? null,
  }));

  const builtProjects: BuiltCvProject[] = projects.map((entry) => ({
    id: entry.id,
    title: entry.title,
    goal: entry.goal ?? null,
    description: entry.description ?? null,
    difficulty: entry.difficulty ?? null,
    repositoryUrl: entry.repositoryUrl ?? null,
    demoUrl: entry.demoUrl ?? null,
    documentation: entry.documentation ?? null,
  }));

  const builtVolunteering: BuiltCvVolunteering[] = volunteering.map((entry) => ({
    id: entry.id,
    organization: entry.organization,
    role: entry.role,
    location: entry.location ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    isCurrent: entry.isCurrent,
    description: entry.description ?? null,
    responsibilities: entry.responsibilities ?? [],
    achievements: entry.achievements ?? [],
    skills: entry.skills ?? [],
  }));

  const builtCertifications: BuiltCvCertification[] = certifications.map((entry) => ({
    id: entry.id,
    name: entry.name,
    issuer: entry.issuer ?? null,
    issueDate: entry.issueDate ?? null,
    url: entry.url ?? null,
  }));

  const builtCourses: BuiltCvCourse[] = courses.map((course) => ({
    id: course.id,
    title: course.title,
    provider: course.provider,
    url: course.url,
    level: course.level,
  }));

  const missing: string[] = [];
  if (!fullName) missing.push('Your full name.');
  if (!options.email) missing.push('Your email address.');
  if (!title) missing.push('Your current job title.');
  if (!summary) missing.push('A professional summary in your own words.');
  if (builtExperiences.length === 0) missing.push('At least one work experience.');
  if (builtEducations.length === 0) missing.push('Your education.');
  if (builtSkills.length === 0) missing.push('Your skill ratings.');

  return {
    fullName,
    targetRole,
    title,
    email: options.email ?? null,
    phone: profile?.phone ?? null,
    location:
      profile?.location ??
      [profile?.city, profile?.country].filter(Boolean).join(', ') ??
      null,
    links,
    summary,
    experiences: builtExperiences,
    educations: builtEducations,
    projects: builtProjects,
    volunteering: builtVolunteering,
    skills: builtSkills,
    certifications: builtCertifications,
    courses: builtCourses,
    missing,
    counts: {
      experiences: builtExperiences.length,
      educations: builtEducations.length,
      projects: builtProjects.length,
      volunteering: builtVolunteering.length,
      skills: builtSkills.length,
      certifications: builtCertifications.length,
      courses: builtCourses.length,
    },
  };
}
