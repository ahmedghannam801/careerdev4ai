/**
 * Personalised roadmap service.
 *
 * This is the server-side entry point that turns a user's target role and
 * their rated skills into a concrete, persisted plan.
 *
 * Before this existed the plan was assembled in the browser
 * (`src/context/CareerContext.tsx`) from a fixed five-phase template that was
 * identical for every career. The plan was therefore:
 *
 *   - the same for a Business Analyst and a Data Scientist;
 *   - blind to which skills the user already had;
 *   - missing prerequisites, difficulty, recommended resources and projects;
 *   - and never able to be regenerated on the server, so the API could not
 *     validate it or explain it.
 *
 * The generation logic now lives in `shared/roadmapGenerator.ts` so that the
 * server and the browser agree, and this module owns the I/O: it reads the
 * user's real data, generates the plan, and persists it.
 */

import {
  generateRoadmapPlan,
  type RoadmapPlan,
  type RoadmapProjectRef,
  type RoadmapResourceRef,
} from '../../shared/roadmapGenerator.ts';
import { resolveRoleDefinition } from '../../shared/careerRoles.ts';
import { computeSkillGaps, summarizeSkillGaps, toRoleSkillRequirements } from '../../shared/skillGap.ts';
import { getProfileDto } from '../db/profile.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { getEvidenceSkillLevels } from '../db/skillEvidence.ts';
import { listCourses } from '../db/learning.ts';
import { listProjects } from '../db/projects.ts';
import {
  createRoadmapWithTree,
  getRoadmap,
  type RoadmapDTO,
  type RoadmapTaskStatus,
  type RoadmapTreePhaseInput,
} from '../db/roadmap.ts';

export interface RoadmapGenerationResult {
  roadmap: RoadmapDTO;
  plan: RoadmapPlan;
  /** True when the plan was regenerated, false when it was already current. */
  regenerated: boolean;
}

export class RoadmapGenerationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'no_target_role'
      | 'unknown_target_role'
      | 'persistence_failed'
  ) {
    super(message);
    this.name = 'RoadmapGenerationError';
  }
}

/**
 * Builds the plan for a profile without writing anything.
 *
 * Used by the preview endpoint and by the tests.
 */
export async function buildPersonalizedPlan(
  profileId: string
): Promise<RoadmapPlan> {
  const [profile, skills, courses, projects] = await Promise.all([
    getProfileDto(profileId),
    getUserSkills(profileId),
    listCourses().catch(() => []),
    listProjects(profileId).catch(() => []),
  ]);

  const roleReference = profile?.targetRole ?? null;
  if (!roleReference) {
    throw new RoadmapGenerationError(
      'This profile has not chosen a target role yet.',
      'no_target_role'
    );
  }

  const role = resolveRoleDefinition(roleReference);
  if (!role) {
    throw new RoadmapGenerationError(
      `The target role "${roleReference}" is not in the role catalogue.`,
      'unknown_target_role'
    );
  }

  const ratedSkills = skills
    .map((row) => ({
      name: row.skill?.name ?? '',
      // A diagnostic check is a measurement, not a second opinion: the level
      // the product uses is the stronger of the self-reported proficiency and
      // the assessed level, so finishing a check closes a gap immediately.
      level: Math.max(row.proficiency ?? 0, row.assessed_level ?? 0),
    }))
    .filter((skill) => Boolean(skill.name));

  // The catalogue is the source of truth for what a resource teaches. The
  // course's own skill list is what links it to a gap.
  const resourceCandidates: (RoadmapResourceRef & { skillNames?: string[] })[] = courses.map(
    (course) => ({
      id: course.id,
      title: course.title,
      provider: course.provider,
      url: course.url,
      durationHours: course.durationHours,
      skillNames: course.skills.map((skill) => skill.name),
    })
  );

  const projectCandidates: (RoadmapProjectRef & { skillNames?: string[] })[] = projects.map(
    (project) => ({
      title: project.title,
      description: project.goal ?? project.description ?? 'Your own project.',
      source: 'user' as const,
      skillNames: [],
    })
  );

  return generateRoadmapPlan({
    role,
    userSkills: ratedSkills,
    resources: resourceCandidates,
    projects: projectCandidates,
  });
}

/**
 * Generates the plan and writes it to the database.
 *
 * Existing task progress is preserved by the persistence layer, which matches
 * tasks on their skill name and title, so regenerating a roadmap never
 * erases what a user has already completed.
 */
export async function generateAndPersistRoadmap(
  profileId: string,
  options: { isEnrolled?: boolean } = {}
): Promise<RoadmapGenerationResult> {
  const plan = await buildPersonalizedPlan(profileId);

  const phases: RoadmapTreePhaseInput[] = plan.phases.map((phase, index) => ({
    phaseNumber: index + 1,
    title: phase.title,
    description: phase.description,
    goal: phase.goal,
    isUnlocked: true,
    milestones: phase.milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description,
      tasks: milestone.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        status: task.status,
        skillName: task.primarySkillName ?? undefined,
        estimatedHours: task.estimatedHours,
        workKind: task.workKind,
        difficulty: task.difficulty,
        prerequisites: task.prerequisites,
        skillNames: task.skillNames,
        projectTitles: task.projects.map((project) => project.title),
        resources: task.resources.map((resource) => ({
          id: resource.id,
          title: resource.title,
          provider: resource.provider,
          url: resource.url,
          durationHours: resource.durationHours,
        })),
        priority: task.priority,
        rationale: task.rationale,
        // The first recommended resource is also written to the flat columns
        // that existed before this migration, so older readers still show a
        // resource for every step.
        resourceId: task.resources[0]?.id,
        resourceTitle: task.resources[0]?.title,
      })),
    })),
  }));

  try {
    const roadmap = await createRoadmapWithTree(profileId, {
      title: plan.title,
      targetRoleTitle: plan.targetRoleTitle,
      targetRoleId: plan.targetRoleId,
      domainId: plan.domainId,
      readinessPct: plan.summary.readinessPct,
      planSummary: {
        totalTasks: plan.summary.totalTasks,
        estimatedHours: plan.summary.estimatedHours,
        timeBreakdown: plan.summary.timeBreakdown,
        openGaps: plan.summary.openGaps,
        coveredSkills: plan.summary.coveredSkills,
        tasksByPriority: plan.summary.tasksByPriority,
      },
      isEnrolled: options.isEnrolled,
      phases,
    });
    return { roadmap, plan: syncPlanStatuses(plan, roadmap), regenerated: true };
  } catch (error) {
    throw new RoadmapGenerationError(
      error instanceof Error ? error.message : 'The roadmap could not be saved.',
      'persistence_failed'
    );
  }
}

/**
 * Copies the persisted task status onto the generated plan.
 *
 * The generator always produces a fresh plan, so every task in it starts as
 * `not_started`. The persisted roadmap is the authority on what the user has
 * actually done, so the two must agree: a client that renders the plan would
 * otherwise show a completed step as untouched.
 *
 * The rows are matched on their title, which is what the persistence layer
 * itself uses to carry progress across a regeneration.
 */
function syncPlanStatuses(plan: RoadmapPlan, roadmap: RoadmapDTO): RoadmapPlan {
  const statusByTitle = new Map<string, RoadmapTaskStatus>();
  for (const phase of roadmap.phases) {
    for (const milestone of phase.milestones) {
      for (const task of milestone.tasks) {
        statusByTitle.set(task.title, task.status);
      }
    }
  }

  return {
    ...plan,
    phases: plan.phases.map((phase) => ({
      ...phase,
      milestones: phase.milestones.map((milestone) => ({
        ...milestone,
        tasks: milestone.tasks.map((task) => ({
          ...task,
          status: statusByTitle.get(task.title) ?? task.status,
        })),
      })),
    })),
  };
}

/**
 * Returns the user's roadmap, generating it first if it is missing or was
 * built for a different role.
 *
 * This is what the roadmap endpoint calls: the user always sees a plan that
 * matches the role they currently have selected.
 */
export async function getOrRefreshRoadmap(
  profileId: string
): Promise<RoadmapGenerationResult | null> {
  const profile = await getProfileDto(profileId);
  const roleReference = profile?.targetRole ?? null;
  if (!roleReference) return null;

  const role = resolveRoleDefinition(roleReference);
  if (!role) return null;

  const existing = await getRoadmap(profileId);
  const needsRegeneration =
    !existing ||
    existing.targetRoleId !== role.id ||
    existing.phases.length === 0;

  if (!needsRegeneration) {
    const plan = await buildPersonalizedPlan(profileId);
    return { roadmap: existing, plan: syncPlanStatuses(plan, existing), regenerated: false };
  }

  const existingEnrollment = existing?.isEnrolled ?? false;
  return generateAndPersistRoadmap(profileId, { isEnrolled: existingEnrollment });
}

/**
 * The skill gap picture for a user's target role.
 *
 * Powers the skills centre and the readiness figure shown on the dashboard.
 */
export async function getSkillGapSummary(profileId: string): Promise<{
  roleId: string | null;
  roleTitle: string | null;
  gaps: ReturnType<typeof computeSkillGaps>;
  summary: ReturnType<typeof summarizeSkillGaps>;
} | null> {
  const profile = await getProfileDto(profileId);
  const roleReference = profile?.targetRole ?? null;
  if (!roleReference) return null;

  const role = resolveRoleDefinition(roleReference);
  if (!role) return null;

  const skills = await getUserSkills(profileId);
  const ratedSkills = skills
    .map((row) => ({
      name: row.skill?.name ?? '',
      level: Math.max(row.proficiency ?? 0, row.assessed_level ?? 0),
    }))
    .filter((skill) => Boolean(skill.name));

  // The evidence the candidate's own records hold. A project they built, a
  // course they finished, an evidence item they filed or a certificate they
  // earned raises the level of the skill it covers, so the gap closes when
  // the work is done even if the rating was never updated.
  const evidenceLevels = await getEvidenceSkillLevels(profileId).catch(() => undefined);

  const requirements = toRoleSkillRequirements(role);
  const gaps = computeSkillGaps(requirements, ratedSkills, evidenceLevels);

  return {
    roleId: role.id,
    roleTitle: role.title,
    gaps,
    summary: summarizeSkillGaps(gaps, requirements),
  };
}
