/**
 * The metrics dictionary.
 *
 * WHY THIS MODULE EXISTS
 * The QA audit found the same candidate being told two different readiness
 * figures on two different pages, and both of them were "correct" by their
 * own definition: the Dashboard measured the skills a candidate had rated,
 * the Skills Centre measured the whole role requirement set, and neither
 * asked whether the levels were claimed or proven.
 *
 * This module is the single definition of the numbers the product shows. It
 * has no dependencies of its own, so the browser, the server and the tests
 * all read the same table and cannot drift apart.
 *
 * THE ONE DEFINITION OF ROLE READINESS
 *   A candidate's readiness against a role is:
 *     (their proven level against the role's bar) x (their CV readiness)
 *
 *   Three rules make the figure mean something:
 *     1. Only REQUIRED skills count. A preference is not a requirement.
 *     2. A level counts for less than its full value until something backs
 *        it. A self-reported level is a claim (65%), an assessment is a
 *        measurement (85%), a piece of evidence is proof (100%).
 *     3. The CV contributes up to 20%. A candidate with no CV for the role
 *        cannot reach 100% readiness, however good their skills are.
 *
 * WHY THE NUMBERS ARE WHAT THEY ARE
 * The proof weights are deliberately below 100% for an unbacked level. The
 * gap between "you say you are a 5" and "the platform can show a 5" is the
 * whole point of the product: the first is a claim, the second is a career.
 */

import { isAtsAnalysisForRole } from './atsAnalysis.ts';

/* -------------------------------------------------------------------------- */
/* Proof                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How much of a level counts towards readiness before anything backs it.
 *
 * `none` is a claim the candidate made themselves. `assessment` is a
 * measurement the platform took. `evidence` is proof: a finished project, a
 * certificate, a piece of work.
 */
export type SkillProof = 'none' | 'assessment' | 'evidence';

export const READINESS_PROOF_WEIGHTS: Record<SkillProof, number> = {
  none: 0.65,
  assessment: 0.85,
  evidence: 1,
};

/**
 * The share of readiness the CV can contribute.
 *
 * The rest comes from the skills, so a strong CV cannot carry a candidate to
 * 100% on its own, and a missing CV cannot hide a strong skill set.
 */
export const READINESS_CV_WEIGHT = 0.2;

/** Missing or malformed CV scores are zero; valid scores stay within 0..100. */
export function normalizeCvReadinessPct(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalizeSkillProof(value: unknown): SkillProof {
  return value === 'assessment' || value === 'evidence' ? value : 'none';
}

/* -------------------------------------------------------------------------- */
/* The readiness calculation                                                    */
/* -------------------------------------------------------------------------- */

export interface ReadinessSkill {
  name: string;
  /** The level the platform can stand behind. */
  currentLevel: number;
  /** The level the role asks for. */
  targetLevel: number;
  /** Whether the role requires it (a preference does not count). */
  required: boolean;
  /** What backs the level. */
  proof?: SkillProof | null;
}

export interface ReadinessBreakdown {
  /** The share of the role's bar the candidate reaches on skills alone. */
  skillFactorPct: number;
  /** The CV's ATS score for the role, or zero when there is none. */
  cvFactorPct: number;
  /** How many required skills are met, proved. */
  proved: number;
  /** How many required skills are met, measured by an assessment. */
  measured: number;
  /** How many required skills are met on the candidate's own claim alone. */
  claimed: number;
  /** How many required skills are not met at all. */
  unmet: number;
  /** The required skills considered. */
  total: number;
}

export interface RoleReadiness {
  /** The readiness figure, 0..100. */
  pct: number;
  breakdown: ReadinessBreakdown;
}

/**
 * The role readiness figure and the factors behind it.
 *
 * A missing proof is treated as no proof: a level nothing backs is a claim,
 * and a claim is worth less than a measurement.
 */
export function computeRoleReadiness(
  skills: readonly ReadinessSkill[],
  cvReadinessPct: unknown = 0
): RoleReadiness {
  const required = skills.filter((skill) => skill.required && skill.targetLevel > 0);

  let met = 0;
  let possible = 0;
  let proved = 0;
  let measured = 0;
  let claimed = 0;
  let unmet = 0;

  for (const skill of required) {
    const target = Math.max(0, skill.targetLevel);
    const current = Math.max(0, skill.currentLevel);
    const proof = normalizeSkillProof(skill.proof);

    met += Math.min(current, target) * READINESS_PROOF_WEIGHTS[proof];
    possible += target;

    if (current >= target) {
      if (proof === 'evidence') proved += 1;
      else if (proof === 'assessment') measured += 1;
      else claimed += 1;
    } else {
      unmet += 1;
    }
  }

  const skillFactorPct = possible > 0 ? (met / possible) * 100 : 0;
  const cvFactorPct = normalizeCvReadinessPct(cvReadinessPct);
  const cvMultiplier = 1 - READINESS_CV_WEIGHT + (READINESS_CV_WEIGHT * cvFactorPct) / 100;

  return {
    pct: possible > 0 ? Math.round(skillFactorPct * cvMultiplier) : 0,
    breakdown: {
      skillFactorPct: Math.round(skillFactorPct),
      cvFactorPct: Math.round(cvFactorPct),
      proved,
      measured,
      claimed,
      unmet,
      total: required.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The CV's part                                                                */
/* -------------------------------------------------------------------------- */

export interface CvReadinessVersion {
  targetRoleTitle?: string | null;
  atsAnalysis?: { overallScore?: number | null } | null;
}

/**
 * The ATS score of the candidate's CV for the role they are aiming at.
 *
 * Only the CV written for the active role counts. A CV for another role is
 * no evidence about this one, and a candidate with no CV at all scores zero
 * rather than a free pass.
 */
export function cvReadinessFromVersions(
  versions: readonly CvReadinessVersion[] | null | undefined,
  targetRoleTitle: string | null | undefined
): number {
  if (!Array.isArray(versions) || !targetRoleTitle?.trim()) return 0;
  // The API returns versions newest first. Select the newest version written
  // for this target role even when its analysis is missing: an older analysis
  // must not silently make a newer, unevaluated CV look ready.
  const matching = versions.find(
    (version) => version && isAtsAnalysisForRole(version.targetRoleTitle ?? '', targetRoleTitle)
  );
  return normalizeCvReadinessPct(matching?.atsAnalysis?.overallScore);
}

/* -------------------------------------------------------------------------- */
/* The dictionary                                                              */
/* -------------------------------------------------------------------------- */

export type MetricId =
  | 'roleReadiness'
  | 'skillMastery'
  | 'verifiedSkills'
  | 'roadmapProgress'
  | 'careerJourney'
  | 'interviewReadiness'
  | 'profileCompleteness';

export interface MetricDefinition {
  id: MetricId;
  /** What the metric measures, in one sentence. */
  definition: string;
  /** What the candidate can do about it. */
  action: string;
}

/**
 * The seven metrics, and what each one means.
 *
 * Every page that shows a career number reads its definition from here, so
 * the wording can never drift between the Dashboard and the Progress page.
 */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    id: 'roleReadiness',
    definition:
      'How much of the target role’s requirement bar you reach, counting only what is proven, measured or claimed — never more than you can show.',
    action: 'Assess a skill or attach evidence to move the number.',
  },
  {
    id: 'skillMastery',
    definition: 'How many of the role’s skills you meet at the level it asks for.',
    action: 'Close the open gaps below to raise it.',
  },
  {
    id: 'verifiedSkills',
    definition: 'How many skills the platform can back with a project, a course or an assessment.',
    action: 'Submit evidence for a skill to verify it.',
  },
  {
    id: 'roadmapProgress',
    definition: 'How much of your roadmap you have finished, as completed steps over total steps.',
    action: 'Complete the next unfinished step.',
  },
  {
    id: 'careerJourney',
    definition: 'Your progress across the five stages: profile, assessment, learning, projects and applying.',
    action: 'Keep the next stage moving.',
  },
  {
    id: 'interviewReadiness',
    definition: 'How ready you are to interview, from your answers and their scores.',
    action: 'Practise the questions you score lowest on.',
  },
  {
    id: 'profileCompleteness',
    definition: 'How much of your profile an employer can actually read.',
    action: 'Fill the empty profile fields.',
  },
] as const;

export interface MetricsDictionaryEntry {
  id: MetricId;
  /** The figure itself. */
  value: number;
  /** The units the figure is in. */
  unit: 'percent' | 'count';
  definition: string;
  action: string;
}

/**
 * The metrics, assembled from the facts the engines already produced.
 *
 * The dictionary does not calculate anything: it holds the figures the
 * engines computed and the wording that explains them, so no page invents a
 * second number for the same thing.
 */
export function buildMetricsDictionary(facts: {
  roleReadiness: number;
  skillMastery: { met: number; total: number };
  verifiedSkills: number;
  roadmapProgress: { completed: number; total: number };
  careerJourney: number;
  interviewReadiness: number;
  profileCompleteness: number;
}): MetricsDictionaryEntry[] {
  const definitionFor = (id: MetricId): MetricDefinition => {
    const found = METRIC_DEFINITIONS.find((entry) => entry.id === id);
    if (!found) throw new Error(`Unknown metric: ${id}`);
    return found;
  };
  const entry = (id: MetricId, value: number, unit: 'percent' | 'count'): MetricsDictionaryEntry => {
    const definition = definitionFor(id);
    return { id, value, unit, definition: definition.definition, action: definition.action };
  };

  return [
    entry('roleReadiness', facts.roleReadiness, 'percent'),
    entry('skillMastery', facts.skillMastery.met, 'count'),
    entry('verifiedSkills', facts.verifiedSkills, 'count'),
    entry('roadmapProgress', facts.roadmapProgress.completed, 'count'),
    entry('careerJourney', facts.careerJourney, 'percent'),
    entry('interviewReadiness', facts.interviewReadiness, 'percent'),
    entry('profileCompleteness', facts.profileCompleteness, 'percent'),
  ];
}
