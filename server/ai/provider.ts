/**
 * Centralized Unified AI Provider Abstraction
 * Supports Google Gemini and OpenRouter with automatic bounded retries,
 * controlled fallback, structured JSON extraction, and provider auditing.
 */

import { GoogleGenAI } from '@google/genai/web';
import {
  getGeminiModel,
  isGeminiConfigured,
  isModelOverloaded,
} from './geminiConfig.ts';
import {
  callOpenRouterChat,
  getOpenRouterModel,
  isOpenRouterConfigured,
  normalizeOpenRouterError,
  type OpenRouterMessage,
  type OpenRouterUsage,
} from './openrouterConfig.ts';

export type AIProviderName = 'gemini' | 'openrouter';

export interface UnifiedAIRequest {
  contents: string;
  systemInstruction?: string;
  model?: string;
  config?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
    [key: string]: unknown;
  };
  preferredProvider?: AIProviderName;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface UnifiedAIResponse {
  text: string;
  provider: AIProviderName;
  model: string;
  usage?: OpenRouterUsage;
  fallbackOccurred?: boolean;
  primaryProviderAttempted?: AIProviderName;
}

export interface ProviderAuditLog {
  timestamp: string;
  provider: AIProviderName;
  model: string;
  success: boolean;
  durationMs: number;
  fallback: boolean;
  error?: string;
}

const auditLogs: ProviderAuditLog[] = [];
const inFlightRequests = new Map<string, Promise<UnifiedAIResponse>>();

/**
 * Returns the latest 50 AI audit logs (sensitive prompt text is never recorded).
 */
export function getAiAuditLogs(): ReadonlyArray<ProviderAuditLog> {
  return auditLogs.slice(-50);
}

function recordAudit(entry: ProviderAuditLog): void {
  auditLogs.push(entry);
  if (auditLogs.length > 200) {
    auditLogs.shift();
  }
}

/**
 * Checks whether at least one AI provider is configured.
 */
export function isAnyAiConfigured(): boolean {
  return isGeminiConfigured() || isOpenRouterConfigured();
}

/**
 * Returns the default primary AI provider.
 * Defaults to 'gemini' if GEMINI_API_KEY is set, else 'openrouter'.
 */
export function getDefaultProvider(): AIProviderName {
  const explicit = process.env.AI_PRIMARY_PROVIDER?.trim().toLowerCase();
  if (explicit === 'openrouter' && isOpenRouterConfigured()) return 'openrouter';
  if (explicit === 'gemini' && isGeminiConfigured()) return 'gemini';

  if (isGeminiConfigured()) return 'gemini';
  if (isOpenRouterConfigured()) return 'openrouter';
  return 'gemini';
}

/**
 * Extracts and cleans JSON from AI response strings, tolerating markdown code fences,
 * leading/trailing explanations, and whitespace.
 */
export function extractJsonFromText<T = unknown>(rawText: string): T {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('AI returned an empty response; expected JSON.');
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to fence extraction
  }

  // 2. Markdown fence extraction (```json ... ``` or ``` ...)
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Continue to object boundary extraction
    }
  }

  // 3. Object or array boundary extraction
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue
    }
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue
    }
  }

  throw new Error(`Failed to parse structured JSON from AI response: ${trimmed.slice(0, 160)}...`);
}

/**
 * Calls Gemini directly using the official Google GenAI web client.
 */
/**
 * Builds the config handed to the Gemini SDK.
 *
 * The instruction may arrive as its own field (the shape the context engine
 * uses) or inside `config` (the shape the Gemini SDK takes). The SDK only
 * reads the second, so this is the one place that reconciles them — an
 * instruction passed the other way used to be dropped silently, and the model
 * answered as a generic chatbot with no persona, no career state and no
 * honesty rules.
 */
export function resolveGeminiConfig(request: UnifiedAIRequest): UnifiedAIRequest['config'] {
  const inline = request.config?.systemInstruction as string | undefined;
  const instruction = request.systemInstruction ?? inline;
  if (!instruction) return request.config;
  return { ...request.config, systemInstruction: instruction };
}

async function callGeminiInternal(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
      timeout: request.timeoutMs ?? 45_000,
    },
  });

  const model = request.model?.trim() || getGeminiModel();

  const response = await client.models.generateContent({
    model,
    contents: request.contents,
    config: resolveGeminiConfig(request),
  });

  return {
    text: response.text ?? '',
    provider: 'gemini',
    model,
  };
}

/**
 * Calls OpenRouter directly using the OpenAI-compatible chat completions endpoint.
 */
async function callOpenRouterInternal(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
  const messages: OpenRouterMessage[] = [];

  // The instruction can arrive either as its own field or inside `config`,
  // which is where the Google SDK expects it. Every caller in this application
  // uses `config.systemInstruction` (the shape the Gemini SDK takes), so a
  // fallback request that read only the other field used to reach OpenRouter
  // with no system instruction at all — no career state, no honesty rules and
  // no language instruction, exactly when the user most needs them.
  const systemInstruction = request.systemInstruction ?? (request.config?.systemInstruction as string | undefined);
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  // If responseMimeType is json, instruct model clearly in prompt
  let userPrompt = request.contents;
  const isJson = request.config?.responseMimeType === 'application/json';
  if (isJson && !userPrompt.toLowerCase().includes('json')) {
    userPrompt = `${userPrompt}\n\nIMPORTANT: Respond with valid, parseable JSON only.`;
  }

  messages.push({ role: 'user', content: userPrompt });

  const model = request.model?.startsWith('openrouter/')
    ? request.model
    : getOpenRouterModel();

  const response = await callOpenRouterChat({
    messages,
    model,
    temperature: request.config?.temperature as number | undefined,
    maxTokens: request.config?.maxOutputTokens as number | undefined,
    responseFormat: isJson ? { type: 'json_object' } : undefined,
    timeoutMs: request.timeoutMs,
    signal: request.signal,
  });

  return {
    text: response.text,
    provider: 'openrouter',
    model: response.model,
    usage: response.usage,
  };
}

/**
 * A short, stable hash of the system instruction.
 *
 * The instruction carries the candidate's career state, so it must take part in
 * the dedupe key: two users who type the same sentence in the same second used
 * to share one in-flight promise, and one of them received the other's
 * personalised answer. The text itself is not put in the key — it is personal —
 * only a fingerprint of it.
 */
function hashInstruction(instruction: string): string {
  let hash = 5381;
  for (let index = 0; index < instruction.length; index += 1) {
    hash = ((hash << 5) + hash + instruction.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Computes a cache key for in-flight deduplication.
 *
 * Both prompt parts, the response type and the model: two requests may only be
 * merged when every one of those is identical.
 */
function requestDedupeKey(request: UnifiedAIRequest): string {
  const instruction = request.systemInstruction ?? String(request.config?.systemInstruction ?? '');
  return [
    hashInstruction(instruction),
    request.contents,
    request.config?.responseMimeType ?? '',
    request.model ?? '',
  ].join('::');
}

/**
 * Executes an AI operation with automatic retry on transient errors.
 */
async function executeProviderWithRetry(
  provider: AIProviderName,
  request: UnifiedAIRequest,
  retries = 1,
  delayMs = 1000
): Promise<UnifiedAIResponse> {
  let attempt = 0;
  let delay = delayMs;

  while (true) {
    try {
      if (provider === 'gemini') {
        return await callGeminiInternal(request);
      }
      return await callOpenRouterInternal(request);
    } catch (err) {
      attempt++;
      const isRetryable =
        provider === 'gemini'
          ? isModelOverloaded(err)
          : normalizeOpenRouterError(err).retryable;

      if (attempt > retries || !isRetryable) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Primary entry point: Generates AI content with automatic provider selection,
 * retry, and graceful fallback between Gemini and OpenRouter.
 */
export async function generateContentUnified(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
  const dedupeKey = requestDedupeKey(request);
  const existing = inFlightRequests.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const primary = request.preferredProvider ?? getDefaultProvider();
    const secondary: AIProviderName = primary === 'gemini' ? 'openrouter' : 'gemini';

    const isPrimaryConfigured = primary === 'gemini' ? isGeminiConfigured() : isOpenRouterConfigured();
    const isSecondaryConfigured = secondary === 'gemini' ? isGeminiConfigured() : isOpenRouterConfigured();

    if (!isPrimaryConfigured && !isSecondaryConfigured) {
      throw new Error('No AI provider is configured. Please provide GEMINI_API_KEY or OPENROUTER_API_KEY.');
    }

    const targetPrimary = isPrimaryConfigured ? primary : secondary;
    const targetSecondary = isPrimaryConfigured ? secondary : primary;
    const canFallback = isPrimaryConfigured && isSecondaryConfigured;

    const start = Date.now();

    // 1. Attempt Primary Provider
    try {
      const response = await executeProviderWithRetry(targetPrimary, request);
      recordAudit({
        timestamp: new Date().toISOString(),
        provider: response.provider,
        model: response.model,
        success: true,
        durationMs: Date.now() - start,
        fallback: false,
      });
      return response;
    } catch (primaryErr) {
      const primaryMessage = String((primaryErr as Error)?.message || primaryErr);

      if (!canFallback) {
        recordAudit({
          timestamp: new Date().toISOString(),
          provider: targetPrimary,
          model: targetPrimary === 'gemini' ? getGeminiModel() : getOpenRouterModel(),
          success: false,
          durationMs: Date.now() - start,
          fallback: false,
          error: primaryMessage,
        });
        throw primaryErr;
      }

      // 2. Attempt Controlled Fallback to Secondary Provider
      try {
        const fallbackResponse = await executeProviderWithRetry(targetSecondary, request);
        recordAudit({
          timestamp: new Date().toISOString(),
          provider: fallbackResponse.provider,
          model: fallbackResponse.model,
          success: true,
          durationMs: Date.now() - start,
          fallback: true,
        });
        return {
          ...fallbackResponse,
          fallbackOccurred: true,
          primaryProviderAttempted: targetPrimary,
        };
      } catch (secondaryErr) {
        const secondaryMessage = String((secondaryErr as Error)?.message || secondaryErr);
        recordAudit({
          timestamp: new Date().toISOString(),
          provider: targetSecondary,
          model: targetSecondary === 'gemini' ? getGeminiModel() : getOpenRouterModel(),
          success: false,
          durationMs: Date.now() - start,
          fallback: true,
          error: `Primary (${targetPrimary}): ${primaryMessage}; Fallback (${targetSecondary}): ${secondaryMessage}`,
        });
        throw new Error(
          `All AI providers failed. Primary (${targetPrimary}): ${primaryMessage}. Fallback (${targetSecondary}): ${secondaryMessage}.`
        );
      }
    }
  })();

  inFlightRequests.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(dedupeKey);
  }
}

/**
 * Universal AI client facade maintaining complete compatibility with existing
 * call sites expecting `ai.models.generateContent({ model, contents, config })`.
 */
export const universalAi = {
  models: {
    async generateContent(args: {
      model?: string;
      contents: string;
      config?: Record<string, unknown>;
    }): Promise<{ text: string; provider?: AIProviderName; model?: string }> {
      const response = await generateContentUnified({
        contents: args.contents,
        model: args.model,
        // A caller that puts the instruction in `config` (the Gemini shape) also
        // has it lifted to the field the fallback provider reads.
        systemInstruction: args.config?.systemInstruction as string | undefined,
        config: args.config,
      });
      return {
        text: response.text,
        provider: response.provider,
        model: response.model,
      };
    },
  },
};
