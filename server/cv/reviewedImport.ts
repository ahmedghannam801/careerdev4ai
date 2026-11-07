/**
 * Applying a reviewed CV.
 *
 * The import used to be a set of writes made by the browser, one request per
 * section, with the section list decided in the client. That has two
 * problems this module exists to fix.
 *
 * The first is atomicity of meaning: a failure half way through left the
 * candidate with some of their CV imported and some not, and the report
 * said "imported". Here every section writes independently and every section
 * reports what it did, so a partial import is reported as a partial import.
 *
 * The second is idempotency. Writing the same reviewed CV twice must not
 * create two copies of everything. It does not, and it does not because of a
 * stored request id: every record is matched on its natural key — a role on
 * its role and its company, a degree on its institution and its degree — and
 * a record that is already there is counted as skipped, never written
 * again. The same request sent twice therefore writes once, which is what
 * makes a double click, a retry after a dropped connection and a refresh on
 * the confirmation screen all safe.
 *
 * Nothing here overwrites what the candidate already has. The header is
 * filled in only where it is empty, and every other section adds records
 * rather than replacing them.
 */

import type { CVProfile } from '../../src/types/career.ts';
import type {
  CvReviewedImportResult,
  CvReviewedSectionResult,
} from '../../shared/cvExtraction.ts';
import { planPersonalImport } from '../../shared/cvImport.ts';
import { updateProfileDto, getProfileDto } from '../db/profile.ts';
import { listExperiences, createExperience } from '../db/experiences.ts';
import { listEducations, createEducation } from '../db/educations.ts';
import { listProjects, createProject } from '../db/projects.ts';
import {
  listCertifications,
  createCertification,
  listLanguages,
  createLanguage,
  type LanguageProficiency,
} from '../db/profileExtensions.ts';
import {
  listVolunteerExperiences,
  createVolunteerExperience,
} from '../db/volunteer.ts';
import { getUserSkills, setUserSkillLevel, resolveSkillId } from '../db/userSkills.ts';

/** The key a record is matched on. */
function key(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('|');
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A section that is not selected writes nothing at all. */
function isSelected(selected: Record<string, boolean> | undefined, key: string): boolean {
  if (!selected) return true;
  return selected[key] !== false;
}

function emptySection(section: string): CvReviewedSectionResult {
  return { section, imported: 0, skipped: 0, failed: 0, errors: [] };
}

/* -------------------------------------------------------------------------- */
/* The sections                                                                */
/* -------------------------------------------------------------------------- */

async function importPersonal(
  userId: string,
  cv: CVProfile,
  existing: { fullName?: string | null; phone?: string | null; location?: string | null; currentTitle?: string | null; headline?: string | null; professionalSummary?: string | null }
): Promise<CvReviewedSectionResult> {
  const result = emptySection('personal');
  const plan = planPersonalImport(
    {
      name: existing.fullName,
      phone: existing.phone,
      location: existing.location,
      currentTitle: existing.currentTitle,
      headline: existing.headline,
      professionalSummary: existing.professionalSummary,
    },
    {
      fullName: cv.fullName,
      phone: cv.phone,
      location: cv.location,
      title: cv.title,
      summary: cv.summary,
    }
  );

  if (plan.imported === 0) {
    result.skipped = plan.skipped;
    return result;
  }

  await updateProfileDto(userId, {
    fullName: plan.updates.name,
    phone: plan.updates.phone,
    location: plan.updates.location,
    currentTitle: plan.updates.currentTitle,
    headline: plan.updates.headline,
    professionalSummary: plan.updates.professionalSummary,
  });

  result.imported = plan.imported;
  result.skipped = plan.skipped;
  return result;
}

async function importExperience(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('experience');
  const existing = await listExperiences(userId);
  const seen = new Set(existing.map((entry) => key(entry.role, entry.company)));

  for (const entry of cv.experiences ?? []) {
    if (!hasText(entry.role) && !hasText(entry.company)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.role, entry.company);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createExperience(userId, {
        role: entry.role,
        company: entry.company,
        location: entry.location || undefined,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.isCurrent,
        achievements: entry.bullets,
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.role || entry.company || 'An entry'}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

async function importEducation(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('education');
  const existing = await listEducations(userId);
  const seen = new Set(existing.map((entry) => key(entry.institution, entry.degree)));

  for (const entry of cv.education ?? []) {
    if (!hasText(entry.institution) && !hasText(entry.degree)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.institution, entry.degree);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createEducation(userId, {
        institution: entry.institution,
        degree: entry.degree || undefined,
        field: entry.field || undefined,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.current,
        description: entry.description,
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.institution || entry.degree || 'An entry'}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

async function importProjects(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('projects');
  const existing = await listProjects(userId);
  const seen = new Set(existing.map((entry) => key(entry.title)));

  for (const entry of cv.projects ?? []) {
    if (!hasText(entry.title)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.title);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createProject(userId, {
        title: entry.title,
        description: entry.description,
        repositoryUrl: entry.link,
        skills: entry.technologies,
        responsibilities: entry.bullets,
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.title}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

async function importCertifications(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('certifications');
  const existing = await listCertifications(userId);
  const seen = new Set(existing.map((entry) => key(entry.name)));

  for (const entry of cv.certificationDetails ?? []) {
    if (!hasText(entry.name)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.name);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createCertification(userId, {
        name: entry.name,
        issuer: entry.issuer || undefined,
        issueDate: entry.issueDate || undefined,
        expiryDate: entry.expiryDate,
        description: entry.description,
        credentialId: entry.credentialId,
        skillNames: entry.skills,
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.name}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

/**
 * Maps a level the CV stated onto the platform's vocabulary.
 *
 * The platform stores a language level as one of five words, and a CV says
 * it in whatever scale the writer used — a CEFR grade, an adjective, a
 * phrase. The mapping below covers the words and the grades that have an
 * unambiguous reading. A level that does not map is not guessed at: the
 * language is written without a level, and the CV keeps the candidate's own
 * wording on the document.
 */
function toLanguageProficiency(level: string | undefined): LanguageProficiency | undefined {
  if (!level) return undefined;
  const value = level.trim().toLowerCase();
  if (!value) return undefined;

  if (/^(native|mother tongue|lughat al-ummi|lugha al-ummi)/.test(value)) return 'Native';
  if (/\b(c1|c2)\b/.test(value) || /(fluent|advanced|excellent|master)/.test(value)) {
    return 'Fluent';
  }
  if (/\bb2\b/.test(value) || /(professional|business|upper intermediate)/.test(value)) {
    return 'Professional';
  }
  if (/\bb1\b/.test(value) || /(conversational|intermediate|medium|good)/.test(value)) {
    return 'Conversational';
  }
  if (/\b(a1|a2)\b/.test(value) || /(basic|elementary|beginner|limited)/.test(value)) {
    return 'Basic';
  }
  return undefined;
}

async function importLanguages(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('languages');
  const existing = await listLanguages(userId);
  const seen = new Set(existing.map((entry) => key(entry.name)));

  for (const entry of cv.languages ?? []) {
    if (!hasText(entry.name)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.name);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createLanguage(userId, {
        name: entry.name,
        proficiency: toLanguageProficiency(entry.level),
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.name}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

async function importVolunteering(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('volunteering');
  const existing = await listVolunteerExperiences(userId);
  const seen = new Set(existing.map((entry) => key(entry.organization, entry.role)));

  for (const entry of cv.volunteering ?? []) {
    if (!hasText(entry.organization) && !hasText(entry.role)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(entry.organization, entry.role);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      await createVolunteerExperience(userId, {
        organization: entry.organization,
        role: entry.role,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.isCurrent,
        description: entry.description,
        achievements: entry.bullets,
      });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${entry.role || entry.organization}: ${(error as Error).message ?? 'could not be saved'}`
      );
    }
  }
  return result;
}

async function importSkills(
  userId: string,
  cv: CVProfile
): Promise<CvReviewedSectionResult> {
  const result = emptySection('skills');
  const existing = await getUserSkills(userId);
  const seen = new Set(existing.map((entry) => key(entry.skill?.name)));

  for (const name of cv.skillsList ?? []) {
    if (!hasText(name)) {
      result.skipped += 1;
      continue;
    }
    const entryKey = key(name);
    if (seen.has(entryKey)) {
      result.skipped += 1;
      continue;
    }
    try {
      const skillId = await resolveSkillId(name);
      if (!skillId) {
        result.failed += 1;
        result.errors.push(`${name}: the skill could not be matched to the catalogue.`);
        continue;
      }
      // A skill the candidate has never rated starts at the middle of the
      // scale. A rating is a claim about the candidate, and an extracted CV
      // does not make one.
      await setUserSkillLevel(userId, skillId, { proficiency: 3 });
      seen.add(entryKey);
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${name}: ${(error as Error).message ?? 'could not be saved'}`);
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* The import                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Writes the reviewed document into the candidate's records.
 *
 * The sections the candidate did not accept are not written at all, so
 * rejecting a section in the review screen really does keep it out of the
 * CV.
 */
export async function applyReviewedImport(
  userId: string,
  cv: CVProfile,
  selected?: Record<string, boolean>
): Promise<CvReviewedImportResult> {
  const sections: CvReviewedSectionResult[] = [];
  const errors: string[] = [];

  const run = async (
    name: string,
    task: () => Promise<CvReviewedSectionResult>
  ): Promise<void> => {
    if (!isSelected(selected, name)) {
      // A section the candidate turned off is neither written nor counted.
      sections.push({ ...emptySection(name), skipped: 0 });
      return;
    }
    try {
      sections.push(await task());
    } catch (error) {
      const message = (error as Error).message ?? 'could not be saved';
      errors.push(`${name}: ${message}`);
      sections.push({
        ...emptySection(name),
        failed: 1,
        errors: [message],
      });
    }
  };

  await run('personal', async () => {
    const profile = await getProfileDto(userId).catch(() => null);
    return importPersonal(
      userId,
      cv,
      {
        fullName: profile?.fullName,
        phone: profile?.phone,
        location: profile?.location,
        currentTitle: profile?.currentTitle,
        headline: profile?.headline,
        professionalSummary: profile?.professionalSummary,
      }
    );
  });
  await run('experience', () => importExperience(userId, cv));
  await run('education', () => importEducation(userId, cv));
  await run('projects', () => importProjects(userId, cv));
  await run('certifications', () => importCertifications(userId, cv));
  await run('languages', () => importLanguages(userId, cv));
  await run('volunteering', () => importVolunteering(userId, cv));
  await run('skills', () => importSkills(userId, cv));

  const imported = sections.reduce((total, section) => total + section.imported, 0);
  const skipped = sections.reduce((total, section) => total + section.skipped, 0);
  const failed = sections.reduce((total, section) => total + section.failed, 0);

  return {
    success: failed === 0,
    imported,
    skipped,
    failed,
    sections,
    errors,
    // Nothing was written, so the import had already been applied. This is
    // what a repeated request looks like from the outside.
    alreadyApplied: imported === 0 && failed === 0,
  };
}
