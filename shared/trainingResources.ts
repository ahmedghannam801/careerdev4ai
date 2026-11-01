/**
 * The shape of the Training & Courses page.
 *
 * The page used to be a job board: it built searches on external vacancy
 * sites and told the candidate what employers usually ask for. The product
 * does not have a live job feed, so that page could never show a real
 * vacancy — only a link to somebody else's search.
 *
 * What the platform does have is a relevance-gated learning catalogue. This
 * module names the resource formats it can show, groups them into the kinds a
 * candidate recognises (courses, certifications, learning paths, workshops,
 * tutorials), and filters them without ever turning a job vacancy into a
 * result. The relevance gate itself lives in `server/learning/recommendation`
 * and is applied before anything reaches this module.
 */

import type { CourseFormat } from '../src/types/learning.ts';

/** The formats the learning catalogue can carry, plus the training kinds a
 * future catalogue entry may use. */
export type TrainingFormatId =
  | CourseFormat
  | 'certification'
  | 'bootcamp'
  | 'workshop'
  | 'resource';

/** The filter groups shown on the page. */
export type TrainingGroupId =
  | 'courses'
  | 'certifications'
  | 'paths'
  | 'workshops'
  | 'tutorials'
  | 'other';

export interface TrainingGroup {
  id: TrainingGroupId;
  /** The English source label; the view passes it through `t()`. */
  label: string;
  formats: TrainingFormatId[];
}

/** The groups, in the order they are shown. */
export const TRAINING_GROUPS: readonly TrainingGroup[] = [
  { id: 'courses', label: 'Courses', formats: ['course'] },
  {
    id: 'certifications',
    label: 'Certifications',
    formats: ['professional_certificate', 'certification'],
  },
  { id: 'paths', label: 'Learning paths', formats: ['learning_path'] },
  { id: 'workshops', label: 'Workshops & bootcamps', formats: ['workshop', 'bootcamp'] },
  { id: 'tutorials', label: 'Tutorials & videos', formats: ['tutorial', 'video', 'playlist'] },
  { id: 'other', label: 'Other training', formats: ['resource'] },
];

/** The label for one format. */
export const TRAINING_FORMAT_LABELS: Record<TrainingFormatId, string> = {
  course: 'Course',
  professional_certificate: 'Professional certificate',
  certification: 'Certification',
  learning_path: 'Learning path',
  tutorial: 'Tutorial',
  video: 'Video',
  playlist: 'Playlist',
  bootcamp: 'Bootcamp',
  workshop: 'Workshop',
  resource: 'Training resource',
};

/** True when the value is a format the page knows how to show. */
export function isTrainingFormat(value: unknown): value is TrainingFormatId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(
    TRAINING_FORMAT_LABELS,
    value
  );
}

/** The label for a format, falling back to a neutral one. */
export function trainingFormatLabel(value: string | null | undefined): string {
  return isTrainingFormat(value) ? TRAINING_FORMAT_LABELS[value] : 'Training resource';
}

/** The group a format belongs to, or `null` when it is not a training format. */
export function trainingGroupFor(value: string | null | undefined): TrainingGroupId | null {
  if (!isTrainingFormat(value)) return null;
  return TRAINING_GROUPS.find((group) => group.formats.includes(value))?.id ?? 'other';
}

/** The label for a group. */
export function trainingGroupLabel(id: TrainingGroupId): string {
  return TRAINING_GROUPS.find((group) => group.id === id)?.label ?? 'Training';
}

/** The minimum shape the filter needs from a recommendation. */
export interface TrainingResourceLike {
  course: {
    format: string;
    title: string;
    provider: string;
    description?: string | null;
    skills?: Array<{ name: string }>;
  };
}

/** The filter state the page exposes. */
export interface TrainingFilter {
  /** `all` shows every group. */
  group?: TrainingGroupId | 'all';
  /** A free-text search over the title, provider, description and skills. */
  query?: string;
}

/** The searchable text of one resource. */
function searchableText(resource: TrainingResourceLike): string {
  const course = resource.course;
  return [
    course.title,
    course.provider,
    course.description ?? '',
    ...(course.skills ?? []).map((skill) => skill.name),
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Filters recommendations to the training resources the candidate asked for.
 *
 * A resource whose format is unknown is still kept under "Other training"
 * rather than dropped: it came through the relevance gate, so it is a real
 * training resource even if this release has no specific label for it.
 */
export function filterTrainingResources<T extends TrainingResourceLike>(
  resources: readonly T[],
  filter: TrainingFilter = {}
): T[] {
  const group = filter.group ?? 'all';
  const query = (filter.query ?? '').trim().toLowerCase();

  return resources.filter((resource) => {
    if (group !== 'all') {
      const resourceGroup = trainingGroupFor(resource.course.format) ?? 'other';
      if (resourceGroup !== group) return false;
    }
    if (query && !searchableText(resource).includes(query)) return false;
    return true;
  });
}

/**
 * Groups the filtered resources for display.
 *
 * Empty groups are omitted, so a filter that matches nothing renders the
 * empty state instead of six empty headings.
 */
export function groupTrainingResources<T extends TrainingResourceLike>(
  resources: readonly T[]
): Array<{ id: TrainingGroupId; label: string; items: T[] }> {
  const buckets = new Map<TrainingGroupId, T[]>();
  for (const resource of resources) {
    const group = trainingGroupFor(resource.course.format) ?? 'other';
    const bucket = buckets.get(group);
    if (bucket) bucket.push(resource);
    else buckets.set(group, [resource]);
  }

  return TRAINING_GROUPS.filter((group) => (buckets.get(group.id)?.length ?? 0) > 0).map(
    (group) => ({
      id: group.id,
      label: group.label,
      items: buckets.get(group.id) ?? [],
    })
  );
}
