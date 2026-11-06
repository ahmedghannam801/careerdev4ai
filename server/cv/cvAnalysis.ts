// The measured analysis of a CV.
//
// The engine in `shared/cvAnalysis.ts` measures a document: it counts what is
// actually on the CV and reports it. This module is the server's way of
// running it. It does three things the engine deliberately does not:
//
//   * it turns the shapes the server holds into the shape the engine reads;
//   * it resolves the target role's skills from the catalogue the platform
//     owns, so the comparison is against the same taxonomy every other
//     feature uses;
//   * it returns the report in the shape the platform stores.
//
// No model is involved. The analysis is available whether or not a provider is
// configured, which is the point: a score that can be measured does not need a
// model to exist, and it never changes because a provider was busy.

import {
  analyzeCv,
  runCvAnalysisPipeline,
  toLegacyAtsAnalysis,
  type CvAnalysisDocument,
  type CvAnalysisReport,
  type CvAnalysisStageEvent,
} from '../../shared/cvAnalysis.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import { extractTextDocument } from './documentExtraction.ts';
import { parseStructuredCv } from './parseStructuredCv.ts';
import { getCvVersion } from '../db/cvVersions.ts';
import { createCvMeasurement } from '../db/cvMeasurements.ts';

/**
 * The document the analyser reads.
 *
 * It is deliberately permissive: the server holds the parsed CV of an uploaded
 * document, and the client holds the document the candidate is editing. Both
 * carry the same fields, and neither is trusted to carry more than it has.
 */
export interface MeasurableCvDocument {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  title?: string;
  summary?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  experiences?: {
    company?: string;
    role?: string;
    period?: string;
    bullets?: string[];
    description?: string;
  }[];
  education?: {
    institution?: string;
    degree?: string;
    field?: string;
    period?: string;
    gpa?: string;
  }[];
  projects?: {
    title?: string;
    role?: string;
    technologies?: string[];
    bullets?: string[];
    description?: string;
  }[];
  skillsList?: string[];
  certifications?: string[];
  volunteering?: { organization?: string; role?: string; description?: string }[];
  courses?: { title?: string; provider?: string }[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** The document as the analyser reads it. */
export function toAnalysisDocument(cv: MeasurableCvDocument): CvAnalysisDocument {
  return {
    fullName: text(cv.fullName),
    email: text(cv.email),
    phone: text(cv.phone),
    location: text(cv.location),
    title: text(cv.title),
    summary: text(cv.summary),
    linkedin: text(cv.linkedin),
    github: text(cv.github),
    website: text(cv.website),
    experiences: (cv.experiences ?? []).map((entry) => ({
      company: text(entry.company),
      role: text(entry.role),
      period: text(entry.period),
      bullets: list(entry.bullets),
      description: text(entry.description),
    })),
    education: (cv.education ?? []).map((entry) => ({
      institution: text(entry.institution),
      degree: text(entry.degree),
      field: text(entry.field),
      period: text(entry.period),
      gpa: text(entry.gpa),
    })),
    projects: (cv.projects ?? []).map((entry) => ({
      title: text(entry.title),
      role: text(entry.role),
      technologies: list(entry.technologies),
      bullets: list(entry.bullets),
      description: text(entry.description),
    })),
    skillsList: list(cv.skillsList),
    certifications: list(cv.certifications),
    volunteering: (cv.volunteering ?? []).map((entry) => ({
      organization: text(entry.organization),
      role: text(entry.role),
      description: text(entry.description),
    })),
    courses: (cv.courses ?? []).map((entry) => ({
      title: text(entry.title),
      provider: text(entry.provider),
    })),
  };
}

/**
 * The skills the catalogue expects for a role.
 *
 * The catalogue is the platform's own record of what a role asks for, so the
 * comparison is the same one the roadmap, the skills catalogue and the
 * learning centre make. A role the catalogue does not know has no skill set,
 * and the skills dimension is then left unavailable rather than guessed.
 */
export function catalogueSkillNames(title: string | null | undefined): string[] {
  const role = resolveRole(title);
  if (!role) return [];
  const names = [
    ...role.requiredSkills.map((skill) => skill.name),
    ...role.preferredSkills.map((skill) => skill.name),
  ];
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

/**
 * Measures a CV against a target role.
 *
 * Returns null when the document cannot be read at all: a score for a document
 * that holds nothing would be a number about nothing.
 */
export function measureCv(input: {
  cv: MeasurableCvDocument;
  targetRoleTitle: string;
  targetRoleSkills?: string[];
  jobDescription?: string;
  now?: number;
}): CvAnalysisReport | null {
  const roleSkills = catalogueSkillNames(input.targetRoleTitle);
  const skills = roleSkills.length > 0 ? roleSkills : list(input.targetRoleSkills);

  return analyzeCv(
    {
      cv: toAnalysisDocument(input.cv),
      targetRoleTitle: input.targetRoleTitle,
      targetRoleSkills: skills,
      jobDescription: input.jobDescription,
    },
    input.now ?? Date.now()
  );
}

/**
 * The analysis in the shape the platform stores.
 *
 * The stored shape is unchanged, so every existing reader of a stored score
 * keeps working: the same fields, the same breakdown, the same keywords.
 */
export function toStoredAnalysis(report: CvAnalysisReport): ReturnType<typeof toLegacyAtsAnalysis> {
  return toLegacyAtsAnalysis(report);
}

/**
 * The document of a stored CV version, read for its owner.
 *
 * The version is resolved through the CV it belongs to, so a version that
 * belongs to somebody else is not found at all: there is no path here that
 * can measure another candidate's document.
 */
export async function loadMeasurableCv(
  profileId: string,
  cvVersionId: string
): Promise<{ document: MeasurableCvDocument; cvId: string; cvVersionId: string; targetRoleTitle: string } | null> {
  const version = await getCvVersion(profileId, cvVersionId);
  if (!version) return null;

  const profileJson = version.profileJson;
  if (!profileJson || typeof profileJson !== 'object') return null;

  return {
    document: profileJson as MeasurableCvDocument,
    cvId: version.cvId ?? '',
    cvVersionId: version.id,
    targetRoleTitle: version.targetRoleTitle ?? '',
  };
}

/**
 * Measures a CV, reporting every stage as it happens.
 *
 * The stages are the real ones: each `next()` does the work of one stage and
 * then reports it. Nothing is announced before it has happened, and nothing is
 * marked finished before it has succeeded.
 */
export async function measureCvWithStages(
  input: {
    cv: MeasurableCvDocument;
    targetRoleTitle: string;
    targetRoleSkills?: string[];
    jobDescription?: string;
    now?: number;
  },
  onStage: (event: CvAnalysisStageEvent) => void | Promise<void>
): Promise<CvAnalysisReport | null> {
  const roleSkills = catalogueSkillNames(input.targetRoleTitle);
  const skills = roleSkills.length > 0 ? roleSkills : list(input.targetRoleSkills);

  const pipeline = runCvAnalysisPipeline(
    {
      cv: toAnalysisDocument(input.cv),
      targetRoleTitle: input.targetRoleTitle,
      targetRoleSkills: skills,
      jobDescription: input.jobDescription,
    },
    input.now ?? Date.now()
  );

  let step = pipeline.next();
  while (!step.done) {
    await onStage(step.value);
    step = pipeline.next();
  }
  return step.value;
}

/**
 * Records a measurement as part of the CV's history.
 *
 * The record is written only when the measurement is about a stored CV: the
 * studio measures the document the candidate is editing, and that document has
 * no record of its own to hang the history on. A re-analysis never overwrites
 * an earlier one; it is a new row.
 */
export async function recordMeasurement(
  profileId: string,
  input: {
    cvId: string | null | undefined;
    cvVersionId?: string | null;
    targetRoleTitle: string;
    jobDescription?: string | null;
    report: CvAnalysisReport;
  }
): Promise<string | null> {
  if (!input.cvId) return null;

  try {
    const measurement = await createCvMeasurement(profileId, {
      cvId: input.cvId,
      cvVersionId: input.cvVersionId ?? null,
      targetRoleTitle: input.targetRoleTitle,
      jobDescription: input.jobDescription ?? null,
      overallScore: input.report.overallScore,
      band: input.report.band,
      report: input.report as unknown as Record<string, unknown>,
    });
    return measurement?.id ?? null;
  } catch (error) {
    // A history that cannot be written must not lose the measurement the
    // candidate is waiting for. The score is still real.
    console.error('[cv/analysis] the measurement could not be recorded:', error);
    return null;
  }
}

/**
 * Measures a CV and records the result as part of its history.
 */
export async function measureAndRecord(
  profileId: string,
  input: {
    cv: MeasurableCvDocument;
    cvId?: string | null;
    cvVersionId?: string | null;
    targetRoleTitle: string;
    targetRoleSkills?: string[];
    jobDescription?: string;
    now?: number;
  }
): Promise<{ report: CvAnalysisReport; measurementId: string | null } | null> {
  const report = measureCv(input);
  if (!report) return null;

  const measurementId = await recordMeasurement(profileId, {
    cvId: input.cvId,
    cvVersionId: input.cvVersionId,
    targetRoleTitle: input.targetRoleTitle,
    jobDescription: input.jobDescription,
    report,
  });

  return { report, measurementId };
}

/**
 * What the caller asked to be measured.
 *
 * The document is resolved from the server's own records whenever the caller
 * names a stored CV: the browser's ids are checked against the verified
 * profile, and a version that belongs to somebody else is not found. A caller
 * may also send the document itself, which is what the studio does with the
 * copy the candidate is editing.
 */
export interface AnalysisRequest {
  document: MeasurableCvDocument | null;
  cvId: string | null;
  cvVersionId: string | null;
  targetRoleTitle: string;
  targetRoleSkills: string[];
  jobDescription: string | null;
  /** Why there is no document to measure, when there is none. */
  problem: 'no_document' | 'unknown_version' | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves the request into a document that can be measured. */
export async function resolveAnalysisRequest(
  profileId: string,
  body: Record<string, unknown>
): Promise<AnalysisRequest> {
  const targetRoleSkills = list(body.targetRoleSkills);
  const jobDescription = typeof body.jobDescription === 'string' && body.jobDescription.trim().length > 0
    ? body.jobDescription.slice(0, 8000)
    : null;

  const versionId = typeof body.cvVersionId === 'string' ? body.cvVersionId.trim() : '';
  if (versionId) {
    if (!UUID_PATTERN.test(versionId)) {
      return {
        document: null,
        cvId: null,
        cvVersionId: null,
        targetRoleTitle: '',
        targetRoleSkills,
        jobDescription,
        problem: 'unknown_version',
      };
    }

    const stored = await loadMeasurableCv(profileId, versionId);
    if (!stored) {
      return {
        document: null,
        cvId: null,
        cvVersionId: null,
        targetRoleTitle: '',
        targetRoleSkills,
        jobDescription,
        problem: 'unknown_version',
      };
    }

    return {
      document: stored.document,
      cvId: stored.cvId || null,
      cvVersionId: stored.cvVersionId,
      targetRoleTitle:
        (typeof body.targetRoleTitle === 'string' && body.targetRoleTitle.trim()) ||
        stored.targetRoleTitle ||
        '',
      targetRoleSkills,
      jobDescription,
      problem: null,
    };
  }

  // The document itself. The studio measures the copy the candidate is
  // editing, which may not have been saved yet.
  if (body.cv && typeof body.cv === 'object' && !Array.isArray(body.cv)) {
    return {
      document: body.cv as MeasurableCvDocument,
      cvId: null,
      cvVersionId: null,
      targetRoleTitle:
        typeof body.targetRoleTitle === 'string' ? body.targetRoleTitle.trim() : '',
      targetRoleSkills,
      jobDescription,
      problem: null,
    };
  }

  // The text of a CV, read with the same parser the upload path uses.
  const cvText = typeof body.cvText === 'string' ? body.cvText : '';
  if (cvText.trim().length > 0) {
    const parsed = parseStructuredCv(extractTextDocument(cvText)).cv;
    return {
      document: parsed,
      cvId: null,
      cvVersionId: null,
      targetRoleTitle:
        typeof body.targetRoleTitle === 'string' ? body.targetRoleTitle.trim() : '',
      targetRoleSkills,
      jobDescription,
      problem: null,
    };
  }

  return {
    document: null,
    cvId: null,
    cvVersionId: null,
    targetRoleTitle: '',
    targetRoleSkills,
    jobDescription,
    problem: 'no_document',
  };
}
