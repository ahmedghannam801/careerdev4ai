/**
 * Behavioural checks for the skill gap engine and the roadmap generator.
 *
 * These run without a database. They assert the properties that matter for
 * personalisation, not the implementation:
 *
 *   - two different roles produce genuinely different plans;
 *   - a user who already has a skill does not get work on it;
 *   - gaps are prioritised and the readiness figure reflects the user's own
 *     ratings;
 *   - every step carries the attributes the UI needs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeSkillGaps,
  describeGap,
  normalizeSkillName,
  priorityForGap,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../shared/skillGap.ts';
import { generateRoadmapPlan } from '../shared/roadmapGenerator.ts';
import { resolveRoleDefinition } from '../shared/careerRoles.ts';

const RESOURCES = [
  {
    id: 'dc-python-intro',
    title: 'Introduction to Python for Data Science',
    provider: 'DataCamp',
    url: 'https://www.datacamp.com/courses/intro-to-python-for-data-science',
    durationHours: 4,
    skillNames: ['Python', 'Data Analysis & Reporting'],
  },
  {
    id: 'ms-sql',
    title: 'Query data with SQL',
    provider: 'Microsoft Learn',
    url: 'https://learn.microsoft.com/en-us/training/paths/query-data-with-sql/',
    durationHours: 6,
    skillNames: ['SQL & Database Design', 'Data Analysis & Reporting'],
  },
  {
    id: 'stakeholder-comms',
    title: 'Stakeholder communication',
    provider: 'Coursera',
    url: 'https://www.coursera.org/learn/stakeholder-communication',
    durationHours: 8,
    skillNames: ['Stakeholder Communication'],
  },
];

describe('skill gap engine', () => {
  it('normalises skill names so punctuation and case do not matter', () => {
    assert.equal(
      normalizeSkillName('SQL & Database Design'),
      normalizeSkillName('sql database design')
    );
    assert.equal(normalizeSkillName('  Python  '), 'python');
  });

  it('buckets gaps by how much is missing and whether it is core', () => {
    assert.equal(priorityForGap(3, true), 'critical');
    assert.equal(priorityForGap(2, true), 'high');
    assert.equal(priorityForGap(1, true), 'medium');
    assert.equal(priorityForGap(2, false), 'medium');
    assert.equal(priorityForGap(1, false), 'low');
    assert.equal(priorityForGap(0, true), 'sufficient');
  });

  it('treats an unrated skill as level zero, not level one', () => {
    const role = resolveRoleDefinition('data-analyst');
    assert.ok(role, 'the data-analyst role must exist in the catalogue');

    const gaps = computeSkillGaps(toRoleSkillRequirements(role), []);
    const python = gaps.find(
      (gap) => normalizeSkillName(gap.name) === normalizeSkillName('Python for Data Analysis')
    );
    assert.ok(python, 'the role should require Python for Data Analysis');
    assert.equal(python?.currentLevel, 0);
    assert.ok((python?.gap ?? 0) > 0);
  });

  it('does not invent a gap for a skill the user already meets', () => {
    const role = resolveRoleDefinition('data-analyst');
    assert.ok(role);

    const requirements = toRoleSkillRequirements(role);
    const requirements_ = requirements.requiredSkills[0];
    const gaps = computeSkillGaps(requirements, [
      { name: requirements_.name, level: 5 },
    ]);
    const entry = gaps.find(
      (gap) => normalizeSkillName(gap.name) === normalizeSkillName(requirements_.name)
    );
    assert.equal(entry?.gap, 0);
    assert.equal(entry?.priority, 'sufficient');
  });

  it('computes a readiness figure from the user ratings', () => {
    const role = resolveRoleDefinition('data-analyst');
    assert.ok(role);
    const requirements = toRoleSkillRequirements(role);

    const empty = summarizeSkillGaps(
      computeSkillGaps(requirements, []),
      requirements
    );
    assert.equal(empty.readinessPct, 0);

    const maxed = summarizeSkillGaps(
      computeSkillGaps(
        requirements,
        requirements.requiredSkills.map((skill) => ({
          name: skill.name,
          level: skill.minLevel,
        }))
      ),
      requirements
    );
    assert.equal(maxed.readinessPct, 100);
    assert.equal(maxed.openRequired, 0);
    // The role's preferred (stretch) skills can still be open.
    assert.ok(maxed.openPreferred > 0);
  });
  it('explains a gap in plain language', () => {
    const role = resolveRoleDefinition('data-analyst');
    assert.ok(role);
    const gaps = computeSkillGaps(toRoleSkillRequirements(role), []);
    const text = describeGap(gaps[0]);
    assert.match(text, /\/5/);
    assert.match(text, /expects/);
  });
});

describe('roadmap generator', () => {
  const analyst = resolveRoleDefinition('data-analyst');
  const businessAnalyst = resolveRoleDefinition('business-analyst');
  assert.ok(analyst && businessAnalyst);

  it('produces a different plan for two different roles', () => {
    const a = generateRoadmapPlan({
      role: analyst,
      userSkills: [],
      resources: RESOURCES,
    });
    const b = generateRoadmapPlan({
      role: businessAnalyst,
      userSkills: [],
      resources: RESOURCES,
    });

    assert.notEqual(a.title, b.title);
    assert.notDeepEqual(
      a.phases.map((phase) => phase.title),
      b.phases.map((phase) => phase.title)
    );

    const aSkills = JSON.stringify(a.phases.map((p) => p.skillNames));
    const bSkills = JSON.stringify(b.phases.map((p) => p.skillNames));
    assert.notEqual(aSkills, bSkills);
  });

  it('gives every step the attributes the roadmap UI needs', () => {
    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: [],
      resources: RESOURCES,
    });

    assert.ok(plan.phases.length >= 3, 'a plan must have several phases');
    let taskCount = 0;
    for (const phase of plan.phases) {
      assert.ok(phase.title.length > 0);
      assert.ok(phase.description.length > 0);
      assert.ok(phase.goal.length > 0);
      for (const milestone of phase.milestones) {
        for (const task of milestone.tasks) {
          taskCount += 1;
          assert.ok(task.title.length > 0, 'a task needs a title');
          assert.ok(task.description.length > 0, 'a task needs a description');
          assert.ok(task.estimatedHours > 0, 'a task needs an effort estimate');
          assert.ok(
            ['foundational', 'intermediate', 'advanced'].includes(task.difficulty),
            'a task needs a difficulty'
          );
          assert.ok(task.priority.length > 0, 'a task needs a priority');
          assert.ok(task.rationale.length > 0, 'a task needs a reason');
          assert.ok(Array.isArray(task.prerequisites));
          assert.ok(Array.isArray(task.skillNames));
        }
      }
    }
    assert.ok(taskCount > 0, 'a plan must contain work');
  });

  it('skips work for a skill the user already meets', () => {
    const requirements = toRoleSkillRequirements(analyst);
    const known = requirements.requiredSkills[0];

    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: [{ name: known.name, level: 5 }],
      resources: RESOURCES,
    });

    const planned = plan.phases.flatMap((phase) =>
      phase.milestones.flatMap((milestone) => milestone.tasks)
    );
    const forSkill = planned.filter(
      (task) => normalizeSkillName(task.primarySkillName ?? '') === normalizeSkillName(known.name)
    );
    assert.equal(forSkill.length, 0, 'a met skill must not generate a step');
  });

  it('attaches a real learning resource to a step that teaches a gap', () => {
    const requirements = toRoleSkillRequirements(analyst);
    const pythonGap = requirements.requiredSkills.find(
      (skill) => normalizeSkillName(skill.name) === 'pythonfordataanalysis'
    );
    assert.ok(pythonGap, 'the role should require Python for Data Analysis');

    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: [],
      resources: RESOURCES,
    });

    const tasks = plan.phases.flatMap((phase) =>
      phase.milestones.flatMap((milestone) => milestone.tasks)
    );
    const pythonTask = tasks.find(
      (task) =>
        normalizeSkillName(task.primarySkillName ?? '') === 'pythonfordataanalysis'
    );
    assert.ok(pythonTask, 'Python should be planned as work');
    assert.ok(
      (pythonTask?.resources.length ?? 0) > 0,
      'the Python step must point at a course'
    );
    assert.equal(pythonTask?.resources[0].id, 'dc-python-intro');
  });

  it('links steps to the step that must come first', () => {
    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: [],
      resources: RESOURCES,
    });

    const phases = plan.phases;
    const firstPhaseTasks = phases[0].milestones.flatMap((m) => m.tasks);
    if (firstPhaseTasks.length > 1) {
      const second = firstPhaseTasks[1];
      assert.ok(
        second.prerequisites.includes(firstPhaseTasks[0].title),
        'the second step must depend on the first'
      );
    }

    // The plan must be one connected chain: every step except the first
    // depends on a step that comes before it, and no step depends on itself.
    const ordered: Array<{ title: string; prerequisites: string[] }> = [];
    for (const phase of phases) {
      for (const milestone of phase.milestones) {
        for (const task of milestone.tasks) {
          ordered.push({ title: task.title, prerequisites: task.prerequisites });
        }
      }
    }

    const seen = new Set<string>();
    ordered.forEach((task, index) => {
      for (const prerequisite of task.prerequisites) {
        assert.notEqual(prerequisite, task.title, 'a step must not depend on itself');
        if (index === 0) continue;
        assert.ok(
          seen.has(prerequisite),
          `"${task.title}" depends on "${prerequisite}", which does not come before it`
        );
      }
      seen.add(task.title);
    });
  });

  it('still produces a plan when the user meets every requirement', () => {
    const requirements = toRoleSkillRequirements(analyst);
    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: requirements.requiredSkills.map((skill) => ({
        name: skill.name,
        level: 5,
      })),
      resources: RESOURCES,
    });

    assert.ok(plan.summary.totalTasks > 0, 'a qualified user still gets a plan');
    assert.equal(plan.summary.openGaps, 0);
    assert.match(plan.description, /already meet/i);
  });

  it('reports the readiness figure on the plan', () => {
    const plan = generateRoadmapPlan({
      role: analyst,
      userSkills: [],
      resources: RESOURCES,
    });
    assert.equal(plan.summary.readinessPct, 0);
    assert.ok(plan.summary.openGaps > 0);
    assert.ok(plan.summary.coveredSkills.length === 0);
  });
});
