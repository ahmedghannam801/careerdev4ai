// Canonical Gemini Configuration and Client Manager
// Single source of truth for Google Gemini configuration across Aionvia AI.

import { GoogleGenAI } from '@google/genai/web';

export const CANONICAL_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * The model that carries the real-time voice conversation.
 *
 * The Live API is a different model family from the text generation model
 * above: it speaks and it listens.
 *
 * `gemini-3.8-live` is the current Live model in the Gemini Developer API
 * ("the default option for most low-latency voice agent experiences"). The
 * earlier identifiers this file used to name are gone: `gemini-live-2.5-
 * flash-preview` was shut down on 9 December 2025, and
 * `gemini-2.5-flash-native-audio-preview-09-2025` was shut down after it.
 * A token minted for a shut-down model cannot open a session, so this
 * constant has to name a model that is actually being served.
 *
 * See https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
 */
export const CANONICAL_LIVE_MODEL = 'gemini-3.8-live';

/**
 * Returns the active Gemini model name.
 * Resolves dynamically so per-request environment variables in Cloudflare Workers are respected.
 * Automatically safeguards against deprecated, exhausted, or overloaded models (e.g. gemini-3.8-flash, gemini-3.6-flash).
 */
export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model || model === 'gemini-3.8-flash' || model === 'gemini-3.6-flash') {
    return CANONICAL_GEMINI_MODEL;
  }
  return model;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

let aiClient: GoogleGenAI | null = null;
let aiClientApiKey: string | null = null;

/**
 * Returns a cached GoogleGenAI instance for the current GEMINI_API_KEY.
 * Lazily instantiated on first call so absent keys do not crash module loading.
 */
export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!aiClient || aiClientApiKey !== apiKey) {
    aiClientApiKey = apiKey;
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        timeout: 45_000,
      },
    });
  }
  return aiClient;
}

/**
 * Canonical lazy facade for AI generation.
 * Automatically leverages the centralized AI provider abstraction supporting both
 * Google Gemini and OpenRouter with bounded retries and fallback.
 */
export const ai = {
  get models() {
    return {
      generateContent: async (args: {
        model?: string;
        contents: string;
        config?: Record<string, unknown>;
      }): Promise<{ text: string; provider?: string; model?: string }> => {
        const { generateContentUnified } = await import('./provider.ts');
        const res = await generateContentUnified({
          contents: args.contents,
          model: args.model,
          config: args.config,
        });
        return {
          text: res.text,
          provider: res.provider,
          model: res.model,
        };
      },
    };
  },
};

/**
 * The client that mints Live API session credentials.
 *
 * Ephemeral tokens are requested from the `auth_tokens` endpoint. The
 * installed SDK's documentation mentions v1alpha, but the production
 * `auth_tokens` endpoint accepted `v1beta`, minted a token, and the browser
 * opened a live session with it. The version is pinned here and sent with the
 * grant so the server and the browser cannot drift apart. Changing it without
 * testing a real token would break the one combination that is known to work.
 *
 * This client asks for that API version explicitly. It is a separate client
 * from the text-generation one on purpose: the version and the headers of
 * the two calls differ, and one shared client would force one of them to be
 * wrong.
 *
 * The key itself never leaves the server. What leaves the server is a short
 * lived token that can open ONE live session and nothing else.
 */
let liveAuthClient: GoogleGenAI | null = null;
let liveAuthClientKey: string | null = null;

export const LIVE_API_VERSION = 'v1beta';

export function getLiveAuthClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!liveAuthClient || liveAuthClientKey !== apiKey) {
    liveAuthClientKey = apiKey;
    liveAuthClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: LIVE_API_VERSION,
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 30_000,
      },
    });
  }
  return liveAuthClient;
}

/**
 * Checks whether an error is caused by upstream provider overload or 503 unavailability.
 */
export function isModelOverloaded(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { status?: number; statusCode?: number })?.statusCode;
  return (
    status === 503 ||
    status === 504 ||
    message.includes('503') ||
    message.includes('UNAVAILABLE') ||
    message.includes('overloaded') ||
    message.includes('Service Unavailable') ||
    message.includes('timed out') ||
    message.includes('Deadline Exceeded')
  );
}

/**
 * Executes an AI operation with automatic retry on transient overload/503.
 */
export async function executeAiWithRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isModelOverloaded(err)) {
        throw err;
      }
      console.warn(
        `Gemini operation transient failure (attempt ${attempt}/${retries + 1}), retrying after ${delayMs}ms:`,
        (err as any)?.message || err
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
