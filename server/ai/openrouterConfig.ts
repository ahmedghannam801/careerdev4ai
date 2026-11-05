// Canonical OpenRouter Configuration and Client Manager
// Single source of truth for OpenRouter API configuration and calls across CareerDev4AI.

export const CANONICAL_OPENROUTER_MODEL = 'openrouter/free';
export const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const APP_REFERER = 'https://careerdev4ai.pages.dev';
export const APP_TITLE = 'CareerDev4AI';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OpenRouterResponse {
  text: string;
  model: string;
  provider: 'openrouter';
  usage?: OpenRouterUsage;
  raw?: unknown;
}

export class OpenRouterError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; code: string; retryable?: boolean }) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Returns the configured OpenRouter API key.
 * Resolves dynamically so per-request environment variables in Cloudflare Workers are respected.
 */
export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key || null;
}

/**
 * Returns the active OpenRouter model name.
 * Defaults to 'openrouter/free'.
 */
export function getOpenRouterModel(): string {
  const model = process.env.OPENROUTER_MODEL?.trim();
  return model || CANONICAL_OPENROUTER_MODEL;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterApiKey());
}

/**
 * Normalizes HTTP status and errors into an OpenRouterError.
 */
export function normalizeOpenRouterError(err: unknown, status?: number): OpenRouterError {
  if (err instanceof OpenRouterError) return err;

  const message = String((err as { message?: unknown })?.message ?? err ?? 'Unknown OpenRouter error');
  const code = (err as { code?: string })?.code ?? 'openrouter_error';

  if (status === 401 || message.includes('401') || message.includes('Unauthorized') || message.includes('invalid api key')) {
    return new OpenRouterError('OpenRouter authentication failed: invalid API key', {
      status: 401,
      code: 'unauthorized',
      retryable: false,
    });
  }

  if (status === 429 || message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
    return new OpenRouterError('OpenRouter rate limit or quota exceeded', {
      status: 429,
      code: 'rate_limited',
      retryable: true,
    });
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  ) {
    return new OpenRouterError('OpenRouter service temporarily unavailable or timed out', {
      status: status ?? 503,
      code: 'service_unavailable',
      retryable: true,
    });
  }

  return new OpenRouterError(message, {
    status: status ?? 500,
    code,
    retryable: status !== undefined && status >= 500,
  });
}

/**
 * Calls OpenRouter chat completions endpoint with timeout and error handling.
 */
export async function callOpenRouterChat(options: {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' };
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenRouterResponse> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new OpenRouterError('OPENROUTER_API_KEY is not configured', {
      status: 401,
      code: 'not_configured',
      retryable: false,
    });
  }

  const model = options.model?.trim() || getOpenRouterModel();
  const timeoutMs = options.timeoutMs ?? 45_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  try {
    const payload: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
    };

    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    if (options.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    const endpoint = process.env.OPENROUTER_API_ENDPOINT?.trim() || OPENROUTER_API_ENDPOINT;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = response.statusText;
      }
      throw normalizeOpenRouterError(new Error(errorBody), response.status);
    }

    const data = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    const actualModel = data.model || model;

    return {
      text,
      model: actualModel,
      provider: 'openrouter',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      raw: data,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (combinedSignal.aborted) {
      throw new OpenRouterError('OpenRouter request timed out or was aborted', {
        code: 'timeout',
        retryable: true,
      });
    }
    throw normalizeOpenRouterError(err);
  }
}

/**
 * Executes an OpenRouter operation with automatic retry on transient failures.
 */
export async function executeOpenRouterWithRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  initialDelayMs = 1000
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const norm = normalizeOpenRouterError(err);
      if (attempt > retries || !norm.retryable) {
        throw norm;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

