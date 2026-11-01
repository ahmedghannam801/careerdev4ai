/**
 * Finding the problems in the projects the candidate already has.
 *
 * The problems are read out of the record, not judged by a model. A project
 * with no description has no description; a project whose technologies appear
 * nowhere in the target role's skill list does not demonstrate that role; a
 * project marked complete with no deliverables produced nothing. Each of those
 * is a fact, and each one is checked by the shared engine so that the report
 * says the same thing every time.
 *
 * The model is used for one thing only: rewriting the suggestions so they read
 * like advice rather than a checklist. It never decides whether a problem
 * exists and never invents one. Its output is checked against the candidate's
 * record in the same way as any other generated text, so a CV line it writes
 * that names something the candidate does not have is dropped rather than
 * shown.
 */

import {
  analyzeProjectRecord,
  parseProjectHealthPayload,
  type ProjectHealthReport,
  type ProjectIssue,
  type ProjectRecommendationContext,
} from '../../shared/projectRecommendation.ts';
import { findUngroundedClaims, withOwnText } from '../ai/grounding.ts';
import { buildGroundingProfileForUser } from '../ai/groundingProfile.ts';
import type { ProjectRecord } from '../../shared/projectRecommendation.ts';
import {
  aiLanguageInstruction,
  type AiLanguageCode,
} from '../../shared/aiLanguages.ts';

/** The AI client shape this module needs. */
export interface ProjectAnalysisAiClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

/**
 * The prompt that improves the wording of the suggestions.
 *
 * The problems themselves are handed to the model as facts. It is asked to
 * phrase them, not to find them, so it cannot invent a problem that is not
 * there.
 */
export function buildProjectHealthPrompt(input: {
  project: ProjectRecord;
  issues: ProjectIssue[];
  context: ProjectRecommendationContext;
  language?: AiLanguageCode;
}): string {
  const { project, issues, context } = input;
  const parts: string[] = [];

  parts.push('You are improving the wording of advice about ONE portfolio project.');
  parts.push('');
  parts.push('The project record, exactly as the candidate recorded it:');
  parts.push(`- title: ${project.title}`);
  parts.push(`- goal: ${project.goal ?? '(none)'}`);
  parts.push(`- description: ${project.description ?? '(none)'}`);
  parts.push(`- status: ${project.status ?? '(none)'}`);
  parts.push(`- technologies: ${project.skills.length > 0 ? project.skills.join(', ') : '(none)'}`);
  parts.push(`- tasks: ${project.tasks.length > 0 ? project.tasks.join('; ') : '(none)'}`);
  parts.push(`- deliverables: ${project.deliverables.length > 0 ? project.deliverables.join('; ') : '(none)'}`);
  parts.push('');

  parts.push('The candidate\'s target role:');
  parts.push(`- role: ${context.targetRoleTitle ?? 'not set'}`);
  if (context.roleSkills.length > 0) {
    parts.push(`- the role\'s skills: ${context.roleSkills.join(', ')}`);
  }
  if (context.currentSkills.length > 0) {
    parts.push(
      `- skills the candidate has: ${context.currentSkills.map((skill) => `${skill.name} (${skill.level}/5)`).join(', ')}`
    );
  }
  parts.push('');

  parts.push('The problems that were found in the record. These are facts; do not add others and do not remove any:');
  for (const issue of issues) {
    parts.push(`- [${issue.severity}] ${issue.title}: ${issue.detail}`);
  }
  parts.push('');

  parts.push('Write:');
  parts.push('- cvPresentation: one line showing how to write this project on a CV, using only what the record holds.');
  parts.push('- improvements: one short, specific line per problem, telling the candidate exactly what to do next.');
  parts.push('');
  parts.push('Rules:');
  parts.push('- There must be exactly one improvement line per problem listed above, in the same order.');
  parts.push('- Never invent a technology, a metric, a company or a dataset the record does not contain.');
  parts.push('- The CV line must be writable today from the record. If the record is too thin, write the line for what is there.');
  parts.push(`- ${aiLanguageInstruction(input.language ?? 'en')}`);
  parts.push(
    '- Return JSON: {"cvPresentation": string, "improvements": string[]}'
  );

  return parts.join('\n');
}

/**
 * Checks the projects the candidate already has.
 *
 * The deterministic report is always produced for every project. The model is
 * optional: when it is there, the wording of the suggestions improves; when
 * it is not, the factual report stands on its own.
 */
export async function analyzeProjects(input: {
  userId: string;
  context: ProjectRecommendationContext;
  ai: ProjectAnalysisAiClient | null;
  model: string;
  language?: AiLanguageCode;
}): Promise<{ reports: ProjectHealthReport[]; aiUsed: boolean; aiFallbackReason: string | null }> {
  const groundingProfile = await buildGroundingProfileForUser(input.userId);

  const reports: ProjectHealthReport[] = [];

  for (const project of input.context.existingProjects) {
    const analysis = analyzeProjectRecord(project, input.context);

    // The project's own words are the candidate's own claims, so they pass
    // the grounding check.
    const ownText = [
      project.title,
      project.goal ?? '',
      project.description ?? '',
      ...project.tasks,
      ...project.deliverables,
    ].filter(Boolean);
    const known = withOwnText(groundingProfile, ownText);

    let cvPresentation = analysis.cvPresentation;
    let issues = analysis.issues;
    let aiUsed = false;

    if (input.ai && analysis.issues.length > 0) {
      try {
        const response = await input.ai.models.generateContent({
          model: input.model,
          contents: buildProjectHealthPrompt({
            project,
            issues: analysis.issues,
            context: input.context,
            language: input.language,
          }),
          config: { responseMimeType: 'application/json' },
        });

        const parsed = parseProjectHealthPayload(JSON.parse(response.text || '{}'));

        if (parsed) {
          const claims = findUngroundedClaims(parsed.cvPresentation, known);
          if (claims.length === 0 && parsed.cvPresentation.trim()) {
            cvPresentation = parsed.cvPresentation.trim();
          }

          if (parsed.improvements.length === analysis.issues.length) {
            issues = analysis.issues.map((issue, index) => ({
              ...issue,
              suggestion: parsed.improvements[index],
            }));
            aiUsed = true;
          }
        }
      } catch (error) {
        console.error('Failed to improve the project analysis:', error);
      }
    }

    reports.push({
      projectId: project.id,
      projectTitle: project.title,
      issues,
      cvPresentation,
      relevantSkills: analysis.relevantSkills,
      missingRoleSkills: analysis.missingRoleSkills,
      score: analysis.score,
      aiUsed,
    });
  }

  return {
    reports,
    aiUsed: reports.some((report) => report.aiUsed),
    aiFallbackReason: input.ai ? null : 'no_model',
  };
}
