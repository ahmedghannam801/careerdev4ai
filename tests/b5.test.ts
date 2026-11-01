// Phase B.5 — AI Learning Hub.
//
// This suite covers four layers:
//   1. the verifiable catalogue and its availability semantics;
//   2. the deterministic scoring engine (no model, no database);
//   3. the AI explanation validator and its deterministic fallback;
//   4. persisted learning state, completion semantics and RLS isolation.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  admin,
  anon,
  api,
  apiAnonymous,
  createTestUser,
  deleteTestUser,
  readUserSkillRows,
  type TestUser,
} from './helpers.ts';
import {
  rankCourses,
  scoreCourse,
  type LearningContext,
  type LearningCourse,
} from '../server/learning/recommendation.ts';
import {
  enrichRecommendationsWithAi,
  validateAiRecommendations,
  type AiClientLike,
} from '../server/learning/ai.ts';
import { CAREER_ROLES } from '../shared/careerRoles.ts';

const COURSE_ID = 'dc-python-intro';
const AVALID_AVAILABILITY = new Set([
  'free',
  'free_with_limitations',
  'audit',
  'free_course_paid_certificate',
  'paid',
  'youtube_free',
]);
const VALID_FORMATS = new Set([
  'course',
  'professional_certificate',
  'learning_path',
  'tutorial',
  'video',
  'playlist',
]);
/**
 * The roles a catalogue course may be linked to.
 *
 * Derived from the shared role catalogue rather than a hard-coded list, so
 * the catalogue and the test cannot drift apart when a career domain is
 * added.
 */
const VALID_ROLES = new Set(CAREER_ROLES.map((role) => role.id));

/** The skill names the role catalogue uses. */
const CATALOG_SKILL_NAMES = new Set(
  CAREER_ROLES.flatMap((role) => [
    ...role.requiredSkills.map((skill) => skill.name),
    ...role.preferredSkills.map((skill) => skill.name),
  ]),
);

let user: TestUser;
let otherUser: TestUser;
let catalog: LearningCourse[] = [];

before(async () => {
  user = await createTestUser('b5');
  otherUser = await createTestUser('b5-other');
  const response = await apiAnonymous('GET', '/api/learning/catalog');
  assert.equal(response.status, 200, 'the catalogue must be publicly readable');
  catalog = response.body.courses as LearningCourse[];
});

after(async () => {
  await deleteTestUser(otherUser);
  await deleteTestUser(user);
});

function makeCourse(
  id: string,
  overrides: Partial<LearningCourse> = {}
): LearningCourse {
  return {
    id,
    title: `Course ${id}`,
    provider: 'Test Provider',
    providerUrl: 'https://example.com',
    category: 'Programming',
    level: 'Beginner',
    durationHours: 10,
    language: 'English',
    url: `https://example.com/${id}`,
    availability: 'free',
    availabilityNote: null,
    format: 'course',
    description: null,
    isVerified: true,
    skills: [],
    roles: [],
    ...overrides,
  };
}

function baseContext(overrides: Partial<LearningContext> = {}): LearningContext {
  return {
    careerGoal: 'get_first_job',
    targetRole: {
      slug: 'frontend-engineer',
      title: 'Frontend Engineer',
      level: 'Entry',
      requiredSkills: [
        { name: 'React', minLevel: 4 },
        { name: 'TypeScript', minLevel: 4 },
      ],
      preferredSkills: [{ name: 'Testing', minLevel: 3 }],
    },
    userSkills: [
      { name: 'React', currentLevel: 1, targetLevel: 4, gap: 3 },
      { name: 'TypeScript', currentLevel: 2, targetLevel: 4, gap: 2 },
    ],
    roadmapSkills: ['TypeScript'],
    roadmapCourseIds: ['ts-course'],
    experienceLevel: 'entry',
    language: 'en',
    preferredFormat: 'course',
    weeklyHours: 5,
    budget: 'free_only',
    completedCourseIds: [],
    savedCourseIds: [],
    dismissedCourseIds: [],
    ...overrides,
  };
}

const reactCourse = makeCourse('react-course', {
  title: 'React Foundations',
  skills: [{ name: 'React', importance: 5 }],
  roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 95 }],
});
const tsCourse = makeCourse('ts-course', {
  title: 'TypeScript Deep Dive',
  skills: [{ name: 'TypeScript', importance: 5 }],
  roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 90 }],
});
const genericCourse = makeCourse('generic-course', {
  title: 'Excel Basics',
  category: 'Data',
  skills: [{ name: 'Excel / Spreadsheets Modeling', importance: 3 }],
  roles: [{ roleSlug: 'product-manager', relevanceScore: 20 }],
});
/**
 * A course that only has a weak explicit role tag. It passes the relevance
 * gate (so saved/focus can rank it) but carries no skill-gap signal, which
 * makes it the right fixture for testing ranking-only preferences.
 */
const weakRoleCourse = makeCourse('weak-role-course', {
  title: 'Frontend Communication',
  skills: [{ name: 'Communication', importance: 2 }],
  roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 20 }],
});
const paidCourse = makeCourse('paid-course', {
  title: 'Paid React Certificate',
  availability: 'paid',
  skills: [{ name: 'React', importance: 5 }],
  roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 100 }],
});

describe('B.5 catalogue integrity', () => {
  test('unique, verified resources with complete, real metadata', () => {
    // The catalogue spans every career domain and grows as domains are added,
    // so the count is a floor rather than a fixed number.
    assert.ok(catalog.length >= 77, `catalogue shrank: ${catalog.length}`);
    assert.equal(new Set(catalog.map((course) => course.id)).size, catalog.length, 'duplicate course ids');
    assert.equal(new Set(catalog.map((course) => course.url)).size, catalog.length, 'duplicate course urls');

    for (const course of catalog) {
      assert.ok(course.title.trim().length > 3, `${course.id} has no title`);
      assert.ok(course.provider.trim().length > 2, `${course.id} has no provider`);
      assert.ok(course.category.trim().length > 0, `${course.id} has no category`);
      assert.ok(course.url.startsWith('https://'), `${course.id} URL is not https`);
      assert.ok(course.url.length > 20, `${course.id} URL is too short`);
      assert.doesNotMatch(
        course.url,
        /example\.com|localhost|todo|replace|your-domain|course-url/i,
        `${course.id} has a placeholder URL`
      );
      assert.ok(AVALID_AVAILABILITY.has(course.availability), `${course.id} availability`);
      assert.ok(VALID_FORMATS.has(course.format), `${course.id} format`);
      assert.ok(['Beginner', 'Intermediate', 'Advanced'].includes(course.level));
      assert.equal(course.isVerified, true, `${course.id} is not verified`);
      assert.ok(course.skills.length >= 1, `${course.id} has no skills`);
      assert.ok(course.roles.length >= 1, `${course.id} has no roles`);
      for (const skill of course.skills) {
        assert.ok(skill.name.trim().length > 0);
        assert.ok(skill.importance >= 1 && skill.importance <= 5);
        // Every catalogue skill must be a skill the role catalogue actually
        // uses, otherwise the recommender can never match the course to the
        // learner's gap for that skill.
        assert.ok(
          CATALOG_SKILL_NAMES.has(skill.name),
          `${course.id} skill "${skill.name}" is not a catalogue skill`
        );
      }
      for (const role of course.roles) {
        assert.ok(VALID_ROLES.has(role.roleSlug), `${course.id} role ${role.roleSlug}`);
        assert.ok(role.relevanceScore >= 1 && role.relevanceScore <= 100);
      }
    }

    // The catalogue grows as career domains are added, so the totals are
    // floors rather than fixed numbers: the catalogue must never shrink.
    const totalSkills = catalog.reduce((sum, course) => sum + course.skills.length, 0);
    const totalRoles = catalog.reduce((sum, course) => sum + course.roles.length, 0);
    assert.ok(totalSkills >= 195, `catalogue skill links shrank: ${totalSkills}`);
    assert.ok(totalRoles >= 183, `catalogue role links shrank: ${totalRoles}`);
  });

  test('availability claims match the provider, not a universal "free" label', () => {
    const dataCamp = catalog.filter((course) => course.provider === 'DataCamp');
    assert.equal(dataCamp.length, 20);
    for (const course of dataCamp) {
      assert.equal(course.availability, 'free_with_limitations');
    }

    for (const course of catalog) {
      if (course.provider.includes('Coursera')) {
        assert.ok(
          course.availability === 'paid' || course.availability === 'audit',
          `${course.id}: Coursera must never be advertised as universally free`
        );
      }
      if (course.provider === 'Udemy') {
        assert.equal(course.availability, 'paid');
      }
      if (course.provider.includes('YouTube')) {
        assert.equal(course.availability, 'youtube_free');
        assert.ok(course.format === 'video' || course.format === 'playlist');
      }
    }

    const dataCampSkills = new Set(
      dataCamp.flatMap((course) => course.skills.map((skill) => skill.name))
    );
    for (const expected of [
      'Python',
      'SQL',
      'Excel / Spreadsheets Modeling',
      'Data Visualization (Tableau/Power BI)',
      'Statistical Analysis',
      'Machine Learning Fundamentals',
    ]) {
      assert.ok(dataCampSkills.has(expected), `DataCamp is missing ${expected}`);
    }
  });
});

describe('B.5 deterministic recommendation engine', () => {
  test('scores skill-gap, role, roadmap and saved signals before any AI call', () => {
    const recommendation = scoreCourse(reactCourse, baseContext());
    assert.ok(recommendation);
    assert.ok(recommendation.breakdown.gap > 0);
    assert.ok(recommendation.breakdown.role > 0);
    assert.equal(recommendation.matchedSkills.includes('React'), true);
    assert.equal(recommendation.gapsAddressed[0].skill, 'React');

    const saved = scoreCourse(
      weakRoleCourse,
      baseContext({ savedCourseIds: [weakRoleCourse.id] })
    );
    assert.ok(saved, 'a course with an explicit role tag must pass the gate');
    assert.equal(saved.breakdown.saved, 4);

    const focused = scoreCourse(
      weakRoleCourse,
      baseContext({ focusSkill: 'Communication' })
    );
    assert.ok(focused, 'focus is a ranking signal on an already-eligible course');
    assert.equal(focused.breakdown.focus, 10);
    assert.ok(saved.score < focused.score);

    // Neither a saved flag nor a focus skill may make an unrelated course
    // eligible on its own.
    assert.equal(
      scoreCourse(genericCourse, baseContext({ savedCourseIds: [genericCourse.id] })),
      null
    );
    assert.equal(
      scoreCourse(genericCourse, baseContext({ focusSkill: 'Excel / Spreadsheets Modeling' })),
      null
    );
  });

  test('ranks relevant courses and rejects unrelated catalogue matches', () => {
    const ranked = rankCourses(
      [genericCourse, paidCourse, reactCourse, tsCourse],
      baseContext(),
      { limit: 10 }
    );
    const ids = ranked.map((entry) => entry.course.id);
    assert.equal(ids.includes('paid-course'), false, 'free-only must exclude paid courses');
    assert.equal(
      ids.includes('generic-course'),
      false,
      'a course tagged only to another role must not appear'
    );
    assert.ok(ids.includes('react-course'));
    assert.ok(ids.includes('ts-course'));

    const paidAllowed = rankCourses(
      [paidCourse, reactCourse],
      baseContext({ budget: 'any' }),
      { limit: 10 }
    );
    assert.equal(paidAllowed.some((entry) => entry.course.id === 'paid-course'), true);
  });

  test('dismissed and completed courses are excluded, with an explicit completion override', () => {
    const context = baseContext({
      dismissedCourseIds: ['generic-course'],
      completedCourseIds: ['react-course'],
    });
    const ranked = rankCourses([genericCourse, reactCourse, tsCourse], context, { limit: 10 });
    const ids = ranked.map((entry) => entry.course.id);
    assert.equal(ids.includes('generic-course'), false);
    assert.equal(ids.includes('react-course'), false);

    const withCompleted = rankCourses([reactCourse], context, {
      limit: 10,
      excludeCompleted: false,
    });
    assert.equal(withCompleted.some((entry) => entry.course.id === 'react-course'), true);
  });

  test('language, format and time preferences change the score without changing the catalogue', () => {
    const english = scoreCourse(reactCourse, baseContext());
    const arabic = scoreCourse(reactCourse, baseContext({ language: 'ar' }));
    assert.ok(english && arabic);
    assert.ok(arabic.breakdown.language < english.breakdown.language);

    const wrongFormat = scoreCourse(reactCourse, baseContext({ preferredFormat: 'video' }));
    assert.ok(wrongFormat);
    assert.ok(wrongFormat.breakdown.format < english.breakdown.format);

    const longCourse = makeCourse('long-course', {
      title: 'Long Course',
      durationHours: 500,
      skills: [{ name: 'React', importance: 5 }],
      roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 95 }],
    });
    const short = scoreCourse(reactCourse, baseContext({ weeklyHours: 5 }));
    const long = scoreCourse(longCourse, baseContext({ weeklyHours: 5 }));
    assert.ok(short && long);
    assert.ok(long.breakdown.time < short.breakdown.time);
    assert.equal(long.course.url, 'https://example.com/long-course');
  });

  test('ties are deterministic: role relevance first, then title', () => {
    const a = makeCourse('a', {
      title: 'Alpha',
      skills: [{ name: 'React', importance: 5 }],
      roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 80 }],
    });
    const b = makeCourse('b', {
      title: 'Beta',
      skills: [{ name: 'React', importance: 5 }],
      roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 80 }],
    });
    const first = rankCourses([b, a], baseContext(), { limit: 10 });
    const second = rankCourses([a, b], baseContext(), { limit: 10 });
    assert.deepEqual(
      first.map((entry) => entry.course.id),
      second.map((entry) => entry.course.id)
    );
    assert.equal(first[0].course.title, 'Alpha');
  });
});

describe('B.5 AI explanation validation and fallback', () => {
  const allowed = new Set(['react-course']);

  test('accepts only candidate ids and rejects invented ids, URLs and duplicates', () => {
    const valid = validateAiRecommendations(
      {
        recommendations: [
          {
            courseId: 'react-course',
            reason: 'This closes your React gap and is directly relevant to frontend interviews.',
            skillGap: 'React 1/5 to 4/5',
          },
        ],
      },
      allowed
    );
    assert.equal(valid.valid.length, 1);
    assert.equal(valid.rejected, 0);

    const invented = validateAiRecommendations(
      { recommendations: [{ courseId: 'made-up-course', reason: 'A sufficiently long reason here.' }] },
      allowed
    );
    assert.equal(invented.valid.length, 0);

    const url = validateAiRecommendations(
      {
        recommendations: [
          {
            courseId: 'react-course',
            reason: 'Read more at https://made-up.example/course and start today.',
          },
        ],
      },
      allowed
    );
    assert.equal(url.valid.length, 0);

    const duplicate = validateAiRecommendations(
      {
        recommendations: [
          { courseId: 'react-course', reason: 'This is the first sufficiently long explanation.' },
          { courseId: 'react-course', reason: 'This is the second sufficiently long explanation.' },
        ],
      },
      allowed
    );
    assert.equal(duplicate.valid.length, 1);
    assert.equal(duplicate.rejected, 1);
  });

  test('without a model the deterministic result is returned unchanged', async () => {
    const deterministic = rankCourses([reactCourse, genericCourse], baseContext(), { limit: 5 });
    const result = await enrichRecommendationsWithAi(deterministic, baseContext(), { ai: null });
    assert.equal(result.aiUsed, false);
    assert.ok(result.aiFallbackReason?.includes('not configured'));
    assert.deepEqual(
      result.recommendations.map((entry) => entry.course.id),
      deterministic.map((entry) => entry.course.id)
    );
    assert.equal(result.recommendations[0].course.url, deterministic[0].course.url);
  });

  test('valid AI text only adds explanations; it never changes ids, order, score or URL', async () => {
    const deterministic = rankCourses([reactCourse, tsCourse], baseContext(), { limit: 5 });
    const fake: AiClientLike = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            recommendations: [
              {
                courseId: 'react-course',
                reason:
                  'React is your largest gap and this course targets the exact skills needed for your target role.',
                skillGap: 'React: current 1/5, target 4/5',
              },
            ],
          }),
        }),
      },
    };
    const result = await enrichRecommendationsWithAi(deterministic, baseContext(), { ai: fake });
    assert.equal(result.aiUsed, true);
    assert.deepEqual(
      result.recommendations.map((entry) => entry.course.id),
      deterministic.map((entry) => entry.course.id)
    );
    assert.deepEqual(
      result.recommendations.map((entry) => entry.score),
      deterministic.map((entry) => entry.score)
    );
    assert.equal(result.recommendations[0].course.url, deterministic[0].course.url);
    const explained = result.recommendations.find(
      (entry) => entry.course.id === 'react-course'
    );
    assert.ok(explained?.aiExplanation);
  });

  test('invalid AI output falls back to the deterministic result', async () => {
    const deterministic = rankCourses([reactCourse], baseContext(), { limit: 5 });
    const fake: AiClientLike = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            recommendations: [
              { courseId: 'invented-course', reason: 'A long enough explanation for this course.' },
            ],
          }),
        }),
      },
    };
    const result = await enrichRecommendationsWithAi(deterministic, baseContext(), { ai: fake });
    assert.equal(result.aiUsed, false);
    assert.ok(result.aiFallbackReason);
    assert.deepEqual(
      result.recommendations.map((entry) => entry.course.id),
      deterministic.map((entry) => entry.course.id)
    );
  });

  test('a timeout or provider error falls back without throwing', async () => {
    const deterministic = rankCourses([reactCourse], baseContext(), { limit: 5 });
    const hanging: AiClientLike = {
      models: { generateContent: () => new Promise(() => {}) },
    };
    const timedOut = await enrichRecommendationsWithAi(deterministic, baseContext(), {
      ai: hanging,
      timeoutMs: 20,
    });
    assert.equal(timedOut.aiUsed, false);
    assert.ok(timedOut.aiFallbackReason?.toLowerCase().includes('timed out'));

    const broken: AiClientLike = {
      models: {
        generateContent: async () => {
          throw new Error('provider unavailable');
        },
      },
    };
    const failed = await enrichRecommendationsWithAi(deterministic, baseContext(), { ai: broken });
    assert.equal(failed.aiUsed, false);
    assert.ok(failed.aiFallbackReason?.includes('AI generation failed'));
  });
});

describe('B.5 persisted learning state', () => {
  test('save, start, progress, complete and delete are persisted through the API', async () => {
    const save = await api('POST', '/api/learning/items', {
      token: user.token,
      body: {
        courseId: COURSE_ID,
        status: 'saved',
        recommendationReason: 'Closes the Python gap for the data-analyst roadmap.',
      },
    });
    assert.equal(save.status, 201);
    assert.equal(save.body.item.status, 'saved');
    assert.equal(save.body.item.progressPercent, 0);

    // Upsert must not create a second row for the same course.
    const secondSave = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'saved' },
    });
    assert.equal(secondSave.status, 201);
    const list = await api('GET', '/api/learning/items', { token: user.token });
    assert.equal(list.status, 200);
    assert.equal(
      list.body.items.filter((item: { courseId: string }) => item.courseId === COURSE_ID).length,
      1
    );

    const start = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'in_progress' },
    });
    assert.equal(start.status, 201);
    assert.equal(start.body.item.status, 'in_progress');
    assert.ok(start.body.item.progressPercent >= 1);
    assert.ok(start.body.item.startedAt);

    const progress = await api('PATCH', `/api/learning/items/${COURSE_ID}`, {
      token: user.token,
      body: { progressPercent: 60 },
    });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.item.progressPercent, 60);

    const beforeSkills = await readUserSkillRows(user.id);
    const complete = await api('PATCH', `/api/learning/items/${COURSE_ID}`, {
      token: user.token,
      body: { status: 'completed' },
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.item.status, 'completed');
    assert.equal(complete.body.item.progressPercent, 100);
    assert.ok(complete.body.item.completedAt);

    // Completion is learning evidence, not skill mastery.
    const afterSkills = await readUserSkillRows(user.id);
    assert.deepEqual(
      afterSkills.map((row) => row.skill_id).sort(),
      beforeSkills.map((row) => row.skill_id).sort()
    );

    const remove = await api('DELETE', `/api/learning/items/${COURSE_ID}`, {
      token: user.token,
    });
    assert.equal(remove.status, 200);
    const missing = await api('DELETE', `/api/learning/items/${COURSE_ID}`, {
      token: user.token,
    });
    assert.equal(missing.status, 404);
  });

  test('input validation rejects bad states, progress, preferences and unknown courses', async () => {
    const badStatus = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'finished' },
    });
    assert.equal(badStatus.status, 400);

    const badProgress = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'in_progress', progressPercent: 140 },
    });
    assert.equal(badProgress.status, 400);

    const unknownCourse = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: 'not-a-course', status: 'saved' },
    });
    assert.equal(unknownCourse.status, 404);

    const badBudget = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { budget: 'unlimited' },
    });
    assert.equal(badBudget.status, 400);

    const badHours = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { weeklyHours: 0 },
    });
    assert.equal(badHours.status, 400);

    const patchUnknown = await api('PATCH', '/api/learning/items/not-a-course', {
      token: user.token,
      body: { progressPercent: 10 },
    });
    assert.equal(patchUnknown.status, 404);
  });

  test('recommendations use only real catalogue ids, are sorted, and respect free-only', async () => {
    const anonymousItems = await apiAnonymous('GET', '/api/learning/items');
    assert.equal(anonymousItems.status, 401);
    const anonymousRecommendations = await apiAnonymous('POST', '/api/learning/recommendations', {
      body: {},
    });
    assert.equal(anonymousRecommendations.status, 401);

    const result = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { ai: false, budget: 'free_only', limit: 20 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.aiUsed, false);
    assert.equal(result.body.aiFallbackReason, null);
    const recommendations = result.body.recommendations;
    assert.ok(recommendations.length > 0);

    const catalogIds = new Set(catalog.map((course) => course.id));
    const ids = recommendations.map((entry: { course: LearningCourse }) => entry.course.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate recommendations');
    for (const id of ids) assert.ok(catalogIds.has(id), `${id} is not in the catalogue`);
    for (const entry of recommendations) {
      assert.notEqual(entry.course.availability, 'paid');
      assert.equal(
        entry.course.url,
        catalog.find((course) => course.id === entry.course.id)?.url,
        'recommendation URL must be the catalogue URL'
      );
    }
    for (let index = 1; index < recommendations.length; index += 1) {
      assert.ok(
        recommendations[index - 1].score >= recommendations[index].score,
        'recommendations must be sorted by deterministic score'
      );
    }

    // A presentation-level role override must resolve to the application's
    // canonical role catalogue, not a client-supplied free-text role.
    const roleScoped = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { ai: false, targetRoleId: 'data-analyst', budget: 'any', limit: 5 },
    });
    assert.equal(roleScoped.status, 200);
    assert.equal(roleScoped.body.context.targetRoleSlug, 'data-analyst');
    assert.ok(roleScoped.body.recommendations.length > 0);
  });

  test('a completed course leaves the recommendation list', async () => {
    const completed = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'completed' },
    });
    assert.equal(completed.status, 201);

    const check = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: {
        ai: false,
        budget: 'free_only',
        focusSkill: 'Python',
        limit: 20,
      },
    });
    assert.equal(check.status, 200);
    const ids = check.body.recommendations.map(
      (entry: { course: LearningCourse }) => entry.course.id
    );
    assert.equal(ids.includes(COURSE_ID), false);
  });
});

describe('B.5 RLS and catalogue protection', () => {
  test('a user can read and write only their own learning state', async () => {
    const created = await api('POST', '/api/learning/items', {
      token: user.token,
      body: { courseId: COURSE_ID, status: 'saved' },
    });
    assert.equal(created.status, 201);

    const otherRead = await otherUser.client
      .from('user_learning_items')
      .select('*')
      .eq('profile_id', user.id);
    assert.equal(otherRead.error, null);
    assert.deepEqual(otherRead.data, []);

    const forgedInsert = await otherUser.client.from('user_learning_items').insert({
      profile_id: user.id,
      course_id: COURSE_ID,
      status: 'completed',
    });
    assert.ok(forgedInsert.error, 'another user must not be able to insert into my state');

    const forgedUpdate = await otherUser.client
      .from('user_learning_items')
      .update({ status: 'dismissed' })
      .eq('profile_id', user.id)
      .select('id');
    assert.deepEqual(forgedUpdate.data, []);

    const forgedDelete = await otherUser.client
      .from('user_learning_items')
      .delete()
      .eq('profile_id', user.id)
      .select('id');
    assert.deepEqual(forgedDelete.data, []);

    const { data: rows, error } = await admin
      .from('user_learning_items')
      .select('status')
      .eq('profile_id', user.id)
      .eq('course_id', COURSE_ID);
    assert.equal(error, null);
    assert.equal(rows?.[0]?.status, 'saved');
  });

  test('the catalogue is public-read and write-protected for every client', async () => {
    const anonRead = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_ID)
      .maybeSingle();
    assert.equal(anonRead.error, null);
    assert.equal(anonRead.data?.id, COURSE_ID);

    const anonInsert = await anon.from('courses').insert({
      id: 'test-forged-course',
      title: 'Forged',
      provider: 'Forged',
      category: 'Programming',
      level: 'Beginner',
      language: 'English',
      url: 'https://example.com/forged',
      availability: 'free',
      format: 'course',
    });
    assert.ok(anonInsert.error, 'anon must not be able to insert catalogue rows');

    const userInsert = await user.client.from('courses').insert({
      id: 'test-forged-course-2',
      title: 'Forged 2',
      provider: 'Forged',
      category: 'Programming',
      level: 'Beginner',
      language: 'English',
      url: 'https://example.com/forged-2',
      availability: 'free',
      format: 'course',
    });
    assert.ok(userInsert.error, 'authenticated users must not write the catalogue');

    const anonItems = await anon.from('user_learning_items').select('id');
    assert.equal(anonItems.error, null);
    assert.deepEqual(anonItems.data, []);
  });
});
