/**
 * The skill evidence model.
 *
 * A skill is not one number. It is a claim plus whatever the platform can
 * actually prove:
 *
 *   selfReportedLevel   what the candidate says (1–5)
 *   assessedLevel       what a diagnostic knowledge check measured (1–5)
 *   evidenceSources     the records that back it up
 *
 * The effective level is the strongest of those — evidence raises a claim and
 * never lowers it. The same model is built on the server when a roadmap is
 * generated and in the browser when the skills centre is rendered, so the two
 * cannot disagree about how ready someone is.
 *
 * PRIORITISATION
 * `rankSkillPriorities` is the one algorithm behind "My Career" blockers and
 * the roadmap's #1 recommended action. A skill whose current level already
 * meets the target has a gap of zero and therefore cannot appear: satisfied
 * skills leave the blocker list the moment they are satisfied, with no manual
 * "sync" step.
 */

import type { SkillCategory } from './careerTypes.ts';
import { describeGap, type SkillGap } from './skillGap.ts';

export const SKILL_EVIDENCE_SOURCES = [
  'self_reported',
  'diagnostic_assessment',
  'course_completed',
  'verified_project',
  'certificate',
  'work_experience',
] as const;

export type SkillEvidenceSource = (typeof SKILL_EVIDENCE_SOURCES)[number];

export const SKILL_EVIDENCE_LABELS: Record<SkillEvidenceSource, string> = {
  self_reported: 'Self-reported',
  diagnostic_assessment: 'Diagnostic Assessment',
  course_completed: 'Course Completed',
  verified_project: 'Verified Project',
  certificate: 'Certificate',
  work_experience: 'Work Experience',
};

export type SkillEvidenceTone = 'claim' | 'measured' | 'proof';

export const SKILL_EVIDENCE_TONES: Record<SkillEvidenceSource, SkillEvidenceTone> = {
  self_reported: 'claim',
  diagnostic_assessment: 'measured',
  course_completed: 'proof',
  verified_project: 'proof',
  certificate: 'proof',
  work_experience: 'proof',
};

export interface SkillRecord {
  name: string;
  category: SkillCategory;
  targetLevel: number;
  selfReportedLevel: number | null;
  assessedLevel: number | null;
  assessmentScore: number | null;
  assessmentAt: string | null;
  /** The level the candidate's projects, courses and certificates support. */
  evidenceLevel: number | null;
  evidenceSources: SkillEvidenceSource[];
}

export interface SkillEvidenceBadge {
  source: SkillEvidenceSource;
  label: string;
  tone: SkillEvidenceTone;
  level: number | null;
}

function clampLevel(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1) return null;
  return Math.min(5, rounded);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** True when the platform holds proof, not just a claim. */
export function hasVerifiedEvidence(record: Pick<SkillRecord, 'evidenceSources'>): boolean {
  return record.evidenceSources.some(
    (source) =>
      source === 'verified_project' ||
      source === 'course_completed' ||
      source === 'certificate' ||
      source === 'work_experience'
  );
}

/**
 * The one level the rest of the product compares against the role.
 *
 * A skill nobody has rated and nothing proves is level 0. The old model used
 * level 1, which quietly hid the largest possible gap behind an optimistic
 * default: an unrated skill looked one step from the target instead of five.
 */
export function effectiveSkillLevel(record: SkillRecord): number {
  return Math.max(
    clampLevel(record.selfReportedLevel) ?? 0,
    clampLevel(record.assessedLevel) ?? 0,
    clampLevel(record.evidenceLevel) ?? 0
  );
}

/** Only the evidence sources that actually carry a signal. */
export function evidenceBadges(record: SkillRecord): SkillEvidenceBadge[] {
  const badges: SkillEvidenceBadge[] = [];
  if (clampLevel(record.selfReportedLevel) !== null) {
    badges.push({
      source: 'self_reported',
      label: SKILL_EVIDENCE_LABELS.self_reported,
      tone: SKILL_EVIDENCE_TONES.self_reported,
      level: clampLevel(record.selfReportedLevel),
    });
  }
  if (clampLevel(record.assessedLevel) !== null) {
    badges.push({
      source: 'diagnostic_assessment',
      label: SKILL_EVIDENCE_LABELS.diagnostic_assessment,
      tone: SKILL_EVIDENCE_TONES.diagnostic_assessment,
      level: clampLevel(record.assessedLevel),
    });
  }
  for (const source of unique(record.evidenceSources)) {
    if (source === 'self_reported' || source === 'diagnostic_assessment') continue;
    badges.push({
      source,
      label: SKILL_EVIDENCE_LABELS[source],
      tone: SKILL_EVIDENCE_TONES[source],
      level: clampLevel(record.evidenceLevel),
    });
  }
  return badges;
}

export interface BuildSkillRecordInput {
  name: string;
  category?: SkillCategory | string | null;
  targetLevel?: number;
  selfReportedLevel?: number | null;
  assessedLevel?: number | null;
  assessmentScore?: number | null;
  assessmentAt?: string | null;
  evidenceLevel?: number | null;
  evidenceSources?: readonly string[] | null;
}

const EVIDENCE_SOURCE_SET = new Set<string>(SKILL_EVIDENCE_SOURCES);

/** Reads an untrusted list of sources, dropping anything not in the vocabulary. */
export function normalizeEvidenceSources(
  values: readonly string[] | null | undefined
): SkillEvidenceSource[] {
  if (!values) return [];
  return unique(
    values
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter((value): value is SkillEvidenceSource => EVIDENCE_SOURCE_SET.has(value))
  );
}

function toCategory(value: SkillCategory | string | null | undefined): SkillCategory {
  const allowed: SkillCategory[] = [
    'technical',
    'analytical',
    'business',
    'communication',
    'leadership',
    'tools',
    'domain',
    'soft_skills',
  ];
  const normalized = typeof value === 'string' ? (value.trim().toLowerCase() as SkillCategory) : null;
  return normalized && allowed.includes(normalized) ? normalized : 'technical';
}

export function buildSkillRecord(input: BuildSkillRecordInput): SkillRecord {
  const sources = normalizeEvidenceSources(input.evidenceSources);
  const selfReported = clampLevel(input.selfReportedLevel);
  const assessed = clampLevel(input.assessedLevel);
  return {
    name: input.name.trim(),
    category: toCategory(input.category),
    targetLevel: clampLevel(input.targetLevel) ?? 3,
    selfReportedLevel: selfReported,
    assessedLevel: assessed,
    assessmentScore:
      typeof input.assessmentScore === 'number' && Number.isFinite(input.assessmentScore)
        ? Math.max(0, Math.min(100, Math.round(input.assessmentScore)))
        : null,
    assessmentAt: input.assessmentAt ?? null,
    evidenceLevel: clampLevel(input.evidenceLevel),
    evidenceSources: unique([
      ...(selfReported !== null ? (['self_reported'] as SkillEvidenceSource[]) : []),
      ...(assessed !== null ? (['diagnostic_assessment'] as SkillEvidenceSource[]) : []),
      ...sources.filter(
        (source) => source !== 'self_reported' && source !== 'diagnostic_assessment'
      ),
    ]),
  };
}

export function hasPracticalEvidence(
  record: Pick<SkillRecord, 'evidenceLevel' | 'evidenceSources'>
): boolean {
  if (clampLevel(record.evidenceLevel) !== null && (clampLevel(record.evidenceLevel) ?? 0) >= 4) {
    return true;
  }
  return record.evidenceSources.some(
    (source) =>
      source === 'verified_project' ||
      source === 'certificate' ||
      source === 'course_completed'
  );
}

/**
 * Merges a new assessment result into an existing record without losing the
 * sources that were already proven.
 *
 * A diagnostic knowledge check alone caps at level 4/5 (Knowledge Verified);
 * reaching level 5/5 requires practical evidence (project, certificate, or
 * verified work).
 */
export function applyAssessment(
  record: SkillRecord,
  result: { level: number; score: number; at: string }
): SkillRecord {
  const maxAllowed = hasPracticalEvidence(record) ? 5 : 4;
  const clamped = clampLevel(result.level);
  const level = clamped !== null ? Math.min(maxAllowed, clamped) : record.assessedLevel;
  return {
    ...record,
    assessedLevel: level,
    assessmentScore: Math.max(0, Math.min(100, Math.round(result.score))),
    assessmentAt: result.at,
    evidenceSources: unique([...record.evidenceSources, 'diagnostic_assessment']),
  };
}

/* -------------------------------------------------------------------------- */
/* Prioritisation — one algorithm for every "what next?" surface              */
/* -------------------------------------------------------------------------- */

export type SkillActionKind = 'assessment' | 'learning' | 'project';

export interface SkillPriority {
  /** Stable id, safe to use as a React key. */
  id: string;
  skillName: string;
  category: SkillCategory;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  priority: SkillGap['priority'];
  required: boolean;
  /** A plain-language answer to "why this skill?". */
  why: string;
  /** The shortest useful next step for this gap. */
  action: SkillActionKind;
  /** A transparent estimate, in hours, of closing the gap. */
  estimatedHours: number;
  /** Where the CTA goes. */
  view: 'assessment' | 'skills' | 'roadmap' | 'projects';
}

/**
 * How long closing a gap is expected to take.
 *
 * The estimate is deliberately explicit and conservative: one hour per level
 * of missing proficiency for a diagnostic check, two hours of practice per
 * level, and a two-hour floor so a one-level gap still names a real block of
 * work rather than "0 hours".
 */
export function estimateGapHours(gap: number): number {
  const levels = Math.max(1, Math.round(gap));
  return levels * 4 + 2;
}

/** The first useful action for a gap, based on what the platform already knows. */
export function actionForGap(gap: SkillGap): SkillActionKind {
  // No measurement yet: find out where the candidate really is first.
  if (!gap.verified && gap.currentLevel === 0) return 'assessment';
  // A measured but still-missing skill is learned, then proven.
  return gap.currentLevel > 0 ? 'project' : 'learning';
}

function viewForAction(action: SkillActionKind): SkillPriority['view'] {
  if (action === 'assessment') return 'assessment';
  if (action === 'learning') return 'roadmap';
  return 'projects';
}

/**
 * Ranks every open gap with the SAME weight the gap engine computed.
 *
 * Satisfied skills (`gap === 0`) are filtered out here, which is what makes a
 * completed assessment remove the blocker immediately: the list is derived
 * from the current levels, not from a stored copy of the old blockers.
 */
export function rankSkillPriorities(gaps: SkillGap[]): SkillPriority[] {
  return gaps
    .filter((gap) => gap.gap > 0)
    .slice()
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.gap - a.gap ||
        Number(b.required) - Number(a.required) ||
        a.name.localeCompare(b.name)
    )
    .map((gap) => {
      const action = actionForGap(gap);
      return {
        id: `priority-${gap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        skillName: gap.name,
        category: gap.category,
        requiredLevel: gap.requiredLevel,
        currentLevel: gap.currentLevel,
        gap: gap.gap,
        priority: gap.priority,
        required: gap.required,
        why: describeGap(gap),
        action,
        estimatedHours: estimateGapHours(gap.gap),
        view: viewForAction(action),
      };
    });
}

/** The single most important skill gap, or null when nothing is missing. */
export function nextSkillPriority(gaps: SkillGap[]): SkillPriority | null {
  return rankSkillPriorities(gaps)[0] ?? null;
}

/**
 * The evidence sources implied by the records the platform holds.
 *
 * This is the bridge between the server's `getSkillEvidenceSignals` and the
 * model above: a project proves a skill, a completed course supports it, a
 * certificate supports it, and a verified evidence item proves it.
 */
export function evidenceSourcesForKinds(
  kinds: readonly string[]
): SkillEvidenceSource[] {
  const sources: SkillEvidenceSource[] = [];
  for (const kind of kinds) {
    if (kind === 'project') sources.push('verified_project');
    else if (kind === 'course') sources.push('course_completed');
    else if (kind === 'certification') sources.push('certificate');
    else if (kind === 'evidence') sources.push('verified_project');
  }
  return unique(sources);
}
