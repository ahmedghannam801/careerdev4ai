/**
 * Tests for the spiral career timeline.
 *
 * What these lock down:
 *
 *   * the spiral places every milestone inside the drawing, and the milestones
 *     travel outwards as the career gets longer;
 *   * a milestone's state is read off the record's own status, never guessed;
 *   * the timeline is built only from records the candidate actually has, in
 *     the career's own order;
 *   * the progress figure is the share of records that are finished.
 *
 * These are pure: they need no browser, no server and no database.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applicationState,
  buildSpiralLayout,
  buildSpiralMilestones,
  buildSpiralPath,
  currentMilestoneId,
  educationState,
  formatMilestoneDate,
  projectState,
  spiralProgress,
  spiralSweep,
  spiralLayout,
  spiralMarkerSize,
  SPIRAL_GEOMETRY,
  SPIRAL_LITERAL_VALUES,
  SPIRAL_STATE_LABELS,
  type SpiralTimelineSource,
} from '../src/lib/spiralTimeline.ts';
import { AR_STRINGS } from '../src/translations/sourceStrings.ts';

const SOURCE: SpiralTimelineSource = {
  education: [
    {
      id: 'edu-1',
      institution: 'Cairo University',
      degree: 'BSc',
      field: 'Computer Science',
      startDate: '2015-09-01',
      endDate: '2019-06-01',
      current: false,
    },
  ],
  experiences: [
    {
      id: 'exp-1',
      role: 'Backend Developer',
      company: 'Nile Digital',
      employmentType: 'Full-time',
      location: 'Cairo',
      startDate: '2019-08-01',
      endDate: '',
      isCurrent: true,
      description: '',
      achievements: [],
      skillsUsed: ['Node.js'],
    },
  ],
  certifications: [
    {
      id: 'cert-1',
      name: 'AWS Solutions Architect',
      provider: 'Amazon',
      issueDate: '2021-04-01',
    },
  ],
  projects: [
    {
      id: 'proj-1',
      title: 'Task Queue',
      goal: 'Learn queues',
      description: 'A queue',
      difficulty: 'Intermediate',
      skills: ['TypeScript'],
      tasks: [],
      deliverables: [],
      status: 'in_progress',
      createdAt: '2022-01-10',
    },
  ],
  applications: [
    {
      id: 'app-1',
      company: 'Acme',
      role: 'Engineer',
      location: 'Remote',
      workMode: 'Remote',
      stage: 'interview',
      appliedDate: '2023-02-01',
      lastUpdated: '2023-03-01',
      notes: '',
    },
  ],
  milestones: [
    {
      id: 'ms-1',
      title: 'First promotion',
      category: 'promotion',
      dateAchieved: '2022-06-01',
      notes: '',
      verified: true,
    },
  ],
};

describe('the spiral timeline', () => {
  it('draws nothing when there is nothing to draw', () => {
    assert.deepEqual(buildSpiralLayout(0), []);
    assert.equal(buildSpiralPath(0), '');
  });

  it('places a single milestone in the middle of the drawing', () => {
    const points = buildSpiralLayout(1);
    assert.equal(points.length, 1);
    assert.equal(points[0].x, 0.5);
    assert.equal(points[0].y, 0.5);
  });

  it('keeps every milestone inside the drawing', () => {
    for (const count of [1, 2, 5, 12, 40]) {
      for (const point of buildSpiralLayout(count)) {
        assert.ok(point.x >= 0 && point.x <= 1, `x out of bounds for ${count}`);
        assert.ok(point.y >= 0 && point.y <= 1, `y out of bounds for ${count}`);
      }
    }
  });

  it('travels outwards as the career gets longer', () => {
    const points = buildSpiralLayout(8);
    assert.ok(points[0].radius < points[points.length - 1].radius);
  });

  it('never lets two markers sit on top of one another', () => {
    // The layout decides the gap the drawing can afford, and every pair of
    // markers must be at least that far apart. A marker that covers its
    // neighbour would take the neighbour's click.
    for (const count of [1, 2, 3, 5, 8, 12, 18, 24, 40]) {
      const layout = spiralLayout(count);
      for (let i = 0; i < layout.points.length; i += 1) {
        for (let j = i + 1; j < layout.points.length; j += 1) {
          const dx = layout.points[i].x - layout.points[j].x;
          const dy = layout.points[i].y - layout.points[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          assert.ok(
            distance >= layout.separation - 1e-9,
            `markers ${i} and ${j} of ${count} are only ${distance.toFixed(3)} apart`
          );
        }
      }
    }
  });

  it('keeps the markers small enough to fit in the gap they have', () => {
    // A marker is drawn from the gap the layout affords, so it can never be
    // wide enough to cover the marker next to it — at any width.
    for (const count of [3, 8, 18, 30, 40]) {
      const layout = spiralLayout(count);
      for (const width of [280, 340, 416]) {
        const size = spiralMarkerSize(layout.separation, width);
        assert.ok(size <= layout.separation * width, `a ${size}px marker does not fit in ${count}`);
        assert.ok(size >= SPIRAL_GEOMETRY.minMarkerPx, 'a marker may not vanish');
      }
    }
  });

  it('holds the comfortable gap for a career of a realistic length', () => {
    for (const count of [3, 8, 12, 18]) {
      assert.equal(spiralLayout(count).separation, SPIRAL_GEOMETRY.minSeparation);
    }
    // A very long career has to give a little of the gap up so the spiral
    // still fits — but it never gives up much.
    assert.ok(spiralLayout(24).separation >= SPIRAL_GEOMETRY.minSeparation * 0.9);
  });

  it('never shows a raw timestamp for a record dated at an instant', () => {
    // A project is created at an instant; the reader is shown the month.
    const formatted = formatMilestoneDate('2026-07-07T20:35:22.107092+00:00');
    assert.equal(formatted, 'Jul 2026');
    assert.equal(formatMilestoneDate('2025-10-02'), 'Oct 2025');
    assert.equal(formatMilestoneDate(''), '');
    assert.equal(formatMilestoneDate(undefined), '');
    assert.equal(formatMilestoneDate('not a date'), '');
  });

  it('turns further as there are more milestones, so the drawing stays readable', () => {
    assert.ok(spiralSweep(4) < spiralSweep(12));
    assert.ok(spiralSweep(12) < spiralSweep(24));
  });

  it('keeps the turns of the spiral apart from one another', () => {
    // Two markers a whole turn apart must not be closer than the gap the
    // layout promised, or the spiral would cross itself.
    for (const count of [8, 18, 30]) {
      const layout = spiralLayout(count);
      const turnGap =
        ((SPIRAL_GEOMETRY.outerRadius - SPIRAL_GEOMETRY.innerRadius) * Math.PI * 2) / layout.sweep;
      assert.ok(
        turnGap >= layout.separation - 1e-9,
        `the turns of a ${count}-milestone spiral are only ${turnGap.toFixed(3)} apart`
      );
    }
  });

  it('draws a path that starts where the first milestone is', () => {
    const path = buildSpiralPath(6);
    assert.ok(path.startsWith('M '));
    assert.ok(path.split('L').length > 5);
  });

  it('reads the state of a project off its own status', () => {
    assert.equal(projectState('completed'), 'completed');
    assert.equal(projectState('published'), 'completed');
    assert.equal(projectState('in_progress'), 'current');
    assert.equal(projectState('planned'), 'upcoming');
    assert.equal(projectState(undefined), 'upcoming');
  });

  it('reads the state of an application off its own stage', () => {
    assert.equal(applicationState('saved'), 'upcoming');
    assert.equal(applicationState('applied'), 'current');
    assert.equal(applicationState('interview'), 'current');
    assert.equal(applicationState('offer'), 'completed');
    assert.equal(applicationState('rejected'), 'completed');
    assert.equal(applicationState('withdrawn'), 'completed');
  });

  it('reads the state of an education record off its own dates', () => {
    assert.equal(educationState({ current: false, endDate: '2019-06-01' }), 'completed');
    assert.equal(educationState({ current: true, endDate: '' }), 'current');
    assert.equal(educationState({ current: false, endDate: '2999-06-01' }), 'current');
  });

  it('builds the timeline only from the records the candidate has', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    // One education, one experience, one certification, one project, one
    // application and one milestone. Nothing else is invented.
    assert.equal(milestones.length, 6);
    const kinds = milestones.map((entry) => entry.kind);
    assert.deepEqual(new Set(kinds).size, 6);
  });

  it('orders the timeline the way the career happened', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const dates = milestones.map((entry) => entry.date);
    const sorted = [...dates].sort();
    assert.deepEqual(dates, sorted);
    assert.equal(milestones[0].kind, 'education');
  });

  it('marks the records that are happening now', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const current = milestones.filter((entry) => entry.state === 'current');
    // The role they are in, the project they are building and the application
    // they are waiting on.
    assert.equal(current.length, 3);
    assert.ok(current.some((entry) => entry.kind === 'experience'));
    assert.ok(current.some((entry) => entry.kind === 'project'));
    assert.ok(current.some((entry) => entry.kind === 'application'));
  });

  it('marks what is finished and what is still to come', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const byKind = (kind: string) => milestones.find((entry) => entry.kind === kind);
    assert.equal(byKind('education')?.state, 'completed');
    assert.equal(byKind('certification')?.state, 'completed');
    assert.equal(byKind('milestone')?.state, 'completed');
    assert.equal(byKind('project')?.state, 'current');
  });

  it('carries the real details of the record, not a summary', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const experience = milestones.find((entry) => entry.kind === 'experience');
    const company = experience?.details.find((detail) => detail.label === 'Company');
    assert.equal(company?.value, 'Nile Digital');
  });

  it('points at the record that is happening now', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const current = currentMilestoneId(milestones);
    assert.ok(current);
    const entry = milestones.find((item) => item.id === current);
    assert.equal(entry?.state, 'current');
  });

  it('reports the share of the journey that is finished', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    // Three of the six records are finished.
    assert.equal(spiralProgress(milestones), 50);
    assert.equal(spiralProgress([]), 0);
  });

  it('survives a candidate with nothing on the timeline', () => {
    assert.deepEqual(buildSpiralMilestones({}), []);
    assert.equal(currentMilestoneId([]), null);
  });
});

/**
 * The words the timeline writes.
 *
 * The localisation test reads the literals a component passes to `t()`. The
 * timeline writes its words in a library and hands them over, so nothing
 * checked that they exist in the Arabic catalogue — and an Arabic reader was
 * shown an English timeline. These close that gap: every word the library
 * writes must be in the catalogue, and only the words the platform chose may
 * be translated.
 */
describe('the spiral timeline speaks the interface language', () => {
  it('every word it writes is in the Arabic catalogue', () => {
    const milestones = buildSpiralMilestones(SOURCE);
    const words = new Set<string>();
    for (const entry of milestones) {
      words.add(entry.label);
      for (const detail of entry.details) words.add(detail.label);
    }
    for (const label of Object.values(SPIRAL_STATE_LABELS)) words.add(label);

    const missing = [...words].filter((word) => !AR_STRINGS[word]);
    assert.deepEqual(
      missing,
      [],
      `these words have no Arabic translation: ${missing.join(', ')}`
    );
  });

  it('the words the platform chose are the ones that get translated', () => {
    // "Yes", "No" and "Current" are the platform's own words.
    assert.ok(SPIRAL_LITERAL_VALUES.has('Yes'));
    assert.ok(SPIRAL_LITERAL_VALUES.has('No'));
    assert.ok(SPIRAL_LITERAL_VALUES.has('Current'));

    // A candidate's own data is never one of them, so a project called
    // "Skills" is shown as the candidate wrote it.
    assert.equal(SPIRAL_LITERAL_VALUES.has('Skills'), false);
    assert.equal(SPIRAL_LITERAL_VALUES.has('Nile Digital'), false);
  });

  it('the state words and the milestone kinds are all translated', () => {
    for (const label of Object.values(SPIRAL_STATE_LABELS)) {
      assert.ok(AR_STRINGS[label], `"${label}" has no Arabic translation`);
    }
    const kinds = new Set(
      buildSpiralMilestones(SOURCE).map((entry) => entry.label)
    );
    for (const kind of kinds) {
      assert.ok(AR_STRINGS[kind], `"${kind}" has no Arabic translation`);
    }
  });
});
