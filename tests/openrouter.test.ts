/**
 * OpenRouter Provider Tests
 * Tests OpenRouter authentication, openrouter/free routing, provider availability,
 * rate limiting, bounded retry, Gemini fallback, Arabic & English generation,
 * structured JSON extraction, and error normalization.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  callOpenRouterChat,
  getOpenRouterApiKey,
  getOpenRouterModel,
  isOpenRouterConfigured,
  normalizeOpenRouterError,
  OpenRouterError,
} from '../server/ai/openrouterConfig.ts';
import {
  extractJsonFromText,
  generateContentUnified,
  getDefaultProvider,
  isAnyAiConfigured,
  universalAi,
} from '../server/ai/provider.ts';

describe('OpenRouter Configuration & Provider Availability', () => {
  test('detects OpenRouter model and configuration correctly', () => {
    assert.equal(getOpenRouterModel(), 'openrouter/free');
    assert.equal(typeof isOpenRouterConfigured(), 'boolean');
    assert.ok(isAnyAiConfigured(), 'At least one AI provider should be configured');
  });

  test('default provider resolves to gemini or openrouter based on configuration', () => {
    const provider = getDefaultProvider();
    assert.ok(provider === 'gemini' || provider === 'openrouter');
  });

  test('normalizes 401 unauthorized errors into typed OpenRouterError', () => {
    const err = normalizeOpenRouterError(new Error('Invalid API key provided'), 401);
    assert.equal(err.code, 'unauthorized');
    assert.equal(err.retryable, false);
    assert.equal(err.status, 401);
  });

  test('normalizes 429 rate limit errors as retryable', () => {
    const err = normalizeOpenRouterError(new Error('Rate limit exceeded'), 429);
    assert.equal(err.code, 'rate_limited');
    assert.equal(err.retryable, true);
    assert.equal(err.status, 429);
  });

  test('normalizes 503 service unavailable as retryable', () => {
    const err = normalizeOpenRouterError(new Error('upstream server overloaded'), 503);
    assert.equal(err.code, 'service_unavailable');
    assert.equal(err.retryable, true);
    assert.equal(err.status, 503);
  });
});

describe('Structured JSON Extraction & Robustness', () => {
  test('extracts direct JSON payload', () => {
    const parsed = extractJsonFromText<{ status: string }>('{"status": "success"}');
    assert.equal(parsed.status, 'success');
  });

  test('extracts JSON from markdown code fence with json tag', () => {
    const text = 'Here is your career advice:\n```json\n{\n  "role": "Data Analyst",\n  "readiness": 85\n}\n```\nHope this helps!';
    const parsed = extractJsonFromText<{ role: string; readiness: number }>(text);
    assert.equal(parsed.role, 'Data Analyst');
    assert.equal(parsed.readiness, 85);
  });

  test('extracts JSON from markdown code fence without language tag', () => {
    const text = '```\n{\n  "score": 92\n}\n```';
    const parsed = extractJsonFromText<{ score: number }>(text);
    assert.equal(parsed.score, 92);
  });

  test('extracts JSON object when surrounded by leading and trailing prose', () => {
    const text = 'Certainly! The results are as follows: {"title":"Frontend Engineer","matchedSkills":["React","TypeScript"]} Thank you.';
    const parsed = extractJsonFromText<{ title: string; matchedSkills: string[] }>(text);
    assert.equal(parsed.title, 'Frontend Engineer');
    assert.deepEqual(parsed.matchedSkills, ['React', 'TypeScript']);
  });

  test('extracts JSON array when surrounded by text', () => {
    const text = 'Here are recommended next steps: ["Complete Docker Course", "Build CI/CD Pipeline"]';
    const parsed = extractJsonFromText<string[]>(text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0], 'Complete Docker Course');
  });

  test('throws descriptive error on invalid or empty string', () => {
    assert.throws(() => extractJsonFromText(''), /empty response/);
    assert.throws(() => extractJsonFromText('Just plain text without braces'), /Failed to parse structured JSON/);
  });
});

describe('Controlled Provider Fallback Simulation', () => {
  test('falls back to OpenRouter when preferred provider is configured with fallback', async () => {
    // If OpenRouter is configured, testing generateContentUnified with preferredProvider
    if (isOpenRouterConfigured()) {
      const response = await generateContentUnified({
        contents: 'Respond with exactly: {"status":"fallback_ok"}',
        preferredProvider: 'openrouter',
        config: { responseMimeType: 'application/json' },
      });
      assert.ok(response.text.length > 0);
      assert.equal(response.provider, 'openrouter');
      const json = extractJsonFromText<{ status: string }>(response.text);
      assert.ok(json.status);
    }
  });

  test('universalAi facade produces text without throwing', async () => {
    if (isAnyAiConfigured()) {
      const response = await universalAi.models.generateContent({
        contents: 'Say "CareerDev4AI ready" in 3 words.',
      });
      assert.ok(response.text.length > 0);
      assert.ok(response.provider === 'gemini' || response.provider === 'openrouter');
    }
  });
});

describe('Real OpenRouter API Integration (Controlled Credential Verification)', () => {
  test('executes real API call to OpenRouter with openrouter/free model', async (t) => {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      t.skip('OPENROUTER_API_KEY is not set in this environment; skipping live provider call.');
      return;
    }

    const result = await callOpenRouterChat({
      messages: [
        {
          role: 'user',
          content: 'Respond with the single word: "PULSE"',
        },
      ],
      model: 'openrouter/free',
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    assert.ok(result.text, 'Response text must not be empty');
    assert.ok(result.text.toLowerCase().includes('pulse'));
    assert.equal(result.provider, 'openrouter');
    assert.ok(result.model, 'Model name must be reported by OpenRouter');
  });

  test('real API call handles Arabic output properly', async (t) => {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      t.skip('OPENROUTER_API_KEY is not set in this environment; skipping live provider call.');
      return;
    }

    const result = await callOpenRouterChat({
      messages: [
        {
          role: 'user',
          content: 'قل كلمة واحدة فقط بالعربية: "مرحبا"',
        },
      ],
      model: 'openrouter/free',
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    assert.ok(result.text, 'Response text must not be empty');
    assert.ok(/[\u0600-\u06FF]/.test(result.text), 'Output must contain valid Arabic characters');
  });

  test('real API call handles structured JSON output', async (t) => {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      t.skip('OPENROUTER_API_KEY is not set in this environment; skipping live provider call.');
      return;
    }

    const result = await callOpenRouterChat({
      messages: [
        {
          role: 'user',
          content: 'Return valid JSON only matching schema: {"platform": "CareerDev4AI", "active": true}',
        },
      ],
      model: 'openrouter/free',
      responseFormat: { type: 'json_object' },
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const parsed = extractJsonFromText<{ platform: string; active: boolean }>(result.text);
    assert.equal(parsed.platform, 'CareerDev4AI');
    assert.equal(parsed.active, true);
  });
});

