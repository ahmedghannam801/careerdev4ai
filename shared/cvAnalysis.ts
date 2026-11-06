/**
 * Deterministic CV analysis.
 *
 * The score in this module is MEASURED from the candidate's own document.
 * No model is asked to invent a number: each dimension is a small, explicit
 * rule set over evidence that is actually present in the CV (or, for market
 * fit, in the job description the candidate supplied).
 *
 * The report is deliberately conservative:
 *
 *   * a dimension with no evidence is marked unavailable instead of being
 *     given a flattering placeholder;
 *   * the overall score is a weighted average of the dimensions that exist,
 *     re-normalised so a missing dimension never counts as a zero;
 *   * an AI-written recommendation is optional enrichment only; the score,
 *     the strengths, the gaps and the action plan are deterministic.
 *
 * The pipeline is a generator so the server can stream each stage only when
 * that stage has actually finished. Nothing here waits on a timer.
 */

import {
  buildAtsMatchReport,
  extractDeterministicJobDescription,
  type AtsMatchReport,
  type AtsProfileFacts,
} from './jobDescription.ts';

export type CvDimensionKey =
  | 'clarity'
  | 'impact'
  | 'ats'
  | 'skills'
  | 'experience'
  | 'egyptMarketFit';

export type CvScoreBand = 'excellent' | 'good' | 'needs_improvement';

export interface CvDimension {
  key: CvDimensionKey;
  /** 0..100, or null when the document does not support a measurement. */
  score: number | null;
  available: boolean;
  /** One short line explaining what was counted. */
  summary: string;
  /** The concrete evidence behind the score. */
  evidence: string[];
}

export type CvAtsFindingStatus = 'pass' | 'warning' | 'fail';

export interface CvAtsFinding {
  id: string;
  status: CvAtsFindingStatus;
  detail: string;
}

export interface CvActionItem {
  id: string;
  priority: 'now' | 'next' | 'later';
  title: string;
  why: string;
  how: string;
}

export interface CvAnalysisReport {
  schemaVersion: 1;
  generatedAt: string;
  targetRoleTitle: string;
  overallScore: number;
  band: CvScoreBand;
  summary: string;
  dimensions: CvDimension[];
  strengths: string[];
  weaknesses: string[];
  ats: {
    score: number;
    findings: CvAtsFinding[];
  };
  skills: {
    present: string[];
    relevant: string[];
    missing: string[];
    needsEvidence: string[];
  };
  experience: {
    score: number;
    findings: string[];
  };
  marketFit: {
    score: number | null;
    source: 'job_description' | 'none';
    evidence: string[];
    note: string;
    match: AtsMatchReport | null;
  };
  actionPlan: CvActionItem[];
}

export interface CvAnalysisInput {
  cv: CvAnalysisDocument;
  targetRoleTitle: string;
  /** The candidate's target-role skills from the central taxonomy. */
  targetRoleSkills?: string[];
  /** A specific advertisement, when the candidate wants a job-specific read. */
  jobDescription?: string;
}

/** The subset of the CV document the analyser reads. */
export interface CvAnalysisDocument {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  linkedin?: string;
  github?: string;
  website?: string;
  experiences: {
    company: string;
    role: string;
    period: string;
    bullets: string[];
    description?: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    period: string;
    gpa?: string;
  }[];
  projects: {
    title: string;
    role: string;
    technologies: string[];
    bullets: string[];
    description?: string;
  }[];
  skillsList: string[];
  certifications: string[];
  volunteering?: { organization: string; role: string; description?: string }[];
  courses?: { title: string; provider: string }[];
}

export type CvAnalysisStageId =
  | 'reading_structure'
  | 'extracting_information'
  | 'evaluating_skills'
  | 'ats_compatibility'
  | 'target_relevance'
  | 'egypt_market'
  | 'skill_gaps'
  | 'recommendations'
  | 'final_report';

export type CvAnalysisStageStatus = 'active' | 'completed' | 'failed';

export interface CvAnalysisStageEvent {
  stage: CvAnalysisStageId;
  status: CvAnalysisStageStatus;
  /** A short, factual line for the progress screen. */
  summary: string;
  at: string;
}

export interface CvAnalysisStageDefinition {
  id: CvAnalysisStageId;
  /** English source string; translated by the interface. */
  label: string;
  description: string;
}

/** The nine stages, in execution order. */
export const CV_ANALYSIS_STAGES: readonly CvAnalysisStageDefinition[] = [
  {
    id: 'reading_structure',
    label: 'Reading CV structure',
    description: 'Checking that the document has the sections an application needs.',
  },
  {
    id: 'extracting_information',
    label: 'Extracting personal and professional information',
    description: 'Counting the evidence already present in the document.',
  },
  {
    id: 'evaluating_skills',
    label: 'Evaluating skills and experience',
    description: 'Comparing the skills on the CV with the target role.',
  },
  {
    id: 'ats_compatibility',
    label: 'Checking ATS compatibility',
    description: 'Looking for the structure and contact details a parser needs.',
  },
  {
    id: 'target_relevance',
    label: 'Evaluating target role relevance',
    description: 'Measuring how closely the experience matches the role.',
  },
  {
    id: 'egypt_market',
    label: 'Checking Egyptian market relevance',
    description: 'Using only job evidence that was actually supplied.',
  },
  {
    id: 'skill_gaps',
    label: 'Identifying skill gaps',
    description: 'Listing the target-role skills the CV does not show.',
  },
  {
    id: 'recommendations',
    label: 'Generating CV improvement recommendations',
    description: 'Turning the findings into a prioritised action plan.',
  },
  {
    id: 'final_report',
    label: 'Preparing the final report',
    description: 'Combining the measured dimensions into one score.',
  },
] as const;

/** The band thresholds. Kept here so every surface agrees. */
export const CV_SCORE_BANDS = [
  { band: 'excellent' as const, minimum: 80 },
  { band: 'good' as const, minimum: 60 },
  { band: 'needs_improvement' as const, minimum: 0 },
] as const;

export function scoreBand(score: number): CvScoreBand {
  for (const entry of CV_SCORE_BANDS) {
    if (score >= entry.minimum) return entry.band;
  }
  return 'needs_improvement';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalise(value).split(' ').filter(Boolean);
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Every bullet the candidate wrote, across experience and projects. */
function collectBullets(cv: CvAnalysisDocument): string[] {
  return [
    ...cv.experiences.flatMap((entry) => entry.bullets),
    ...cv.projects.flatMap((entry) => entry.bullets),
  ].filter((bullet) => bullet.trim().length > 0);
}

const ACTION_VERBS = new Set([
  'built',
  'led',
  'launched',
  'delivered',
  'designed',
  'developed',
  'implemented',
  'improved',
  'increased',
  'reduced',
  'automated',
  'migrated',
  'optimised',
  'optimized',
  'created',
  'managed',
  'shipped',
  'tested',
  'analysed',
  'analyzed',
  'coordinated',
  'trained',
  'mentored',
  'negotiated',
  'researched',
  'streamlined',
]);

const METRIC_PATTERN = /(\d+(?:[.,]\d+)?\s*%|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\s*(?:users|clients|customers|projects|people|hours|days|weeks|months|egp|usd|jod|sar|aed)|[$€£]\s*\d+)/i;

function hasMetric(value: string): boolean {
  return METRIC_PATTERN.test(value);
}

function startsWithActionVerb(value: string): boolean {
  const [first] = words(value);
  return Boolean(first && ACTION_VERBS.has(first));
}

function tokenOverlap(source: string, target: string): number {
  const targetTokens = new Set(words(target).filter((token) => token.length > 2));
  if (targetTokens.size === 0) return 0;
  const sourceTokens = new Set(words(source));
  let found = 0;
  for (const token of targetTokens) {
    if (sourceTokens.has(token)) found += 1;
  }
  return found / targetTokens.size;
}

function includesSkill(haystack: string[], skill: string): boolean {
  const needle = normalise(skill);
  if (!needle) return false;
  return haystack.some((entry) => {
    const value = normalise(entry);
    return value === needle || value.includes(needle) || needle.includes(value);
  });
}

/** Everything the stages share, computed once from the document. */
interface AnalysisContext {
  input: CvAnalysisInput;
  cv: CvAnalysisDocument;
  bullets: string[];
  allText: string;
  skillNames: string[];
  expectedSkills: string[];
  yearsExperience: number;
}

function parseYear(value: string): number | null {
  const match = value.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function estimateYearsExperience(cv: CvAnalysisDocument): number {
  const years = cv.experiences
    .flatMap((entry) => {
      const start = parseYear(entry.period ?? '');
      return start ? [start] : [];
    })
    .sort((a, b) => a - b);
  if (years.length === 0) return 0;
  const first = years[0];
  const current = new Date().getFullYear();
  return Math.max(0, current - first);
}

function buildContext(input: CvAnalysisInput): AnalysisContext {
  const cv = input.cv;
  const allText = [
    cv.title,
    cv.summary,
    ...cv.experiences.flatMap((entry) => [entry.role, entry.company, entry.description ?? '', ...entry.bullets]),
    ...cv.projects.flatMap((entry) => [entry.title, entry.role, entry.description ?? '', ...entry.bullets]),
    ...cv.education.flatMap((entry) => [entry.degree, entry.field, entry.institution]),
    ...cv.certifications,
    ...(cv.courses?.map((entry) => entry.title) ?? []),
    ...(cv.volunteering?.flatMap((entry) => [entry.role, entry.organization, entry.description ?? '']) ?? []),
  ]
    .filter(hasText)
    .join('\n');

  const skillNames = Array.from(
    new Set(
      [
        ...cv.skillsList,
        ...cv.projects.flatMap((entry) => entry.technologies),
      ]
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

  const expectedSkills = Array.from(
    new Set((input.targetRoleSkills ?? []).map((entry) => entry.trim()).filter(Boolean))
  );

  return {
    input,
    cv,
    bullets: collectBullets(cv),
    allText,
    skillNames,
    expectedSkills,
    yearsExperience: estimateYearsExperience(cv),
  };
}

function clarityDimension(ctx: AnalysisContext): CvDimension {
  const { cv } = ctx;
  const evidence: string[] = [];
  // The base is 31 so that a document carrying every element reaches exactly
  // 100. A ceiling of 99 would read as a rounding bug to the candidate, and
  // this score claims to be measured rather than estimated.
  let score = 31;

  if (hasText(cv.title)) {
    score += 12;
    evidence.push('A professional headline is present.');
  } else {
    evidence.push('No professional headline.');
  }

  const summaryWords = words(cv.summary).length;
  if (summaryWords >= 25) {
    score += 18;
    evidence.push(`The summary is ${summaryWords} words long.`);
  } else if (summaryWords > 0) {
    score += 8;
    evidence.push(`The summary is short (${summaryWords} words).`);
  } else {
    evidence.push('No professional summary.');
  }

  if (hasText(cv.email) && hasText(cv.phone)) {
    score += 12;
    evidence.push('Email and phone are both present.');
  } else if (hasText(cv.email) || hasText(cv.phone)) {
    score += 5;
    evidence.push('Only one contact channel is present.');
  } else {
    evidence.push('No email or phone.');
  }

  if (hasText(cv.location)) {
    score += 5;
    evidence.push('A location is present.');
  }

  const experiencesWithPeriod = cv.experiences.filter((entry) => hasText(entry.period)).length;
  if (cv.experiences.length > 0 && experiencesWithPeriod === cv.experiences.length) {
    score += 10;
    evidence.push('Every role has a date range.');
  } else if (cv.experiences.length > 0) {
    evidence.push(`${cv.experiences.length - experiencesWithPeriod} role(s) have no date range.`);
  }

  const sections = [
    cv.experiences.length > 0,
    cv.education.length > 0,
    ctx.skillNames.length > 0,
    cv.projects.length > 0 || cv.certifications.length > 0 || (cv.courses?.length ?? 0) > 0,
  ].filter(Boolean).length;
  score += sections * 3;
  evidence.push(`${sections} of 4 supporting sections are present.`);

  return {
    key: 'clarity',
    score: clamp(score),
    available: true,
    summary: 'Headline, summary, contact details and section completeness.',
    evidence,
  };
}

function impactDimension(ctx: AnalysisContext): CvDimension {
  const bullets = ctx.bullets;
  const evidence: string[] = [];
  if (bullets.length === 0) {
    return {
      key: 'impact',
      score: 15,
      available: true,
      summary: 'No achievement bullets were found.',
      evidence: ['The CV has no experience or project bullets to measure.'],
    };
  }

  const quantified = bullets.filter(hasMetric).length;
  const actionLed = bullets.filter(startsWithActionVerb).length;
  const longBullets = bullets.filter((bullet) => words(bullet).length > 45).length;

  const quantifiedRatio = quantified / bullets.length;
  const actionRatio = actionLed / bullets.length;
  const score =
    40 * quantifiedRatio +
    40 * actionRatio +
    20 * Math.min(1, bullets.length / 5) -
    Math.min(15, longBullets * 4);

  evidence.push(`${quantified} of ${bullets.length} bullets contain a measurable result.`);
  evidence.push(`${actionLed} of ${bullets.length} bullets start with an action verb.`);
  if (longBullets > 0) evidence.push(`${longBullets} bullet(s) are longer than 45 words.`);

  return {
    key: 'impact',
    score: clamp(score),
    available: true,
    summary: 'Measurable results and action-led achievement statements.',
    evidence,
  };
}

function atsDimension(ctx: AnalysisContext): CvDimension & { findings: CvAtsFinding[] } {
  const { cv } = ctx;
  const findings: CvAtsFinding[] = [];
  let score = 100;

  const fail = (id: string, detail: string) => {
    score -= 18;
    findings.push({ id, status: 'fail', detail });
  };
  const warn = (id: string, detail: string) => {
    score -= 8;
    findings.push({ id, status: 'warning', detail });
  };
  const pass = (id: string, detail: string) => findings.push({ id, status: 'pass', detail });

  if (hasText(cv.email)) pass('email', 'A machine-readable email address is present.');
  else fail('email', 'No email address was found; most parsers cannot create a candidate record.');

  if (hasText(cv.phone)) pass('phone', 'A phone number is present.');
  else warn('phone', 'No phone number was found.');

  if (hasText(cv.title)) pass('headline', 'A role headline is present.');
  else warn('headline', 'No role headline; the parser has to infer the target role.');

  if (words(cv.summary).length >= 20) pass('summary', 'A readable summary is present.');
  else if (hasText(cv.summary)) warn('summary', 'The summary is very short.');
  else warn('summary', 'No summary section was found.');

  if (ctx.skillNames.length >= 5) pass('skills', `${ctx.skillNames.length} skills are listed.`);
  else if (ctx.skillNames.length > 0) warn('skills', 'Only a few skills are listed.');
  else fail('skills', 'No skills section was found.');

  if (cv.experiences.length > 0) pass('experience', 'An experience section is present.');
  else if (cv.projects.length > 0) warn('experience', 'No employment history; projects carry the evidence.');
  else fail('experience', 'No experience or project section was found.');

  if (cv.education.length > 0) pass('education', 'An education section is present.');
  else warn('education', 'No education section was found.');

  const experiencesWithPeriod = cv.experiences.filter((entry) => hasText(entry.period)).length;
  if (cv.experiences.length > 0 && experiencesWithPeriod < cv.experiences.length) {
    warn('dates', 'Some roles have no date range, which weakens parsing.');
  } else if (cv.experiences.length > 0) {
    pass('dates', 'Every role has a date range.');
  }

  const veryLong = ctx.bullets.filter((bullet) => words(bullet).length > 45).length;
  if (veryLong > 0) warn('bullet_length', `${veryLong} bullet(s) are long enough to wrap unpredictably.`);
  else if (ctx.bullets.length > 0) pass('bullet_length', 'Bullet lengths are parser-friendly.');

  const contactLinks = [cv.linkedin, cv.github, cv.website].filter(hasText).length;
  if (contactLinks > 0) pass('links', 'At least one professional link is present.');

  findings.push({
    id: 'layout',
    status: 'pass',
    detail: 'The analysis reads the extracted text; it cannot see fonts, tables or columns.',
  });

  return {
    key: 'ats',
    score: clamp(score),
    available: true,
    summary: 'Contact details, section structure and parser-friendly formatting.',
    evidence: findings.map((finding) => finding.detail),
    findings,
  };
}

function skillsDimension(ctx: AnalysisContext): CvDimension {
  const { expectedSkills, skillNames, cv } = ctx;
  if (expectedSkills.length === 0) {
    return {
      key: 'skills',
      score: null,
      available: false,
      summary: 'No target-role skill set was available to compare against.',
      evidence: [],
    };
  }

  const relevant = expectedSkills.filter((skill) => includesSkill(skillNames, skill));
  const missing = expectedSkills.filter((skill) => !includesSkill(skillNames, skill));
  const score = clamp((relevant.length / expectedSkills.length) * 100);
  const evidence = [
    `${relevant.length} of ${expectedSkills.length} target-role skills appear on the CV.`,
    `${missing.length} target-role skill(s) are not named on the CV.`,
  ];
  if (cv.skillsList.length > 0) {
    evidence.push(`The CV lists ${cv.skillsList.length} skills in total.`);
  } else {
    evidence.push('The CV has no dedicated skills list.');
  }

  return {
    key: 'skills',
    score,
    available: true,
    summary: 'Target-role skills that are explicitly present on the CV.',
    evidence,
  };
}

function experienceDimension(ctx: AnalysisContext): CvDimension {
  const { cv, input, bullets } = ctx;
  const evidence: string[] = [];
  const target = input.targetRoleTitle;

  if (cv.experiences.length === 0) {
    const projectRelevance =
      cv.projects.length > 0
        ? Math.round(
            Math.max(
              ...cv.projects.map((project) =>
                Math.max(
                  tokenOverlap(`${project.title} ${project.role} ${project.description ?? ''} ${project.bullets.join(' ')}`, target),
                  tokenOverlap(project.technologies.join(' '), target)
                )
              )
            ) * 100
          )
        : 0;
    const score = clamp(15 + projectRelevance * 0.35);
    evidence.push('No employment history is present.');
    if (cv.projects.length > 0) {
      evidence.push(`${cv.projects.length} project(s) provide the practical evidence.`);
    }
    return {
      key: 'experience',
      score,
      available: true,
      summary: 'Relevant experience, responsibilities and measurable outcomes.',
      evidence,
    };
  }

  const roleRelevance =
    cv.experiences.reduce((best, entry) => {
      const overlap = tokenOverlap(
        `${entry.role} ${entry.company} ${entry.description ?? ''} ${entry.bullets.join(' ')}`,
        target
      );
      return Math.max(best, overlap);
    }, 0) * 100;

  const achievementBullets = bullets.filter((bullet) => hasMetric(bullet) || startsWithActionVerb(bullet)).length;
  const achievementRatio = bullets.length > 0 ? achievementBullets / bullets.length : 0;

  const score = 25 + roleRelevance * 0.45 + achievementRatio * 30;
  evidence.push(`${cv.experiences.length} role(s) are recorded.`);
  evidence.push(`The closest role overlaps ${Math.round(roleRelevance)}% with the target title.`);
  evidence.push(`${achievementBullets} of ${bullets.length} bullets describe an outcome.`);
  if (ctx.yearsExperience > 0) {
    evidence.push(`The dated roles span about ${ctx.yearsExperience} year(s).`);
  }

  return {
    key: 'experience',
    score: clamp(score),
    available: true,
    summary: 'Relevance of the roles, responsibilities and outcomes to the target.',
    evidence,
  };
}

function marketDimension(ctx: AnalysisContext): CvDimension & { match: AtsMatchReport | null } {
  const jobDescription = (ctx.input.jobDescription ?? '').trim();
  if (jobDescription.length < 20) {
    return {
      key: 'egyptMarketFit',
      score: null,
      available: false,
      summary: 'No live market evidence was supplied for this analysis.',
      evidence: [
        'Egyptian market fit is only scored from a specific job description the candidate provides.',
        'No job-post volume is claimed or implied.',
      ],
      match: null,
    };
  }

  const analysis = extractDeterministicJobDescription(jobDescription);
  const facts: AtsProfileFacts = {
    skills: ctx.skillNames.map((name) => ({ name, level: 3 })),
    sources: [
      // The headline and the summary are the parts of the CV the employer reads
      // first, so they are evidence for a requirement exactly as much as a
      // dated role is.
      {
        label: 'CV headline and summary',
        text: [ctx.cv.title, ctx.cv.summary].filter(Boolean).join(' '),
      },
      ...ctx.cv.experiences.map((entry) => ({
        label: `${entry.role} at ${entry.company}`,
        text: [entry.description ?? '', ...entry.bullets].filter(Boolean).join(' '),
      })),
      ...ctx.cv.projects.map((entry) => ({
        label: entry.title,
        text: [entry.description ?? '', ...entry.bullets, ...entry.technologies].filter(Boolean).join(' '),
      })),
      ...ctx.cv.education.map((entry) => ({
        label: `${entry.degree} ${entry.field}`,
        text: [entry.institution, entry.field, entry.degree].filter(Boolean).join(' '),
      })),
    ],
  };
  const match = buildAtsMatchReport(analysis, facts);

  return {
    key: 'egyptMarketFit',
    score: match.score,
    available: true,
    summary: 'Overlap with the specific job description supplied, not a market-wide claim.',
    evidence: [
      match.explanation,
      `${match.matched.length} requirement(s) matched; ${match.missing.length} missing.`,
    ],
    match,
  };
}

function overallScore(dimensions: CvDimension[]): number {
  const weights: Record<CvDimensionKey, number> = {
    clarity: 0.18,
    impact: 0.2,
    ats: 0.2,
    skills: 0.2,
    experience: 0.17,
    egyptMarketFit: 0.05,
  };
  const available = dimensions.filter(
    (dimension): dimension is CvDimension & { score: number } =>
      dimension.available && dimension.score !== null
  );
  if (available.length === 0) return 0;
  const totalWeight = available.reduce((total, dimension) => total + weights[dimension.key], 0);
  const weighted = available.reduce(
    (total, dimension) => total + dimension.score * weights[dimension.key],
    0
  );
  return clamp(weighted / totalWeight);
}

function buildStrengths(dimensions: CvDimension[], skills: CvAnalysisReport['skills']): string[] {
  const strengths: string[] = [];
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  if ((byKey.get('clarity')?.score ?? 0) >= 70) {
    strengths.push('The document is easy to read: it has a headline, a summary and complete contact details.');
  }
  if ((byKey.get('impact')?.score ?? 0) >= 60) {
    strengths.push('Several bullets describe measurable results rather than duties.');
  }
  if ((byKey.get('ats')?.score ?? 0) >= 80) {
    strengths.push('The section structure is parser-friendly and the contact details are complete.');
  }
  if ((byKey.get('skills')?.score ?? 0) >= 60) {
    strengths.push(`The CV shows ${skills.present.length} of the ${skills.relevant.length} target-role skills.`);
  }
  if ((byKey.get('experience')?.score ?? 0) >= 65) {
    strengths.push('The experience section is relevant to the target role.');
  }
  if (strengths.length === 0) {
    strengths.push('The CV provides at least one usable section for an application.');
  }
  return strengths.slice(0, 4);
}

function buildWeaknesses(dimensions: CvDimension[], skills: CvAnalysisReport['skills']): string[] {
  const weaknesses: string[] = [];
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  if ((byKey.get('impact')?.score ?? 0) < 60) {
    weaknesses.push('Too few bullets show a measurable result; most read as responsibilities.');
  }
  if ((byKey.get('ats')?.score ?? 0) < 70) {
    weaknesses.push('The document is missing structure or contact details that an ATS expects.');
  }
  if ((byKey.get('skills')?.available ?? false) && (byKey.get('skills')?.score ?? 0) < 60) {
    weaknesses.push(`The CV does not show ${skills.missing.length} of the skills the target role asks for.`);
  }
  if ((byKey.get('experience')?.score ?? 0) < 55) {
    weaknesses.push('The recorded experience is not clearly aligned with the target role.');
  }
  if ((byKey.get('clarity')?.score ?? 0) < 60) {
    weaknesses.push('The summary or the section structure needs work before the CV is easy to scan.');
  }
  if (weaknesses.length === 0) {
    weaknesses.push('No critical structural weakness was measured; improve the evidence and tailoring next.');
  }
  return weaknesses.slice(0, 4);
}

function buildNeedsEvidence(ctx: AnalysisContext, missing: string[]): string[] {
  const needs: string[] = [];
  for (const skill of missing.slice(0, 6)) {
    const mentioned = tokenOverlap(ctx.allText, skill) > 0;
    if (!mentioned) needs.push(skill);
  }
  return needs;
}

function buildActionPlan(input: {
  dimensions: CvDimension[];
  findings: CvAtsFinding[];
  skills: CvAnalysisReport['skills'];
  cv: CvAnalysisDocument;
  targetRoleTitle: string;
}): CvActionItem[] {
  const items: CvActionItem[] = [];
  const byKey = new Map(input.dimensions.map((dimension) => [dimension.key, dimension]));

  const impact = byKey.get('impact');
  if ((impact?.score ?? 0) < 65) {
    items.push({
      id: 'quantify_bullets',
      priority: 'now',
      title: 'Add a measurable result to your strongest bullets',
      why: 'Recruiters scan for outcomes, and an ATS ranks quantified achievements above duties.',
      how: 'For two or three bullets, add the scale or result you can verify: time saved, users reached, percentage improved, or budget managed.',
    });
  }

  const atsFailures = input.findings.filter((finding) => finding.status === 'fail');
  if (atsFailures.length > 0) {
    items.push({
      id: 'fix_ats_blockers',
      priority: 'now',
      title: 'Fix the parsing blockers first',
      why: 'A missing contact detail or section can keep the CV out of the shortlist before a person reads it.',
      how: atsFailures.map((finding) => finding.detail).join(' '),
    });
  }

  if (input.skills.missing.length > 0) {
    items.push({
      id: 'close_skill_gaps',
      priority: 'next',
      title: `Show the missing ${input.targetRoleTitle} skills you actually have`,
      why: 'The role asks for these skills and the CV does not currently name them.',
      how:
        input.skills.needsEvidence.length > 0
          ? `Add evidence for ${input.skills.needsEvidence.slice(0, 4).join(', ')} only where you have real experience. For the rest, plan a project or course before claiming them.`
          : 'Add the skills to the relevant role or project bullets, with the work that proves each one.',
    });
  }

  if (input.cv.experiences.length === 0) {
    items.push({
      id: 'build_experience_evidence',
      priority: 'next',
      title: 'Use projects, volunteering or internships as experience evidence',
      why: 'With no employment history, practical evidence is what makes the CV credible.',
      how: 'Turn one project into a short entry: the problem, what you built, the tools, and the result.',
    });
  }

  if (words(input.cv.summary).length < 25) {
    items.push({
      id: 'strengthen_summary',
      priority: 'next',
      title: 'Write a role-specific summary',
      why: 'The summary is the first evidence a recruiter reads and the context an ATS uses for the role.',
      how: `In two or three sentences, name the role (${input.targetRoleTitle}), your strongest proof, and the value you bring.`,
    });
  }

  items.push({
    id: 'tailor_per_application',
    priority: 'later',
    title: 'Tailor this CV for each application',
    why: 'A general CV scores lower against a specific advertisement than a tailored one.',
    how: 'Paste the advertisement into the Job Description tab and apply only the changes that remain true to your experience.',
  });

  return items.slice(0, 6);
}

function buildSummary(
  score: number,
  band: CvScoreBand,
  dimensions: CvDimension[],
  targetRoleTitle: string
): string {
  const available = dimensions.filter((dimension) => dimension.available).length;
  const strongest = [...dimensions]
    .filter((dimension): dimension is CvDimension & { score: number } => dimension.score !== null)
    .sort((a, b) => b.score - a.score)[0];
  const strongestLine = strongest
    ? ` The strongest measured area is ${strongest.key === 'egyptMarketFit' ? 'job-description fit' : strongest.key}.`
    : '';
  return `This CV scores ${score}/100 for ${targetRoleTitle} (${band.replace('_', ' ')}), measured across ${available} dimension${available === 1 ? '' : 's'} of the document.${strongestLine} The score reflects the evidence present in the CV, not an estimate of your ability.`;
}

/**
 * Runs the analysis as an explicit, ordered pipeline.
 *
 * Each `next()` performs the real work for one stage and yields that stage's
 * event. The final return value is the report. The server streams the events;
 * tests consume the same generator, so the tested order is the shipped order.
 */
export function* runCvAnalysisPipeline(
  input: CvAnalysisInput,
  now: number = Date.now()
): Generator<CvAnalysisStageEvent, CvAnalysisReport | null, void> {
  const at = () => new Date(now).toISOString();
  const emit = (
    stage: CvAnalysisStageId,
    status: CvAnalysisStageStatus,
    summary: string
  ): CvAnalysisStageEvent => ({ stage, status, summary, at: at() });

  // 1. Read the structure. A document with no identity and no content cannot
  //    be scored, and saying so is better than returning a number.
  yield emit('reading_structure', 'active', 'Checking the document structure.');
  if (!hasText(input.cv.fullName) && !hasText(input.cv.email) && !hasText(input.cv.summary)) {
    yield emit('reading_structure', 'failed', 'The document has no name, contact details or summary to read.');
    return null;
  }
  const sectionCount = [
    hasText(input.cv.title),
    hasText(input.cv.summary),
    input.cv.experiences.length > 0,
    input.cv.education.length > 0,
    input.cv.skillsList.length > 0,
    input.cv.projects.length > 0,
    input.cv.certifications.length > 0,
  ].filter(Boolean).length;
  yield emit('reading_structure', 'completed', `${sectionCount} of 7 expected sections are present.`);

  // 2. Extract the evidence the later stages use.
  yield emit('extracting_information', 'active', 'Counting the evidence in the document.');
  const ctx = buildContext(input);
  yield emit(
    'extracting_information',
    'completed',
    `${ctx.cv.experiences.length} role(s), ${ctx.cv.projects.length} project(s), ${ctx.bullets.length} bullet(s) and ${ctx.skillNames.length} skill(s) were read.`
  );

  // 3. Skills.
  yield emit('evaluating_skills', 'active', 'Comparing the CV skills with the target role.');
  const skills = skillsDimension(ctx);
  const relevant = ctx.expectedSkills.filter((skill) => includesSkill(ctx.skillNames, skill));
  const missing = ctx.expectedSkills.filter((skill) => !includesSkill(ctx.skillNames, skill));
  yield emit(
    'evaluating_skills',
    'completed',
    ctx.expectedSkills.length > 0
      ? `${relevant.length} of ${ctx.expectedSkills.length} target-role skills were found.`
      : 'No target-role skill set was supplied; this dimension is unavailable.'
  );

  // 4. ATS.
  yield emit('ats_compatibility', 'active', 'Checking the structure a parser needs.');
  const ats = atsDimension(ctx);
  yield emit(
    'ats_compatibility',
    'completed',
    `${ats.findings.filter((finding) => finding.status === 'pass').length} structure checks passed, ${ats.findings.filter((finding) => finding.status !== 'pass').length} need attention.`
  );

  // 5. Target relevance.
  yield emit('target_relevance', 'active', 'Measuring relevance to the target role.');
  const experience = experienceDimension(ctx);
  yield emit('target_relevance', 'completed', experience.summary);

  // 6. Egyptian market: only from supplied job evidence.
  yield emit('egypt_market', 'active', 'Checking the job evidence that was supplied.');
  const market = marketDimension(ctx);
  yield emit('egypt_market', 'completed', market.summary);

  // 7. Gaps.
  yield emit('skill_gaps', 'active', 'Listing the gaps the CV does not cover.');
  const needsEvidence = buildNeedsEvidence(ctx, missing);
  yield emit(
    'skill_gaps',
    'completed',
    missing.length > 0
      ? `${missing.length} target-role skill(s) are not shown on the CV.`
      : 'No target-role skill gap was found.'
  );

  // 8. Recommendations.
  yield emit('recommendations', 'active', 'Turning the findings into an action plan.');
  const dimensions: CvDimension[] = [
    clarityDimension(ctx),
    impactDimension(ctx),
    {
      key: 'ats',
      score: ats.score,
      available: ats.available,
      summary: ats.summary,
      evidence: ats.evidence,
    },
    skills,
    experience,
    {
      key: 'egyptMarketFit',
      score: market.score,
      available: market.available,
      summary: market.summary,
      evidence: market.evidence,
    },
  ];
  const actionPlan = buildActionPlan({
    dimensions,
    findings: ats.findings,
    skills: { present: relevant, relevant: ctx.expectedSkills, missing, needsEvidence },
    cv: ctx.cv,
    targetRoleTitle: input.targetRoleTitle,
  });
  const strengths = buildStrengths(dimensions, {
    present: relevant,
    relevant: ctx.expectedSkills,
    missing,
    needsEvidence,
  });
  const weaknesses = buildWeaknesses(dimensions, {
    present: relevant,
    relevant: ctx.expectedSkills,
    missing,
    needsEvidence,
  });
  yield emit(
    'recommendations',
    'completed',
    `${actionPlan.length} prioritised recommendation(s) were produced from the measured findings.`
  );

  // 9. Final report.
  yield emit('final_report', 'active', 'Combining the measured dimensions.');
  const score = overallScore(dimensions);
  const band = scoreBand(score);
  const report: CvAnalysisReport = {
    schemaVersion: 1,
    generatedAt: at(),
    targetRoleTitle: input.targetRoleTitle,
    overallScore: score,
    band,
    summary: buildSummary(score, band, dimensions, input.targetRoleTitle),
    dimensions,
    strengths,
    weaknesses,
    ats: { score: ats.score ?? 0, findings: ats.findings },
    skills: {
      present: relevant,
      relevant: ctx.expectedSkills,
      missing,
      needsEvidence,
    },
    experience: {
      score: experience.score ?? 0,
      findings: experience.evidence,
    },
    marketFit: {
      score: market.score,
      source: market.match ? 'job_description' : 'none',
      evidence: market.evidence,
      note: market.summary,
      match: market.match,
    },
    actionPlan,
  };
  yield emit('final_report', 'completed', `Final score: ${score}/100 (${band.replace('_', ' ')}).`);
  return report;
}

/** Convenience wrapper for tests and non-streaming callers. */
export function analyzeCv(input: CvAnalysisInput, now: number = Date.now()): CvAnalysisReport | null {
  const pipeline = runCvAnalysisPipeline(input, now);
  let step = pipeline.next();
  while (!step.done) step = pipeline.next();
  return step.value;
}

/**
 * Maps the measured report onto the legacy ATS shape the existing studio and
 * database already understand. The overall score is the measured one; nothing
 * here is model-asserted.
 */
export interface LegacyAtsAnalysis {
  overallScore: number;
  breakdown: {
    keywordsMatch: number;
    impactAndMetrics: number;
    formattingStructure: number;
    experienceRelevance: number;
  };
  matchedKeywords: string[];
  missingKeywords: string[];
  actionableImprovements: {
    section: string;
    currentText?: string;
    suggestedText: string;
    reason: string;
  }[];
}

export function toLegacyAtsAnalysis(report: CvAnalysisReport): LegacyAtsAnalysis {
  const byKey = new Map(report.dimensions.map((dimension) => [dimension.key, dimension.score ?? 0]));
  return {
    overallScore: report.overallScore,
    breakdown: {
      keywordsMatch: byKey.get('skills') ?? 0,
      impactAndMetrics: byKey.get('impact') ?? 0,
      formattingStructure: byKey.get('ats') ?? 0,
      experienceRelevance: byKey.get('experience') ?? 0,
    },
    matchedKeywords: report.skills.present,
    missingKeywords: report.skills.missing,
    actionableImprovements: report.actionPlan.map((item) => ({
      section: item.priority === 'now' ? 'Now' : item.priority === 'next' ? 'Next' : 'Later',
      suggestedText: item.how,
      reason: item.why,
    })),
  };
}

/** The number of days a report is considered fresh on the dashboard. */
export const CV_ANALYSIS_FRESH_DAYS = 30;

export function isCvAnalysisFresh(report: CvAnalysisReport, now: number): boolean {
  const generated = Date.parse(report.generatedAt);
  if (!Number.isFinite(generated)) return false;
  return now - generated < CV_ANALYSIS_FRESH_DAYS * DAY_MS;
}
