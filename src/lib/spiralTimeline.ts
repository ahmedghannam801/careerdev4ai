/**
 * The Career Timeline, as a spiral.
 * ---------------------------------------------------------------------------
 * The timeline used to be a straight line down a page: every record the
 * candidate owns, one after another, in date order. It was readable and it
 * said nothing about the shape of a career.
 *
 * A spiral says something a line cannot. The records a candidate has are not
 * a list of equal entries — they accumulate, and the path they take winds
 * outward as the career gets longer. So the timeline is drawn as a spiral
 * that starts in the middle with the earliest record and works outward to the
 * newest one.
 *
 * THIS MODULE IS PURE.
 *
 * The geometry and the state of every milestone are decided here, with no
 * React and no DOM, so they can be reasoned about and tested on their own.
 * The component that draws them reads these functions and does nothing else.
 *
 * NOTHING HERE INVENTS DATA.
 *
 * Every milestone is a record the candidate actually has. A milestone's
 * position on the spiral is its order in their career; its state is read off
 * the record's own status. A record with no date is dated "now" only for the
 * purpose of being placed, and is marked as undated where it is shown.
 */

import type {
  ApplicationStage,
  CareerMilestoneItem,
  CareerProject,
  JobApplication,
  ProjectLifecycleStatus,
  UserCertificationEntry,
  UserEducationEntry,
  UserExperienceEntry,
} from '../types/career';

/** Where a milestone sits in the journey. */
export type SpiralMilestoneState = 'completed' | 'current' | 'upcoming';

/** The kinds of record the timeline is built from. */
export type SpiralMilestoneKind =
  | 'education'
  | 'experience'
  | 'certification'
  | 'project'
  | 'application'
  | 'milestone';

/**
 * The word the interface shows for each state.
 *
 * These are English source strings, like every other word the interface
 * shows, and the Arabic catalogue is keyed by the source string itself. They
 * live here, beside the state they name, so that the test which checks the
 * catalogue can check them too.
 */
export const SPIRAL_STATE_LABELS: Record<SpiralMilestoneState, string> = {
  completed: 'Completed',
  current: 'Happening now',
  upcoming: 'Still to come',
};

/** One line of the timeline. */
export interface SpiralMilestone {
  /** A stable identity, unique within the timeline. */
  id: string;
  /** What kind of record this is. */
  kind: SpiralMilestoneKind;
  /** The kind, written out for the reader. */
  label: string;
  /** The record's own title. */
  title: /** The record's own title. */ string;
  /** A short second line under the title. */
  subtitle: string;
  /** The record's date, when it has one. */
  date: string;
  /** Whether the record is finished, happening, or still to come. */
  state: SpiralMilestoneState;
  /** The real details of the record, for the panel that opens on it. */
  details: Array<{ label: string; value: string }>;
}

/** A point on the spiral, in the spiral's own coordinate space. */
export interface SpiralPoint {
  /** The horizontal position, as a fraction of the drawing's width. */
  x: number;
  /** The vertical position, as a fraction of the drawing's height. */
  y: number;
  /** The angle the point sits at, in radians. */
  angle: number;
  /** The distance from the centre, as a fraction of the drawing's half-width. */
  radius: number;
}

/**
 * The shape of the spiral.
 *
 * The drawing is a square, so the spiral is drawn in the middle of it and
 * every point is a fraction of the drawing's size. The numbers here are the
 * only place the geometry is decided.
 */
export const SPIRAL_GEOMETRY = {
  /** Where the spiral starts, in radians. Zero is to the right; this is the top. */
  startAngle: -Math.PI / 2,
  /** The distance from the centre to the first milestone, as a fraction. */
  innerRadius: 0.11,
  /** The distance from the centre to the last milestone, as a fraction. */
  outerRadius: 0.43,
  /** The smallest angle two milestones may sit apart, in radians. */
  minStep: 0.3,
  /**
   * The gap two markers should have, as a fraction of the drawing.
   *
   * A marker is 28px across and the drawing is at most 416px wide, so a
   * marker covers about 0.067 of the drawing. A gap of 0.095 leaves room for
   * the marker, its ring and a few pixels of air.
   */
  minSeparation: 0.095,
  /**
   * The biggest a marker may be drawn, in pixels.
   *
   * The marker is sized from the gap the layout can afford, so a drawing
   * with many milestones gets smaller markers rather than overlapping ones.
   */
  maxMarkerPx: 28,
  /** The smallest a marker may be drawn, in pixels. */
  minMarkerPx: 14,
} as const;

/**
 * The whole layout of the spiral, decided in one place.
 */
export interface SpiralLayout {
  /** Where each milestone sits. */
  points: SpiralPoint[];
  /** How far the spiral turns, in radians. */
  sweep: number;
  /** The distance from the centre to the first milestone. */
  innerRadius: number;
  /** The distance from the centre to the last milestone. */
  outerRadius: number;
  /**
   * The smallest distance between any two markers, as a fraction of the
   * drawing.
   *
   * The marker is sized from this, so a marker can never be wide enough to
   * cover its neighbour — which matters, because a covered marker takes the
   * other one's click.
   */
  separation: number;
}

/**
 * Decides the layout of the spiral for a number of milestones.
 *
 * Two constraints pull against each other, and the layout has to satisfy
 * both:
 *
 *   1. Two markers on the same turn must be far enough apart, which asks for
 *      a wide angular step.
 *   2. Two turns of the spiral must not cross, which asks for a narrow one.
 *
 * For a spiral of `n` markers over a radius span from `inner` to `outer`,
 * the two meet when
 *
 *   gap² × (n − 1) = inner × (outer − inner) × 2π
 *
 * so the biggest gap this drawing can hold is the square root of that. When
 * there are few milestones the drawing can hold far more than is needed and
 * the gap used is the comfortable one; when there are many, the gap shrinks
 * towards the size of a marker and the markers themselves get smaller.
 */
export function spiralLayout(count: number): SpiralLayout {
  const total = Math.floor(count);
  const inner = SPIRAL_GEOMETRY.innerRadius;
  const outer = SPIRAL_GEOMETRY.outerRadius;

  if (!Number.isFinite(total) || total <= 0) {
    return { points: [], sweep: 0, innerRadius: inner, outerRadius: outer, separation: 0 };
  }
  if (total === 1) {
    return {
      points: [
        {
          x: 0.5,
          y: 0.5,
          angle: SPIRAL_GEOMETRY.startAngle,
          radius: inner,
        },
      ],
      sweep: 0,
      innerRadius: inner,
      outerRadius: outer,
      separation: 1,
    };
  }

  const affordable = Math.sqrt(
    (inner * (outer - inner) * Math.PI * 2) / (total - 1)
  );
  // A little under the limit, so neither constraint is met exactly.
  const separation = Math.min(SPIRAL_GEOMETRY.minSeparation, affordable * 0.95);

  // The sweep has to be wide enough for the markers on one turn to be apart,
  // and narrow enough for two turns not to cross.
  const lowest = (separation * (total - 1)) / inner;
  const highest = ((outer - inner) * Math.PI * 2) / separation;
  const preferred = Math.max((total - 1) * SPIRAL_GEOMETRY.minStep, Math.PI * 1.15);
  const sweep = Math.min(highest, Math.max(preferred, lowest));

  return {
    points: pointsFor(total, sweep, inner, outer),
    sweep,
    innerRadius: inner,
    outerRadius: outer,
    separation,
  };
}

/**
 * How far the spiral turns for a given number of milestones.
 *
 * The sweep is the one number that decides whether the drawing works. Too
 * small and the markers near the centre sit on top of one another — which is
 * not only ugly, it means one of them takes the other's click. Too large and
 * two turns of the spiral crowd each other.
 */
export function spiralSweep(count: number): number {
  return spiralLayout(count).sweep;
}

/**
 * The size a marker may be drawn at, in pixels.
 *
 * The marker is never wider than the gap the layout affords, so two markers
 * can never cover each other. The size is capped so a drawing with three
 * milestones does not end up with enormous dots.
 */
export function spiralMarkerSize(separation: number, containerWidth: number): number {
  if (!Number.isFinite(separation) || separation <= 0) return SPIRAL_GEOMETRY.maxMarkerPx;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return SPIRAL_GEOMETRY.maxMarkerPx;
  }
  const affordable = separation * containerWidth * 0.82;
  return Math.round(
    Math.max(SPIRAL_GEOMETRY.minMarkerPx, Math.min(SPIRAL_GEOMETRY.maxMarkerPx, affordable))
  );
}

/**
 * The positions of the markers for a given count and sweep.
 *
 * Both the layout and the path read from this, so the curve that is drawn
 * always goes through the markers that are drawn on it.
 */
function pointsFor(count: number, sweep: number, inner: number, outer: number): SpiralPoint[] {
  const total = Math.floor(count);
  if (!Number.isFinite(total) || total <= 0) return [];
  if (total === 1) {
    return [
      {
        x: 0.5,
        y: 0.5,
        angle: SPIRAL_GEOMETRY.startAngle,
        radius: inner,
      },
    ];
  }

  const step = sweep / (total - 1);
  const points: SpiralPoint[] = [];
  for (let index = 0; index < total; index += 1) {
    const angle = SPIRAL_GEOMETRY.startAngle + index * step;
    const progress = index / (total - 1);
    const radius = inner + (outer - inner) * progress;

    points.push({
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      angle,
      radius,
    });
  }
  return points;
}


/**
 * Places the milestones on the spiral.
 *
 * The milestones are placed evenly along the path, so every one of them has
 * room and none of them sits on top of another. The spiral turns further for
 * a longer career, up to a limit: past that the turns would overlap and the
 * path would stop being readable.
 *
 * The first milestone is nearest the centre and the last is furthest out,
 * which is what makes the drawing read as a progression.
 */
export function buildSpiralLayout(count: number): SpiralPoint[] {
  return spiralLayout(count).points;
}

/**
 * The path of the spiral, as an SVG path.
 *
 * It is drawn with more points than there are milestones, so the curve is a
 * curve rather than a chain of straight lines between the markers.
 */
export function buildSpiralPath(count: number): string {
  const layout = spiralLayout(count);
  return spiralPathSegment(layout, 1);
}

/**
 * Draws the spiral, or the part of it that has been travelled.
 *
 * The path is always drawn on the layout it belongs to. Drawing the first
 * few markers of a longer spiral with their own layout would put the
 * travelled line somewhere the markers are not, which is how a "progress"
 * line ends up floating away from the path it belongs to.
 *
 * `fraction` is how much of the sweep to draw: 1 is the whole spiral, and
 * the fraction of the spiral that reaches the record happening now is the
 * fraction of the sweep that reaches it.
 */
export function spiralPathSegment(layout: SpiralLayout, fraction: number): string {
  if (!layout.points.length) return '';
  const share = Math.max(0, Math.min(1, fraction));
  const sweep = layout.sweep * share;
  const steps = Math.max(24, Math.round(layout.points.length * 12 * share));
  const parts: string[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const angle = SPIRAL_GEOMETRY.startAngle + sweep * progress;
    const radius =
      layout.innerRadius + (layout.outerRadius - layout.innerRadius) * progress;
    const x = 0.5 + Math.cos(angle) * radius;
    const y = 0.5 + Math.sin(angle) * radius;
    parts.push(`${step === 0 ? 'M' : 'L'} ${(x * 100).toFixed(3)} ${(y * 100).toFixed(3)}`);
  }
  return parts.join(' ');
}

/**
 * The state of a project, read off its own status.
 *
 * A project that is planned has not started, so it is still to come. One that
 * is in progress is happening. One that is finished, or published, is done.
 */
export function projectState(status: ProjectLifecycleStatus | undefined): SpiralMilestoneState {
  if (status === 'completed' || status === 'published') return 'completed';
  if (status === 'in_progress') return 'current';
  return 'upcoming';
}

/**
 * The state of an application, read off its own stage.
 *
 * A saved application has not been sent yet. An application that is still
 * moving through a stage is happening. One that has finished — offered to,
 * turned down, or withdrawn — is done.
 */
export function applicationState(stage: ApplicationStage | undefined): SpiralMilestoneState {
  if (!stage) return 'upcoming';
  if (stage === 'saved') return 'upcoming';
  if (stage === 'offer' || stage === 'rejected' || stage === 'withdrawn') return 'completed';
  return 'current';
}

/** The state of a dated education record. */
export function educationState(
  record: Pick<UserEducationEntry, 'current' | 'endDate'> | undefined
): SpiralMilestoneState {
  if (!record) return 'upcoming';
  if (record.current) return 'current';
  if (!record.endDate) return 'current';
  return record.endDate > new Date().toISOString().slice(0, 10) ? 'current' : 'completed';
}

/**
 * The records the timeline is built from.
 *
 * Every group is optional so that a candidate with only some of these still
 * gets a timeline. The shapes are the platform's own records — the timeline
 * reads them and never rewrites them.
 */
export interface SpiralTimelineSource {
  education?: UserEducationEntry[];
  experiences?: UserExperienceEntry[];
  certifications?: UserCertificationEntry[];
  projects?: CareerProject[];
  applications?: JobApplication[];
  milestones?: CareerMilestoneItem[];
}

/**
 * The detail values that are words the platform chose, not data.
 *
 * A detail's value is usually the candidate's own data — a company name, a
 * project title, a list of skills — and that data is shown exactly as it was
 * written. Three values are different: they are words this module picked to
 * stand for a fact ("Yes", "No", "Current"), so they are words the interface
 * translates. The set is what tells the two apart, so a project that happens
 * to be called "Skills" is never rewritten into its Arabic translation.
 */
export const SPIRAL_LITERAL_VALUES: ReadonlySet<string> = new Set(['Yes', 'No', 'Current']);

/** A label for the month and year of a date, or an empty string. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * The month and year of a milestone's date, as the reader sees it.
 *
 * A record's date can arrive in three shapes: a plain day, a full timestamp
 * or nothing at all. The reader is shown the month and the year in every
 * case, and never a raw timestamp — a project created at
 * "2026-07-07T20:35:22.107092+00:00" is "Jul 2026" to the person who owns
 * it.
 */
/**
 * The month a record belongs to, in the reader's own language.
 *
 * A record dated at an instant (a project's creation timestamp) is shown as a
 * month and a year, never as the raw string it was stored as.
 */
export function formatMilestoneDate(
  value: string | null | undefined,
  locale: string = 'en-GB'
): string {
  if (!value) return '';
  const day = value.slice(0, 10);
  const parsed = new Date(day);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

/**
 * Builds the timeline from the candidate's own records.
 *
 * The order is the career's own order: the oldest record first, so it is
 * nearest the centre of the spiral and the newest is furthest out. A record
 * with no date is placed after the ones that have one, because there is
 * nothing to order it by.
 */
export function buildSpiralMilestones(source: SpiralTimelineSource): SpiralMilestone[] {
  const milestones: SpiralMilestone[] = [];

  for (const record of source.education ?? []) {
    const title = [record.degree, record.field].filter(Boolean).join(' in ');
    milestones.push({
      id: `timeline-edu-${record.id}`,
      kind: 'education',
      label: 'Education',
      title: title || record.institution || '',
      subtitle: record.institution || '',
      date: record.startDate || '',
      state: educationState(record),
      details: [
        { label: 'Institution', value: record.institution || '—' },
        { label: 'Qualification', value: title || '—' },
        { label: 'Started', value: formatDate(record.startDate) || '—' },
        { label: 'Ended', value: formatDate(record.endDate) || '—' },
        { label: 'Grade', value: record.gpa || '—' },
      ],
    });
  }

  for (const record of source.experiences ?? []) {
    milestones.push({
      id: `timeline-exp-${record.id}`,
      kind: 'experience',
      label: 'Experience',
      title: record.role || '',
      subtitle: record.company || '',
      date: record.startDate || '',
      state: record.isCurrent ? 'current' : 'completed',
      details: [
        { label: 'Company', value: record.company || '—' },
        { label: 'Role', value: record.role || '—' },
        { label: 'Employment Type', value: record.employmentType || '—' },
        { label: 'Location', value: record.location || '—' },
        { label: 'Started', value: formatDate(record.startDate) || '—' },
        { label: 'Ended', value: record.isCurrent ? 'Current' : formatDate(record.endDate) || '—' },
        { label: 'Skills', value: (record.skillsUsed ?? []).join(', ') || '—' },
      ],
    });
  }

  for (const record of source.certifications ?? []) {
    milestones.push({
      id: `timeline-cert-${record.id}`,
      kind: 'certification',
      label: 'Certification',
      title: record.name || '',
      subtitle: record.provider || '',
      date: record.issueDate || '',
      state: 'completed',
      details: [
        { label: 'Certificate', value: record.name || '—' },
        { label: 'Provider', value: record.provider || '—' },
        { label: 'Issued', value: formatDate(record.issueDate) || '—' },
        { label: 'Expires', value: formatDate(record.expiryDate) || '—' },
        { label: 'Credential', value: record.credentialId || '—' },
        { label: 'Skills', value: (record.skills ?? []).join(', ') || '—' },
      ],
    });
  }

  for (const record of source.projects ?? []) {
    milestones.push({
      id: `timeline-proj-${record.id}`,
      kind: 'project',
      label: 'Project',
      title: record.title || '',
      subtitle: record.difficulty || '',
      // The project was created on a day, not at an instant. The day is what
      // the reader is shown.
      date: record.createdAt ? record.createdAt.slice(0, 10) : '',
      state: projectState(record.status),
      details: [
        { label: 'Project', value: record.title || '—' },
        { label: 'Difficulty', value: record.difficulty || '—' },
        { label: 'Status', value: record.status || '—' },
        { label: 'Role', value: record.role || '—' },
        { label: 'Skills', value: (record.skills ?? []).join(', ') || '—' },
      ],
    });
  }

  for (const record of source.applications ?? []) {
    const stage = record.stage;
    milestones.push({
      id: `timeline-app-${record.id}`,
      kind: 'application',
      label: 'Application',
      title: `${record.role || ''}${record.company ? ` at ${record.company}` : ''}`,
      subtitle: stage ? stage.replace(/_/g, ' ') : '',
      date: record.appliedDate || record.lastUpdated || '',
      state: applicationState(stage),
      details: [
        { label: 'Role', value: record.role || '—' },
        { label: 'Company', value: record.company || '—' },
        { label: 'Stage', value: stage ? stage.replace(/_/g, ' ') : '—' },
        { label: 'Location', value: record.location || '—' },
        { label: 'Applied', value: formatDate(record.appliedDate) || '—' },
        { label: 'Next action', value: record.nextAction || '—' },
      ],
    });
  }

  for (const record of source.milestones ?? []) {
    // A milestone the candidate recorded has been achieved — the platform only
    // records one when it happened. One with no date is something still ahead.
    const achieved = Boolean(record.dateAchieved) || record.verified === true;
    milestones.push({
      id: `timeline-milestone-${record.id}`,
      kind: 'milestone',
      label: 'Milestone',
      title: record.title || '',
      subtitle: record.category || '',
      date: record.dateAchieved || '',
      state: achieved ? 'completed' : 'upcoming',
      details: [
        { label: 'Milestone', value: record.title || '—' },
        { label: 'Category', value: record.category || '—' },
        { label: 'Achieved', value: formatDate(record.dateAchieved) || '—' },
        { label: 'Verified', value: record.verified ? 'Yes' : 'No' },
        { label: 'Notes', value: record.notes || '—' },
      ],
    });
  }

  // The career's own order: oldest first. A record with no date cannot be
  // placed in time, so it goes after the ones that can.
  return milestones.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

/**
 * The milestone the timeline is "at" right now.
 *
 * It is the current record: the one that is happening now. When nothing is
 * happening, it is the most recent completed record, so the timeline always
 * has a place to point.
 */
export function currentMilestoneId(milestones: SpiralMilestone[]): string | null {
  if (!milestones.length) return null;
  const current = milestones.filter((entry) => entry.state === 'current');
  if (current.length) return current[current.length - 1].id;
  const completed = milestones.filter((entry) => entry.state === 'completed');
  if (completed.length) return completed[completed.length - 1].id;
  return milestones[milestones.length - 1].id;
}

/**
 * How much of the journey is behind the candidate.
 *
 * It is the share of milestones that are finished. A candidate with three
 * finished records and one still to come is three quarters of the way along
 * their own spiral, which is a fact about their records and not an estimate.
 */
export function spiralProgress(milestones: SpiralMilestone[]): number {
  if (!milestones.length) return 0;
  const finished = milestones.filter((entry) => entry.state === 'completed').length;
  return Math.round((finished / milestones.length) * 100);
}
