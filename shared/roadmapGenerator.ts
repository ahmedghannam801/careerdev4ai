/**
 * Role-aware roadmap generator.
 *
 * The previous roadmap was assembled inside the React context with one fixed
 * five-phase template. The phases, the task titles and the descriptions were
 * identical for every career; only the skill names changed. A Business
 * Analyst, a Data Scientist and an HR Generalist all received the same
 * "Understand the fundamentals / Build your technical foundation" plan.
 *
 * This module replaces that template with a plan that is derived from the
 * role catalogue and from the user's own skill levels:
 *
 *   - the phase structure comes from the role's own named paths
 *     (entryPath / intermediatePath / advancedPath) and its responsibilities;
 *   - the work items are the user's actual skill gaps, prioritised;
 *   - skills the user already meets are recorded but do not generate work;
 *   - every task carries prerequisites, an effort estimate, a difficulty, a
 *     recommended learning resource and a recommended project.
 *
 * The generator is pure and lives in `shared/` so the server and the browser
 * run exactly the same code, and so it can be tested without a database.
 */

import type { RoleDefinition, SkillCategory } from './careerTypes.ts';
import { skillMatchConfidence } from './skillMatching.ts';
import {
  computeSkillGaps,
  describeGap,
  difficultyForLevel,
  normalizeSkillName,
  openSkillGaps,
  summarizeSkillGaps,
  type RatedSkill,
  type RoleSkillRequirements,
  type SkillGap,
  type SkillGapPriority,
} from './skillGap.ts';

export type RoadmapTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked';

export type TaskDifficulty = 'foundational' | 'intermediate' | 'advanced';

/** A learning resource the plan can point a task at. */
export interface RoadmapResourceRef {
  id: string;
  title: string;
  provider: string;
  url: string;
  durationHours: number | null;
}

/** A learning resource plus the skills it teaches, used for matching. */
export interface RoadmapResourceCandidate extends RoadmapResourceRef {
  skillNames?: string[];
}

/** A project the plan can point a task at. */
export interface RoadmapProjectRef {
  title: string;
  description: string;
  /** 'role' entries come from the catalogue, 'user' from the user's own work. */
  source: 'role' | 'user';
}

/** A project plus the skills it demonstrates, used for matching. */
export interface RoadmapProjectCandidate extends RoadmapProjectRef {
  skillNames?: string[];
}

export interface RoadmapTaskPlan {
  title: string;
  description: string;
  /** Every skill this task moves the user on. */
  skillNames: string[];
  /** The gap that produced this task, when it came from one. */
  primarySkillName: string | null;
  /** Titles of tasks that must be finished first. */
  prerequisites: string[];
  estimatedHours: number;
  /**
   * The KIND of work this task is.
   *
   * It is what makes the time estimate break down honestly: a plan that says
   * "12 hours" is not a plan unless it says how those hours are spent.
   */
  workKind: RoadmapStageWorkKind;
  difficulty: TaskDifficulty;
  status: RoadmapTaskStatus;
  resources: RoadmapResourceRef[];
  projects: RoadmapProjectRef[];
  sortOrder: number;
  /** Plain-language reason this task is in this user's plan. */
  rationale: string;
  priority: SkillGapPriority;
  /** True when the task came from the role catalogue rather than a gap. */
  fromRole: boolean;
}

export interface RoadmapMilestonePlan {
  title: string;
  description: string;
  tasks: RoadmapTaskPlan[];
  sortOrder: number;
}

export interface RoadmapPhasePlan {
  title: string;
  description: string;
  goal: string;
  milestones: RoadmapMilestonePlan[];
  sortOrder: number;
  skillNames: string[];
}

export interface RoadmapPlanSummary {
  totalTasks: number;
  estimatedHours: number;
  /**
   * How the total is spent.
   *
   * The parts add up to `estimatedHours` exactly, so "12h total" is never a
   * number without a breakdown.
   */
  timeBreakdown: RoadmapTimeBreakdown;
  readinessPct: number;
  /** Open gaps on the role's CORE requirements. */
  openGaps: number;
  /** Open gaps on the role's preferred, stretch requirements. */
  openPreferredGaps: number;
  coveredSkills: string[];
  tasksByPriority: Record<SkillGapPriority, number>;
}

export type {
  RoadmapTimeBreakdown,
  RoadmapStageWorkKind,
} from './roadmapTimeBreakdown.ts';

export {
  TIME_BREAKDOWN_LABELS,
  TIME_BREAKDOWN_ORDER,
  emptyTimeBreakdown,
  normalizeWorkKind,
  timeBreakdownParts,
  breakdownTotal,
  addTimeBreakdowns,
  computeTimeBreakdown,
} from './roadmapTimeBreakdown.ts';

import {
  computeTimeBreakdown,
  type RoadmapStageWorkKind,
  type RoadmapTimeBreakdown,
} from './roadmapTimeBreakdown.ts';

export interface RoadmapPlan {
  title: string;
  description: string;
  domainId: string;
  targetRoleId: string;
  targetRoleTitle: string;
  phases: RoadmapPhasePlan[];
  summary: RoadmapPlanSummary;
}

export interface RoadmapGenerationInput {
  role: RoleDefinition;
  userSkills: RatedSkill[];
  /** Learning catalogue rows that may be recommended. */
  resources?: RoadmapResourceCandidate[];
  /** Projects that may be recommended (catalogue and user owned). */
  projects?: RoadmapProjectCandidate[];
}

/** Milestone titles per skill category — this is what makes two roles with
 *  the same phase count read as genuinely different roadmaps. */
const CATEGORY_LABELS: Record<SkillCategory, string> = {
  technical: 'Technical Foundations',
  analytical: 'Analytical & Research Practice',
  business: 'Business & Commercial Acumen',
  communication: 'Communication & Collaboration',
  leadership: 'Leadership & Influence',
  tools: 'Tooling & Platforms',
  domain: 'Domain Knowledge',
  soft_skills: 'Ways of Working',
};

const CATEGORY_DESCRIPTIONS: Record<SkillCategory, string> = {
  technical: 'Build the hands-on technical grounding the role is hired for.',
  analytical: 'Prove you can turn ambiguous evidence into a clear recommendation.',
  business: 'Connect the work to value the business is measured on.',
  communication: 'Become the person who can move a room and write a decision memo.',
  leadership: 'Take ownership beyond your own tasks and influence without authority.',
  tools: 'Get fluent in the specific tools the team expects you to open on day one.',
  domain: 'Learn the language, constraints and rules of the industry you are entering.',
  soft_skills: 'Build the working habits that make the rest of the plan stick.',
};

/** Proficiency band each phase targets. */
const PHASE_PROFICIENCY: Record<number, string> = {
  0: 'Entry',
  1: 'Mid',
  2: 'Senior',
};

const PHASE_TITLES = [
  'Foundations',
  'Core Delivery',
  'Advanced Practice',
  'Market Readiness',
];

const PHASE_DESCRIPTIONS = [
  'Get the skills you have no rating for onto the board first. Nothing later can be assessed until these exist.',
  'Turn the foundations into delivery. These are the skills a hiring manager will actually probe in the first round.',
  'Move from doing the work to owning it. This is the band that separates a practitioner from a senior one.',
  'Make the career real: certifications, proof of work, and the ability to talk about it under pressure.',
];

const STAGE_BASE_HOURS = [6, 8, 10];

/**
 * Builds a complete roadmap plan for one user and one target role.
 */
export function generateRoadmapPlan(input: RoadmapGenerationInput): RoadmapPlan {
  const { role, userSkills, resources = [], projects = [] } = input;

  const requirements: RoleSkillRequirements = {
    requiredSkills: role.coreSkills ?? [],
    preferredSkills: role.preferredSkills ?? [],
  };

  const gaps = computeSkillGaps(requirements, userSkills);
  const summaryStats = summarizeSkillGaps(gaps, requirements);
  const openGaps = openSkillGaps(gaps);
  const openRequiredGaps = openGaps.filter((gap) => gap.required);
  const openPreferredGaps = openGaps.filter((gap) => !gap.required);

  // Split the open gaps into the three skill-building phases.
  const staged: SkillGap[][] = [[], [], []];
  for (const gap of openGaps) {
    if (!gap.required) continue;
    staged[stageForGap(gap)].push(gap);
  }

  // Preferred skills are stretch goals and belong to the final phase.
  const stretchGaps = openPreferredGaps.filter((gap) => gap.gap >= 2);

  const roleProjects = (role.projects ?? []).map((title) => ({
    title,
    description: `A portfolio-scale piece of work that proves you can do this role. ${title}.`,
    source: 'role' as const,
    skillNames: [],
  }));

  const userProjects = projects.map((project) => ({
    title: project.title,
    description: project.description,
    source: 'user' as const,
    skillNames: project.skillNames ?? [],
  }));

  const allProjects = [...userProjects, ...roleProjects];

  const phases: RoadmapPhasePlan[] = [];

  for (let stage = 0; stage < 3; stage += 1) {
    const stageGaps = staged[stage];
    const milestones = buildSkillMilestones(
      stageGaps,
      stage,
      role,
      resources,
      allProjects,
      stage === 0 ? 0 : stage,
    );

    // A phase with no gaps would look broken. Fall back to the role's own
    // named path so the phase still teaches something role-specific.
    if (milestones.length === 0) {
      const fallback = buildFallbackMilestone(stage, role, resources, allProjects);
      if (fallback) milestones.push(fallback);
    }

    phases.push({
      title: `${role.title} ${PHASE_TITLES[stage]}`,
      description: PHASE_DESCRIPTIONS[stage],
      goal: roleGoal(stage, role),
      milestones,
      sortOrder: stage,
      skillNames: stageGaps.map((gap) => gap.name),
    });
  }

  phases.push(buildMarketReadinessPhase(role, stretchGaps, resources, allProjects));

  linkPrerequisites(phases);

  const tasksByPriority: Record<SkillGapPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    sufficient: 0,
  };
  let totalTasks = 0;
  let estimatedHours = 0;
  // The hours are counted by the KIND of work they are spent on, so the
  // total can always be broken down. The parts add up to the total exactly:
  // nothing is rounded away and nothing is hidden in a remainder.
  const planTasks: Array<{ estimatedHours: number; workKind: RoadmapStageWorkKind }> = [];
  for (const phase of phases) {
    for (const milestone of phase.milestones) {
      for (const task of milestone.tasks) {
        totalTasks += 1;
        estimatedHours += task.estimatedHours;
        planTasks.push({ estimatedHours: task.estimatedHours, workKind: task.workKind });
        tasksByPriority[task.priority] += 1;
      }
    }
  }
  const timeBreakdown: RoadmapTimeBreakdown = computeTimeBreakdown(planTasks);

  const coveredSkills = gaps
    .filter((gap) => gap.gap === 0)
    .map((gap) => gap.name);

  return {
    title: `${role.title} Roadmap`,
    description: buildPlanDescription(role, summaryStats.readinessPct, openRequiredGaps.length),
    domainId: role.domainId,
    targetRoleId: role.id,
    targetRoleTitle: role.title,
    phases,
    summary: {
      totalTasks,
      estimatedHours,
      timeBreakdown,
      readinessPct: summaryStats.readinessPct,
      openGaps: openRequiredGaps.length,
      openPreferredGaps: openPreferredGaps.length,
      coveredSkills,
      tasksByPriority,
    },
  };
}

/**
 * Which phase a gap belongs to.
 *
 * The decision is driven by where the user already is, not only by the level
 * the role wants. Someone with no rating for a skill is building it from
 * scratch, so that work belongs in the foundations phase even when the role
 * ultimately expects a senior level.
 */
function stageForGap(gap: SkillGap): number {
  if (gap.currentLevel === 0) return 0;
  if (gap.currentLevel <= 2) return 1;
  return 2;
}

/** Groups the stage's gaps into one milestone per skill category. */
function buildSkillMilestones(
  gaps: SkillGap[],
  stage: number,
  role: RoleDefinition,
  resources: RoadmapResourceCandidate[],
  projects: RoadmapProjectCandidate[],
  responsibilityOffset: number,
): RoadmapMilestonePlan[] {
  if (gaps.length === 0) return [];

  const byCategory = new Map<SkillCategory, SkillGap[]>();
  for (const gap of gaps) {
    const list = byCategory.get(gap.category) ?? [];
    list.push(gap);
    byCategory.set(gap.category, list);
  }

  const milestones: RoadmapMilestonePlan[] = [];
  let order = 0;
  let responsibilityIndex = responsibilityOffset;

  for (const [category, categoryGaps] of byCategory) {
    const tasks = categoryGaps.map((gap, index) =>
      buildGapTask(gap, stage, role, resources, projects, responsibilityIndex + index),
    );
    responsibilityIndex += categoryGaps.length;

    milestones.push({
      title: CATEGORY_LABELS[category],
      description: CATEGORY_DESCRIPTIONS[category],
      tasks,
      sortOrder: order,
    });
    order += 1;
  }

  return milestones;
}

/** Builds one task from one skill gap. */
function buildGapTask(
  gap: SkillGap,
  stage: number,
  role: RoleDefinition,
  resources: RoadmapResourceCandidate[],
  projects: RoadmapProjectCandidate[],
  responsibilityIndex: number,
): RoadmapTaskPlan {
  const responsibilities = role.responsibilities ?? [];
  const responsibility = responsibilities.length
    ? responsibilities[responsibilityIndex % responsibilities.length]
    : '';

  const expectation =
    role.proficiencyExpectations?.find(
      (entry) => entry.level === PHASE_PROFICIENCY[stage],
    )?.expectation ?? '';

  const title = taskTitle(stage, gap, role);
  const descriptionParts = [
    responsibility,
    `Bring ${gap.name} from ${gap.currentLevel}/5 to the ${gap.requiredLevel}/5 this role expects.`,
  ];
  if (expectation) descriptionParts.push(expectation);

  const matchedResources = matchResources(gap, resources).slice(0, 2);
  const matchedProjects = matchProjects(gap, projects).slice(0, 2);
  if (matchedProjects.length > 0) {
    descriptionParts.push(
      `Prove it with: ${matchedProjects.map((project) => project.title).join('; ')}.`,
    );
  }

  return {
    title,
    description: descriptionParts.filter(Boolean).join(' '),
    skillNames: [gap.name],
    primarySkillName: gap.name,
    prerequisites: [],
    estimatedHours: estimateHours(stage, gap),
    workKind: stage === 0 ? 'learning' : stage === 1 ? 'learning' : 'practice',
    difficulty: difficultyForLevel(gap.requiredLevel),
    status: 'not_started',
    resources: matchedResources.map(stripResourceSkillNames),
    projects: matchedProjects.map(stripProjectSkillNames),
    sortOrder: 0,
    rationale: describeGap(gap),
    priority: gap.priority,
    fromRole: false,
  };
}

/**
 * When a phase has no skill gaps left, the role's own named path still has
 * something to say. This keeps a fully-qualified user on a meaningful plan
 * instead of an empty one.
 */
function buildFallbackMilestone(
  stage: number,
  role: RoleDefinition,
  resources: RoadmapResourceCandidate[],
  projects: RoadmapProjectCandidate[],
): RoadmapMilestonePlan | null {
  const path =
    stage === 0
      ? role.entryPath
      : stage === 1
        ? role.entryPath
        : role.intermediatePath;
  const goal = path && path.length ? path[Math.min(stage, path.length - 1)] : null;
  if (!goal) return null;

  const tools = role.tools ?? [];
  const description = [
    goal,
    tools.length
      ? `Use the tools this role actually runs on: ${tools.slice(0, 4).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    title: `${role.title} ${PHASE_TITLES[stage]}`,
    description:
      'You already meet the role requirements recorded for this stage, so this step is about applying them in a real setting.',
    tasks: [
      {
        title: goal,
        description,
        // This step comes from the role's own path, not from a gap, so it
        // deliberately claims no skill gap. Attaching one would claim the
        // user still needs work on something they have already met.
        skillNames: [],
        primarySkillName: null,
        prerequisites: [],
        estimatedHours: STAGE_BASE_HOURS[stage] * 2,
        workKind: 'practice',
        difficulty: difficultyForLevel(stage + 2),
        status: 'not_started',
        resources: matchResourcesByTopic(role, resources).slice(0, 2).map(stripResourceSkillNames),
        projects: (projects.length ? projects.slice(0, 2) : []).map(stripProjectSkillNames),
        sortOrder: 0,
        rationale:
          'Your recorded skills already cover the core requirement for this stage, so this step focuses on real-world application.',
        priority: 'low',
        fromRole: true,
      },
    ],
    sortOrder: 0,
  };
}

/**
 * The final phase: certifications, proof of work and interview readiness.
 * Every item is drawn from the role catalogue, so it differs per role.
 */
function buildMarketReadinessPhase(
  role: RoleDefinition,
  stretchGaps: SkillGap[],
  resources: RoadmapResourceCandidate[],
  projects: RoadmapProjectCandidate[],
): RoadmapPhasePlan {
  const milestones: RoadmapMilestonePlan[] = [];
  let order = 0;

  if (stretchGaps.length > 0) {
    milestones.push({
      title: 'Stretch the Role',
      description:
        'Skills this role values that are not strictly required. They are what separates a shortlisted candidate from the strongest one.',
      tasks: stretchGaps.map((gap, index) =>
        buildGapTask(gap, 2, role, resources, projects, index),
      ),
      sortOrder: order,
    });
    order += 1;
  }

  const readinessTasks: RoadmapTaskPlan[] = [];
  const certification = role.certifications?.[0];
  if (certification) {
    readinessTasks.push({
      title: `Work towards ${certification}`,
      description: `${role.title} roles are frequently screened for ${certification}. Start it once the core skills above are in place.`,
      skillNames: [],
      primarySkillName: null,
      prerequisites: [],
      estimatedHours: 20,
      workKind: 'learning',
      difficulty: 'intermediate',
      status: 'not_started',
      resources: [],
      projects: [],
      sortOrder: readinessTasks.length,
      rationale: `A credential this role explicitly asks for in ${role.title} postings.`,
      priority: 'medium',
      fromRole: true,
    });
  }

  const evidence = role.evidence?.[0];
  if (evidence) {
    readinessTasks.push({
      title: 'Produce one piece of evidence',
      description: `${evidence}. Build it as a real, shareable artefact and attach it to your profile.`,
      skillNames: [],
      primarySkillName: null,
      prerequisites: [],
      estimatedHours: 12,
      workKind: 'project',
      difficulty: 'intermediate',
      status: 'not_started',
      resources: [],
      projects: [],
      sortOrder: readinessTasks.length,
      rationale: `Recruiters for ${role.title} roles look for exactly this kind of artefact.`,
      priority: 'medium',
      fromRole: true,
    });
  }

  const interviewTopic = role.interviewTopics?.[0];
  if (interviewTopic) {
    readinessTasks.push({
      title: 'Practise the interview loop',
      description: `Prepare to answer: ${interviewTopic}. These are the questions ${role.title} hiring panels actually ask.`,
      skillNames: [],
      primarySkillName: null,
      prerequisites: [],
      estimatedHours: 6,
      workKind: 'application',
      difficulty: 'intermediate',
      status: 'not_started',
      resources: [],
      projects: [],
      sortOrder: readinessTasks.length,
      rationale: `Specific to ${role.title} interviews rather than generic preparation.`,
      priority: 'low',
      fromRole: true,
    });
  }

  if (readinessTasks.length > 0) {
    milestones.push({
      title: 'Credibility and Proof',
      description:
        'The part of a career that is decided outside the skills checklist: proof, credentials and how you talk about your work.',
      tasks: readinessTasks,
      sortOrder: order,
    });
    order += 1;
  }

  return {
    title: `${role.title} ${PHASE_TITLES[3]}`,
    description: PHASE_DESCRIPTIONS[3],
    goal: roleGoal(3, role),
    milestones,
    sortOrder: 3,
    skillNames: stretchGaps.map((gap) => gap.name),
  };
}

/** The goal line shown at the top of each phase, taken from the role's paths. */
function roleGoal(stage: number, role: RoleDefinition): string {
  const path =
    stage === 0
      ? role.entryPath
      : stage === 1
        ? role.intermediatePath
        : stage === 2
          ? role.advancedPath
          : role.advancedPath;
  if (path && path.length) {
    return stage === 3 ? 'Be credible and hireable for this role.' : path[0];
  }
  return `Reach the level this role expects and prove it.`;
}

/** Task title, shaped by the stage so the same skill reads differently. */
function taskTitle(stage: number, gap: SkillGap, role: RoleDefinition): string {
  if (stage === 0) return `Learn ${gap.name}`;
  if (stage === 1) return `Apply ${gap.name} in ${role.title} work`;
  return `Own ${gap.name} end to end`;
}

/** Effort estimate, scaled by how far behind the user is. */
function estimateHours(stage: number, gap: SkillGap): number {
  const base = STAGE_BASE_HOURS[stage] ?? 8;
  const raw = base + gap.gap * 2;
  return Math.max(2, Math.min(40, Math.round(raw / 2) * 2));
}

/**
 * Picks the learning resources that address a gap.
 *
 * A resource has to actually teach the skill, and its level has to suit the
 * level the user is trying to reach.
 *
 * Matching uses the shared `skillMatchConfidence` rather than a loose token
 * overlap. Only a declared alternative (confidence 1) or a full token-subset
 * match (0.8) is accepted: sharing one word such as "data", "management" or
 * "documentation" is not evidence that a resource teaches the gap.
 */
export function matchResources(
  gap: SkillGap,
  resources: RoadmapResourceCandidate[],
): RoadmapResourceRef[] {
  const scored: { resource: RoadmapResourceCandidate; score: number }[] =
    [];

  for (const resource of resources) {
    const names = resource.skillNames ?? [];
    let best = 0;
    for (const name of names) {
      const confidence = skillMatchConfidence(name, gap.name);
      if (confidence >= 1) {
        best = Math.max(best, 100);
      } else if (confidence >= 0.8) {
        best = Math.max(best, 80);
      }
    }
    if (best === 0) continue;

    // Prefer a resource that is not far above what the user is aiming at.
    const levelFit = levelFitScore(resource.title, resource.durationHours, gap.requiredLevel);
    scored.push({ resource, score: best + levelFit });
  }

  scored.sort((a, b) => b.score - a.score || (a.resource.durationHours ?? 999) - (b.resource.durationHours ?? 999));
  return scored.map((entry) => entry.resource);
}

/**
 * Resources matched against a role's learning topics (fallback path use).
 *
 * The same conservative matcher applies: a topic only selects a resource when
 * the resource explicitly teaches that topic. This path runs when the user has
 * no gaps left, so a weak match here would attach unrelated material to a
 * stage that is about applying existing skills.
 */
function matchResourcesByTopic(
  role: RoleDefinition,
  resources: RoadmapResourceCandidate[],
): RoadmapResourceCandidate[] {
  const topics = (role.learningTopics ?? []).filter(Boolean);
  if (!topics.length) return [];
  return resources.filter((resource) => {
    const names = resource.skillNames ?? [];
    return names.some((name) =>
      topics.some((topic) => skillMatchConfidence(name, topic) >= 0.8)
    );
  });
}

/** Picks the projects that demonstrate a skill. */
export function matchProjects(
  gap: SkillGap,
  projects: RoadmapProjectCandidate[],
): RoadmapProjectRef[] {
  const target = normalizeSkillName(gap.name);
  const scored: { project: RoadmapProjectCandidate; score: number }[] = [];

  for (const project of projects) {
    const names = project.skillNames ?? [];
    let score = 0;
    for (const name of names) {
      const normalized = normalizeSkillName(name);
      if (normalized === target) score = Math.max(score, 100);
      else if (normalized.includes(target) || target.includes(normalized)) score = Math.max(score, 60);
    }
    if (score === 0) {
      // Catalogue projects have no skill tags, so fall back to a keyword
      // overlap against the project title.
      const titleTokens = tokenize(project.title);
      const gapTokens = tokenize(gap.name);
      const overlap = titleTokens.filter((token) => gapTokens.includes(token)).length;
      if (overlap > 0) score = 30 + overlap * 5;
    }
    if (score === 0) continue;
    // A project the user already owns is more actionable than a suggestion.
    if (project.source === 'user') score += 15;
    scored.push({ project, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.project);
}

/**
 * Links the plan into a dependency chain.
 *
 * Inside a milestone each task depends on the one before it. The first task
 * of a milestone depends on the last task of the previous milestone in the
 * same phase, and the first task of a phase depends on the last task of the
 * phase before it. This gives the UI a real prerequisite list without
 * creating an unmanageable web of dependencies.
 */
function linkPrerequisites(phases: RoadmapPhasePlan[]): void {
  let previousTaskTitle: string | null = null;

  for (const phase of phases) {
    let previousMilestoneLast: string | null = null;
    let isFirstTaskOfPhase = true;

    for (const milestone of phase.milestones) {
      let previousInMilestone: string | null = null;

      milestone.tasks.forEach((task, index) => {
        const prerequisites: string[] = [];
        if (previousInMilestone) prerequisites.push(previousInMilestone);
        else if (previousMilestoneLast) prerequisites.push(previousMilestoneLast);
        else if (previousTaskTitle && isFirstTaskOfPhase) prerequisites.push(previousTaskTitle);

        task.prerequisites = prerequisites;
        task.sortOrder = index;
        previousInMilestone = task.title;
        isFirstTaskOfPhase = false;
      });

      if (milestone.tasks.length > 0) {
        previousMilestoneLast = milestone.tasks[milestone.tasks.length - 1].title;
        previousTaskTitle = previousMilestoneLast;
      }
    }
  }
}

/** Heuristic: how well a resource's difficulty suits the target level. */
function levelFitScore(
  _title: string,
  durationHours: number | null,
  targetLevel: number,
): number {
  // A long course is worth a small bonus when the target is high, and a
  // small penalty when the target is low.
  const hours = durationHours ?? 0;
  if (targetLevel >= 4) return hours >= 8 ? 6 : 0;
  if (targetLevel <= 2) return hours <= 12 ? 6 : 0;
  return hours > 0 && hours <= 20 ? 5 : 0;
}

/** Splits a normalised name into comparable tokens. */
function tokenize(value: string): string[] {
  return value
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/** Removes the helper `skillNames` field before the resource leaves the generator. */
function stripResourceSkillNames(
  value: RoadmapResourceCandidate,
): RoadmapResourceRef {
  return {
    id: value.id,
    title: value.title,
    provider: value.provider,
    url: value.url,
    durationHours: value.durationHours,
  };
}

/** Removes the helper `skillNames` field before the project leaves the generator. */
function stripProjectSkillNames(
  value: RoadmapProjectCandidate,
): RoadmapProjectRef {
  return {
    title: value.title,
    description: value.description,
    source: value.source,
  };
}

/** The plan-level description shown at the top of the roadmap. */
function buildPlanDescription(
  role: RoleDefinition,
  readinessPct: number,
  openGapCount: number,
): string {
  if (openGapCount === 0) {
    return `${role.summary} You already meet every recorded requirement for ${role.title}. This plan focuses on applying and evidencing it.`;
  }
  return `${role.summary} You are ${readinessPct}% of the way to the ${role.title} requirement set, with ${openGapCount} skill${openGapCount === 1 ? '' : 's'} still to close.`;
}
