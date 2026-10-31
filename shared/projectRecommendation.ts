/**
 * Project recommendations, project plans and the health check on a project.
 *
 * This is the contract behind the projects workspace's AI. It holds the same
 * promise the rest of the platform keeps: everything in it is derived from
 * what the candidate really has.
 *
 * The recommendations are built in two layers.
 *
 * The first layer is deterministic and always runs. The role catalogue already
 * carries real, curated portfolio work for every role — what a candidate at
 * that level is expected to be able to point at — and the candidate's own
 * skill gaps say which of those pieces of work would help them most. Pairing
 * the two produces a recommendation that is grounded in curated content and in
 * the candidate's own record, with no model involved.
 *
 * The second layer is the model, and it is optional. When it is available it
 * writes a richer plan for the chosen project — a specific title, a specific
 * sequence of steps, a specific way to present the result on a CV. When it is
 * not, the deterministic plan is returned unchanged and the caller is told
 * why. Nothing about the recommendation depends on the model being there.
 *
 * The health check works the same way. The problems it reports — a project
 * with no description, no deliverables, no technologies, a scope that cannot
 * be finished, and a project that demonstrates none of the target role's
 * skills — are all facts about the record that can be read directly. The model
 * only improves the wording of the suggestions.
 */

import { namesMatch, canonicalNameKey } from './jobDescription.ts';

// ---------------------------------------------------------------------------
// The context the recommendations are built from
// ---------------------------------------------------------------------------

/** The career level the platform records for a target role. */
export type CareerLevel = 'Entry' | 'Entry-Mid' | 'Mid' | 'Senior' | 'Lead';

/** One open skill gap in the candidate's record. */
export interface ProjectSkillGap {
  /** The skill, in the catalogue's wording. */
  name: string;
  /** How urgent the gap is. */
  priority: 'critical' | 'high' | 'medium' | 'low' | 'sufficient';
  /** How many levels are still missing. */
  gap: number;
}

/**
 * Everything the recommendation engine is allowed to reason about.
 *
 * Every field is read from the candidate's own records or from the curated
 * role catalogue. Nothing here is generated.
 */
export interface ProjectRecommendationContext {
  /** The role the candidate is aiming at. */
  targetRoleTitle: string | null;
  /** The level of that role. */
  careerLevel: CareerLevel | null;
  /** The skills the role expects, from the catalogue. */
  roleSkills: string[];
  /** The tools the role expects, from the catalogue. */
  roleTools: string[];
  /** The portfolio work the catalogue names for this role. */
  catalogueProjects: string[];
  /** The artefacts the catalogue names as evidence for this role. */
  catalogueEvidence: string[];
  /** The level-appropriate path the catalogue describes. */
  careerPath: string[];
  /** How the catalogue judges proficiency at this level. */
  proficiencyExpectations: string[];
  /** The gaps the candidate still has for this role. */
  openSkillGaps: ProjectSkillGap[];
  /** The skills the candidate already meets. */
  coveredSkills: string[];
  /** The skills the candidate has already rated, with their level. */
  currentSkills: { name: string; level: number }[];
  /** The skills the candidate's roadmap is working on. */
  roadmapSkills: string[];
  /** The courses the candidate has started but not finished. */
  learningInProgress: string[];
  /** The courses the candidate has completed. */
  completedCourses: string[];
  /** The projects the candidate already has. */
  existingProjects: ProjectRecord[];
  /** The job description, when the candidate has pasted one. */
  jobDescriptionTitle: string | null;
  /** The job description's requirements, when one is available. */
  jobDescriptionRequirements: string[];
}

/** The project record the engine reads. `ProjectDTO` satisfies this. */
export interface ProjectRecord {
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  difficulty: string | null;
  status: string | null;
  tasks: string[];
  deliverables: string[];
  skills: string[];
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** How hard the project is. */
export type ProjectDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/**
 * A resource the candidate can use.
 *
 * The URL is never written by a model. It is copied from a resource the
 * platform itself holds — a course in the learning catalogue — so a plan can
 * only point at something that exists.
 */
export interface ProjectResource {
  /** What the resource is. */
  label: string;
  /** Where it came from. */
  kind: 'course' | 'catalogue';
  /** The real URL, or null when the resource has no link. */
  url: string | null;
  /** Why it is relevant to this project. */
  note: string;
}

/** One milestone of a project. */
export interface ProjectMilestone {
  /** What the milestone is. */
  title: string;
  /** What is true when it is reached. */
  outcome: string;
}

/** A complete plan for one project. */
export interface ProjectPlan {
  /** A stable id for this plan. */
  id: string;
  /** The project's title. */
  title: string;
  /** Why this project suits this candidate. */
  whyItFits: string;
  /** The skills the project would develop. */
  skillsToDevelop: string[];
  /** The tools and technologies the project would use. */
  tools: string[];
  /** How hard it is. */
  difficulty: ProjectDifficulty;
  /** What the candidate ends up with. */
  expectedOutcome: string;
  /** The steps, in order. */
  steps: string[];
  /** The milestones. */
  milestones: ProjectMilestone[];
  /** What the candidate hands over at the end. */
  deliverables: string[];
  /** The resources that genuinely exist. */
  resources: ProjectResource[];
  /** How to present the finished project on a CV or in a portfolio. */
  cvPresentation: string;
  /** The gaps this project would close. */
  gapsAddressed: string[];
  /** The skills this project would use from what the candidate already has. */
  matchedSkills: string[];
  /** How well it fits, 0..100. */
  fitScore: number;
  /** True when the model wrote this plan rather than the deterministic engine. */
  aiGenerated: boolean;
}

/** The kinds of problem the health check reports. */
export type ProjectIssueKind =
  | 'missing_skills'
  | 'weak_description'
  | 'missing_deliverables'
  | 'unrealistic_scope'
  | 'missing_technologies'
  | 'poor_cv_presentation'
  | 'role_relevance';

/** How serious a problem is. */
export type ProjectIssueSeverity = 'high' | 'medium' | 'low';

/** One problem with a project, and what to do about it. */
export interface ProjectIssue {
  /** Which kind of problem it is. */
  kind: ProjectIssueKind;
  /** How serious it is. */
  severity: ProjectIssueSeverity;
  /** A short headline. */
  title: string;
  /** What the problem is. */
  detail: string;
  /** What to do about it. */
  suggestion: string;
}

/** The health report for one project. */
export interface ProjectHealthReport {
  /** The project the report is about. */
  projectId: string;
  /** Its title, so the report is readable on its own. */
  projectTitle: string;
  /** The problems found, most serious first. */
  issues: ProjectIssue[];
  /** A CV line for the project, written from what the record holds. */
  cvPresentation: string;
  /** The target-role skills the project already demonstrates. */
  relevantSkills: string[];
  /** The target-role skills the project does not yet demonstrate. */
  missingRoleSkills: string[];
  /** How strong the project is as evidence, 0..100. */
  score: number;
  /** True when the model improved the wording of the suggestions. */
  aiUsed: boolean;
}

// ---------------------------------------------------------------------------
// The deterministic layer
// ---------------------------------------------------------------------------

/**
 * A project the engine thinks is worth doing.
 *
 * The brief is the instruction the plan is written against: it says which gap
 * the project closes and which of the candidate's own skills it would build
 * on.
 */
export interface ProjectBrief {
  /** A stable id. */
  id: string;
  /** The title the plan will use. */
  title: string;
  /** The skill the project proves. */
  focusSkill: string;
  /** Why this project, for this candidate. */
  reason: string;
  /** The skills the candidate would bring to it. */
  buildingBlocks: string[];
  /** The gap it closes, when it closes one. */
  gapAddressed: string | null;
  /** The level it should be pitched at. */
  difficulty: ProjectDifficulty;
}

/** The longest a plan step may be. */
const MAX_STEP_LENGTH = 240;

/** Trims and bounds a generated line. */
function boundedLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.length > MAX_STEP_LENGTH ? `${trimmed.slice(0, MAX_STEP_LENGTH - 1)}…` : trimmed;
}

/** Coerces a model-provided list into clean strings. */
function coerceList(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const line = boundedLine(entry);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Picks the career path that matches the candidate's level.
 *
 * The catalogue describes three paths — entry, intermediate and advanced — and
 * a candidate at "Mid" should be reading the intermediate one, not the entry
 * one they have already passed.
 */
export function selectCareerPath(
  path: { entry: string[]; intermediate: string[]; advanced: string[] },
  level: CareerLevel | null
): string[] {
  // The catalogue describes three paths. A candidate is shown the one for
  // their level, and the one below it when the catalogue has nothing for
  // theirs — never nothing at all.
  if (!level) return path.intermediate.length > 0 ? path.intermediate : path.entry;

  const order: string[][] =
    level === 'Entry'
      ? [path.entry, path.intermediate]
      : level === 'Entry-Mid'
        ? [path.intermediate, path.entry]
        : level === 'Senior' || level === 'Lead'
          ? [path.advanced, path.intermediate, path.entry]
          : [path.intermediate, path.entry];

  for (const candidate of order) {
    if (candidate.length > 0) return candidate;
  }
  return [];
}

/**
 * The difficulty a project should be pitched at.
 *
 * It follows the candidate's level, with one adjustment: a project that closes
 * a critical gap is worth the extra difficulty, because the gap is what is
 * holding the candidate back.
 */
export function difficultyForBrief(
  level: CareerLevel | null,
  gapPriority: ProjectSkillGap['priority'] | null
): ProjectDifficulty {
  if (gapPriority === 'critical') return 'Advanced';
  if (level === 'Entry' || level === 'Entry-Mid') return 'Beginner';
  if (level === 'Mid') return 'Intermediate';
  if (level === 'Senior' || level === 'Lead') return 'Advanced';
  return 'Intermediate';
}

/**
 * Builds the candidate's briefs — the projects worth considering.
 *
 * The briefs come from two real sources and nothing else: the curated
 * portfolio work the role catalogue names, and the candidate's own skill gaps.
 * A candidate who has three open gaps gets briefs against the catalogue work
 * that would exercise those gaps; the catalogue work that matches nothing the
 * candidate needs is left out.
 *
 * The result is deliberately a short list. A recommendation the candidate
 * cannot act on is noise, so the briefs are ranked and the strongest few are
 * kept.
 */
export function deriveProjectBriefs(
  context: ProjectRecommendationContext,
  limit = 4
): ProjectBrief[] {
  const briefs: ProjectBrief[] = [];

  // The curated portfolio work for the role is the source of project concepts.
  // A candidate with no catalogue entry still gets briefs built from their
  // own gaps, because a gap is a project in itself.
  const concepts: Array<{ title: string; skill: string | null }> = [];

  for (const project of context.catalogueProjects) {
    concepts.push({ title: project, skill: null });
  }

  for (const gap of context.openSkillGaps) {
    if (gap.gap <= 0) continue;
    concepts.push({
      title: `Prove ${gap.name} with a project that puts it to work`,
      skill: gap.name,
    });
  }

  if (context.jobDescriptionRequirements.length > 0) {
    const firstRequirement = context.jobDescriptionRequirements[0];
    concepts.push({
      title: `Build something that demonstrates ${firstRequirement}`,
      skill: firstRequirement,
    });
  }

  const seen = new Set<string>();

  for (const concept of concepts) {
    const key = canonicalNameKey(concept.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Which of the candidate's gaps this concept would exercise.
    const addressed =
      context.openSkillGaps.find(
        (gap) =>
          gap.gap > 0 &&
          (namesMatch(concept.title, gap.name) ||
            context.jobDescriptionRequirements.some((requirement) =>
              namesMatch(concept.title, requirement)
            ))
      ) ?? null;

    // Which of the candidate's own skills the project would build on.
    const buildingBlocks = context.currentSkills
      .filter(
        (skill) =>
          context.roleSkills.some((roleSkill) => namesMatch(roleSkill, skill.name)) ||
          context.currentSkills.some((other) =>
            other.name !== skill.name && namesMatch(other.name, skill.name)
          )
      )
      .slice(0, 4)
      .map((skill) => skill.name);

    // A brief that neither closes a gap nor uses anything the candidate has is
    // not worth their time.
    const isRelevant =
      addressed !== null ||
      buildingBlocks.length > 0 ||
      context.jobDescriptionRequirements.some((requirement) =>
        namesMatch(concept.title, requirement)
      );

    if (!isRelevant) continue;

    briefs.push({
      id: `brief-${briefs.length + 1}-${key.replace(/\s+/g, '-').slice(0, 40)}`,
      title: concept.title,
      focusSkill: addressed?.name ?? concept.skill ?? context.roleSkills[0] ?? '',
      reason: addressed
        ? `Your ${addressed.name} is ${addressed.gap} level${addressed.gap === 1 ? '' : 's'} short of what ${context.targetRoleTitle ?? 'the role'} expects, and this project exercises exactly that skill.`
        : 'This is the portfolio work the catalogue names for your target role, and it builds on skills you already have.',
      buildingBlocks,
      gapAddressed: addressed?.name ?? null,
      difficulty: difficultyForBrief(context.careerLevel, addressed?.priority ?? null),
    });

    if (briefs.length >= limit) break;
  }

  return briefs;
}

/**
 * Builds a complete plan from the curated catalogue content.
 *
 * This is the plan the candidate gets when no model is available, and it is
 * also the floor the model's plan is measured against. Every line of it comes
 * from the role catalogue: the portfolio work names the project, the career
 * path names the steps, the proficiency expectations name the milestones and
 * the evidence suggestions name the deliverables.
 */
export function buildCatalogueProjectPlan(
  brief: ProjectBrief,
  context: ProjectRecommendationContext
): ProjectPlan {
  const steps = context.careerPath.length > 0 ? context.careerPath : [brief.title];

  const milestones: ProjectMilestone[] = context.proficiencyExpectations
    .slice(0, 4)
    .map((expectation) => ({
      title: expectation,
      outcome: `You can demonstrate ${brief.focusSkill || 'the core skill'} at the level this role expects.`,
    }));

  if (milestones.length === 0) {
    milestones.push({
      title: 'First working version',
      outcome: `The project runs end to end and shows ${brief.focusSkill || 'the core skill'} in use.`,
    });
  }

  const deliverables =
    context.catalogueEvidence.length > 0
      ? context.catalogueEvidence.slice(0, 5)
      : ['A public repository with the source code', 'A short write-up of the problem and the approach'];

  const tools = context.roleTools.slice(0, 6);

  return {
    id: brief.id.replace(/^brief-/, 'plan-'),
    title: brief.title,
    whyItFits: brief.reason,
    skillsToDevelop: brief.gapAddressed ? [brief.gapAddressed] : context.roleSkills.slice(0, 4),
    tools,
    difficulty: brief.difficulty,
    expectedOutcome:
      context.proficiencyExpectations[0] ??
      `You finish with a finished piece of work that shows ${brief.focusSkill || 'the role\'s core skill'} in use.`,
    steps,
    milestones,
    deliverables,
    resources: [],
    cvPresentation: buildCvPresentation(brief.title, brief.buildingBlocks),
    gapsAddressed: brief.gapAddressed ? [brief.gapAddressed] : [],
    matchedSkills: brief.buildingBlocks,
    fitScore: brief.gapAddressed ? 90 : 75,
    aiGenerated: false,
  };
}

/**
 * Writes the CV line for a project from what the record holds.
 *
 * The line names the project and the skills it used, and nothing else. A
 * metric or an outcome is only ever included when the candidate wrote one.
 */
export function buildCvPresentation(
  title: string,
  skills: string[],
  outcome?: string | null
): string {
  const trimmedTitle = title.trim();
  const parts = [trimmedTitle];
  if (skills.length > 0) parts.push(`(${skills.slice(0, 4).join(', ')})`);
  if (outcome && outcome.trim()) parts.push(`— ${outcome.trim()}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// The health check
// ---------------------------------------------------------------------------

/**
 * Reads the problems out of a project record.
 *
 * Every rule here is a fact about the record, not a judgement a model made:
 * a project with no deliverables has no deliverables, and a project whose
 * technologies do not appear anywhere in the target role does not demonstrate
 * that role. The severity scale is the only judgement, and it is a fixed one.
 */
export function analyzeProjectRecord(
  project: ProjectRecord,
  context: ProjectRecommendationContext
): {
  issues: ProjectIssue[];
  relevantSkills: string[];
  missingRoleSkills: string[];
  score: number;
  cvPresentation: string;
} {
  const issues: ProjectIssue[] = [];

  const description = project.description?.trim() ?? '';
  const goal = project.goal?.trim() ?? '';

  // --- A weak description --------------------------------------------------
  if (!description || description.length < 40) {
    issues.push({
      kind: 'weak_description',
      severity: 'high',
      title: 'The description does not explain the project',
      detail: description
        ? `The description is ${description.length} characters long, which is too short to tell a recruiter what the project does.`
        : 'There is no description on this project, so nobody reading your portfolio can tell what it does.',
      suggestion:
        'Write two or three sentences: the problem, the approach you took, and what it does. Keep it to what you actually built.',
    });
  } else if (!/[.!?]/.test(description)) {
    issues.push({
      kind: 'weak_description',
      severity: 'low',
      title: 'The description is a fragment',
      detail: 'The description has no full stop, which usually means it was left as a note rather than written.',
      suggestion: 'Write it as complete sentences so it reads as a project description.',
    });
  }

  // --- No deliverables -----------------------------------------------------
  if (project.deliverables.length === 0) {
    issues.push({
      kind: 'missing_deliverables',
      severity: 'high',
      title: 'There is nothing to show at the end of it',
      detail:
        'A project with no deliverables cannot be evidenced: there is no artefact a recruiter can open.',
      suggestion:
        'List what you will hand over — a public repository, a live demo, a short write-up, a test suite.',
    });
  }

  // --- No technologies -----------------------------------------------------
  if (project.skills.length === 0) {
    issues.push({
      kind: 'missing_technologies',
      severity: 'high',
      title: 'No technologies are recorded',
      detail:
        'The project lists no skills, so it cannot be matched against a job description and the work you did is invisible.',
      suggestion:
        'Add the languages, frameworks and tools the project actually uses. These are the words an applicant filter scans for.',
    });
  }

  // --- Scope that cannot be finished ---------------------------------------
  const status = project.status ?? 'idea';
  const isActive = status === 'in_progress' || status === 'completed' || status === 'published';
  if (isActive && project.tasks.length === 0) {
    issues.push({
      kind: 'unrealistic_scope',
      severity: 'medium',
      title: 'There is no plan behind the work',
      detail: `This project is marked "${status}" but has no tasks, so there is no record of what building it involved.`,
      suggestion:
        'Break the work into a handful of tasks. The list is what turns a project into evidence of how you work.',
    });
  } else if (project.tasks.length > 12) {
    issues.push({
      kind: 'unrealistic_scope',
      severity: 'medium',
      title: 'The scope is very large',
      detail: `There are ${project.tasks.length} tasks on this project. That is a lot of scope for one portfolio project.`,
      suggestion:
        'Cut the scope to what you can finish and publish. A finished small project is worth more than an unfinished large one.',
    });
  }

  if (status === 'completed' && project.deliverables.length === 0) {
    issues.push({
      kind: 'unrealistic_scope',
      severity: 'high',
      title: 'It is marked complete but nothing was produced',
      detail:
        'The project is marked as completed, yet no deliverables were recorded for it.',
      suggestion: 'Record what you actually produced, or move the status back until it is true.',
    });
  }

  // --- How well it presents on a CV ----------------------------------------
  const cvReady = description.length >= 40 && project.skills.length > 0;
  if (!cvReady) {
    issues.push({
      kind: 'poor_cv_presentation',
      severity: 'medium',
      title: 'It cannot be presented on a CV yet',
      detail:
        'A CV line needs a description and the technologies used. One or both is missing, so there is nothing to write.',
      suggestion:
        'Once the description and the technologies are recorded, this project can be turned into one or two CV bullets.',
    });
  }

  // --- Relevance to the target role ----------------------------------------
  const relevantSkills = project.skills.filter((skill) =>
    context.roleSkills.some((roleSkill) => namesMatch(roleSkill, skill))
  );
  const coveredRoleSkills = context.roleSkills.filter((roleSkill) =>
    project.skills.some((skill) => namesMatch(roleSkill, skill))
  );

  const missingRoleSkills = context.openSkillGaps
    .filter((gap) => gap.gap > 0)
    .filter((gap) => !project.skills.some((skill) => namesMatch(skill, gap.name)))
    .map((gap) => gap.name);

  // The gaps this project does exercise. A project that closes one of the
  // candidate's gaps is doing its job even when it does not close them all.
  const coveredGapCount = context.openSkillGaps.filter(
    (gap) => gap.gap > 0 && project.skills.some((skill) => namesMatch(skill, gap.name))
  ).length;

  if (context.roleSkills.length > 0 && coveredRoleSkills.length === 0) {
    issues.push({
      kind: 'role_relevance',
      severity: 'high',
      title: 'It does not demonstrate anything the role asks for',
      detail: context.targetRoleTitle
        ? `None of this project's technologies appear in the skill list for ${context.targetRoleTitle}.`
        : 'None of this project\'s technologies appear in your target role\'s skill list.',
      suggestion:
        'Either add the skills this project really used, or turn it into something that exercises what the role needs.',
    });
  }

  if (missingRoleSkills.length > 0 && coveredGapCount === 0 && project.skills.length > 0) {
    issues.push({
      kind: 'missing_skills',
      severity: 'medium',
      title: 'It does not close the gaps you still have',
      detail: `Your open gaps are ${missingRoleSkills.slice(0, 4).join(', ')}, and this project uses none of them.`,
      suggestion: `Extend the project so it exercises ${missingRoleSkills[0]}, or pick a different project that does.`,
    });
  }

  const severityWeight: Record<ProjectIssueSeverity, number> = { high: 25, medium: 12, low: 6 };
  const penalty = issues.reduce((total, issue) => total + severityWeight[issue.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const order: Record<ProjectIssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind)
  );

  return {
    issues,
    relevantSkills,
    missingRoleSkills,
    score,
    cvPresentation: buildCvPresentation(project.title, project.skills, goal || null),
  };
}

/**
 * True when the candidate's skill list already covers a name.
 */
export function skillIsCovered(skills: string[], name: string): boolean {
  return skills.some((skill) => namesMatch(skill, name));
}

/**
 * The candidate's skills that the target role expects.
 */
export function skillsForRole(roleSkills: string[], currentSkills: { name: string; level: number }[]): string[] {
  return currentSkills
    .filter((skill) => roleSkills.some((roleSkill) => namesMatch(roleSkill, skill.name)))
    .map((skill) => skill.name);
}

// ---------------------------------------------------------------------------
// Validating what the model produced
// ---------------------------------------------------------------------------

/**
 * Validates a raw model payload against the project plan contract.
 */
export function validateProjectPlanPayload(payload: unknown): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('The payload is not an object.');
    return errors;
  }
  const record = payload as Record<string, unknown>;

  if (typeof record.title !== 'string' || !record.title.trim()) {
    errors.push('title must be a non-empty string.');
  }
  if (typeof record.whyItFits !== 'string' || !record.whyItFits.trim()) {
    errors.push('whyItFits must be a non-empty string.');
  }
  if (typeof record.expectedOutcome !== 'string' || !record.expectedOutcome.trim()) {
    errors.push('expectedOutcome must be a non-empty string.');
  }
  if (typeof record.cvPresentation !== 'string' || !record.cvPresentation.trim()) {
    errors.push('cvPresentation must be a non-empty string.');
  }

  const difficulties = ['Beginner', 'Intermediate', 'Advanced'];
  if (typeof record.difficulty !== 'string' || !difficulties.includes(record.difficulty)) {
    errors.push('difficulty must be Beginner, Intermediate or Advanced.');
  }

  for (const field of ['skillsToDevelop', 'tools', 'steps', 'deliverables'] as const) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      errors.push(`${field} must be an array of strings.`);
    }
  }

  if (record.milestones !== undefined && record.milestones !== null) {
    if (!Array.isArray(record.milestones)) {
      errors.push('milestones must be an array.');
    } else {
      for (const entry of record.milestones) {
        if (!entry || typeof entry !== 'object') {
          errors.push('every milestone must be an object.');
          break;
        }
        const item = entry as Record<string, unknown>;
        if (typeof item.title !== 'string' || !item.title.trim()) {
          errors.push('every milestone needs a title.');
          break;
        }
        if (typeof item.outcome !== 'string' || !item.outcome.trim()) {
          errors.push('every milestone needs an outcome.');
          break;
        }
      }
    }
  }

  return errors;
}

/**
 * Turns a validated model payload into a project plan.
 *
 * The resources are not taken from the payload. The model is not allowed to
 * name a URL: the caller attaches the resources the platform itself holds.
 */
export function parseProjectPlanPayload(payload: unknown): Omit<ProjectPlan, 'resources'> | null {
  if (validateProjectPlanPayload(payload).length > 0) return null;
  const record = (payload ?? {}) as Record<string, unknown>;

  const milestones: ProjectMilestone[] = Array.isArray(record.milestones)
    ? record.milestones
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          title: String(entry.title).trim(),
          outcome: String(entry.outcome).trim(),
        }))
    : [];

  return {
    id: typeof record.id === 'string' && record.id ? record.id : 'plan-ai',
    title: String(record.title).trim(),
    whyItFits: String(record.whyItFits).trim(),
    skillsToDevelop: coerceList(record.skillsToDevelop, 12),
    tools: coerceList(record.tools, 12),
    difficulty: record.difficulty as ProjectDifficulty,
    expectedOutcome: String(record.expectedOutcome).trim(),
    steps: coerceList(record.steps, 20),
    milestones,
    deliverables: coerceList(record.deliverables, 12),
    cvPresentation: String(record.cvPresentation).trim(),
    gapsAddressed: [],
    matchedSkills: [],
    fitScore: 0,
    aiGenerated: true,
  };
}

/**
 * Validates a raw model payload against the health-check contract.
 */
export function validateProjectHealthPayload(payload: unknown): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('The payload is not an object.');
    return errors;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.cvPresentation !== 'string' || !record.cvPresentation.trim()) {
    errors.push('cvPresentation must be a non-empty string.');
  }
  if (record.improvements !== undefined && record.improvements !== null) {
    if (!Array.isArray(record.improvements)) {
      errors.push('improvements must be an array.');
    } else {
      for (const entry of record.improvements) {
        if (typeof entry !== 'string') {
          errors.push('improvements must contain only strings.');
          break;
        }
      }
    }
  }
  return errors;
}

/**
 * Turns a validated model payload into the wording of the health report.
 */
export function parseProjectHealthPayload(payload: unknown): {
  cvPresentation: string;
  improvements: string[];
} | null {
  if (validateProjectHealthPayload(payload).length > 0) return null;
  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    cvPresentation: String(record.cvPresentation).trim(),
    improvements: coerceList(record.improvements, 10),
  };
}

/**
 * Turns a model payload holding several plans into the plans it contains.
 *
 * One model call writes the whole set, which keeps the request affordable and
 * the plans consistent with one another. A plan that does not satisfy the
 * contract is dropped rather than repaired, so the caller can fall back to
 * the deterministic plan for exactly that entry.
 */
export function parseProjectPlansPayload(
  payload: unknown
): Array<Omit<ProjectPlan, 'resources'>> | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.plans)) return null;

  const plans: Array<Omit<ProjectPlan, 'resources'>> = [];
  for (const entry of record.plans) {
    const parsed = parseProjectPlanPayload(entry);
    if (!parsed) continue;
    plans.push(parsed);
  }
  return plans;
}
