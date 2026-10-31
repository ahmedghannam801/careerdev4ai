/**
 * The CV document, projected from the platform's records.
 *
 * The studio used to keep a second copy of everything: a `CVProfile` that the
 * editor wrote to and that had to be filled in by hand from the profile. Two
 * copies of the same employment history drift apart, and the CV was usually
 * the one that was stale.
 *
 * There is one copy now. The records the platform stores are the truth, and
 * the document is a projection of them:
 *
 * ```text
 *   profile, experiences, education, projects, volunteering,
 *   certifications, completed courses, owned skills, links
 *                              |
 *                              v
 *                    mergeCanonicalCvDocument
 *                              |
 *                              v
 *                    the document the editor works with
 * ```
 *
 * The merge is deliberately asymmetric:
 *
 *   - A FACT comes from the records. The company a candidate worked for, the
 *     dates they were there, the certificate they hold — these are never
 *     read from the document, so a change in the profile reaches the CV
 *     without anyone doing anything.
 *   - A WORDING comes from the document. The summary a candidate wrote, the
 *     bullets they wrote, the skills they took off this particular CV — these
 *     are theirs, and the records are not allowed to overwrite them.
 *
 * Nothing is invented either way. A field the records do not have stays
 * empty, and a field the candidate has not written stays as the records
 * describe it.
 */

import type { CVLink, CVProfile } from '../src/types/career.ts';
import {
  cvLinkLabel,
  descriptionToBullets,
  formatCvPeriod,
  type CvSourceData,
} from './cvDocument.ts';
/**
 * Whether an id belongs to a record the platform stores.
 *
 * The stored records have UUIDs. A document that came from an imported CV has
 * short local ids ("exp-1"), which are content the platform has not been
 * told about yet. The difference is what lets a deleted record disappear from
 * the CV while an imported one survives until it is imported.
 */
export function isCanonicalRecordId(id: string | null | undefined): boolean {
  return Boolean(
    id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/** The parts of a record that identify it to a reader of a CV. */
function experienceKey(role: string, company: string): string {
  return `${role.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

function educationKey(institution: string, degree: string): string {
  return `${institution.trim().toLowerCase()}|${degree.trim().toLowerCase()}`;
}

function projectKey(title: string): string {
  return title.trim().toLowerCase();
}

function volunteeringKey(organization: string, role: string): string {
  return `${organization.trim().toLowerCase()}|${role.trim().toLowerCase()}`;
}

function courseKey(title: string, provider: string): string {
  return `${title.trim().toLowerCase()}|${provider.trim().toLowerCase()}`;
}

function certificationKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Finds the document entry that belongs to a record.
 *
 * The id is tried first. When it does not match — which is what happens
 * right after an imported CV is written into the profile, because the
 * imported entries carry the parser's ids and the records carry the
 * database's — the entry is found by what it says instead: the same role at
 * the same company is the same job.
 */
function findPrevious<T>(
  source: { id: string },
  previous: T[],
  keyOf: (entry: T) => string,
  key: string
): T | undefined {
  const byId = previous.find((entry) => (entry as { id?: string }).id === source.id);
  if (byId) return byId;
  return previous.find((entry) => keyOf(entry) === key);
}

/**
 * Projects the records onto the document.
 *
 * The document is read for the candidate's own wording and written for
 * everything else, so calling this again after a change to the records
 * brings the document back in line without losing a word the candidate wrote.
 */
export function mergeCanonicalCvDocument(
  source: CvSourceData,
  document: CVProfile | null | undefined
): CVProfile {
  const profile = source.profile ?? {};
  const previous = document ?? ({} as CVProfile);

  const previousExperiences = previous.experiences ?? [];
  const previousEducation = previous.education ?? [];
  const previousProjects = previous.projects ?? [];
  const previousVolunteering = previous.volunteering ?? [];
  const previousCourses = previous.courses ?? [];
  const previousCertifications = previous.certificationDetails ?? [];
  const previousLinks = previous.links ?? [];

  /* -- the header -------------------------------------------------------- */
  // A fact the records know wins. What they do not know is left as the
  // document has it, so a candidate who typed something before the profile
  // caught up does not lose it.
  const fullName = profile.fullName?.trim() || previous.fullName?.trim() || '';
  const email = profile.email?.trim() || previous.email?.trim() || '';
  const phone = profile.phone?.trim() || previous.phone?.trim() || '';
  const location = profile.location?.trim() || previous.location?.trim() || '';
  const title = profile.title?.trim() || previous.title?.trim() || '';
  // The summary is the candidate's wording for this CV, so the document wins.
  const summary = previous.summary?.trim() || profile.summary?.trim() || '';

  /* -- experience -------------------------------------------------------- */
  const consumedExperiences = new Set<string>();
  const experiences: CVProfile['experiences'] = (source.experiences ?? []).map((entry) => {
    const previousEntry = findPrevious(
      entry,
      previousExperiences,
      (candidate) => experienceKey(candidate.role, candidate.company),
      experienceKey(entry.role, entry.company)
    );
    if (previousEntry) consumedExperiences.add(previousEntry.id);
    return {
      id: entry.id,
      company: entry.company,
      role: entry.role,
      period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
      location: entry.location ?? '',
      bullets:
        previousEntry?.bullets?.length
          ? previousEntry.bullets
          : entry.bullets?.length
            ? entry.bullets
            : descriptionToBullets(entry.description),
      startDate: entry.startDate ?? undefined,
      endDate: entry.endDate ?? undefined,
      isCurrent: entry.isCurrent,
    };
  });
  // An entry the records no longer have was deleted — unless it never was a
  // record, in which case it is imported content waiting to be imported.
  for (const entry of previousExperiences) {
    if (consumedExperiences.has(entry.id)) continue;
    if (isCanonicalRecordId(entry.id)) continue;
    experiences.push(entry);
  }

  /* -- education --------------------------------------------------------- */
  const consumedEducation = new Set<string>();
  const education: CVProfile['education'] = (source.education ?? []).map((entry) => {
    const previousEntry = findPrevious(
      entry,
      previousEducation,
      (candidate) => educationKey(candidate.institution, candidate.degree),
      educationKey(entry.institution, entry.degree ?? '')
    );
    if (previousEntry) consumedEducation.add(previousEntry.id);
    return {
      id: entry.id,
      institution: entry.institution,
      degree: entry.degree ?? '',
      field: entry.field ?? '',
      period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
      startDate: entry.startDate ?? undefined,
      endDate: entry.endDate ?? undefined,
      current: entry.isCurrent,
      description: previousEntry?.description ?? entry.description ?? '',
    };
  });
  for (const entry of previousEducation) {
    if (consumedEducation.has(entry.id)) continue;
    if (isCanonicalRecordId(entry.id)) continue;
    education.push(entry);
  }

  /* -- projects ---------------------------------------------------------- */
  const consumedProjects = new Set<string>();
  const projects: CVProfile['projects'] = (source.projects ?? []).map((entry) => {
    const previousEntry = findPrevious(
      entry,
      previousProjects,
      (candidate) => projectKey(candidate.title),
      projectKey(entry.title)
    );
    if (previousEntry) consumedProjects.add(previousEntry.id);
    return {
      id: entry.id,
      title: entry.title,
      role: entry.role ?? '',
      link: entry.link ?? undefined,
      technologies: entry.technologies?.length ? entry.technologies : entry.skills ?? [],
      bullets:
        previousEntry?.bullets?.length
          ? previousEntry.bullets
          : entry.bullets?.length
            ? entry.bullets
            : descriptionToBullets(entry.description),
      description: previousEntry?.description ?? entry.description ?? '',
    };
  });
  for (const entry of previousProjects) {
    if (consumedProjects.has(entry.id)) continue;
    if (isCanonicalRecordId(entry.id)) continue;
    projects.push(entry);
  }

  /* -- volunteering ------------------------------------------------------ */
  const consumedVolunteering = new Set<string>();
  const volunteering: NonNullable<CVProfile['volunteering']> = (source.volunteering ?? []).map((entry) => {
    const previousEntry = findPrevious(
      entry,
      previousVolunteering,
      (candidate) => volunteeringKey(candidate.organization, candidate.role),
      volunteeringKey(entry.organization, entry.role)
    );
    if (previousEntry) consumedVolunteering.add(previousEntry.id);
    return {
      id: entry.id,
      organization: entry.organization,
      role: entry.role,
      period: formatCvPeriod(entry.startDate, entry.endDate, entry.isCurrent),
      location: entry.location ?? '',
      description: previousEntry?.description ?? entry.description ?? '',
      bullets:
        previousEntry?.bullets?.length
          ? previousEntry.bullets
          : entry.achievements?.length
            ? entry.achievements
            : entry.responsibilities?.length
              ? entry.responsibilities
              : descriptionToBullets(entry.description),
    };
  });
  for (const entry of previousVolunteering) {
    if (consumedVolunteering.has(entry.id)) continue;
    if (isCanonicalRecordId(entry.id)) continue;
    volunteering.push(entry);
  }

  /* -- courses ----------------------------------------------------------- */
  const consumedCourses = new Set<string>();
  const courses: NonNullable<CVProfile['courses']> = (source.courses ?? []).map((entry) => {
    const previousEntry = findPrevious(
      entry,
      previousCourses,
      (candidate) => courseKey(candidate.title, candidate.provider),
      courseKey(entry.title, entry.provider)
    );
    if (previousEntry) consumedCourses.add(previousEntry.id);
    return {
      id: entry.id,
      title: entry.title,
      provider: entry.provider,
      description: previousEntry?.description ?? entry.description ?? '',
    };
  });
  for (const entry of previousCourses) {
    if (consumedCourses.has(entry.id)) continue;
    if (isCanonicalRecordId(entry.id)) continue;
    courses.push(entry);
  }

  /* -- certifications ---------------------------------------------------- */
  // A certificate is matched by its record first and by what it is called
  // second, so an imported certificate that has been written into the profile
  // becomes one entry rather than two.
  const consumedCertificates = new Set<number>();
  const certificationDetails: NonNullable<CVProfile['certificationDetails']> = [];
  for (const entry of source.certifications ?? []) {
    const previousIndex = previousCertifications.findIndex(
      (candidate, index) =>
        !consumedCertificates.has(index) &&
        (candidate.id === entry.id ||
          certificationKey(candidate.name) === certificationKey(entry.name))
    );
    const previousEntry = previousIndex === -1 ? undefined : previousCertifications[previousIndex];
    if (previousEntry) consumedCertificates.add(previousIndex);
    certificationDetails.push({
      id: entry.id,
      name: entry.name,
      issuer: entry.issuer ?? '',
      issueDate: entry.issueDate ?? '',
      description: previousEntry?.description ?? entry.description ?? '',
    });
  }
  for (const [index, entry] of previousCertifications.entries()) {
    if (consumedCertificates.has(index)) continue;
    // A certificate whose record the profile no longer holds was deleted. A
    // certificate the profile never held is imported content, waiting to be
    // imported.
    if (isCanonicalRecordId(entry.id)) continue;
    certificationDetails.push({ ...entry });
  }
  const certifications = certificationDetails.map((entry) => entry.name);

  /* -- skills ------------------------------------------------------------ */
  // The skills on a CV are the skills the candidate owns. A target-role
  // requirement or a skill gap is never shown as if it were theirs.
  const ownedNames = (source.skills ?? []).map((skill) => skill.name);
  const hiddenSkills = new Set(previous.hiddenSkills ?? []);
  const documentSkillNames = previous.skillsList ?? [];
  const skillsList: string[] = [];
  for (const name of documentSkillNames) {
    if (hiddenSkills.has(name)) continue;
    if (skillsList.includes(name)) continue;
    skillsList.push(name);
  }
  for (const name of ownedNames) {
    if (skillsList.includes(name)) continue;
    if (hiddenSkills.has(name)) continue;
    skillsList.push(name);
  }

  /* -- links ------------------------------------------------------------- */
  // The order and the enabled flag belong to this CV; the URL and the label
  // belong to the profile.
  const sourceLinks = source.links ?? [];
  const sourceLinksById = new Map(sourceLinks.map((link) => [link.id, link]));
  const links: CVLink[] = [];
  for (const link of previousLinks) {
    const canonical = sourceLinksById.get(link.id);
    if (!canonical) continue;
    links.push({
      id: canonical.id,
      kind: canonical.kind,
      label: cvLinkLabel(canonical.kind, canonical.label),
      url: canonical.url,
      enabled: link.enabled,
    });
  }
  for (const link of sourceLinks) {
    if (links.some((entry) => entry.id === link.id)) continue;
    links.push({
      id: link.id,
      kind: link.kind,
      label: cvLinkLabel(link.kind, link.label),
      url: link.url,
      enabled: true,
    });
  }

  return {
    fullName,
    email,
    phone,
    location,
    title,
    summary,
    linkedin: previous.linkedin,
    github: previous.github,
    website: previous.website,
    experiences,
    education,
    projects,
    skillsList,
    certifications,
    certificationDetails,
    links,
    volunteering,
    courses,
    hiddenSkills: previous.hiddenSkills,
  };
}
