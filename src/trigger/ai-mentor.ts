// The AI mentor, working in the background.
//
// The mentor answers a question about the candidate's own career. The answer
// is written from the record that is already in the account — profile, skills,
// experiences, education, projects — and every sentence that names something
// the candidate never supplied is removed before the answer is stored.
//
// Running it in the background is what makes the answer recoverable: a
// candidate can ask a question, close the tab, and find the answer waiting
// when they come back.
//
// The evidence travels with the answer. The candidate is told what was
// removed and why, so a shortened answer is never mistaken for a complete
// one.

import { logger, task } from "@trigger.dev/sdk";
import { JobError, reportStage, runJob, type JobPayload } from "../../server/trigger/runtime.ts";
import { loadAiCareerContext, buildAiContextBlock } from "../../server/ai/careerContext.ts";
import { groundingRules, stripUngroundedSentences } from "../../server/ai/grounding.ts";
import { buildGroundingProfileForUser } from "../../server/ai/groundingProfile.ts";
import { ai, getGeminiModel } from "../../server/ai/geminiConfig.ts";
import { aiLanguageInstruction, normalizeAiLanguage } from "../../shared/aiLanguages.ts";

interface MentorPayload extends JobPayload {
  question?: string;
  language?: string;
}

/** The prompt that answers the question from the candidate's own record. */
function buildMentorPrompt(contextBlock: string, question: string, language: string): string {
  return `${contextBlock}

The candidate asks: ${question}

${aiLanguageInstruction(normalizeAiLanguage(language))}

Rules:
- Answer only from the career state above. Never invent an employer, a date, a
  number, a certification or a project that is not in it.
- If the record does not contain enough to answer, say exactly what is missing.
- Be concrete and short. Three or four sentences beat a paragraph of advice.
${groundingRules()}
- Return JSON: { "answer": string }`;
}

export const processAiMentorWorkflowTask = task({
  id: "process-ai-mentor-workflow",
  maxDuration: 600,
  // One answer per candidate at a time.
  concurrency: { perKey: 1 },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  run: async (payload: MentorPayload) =>
    runJob(payload, 'reading your career record', async (job) => {
      const question = (payload.question ?? '').trim().slice(0, 2000);
      if (question.length < 5) {
        throw new JobError('question_required', 'Ask the mentor a question first.');
      }
      if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
        throw new JobError('no_model', 'The AI assistant is not available on this server right now.');
      }

      await reportStage(job.id, 'reading your career record');
      const context = await loadAiCareerContext(payload.profileId, {
        language: payload.language,
      });
      const contextBlock = buildAiContextBlock(context);

      await reportStage(job.id, 'writing the answer');
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: buildMentorPrompt(contextBlock, question, payload.language ?? 'en'),
        config: { responseMimeType: 'application/json' },
      });

      let answer = '';
      try {
        const parsed = JSON.parse(response.text || '{}') as { answer?: unknown };
        answer = typeof parsed.answer === 'string' ? parsed.answer : '';
      } catch {
        answer = '';
      }
      if (!answer.trim()) {
        throw new JobError('invalid_response', 'The mentor could not answer that. Please try again shortly.');
      }

      await reportStage(job.id, 'checking the answer against your record');
      const grounding = await buildGroundingProfileForUser(payload.profileId);
      const stripped = stripUngroundedSentences(answer, grounding);
      const removed = stripped.removed.map((claim) => claim.claim);

      if (removed.length > 0) {
        logger.info('Claims without a record in the account were removed from the answer.', {
          removed: removed.length,
        });
      }

      return {
        question,
        answer: stripped.text,
        removedClaims: removed,
        groundingNote:
          removed.length > 0
            ? 'Part of the answer mentioned details that are not in your profile and was removed. Add the detail to your profile first if you want it used.'
            : null,
      };
    }),
});
