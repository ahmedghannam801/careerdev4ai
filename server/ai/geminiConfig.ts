// Canonical Gemini Configuration and Client Manager
// Single source of truth for Google Gemini configuration across CareerPilot AI.

import { GoogleGenAI } from '@google/genai/web';

export const CANONICAL_GEMINI_MODEL = 'gemini-3.1-flash-lite';

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
 */
export const ai = {
  get models() {
    return getAiClient().models;
  },
};

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
