// The AI career mentor.
//
// The work: read the candidate's own career record, answer their question from
// it, and check the answer back against the record so that nothing is claimed
// that the account does not support.
//
// The evidence travels with the answer. The candidate is told what was
// removed and why, so a shortened answer is never mistaken for a complete
// one.

import { JobError, runJob, type JobContext, type JobPayload } from '../runtime.ts';
import { loadAiCareerContext, buildAiContextBlock } from '../../ai/careerContext.ts';
import { groundingRules, stripUngroundedSentences } from '../../ai/grounding.ts';
import { buildGroundingProfileForUser } from '../../ai/groundingProfile.ts';
import { ai, getGeminiModel } from '../../ai/geminiConfig.ts';
import { aiLanguageInstruction, normalizeAiLanguage } from '../../../shared/aiLanguages.ts';

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

export async function processAiMentorWorkflowTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as MentorPayload;
  return runJob(typed, context, 'reading your career record', async () => {
    const question = (typed.question ?? '').trim().slice(0, 2000);
    if (question.length < 5) {
      throw new JobError('question_required', 'Ask the mentor a question first.');
    }
    if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
      throw new JobError('no_model', 'The AI assistant is not available on this server right now.');
    }

    await context.reportStage('reading your career record');
    const careerContext = await loadAiCareerContext(typed.profileId, {
      language: typed.language,
    });
    const contextBlock = buildAiContextBlock(careerContext);

    await context.reportStage('writing the answer');
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildMentorPrompt(contextBlock, question, typed.language ?? 'en'),
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

    await context.reportStage('checking the answer against your record');
    const grounding = await buildGroundingProfileForUser(typed.profileId);
    const stripped = stripUngroundedSentences(answer, grounding);
    const removed = stripped.removed.map((claim) => claim.claim);

    if (removed.length > 0) {
      console.info('Claims without a record in the account were removed from the answer.', {
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
  });
}
