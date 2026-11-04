/**
 * The server side of the job-description flow: reading a pasted advertisement,
 * comparing it with the candidate's real record, and writing the CV for it.
 *
 * The order of the operations is the whole design.
 *
 * The advertisement is read first, and everything it says is checked against
 * the text the candidate pasted. A requirement the model "expects" to see in a
 * job description is not a requirement — it has to be in the pasted text.
 *
 * The candidate's record is read second, from the database, for the verified
 * user id. The comparison between the two is done by the shared engine, not by
 * a model, so the ATS score is a measurement rather than an opinion.
 *
 * Only then is the model asked to write. It is given the advertisement's
 * requirements, the candidate's records, and the specific keywords the
 * candidate's record actually supports, and it is told that a keyword it
 * cannot support is not to be written at all. Every line it writes is then
 * checked back against the candidate's record, and a line that names something
 * the candidate does not have is dropped rather than shown.
 *
 * The result is always applied to the candidate's own document. Nothing here
 * writes to the candidate's records, so the CV studio's sync between records
 * and document keeps working exactly as it did before.
 */

import {
  buildAtsMatchReport,
  emptyAtsCvContent,
  emptyJobDescriptionAnalysis,
  extractDeterministicJobDescription,
  groundJobDescriptionAnalysis,
  parseAtsCvPayload,
  parseJobDescriptionAnalysis,
  type AtsCvContent,
  type AtsMatchReport,
  type AtsProfileFacts,
  type JobDescriptionAnalysis,
} from '../../shared/jobDescription.ts';
import {
  findUngroundedClaims,
  groundingRules,
  withOwnText,
} from '../ai/grounding.ts';
import { buildGroundingProfileForUser } from '../ai/groundingProfile.ts';
import { buildAiContextBlock, loadAiCareerContext } from '../ai/careerContext.ts';
import {
  aiLanguageInstruction,
  type AiLanguageCode,
} from '../../shared/aiLanguages.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';

/** The longest job description the server will read. */
export const MAX_JOB_DESCRIPTION_CHARS = 12000;

/** The AI client shape this module needs. */
export interface JobDescriptionAiClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

/**
 * Reads the candidate's real record.
 *
 * This is the only source the ATS comparison and the CV writing are allowed
 * to use. Every read is scoped to the verified user id, and a failing section
 * degrades that section alone.
 */
export async function loadAtsProfileFacts(userId: string): Promise<AtsProfileFacts> {
  const [skills, experiences, educations, projects, volunteering, certifications, learningItems] =
    await Promise.all([
      getUserSkills(userId).catch(() => []),
      listExperiences(userId).catch(() => []),
      listEducations(userId).catch(() => []),
      listProjects(userId).catch(() => []),
      listVolunteerExperiences(userId).catch(() => []),
      listCertifications(userId).catch(() => []),
      listLearningItems(userId).catch(() => []),
    ]);

  const sources: AtsProfileFacts['sources'] = [];

  for (const entry of experiences) {
    sources.push({
      label: `${entry.role} at ${entry.company}`,
      text: [entry.role, entry.company, entry.location ?? '', entry.description ?? '']
        .filter(Boolean)
        .join('. '),
    });
  }

  for (const entry of educations) {
    sources.push({
      label: `${entry.degree ?? 'Study'} at ${entry.institution}`,
      text: [entry.institution, entry.degree ?? '', entry.field ?? '', entry.description ?? '']
        .filter(Boolean)
        .join('. '),
    });
  }

  for (const entry of projects) {
    sources.push({
      label: `Project: ${entry.title}`,
      text: [entry.title, entry.goal ?? '', entry.description ?? '', entry.skills.join(', ')]
        .filter(Boolean)
        .join('. '),
    });
  }

  for (const entry of volunteering) {
    sources.push({
      label: `${entry.role} at ${entry.organization}`,
      text: [
        entry.organization,
        entry.role,
        entry.description ?? '',
        entry.responsibilities.join('. '),
        entry.achievements.join('. '),
        entry.skills.join(', '),
      ]
        .filter(Boolean)
        .join('. '),
    });
  }

  for (const entry of certifications) {
    sources.push({
      label: `Certificate: ${entry.name}`,
      text: [entry.name, entry.issuer ?? ''].filter(Boolean).join('. '),
    });
  }

  // Only a completed course is a qualification the candidate can claim.
  const completedIds = new Set(
    learningItems.filter((item) => item.status === 'completed').map((item) => item.courseId)
  );
  if (completedIds.size > 0) {
    const courses = await listCourses().catch(() => []);
    for (const course of courses) {
      if (!completedIds.has(course.id)) continue;
      sources.push({
        label: `Completed course: ${course.title}`,
        text: [course.title, course.provider].filter(Boolean).join('. '),
      });
    }
  }

  return {
    skills: skills
      .map((row) => ({ name: row.skill?.name ?? '', level: row.proficiency ?? 1 }))
      .filter((skill) => Boolean(skill.name)),
    sources,
  };
}

/**
 * The prompt that reads the advertisement.
 *
 * The pasted text is the only input. The model is asked to read it, and the
 * answer is then checked against it, so the model cannot introduce a
 * requirement the candidate did not paste.
 */
export function buildJobDescriptionPrompt(
  jdText: string,
  options: { language?: AiLanguageCode } = {}
): string {
  const parts: string[] = [];

  parts.push('You are reading ONE job description and extracting what it asks for.');
  parts.push('');
  parts.push('The job description, exactly as the candidate pasted it:');
  parts.push('---');
  parts.push(jdText);
  parts.push('---');
  parts.push('');
  parts.push('Extract the following, and nothing else:');
  parts.push('- jobTitle: the role the advertisement is for, or null if it names no role.');
  parts.push('- company: the employer it names, or null if it names none.');
  parts.push('- requiredSkills: the skills the advertisement lists as required.');
  parts.push('- preferredSkills: the skills it lists as preferred, desirable, a plus or a bonus.');
  parts.push('- technicalSkills: the tools, languages, frameworks and platforms it names.');
  parts.push('- softSkills: the interpersonal qualities it asks for.');
  parts.push('- keywords: the terms an applicant filter is likely to scan for.');
  parts.push('- responsibilities: what the person in the role is expected to do.');
  parts.push('- experienceRequirements: the experience it asks for.');
  parts.push('- educationRequirements: the education it asks for.');
  parts.push('- certifications: the certifications, licences or accreditations it asks for.');
  parts.push('- qualifications: the other formal requirements it asks for.');
  parts.push('- seniority: the seniority it states (intern, junior, mid-level, senior, lead, principal, director), or null if it states none.');
  parts.push('- location: the place the work is in, or null if it states none.');
  parts.push('- workArrangement: Remote, Hybrid or On-site, but only when the advertisement states it; otherwise null.');
  parts.push('- atsTerms: the exact terms an applicant tracking system is likely to filter on, copied from the advertisement.');
  parts.push('');
  parts.push('Rules:');
  parts.push('- Copy the wording from the advertisement. Do not add a requirement it does not state.');
  parts.push('- Do not paraphrase a skill into a different technology.');
  parts.push('- A field the advertisement does not state must be null for a single value or [] for a list. Never guess a company, a place, a seniority or an arrangement.');
  parts.push('- Keep each item to one short line, with no bullet characters.');
  if (options.language === 'ar') {
    parts.push('- The advertisement may be in Arabic. Write the extracted items in the advertisement\'s own language.');
  }
  parts.push('- Return JSON only, with those keys.');
  parts.push('- Example of the shape: {"jobTitle": "...", "company": "...", "requiredSkills": ["..."], "preferredSkills": ["..."], "technicalSkills": ["..."], "softSkills": ["..."], "keywords": ["..."], "responsibilities": ["..."], "experienceRequirements": ["..."], "educationRequirements": ["..."], "certifications": ["..."], "qualifications": ["..."], "seniority": "...", "location": "...", "workArrangement": "...", "atsTerms": ["..."]}');

  return parts.join('\n');
}

/**
 * Reads the advertisement, with a deterministic fallback.
 *
 * When no model is configured, or the model answers with something unusable,
 * the advertisement's own bullet lines are read instead. The fallback is
 * coarser, and the caller is told which path produced the analysis.
 */
export async function analyzeJobDescription(
  jdText: string,
  options: {
    ai: JobDescriptionAiClient | null;
    model: string;
    language?: AiLanguageCode;
  }
): Promise<{ analysis: JobDescriptionAnalysis; aiUsed: boolean; fallbackReason: string | null }> {
  const text = jdText.trim().slice(0, MAX_JOB_DESCRIPTION_CHARS);

  if (!options.ai) {
    return {
      analysis: extractDeterministicJobDescription(text),
      aiUsed: false,
      fallbackReason: 'no_model',
    };
  }

  try {
    const response = await options.ai.models.generateContent({
      model: options.model,
      contents: buildJobDescriptionPrompt(text, { language: options.language }),
      config: { responseMimeType: 'application/json' },
    });

    let payload: unknown;
    try {
      payload = JSON.parse(response.text || '{}');
    } catch {
      payload = null;
    }

    const parsed = parseJobDescriptionAnalysis(payload);
    if (!parsed) {
      return {
        analysis: extractDeterministicJobDescription(text),
        aiUsed: false,
        fallbackReason: 'invalid_response',
      };
    }

    // The model's reading is checked against the pasted text before it is
    // used: anything it invented is dropped.
    const grounded = groundJobDescriptionAnalysis(parsed, text);
    return { analysis: grounded, aiUsed: true, fallbackReason: null };
  } catch (error) {
    console.error('Failed to analyse the job description:', error);
    return {
      analysis: extractDeterministicJobDescription(text),
      aiUsed: false,
      fallbackReason: 'model_error',
    };
  }
}

/**
 * The candidate's current CV document, as the server understands it.
 *
 * The client sends the document it is showing. It is used as context for the
 * rewrite and as the candidate's own text for the grounding check, so the
 * model improves what is there rather than replacing it. The ids in it are
 * never trusted: the records are resolved from the database.
 */
export interface ClientCvDocument {
  title?: string;
  summary?: string;
  experiences?: { id: string; bullets?: string[] }[];
  projects?: { id: string; bullets?: string[]; description?: string }[];
  skillsList?: string[];
}

/**
 * Builds the prompt that writes the CV for the advertisement.
 */
export function buildAtsCvPrompt(input: {
  analysis: JobDescriptionAnalysis;
  match: AtsMatchReport;
  careerContextBlock: string;
  experienceBlock: string;
  projectBlock: string;
  documentBlock: string;
  language?: AiLanguageCode;
}): string {
  const parts: string[] = [];
  const supported = input.match.matched
    .filter((item) => item.kind !== 'responsibility')
    .map((item) => item.requirement);

  parts.push('You are rewriting ONE candidate\'s CV so that it is aimed at ONE specific job description.');
  if (input.analysis.jobTitle || input.analysis.company) {
    parts.push('');
    parts.push(
      `The role: ${[input.analysis.jobTitle, input.analysis.company].filter(Boolean).join(' at ')}.`
    );
  }
  const roleFacts = [
    input.analysis.seniority ? `Seniority: ${input.analysis.seniority}` : '',
    input.analysis.location ? `Location: ${input.analysis.location}` : '',
    input.analysis.workArrangement ? `Work arrangement: ${input.analysis.workArrangement}` : '',
  ].filter(Boolean);
  if (roleFacts.length > 0) {
    for (const fact of roleFacts) parts.push(`- ${fact}`);
  }
  parts.push('');
  parts.push('The job description\'s requirements:');
  for (const item of input.analysis.requiredSkills) parts.push(`- Required skill: ${item}`);
  for (const item of input.analysis.preferredSkills ?? []) parts.push(`- Preferred skill: ${item}`);
  for (const item of input.analysis.technicalSkills) parts.push(`- Tool or technology: ${item}`);
  for (const item of input.analysis.softSkills ?? []) parts.push(`- Soft skill: ${item}`);
  for (const item of input.analysis.experienceRequirements) parts.push(`- Experience: ${item}`);
  for (const item of input.analysis.educationRequirements ?? []) parts.push(`- Education: ${item}`);
  for (const item of input.analysis.certifications ?? []) parts.push(`- Certification: ${item}`);
  for (const item of input.analysis.qualifications) parts.push(`- Qualification: ${item}`);
  for (const item of input.analysis.responsibilities) parts.push(`- Responsibility: ${item}`);
  parts.push('');
  parts.push(
    'These requirements the candidate\'s records DO support, so you may use this exact wording for them:'
  );
  for (const item of supported) parts.push(`- ${item}`);
  parts.push(
    '- Any other requirement from the job description is NOT supported by the candidate\'s records. Do not write it, do not imply it, and do not work around it.'
  );
  parts.push('');
  parts.push("The candidate's own record, read from their CareerDev4AI account:");
  parts.push(input.careerContextBlock);
  if (input.experienceBlock) {
    parts.push('');
    parts.push('The work experience you may rewrite, with the id of each record:');
    parts.push(input.experienceBlock);
  }
  if (input.projectBlock) {
    parts.push('');
    parts.push('The projects you may rewrite, with the id of each record:');
    parts.push(input.projectBlock);
  }
  if (input.documentBlock) {
    parts.push('');
    parts.push('The CV document the candidate already has. Improve it and keep it:');
    parts.push(input.documentBlock);
  }
  parts.push('');
  parts.push('What to produce:');
  parts.push('- headline: one line under the candidate\'s name, aimed at this job.');
  parts.push('- summary: a short professional summary that uses the job\'s language for what the candidate has.');
  parts.push('- experiences: for each experience id you were given, the rewritten bullet points.');
  parts.push('- projects: for each project id you were given, the rewritten bullet points and a one-line description.');
  parts.push('- skills: the skills line, ordered so the ones this job asks for come first.');
  parts.push('- keywordsUsed: the job description\'s keywords you actually used.');
  parts.push('');
  parts.push('Rules:');
  parts.push('- Only rewrite, reorder and sharpen what the candidate\'s record already contains.');
  parts.push('- Never invent a company, a job title, a date, a metric, a percentage, a certificate, a project or a tool.');
  parts.push('- Never write a skill the candidate\'s record does not list, even when the job description asks for it.');
  parts.push('- If a bullet cannot be written truthfully from the record, leave it out rather than inventing it.');
  parts.push('- Keep every bullet to one line and start it with a past-tense action verb.');
  parts.push(`- ${aiLanguageInstruction(input.language ?? 'en')}`);
  parts.push(groundingRules());
  parts.push('');
  parts.push(
    '- Return JSON: {"headline": string, "summary": string, "experiences": [{"id": string, "bullets": string[]}], "projects": [{"id": string, "bullets": string[], "description": string}], "skills": string[], "keywordsUsed": string[]}'
  );

  return parts.join('\n');
}

/**
 * Writes the CV for the advertisement.
 *
 * Every line the model wrote is checked against the candidate's record before
 * it is returned, and every id it used is checked against the records the
 * server itself loaded. A line that names something the candidate does not
 * have is dropped and reported, so the candidate can see what was not accepted
 * instead of finding it on their CV later.
 */
export async function generateAtsCvContent(input: {
  userId: string;
  analysis: JobDescriptionAnalysis;
  match: AtsMatchReport;
  document?: ClientCvDocument | null;
  ai: JobDescriptionAiClient | null;
  model: string;
  language?: AiLanguageCode;
}): Promise<{ ok: true; content: AtsCvContent } | { ok: false; reason: 'no_model' | 'invalid_response' }> {
  if (!input.ai) {
    return { ok: false, reason: 'no_model' };
  }

  const [careerContext, experiences, projects, groundingProfile] = await Promise.all([
    loadAiCareerContext(input.userId),
    listExperiences(input.userId).catch(() => []),
    listProjects(input.userId).catch(() => []),
    buildGroundingProfileForUser(input.userId),
  ]);

  const experienceBlock = experiences
    .map((entry) => {
      const lines = [
        `id: ${entry.id}`,
        `role: ${entry.role}`,
        `company: ${entry.company}`,
        entry.startDate ? `from: ${entry.startDate}` : '',
        entry.isCurrent ? 'current role' : entry.endDate ? `to: ${entry.endDate}` : '',
        entry.description ? `what the candidate recorded: ${entry.description}` : '',
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');

  const projectBlock = projects
    .map((entry) => {
      const lines = [
        `id: ${entry.id}`,
        `title: ${entry.title}`,
        entry.goal ? `goal: ${entry.goal}` : '',
        entry.description ? `what the candidate recorded: ${entry.description}` : '',
        entry.skills.length > 0 ? `technologies: ${entry.skills.join(', ')}` : '',
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');

  // The document the candidate already has is their own writing, so it counts
  // as their claim when the answer is checked.
  const ownText: string[] = [];
  const document = input.document;
  if (document?.summary?.trim()) ownText.push(document.summary.trim());
  if (document?.title?.trim()) ownText.push(document.title.trim());
  for (const entry of document?.experiences ?? []) {
    for (const bullet of entry.bullets ?? []) {
      if (bullet.trim()) ownText.push(bullet.trim());
    }
  }
  for (const entry of document?.projects ?? []) {
    if (entry.description?.trim()) ownText.push(entry.description.trim());
    for (const bullet of entry.bullets ?? []) {
      if (bullet.trim()) ownText.push(bullet.trim());
    }
  }

  const documentBlock = document
    ? [
        document.title?.trim() ? `headline: ${document.title.trim()}` : '',
        document.summary?.trim() ? `summary: ${document.summary.trim()}` : '',
        (document.experiences ?? [])
          .map(
            (entry) =>
              `experience ${entry.id}: ${(entry.bullets ?? []).filter(Boolean).join(' | ')}`
          )
          .filter(Boolean)
          .join('\n'),
        (document.projects ?? [])
          .map(
            (entry) =>
              `project ${entry.id}: ${(entry.bullets ?? []).filter(Boolean).join(' | ')}`
          )
          .filter(Boolean)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const prompt = buildAtsCvPrompt({
    analysis: input.analysis,
    match: input.match,
    careerContextBlock: buildAiContextBlock(careerContext),
    experienceBlock,
    projectBlock,
    documentBlock,
    language: input.language,
  });

  let payload: unknown;
  try {
    const response = await input.ai.models.generateContent({
      model: input.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    payload = JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Failed to generate the job-description CV:', error);
    return { ok: false, reason: 'invalid_response' };
  }

  const parsed = parseAtsCvPayload(payload);
  if (!parsed) {
    console.error('The job-description CV payload did not satisfy the contract.');
    return { ok: false, reason: 'invalid_response' };
  }

  // The records the server loaded are the only ones that may be written to.
  const experienceIds = new Set(experiences.map((entry) => entry.id));
  const projectIds = new Set(projects.map((entry) => entry.id));

  const known = withOwnText(groundingProfile, ownText);
  const removedClaims: string[] = [];

  const keepBullet = (bullet: string): boolean => {
    const claims = findUngroundedClaims(bullet, known);
    if (claims.length === 0) return true;
    for (const claim of claims) removedClaims.push(claim.claim);
    return false;
  };

  const groundText = (value: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const claims = findUngroundedClaims(trimmed, known);
    if (claims.length > 0) {
      for (const claim of claims) removedClaims.push(claim.claim);
      return null;
    }
    return trimmed;
  };

  const groundedExperiences = parsed.experiences
    .filter((entry) => experienceIds.has(entry.id))
    .map((entry) => ({ id: entry.id, bullets: entry.bullets.filter(keepBullet) }))
    .filter((entry) => entry.bullets.length > 0);

  const groundedProjects = parsed.projects
    .filter((entry) => projectIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      bullets: entry.bullets.filter(keepBullet),
      description: groundText(entry.description),
    }))
    .filter((entry) => entry.bullets.length > 0 || entry.description);

  // The skills line may only contain skills the candidate really has.
  const ownedSkillNames = new Set(
    groundingProfile.skills.map((name) => name.toLowerCase()),
  );
  const skills = parsed.skills.filter((skill) => {
    const lower = skill.trim().toLowerCase();
    if (!lower) return false;
    if (ownedSkillNames.has(lower)) return true;
    // A skill the candidate rated under a longer name still counts.
    return groundingProfile.skills.some(
      (name) => name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())
    );
  });

  const keywordsUsed = parsed.keywordsUsed.filter((keyword) =>
    input.match.matched.some((item) => item.requirement === keyword)
  );

  return {
    ok: true,
    content: {
      ...emptyAtsCvContent(),
      headline: groundText(parsed.headline),
      summary: groundText(parsed.summary),
      experiences: groundedExperiences,
      projects: groundedProjects,
      skills,
      keywordsUsed,
      removedClaims: [...new Set(removedClaims)],
    },
  };
}

/**
 * Runs the whole comparison: the advertisement against the candidate's record.
 */
export async function buildJobDescriptionMatch(
  userId: string,
  analysis: JobDescriptionAnalysis,
  options: { language?: AiLanguageCode } = {}
): Promise<AtsMatchReport> {
  const facts = await loadAtsProfileFacts(userId);
  return buildAtsMatchReport(analysis, facts, { language: options.language });
}

/**
 * An analysis of an empty advertisement, used when there is nothing to read.
 */
export function emptyAnalysis(): JobDescriptionAnalysis {
  return emptyJobDescriptionAnalysis();
}
