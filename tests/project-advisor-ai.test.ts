// The project advisor's AI requests.
//
// The advisor panel runs its two requests through the shared AI processing
// hook, which hands it an AbortSignal so the request can be cancelled or
// timed out. This suite proves the client actually carries that signal to the
// API request, and that a deterministic answer with a fallback reason reaches
// the caller intact: the plans are never thrown away because the model was
// unavailable.
//
// The API client is replaced for the duration of the suite, so the test needs
// neither a database nor a running server.
import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

interface RecordedCall {
  path: string;
  init: RequestInit | undefined;
}

interface Recorder {
  calls: RecordedCall[];
  response: unknown;
}

const recorder: Recorder = { calls: [], response: {} };

/**
 * The stub answers every request with the recorded response and keeps the
 * request itself, so the test can inspect what the client sent.
 */
const STUB_API_CLIENT =
  'data:text/javascript,' +
  encodeURIComponent(`
    export async function apiRequest(path, init) {
      globalThis.__projectAdvisorRecorder.calls.push({ path, init });
      return globalThis.__projectAdvisorRecorder.response;
    }
  `);

/**
 * The real client reaches the browser's Supabase session, which does not
 * exist under Node. The advisor module is pointed at the stub instead, and
 * only for that one module.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? '';
    if (
      (specifier === './apiClient' || specifier.endsWith('/apiClient')) &&
      parent.endsWith('/src/lib/projectRecommendationApi.ts')
    ) {
      return { url: STUB_API_CLIENT, shortCircuit: true, format: 'module' };
    }
    return nextResolve(specifier, context);
  },
});

(globalThis as unknown as { __projectAdvisorRecorder: Recorder }).__projectAdvisorRecorder =
  recorder;

const { fetchProjectHealth, fetchProjectRecommendations } = await import(
  '../src/lib/projectRecommendationApi.ts'
);

describe('the project advisor client', () => {
  beforeEach(() => {
    recorder.calls = [];
    recorder.response = {};
  });

  it('carries the abort signal into the recommendation request', async () => {
    const controller = new AbortController();
    recorder.response = { success: true, plans: [], aiUsed: true, aiFallbackReason: null };

    await fetchProjectRecommendations(
      { language: 'en', jobDescription: 'A backend role' },
      { signal: controller.signal }
    );

    assert.equal(recorder.calls.length, 1);
    assert.equal(recorder.calls[0].path, '/api/projects/recommendations');
    assert.equal(recorder.calls[0].init?.signal, controller.signal);
  });

  it('carries the abort signal into the health request', async () => {
    const controller = new AbortController();
    recorder.response = { success: true, reports: [], aiUsed: true, aiFallbackReason: null };

    await fetchProjectHealth({ language: 'en' }, { signal: controller.signal });

    assert.equal(recorder.calls.length, 1);
    assert.equal(recorder.calls[0].path, '/api/projects/analyze');
    assert.equal(recorder.calls[0].init?.signal, controller.signal);
  });

  it('sends no signal when the caller does not ask for one', async () => {
    recorder.response = { success: true, plans: [], reports: [] };

    await fetchProjectRecommendations({ language: 'en' });
    await fetchProjectHealth({ language: 'en' });

    assert.equal(recorder.calls[0].init?.signal, undefined);
    assert.equal(recorder.calls[1].init?.signal, undefined);
  });

  it('keeps the deterministic answer and its fallback reason', async () => {
    recorder.response = {
      success: true,
      plans: [{ id: 'plan-1', title: 'A project' }],
      aiUsed: false,
      aiFallbackReason: 'The model was unavailable.',
    };

    const result = await fetchProjectRecommendations({ language: 'en' });

    assert.equal(result.aiUsed, false);
    assert.equal(result.aiFallbackReason, 'The model was unavailable.');
    assert.equal(result.plans.length, 1);
    assert.equal(result.plans[0].title, 'A project');
  });

  it('keeps the health answer and its fallback reason', async () => {
    recorder.response = {
      success: true,
      reports: [{ projectId: 'project-1', projectTitle: 'A project' }],
      aiUsed: false,
      aiFallbackReason: 'The model was unavailable.',
    };

    const result = await fetchProjectHealth({ language: 'en' });

    assert.equal(result.aiUsed, false);
    assert.equal(result.aiFallbackReason, 'The model was unavailable.');
    assert.equal(result.reports.length, 1);
    assert.equal(result.reports[0].projectId, 'project-1');
  });
});
