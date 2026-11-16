/**
 * Regression tests for the roadmap relevance rules.
 *
 * The bug these lock down: a roadmap could contain material that had nothing
 * to do with the candidate's career. Two different faults produced it, and
 * both had the same shape — a keyword was treated as evidence.
 *
 *   1. A resource whose *title* shared a word with the gap was accepted.
 *      "Data Warehouse Migration" looked relevant to a "Data Modelling" gap
 *      because both contained "data".
 *   2. A project whose *title* shared a word with the gap was accepted, and
 *      the project's own skill links were never read.
 *
 * The rules now are:
 *
 *   - a resource that is mapped to roles, but not to the candidate's role, is
 *     rejected however well its skills line up;
 *   - content must carry the gap's skill in the catalogue's own skill
 *     mapping, not in its title;
 *   - what survives says why it was chosen.
 *
 * These are pure: they need no database and no server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateRoadmapPlan } from '../shared/roadmapGenerator.ts';
import { resolveRoleDefinition } from '../shared/careerRoles.ts';
import {
  evaluateProject,
  evaluateResource,
  isEligibleForRole,
  type RoadmapRelevanceContext,
} from '../shared/roadmapRelevance.ts';

const dataRole = resolveRoleDefinition('data-analyst');
const hrRole = resolveRoleDefinition('hr-specialist');

assert.ok(dataRole, 'the data-analyst role must exist');
assert.ok(hrRole, 'the hr-specialist role must exist');

function contextFor(
  role: NonNullable<typeof dataRole>,
  targetLevel = 3,
): RoadmapRelevanceContext {
  return {
    roleId: role.id,
    roleTitle: role.title,
    domainId: role.domainId,
    targetLevel,
    stage: 0,
  };
}

describe('the roadmap relevance rules', () => {
  it('keeps a resource that teaches the gap and is mapped to the role', () => {
    const verdict = evaluateResource(
      {
        skillNames: ['SQL & Database Design'],
        roleSlugs: [{ slug: 'data-analyst', score: 90 }],
        category: 'Data',
        level: 'Intermediate',
        isVerified: true,
      },
      'SQL & Database Design',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, true, 'a matching resource must be eligible');
    assert.ok(verdict.score > 0, 'an eligible resource must carry a score');
    assert.ok(verdict.reasons.length > 0, 'an eligible resource must explain itself');
    assert.ok(
      verdict.reasons.some((reason) => reason.kind === 'skill'),
      'the reason must name the skill',
    );
  });

  it('rejects a resource that is mapped to another role', () => {
    const verdict = evaluateResource(
      {
        // The skill matches the gap exactly. The role does not.
        skillNames: ['SQL & Database Design'],
        roleSlugs: [{ slug: 'software-engineer', score: 90 }],
        category: 'Data',
        isVerified: true,
      },
      'SQL & Database Design',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, false, 'a resource for another career must not enter');
    assert.equal(verdict.rejection, 'role-mismatch');
  });

  it('rejects a resource whose only connection is a word in its title', () => {
    // No skill mapping at all: the title mentions "Data Modelling", but the
    // catalogue does not say the resource teaches it.
    const verdict = evaluateResource(
      {
        skillNames: [],
        roleSlugs: [{ slug: 'data-analyst', score: 80 }],
        category: 'Data',
        isVerified: true,
      },
      'Data Modelling',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, false, 'a title is not evidence');
    assert.equal(verdict.rejection, 'no-skill-evidence');
  });

  it('rejects a near-synonym that merely reads alike', () => {
    const verdict = evaluateResource(
      {
        skillNames: ['Data Modelling'],
        roleSlugs: [{ slug: 'data-analyst', score: 80 }],
        category: 'Data',
        isVerified: true,
      },
      'Data Models',
      contextFor(dataRole!),
    );

    // "Data Modelling" and "Data Models" are close, but a close reading is
    // not a declared alternative, so it is not accepted.
    assert.equal(verdict.eligible, false);
  });

  it('rejects a project with no skill evidence', () => {
    const verdict = evaluateProject(
      {
        title: 'Data Warehouse Migration',
        description: 'A project about data.',
        source: 'user',
        skillNames: [],
      },
      'Data Modelling',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, false, 'a project title is not evidence');
    assert.equal(verdict.rejection, 'no-skill-evidence');
  });

  it('accepts a project that carries the gap skill', () => {
    const verdict = evaluateProject(
      {
        title: 'My modelling project',
        description: 'A project about data.',
        source: 'user',
        skillNames: ['Data Modelling'],
      },
      'Data Modelling',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, true);
    assert.ok(
      verdict.reasons.some((reason) => reason.kind === 'quality' && reason.label.includes('own project')),
      'the candidate\'s own work is worth saying so',
    );
  });

  it('rejects a project that belongs to another role', () => {
    const verdict = evaluateProject(
      {
        title: 'An HR project',
        description: 'A project about people.',
        source: 'user',
        skillNames: ['Data Modelling'],
        roleSlug: 'hr-specialist',
      },
      'Data Modelling',
      contextFor(dataRole!),
    );

    assert.equal(verdict.eligible, false);
    assert.equal(verdict.rejection, 'role-mismatch');
  });

  it('treats a missing catalogue category as missing data, not as another domain', () => {
    // A course with the right skill but no recorded category is not evidence
    // of belonging to a different domain, so it is not rejected for that.
    const eligible = isEligibleForRole(
      { skillNames: ['SQL & Database Design'], roleSlugs: [] },
      {
        id: dataRole!.id,
        title: dataRole!.title,
        domainId: dataRole!.domainId,
        coreSkills: dataRole!.coreSkills,
        preferredSkills: dataRole!.preferredSkills ?? [],
        tools: dataRole!.tools ?? [],
      },
    );

    assert.equal(eligible, true);
  });
});

describe('the generated roadmap', () => {
  const dataAnalyst = dataRole!;

  const resources = [
    {
      id: 'sql-course',
      title: 'Advanced SQL',
      provider: 'Example',
      url: 'https://example.com/sql',
      durationHours: 8,
      skillNames: ['SQL & Database Design'],
      roleSlugs: [{ slug: 'data-analyst', score: 90 }],
      category: 'Data',
      level: 'Intermediate',
      isVerified: true,
    },
    {
      id: 'hr-course',
      title: 'Employment Law for Analysts',
      provider: 'Example',
      url: 'https://example.com/law',
      durationHours: 6,
      skillNames: ['SQL & Database Design'],
      roleSlugs: [{ slug: 'hr-specialist', score: 90 }],
      category: 'People',
      level: 'Intermediate',
      isVerified: true,
    },
    {
      id: 'data-modelling-course',
      title: 'Data Modelling',
      provider: 'Example',
      url: 'https://example.com/modelling',
      durationHours: 6,
      skillNames: [],
      roleSlugs: [{ slug: 'data-analyst', score: 70 }],
      category: 'Data',
      level: 'Intermediate',
      isVerified: true,
    },
  ];

  function tasksOf(plan: ReturnType<typeof generateRoadmapPlan>) {
    return plan.phases.flatMap((phase) =>
      phase.milestones.flatMap((milestone) => milestone.tasks),
    );
  }

  it('never attaches a resource that belongs to another career', () => {
    const plan = generateRoadmapPlan({
      role: dataAnalyst,
      userSkills: [],
      resources,
    });
    const tasks = tasksOf(plan);

    const attached = tasks.flatMap((task) => task.resources);
    assert.ok(attached.length > 0, 'the plan must still have resources');
    assert.ok(
      !attached.some((resource) => resource.id === 'hr-course'),
      'a resource mapped to another role must never be attached',
    );
  });

  it('never attaches a resource whose only link to the gap is its title', () => {
    const plan = generateRoadmapPlan({
      role: dataAnalyst,
      userSkills: [],
      resources,
    });
    const tasks = tasksOf(plan);

    const attached = tasks.flatMap((task) => task.resources);
    assert.ok(
      !attached.some((resource) => resource.id === 'data-modelling-course'),
      'a resource with no skill mapping must not be attached on its title',
    );
  });

  it('explains every resource it attaches', () => {
    const plan = generateRoadmapPlan({
      role: dataAnalyst,
      userSkills: [],
      resources,
    });
    const tasks = tasksOf(plan);

    for (const task of tasks) {
      for (const resource of task.resources) {
        assert.ok(
          typeof resource.reason === 'string' && resource.reason.length > 0,
          `the resource "${resource.title}" must say why it was recommended`,
        );
      }
    }
  });

  it('does not pad a step with a project that says nothing about the gap', () => {
    const plan = generateRoadmapPlan({
      role: dataAnalyst,
      userSkills: [],
      resources,
      projects: [
        {
          title: 'Data Warehouse Migration',
          description: 'A project about data.',
          source: 'user' as const,
          skillNames: [],
          roleSlug: null,
        },
      ],
    });
    const tasks = tasksOf(plan);

    for (const task of tasks) {
      assert.ok(
        !task.projects.some((project) => project.title === 'Data Warehouse Migration'),
        'a project with no skill evidence must not be attached',
      );
    }
  });
});
