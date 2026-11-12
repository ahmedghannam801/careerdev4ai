/**
 * The project lifecycle.
 *
 * A project used to be one undifferentiated record. "Add project" meant the
 * same thing whether the candidate had opened a suggestion from the roadmap or
 * shipped a finished piece of work, so a roadmap brief inflated the "Added
 * Project" count and a portfolio metric could be satisfied by an idea.
 *
 * THE ENUM
 * One vocabulary is used across the platform — the database, the server, the
 * interface and the tests:
 *
 *   planned      the candidate has taken it on but has not started building
 *   in_progress  being built
 *   completed    the work is done
 *   published    the work is out in the world and can be linked to
 *
 * Only completed and published count as shipped. Only in_progress, completed
 * and published count as added. A plan is neither: a roadmap brief the
 * candidate opened is not a project they built.
 *
 * WHY THE VOCABULARY CHANGED
 * This module used to define its own enum ('suggested', 'submitted',
 * 'verified'), which the database never used. Two vocabularies for one
 * concept is how a metric ends up counting one thing on one screen and
 * another on the next. The enum is now the one the platform actually stores,
 * and the older words are read as aliases rather than as a second language.
 *
 * Older rows use the previous vocabulary (idea, submitted, verified). They are
 * normalised on read, so the database needs no destructive rewrite.
 */

export const PROJECT_LIFECYCLE_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'published',
] as const;

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];

/**
 * The status a project has when the candidate has not said otherwise.
 *
 * A project with no status is a plan, not a finished piece of work. Reading
 * it as anything else is how an empty portfolio showed a shipping rate of
 * 100%.
 */
export const DEFAULT_PROJECT_STATUS: ProjectLifecycleStatus = 'planned';

export const PROJECT_STATUS_LABELS: Record<ProjectLifecycleStatus, string> = {
  planned: 'Planning',
  in_progress: 'In progress',
  completed: 'Completed',
  published: 'Published',
};

/** The statuses that count as a shipped portfolio piece. */
export const SHIPPED_PROJECT_STATUSES: ProjectLifecycleStatus[] = ['completed', 'published'];

/** The statuses that mean the candidate has taken the project on. */
export const ACTIVE_PROJECT_STATUSES: ProjectLifecycleStatus[] = [
  'in_progress',
  'completed',
  'published',
];

const LEGACY_MAP: Record<string, ProjectLifecycleStatus> = {
  // The planning stage has been called several things.
  idea: 'planned',
  planned: 'planned',
  suggested: 'planned',
  'not_started': 'planned',
  // The work in progress.
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  'in progress': 'in_progress',
  active: 'in_progress',
  // The work that is done.
  completed: 'completed',
  complete: 'completed',
  done: 'completed',
  // The work that is out in the world.
  submitted: 'published',
  published: 'published',
  verified: 'published',
};

/** Reads a stored status, including the legacy vocabulary, into the lifecycle. */
export function normalizeProjectStatus(
  value: string | null | undefined
): ProjectLifecycleStatus {
  if (!value) return DEFAULT_PROJECT_STATUS;
  const key = value.trim().toLowerCase().replace(/\s+/g, '_');
  return LEGACY_MAP[key] ?? DEFAULT_PROJECT_STATUS;
}

export function isShippedStatus(value: string | null | undefined): boolean {
  return SHIPPED_PROJECT_STATUSES.includes(normalizeProjectStatus(value));
}

export function isActiveProjectStatus(value: string | null | undefined): boolean {
  return ACTIVE_PROJECT_STATUSES.includes(normalizeProjectStatus(value));
}

/** The value the previous interface used, for code that still reads it. */
export function legacyProjectStatus(status: ProjectLifecycleStatus): string {
  if (status === 'planned') return 'idea';
  return status;
}

export interface ProjectMetricSource {
  status?: string | null;
}

export interface ProjectMetrics {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
  published: number;
  /** completed + published */
  shipped: number;
  /** in_progress + shipped */
  added: number;
  /** The percentage of added projects that have shipped, 0..100. */
  shippingRate: number;
}

/** Counts projects once, using the lifecycle, so every page agrees. */
export function projectMetrics(projects: readonly ProjectMetricSource[]): ProjectMetrics {
  const metrics: ProjectMetrics = {
    total: projects.length,
    planned: 0,
    inProgress: 0,
    completed: 0,
    published: 0,
    shipped: 0,
    added: 0,
    shippingRate: 0,
  };

  for (const project of projects) {
    const status = normalizeProjectStatus(project.status);
    if (status === 'planned') metrics.planned += 1;
    else if (status === 'in_progress') metrics.inProgress += 1;
    else if (status === 'completed') metrics.completed += 1;
    else if (status === 'published') metrics.published += 1;
  }

  metrics.shipped = metrics.completed + metrics.published;
  metrics.added = metrics.inProgress + metrics.shipped;
  metrics.shippingRate =
    metrics.added > 0 ? Math.round((metrics.shipped / metrics.added) * 100) : 0;

  return metrics;
}

/**
 * The next status in the lifecycle.
 *
 * Used by the "advance" control on a project card. It never jumps from a
 * plan straight to published: the intermediate state is the evidence trail.
 */
export function nextProjectStatus(
  current: string | null | undefined
): ProjectLifecycleStatus | null {
  const status = normalizeProjectStatus(current);
  if (status === 'planned') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  if (status === 'completed') return 'published';
  return null;
}
