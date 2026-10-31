/**
 * Recommending projects, and writing the plan for one.
 *
 * The engine is deliberately two-layered, and the deterministic layer comes
 * first and is never optional.
 *
 * The deterministic layer reads the candidate's own record — their target
 * role, their rated skills, their open gaps, their roadmap, their learning
 * history, the projects they already have — and pairs it with the curated
 * portfolio work the role catalogue names for their role and level. The
 * pairing is what makes a recommendation specific to this candidate rather
 * than a list of projects everyone is told to build.
 *
 * The model layer runs on top of that and is allowed to do one thing: write a
 * better plan for the project that was chosen. It is given the candidate's
 * record, the catalogue content and the brief, and it is told that the
 * catalogue's steps and the candidate's own skills are the only material it
 * may use. When it is unavailable, or answers with something that does not
 * satisfy the contract, the deterministic plan is returned unchanged and the
 * caller is told why.
 *
 * Resources are never written by the model. A plan's resources are courses
 * from the platform's own catalogue, attached by the server, so a plan can
 * only ever point at a link that exists.
 */

import {
  buildCatalogueProjectPlan,
  deriveProjectBriefs,
  parseProjectPlansPayload,
  selectCareerPath,
  type CareerLevel,
  type ProjectBrief,
  type ProjectPlan,
  type ProjectRecommendationContext,
  type ProjectResource,
} from '../../shared/projectRecommendation.ts';
import { computeSkillGaps, coveredSkillGaps, openSkillGaps, toRoleSkillRequirements } from '../../shared/skillGap.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import type { JobDescriptionAnalysis } from '../../shared/jobDescription.ts';
import { getProfileDto } from '../db/profile.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { listProjects } from '../db/projects.ts';
import { listRoadmaps } from '../db/roadmap.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';
import type { LearningCourse } from '../learning/recommendation.ts';

/** The AI client shape this module needs. */
export interface ProjectAiClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

/**
 * Reads the context the recommendations are built from.
 *
 * Every read is scoped to the verified user id. A failing area degrades that
 * area alone: a candidate whose roadmap cannot be read still gets a
 * recommendation.
 */
export async function buildProjectRecommendationContext(
  userId: string,
  jobDescription?: JobDescriptionAnalysis | null
): Promise<ProjectRecommendationContext> {
  const [profile, skillRows, projects, roadmaps, learningItems, courses] = await Promise.all([
    getProfileDto(userId).catch(() => null),
    getUserSkills(userId).catch(() => []),
    listProjects(userId).catch(() => []),
    listRoadmaps(userId).catch(() => []),
    listLearningItems(userId).catch(() => []),
    listCourses().catch(() => [] as LearningCourse[]),
  ]);

  const role = resolveRole(profile?.targetRole ?? null);
  const roleSkills = [
    ...(role?.requiredSkills ?? []).map((skill) => skill.name),
    ...(role?.preferredSkills ?? []).map((skill) => skill.name),
  ];

  const currentSkills = skillRows
    .map((row) => ({ name: row.skill?.name ?? '', level: row.proficiency ?? 1 }))
    .filter((skill) => Boolean(skill.name));

  const gaps = role
    ? computeSkillGaps(
        toRoleSkillRequirements({ requiredSkills: role.requiredSkills, preferredSkills: role.preferredSkills }),
        currentSkills
      )
    : [];

  const careerPath = role
    ? selectCareerPath(
        {
          entry: role.entryPath ?? [],
          intermediate: role.intermediatePath ?? [],
          advanced: role.advancedPath ?? [],
        },
        (role.level ?? null) as CareerLevel | null
      )
    : [];

  const proficiencyExpectations = (role?.proficiencyExpectations ?? []).map(
    (entry) => entry.expectation
  );

  const roadmapSkills = roadmaps
    .flatMap((roadmap) =>
      roadmap.phases.flatMap((phase) =>
        phase.milestones.flatMap((milestone) =>
          milestone.tasks.map((task) => task.skillName).filter((name): name is string => Boolean(name))
        )
      )
    )
    .filter((name): name is string => Boolean(name));

  const courseById = new Map(courses.map((course) => [course.id, course]));

  const learningInProgress: string[] = [];
  const completedCourses: string[] = [];
  for (const item of learningItems) {
    const course = courseById.get(item.courseId);
    if (!course) continue;
    if (item.status === 'in_progress' || item.status === 'saved') {
      learningInProgress.push(course.title);
    } else if (item.status === 'completed') {
      completedCourses.push(course.title);
    }
  }

  const jobDescriptionRequirements = jobDescription
    ? [
        ...jobDescription.requiredSkills,
        ...jobDescription.technicalSkills,
        ...jobDescription.keywords,
      ]
    : [];

  return {
    targetRoleTitle: role?.title ?? profile?.targetRole ?? null,
    careerLevel: (role?.level ?? null) as CareerLevel | null,
    roleSkills,
    roleTools: role?.tools ?? [],
    catalogueProjects: role?.typicalProjects ?? [],
    catalogueEvidence: role?.evidenceSuggestions ?? [],
    careerPath,
    proficiencyExpectations,
    openSkillGaps: openSkillGaps(gaps).map((gap) => ({
      name: gap.name,
      priority: gap.priority,
      gap: gap.gap,
    })),
    coveredSkills: coveredSkillGaps(gaps).map((gap) => gap.name),
    currentSkills,
    roadmapSkills: [...new Set(roadmapSkills)],
    learningInProgress: [...new Set(learningInProgress)],
    completedCourses: [...new Set(completedCourses)],
    existingProjects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      goal: project.goal,
      description: project.description,
      difficulty: project.difficulty,
      status: project.status,
      tasks: project.tasks,
      deliverables: project.deliverables,
      skills: project.skills,
    })),
    jobDescriptionTitle: jobDescription?.jobTitle ?? null,
    jobDescriptionRequirements,
  };
}

/**
 * Attaches the resources a plan may point at.
 *
 * The resources are courses from the platform's own catalogue, chosen because
 * they teach the skills the plan develops. The URL is the catalogue's URL, so
 * it exists.
 */
export function attachRealResources(
  plan: Pick<ProjectPlan, 'skillsToDevelop' | 'tools'>,
  courses: LearningCourse[],
  limit = 3
): ProjectResource[] {
  const wanted = [...plan.skillsToDevelop, ...plan.tools].map((name) => name.toLowerCase());
  if (wanted.length === 0) return [];

  const scored = courses
    .map((course) => {
      const haystack = [
        course.title,
        course.description ?? '',
        ...course.skills.map((skill) => skill.name),
      ]
        .join(' ')
        .toLowerCase();
      let score = 0;
      for (const name of wanted) {
        if (!name) continue;
        if (haystack.includes(name)) score += 2;
      }
      return { course, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title));

  return scored.slice(0, limit).map(({ course }) => ({
    label: course.title,
    kind: 'course' as const,
    url: course.url,
    note: `Covers ${course.skills.slice(0, 3).map((skill) => skill.name).join(', ')} — ${course.level} level.`,
  }));
}

/**
 * The prompt that writes the plans.
 *
 * The catalogue content and the candidate's own record are the only material
 * the model may use, and the rules say so explicitly: a plan that invents a
 * tool the candidate has not used, or a dataset that does not exist, is worse
 * than no plan at all.
 *
 * All the plans are written in one call, so they read as one set and the
 * request costs one unit of the daily allowance.
 */
export function buildProjectPlanPrompt(input: {
  briefs: ProjectBrief[];
  context: ProjectRecommendationContext;
  language?: 'en' | 'ar';
}): string {
  const { briefs, context } = input;
  const parts: string[] = [];

  parts.push(
    `You are writing the plan for ${briefs.length} portfolio project${briefs.length === 1 ? '' : 's'} for ONE candidate.`
  );
  parts.push('');

  parts.push('The candidate\'s own record:');
  parts.push(`- Target role: ${context.targetRoleTitle ?? 'not set'}`);
  parts.push(`- Career level: ${context.careerLevel ?? 'not set'}`);
  if (context.currentSkills.length > 0) {
    parts.push(
      `- Skills they already have: ${context.currentSkills.map((skill) => `${skill.name} (${skill.level}/5)`).join(', ')}`
    );
  }
  if (context.coveredSkills.length > 0) {
    parts.push(`- Role skills they already meet: ${context.coveredSkills.join(', ')}`);
  }
  if (context.openSkillGaps.length > 0) {
    parts.push(
      `- Role skills they still lack: ${context.openSkillGaps.map((gap) => gap.name).join(', ')}`
    );
  }
  if (context.roadmapSkills.length > 0) {
    parts.push(`- What their roadmap is already working on: ${context.roadmapSkills.join(', ')}`);
  }
  if (context.learningInProgress.length > 0) {
    parts.push(`- Courses they have already started: ${context.learningInProgress.join(', ')}`);
  }
  if (context.existingProjects.length > 0) {
    parts.push(
      `- Projects they already have: ${context.existingProjects.map((project) => project.title).join(', ')}`
    );
  }
  if (context.jobDescriptionTitle) {
    parts.push(`- The job description they are aiming at: ${context.jobDescriptionTitle}`);
  }
  if (context.jobDescriptionRequirements.length > 0) {
    parts.push(
      `- What that job description asks for: ${context.jobDescriptionRequirements.join(', ')}`
    );
  }
  parts.push('');

  if (context.careerPath.length > 0) {
    parts.push('The path the catalogue describes for their level — build the steps around these:');
    for (const step of context.careerPath) parts.push(`- ${step}`);
    parts.push('');
  }
  if (context.catalogueEvidence.length > 0) {
    parts.push(
      'The artefacts the catalogue names as evidence for this role — use these as the deliverables:'
    );
    for (const item of context.catalogueEvidence) parts.push(`- ${item}`);
    parts.push('');
  }
  if (context.roleTools.length > 0) {
    parts.push(`The tools this role uses: ${context.roleTools.join(', ')}`);
    parts.push('');
  }

  parts.push('The projects to plan, in this order:');
  briefs.forEach((brief, index) => {
    parts.push(`${index + 1}. ${brief.title}`);
    parts.push(`   Why it suits this candidate: ${brief.reason}`);
    if (brief.gapAddressed) parts.push(`   The skill gap it closes: ${brief.gapAddressed}`);
    if (brief.buildingBlocks.length > 0) {
      parts.push(`   Skills they would bring to it: ${brief.buildingBlocks.join(', ')}`);
    }
  });
  parts.push('');

  parts.push('For EACH project above, write:');
  parts.push('- title: a specific project title, not a category.');
  parts.push('- whyItFits: why this project suits THIS candidate, in two or three sentences.');
  parts.push('- skillsToDevelop: the skills this project develops.');
  parts.push(
    '- tools: the technologies the project would use. Use the tools listed above and the candidate\'s own skills.'
  );
  parts.push('- difficulty: Beginner, Intermediate or Advanced.');
  parts.push('- expectedOutcome: what the candidate has, in one or two sentences.');
  parts.push('- steps: the implementation, in order, one line each.');
  parts.push(
    '- milestones: two to four checkpoints, each with a title and the outcome that shows it was reached.'
  );
  parts.push('- deliverables: what the candidate hands over at the end.');
  parts.push('- cvPresentation: one line showing how to write this project on a CV.');
  parts.push('');
  parts.push('Rules:');
  parts.push(
    '- Only use tools and skills from the information above. Never invent a technology the candidate has not used or the role does not use.'
  );
  parts.push(
    '- Never invent a dataset, a company, a course, a certification or a URL. The resources are attached separately from the platform\'s own catalogue.'
  );
  parts.push('- Never promise a metric, a user number or an outcome the candidate cannot produce.');
  parts.push('- Keep the scope to one project a candidate can finish. Four to eight steps is right.');
  parts.push('- Return one plan per project, in the same order as the list above.');
  if (input.language === 'ar') {
    parts.push('- Write the plans in Arabic.');
  }
  parts.push(
    '- Return JSON: {"plans": [{"title": string, "whyItFits": string, "skillsToDevelop": string[], "tools": string[], "difficulty": "Beginner"|"Intermediate"|"Advanced", "expectedOutcome": string, "steps": string[], "milestones": [{"title": string, "outcome": string}], "deliverables": string[], "cvPresentation": string}]}'
  );

  return parts.join('\n');
}

/**
 * The recommendations for the candidate.
 *
 * The deterministic plans are always produced. When a model is available it
 * rewrites them, and a plan it fails to produce is simply not replaced.
 */
export async function recommendProjects(input: {
  userId: string;
  jobDescription?: JobDescriptionAnalysis | null;
  ai: ProjectAiClient | null;
  model: string;
  language?: 'en' | 'ar';
  limit?: number;
}): Promise<{
  plans: ProjectPlan[];
  context: ProjectRecommendationContext;
  aiUsed: boolean;
  aiFallbackReason: string | null;
}> {
  const context = await buildProjectRecommendationContext(input.userId, input.jobDescription);
  const briefs = deriveProjectBriefs(context, input.limit ?? 4);

  const deterministicPlans = briefs.map((brief) => buildCatalogueProjectPlan(brief, context));

  // The resources are attached here, from the catalogue, for both the
  // deterministic plan and the model's.
  const courses = await listCourses().catch(() => [] as LearningCourse[]);
  const withResources = deterministicPlans.map((plan) => ({
    ...plan,
    resources: attachRealResources(plan, courses),
  }));

  if (!input.ai || briefs.length === 0) {
    return {
      plans: withResources,
      context,
      aiUsed: false,
      aiFallbackReason: input.ai ? null : 'no_model',
    };
  }

  // One call writes the whole set, so the plans are consistent with one
  // another and the request costs a single unit of the daily allowance.
  let generated: Array<Omit<ProjectPlan, 'resources'>> | null = null;

  try {
    const response = await input.ai.models.generateContent({
      model: input.model,
      contents: buildProjectPlanPrompt({ briefs, context, language: input.language }),
      config: { responseMimeType: 'application/json' },
    });
    generated = parseProjectPlansPayload(JSON.parse(response.text || '{}'));
  } catch (error) {
    console.error('Failed to generate the project plans:', error);
    generated = null;
  }

  const enriched: ProjectPlan[] = withResources.map((fallback, index) => {
    const parsed = generated?.[index];
    if (!parsed) return fallback;

    return {
      ...parsed,
      id: fallback.id,
      // The gaps and matched skills are measurements, not opinions, so they
      // survive whatever the model wrote.
      gapsAddressed: fallback.gapsAddressed,
      matchedSkills: fallback.matchedSkills,
      fitScore: fallback.fitScore,
      aiGenerated: true,
      resources: attachRealResources(parsed, courses),
    };
  });

  const aiUsed = enriched.some((plan) => plan.aiGenerated);
  return {
    plans: enriched,
    context,
    aiUsed,
    aiFallbackReason: aiUsed ? null : 'invalid_response',
  };
}
