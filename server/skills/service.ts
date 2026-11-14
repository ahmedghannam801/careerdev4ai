/**
 * The skill store and its dependents.
 *
 * WHY THIS MODULE EXISTS
 * The QA audit found the platform's skill state fragmented across four places:
 *
 *   * `public.user_skills.proficiency` held ONE number per skill, so a
 *     diagnostic knowledge check had nowhere to record what it measured and
 *     the user had to press "Sync to My Skill Profile" for the number to
 *     change at all.
 *   * "My Career" blockers, the roadmap's first recommended step and the
 *     readiness percentage were each computed by their own code, so they
 *     disagreed about which skill mattered most.
 *   * A satisfied skill stayed in the blocker list and in the roadmap's first
 *     steps until somebody pressed "Sync With Profile", because nothing
 *     recalculated when the underlying level changed.
 *
 * WHAT THIS MODULE DOES
 * One write path for every kind of skill change, and one recalculation that
 * runs automatically afterwards:
 *
 *   1. `recordAssessmentForSkill` stores a diagnostic result as EVIDENCE
 *      beside the self-report. A measurement never overwrites a claim; the
 *      effective level is the strongest of the two.
 *   2. `recalculateSkillDependents` regenerates the roadmap and recomputes the
 *      gap summary, so a skill that now meets the role requirement leaves the
 *      blocker list and the roadmap's opening steps on its own.
 *
 * The recalculation is deliberately failure-tolerant: a roadmap that cannot be
 * regenerated must not undo a skill save that succeeded. The skill write is
 * the source of truth; the roadmap is a projection of it.
 */

import {
  getUserSkills,
  recordSkillAssessment,
  resolveSkillId,
  setUserSkillLevel,
  type SkillRow,
  type UserSkillRow,
} from '../db/userSkills.ts';
import {
  createEvidence,
  listEvidence,
  updateEvidence,
  type EvidenceDTO,
} from '../db/evidence.ts';
import {
  getEvidenceSkillLevels,
  getSkillEvidenceSignals,
  type SkillEvidenceSignal,
} from '../db/skillEvidence.ts';
import { getProfileDto } from '../db/profile.ts';
import {
  computeSkillGaps,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../../shared/skillGap.ts';
import {
  buildSkillRecord,
  effectiveSkillLevel,
  evidenceSourcesForKinds,
  hasPracticalEvidence,
  rankSkillPriorities,
  type SkillPriority,
} from '../../shared/skillEvidence.ts';
import { isSkillSectionHeader, normalizeSkillKey } from '../../shared/cvDedupe.ts';
import {
  normalizeSkillName,
  resolveSkillSource,
  type SkillSource,
} from '../../shared/skillNormalizer.ts';
import { resolveRoleDefinition } from '../../shared/careerRoles.ts';
import { generateAndPersistRoadmap, getSkillGapSummary } from '../roadmap/service.ts';

export class InvalidSkillNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSkillNameError';
  }
}

/**
 * The skill row as the rest of the platform wants it: the catalogue name, the
 * self-report, the measurement and the evidence, all in one record.
 */
export interface StoredSkill {
  /** The catalogue id of the skill. */
  skillId: string;
  name: string;
  category: string;
  /** What the candidate says they can do (1-5), null when never rated. */
  selfReportedLevel: number | null;
  /** What a diagnostic knowledge check measured (1-5), null when never taken. */
  assessedLevel: number | null;
  /** The raw percentage the assessment scored (0-100). */
  assessmentScore: number | null;
  /** When the assessment was taken. */
  assessmentAt: string | null;
  /** The evidence backing this skill. */
  evidenceSources: string[];
  /** The level the product compares against the role: the strongest signal. */
  effectiveLevel: number;
  /** The level the records the candidate holds support. */
  evidenceLevel: number | null;
  /**
   * What backs this record: verified evidence, a completed assessment, the
   * candidate's own claim, or a model estimate nobody has confirmed.
   */
  source: SkillSource;
}

/**
 * Builds the structured skill record for every skill the candidate has.
 *
 * The evidence map comes from the candidate's own records: a project they
 * built, a course they finished, a certificate they earned or an evidence
 * item they filed. Those records raise the level of the skill they cover.
 */
export async function listStoredSkills(profileId: string): Promise<StoredSkill[]> {
  const [rows, evidenceSignals] = await Promise.all([
    getUserSkills(profileId),
    getSkillEvidenceSignals(profileId).catch(
      () => new Map<string, SkillEvidenceSignal>()
    ),
  ]);

  return rows
    .filter((row) => Boolean(normalizeSkillName(row.skill?.name)))
    .map((row) => {
      const signal = evidenceSignals.get(row.skill!.name.toLowerCase());
      const evidenceLevel = signal?.level ?? null;
      // The row records the assessments; the project, course, certificate and
      // evidence reads record everything else. Both are needed, or a skill
      // proven by a project would look like a bare self-report.
      const evidenceSources = [
        ...(Array.isArray(row.evidence_sources) ? row.evidence_sources : []),
        ...evidenceSourcesForKinds(signal?.kinds ?? []),
      ];
      const record = buildSkillRecord({
        name: normalizeSkillName(row.skill!.name) || row.skill!.name,
        category: row.skill!.category,
        selfReportedLevel: row.proficiency,
        assessedLevel: row.assessed_level,
        assessmentScore: row.assessment_score,
        assessmentAt: row.assessment_at,
        evidenceLevel,
        evidenceSources,
      });

      return {
        skillId: row.skill_id,
        name: record.name,
        category: record.category,
        selfReportedLevel: record.selfReportedLevel,
        assessedLevel: record.assessedLevel,
        assessmentScore: record.assessmentScore,
        assessmentAt: record.assessmentAt,
        evidenceSources: record.evidenceSources,
        effectiveLevel: effectiveSkillLevel(record),
        evidenceLevel: record.evidenceLevel,
        source: resolveSkillSource({
          selfReportedLevel: record.selfReportedLevel,
          assessedLevel: record.assessedLevel,
          evidenceSources: record.evidenceSources,
        }),
      };
    });
}

export interface SkillWriteResult {
  /** The interpreted record: self-report, assessment and evidence, together. */
  skill: StoredSkill;
  /**
   * The persisted row, in the same shape `GET /api/user-skills` returns.
   *
   * The row and the record are two different things and both are needed. The
   * row is what was written and is the stable wire shape every consumer of
   * this endpoint already reads. The record is what the row MEANS once the
   * evidence is taken into account — and it carries the evidence level, which
   * the row cannot, because the evidence lives in other tables.
   */
  row: UserSkillRow & { skill?: SkillRow | null };
  /**
   * What the recalculation found afterwards. Null when the candidate has no
   * target role yet, because readiness is measured against a role.
   */
  recalculation: SkillRecalculation | null;
  /** Evidence entry created or updated by a completed skill assessment. */
  evidence?: EvidenceDTO | null;
}

export interface SkillRecalculation {
  /** True when the roadmap was rebuilt against the new skill levels. */
  roadmapRegenerated: boolean;
  /** The readiness percentage after the change (0-100). */
  readinessPct: number | null;
  /** How many role requirements still have an open gap. */
  openGaps: number | null;
  /**
   * The ranked next actions. This is the SAME list the roadmap's first
   * recommended step is drawn from, so "My Career" and the roadmap can never
   * disagree about what to do next.
   */
  priorities: SkillPriority[];
}

/**
 * Recomputes everything that depends on the candidate's skill levels.
 *
 * Called automatically after every skill write. It regenerates the roadmap so
 * a satisfied skill leaves the opening steps, and recomputes the gap summary
 * so the readiness percentage and the blocker list follow the same change.
 *
 * It never throws: a roadmap that cannot be rebuilt must not turn a
 * successful skill save into an error.
 */
export async function recalculateSkillDependents(
  profileId: string
): Promise<SkillRecalculation> {
  const empty: SkillRecalculation = {
    roadmapRegenerated: false,
    readinessPct: null,
    openGaps: null,
    priorities: [],
  };

  let roadmapRegenerated = false;
  try {
    const profile = await getProfileDto(profileId);
    if (profile?.targetRole) {
      const existing = await getSkillGapSummary(profileId);
      if (existing) {
        await generateAndPersistRoadmap(profileId, { isEnrolled: undefined });
        roadmapRegenerated = true;
      }
    }
  } catch (error) {
    console.error('Failed to regenerate the roadmap after a skill change:', error);
  }

  try {
    const summary = await getSkillGapSummary(profileId);
    if (!summary) return { ...empty, roadmapRegenerated };

    const priorities = rankSkillPriorities(summary.gaps);

    return {
      roadmapRegenerated,
      readinessPct: summary.summary.readinessPct,
      openGaps: summary.summary.open,
      priorities,
    };
  } catch (error) {
    console.error('Failed to recompute the skill gap summary:', error);
    return { ...empty, roadmapRegenerated };
  }
}

/**
 * Stores a diagnostic knowledge check result for a skill.
 *
 * The self-reported level is left exactly as it was: a measurement is evidence
 * beside a claim, and the effective level is the stronger of the two. That is
 * what makes a finished check close a gap immediately instead of overwriting
 * the candidate's own opinion of themselves.
 */
export async function recordAssessmentForSkill(
  profileId: string,
  input: { name: string; category?: string; level: number; score: number }
): Promise<SkillWriteResult> {
  const name = input.name.trim();
  if (!name) throw new InvalidSkillNameError('A skill name is required');
  if (isSkillSectionHeader(name)) {
    throw new InvalidSkillNameError(`"${name}" is a category heading, not an individual skill`);
  }

  const rawLevel = Math.max(1, Math.min(5, Math.round(input.level)));
  const score = Math.max(0, Math.min(100, Math.round(input.score)));

  const skillId = await resolveSkillId(name, input.category);
  if (!skillId) throw new Error('Could not resolve skill');

  // Cap diagnostic knowledge checks at level 4/5 unless the candidate already
  // holds practical evidence (a project, certificate, or completed course).
  const [existingRows, evidenceLevels] = await Promise.all([
    getUserSkills(profileId).catch(() => []),
    getEvidenceSkillLevels(profileId).catch(() => new Map<string, number>()),
  ]);
  const existingRow = existingRows.find((entry) => entry.skill_id === skillId);
  const canonicalName = existingRow?.skill?.name ?? name;
  const evidenceLevel = evidenceLevels.get(canonicalName.toLowerCase()) ?? null;
  const practical = hasPracticalEvidence({
    evidenceLevel,
    evidenceSources: Array.isArray(existingRow?.evidence_sources)
      ? (existingRow!.evidence_sources as ('self_reported' | 'diagnostic_assessment' | 'verified_project' | 'course_completed' | 'certificate')[])
      : [],
  });
  const level = Math.min(practical ? 5 : 4, rawLevel);

  const assessmentRow: UserSkillRow = await recordSkillAssessment(profileId, skillId, {
    level,
    score,
    at: new Date().toISOString(),
  });

  // Automatically record an Evidence item (`type: 'assessment'`) so the
  // assessment leaves an inspectable artifact in the Evidence & Portfolio view.
  let evidence: EvidenceDTO | null = null;
  try {
    const today = new Date().toISOString().split('T')[0];
    const normalizedSkill = normalizeSkillKey(canonicalName);
    const title = `${canonicalName} — Diagnostic Knowledge Assessment`;
    const description = `Scored ${score}% (${level}/5 ${practical ? 'Verified Proficient' : 'Knowledge Verified'}) on the ${canonicalName} diagnostic knowledge check.`;
    const existingEvidence = await listEvidence(profileId);
    const matching = existingEvidence.find(
      (item) =>
        item.type === 'assessment' &&
        (item.skillNames.some((s) => normalizeSkillKey(s) === normalizedSkill) ||
          normalizeSkillKey(item.title).startsWith(normalizedSkill))
    );
    if (matching) {
      evidence = await updateEvidence(profileId, matching.id, {
        title,
        description,
        dateAdded: today,
        skillNames: [canonicalName],
      });
    } else {
      evidence = await createEvidence(profileId, {
        title,
        type: 'assessment',
        description,
        verified: false,
        dateAdded: today,
        skillNames: [canonicalName],
      });
    }
  } catch (evidenceError) {
    console.error('Failed to record evidence for skill assessment:', evidenceError);
  }

  const recalculation = await recalculateSkillDependents(profileId);
  const { skill, row } = await readStoredSkill(profileId, assessmentRow.skill_id);

  return { skill, row, recalculation, evidence };
}

/**
 * Records a self-reported level, then recalculates.
 *
 * This is the path the Skills Centre uses. It deliberately writes only the
 * self-report: the assessed level and the evidence stay as they were.
 */
export async function recordSelfReportedLevel(
  profileId: string,
  input: { name: string; category?: string; level: number; yearsExperience?: number }
): Promise<SkillWriteResult> {
  const name = input.name.trim();
  if (!name) throw new InvalidSkillNameError('A skill name is required');
  if (isSkillSectionHeader(name)) {
    throw new InvalidSkillNameError(`"${name}" is a category heading, not an individual skill`);
  }

  const level = Math.max(1, Math.min(5, Math.round(input.level)));
  const skillId = await resolveSkillId(name, input.category);
  if (!skillId) throw new Error('Could not resolve skill');

  await setUserSkillLevel(profileId, skillId, {
    proficiency: level,
    years_experience:
      typeof input.yearsExperience === 'number' && Number.isFinite(input.yearsExperience)
        ? input.yearsExperience
        : undefined,
  });

  const recalculation = await recalculateSkillDependents(profileId);
  const { skill, row } = await readStoredSkill(profileId, skillId);

  return { skill, row, recalculation };
}

/**
 * The stored form of one skill, read back after a write.
 *
 * It returns the persisted row and the interpreted record together, because
 * the caller needs both: the row to answer with the shape every consumer
 * already reads, and the record to tell the browser what the level MEANS.
 */
async function readStoredSkill(
  profileId: string,
  skillId: string
): Promise<{ skill: StoredSkill; row: UserSkillRow & { skill?: SkillRow | null } }> {
  const rows = await getUserSkills(profileId);
  const row = rows.find((entry) => entry.skill_id === skillId) ?? null;
  const skills = await listStoredSkills(profileId);
  const found = skills.find((skill) => skill.skillId === skillId);

  if (found && row) return { skill: found, row };

  // The row exists but carries no catalogue name yet (a race between the
  // upsert and the catalogue read). Fall back to a neutral record rather than
  // failing the whole write.
  const fallback: StoredSkill = {
    skillId,
    name: '',
    category: 'technical',
    selfReportedLevel: null,
    assessedLevel: null,
    assessmentScore: null,
    assessmentAt: null,
    evidenceSources: [],
    effectiveLevel: 0,
    evidenceLevel: null,
    source: 'ai_estimated',
  };
  return {
    skill: found ?? fallback,
    row: row ?? {
      id: '',
      user_id: profileId,
      skill_id: skillId,
      proficiency: null,
      years_experience: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * The ranked next actions for a candidate, computed from their stored skills.
 *
 * This is the single prioritisation used by "My Career" blockers and by the
 * roadmap's first recommended step, so the two always agree.
 */
export async function getSkillPriorities(profileId: string): Promise<SkillPriority[]> {
  const summary = await getSkillGapSummary(profileId);
  if (!summary) return [];
  return rankSkillPriorities(summary.gaps);
}

/**
 * The readiness picture, computed from the stored skills rather than from a
 * separate client-side approximation.
 */
export async function getReadinessSummary(profileId: string): Promise<{
  readinessPct: number;
  openGaps: number;
  gaps: ReturnType<typeof computeSkillGaps>;
  summary: ReturnType<typeof summarizeSkillGaps>;
} | null> {
  const summary = await getSkillGapSummary(profileId);
  if (!summary) return null;

  const role = resolveRoleDefinition(summary.roleTitle ?? '');
  if (role) {
    // The gap summary already used the role's requirements; recomputing here
    // would only duplicate the work. The engine is exposed so the caller can
    // show the same per-skill picture the server used.
    void toRoleSkillRequirements(role);
  }

  return {
    readinessPct: summary.summary.readinessPct,
    openGaps: summary.summary.open,
    gaps: summary.gaps,
    summary: summary.summary,
  };
}
