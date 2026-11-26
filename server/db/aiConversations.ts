// Server persistence for AI conversation memory.
//
// A conversation belongs to one verified profile. Every read and write here is
// scoped by the profile id the caller obtained from `requireAuth`, and the
// table's own policies repeat the check — so a thread cannot be read by the
// wrong candidate even if a caller made a mistake.
//
// The memory is bounded on purpose. The model receives the recent turns
// verbatim plus a short server-written summary of the ones that aged out; it
// never receives a whole unbounded history.
import { getSupabaseServer } from './supabase';
import {
  MEMORY_VERBATIM_TURNS,
  shouldSummarize,
  summarizeConversationTurns,
} from '../ai/conversationMemory.ts';

export interface AiConversationDTO {
  id: string;
  feature: string;
  title: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface AiMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  feature: string | null;
  title: string | null;
  summary: string | null;
  summarized_count: number | null;
  language: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

function toConversation(row: ConversationRow): AiConversationDTO {
  return {
    id: row.id,
    feature: row.feature ?? 'copilot',
    title: row.title,
    language: row.language ?? 'en',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function toMessage(row: MessageRow): AiMessageDTO {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    createdAt: row.created_at,
  };
}

/** A title from the first question, short enough for a list. */
export function conversationTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length <= 80 ? clean : `${clean.slice(0, 77).trimEnd()}...`;
}

/** Opens a thread for the verified profile. */
export async function createAiConversation(input: {
  userId: string;
  feature?: string;
  title?: string | null;
  language?: string;
}): Promise<AiConversationDTO> {
  const { data, error } = await getSupabaseServer()
    .from('ai_conversations')
    .insert({
      profile_id: input.userId,
      feature: input.feature ?? 'copilot',
      title: input.title ?? null,
      language: input.language ?? 'en',
    })
    .select('id, feature, title, summary, summarized_count, language, created_at, updated_at, last_message_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create the AI conversation: ${error?.message ?? 'no row returned'}`);
  }
  return toConversation(data as ConversationRow);
}

/** The candidate's own threads, most recent first. */
export async function listAiConversations(userId: string, limit = 20): Promise<AiConversationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('ai_conversations')
    .select('id, feature, title, summary, summarized_count, language, created_at, updated_at, last_message_at')
    .eq('profile_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) throw new Error(`Failed to list AI conversations: ${error.message}`);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

/**
 * One thread, or null when it is not the candidate's.
 *
 * The `profile_id` filter is what makes a foreign id indistinguishable from a
 * missing one: a caller cannot tell whether somebody else's thread exists.
 */
export async function getAiConversation(
  userId: string,
  conversationId: string
): Promise<AiConversationDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('ai_conversations')
    .select('id, feature, title, summary, summarized_count, language, created_at, updated_at, last_message_at')
    .eq('id', conversationId)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the AI conversation: ${error.message}`);
  return data ? toConversation(data as ConversationRow) : null;
}

/** Deletes one of the candidate's own threads. False when it was not theirs. */
export async function deleteAiConversation(userId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('profile_id', userId)
    .select('id');
  if (error) throw new Error(`Failed to delete the AI conversation: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Appends one turn and stamps the thread. */
export async function appendAiMessage(input: {
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
}): Promise<AiMessageDTO> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: input.conversationId,
      profile_id: input.userId,
      role: input.role,
      content: input.content,
    })
    .select('id, role, content, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to store the AI message: ${error?.message ?? 'no row returned'}`);
  }

  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    .eq('id', input.conversationId)
    .eq('profile_id', input.userId)
    .then((result) => result);

  return toMessage(data as MessageRow);
}

/**
 * The most recent turns of a thread, oldest first.
 *
 * Read with a descending limit and then reversed, so a long thread returns the
 * newest turns rather than the oldest.
 */
export async function listRecentAiMessages(
  userId: string,
  conversationId: string,
  limit = 12
): Promise<AiMessageDTO[]> {
  const bounded = Math.max(1, Math.min(40, limit));
  const { data, error } = await getSupabaseServer()
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(bounded);

  if (error) throw new Error(`Failed to read the AI messages: ${error.message}`);
  return ((data ?? []) as MessageRow[]).map(toMessage).reverse();
}

/** Every turn of a thread, oldest first, capped. Used by the history panel. */
export async function listAiMessages(
  userId: string,
  conversationId: string,
  limit = 100
): Promise<AiMessageDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)));

  if (error) throw new Error(`Failed to read the AI messages: ${error.message}`);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

export interface StoredConversationMemory {
  conversationId: string;
  summary: string | null;
  messages: AiMessageDTO[];
}

/**
 * Reads the memory the model is allowed to see for a thread.
 *
 * Null when the id is not the candidate's, which is the same answer as a
 * thread that does not exist.
 */
export async function loadAiConversationMemory(
  userId: string,
  conversationId: string,
  limit = 12
): Promise<StoredConversationMemory | null> {
  const conversation = await getAiConversation(userId, conversationId);
  if (!conversation) return null;

  const [messages, summary] = await Promise.all([
    listRecentAiMessages(userId, conversationId, limit),
    getAiConversationSummary(userId, conversationId),
  ]);

  return { conversationId, summary: summary?.summary ?? null, messages };
}

/** How many turns a thread holds, without reading them. */
export async function countAiMessages(userId: string, conversationId: string): Promise<number> {
  const { count, error } = await getSupabaseServer()
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId);
  if (error) throw new Error(`Failed to count the AI messages: ${error.message}`);
  return count ?? 0;
}

/**
 * Refreshes the stored summary once a thread has outgrown the verbatim window.
 *
 * It runs on a boundary (a multiple of the window) rather than on every turn,
 * so a long conversation costs one extra read every six exchanges. The summary
 * is rebuilt from the whole thread each time, so it cannot accumulate
 * duplicated lines, and it is deterministic: no model call, so summarising can
 * never introduce a fact that was not in the conversation.
 */
export async function maintainConversationMemory(
  userId: string,
  conversationId: string,
  options: { verbatim?: number } = {}
): Promise<void> {
  const verbatim = Math.max(2, options.verbatim ?? MEMORY_VERBATIM_TURNS);
  const total = await countAiMessages(userId, conversationId);
  if (!shouldSummarize(total)) return;
  if (total % verbatim !== 0) return;

  const all = await listAiMessages(userId, conversationId, 200);
  if (all.length <= verbatim) return;
  const aged = all.slice(0, all.length - verbatim);
  const summary = summarizeConversationTurns(aged);
  if (!summary) return;
  await saveAiConversationSummary(userId, conversationId, summary, aged.length);
}

/** The stored summary, plus what it covers. */
export async function getAiConversationSummary(
  userId: string,
  conversationId: string
): Promise<{ summary: string | null; summarizedCount: number } | null> {
  const { data, error } = await getSupabaseServer()
    .from('ai_conversations')
    .select('summary, summarized_count')
    .eq('id', conversationId)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the AI conversation summary: ${error.message}`);
  if (!data) return null;
  const row = data as { summary: string | null; summarized_count: number | null };
  return { summary: row.summary, summarizedCount: row.summarized_count ?? 0 };
}

/** Stores a replacement summary and the turn count it covers. */
export async function saveAiConversationSummary(
  userId: string,
  conversationId: string,
  summary: string,
  summarizedCount: number
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('ai_conversations')
    .update({ summary: summary.slice(0, 4000), summarized_count: summarizedCount })
    .eq('id', conversationId)
    .eq('profile_id', userId);
  if (error) throw new Error(`Failed to save the AI conversation summary: ${error.message}`);
}
