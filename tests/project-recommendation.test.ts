/**
 * The project advisor: what it recommends, and what it finds wrong with what
 * the candidate already has.
 *
 * Two things are being protected here.
 *
 * The first is that a recommendation is specific to the candidate. The briefs
 * are built from the candidate's own record — their role, their gaps, their
 * roadmap, what they have already been studying — paired with the curated
 * portfolio work the role catalogue names. A brief that closes one of the
 * candidate's own gaps must say so, and a brief that neither closes a gap nor
 * builds on anything they have is not worth their time and must not be
 * offered.
 *
 * The second is that the problems reported about an existing project are
 * facts about the record. A project with no deliverables has no deliverables,
 * and a project whose technologies appear nowhere in the target role does not
 * demonstrate that role. The score has to fall when the record is weak and
 * stay high when it is strong.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeProjectRecord,
  buildCatalogueProjectPlan,
  buildCvPresentation,
  deriveProjectBriefs,
  difficultyForBrief,
  parseProjectHealthPayload,
  parseProjectPlanPayload,
  parseProjectPlansPayload,
  selectCareerPath,
  validateProjectHealthPayload,
  validateProjectPlanPayload,
  type ProjectRecord,
  type ProjectRecommendationContext,
} from '../shared/projectRecommendation.ts';

import {
  attachRealResources,
  buildProjectPlanPrompt,
} from '../server/projects/recommendation.ts';

/** A candidate with a role, two open gaps and one completed project. */
const context: ProjectRecommendationContext = {
  targetRoleTitle: 'Frontend Engineer',
  careerLevel: 'Mid',
  roleSkills: ['React', 'TypeScript', 'Accessibility', 'Testing', 'GraphQL'],
  roleTools: ['React', 'TypeScript', 'Vite', 'Jest'],
  catalogueProjects: [
    'Build a design system component library with accessibility tests',
    'Ship a real-time dashboard over a live data feed',
  ],
  catalogueEvidence: [
    'A public repository with the source code',
    'A live demo of the finished thing',
    'A short write-up of the problem and the approach',
  ],
  careerPath: [
    'Define the problem and the users',
    'Build the first working version',
    'Write the tests',
    'Publish it and write it up',
  ],
  proficiencyExpectations: [
    'Owns a component library other teams use',
    'Measures and improves accessibility',
  ],
  openSkillGaps: [
    { name: 'GraphQL', priority: 'high', gap: 2 },
    { name: 'Testing', priority: 'medium', gap: 1 },
  ],
  coveredSkills: ['React', 'TypeScript'],
  currentSkills: [
    { name: 'React', level: 4 },
    { name: 'TypeScript', level: 3 },
  ],
  roadmapSkills: ['GraphQL'],
  learningInProgress: ['GraphQL Foundations'],
  completedCourses: ['React Basics'],
  existingProjects: [],
  jobDescriptionTitle: null,
  jobDescriptionRequirements: [],
};

/** A project that is in good shape. */
const strongProject: ProjectRecord = {
  id: 'p-strong',
  title: 'Accessible component library',
  goal: 'Ship a component library the team can actually use.',
  description:
    'Built a React component library with keyboard support, screen reader labels and a full test suite covering every component.',
  difficulty: 'Intermediate',
  status: 'completed',
  tasks: ['Design the tokens', 'Build the components', 'Write the tests'],
  deliverables: ['Public repository', 'Storybook documentation'],
  skills: ['React', 'TypeScript', 'Accessibility', 'Testing'],
};

describe('the career path', () => {
  it('gives an entry-level candidate the entry path', () => {
    const path = selectCareerPath(
      { entry: ['a'], intermediate: ['b'], advanced: ['c'] },
      'Entry'
    );
    assert.deepEqual(path, ['a']);
  });

  it('gives a mid-level candidate the intermediate path', () => {
    const path = selectCareerPath(
      { entry: ['a'], intermediate: ['b'], advanced: ['c'] },
      'Mid'
    );
    assert.deepEqual(path, ['b']);
  });

  it('gives a senior candidate the advanced path', () => {
    const path = selectCareerPath(
      { entry: ['a'], intermediate: ['b'], advanced: ['c'] },
      'Senior'
    );
    assert.deepEqual(path, ['c']);
  });

  it('falls back when the catalogue has nothing for that level', () => {
    const path = selectCareerPath({ entry: ['a'], intermediate: [], advanced: [] }, 'Senior');
    assert.deepEqual(path, ['a']);
  });
});

describe('the difficulty of a project', () => {
  it('follows the career level', () => {
    assert.equal(difficultyForBrief('Entry', null), 'Beginner');
    assert.equal(difficultyForBrief('Mid', null), 'Intermediate');
    assert.equal(difficultyForBrief('Senior', null), 'Advanced');
  });

  it('is worth the extra difficulty for a critical gap', () => {
    assert.equal(difficultyForBrief('Mid', 'critical'), 'Advanced');
    assert.equal(difficultyForBrief('Mid', 'high'), 'Intermediate');
  });
});

describe('deriving the briefs', () => {
  it('produces briefs from the catalogue and the candidate\'s gaps', () => {
    const briefs = deriveProjectBriefs(context);
    assert.ok(briefs.length > 0);
    assert.ok(
      briefs.some((brief) => brief.title.includes('design system component library')),
      'the catalogue\'s portfolio work is a source of briefs'
    );
    assert.ok(
      briefs.some((brief) => brief.gapAddressed === 'GraphQL'),
      'the candidate\'s own gap is a source of briefs'
    );
  });

  it('says which gap a brief closes and which skills it builds on', () => {
    const briefs = deriveProjectBriefs(context);
    const graphQlBrief = briefs.find((brief) => brief.gapAddressed === 'GraphQL');
    assert.ok(graphQlBrief);
    assert.match(graphQlBrief.reason, /GraphQL/);
  });

  it('does not offer a brief that neither closes a gap nor builds on anything', () => {
    const briefs = deriveProjectBriefs({
      ...context,
      currentSkills: [],
      catalogueProjects: ['Bake sourdough bread at home'],
      openSkillGaps: [],
      roleSkills: [],
      jobDescriptionRequirements: [],
    });
    assert.deepEqual(briefs, []);
  });

  it('aims a brief at the job description when one is available', () => {
    const briefs = deriveProjectBriefs({
      ...context,
      catalogueProjects: [],
      openSkillGaps: [],
      jobDescriptionRequirements: ['GraphQL'],
    });
    assert.ok(briefs.length > 0);
    assert.match(briefs[0].title, /GraphQL/);
  });
});

describe('the catalogue plan', () => {
  const briefs = deriveProjectBriefs(context);
  const plan = buildCatalogueProjectPlan(briefs[0], context);

  it('takes its steps from the catalogue\'s career path', () => {
    assert.deepEqual(plan.steps, context.careerPath);
  });

  it('takes its deliverables from the catalogue\'s evidence list', () => {
    assert.deepEqual(plan.deliverables, context.catalogueEvidence);
  });

  it('takes its milestones from the catalogue\'s proficiency expectations', () => {
    assert.equal(plan.milestones.length, context.proficiencyExpectations.length);
    assert.equal(plan.milestones[0].title, context.proficiencyExpectations[0]);
  });

  it('is not marked as written by a model', () => {
    assert.equal(plan.aiGenerated, false);
  });

  it('carries the gap it closes as a measurement, not an opinion', () => {
    const graphQlPlan = buildCatalogueProjectPlan(
      briefs.find((brief) => brief.gapAddressed === 'GraphQL') ?? briefs[0],
      context
    );
    assert.deepEqual(graphQlPlan.gapsAddressed, ['GraphQL']);
  });

  it('names the tools the role uses', () => {
    assert.deepEqual(plan.tools, context.roleTools);
  });
});

describe('the CV line for a project', () => {
  it('names the project and the technologies it used', () => {
    const line = buildCvPresentation('Dashboard tool', ['React', 'TypeScript']);
    assert.match(line, /Dashboard tool/);
    assert.match(line, /React/);
  });

  it('adds the outcome only when there is one', () => {
    const line = buildCvPresentation('Dashboard tool', ['React'], 'Reduced build times');
    assert.match(line, /Reduced build times/);
    assert.equal(buildCvPresentation('Dashboard tool', ['React']), 'Dashboard tool (React)');
  });
});

describe('checking an existing project', () => {
  it('finds nothing wrong with a project that is in good shape', () => {
    const result = analyzeProjectRecord(strongProject, context);
    assert.deepEqual(result.issues, []);
    assert.equal(result.score, 100);
  });

  it('reports a project with no description', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, description: null },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'weak_description');
    assert.ok(issue, 'a project with no description is reported');
    assert.equal(issue.severity, 'high');
  });

  it('reports a description that is too short to say anything', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, description: 'A React project.' },
      context
    );
    assert.ok(result.issues.find((entry) => entry.kind === 'weak_description'));
  });

  it('reports a project with nothing to show at the end of it', () => {
    const result = analyzeProjectRecord({ ...strongProject, deliverables: [] }, context);
    const issue = result.issues.find((entry) => entry.kind === 'missing_deliverables');
    assert.ok(issue);
    assert.equal(issue.severity, 'high');
  });

  it('reports a project with no technologies recorded', () => {
    const result = analyzeProjectRecord({ ...strongProject, skills: [] }, context);
    const issue = result.issues.find((entry) => entry.kind === 'missing_technologies');
    assert.ok(issue);
  });

  it('reports a project that is under way with no plan behind it', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, status: 'in_progress', tasks: [] },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'unrealistic_scope');
    assert.ok(issue);
  });

  it('reports a scope that is too large for one portfolio project', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, tasks: Array.from({ length: 20 }, (_, index) => `Task ${index}`) },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'unrealistic_scope');
    assert.ok(issue);
  });

  it('reports a project marked complete that produced nothing', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, status: 'completed', deliverables: [] },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'unrealistic_scope');
    assert.ok(issue);
    assert.equal(issue.severity, 'high');
  });

  it('reports a project that cannot be written on a CV yet', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, description: null, skills: [] },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'poor_cv_presentation');
    assert.ok(issue);
  });

  it('reports a project that demonstrates nothing the role asks for', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, skills: ['Excel', 'PowerPoint'] },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'role_relevance');
    assert.ok(issue);
    assert.equal(issue.severity, 'high');
  });

  it('reports a project that closes none of the gaps the candidate still has', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, skills: ['React', 'TypeScript', 'Accessibility'] },
      context
    );
    const issue = result.issues.find((entry) => entry.kind === 'missing_skills');
    assert.ok(issue);
    assert.match(issue.detail, /GraphQL/);
  });

  it('does not report that when the project does close one of the gaps', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, skills: ['React', 'TypeScript', 'Accessibility', 'GraphQL'] },
      context
    );
    assert.equal(
      result.issues.find((entry) => entry.kind === 'missing_skills'),
      undefined
    );
  });

  it('lists the role skills the project does not show', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, skills: ['React', 'TypeScript', 'Accessibility', 'Testing'] },
      context
    );
    assert.deepEqual(result.missingRoleSkills, ['GraphQL']);
    assert.ok(result.relevantSkills.includes('React'));
  });

  it('falls as the problems accumulate', () => {
    const strong = analyzeProjectRecord(strongProject, context);
    const weak = analyzeProjectRecord(
      {
        ...strongProject,
        description: null,
        deliverables: [],
        skills: ['Excel'],
        tasks: [],
        status: 'in_progress',
      },
      context
    );
    assert.ok(weak.score < strong.score, 'a weaker project scores lower');
    assert.ok(weak.score >= 0, 'the score never goes below zero');
  });

  it('puts the most serious problem first', () => {
    const result = analyzeProjectRecord(
      { ...strongProject, description: null, deliverables: [] },
      context
    );
    assert.equal(result.issues[0].severity, 'high');
  });
});

describe('the project plan contract', () => {
  it('accepts a plan that satisfies the shape', () => {
    const errors = validateProjectPlanPayload({
      title: 'A dashboard',
      whyItFits: 'Because you already know React.',
      skillsToDevelop: ['GraphQL'],
      tools: ['React'],
      difficulty: 'Intermediate',
      expectedOutcome: 'A finished dashboard.',
      steps: ['Plan', 'Build'],
      milestones: [{ title: 'First version', outcome: 'It runs.' }],
      deliverables: ['A repository'],
      cvPresentation: 'Dashboard — React, GraphQL.',
    });
    assert.deepEqual(errors, []);
  });

  it('rejects a plan that does not satisfy the shape', () => {
    assert.ok(validateProjectPlanPayload(null).length > 0);
    assert.ok(validateProjectPlanPayload({ title: '' }).length > 0);
    assert.ok(validateProjectPlanPayload({ title: 'x', difficulty: 'Impossible' }).length > 0);
    assert.ok(validateProjectPlanPayload({ title: 'x', steps: 'one' }).length > 0);
    assert.ok(
      validateProjectPlanPayload({ title: 'x', milestones: [{ title: 'x' }] }).length > 0
    );
  });

  it('reads a valid plan', () => {
    const plan = parseProjectPlanPayload({
      title: 'A dashboard',
      whyItFits: 'Because you already know React.',
      skillsToDevelop: ['GraphQL'],
      tools: ['React'],
      difficulty: 'Intermediate',
      expectedOutcome: 'A finished dashboard.',
      steps: ['Plan', 'Build'],
      milestones: [{ title: 'First version', outcome: 'It runs.' }],
      deliverables: ['A repository'],
      cvPresentation: 'Dashboard — React, GraphQL.',
    });
    assert.ok(plan);
    assert.equal(plan.difficulty, 'Intermediate');
    assert.equal(plan.aiGenerated, true);
  });

  it('reads a set of plans and drops the ones that are unusable', () => {
    const plans = parseProjectPlansPayload({
      plans: [
        {
          title: 'A dashboard',
          whyItFits: 'Because you already know React.',
          skillsToDevelop: [],
          tools: [],
          difficulty: 'Intermediate',
          expectedOutcome: 'A finished dashboard.',
          steps: [],
          milestones: [],
          deliverables: [],
          cvPresentation: 'Dashboard.',
        },
        { title: 'An incomplete plan' },
      ],
    });
    assert.ok(plans);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].title, 'A dashboard');
  });

  it('returns null when there is no set of plans at all', () => {
    assert.equal(parseProjectPlansPayload(null), null);
    assert.equal(parseProjectPlansPayload({ plans: 'none' }), null);
  });
});

describe('the project health contract', () => {
  it('accepts a health payload that satisfies the shape', () => {
    assert.deepEqual(
      validateProjectHealthPayload({
        cvPresentation: 'A component library — React, TypeScript.',
        improvements: ['Add a live demo.'],
      }),
      []
    );
  });

  it('rejects a health payload that does not satisfy the shape', () => {
    assert.ok(validateProjectHealthPayload(null).length > 0);
    assert.ok(validateProjectHealthPayload({ cvPresentation: '' }).length > 0);
    assert.ok(validateProjectHealthPayload({ improvements: [1] }).length > 0);
  });

  it('reads a valid health payload', () => {
    const parsed = parseProjectHealthPayload({
      cvPresentation: 'A component library — React, TypeScript.',
      improvements: ['Add a live demo.'],
    });
    assert.ok(parsed);
    assert.equal(parsed.improvements.length, 1);
  });
});

describe('the resources a plan may point at', () => {
  const courses = [
    {
      id: 'c1',
      title: 'GraphQL Foundations',
      provider: 'A provider',
      providerUrl: null,
      category: 'Development',
      level: 'Beginner' as const,
      durationHours: 10,
      language: 'en',
      url: 'https://example.test/graphql-foundations',
      availability: 'open' as const,
      availabilityNote: null,
      format: 'course' as const,
      description: 'Learn GraphQL.',
      isVerified: true,
      skills: [{ name: 'GraphQL', importance: 1 }],
      roles: [{ roleSlug: 'frontend-engineer', relevanceScore: 1 }],
    },
    {
      id: 'c2',
      title: 'Unrelated Cooking',
      provider: 'A provider',
      providerUrl: null,
      category: 'Other',
      level: 'Beginner' as const,
      durationHours: 5,
      language: 'en',
      url: 'https://example.test/cooking',
      availability: 'open' as const,
      availabilityNote: null,
      format: 'course' as const,
      description: 'Learn to cook.',
      isVerified: true,
      skills: [{ name: 'Cooking', importance: 1 }],
      roles: [],
    },
  ];

  it('attaches only courses that teach what the plan develops', () => {
    const resources = attachRealResources(
      { skillsToDevelop: ['GraphQL'], tools: [] },
      courses
    );
    assert.equal(resources.length, 1);
    assert.equal(resources[0].label, 'GraphQL Foundations');
  });

  it('takes the link from the catalogue, never from the model', () => {
    const resources = attachRealResources(
      { skillsToDevelop: ['GraphQL'], tools: [] },
      courses
    );
    assert.equal(resources[0].url, 'https://example.test/graphql-foundations');
  });

  it('attaches nothing when the plan teaches nothing the catalogue has', () => {
    const resources = attachRealResources(
      { skillsToDevelop: ['Underwater Basket Weaving'], tools: [] },
      courses
    );
    assert.deepEqual(resources, []);
  });
});

describe('the plan prompt', () => {
  const briefs = deriveProjectBriefs(context);

  it('gives the model the candidate\'s own record', () => {
    const prompt = buildProjectPlanPrompt({ briefs, context });
    assert.match(prompt, /React \(4\/5\)/);
    assert.match(prompt, /GraphQL/);
    assert.match(prompt, /Their roadmap|their roadmap/);
  });

  it('gives the model the catalogue content to build on', () => {
    const prompt = buildProjectPlanPrompt({ briefs, context });
    assert.match(prompt, /Define the problem and the users/);
    assert.match(prompt, /A public repository with the source code/);
  });

  it('forbids the model from inventing a dataset, a course or a URL', () => {
    const prompt = buildProjectPlanPrompt({ briefs, context });
    assert.match(prompt, /Never invent a dataset, a company, a course, a certification or a URL/);
  });

  it('asks for one plan per project, in order', () => {
    const prompt = buildProjectPlanPrompt({ briefs, context });
    assert.match(prompt, /Return one plan per project/);
    assert.match(prompt, /"plans"/);
  });
});
