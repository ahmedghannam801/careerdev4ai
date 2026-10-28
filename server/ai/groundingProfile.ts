/**
 * Builds the grounding profile for a user from the database.
 *
 * The grounding rules in `server/ai/grounding.ts` need to know what the user
 * actually has. This module assembles that record from the same tables the
 * rest of the API reads, so the check compares a model's output against the
 * user's own data rather than against whatever the browser sent.
 */

import { getProfileDto } from '../db/profile.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { buildGroundingProfile, type GroundingProfile } from './grounding.ts';

/**
 * Assembles the record of what the user really has.
 *
 * Every source is optional: a user with no experience still gets a profile,
 * it simply contains less. A missing section must never make the grounding
 * check permissive, so the free-text sources are collected rather than
 * skipped.
 */
export async function buildGroundingProfileForUser(
  userId: string
): Promise<GroundingProfile> {
  const [profile, skills, experiences, educations, projects, volunteering, certifications] =
    await Promise.all([
      getProfileDto(userId).catch(() => null),
      getUserSkills(userId).catch(() => []),
      listExperiences(userId).catch(() => []),
      listEducations(userId).catch(() => []),
      listProjects(userId).catch(() => []),
      listVolunteerExperiences(userId).catch(() => []),
      listCertifications(userId).catch(() => []),
    ]);

  const organisations: string[] = [];
  const roles: string[] = [];
  const freeText: string[] = [];

  for (const entry of experiences) {
    if (entry.company) organisations.push(entry.company);
    if (entry.role) roles.push(entry.role);
    if (entry.description) freeText.push(entry.description);
  }

  for (const entry of educations) {
    if (entry.institution) organisations.push(entry.institution);
    if (entry.degree) roles.push(entry.degree);
    if (entry.description) freeText.push(entry.description);
  }

  for (const entry of volunteering) {
    if (entry.organization) organisations.push(entry.organization);
    if (entry.role) roles.push(entry.role);
    if (entry.description) freeText.push(entry.description);
    freeText.push(...(entry.responsibilities ?? []));
    freeText.push(...(entry.achievements ?? []));
  }

  for (const entry of projects) {
    if (entry.title) freeText.push(entry.title);
    if (entry.goal) freeText.push(entry.goal);
    if (entry.description) freeText.push(entry.description);
  }

  if (profile?.professionalSummary) freeText.push(profile.professionalSummary);
  if (profile?.bio) freeText.push(profile.bio);

  return buildGroundingProfile({
    organisations,
    roles,
    skills: skills.map((row) => row.skill?.name ?? '').filter(Boolean),
    certifications: certifications.map((entry) => entry.name).filter(Boolean),
    projects: projects.map((entry) => entry.title).filter(Boolean),
    freeText,
  });
}
