/**
 * The skill vocabulary: one name per skill, one source per claim.
 *
 * WHY THIS MODULE EXISTS
 * A skill reached the product from four different places — the candidate typed
 * it, the AI estimated it from a CV or a job description, a diagnostic check
 * measured it, or a project/course/certificate proved it. Those are four
 * different kinds of knowledge, and the UI used to show them as one number.
 * A skill the model guessed looked exactly like a skill a certificate proved,
 * and the same skill could be counted twice because "JS" and "React.js" were
 * separate catalogue rows.
 *
 * This module is the single definition of:
 *
 *   * what a skill is called (`normalizeSkillName`, `skillDedupeKey`)
 *   * which of the four sources backs it (`resolveSkillSource`)
 *   * how two records for the same skill become one (`mergeSkillRecords`)
 *
 * The name rules are not re-implemented here. They live in `cvDedupe.ts`,
 * which already knows about section headings ("TECHNICAL SKILLS"), aliases
 * ("JS" → "javascript") and the punctuation a CV uses. This module re-exports
 * them under the skill-centred names so callers have one import to reach for,
 * and adds the source vocabulary on top.
 */

import type { SkillCategory } from './careerTypes.ts';
import { cleanSkillName, isSkillSectionHeader, normalizeSkillKey } from './cvDedupe.ts';

export { isSkillSectionHeader, normalizeSkillKey };

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where a skill record came from, strongest first.
 *
 *   verified_evidence  a project, course, certificate or job proves it
 *   assessment         a diagnostic knowledge check measured it
 *   self_reported      the candidate said so
 *   ai_estimated       the model inferred it and nobody has confirmed it
 */
export const SKILL_SOURCES = [
  'verified_evidence',
  'assessment',
  'self_reported',
  'ai_estimated',
] as const;

export type SkillSource = (typeof SKILL_SOURCES)[number];

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  verified_evidence: 'Verified evidence',
  assessment: 'Assessed',
  self_reported: 'Self-reported',
  ai_estimated: 'AI estimated',
};

/**
 * The evidence sources that count as proof rather than as a claim.
 *
 * `self_reported` and `diagnostic_assessment` are handled separately because
 * they map onto their own skill sources; everything else in the evidence
 * vocabulary requires a record the platform can point at.
 */
const PROOF_EVIDENCE_SOURCES = new Set<string>([
  'verified_project',
  'course_completed',
  'certificate',
  'work_experience',
]);

/** The strength ordering used when two records disagree about their source. */
export const SKILL_SOURCE_RANK: Record<SkillSource, number> = {
  ai_estimated: 0,
  self_reported: 1,
  assessment: 2,
  verified_evidence: 3,
};

export function isSkillSource(value: unknown): value is SkillSource {
  return typeof value === 'string' && (SKILL_SOURCES as readonly string[]).includes(value);
}

export interface SkillSourceInput {
  /** What the candidate says they can do (1–5), null when never rated. */
  selfReportedLevel?: number | null;
  /** What a diagnostic check measured (1–5), null when never taken. */
  assessedLevel?: number | null;
  /** The records backing the skill, from `skillEvidence.ts`. */
  evidenceSources?: readonly string[] | null;
  /** True when the value was inferred by a model and never confirmed. */
  aiEstimated?: boolean;
}

/**
 * The strongest source behind a skill.
 *
 * Evidence beats a measurement, a measurement beats a claim, and a claim beats
 * a guess. An AI estimate therefore becomes `self_reported` the moment the
 * candidate rates the skill, and `verified_evidence` the moment a project or
 * certificate covers it — no separate "confirm" flag to keep in step.
 */
export function resolveSkillSource(input: SkillSourceInput): SkillSource {
  const sources = (input.evidenceSources ?? [])
    .map((source) => (typeof source === 'string' ? source.trim().toLowerCase() : ''))
    .filter(Boolean);
  if (sources.some((source) => PROOF_EVIDENCE_SOURCES.has(source))) {
    return 'verified_evidence';
  }
  if (typeof input.assessedLevel === 'number' && Number.isFinite(input.assessedLevel)) {
    return 'assessment';
  }
  if (
    typeof input.selfReportedLevel === 'number' &&
    Number.isFinite(input.selfReportedLevel) &&
    input.selfReportedLevel > 0
  ) {
    return 'self_reported';
  }
  // No claim, no measurement and no proof: the value can only have been
  // inferred. The `aiEstimated` field documents that intent at the call site.
  void input.aiEstimated;
  return 'ai_estimated';
}

/** The stronger of two sources; used when merging duplicate records. */
export function strongestSkillSource(a: SkillSource, b: SkillSource): SkillSource {
  return SKILL_SOURCE_RANK[a] >= SKILL_SOURCE_RANK[b] ? a : b;
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A display name for a skill, or an empty string when the value is a section
 * heading, punctuation only, or a one-character fragment.
 *
 * The candidate's spelling is kept: "PostgreSQL" is not rewritten to
 * "postgresql". Only the comparison key is normalised.
 */
export function normalizeSkillName(value: string | null | undefined): string {
  const cleaned = cleanSkillName(value ?? '');
  if (!cleaned || cleaned.length < 2) return '';
  if (isSkillSectionHeader(cleaned)) return '';
  return cleaned;
}

/**
 * The comparison key for a skill: two names with the same key are one skill.
 *
 * Returns an empty string for a value that is not a skill at all, so a caller
 * can drop it instead of grouping every heading under one empty key.
 */
export function skillDedupeKey(value: string | null | undefined): string {
  const name = normalizeSkillName(value);
  return name ? normalizeSkillKey(name) : '';
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                    */
/* -------------------------------------------------------------------------- */

/** A skill record, in the shape the merge needs to see. */
export interface SkillLike {
  name: string;
  category?: SkillCategory | string | null;
  targetLevel?: number | null;
  selfReportedLevel?: number | null;
  assessedLevel?: number | null;
  assessmentScore?: number | null;
  assessmentAt?: string | null;
  evidenceLevel?: number | null;
  evidenceSources?: readonly string[] | null;
  source?: SkillSource | null;
}

function level(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1) return null;
  return Math.min(5, rounded);
}

function maxLevel(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  const left = level(a);
  const right = level(b);
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Merges two records for the same skill without losing a signal.
 *
 * The levels take the strongest value seen, the evidence is unioned, and the
 * later assessment wins because it is the more recent measurement. Nothing is
 * averaged: a 4/5 claim and a 2/5 measurement describe the same person at two
 * different moments, and the product has always shown the stronger one.
 */
export function mergeSkillRecords<T extends SkillLike>(keeper: T, incoming: T): T {
  const keeperSource =
    keeper.source ??
    resolveSkillSource({
      selfReportedLevel: keeper.selfReportedLevel,
      assessedLevel: keeper.assessedLevel,
      evidenceSources: keeper.evidenceSources,
    });
  const incomingSource =
    incoming.source ??
    resolveSkillSource({
      selfReportedLevel: incoming.selfReportedLevel,
      assessedLevel: incoming.assessedLevel,
      evidenceSources: incoming.evidenceSources,
    });

  const keeperAssessmentAt = keeper.assessmentAt ?? null;
  const incomingAssessmentAt = incoming.assessmentAt ?? null;
  const incomingIsNewer =
    incomingAssessmentAt !== null &&
    (keeperAssessmentAt === null || incomingAssessmentAt > keeperAssessmentAt);

  return {
    ...keeper,
    name: normalizeSkillName(keeper.name) || normalizeSkillName(incoming.name) || keeper.name,
    category: keeper.category ?? incoming.category,
    targetLevel: maxLevel(keeper.targetLevel, incoming.targetLevel),
    selfReportedLevel: maxLevel(keeper.selfReportedLevel, incoming.selfReportedLevel),
    assessedLevel: maxLevel(keeper.assessedLevel, incoming.assessedLevel),
    assessmentScore: incomingIsNewer
      ? (incoming.assessmentScore ?? keeper.assessmentScore ?? null)
      : (keeper.assessmentScore ?? incoming.assessmentScore ?? null),
    assessmentAt: incomingIsNewer ? incomingAssessmentAt : keeperAssessmentAt,
    evidenceLevel: maxLevel(keeper.evidenceLevel, incoming.evidenceLevel),
    evidenceSources: uniqueStrings([
      ...(keeper.evidenceSources ?? []),
      ...(incoming.evidenceSources ?? []),
    ]),
    source: strongestSkillSource(keeperSource, incomingSource),
  };
}

/**
 * Collapses duplicate skill records, keeping the first spelling seen.
 *
 * A section heading or an empty name is dropped: it is not a skill, and the
 * gap engine must never count it as one.
 */
export function dedupeSkillRecords<T extends SkillLike>(
  records: readonly T[] | null | undefined
): T[] {
  if (!records) return [];
  const byKey = new Map<string, T>();
  for (const record of records) {
    const key = skillDedupeKey(record.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }
    byKey.set(key, mergeSkillRecords(existing, record));
  }
  return [...byKey.values()];
}
