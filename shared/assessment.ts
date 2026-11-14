/**
 * The rules behind a diagnostic skill check.
 *
 * WHY THIS MODULE EXISTS
 * A candidate took the Python check, scored 100%, and the platform showed
 * "Python: 100% (Level 5)" on one screen and "Python for Data Analysis: 4/5"
 * on another, with nothing anywhere explaining either number. The
 * "Recent Assessment Attempts" list showed Python and nothing else, even
 * though other skills carried assessed levels, so the candidate could not
 * tell which of their levels were measured and which were guesses.
 *
 * Three promises fix that, and they live here so no screen can implement
 * them differently:
 *
 *   1. A diagnostic check is a knowledge check, not a certification. It
 *      measures what the candidate knows, so it is capped at 4/5. Reaching
 *      5/5 — "Verified Mastery" — needs practical proof: a project, a
 *      certificate, or work experience.
 *
 *   2. Every level the candidate holds says where it came from. "4/5" on its
 *      own is a claim; "4/5 — Direct Assessment" is a measurement.
 *
 *   3. A check that tests general fundamentals does not silently become a
 *      role-specialised skill. The mapping is explicit and is shown to the
 *      candidate before they start.
 */

/* -------------------------------------------------------------------------- */
/* The rubric                                                                  */
/* -------------------------------------------------------------------------- */

/** One band of the scoring rubric. */
export interface RubricBand {
  /** The level this band produces. */
  level: number;
  /** The lowest percentage that lands in this band. */
  from: number;
  /** The name of the band, as the candidate reads it. */
  label: string;
  /** What the band means. */
  description: string;
}

/**
 * The scoring rubric, in full.
 *
 * The bands are published before and after every check, so a level never
 * arrives without its arithmetic.
 */
export const ASSESSMENT_RUBRIC: readonly RubricBand[] = [
  {
    level: 5,
    from: 90,
    label: 'Verified Mastery',
    description:
      'Practical proof required. A diagnostic check alone cannot reach this level — a verified project, certificate or work experience is needed.',
  },
  {
    level: 4,
    from: 80,
    label: 'Advanced Knowledge',
    description:
      'Strong conceptual and scenario understanding. This is the ceiling a multiple-choice diagnostic check can reach.',
  },
  {
    level: 3,
    from: 60,
    label: 'Working Knowledge',
    description: 'Solid grasp of the fundamentals, with gaps in the harder scenarios.',
  },
  {
    level: 2,
    from: 40,
    label: 'Developing Knowledge',
    description: 'Some familiarity, with the core ideas still forming.',
  },
  {
    level: 1,
    from: 0,
    label: 'Foundational Awareness',
    description: 'Early exposure. The starting point the learning plan builds on.',
  },
];

/** The level a diagnostic check alone can reach. */
export const DIAGNOSTIC_CEILING = 4;

/** The level a candidate reaches with practical proof. */
export const VERIFIED_MASTERY_LEVEL = 5;

/**
 * The headline that explains what a diagnostic check is.
 */
export const ASSESSMENT_RUBRIC_HEADLINE =
  'Diagnostic Knowledge Check — not a professional certification.';

/**
 * The sentence that explains the ceiling.
 */
export const ASSESSMENT_RUBRIC_RULE =
  'A multiple-choice knowledge check measures what you know, so it stops at 4/5 (Advanced Knowledge). Level 5 (Verified Mastery) needs practical proof: a verified project, a certificate, or work experience.';

/**
 * The explanation of a level, as a template.
 *
 * The placeholders let the Arabic catalogue carry the sentence itself rather
 * than a translated fragment with English words inside it.
 */
export const ASSESSMENT_LEVEL_EXPLANATION =
  '{level}/5 — {label}. A diagnostic check stops at {ceiling}/5; level {mastery} needs practical proof.';
export const ASSESSMENT_LEVEL_EXPLANATION_WITH_EVIDENCE =
  '{level}/5 — {label}. Your practical evidence unlocks the top level.';

/**
 * Turns a score into a level.
 *
 * The same rule everywhere: the score decides the band, and the practical
 * proof decides whether the top band is available at all.
 */
export function levelForAssessmentScore(
  percentage: number,
  practicalBacked = false
): number {
  if (!Number.isFinite(percentage)) return 1;
  if (practicalBacked && percentage >= 90) return VERIFIED_MASTERY_LEVEL;
  if (percentage >= 80) return 4;
  if (percentage >= 60) return 3;
  if (percentage >= 40) return 2;
  return 1;
}

/**
 * The band a score falls into.
 */
export function rubricBandFor(percentage: number): RubricBand {
  const level = levelForAssessmentScore(percentage, false);
  return (
    ASSESSMENT_RUBRIC.find((band) => band.level === level) ??
    ASSESSMENT_RUBRIC[ASSESSMENT_RUBRIC.length - 1]
  );
}

/**
 * Why the level is what it is.
 *
 * The returned string carries placeholders, so the caller can put it through
 * the translator and get a sentence in the candidate's own language.
 */
export function explainAssessmentLevel(
  percentage: number,
  practicalBacked: boolean
): string {
  return practicalBacked && percentage >= 90
    ? ASSESSMENT_LEVEL_EXPLANATION_WITH_EVIDENCE
    : ASSESSMENT_LEVEL_EXPLANATION;
}

/**
 * The values that fill the level explanation's placeholders.
 */
export function assessmentLevelExplanationValues(
  percentage: number,
  practicalBacked: boolean
): { level: string; label: string; ceiling: string; mastery: string } {
  const band = rubricBandFor(percentage);
  return {
    level: String(levelForAssessmentScore(percentage, practicalBacked)),
    label: band.label,
    ceiling: String(DIAGNOSTIC_CEILING),
    mastery: String(VERIFIED_MASTERY_LEVEL),
  };
}

/* -------------------------------------------------------------------------- */
/* Which skill a check actually tests                                           */
/* -------------------------------------------------------------------------- */

/** What a check is about. */
export type AssessmentScope = 'general_fundamentals' | 'role_specialized';

/** How the scope is named to the candidate. */
export const ASSESSMENT_SCOPE_LABELS: Record<AssessmentScope, string> = {
  general_fundamentals: 'General Fundamentals',
  role_specialized: 'Role-Specialised Skill',
};

/**
 * The words that make a skill name role-specialised.
 *
 * "Python for Data Analysis" is not "Python". The difference matters: a
 * candidate who passed a general Python check has not demonstrated the
 * data-analysis part of it.
 */
const ROLE_SPECIALISED_MARKERS = [
  'for ',
  'in ',
  'with ',
  ' for data',
  'advanced ',
  'expert ',
  'specialised',
  'specialized',
];

/**
 * Decides what a check tests.
 *
 * The rule is written on the skill's own name, so the answer is the same
 * everywhere and can be shown before the candidate starts.
 */
export function assessmentScope(skillName: string): AssessmentScope {
  const normalized = skillName.trim().toLowerCase();
  if (!normalized) return 'general_fundamentals';
  return ROLE_SPECIALISED_MARKERS.some((marker) => normalized.includes(marker))
    ? 'role_specialized'
    : 'general_fundamentals';
}

/**
 * The mapping rule, in words.
 *
 * A general check informs the general skill. It does not, on its own, move
 * a role-specialised skill: that needs practical proof of the specialised
 * part.
 */
export const ASSESSMENT_MAPPING_RULE =
  'A general fundamentals check sets the level of the general skill. A role-specialised skill (for example “Python for Data Analysis”) keeps its own level until practical evidence proves the specialised part — a check of the general skill never raises it on its own.';

/**
 * The sentences that tell the candidate what a check of this skill means.
 *
 * They carry a `{skill}` placeholder so the catalogue can hold them in the
 * candidate's own language.
 */
export const ASSESSMENT_SCOPE_GENERAL =
  'This check tests general fundamentals ({skill}). It sets the level of the general skill only — a role-specialised skill built on it needs practical proof of its own.';
export const ASSESSMENT_SCOPE_ROLE_SPECIALISED =
  'This check tests a role-specialised skill ({skill}). It sets that skill’s level directly, and it is the check that unlocks the top level.';

/**
 * The sentence that tells the candidate what a check of this skill means.
 */
export function assessmentScopeSentence(skillName: string): string {
  return assessmentScope(skillName) === 'role_specialized'
    ? ASSESSMENT_SCOPE_ROLE_SPECIALISED
    : ASSESSMENT_SCOPE_GENERAL;
}

/* -------------------------------------------------------------------------- */
/* Where a level came from                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The sources a skill level can come from, as the Skills Center shows them.
 *
 * A level with no source badge is a claim the candidate made and the
 * platform cannot defend.
 */
export const SKILL_LEVEL_SOURCES = [
  'direct_assessment',
  'self_reported',
  'ai_estimated_from_cv',
  'project_evidence',
  'course_completed',
  'certificate',
  'work_experience',
] as const;

export type SkillLevelSource = (typeof SKILL_LEVEL_SOURCES)[number];

/** The badge text for each source. */
export const SKILL_LEVEL_SOURCE_LABELS: Record<SkillLevelSource, string> = {
  direct_assessment: 'Direct Assessment',
  self_reported: 'Self-Reported',
  ai_estimated_from_cv: 'AI-Estimated from CV',
  project_evidence: 'Project Evidence',
  course_completed: 'Course Completed',
  certificate: 'Certificate',
  work_experience: 'Work Experience',
};

/** How much the source can be trusted. */
export const SKILL_LEVEL_SOURCE_TONES: Record<
  SkillLevelSource,
  'claim' | 'measured' | 'proof'
> = {
  direct_assessment: 'measured',
  self_reported: 'claim',
  ai_estimated_from_cv: 'claim',
  project_evidence: 'proof',
  course_completed: 'proof',
  certificate: 'proof',
  work_experience: 'proof',
};

/**
 * One completed diagnostic check.
 *
 * Every completed check is kept — not only the last one, and not only the
 * ones for the skill the candidate happened to look at.
 */
export interface AssessmentAttempt {
  id: string;
  /** The skill the check tested. */
  skill: string;
  /** The name of the check, as the candidate saw it. */
  categoryTitle: string;
  /** How many questions were right. */
  score: number;
  /** How many questions there were. */
  total: number;
  /** The score as a percentage. */
  percentage: number;
  /** The level the score produced. */
  level: number;
  /** When the check was completed. */
  completedAt: string;
  /** Whether the candidate already held practical proof for this skill. */
  practicalBacked: boolean;
  /** What the check tested. */
  scope: AssessmentScope;
}

/**
 * The one-line summary of an attempt.
 */
export function describeAttempt(attempt: AssessmentAttempt): string {
  const band = rubricBandFor(attempt.percentage);
  return `${attempt.skill} — ${attempt.score}/${attempt.total} (${attempt.percentage}%) → ${attempt.level}/5 ${band.label}`;
}

/* -------------------------------------------------------------------------- */
/* Evidence stages                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The four stages every piece of evidence passes through.
 *
 * Completing a project is not the same as having a skill. The stages make
 * the difference visible instead of letting a finished project silently
 * mark a skill as mastered.
 */
export const EVIDENCE_STAGES = [
  'project_completion',
  'evidence_submission',
  'skill_validation',
  'skill_mastery',
] as const;

export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];

/** The name of each stage. */
export const EVIDENCE_STAGE_LABELS: Record<EvidenceStage, string> = {
  project_completion: 'Project Completion',
  evidence_submission: 'Evidence Submission',
  skill_validation: 'Skill Validation',
  skill_mastery: 'Skill Mastery',
};

/** What the candidate sees while the evidence is moving through the stages. */
export const EVIDENCE_STAGE_DESCRIPTIONS: Record<EvidenceStage, string> = {
  project_completion:
    'The project is finished. This proves you did the work — it does not yet prove a skill level.',
  evidence_submission:
    'The evidence is attached to the specific skills it demonstrates, and is waiting to be checked.',
  skill_validation:
    'The evidence is being checked: Submitted, Under Review, Verified or Rejected.',
  skill_mastery:
    'The evidence was accepted and the linked skill’s practical level was raised by the amount shown.',
};

/**
 * The states of a skill validation.
 */
export const SKILL_VALIDATION_STATES = [
  'submitted',
  'under_review',
  'verified',
  'rejected',
] as const;

export type SkillValidationState = (typeof SKILL_VALIDATION_STATES)[number];

/** The name of each validation state. */
export const SKILL_VALIDATION_LABELS: Record<SkillValidationState, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
};

/**
 * How much a piece of accepted evidence raises a linked skill's level.
 *
 * The rule is deliberately modest and completely visible: a project that
 * demonstrates a skill raises that skill's practical level to the level the
 * project demonstrates — never straight to 5/5. The candidate is told the
 * exact number before they save anything.
 */
export function practicalEvidenceLevel(demonstratedLevel: number): number {
  if (!Number.isFinite(demonstratedLevel)) return 1;
  const clamped = Math.max(1, Math.min(VERIFIED_MASTERY_LEVEL, Math.round(demonstratedLevel)));
  return clamped;
}

/**
 * The exact effect an accepted piece of evidence has on role readiness.
 *
 * The candidate is shown this before they save the evidence, because
 * "your readiness went up" without a number is not an explanation.
 */
export function readinessImpact(input: {
  /** The readiness percentage before the evidence. */
  before: number;
  /** The readiness percentage after the evidence. */
  after: number;
  /** The skills the evidence was linked to. */
  linkedSkills: readonly string[];
}): { delta: number; skills: string[]; sentence: string } {
  const delta = Math.round((input.after - input.before) * 10) / 10;
  const skills = [...new Set(input.linkedSkills.filter(Boolean))];
  const sentence =
    delta > 0
      ? `+${delta}% Role Readiness from ${skills.join(', ') || 'the linked skill'}.`
      : delta < 0
        ? `${delta}% Role Readiness from ${skills.join(', ') || 'the linked skill'}.`
        : `No change to Role Readiness from ${skills.join(', ') || 'the linked skill'}.`;
  return { delta, skills, sentence };
}
