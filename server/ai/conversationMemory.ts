// Conversation memory: what the model is told about earlier turns.
//
// The rule is the same as the rest of the engine: the model gets the recent
// turns verbatim and a short summary of the older ones, and nothing more. A
// thread that has run for an hour must not grow the prompt without bound, and
// a summary written by the server is the only compression that is stored.
import type { AiMessageDTO } from '../db/aiConversations.ts';

/** How many recent turns are sent word for word. */
export const MEMORY_VERBATIM_TURNS = 12;

/** How long the stored summary may be. */
export const MEMORY_SUMMARY_CHARS = 1200;

/**
 * Compresses turns into the stored summary.
 *
 * It keeps the candidate's own questions, because those carry what the thread
 * has been about, and short openings of the answers, because those carry what
 * was already advised. Deterministic and free: no model call, so a summary
 * cannot itself invent anything.
 */
export function summarizeConversationTurns(
  messages: ReadonlyArray<Pick<AiMessageDTO, 'role' | 'content'>>,
  limit = MEMORY_SUMMARY_CHARS
): string {
  const parts: string[] = [];
  for (const message of messages) {
    const clean = message.content.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (message.role === 'user') {
      parts.push(`Asked: ${clean.slice(0, 160)}`);
    } else {
      parts.push(`Answered: ${clean.slice(0, 160)}`);
    }
  }
  const joined = parts.join('\n');
  if (joined.length <= limit) return joined;
  // Keep the most recent part of the summary when it has to be cut: the older
  // an exchange is, the less a follow-up depends on it.
  return joined.slice(joined.length - limit);
}

/**
 * Renders the memory block for the system instruction.
 *
 * Empty when there is nothing to remember, so a first message carries no
 * empty heading.
 */
export function renderConversationMemory(input: {
  summary?: string | null;
  messages: ReadonlyArray<Pick<AiMessageDTO, 'role' | 'content'>>;
  limit?: number;
}): string {
  const limit = Math.max(1, Math.min(40, input.limit ?? MEMORY_VERBATIM_TURNS));
  const recent = input.messages.slice(-limit);
  const summary = (input.summary ?? '').trim();

  if (!summary && recent.length === 0) return '';

  const blocks: string[] = [
    'THIS CONVERSATION SO FAR.',
    'The candidate and you have spoken before in this thread. Use it to keep the thread coherent, and do not repeat advice they have already been given unless they ask for it again.',
  ];

  if (summary) {
    blocks.push(`Earlier in this conversation:\n${summary}`);
  }
  if (recent.length > 0) {
    const turns = recent
      .map((message) => `${message.role === 'user' ? 'Candidate' : 'You'}: ${message.content.trim().slice(0, 1200)}`)
      .join('\n');
    blocks.push(`The most recent turns, oldest first:\n${turns}`);
  }

  blocks.push('The career state above is still the source of truth for facts. The conversation is context, not evidence.');
  return blocks.join('\n\n');
}

/** True when the thread is long enough that older turns should be summarised. */
export function shouldSummarize(totalMessages: number): boolean {
  return totalMessages > MEMORY_VERBATIM_TURNS * 2;
}
