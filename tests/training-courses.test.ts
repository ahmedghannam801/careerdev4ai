/**
 * Training & Courses: the section that replaced the job board.
 *
 * Two rules are protected here.
 *
 * The first is the relevance gate. It is a gate, not a weight: a course that
 * does not belong to the target role, one of its skills, an open gap or the
 * roadmap must not appear at all. An HR Specialist must not receive a
 * SQL-only course because it happens to be free and in English.
 *
 * The second is that the page is about training. It shows courses,
 * certifications, learning paths, workshops and tutorials, and it has no job
 * vacancy or job-board search to fall back to.
 *
 * Everything here is pure: no database and no model call.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TRAINING_GROUPS,
  filterTrainingResources,
  groupTrainingResources,
  isTrainingFormat,
  trainingFormatLabel,
  trainingGroupFor,
  type TrainingResourceLike,
} from '../shared/trainingResources.ts';
import {
  rankCourses,
  scoreCourse,
  type LearningContext,
  type LearningCourse,
  type RoleContext,
} from '../server/learning/recommendation.ts';
import { resolveRole } from '../shared/careerRoles.ts';

let sequence = 0;

function resource(
  format: string,
  overrides: Partial<TrainingResourceLike['course']> = {}
): TrainingResourceLike {
  sequence += 1;
  return {
    course: {
      format,
      title: overrides.title ?? `Training resource ${sequence}`,
      provider: overrides.provider ?? 'Test Provider',
      description: overrides.description ?? null,
      skills: overrides.skills ?? [],
    },
  };
}

describe('training resource formats', () => {
  it('knows the formats the catalogue can show', () => {
    for (const format of [
      'course',
      'professional_certificate',
      'learning_path',
      'tutorial',
      'video',
      'playlist',
      'bootcamp',
      'workshop',
    ]) {
      assert.ok(isTrainingFormat(format), `${format} must be a training format`);
      assert.notEqual(trainingFormatLabel(format), 'Training resource');
    }
  });

  it('rejects a job vacancy as a training format', () => {
    assert.equal(isTrainingFormat('job'), false);
    assert.equal(trainingGroupFor('job'), null);
    assert.equal(trainingFormatLabel('job'), 'Training resource');
  });

  it('groups every format into a filter the page shows', () => {
    assert.equal(trainingGroupFor('course'), 'courses');
    assert.equal(trainingGroupFor('professional_certificate'), 'certifications');
    assert.equal(trainingGroupFor('learning_path'), 'paths');
    assert.equal(trainingGroupFor('bootcamp'), 'workshops');
    assert.equal(trainingGroupFor('workshop'), 'workshops');
    assert.equal(trainingGroupFor('tutorial'), 'tutorials');
    assert.equal(trainingGroupFor('video'), 'tutorials');
    assert.equal(trainingGroupFor('playlist'), 'tutorials');
  });

  it('never labels a group as a job board', () => {
    for (const group of TRAINING_GROUPS) {
      assert.ok(!/job|vacanc/i.test(group.label), `${group.label} must not be a job label`);
    }
  });
});

describe('filtering and grouping training resources', () => {
  const resources = [
    resource('course', {
      title: 'Employee Relations Essentials',
      provider: 'People Academy',
      skills: [{ name: 'Employee Relations' }],
    }),
    resource('professional_certificate', {
      title: 'HR Analytics Certificate',
      provider: 'Analytics Institute',
      skills: [{ name: 'HR Analytics' }],
    }),
    resource('learning_path', {
      title: 'People Operations Path',
      provider: 'People Academy',
    }),
    resource('tutorial', {
      title: 'Interviewing Tutorial',
      provider: 'People Academy',
    }),
  ];

  it('filters by training group', () => {
    assert.deepEqual(
      filterTrainingResources(resources, { group: 'certifications' }).map(
        (entry) => entry.course.title
      ),
      ['HR Analytics Certificate']
    );
    assert.deepEqual(
      filterTrainingResources(resources, { group: 'tutorials' }).map(
        (entry) => entry.course.title
      ),
      ['Interviewing Tutorial']
    );
  });

  it('searches the title, provider, description and skills', () => {
    assert.equal(filterTrainingResources(resources, { query: 'employee' }).length, 1);
    assert.equal(filterTrainingResources(resources, { query: 'people academy' }).length, 3);
    assert.equal(filterTrainingResources(resources, { query: 'hr analytics' }).length, 1);
    assert.equal(filterTrainingResources(resources, { query: 'nothing here' }).length, 0);
  });

  it('groups the filtered list and omits empty groups', () => {
    const groups = groupTrainingResources(
      filterTrainingResources(resources, { query: 'people academy' })
    );

    assert.deepEqual(
      groups.map((group) => group.id),
      ['courses', 'paths', 'tutorials']
    );
    assert.ok(groups.every((group) => group.items.length > 0));
  });

  it('returns the empty state rather than empty headings', () => {
    assert.deepEqual(groupTrainingResources([]), []);
  });
});

function course(overrides: Partial<LearningCourse> = {}): LearningCourse {
  sequence += 1;
  return {
    id: overrides.id ?? `course-${sequence}`,
    title: overrides.title ?? `Course ${sequence}`,
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

function context(roleId: string): LearningContext {
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
  };
}

function hrCourse(): LearningCourse {
  return course({
    title: 'Employee Relations Essentials',
    category: 'People',
    skills: [{ name: 'Employee Relations', importance: 5 }],
    roles: [{ roleSlug: 'hr-specialist', relevanceScore: 92 }],
  });
}

function sqlCourse(): LearningCourse {
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

describe('the training relevance gate', () => {
  it('keeps an HR resource for an HR target role', () => {
    const scored = scoreCourse(hrCourse(), context('hr-specialist'));
    assert.ok(scored, 'the HR resource must pass the gate');
  });

  it('never shows an SQL-only course to an HR Specialist', () => {
    const recommendations = rankCourses([hrCourse(), sqlCourse()], context('hr-specialist'));

    assert.ok(
      recommendations.some((entry) => entry.course.title === 'Employee Relations Essentials'),
      'the relevant HR resource must remain'
    );
    assert.ok(
      recommendations.every((entry) => entry.course.title !== 'Introduction to SQL'),
      'an unrelated SQL course must not be shown to an HR Specialist'
    );
  });

  it('still shows SQL to a Data Analyst', () => {
    const recommendations = rankCourses([sqlCourse()], context('data-analyst'));

    assert.ok(
      recommendations.some((entry) => entry.course.title === 'Introduction to SQL'),
      'SQL is relevant to a Data Analyst and must pass the gate'
    );
  });
});
