/**
 * Turning the parsed document into the document the studio edits.
 *
 * The parser produces its own shape, because it is reading a file and not
 * editing one: every value it finds is a string, and a value it did not
 * find is an empty string rather than a missing key. The studio works on the
 * document shape, where an absent value is absent.
 *
 * The conversion between them lives here so that the two paths that produce
 * a document — the upload route and the extraction review — cannot disagree
 * about what a document is.
 */

import type {
  CVProfile,
  CVInternship,
  CVLanguage,
  CVAward,
  CVPublication,
  CVResearch,
  CVLeadership,
  CVCourse,
  CVVolunteering,
} from '../../src/types/career.ts';
import type { ParsedCv } from './parseStructuredCv.ts';
import {
  dedupeEducation,
  dedupeExperience,
  dedupeSkills,
  isSkillSectionHeader,
} from '../../shared/cvDedupe.ts';

/** A stable id for an entry that the document has no id for yet. */
function entryId(seed: string, index: number): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `${slug}-${index}` : `entry-${index + 1}`;
}

function internshipsFrom(parsed: ParsedCv): CVInternship[] {
  return parsed.internships.map((entry, index) => ({
    id: entry.id || entryId(`${entry.role}-${entry.organization}`, index),
    organization: entry.organization,
    role: entry.role,
    period: entry.period,
    location: entry.location || undefined,
    description: entry.bullets.join('\n'),
    bullets: entry.bullets,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
  }));
}

function volunteeringFrom(parsed: ParsedCv): CVVolunteering[] {
  return parsed.volunteering.map((entry, index) => ({
    id: entry.id || entryId(`${entry.role}-${entry.organization}`, index),
    organization: entry.organization,
    role: entry.role,
    period: entry.period,
    location: entry.location || undefined,
    description: entry.bullets.join('\n'),
    bullets: entry.bullets,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
  }));
}

function languagesFrom(parsed: ParsedCv): CVLanguage[] {
  return parsed.languages.map((entry, index) => ({
    id: entry.id || entryId(entry.name, index),
    name: entry.name,
    level: entry.level || undefined,
  }));
}

function awardsFrom(parsed: ParsedCv): CVAward[] {
  return parsed.awards.map((entry, index) => ({
    id: entry.id || entryId(entry.title, index),
    title: entry.title,
    issuer: entry.issuer || undefined,
    date: entry.date || undefined,
    description: entry.description || undefined,
  }));
}

function publicationsFrom(parsed: ParsedCv): CVPublication[] {
  return parsed.publications.map((entry, index) => ({
    id: entry.id || entryId(entry.title, index),
    title: entry.title,
    publisher: entry.publisher || undefined,
    date: entry.date || undefined,
    url: entry.url || undefined,
    description: entry.description || undefined,
  }));
}

function researchFrom(parsed: ParsedCv): CVResearch[] {
  return parsed.research.map((entry, index) => ({
    id: entry.id || entryId(entry.title, index),
    title: entry.title,
    institution: entry.institution || undefined,
    period: entry.period || undefined,
    description: entry.description || undefined,
    bullets: entry.bullets,
  }));
}

function leadershipFrom(parsed: ParsedCv): CVLeadership[] {
  return parsed.leadership.map((entry, index) => ({
    id: entry.id || entryId(`${entry.role}-${entry.organization}`, index),
    organization: entry.organization,
    role: entry.role,
    period: entry.period || undefined,
    description: entry.description || undefined,
    bullets: entry.bullets,
  }));
}

function coursesFrom(parsed: ParsedCv): CVCourse[] {
  return parsed.courses.map((entry, index) => ({
    id: entry.id || entryId(entry.title, index),
    title: entry.title,
    provider: entry.provider,
    description: entry.description,
  }));
}

/**
 * Converts the parsed document into the document shape.
 *
 * Nothing is invented here and nothing is dropped: every value the parser
 * found is carried across, and the fields the parser has no value for are
 * left empty rather than filled.
 */
export function parsedCvToProfile(parsed: ParsedCv): CVProfile {
  const certificationDetails = parsed.certificationDetails.map((entry, index) => ({
    id: entryId(entry.name, index),
    name: entry.name,
    issuer: entry.issuer,
    issueDate: entry.issueDate,
    description: entry.description,
    credentialId: entry.credentialId || undefined,
    skills: entry.skills,
  }));

  return {
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone,
    location: parsed.location,
    title: parsed.title,
    summary: parsed.summary,
    linkedin: parsed.linkedin || undefined,
    github: parsed.github || undefined,
    website: parsed.website || undefined,
    // The duplicates are removed HERE, before the document reaches the
    // studio.
    //
    // A CV often lists the same placement twice — once under "Experience"
    // and once under "Internships" — and the import used to carry both into
    // the profile, so the candidate saw the same job twice and pressing
    // "Fill from my records" again added a third copy.
    experiences: dedupeExperience(
      parsed.experiences.map((entry, index) => ({
        id: entry.id || entryId(`${entry.role}-${entry.company}`, index),
        company: entry.company,
        role: entry.role,
        period: entry.period,
        location: entry.location,
        bullets: entry.bullets,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.isCurrent,
        employmentType: entry.employmentType,
      }))
    ),
    education: dedupeEducation(
      parsed.education.map((entry, index) => ({
        id: entry.id || entryId(`${entry.institution}-${entry.degree}`, index),
        institution: entry.institution,
        degree: entry.degree,
        field: entry.field,
        period: entry.period,
        gpa: entry.gpa,
        startDate: entry.startDate,
        endDate: entry.endDate,
        current: entry.current,
      }))
    ),
    projects: parsed.projects.map((entry, index) => ({
      id: entry.id || entryId(entry.title, index),
      title: entry.title,
      role: entry.role,
      link: entry.link,
      technologies: entry.technologies,
      bullets: entry.bullets,
    })),
    // The skill list is normalised and de-duplicated, and a section heading
    // is never kept as a skill. "TECHNICAL SKILLS" is a heading; "Python" is
    // a skill.
    skillsList: dedupeSkills(parsed.skillsList).filter(
      (skill) => !isSkillSectionHeader(skill)
    ),
    certifications: parsed.certifications,
    certificationDetails,
    links: [],
    volunteering: volunteeringFrom(parsed),
    courses: coursesFrom(parsed),
    internships: internshipsFrom(parsed),
    languages: languagesFrom(parsed),
    awards: awardsFrom(parsed),
    publications: publicationsFrom(parsed),
    research: researchFrom(parsed),
    leadership: leadershipFrom(parsed),
    hiddenSkills: [],
  };
}
