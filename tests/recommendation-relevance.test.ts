/**
 * Regression tests for recommendation relevance, the learning CTA URL rule
 * and roadmap resource attachment.
 *
 * The bug these lock down: an HR target role could receive an unrelated SQL
 * course because the catalogue category (Data/People) and the generic
 * language/format fit were enough to put a course in the list. Relevance is
 * now a gate, not a weight: a course must be tied to the target role, one of
 * its skills, an open gap or the current roadmap before any preference can
 * rank it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  rankCourses,
  scoreCourse,
  selectNextStep,
  type LearningContext,
  type LearningCourse,
  type RoleContext,
} from '../server/learning/recommendation.ts';
import { resolveRole, resolveRoleDefinition } from '../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../shared/roadmapGenerator.ts';
import { isSafeExternalUrl, learningActionUrl } from '../shared/learningLinks.ts';

let sequence = 0;

function course(overrides: Partial<LearningCourse> = {}): LearningCourse {
  sequence += 1;
  return {
    id: overrides.id ?? `test-course-${sequence}`,
    title: overrides.title ?? `Test course ${sequence}`,
    provider: overrides.provider ?? 'Test Provider',
    providerUrl: null,
    category: overrides.category ?? 'People',
    level: overrides.level ?? 'Beginner',
    durationHours: overrides.durationHours ?? 4,
    language: overrides.language ?? 'English',
    url: overrides.url ?? `https://example.com/course-${sequence}`,
    availability: overrides.availability ?? 'free',
    availabilityNote: null,
    format: overrides.format ?? 'course',
    description: null,
    isVerified: true,
    skills: overrides.skills ?? [],
    roles: overrides.roles ?? [],
  };
}

function roleContext(roleId: string): RoleContext {
  const role = resolveRole(roleId);
  assert.ok(role, `the ${roleId} role must exist in the catalogue`);
  return {
    slug: role.id,
    title: role.title,
    level: role.level,
    domainId: role.domainId,
    requiredSkills: role.requiredSkills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      minLevel: skill.minLevel,
    })),
    preferredSkills: role.preferredSkills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      minLevel: skill.minLevel,
    })),
  };
}

function context(roleId: string, overrides: Partial<LearningContext> = {}): LearningContext {
  return {
    careerGoal: 'get_first_job',
    targetRole: roleContext(roleId),
    userSkills: [],
    roadmapSkills: [],
    roadmapCourseIds: [],
    experienceLevel: 'entry',
    language: 'en',
    preferredFormat: 'any',
    weeklyHours: 5,
    budget: 'free_only',
    completedCourseIds: [],
    savedCourseIds: [],
    dismissedCourseIds: [],
    ...overrides,
  };
}

function hrResource() {
  return course({
    title: 'Employee Relations Essentials',
    category: 'People',
    skills: [{ name: 'Employee Relations', importance: 5 }],
    roles: [{ roleSlug: 'hr-specialist', relevanceScore: 92 }],
  });
}

function sqlCourse() {
  return course({
    title: 'Introduction to SQL',
    category: 'Data',
    skills: [
      { name: 'SQL & Database Design', importance: 5 },
      { name: 'SQL', importance: 5 },
    ],
    roles: [{ roleSlug: 'data-analyst', relevanceScore: 95 }],
  });
}

describe('recommendation relevance gate', () => {
  it('allows an HR-relevant resource for an HR target role', () => {
    const resource = hrResource();
    const scored = scoreCourse(resource, context('hr-specialist'));

    assert.ok(scored, 'an HR resource must pass the gate for an HR role');
    assert.ok(scored!.roleRelevance >= 0.9, 'the explicit role tag must drive relevance');
    assert.ok(
      scored!.matchedSkills.includes('Employee Relations'),
      'the role skill must be recognised'
    );
  });

  it('rejects an unrelated SQL resource for an HR target role', () => {
    const sql = sqlCourse();

    assert.equal(
      scoreCourse(sql, context('hr-specialist')),
      null,
      'SQL is not an HR Specialist skill and must not be eligible'
    );
    assert.equal(
      rankCourses([sql], context('hr-specialist')).length,
      0,
      'the SQL course must not appear anywhere in the HR ranking'
    );
  });

  it('does not let the People category, a saved flag or a focus skill create eligibility', () => {
    const unrelated = course({
      title: 'Business Communication for Success',
      category: 'People',
      skills: [{ name: 'Business Communication', importance: 5 }],
      roles: [],
    });
    const contextWithWeakSignals = context('hr-specialist', {
      savedCourseIds: [unrelated.id],
      focusSkill: 'Business Communication',
    });

    assert.equal(
      scoreCourse(unrelated, contextWithWeakSignals),
      null,
      'category, saved and focus are ranking signals, never eligibility signals'
    );
  });

  it('allows SQL for a Data Analyst when it is a role skill', () => {
    const sql = sqlCourse();
    const scored = scoreCourse(sql, context('data-analyst'));

    assert.ok(scored, 'SQL is a real Data Analyst skill and must be allowed');
    assert.ok(scored!.roleRelevance >= 0.9, 'the Data Analyst role tag must drive relevance');
  });

  it('never lets language or format make an irrelevant course eligible', () => {
    const irrelevant = course({
      title: 'Business Communication for Success',
      category: 'People',
      language: 'Arabic',
      format: 'video',
      level: 'Beginner',
      availability: 'free',
      skills: [{ name: 'Business Communication', importance: 5 }],
      roles: [],
    });
    const arabicVideoContext = context('hr-specialist', {
      language: 'ar',
      preferredFormat: 'video',
    });

    assert.equal(
      scoreCourse(irrelevant, arabicVideoContext),
      null,
      'a perfect language/format fit cannot promote an irrelevant course'
    );
  });

  it('keeps a role-relevant course even when its language and format are not preferred', () => {
    const relevant = hrResource();
    const arabicVideoContext = context('hr-specialist', {
      language: 'ar',
      preferredFormat: 'video',
    });

    const scored = scoreCourse(relevant, arabicVideoContext);
    assert.ok(scored, 'role relevance must survive a language/format mismatch');
    assert.ok(
      rankCourses([relevant], arabicVideoContext).length === 1,
      'the relevant course must remain in the ranking'
    );
  });

  it('selects an HR-relevant next step instead of the higher-metadata SQL course', () => {
    const hr = hrResource();
    const sql = sqlCourse();
    const ranked = rankCourses([hr, sql], context('hr-specialist'));
    const decision = selectNextStep(ranked, { targetRole: roleContext('hr-specialist') });

    assert.equal(ranked.length, 1, 'the SQL course must be filtered out before ranking');
    assert.equal(decision.nextStep?.course.id, hr.id);
    assert.equal(decision.mode, 'next_step');
  });
});

describe('learning action URL', () => {
  it('uses the stored verified URL for the Start Learning action', () => {
    const stored = 'https://www.coursera.org/learn/human-resources-management';
    assert.equal(learningActionUrl(stored), stored);
    assert.equal(isSafeExternalUrl(stored), true);
  });

  it('returns no external action for a missing or unsafe URL', () => {
    assert.equal(learningActionUrl(undefined), null);
    assert.equal(learningActionUrl(null), null);
    assert.equal(learningActionUrl(''), null);
    assert.equal(learningActionUrl('   '), null);
    assert.equal(learningActionUrl('/relative/path'), null);
    assert.equal(learningActionUrl('javascript:alert(1)'), null);
    assert.equal(learningActionUrl('ftp://example.com/course'), null);
    assert.equal(learningActionUrl('not a url'), null);
  });
});

describe('roadmap resource attachment and progress', () => {
  const hrRole = resolveRoleDefinition('hr-specialist');
  assert.ok(hrRole, 'the hr-specialist role definition must exist');

  const resources = [
    {
      id: 'cipd-knowledge',
      title: 'CIPD Knowledge hub',
      provider: 'CIPD',
      url: 'https://www.cipd.org/en/knowledge/',
      durationHours: null,
      skillNames: ['Employee Relations', 'Employment Law & Policy Application'],
    },
    {
      id: 'sql-intro',
      title: 'Introduction to SQL',
      provider: 'DataCamp',
      url: 'https://www.datacamp.com/courses/introduction-to-sql',
      durationHours: 4,
      skillNames: ['SQL & Database Design', 'SQL'],
    },
  ];

  it('attaches a resource only to the gap it actually teaches', () => {
    const plan = generateRoadmapPlan({ role: hrRole!, userSkills: [], resources });
    const tasks = plan.phases.flatMap((phase) =>
      phase.milestones.flatMap((milestone) => milestone.tasks)
    );

    const employeeRelations = tasks.find((task) => task.primarySkillName === 'Employee Relations');
    assert.ok(employeeRelations, 'the Employee Relations gap must produce a task');
    assert.ok(
      employeeRelations!.resources.some((resource) => resource.id === 'cipd-knowledge'),
      'the HR resource must be attached to the HR gap'
    );
    assert.ok(
      !employeeRelations!.resources.some((resource) => resource.id === 'sql-intro'),
      'the SQL resource must not be attached to an HR gap'
    );
    assert.ok(
      !tasks.some((task) => (task.primarySkillName ?? '').toLowerCase().includes('sql')),
      'SQL must not create an HR Specialist task'
    );
  });

  it('does not recreate work for a skill the user already meets', () => {
    const plan = generateRoadmapPlan({
      role: hrRole!,
      userSkills: [{ name: 'Employee Relations', level: 5 }],
      resources,
    });
    const tasks = plan.phases.flatMap((phase) =>
      phase.milestones.flatMap((milestone) => milestone.tasks)
    );

    assert.ok(
      !tasks.some((task) => task.primarySkillName === 'Employee Relations'),
      'a completed skill must not be re-added as new work'
    );
  });

  it('keeps the first stage as the current stage for a new user', () => {
    const plan = generateRoadmapPlan({ role: hrRole!, userSkills: [], resources });
    const currentStageIndex = plan.phases.findIndex((phase) =>
      phase.milestones.some((milestone) =>
        milestone.tasks.some((task) => task.status !== 'completed')
      )
    );

    assert.equal(currentStageIndex, 0, 'the first stage is the current stage for a new user');
    assert.ok(plan.summary.totalTasks > 0, 'the plan must contain real work');
  });
});
