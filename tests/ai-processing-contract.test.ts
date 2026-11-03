import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

/**
 * The AI request lifecycle is enforced in the interface, so the contract is
 * checked where it is implemented: the shared hook, the modal that shows it,
 * and every flow that was wired to it. These are source contracts, like the
 * localisation and SEO suites: they fail when a flow drops the guard that
 * keeps a late answer from overwriting the candidate's work.
 */
describe('AI processing contract', () => {
  it('discards a late answer instead of applying it after a stop', () => {
    const hook = read('src/lib/useAIProcessing.tsx');

    // The result is only applied when the request was not aborted.
    assert.match(
      hook,
      /if \(controller\.signal\.aborted\) return;\s*\n\s*if \(mountedRef\.current\) task\.onSuccess\(result\);/,
      'the hook must skip onSuccess for an aborted request'
    );

    // The candidate's stop only aborts while the work can still be stopped.
    assert.match(
      hook,
      /if \(canCancelRef\.current\) \{\s*\n\s*controllerRef\.current\?\.abort\(/,
      'the hook must not abort work that is already being saved'
    );

    // A saved result is announced as saved; the modal never says that nothing
    // was written after a write has started.
    assert.doesNotMatch(
      hook,
      /The request was cancelled\. No changes were made\./,
      'the old cancellation wording claimed that nothing was saved'
    );
  });

  it('offers the stop only while the request can still be stopped', () => {
    const modal = read('src/components/ai/AIProcessingModal.tsx');

    assert.match(
      modal,
      /\{busy && canCancel && \(/,
      'the modal must hide the stop control when the work cannot be stopped'
    );
    assert.match(
      modal,
      /A completed result is being saved\. Please wait\./,
      'the modal must explain that a save is in progress'
    );
  });

  it('never writes a job description answer that the candidate stopped waiting for', () => {
    const panel = read('src/components/cv/JobDescriptionPanel.tsx');

    const abortGuards = panel.match(
      /if \(controller\.signal\.aborted \|\| requestCancelledRef\.current\) return;/g
    );
    assert.ok(
      abortGuards && abortGuards.length >= 2,
      'both the analysis and the tailored CV must check the abort before saving'
    );

    // The save phase is announced, and the stop control is withdrawn, so the
    // interface never claims a save stopped while the write continues.
    assert.match(
      panel,
      /savePhaseRef\.current = true;/,
      'the panel must mark the phase in which the answer is written'
    );
    assert.match(
      panel,
      /canCancel: false/,
      'the panel must withdraw the stop control while saving'
    );
  });

  it('wires every long AI flow to the shared request lifecycle', () => {
    const wired = [
      'src/components/views/InterviewsView.tsx',
      'src/components/views/DocumentsView.tsx',
      'src/components/views/ProfileView.tsx',
      'src/components/views/CVStudioView.tsx',
      'src/components/views/CareerAnalysisView.tsx',
      'src/components/projects/ProjectAiPanel.tsx',
    ];

    for (const file of wired) {
      const source = read(file);
      assert.match(
        source,
        /useAIProcessing/,
        `${file} must use the shared AI request lifecycle`
      );
      assert.match(
        source,
        /aiProcessingModal/,
        `${file} must show the shared progress modal`
      );
    }
  });

  it('reports a failed save instead of implying the record exists', () => {
    const interviews = read('src/components/views/InterviewsView.tsx');

    assert.match(
      interviews,
      /setPhase\(t\('Saving the interview session…'\), false\)/,
      'the interview save must be announced as a phase that cannot be stopped'
    );
    assert.match(
      interviews,
      /The feedback is shown, but this session could not be saved to your history\./,
      'a failed save must be reported to the candidate'
    );

    const context = read('src/context/CareerContext.tsx');
    assert.match(
      context,
      /Failed to save interview session[\s\S]{0,200}throw error;/,
      'the context must report the failed save to the caller'
    );
  });

  it('keeps a minimum password length even without hosted leaked-password protection', () => {
    const app = read('app.ts');
    assert.match(
      app,
      /newPassword\.length < 8/,
      'the server must reject a new password shorter than 8 characters'
    );

    const context = read('src/context/CareerContext.tsx');
    assert.match(
      context,
      /password\.length < 8/,
      'registration must reject a password shorter than 8 characters'
    );
  });
});
