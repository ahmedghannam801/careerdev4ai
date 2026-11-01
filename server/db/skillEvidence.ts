// The evidence behind a skill.
//
// The platform keeps four kinds of record that show what a candidate has
// actually done: the projects they built, the courses they finished, the
// evidence they filed, and the certificates they earned. Each of those
// records carries the skills it covers.
//
// Until now none of that was read when the platform worked out a candidate's
// skill gaps: the gaps came from the candidate's own ratings alone, and the
// "verified" marker the interface shows was always empty. This module reads
// the records and reports what they support.
//
// The rules it follows:
//
//   * Evidence raises a skill's effective level. It never lowers it. A
//     candidate who rates themselves honestly is not punished by the
//     platform, and a candidate who did the work but never rated the skill
//     still gets credit for it.
//   * A skill with evidence behind it is marked verified. A skill that is
//     only claimed is not.
//
// Everything here is read-only. No record is written, and nothing is
// invented: a skill appears only when a real record names it.

import { getSupabaseServer } from './supabase';

/** How strongly one kind of record supports the skill it names. */
const EVIDENCE_LEVELS = {
  /** A finished piece of evidence: a link, a certificate, a published result. */
  evidence: 4,
  /** A project the candidate built with the skill. */
  project: 3,
  /** A course the candidate completed. */
  course: 2,
  /** A certificate the candidate earned. */
  certification: 2,
} as const;

export type SkillEvidenceKind = keyof typeof EVIDENCE_LEVELS;

export interface SkillEvidenceSignal {
  /** The skill name, as the catalogue spells it. */
  name: string;
  /** The level the evidence supports. */
  level: number;
  /** The kinds of record that support it. */
  kinds: SkillEvidenceKind[];
  /** The ids of the records that support it. */
  sourceIds: string[];
}

/** The signal for one skill, while it is being collected. */
interface Accumulator {
  level: number;
  kinds: Set<SkillEvidenceKind>;
  sourceIds: Set<string>;
}

function record(
  into: Map<string, Accumulator>,
  name: string,
  kind: SkillEvidenceKind,
  sourceId: string
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  const existing = into.get(key) ?? { level: 0, kinds: new Set(), sourceIds: new Set() };
  existing.level = Math.max(existing.level, EVIDENCE_LEVELS[kind]);
  existing.kinds.add(kind);
  existing.sourceIds.add(sourceId);
  into.set(key, existing);
}

function toSignals(
  into: Map<string, Accumulator>
): Map<string, SkillEvidenceSignal> {
  const result = new Map<string, SkillEvidenceSignal>();
  for (const [key, value] of into.entries()) {
    result.set(key, {
      name: key,
      level: value.level,
      kinds: [...value.kinds],
      sourceIds: [...value.sourceIds],
    });
  }
  return result;
}

/**
 * Reads every record that shows what the candidate has done.
 *
 * The four reads are independent: a failure in one of them does not hide the
 * others, because a candidate with a completed course and a failed evidence
 * read still has the course.
 */
export async function getSkillEvidenceSignals(
  profileId: string
): Promise<Map<string, SkillEvidenceSignal>> {
  const signals = new Map<string, Accumulator>();

  // Projects the candidate built.
  try {
    const { data: projects, error } = await getSupabaseServer()
      .from('projects')
      .select('id, project_skills(skill_name)')
      .eq('profile_id', profileId);
    if (error) throw error;
    for (const project of (projects ?? []) as Array<{
      id: string;
      project_skills?: Array<{ skill_name: string | null }> | null;
    }>) {
      for (const link of project.project_skills ?? []) {
        record(signals, link.skill_name ?? '', 'project', project.id);
      }
    }
  } catch (error) {
    console.error('Could not read the project skills for the evidence profile:', error);
  }

  // Courses the candidate completed.
  try {
    const { data: items, error } = await getSupabaseServer()
      .from('user_learning_items')
      .select('id, course_id, courses(course_skills(skill_name))')
      .eq('profile_id', profileId)
      .eq('status', 'completed');
    if (error) throw error;
    for (const item of (items ?? []) as Array<{
      id: string;
      course_id: string;
      courses?: { course_skills?: Array<{ skill_name: string | null }> | null } | null;
    }>) {
      for (const link of item.courses?.course_skills ?? []) {
        record(signals, link.skill_name ?? '', 'course', item.id);
      }
    }
  } catch (error) {
    console.error('Could not read the course skills for the evidence profile:', error);
  }

  // Evidence the candidate filed and had verified.
  //
  // The link table holds the skill id only, so the name comes from the
  // catalogue it points at.
  try {
    const { data: items, error } = await getSupabaseServer()
      .from('evidence_items')
      .select('id, evidence_skills(skill_id, skills(name))')
      .eq('profile_id', profileId)
      .eq('verified', true);
    if (error) throw error;
    for (const item of (items ?? []) as unknown as Array<{
      id: string;
      evidence_skills?: Array<{
        skills?: { name?: string | null } | Array<{ name?: string | null }> | null;
      }> | null;
    }>) {
      for (const link of item.evidence_skills ?? []) {
        const related = link.skills;
        // The relation is a many-to-one, but the client types it as a
        // collection. Both shapes are accepted so a typing change in the
        // client cannot silently drop the evidence.
        const skill = Array.isArray(related) ? related[0] : related;
        record(signals, skill?.name ?? '', 'evidence', item.id);
      }
    }
  } catch (error) {
    console.error('Could not read the evidence skills for the evidence profile:', error);
  }

  // Certificates the candidate earned.
  try {
    const { data: certificates, error: certificateError } = await getSupabaseServer()
      .from('profile_certifications')
      .select('id')
      .eq('profile_id', profileId);
    if (certificateError) throw certificateError;
    const certificateIds = (certificates ?? []).map((row) => (row as { id: string }).id);
    if (certificateIds.length > 0) {
      const { data: links, error } = await getSupabaseServer()
        .from('profile_certification_skills')
        .select('certification_id, skill_name')
        .in('certification_id', certificateIds);
      if (error) throw error;
      for (const link of (links ?? []) as Array<{ certification_id: string; skill_name: string }>) {
        record(signals, link.skill_name ?? '', 'certification', link.certification_id);
      }
    }
  } catch (error) {
    console.error('Could not read the certificate skills for the evidence profile:', error);
  }

  return toSignals(signals);
}

/**
 * The evidence-backed level for every skill the candidate has evidence for.
 *
 * The returned map is keyed by the lower-cased skill name, which is how the
 * skill catalogue and the gap engine compare names.
 */
export async function getEvidenceSkillLevels(
  profileId: string
): Promise<Map<string, number>> {
  const signals = await getSkillEvidenceSignals(profileId);
  const levels = new Map<string, number>();
  for (const [key, signal] of signals.entries()) {
    levels.set(key, signal.level);
  }
  return levels;
}
