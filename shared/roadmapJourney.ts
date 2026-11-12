/**
 * The roadmap journey.
 *
 * A roadmap used to be five phases whose titles and descriptions were written
 * once and reused for every candidate. A phase could say "Build your technical
 * foundation" while its own recommended action was "Update your CV", and its
 * time estimate could read "7h + 3h + 2h" without ever saying what the total
 * was or whether the parts added up.
 *
 * This module names the five stages once, ties each stage to the kind of work
 * it actually contains, and defines a single time breakdown that always sums to
 * the hours it was given. The UI renders the stages as an expandable journey;
 * the generator maps a role-specific phase onto a stage, so the description a
 * candidate reads matches the actions listed underneath it.
 *
 * The rules are pure, so the client, the server and the tests all agree.
 */

export const ROADMAP_JOURNEY_STAGE_IDS = [
  'foundation',
  'core_skills',
  'practice',
  'job_prep',
  'job_ready',
] as const;

export type RoadmapJourneyStageId = (typeof ROADMAP_JOURNEY_STAGE_IDS)[number];

/** The kind of work a stage is built from. */
export type RoadmapStageWorkKind = 'learning' | 'practice' | 'project' | 'application';

export interface RoadmapJourneyStage {
  id: RoadmapJourneyStageId;
  /** 1-based position in the journey. */
  order: number;
  label: string;
  /** One line a candidate can read to know where they are. */
  objective: string;
  /**
   * What the candidate actually does in this stage. The description shown on
   * screen is built from these actions, so it cannot drift from them.
   */
  actions: string[];
  /** How the stage is recognised as finished. */
  completionCriteria: string[];
  /** The dominant kind of work, used to label the time estimate. */
  workKind: RoadmapStageWorkKind;
  /** The suggested share of the total plan, as a percentage. */
  sharePercent: number;
}

export const ROADMAP_JOURNEY_STAGES: readonly RoadmapJourneyStage[] = [
  {
    id: 'foundation',
    order: 1,
    label: 'Foundation',
    objective: 'Find out where you really stand and close the basic gaps.',
    actions: [
      'Take a diagnostic knowledge check for the role’s core skills',
      'Learn the fundamentals the check exposes as missing',
      'Record what you already know so it is not planned again',
    ],
    completionCriteria: [
      'Every core skill has a measurement, not a guess',
      'Foundational gaps are closed or explicitly deferred',
    ],
    workKind: 'learning',
    sharePercent: 20,
  },
  {
    id: 'core_skills',
    order: 2,
    label: 'Core Skills',
    objective: 'Reach the level the target role expects on its required skills.',
    actions: [
      'Work through the required skills in priority order',
      'Complete one course or guided track per open skill',
      'Re-check each skill after the learning block',
    ],
    completionCriteria: [
      'Required skills are at or above their target level',
      'No required skill is left unmeasured',
    ],
    workKind: 'learning',
    sharePercent: 25,
  },
  {
    id: 'practice',
    order: 3,
    label: 'Practice',
    objective: 'Turn knowledge into work you can show.',
    actions: [
      'Build a mini-project that uses the skills you just learned',
      'Practise the role’s recurring tasks on realistic material',
      'Attach the project as evidence for the skills it proves',
    ],
    completionCriteria: [
      'At least one project is in progress or completed',
      'The project is linked to the skills it demonstrates',
    ],
    workKind: 'project',
    sharePercent: 25,
  },
  {
    id: 'job_prep',
    order: 4,
    label: 'Job Prep',
    objective: 'Package the work into applications that get read.',
    actions: [
      'Write the CV for the target role and run an alignment check',
      'Prepare answers for the questions this role is asked',
      'Apply to matched roles and record each application',
    ],
    completionCriteria: [
      'A CV exists for the target role and scores above the review threshold',
      'At least one application is submitted',
    ],
    workKind: 'application',
    sharePercent: 20,
  },
  {
    id: 'job_ready',
    order: 5,
    label: 'Job Ready',
    objective: 'Keep the pipeline moving and prove readiness with evidence.',
    actions: [
      'Track every application through interview stages',
      'Turn interview feedback into the next learning step',
      'Keep the portfolio and skills current as you apply',
    ],
    completionCriteria: [
      'Applications are progressing, not stalled',
      'Required skills remain at target as the role evolves',
    ],
    workKind: 'application',
    sharePercent: 10,
  },
];

/** Looks a stage up by id, with a safe fallback to the first stage. */
export function journeyStage(id: string | null | undefined): RoadmapJourneyStage {
  return (
    ROADMAP_JOURNEY_STAGES.find((stage) => stage.id === id) ?? ROADMAP_JOURNEY_STAGES[0]
  );
}

/**
 * Maps a roadmap phase number onto a journey stage.
 *
 * The generator produces phases in the same order as the journey, so the
 * mapping is positional. It is clamped rather than wrapped: a plan with more
 * phases than stages belongs to Job Ready, not back at Foundation.
 */
export function journeyStageForPhase(phaseNumber: number | null | undefined): RoadmapJourneyStage {
  const index = Math.min(
    ROADMAP_JOURNEY_STAGES.length - 1,
    Math.max(0, Math.round((phaseNumber ?? 1) - 1))
  );
  return ROADMAP_JOURNEY_STAGES[index];
}

/** The stage a candidate has reached, based on how many phases are complete. */
export function currentJourneyStage(completedPhases: number): {
  stage: RoadmapJourneyStage;
  next: RoadmapJourneyStage | null;
} {
  const index = Math.min(
    ROADMAP_JOURNEY_STAGES.length - 1,
    Math.max(0, Math.floor(completedPhases))
  );
  return {
    stage: ROADMAP_JOURNEY_STAGES[index],
    next: ROADMAP_JOURNEY_STAGES[index + 1] ?? null,
  };
}

/**
 * A description built from the stage's own actions.
 *
 * This is the fix for a description that contradicted the actions beneath it:
 * the text and the list now come from the same array.
 */
export function stageDescription(stage: RoadmapJourneyStage): string {
  return `${stage.objective} You will: ${stage.actions.join('; ')}.`;
}

/* -------------------------------------------------------------------------- */
/* Time estimates that add up                                                */
/* -------------------------------------------------------------------------- */

export interface TimeBreakdown {
  /** Hours of guided learning. */
  learning: number;
  /** Hours of deliberate practice. */
  practice: number;
  /** Hours of project work. */
  miniProject: number;
  /** The total the three parts add up to. */
  total: number;
}

/**
 * Splits a total into named parts that always sum to that total.
 *
 * The split is 60% learning, 25% practice and 15% project, rounded to whole
 * hours. Rounding is resolved on the learning part, so the parts are never off
 * by one: 12 hours becomes 7h learning + 3h practice + 2h mini-project, which
 * adds up to 12.
 */
export function timeBreakdown(totalHours: number): TimeBreakdown {
  const total = Math.max(0, Math.round(Number.isFinite(totalHours) ? totalHours : 0));
  if (total === 0) return { learning: 0, practice: 0, miniProject: 0, total: 0 };

  let practice = Math.round(total * 0.25);
  let miniProject = Math.round(total * 0.15);

  // A one-hour block cannot be split usefully; keep it as learning.
  if (total < 3) {
    practice = 0;
    miniProject = 0;
  }

  // Never let the named parts exceed the total, and never let practice or
  // project work vanish while there is room for them.
  if (practice + miniProject > total) {
    practice = Math.min(practice, total);
    miniProject = Math.max(0, total - practice);
  }

  const learning = Math.max(0, total - practice - miniProject);
  return { learning, practice, miniProject, total };
}

/** The breakdown as the line shown under a task: "7h Learning + 3h Practice + 2h Mini-Project". */
export function formatTimeBreakdown(totalHours: number): string {
  const parts = timeBreakdown(totalHours);
  if (parts.total === 0) return 'No time estimate';
  const segments: string[] = [];
  if (parts.learning > 0) segments.push(`${parts.learning}h Learning`);
  if (parts.practice > 0) segments.push(`${parts.practice}h Practice`);
  if (parts.miniProject > 0) segments.push(`${parts.miniProject}h Mini-Project`);
  return segments.join(' + ');
}

/** True when the three parts add up to the total they were derived from. */
export function timeBreakdownAddsUp(parts: TimeBreakdown): boolean {
  return parts.learning + parts.practice + parts.miniProject === parts.total;
}

/**
 * Sums a plan's task hours and returns one truthful total plus its breakdown.
 *
 * The total is computed from the tasks, not stored beside them, so an estimate
 * can never disagree with the work it describes.
 */
export function planTimeEstimate(
  tasks: ReadonlyArray<{ estimatedHours?: number | null }>
): TimeBreakdown & { formatted: string } {
  const total = tasks.reduce(
    (sum, task) =>
      sum + (typeof task.estimatedHours === 'number' && Number.isFinite(task.estimatedHours)
        ? Math.max(0, task.estimatedHours)
        : 0),
    0
  );
  const parts = timeBreakdown(total);
  return { ...parts, formatted: formatTimeBreakdown(total) };
}
