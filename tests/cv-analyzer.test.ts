// The CV Analyzer.
//
// The analyzer is a separate page with three stages: the CV is chosen, the CV
// is measured, and the measurement is read. These tests hold the page to the
// rules the platform already follows:
//
//   * it is reachable — a real route, a real view, a real navigation entry;
//   * it never shows a score it cannot explain;
//   * it does not fake progress: the stage list comes from the server's real
//     stage events, and the interface has no timer that moves it;
//   * the ATS score of the model stays a separate, labelled system.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isAppRoute, isKnownRoute, buildRouteHash, parseRouteHash } from '../src/lib/routing.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

const analyzer = readFileSync(
  join(REPO_ROOT, 'src', 'components', 'views', 'CvAnalyzerView.tsx'),
  'utf-8'
);
const app = readFileSync(join(REPO_ROOT, 'src', 'App.tsx'), 'utf-8');
const shell = readFileSync(join(REPO_ROOT, 'src', 'components', 'layout', 'AppShell.tsx'), 'utf-8');
const api = readFileSync(join(REPO_ROOT, 'src', 'lib', 'cvAnalysisApi.ts'), 'utf-8');

describe('the CV Analyzer is a page of the application', () => {
  test('it has a route', () => {
    assert.equal(isAppRoute('cv-analyzer'), true);
    assert.equal(isKnownRoute('cv-analyzer'), true);
    assert.equal(buildRouteHash('cv-analyzer'), '#/cv-analyzer');
    assert.equal(parseRouteHash('#/cv-analyzer').route, 'cv-analyzer');
  });

  test('the application opens it', () => {
    assert.match(app, /case 'cv-analyzer':/);
    assert.match(app, /CvAnalyzerView/);
  });

  test('it is in the navigation', () => {
    assert.match(shell, /id: 'cv-analyzer'/);
  });
});

describe('the analyzer never shows a score it cannot explain', () => {
  test('it shows the measured score and the evidence behind it', () => {
    assert.match(analyzer, /report\.overallScore/);
    assert.match(analyzer, /CvMeasurementReport/);
  });

  test('the ATS score of the model is shown as a separate system', () => {
    // The measured score and the model's score are different numbers from
    // different systems. They are never shown as one score.
    assert.match(analyzer, /AI ATS score/);
    assert.match(analyzer, /atsScore/);
  });
});

describe('the analyzer does not fake progress', () => {
  test('the stage list comes from the server, not from a timer', () => {
    assert.match(analyzer, /CV_ANALYSIS_STAGES/);
    assert.match(analyzer, /streamMeasuredAnalysis/);

    // There is no timer in the analyzer. A stage only moves because the
    // server reported it.
    assert.doesNotMatch(analyzer, /setInterval/);
    assert.doesNotMatch(analyzer, /setTimeout/);
  });

  test('the client reads the real stage events', () => {
    assert.match(api, /event === 'stage'/);
    assert.match(api, /event === 'complete'/);
    assert.match(api, /event === 'error'/);
  });
});

describe('the analyzer handles the awkward cases', () => {
  test('a dropped connection falls back to the same measurement', () => {
    // The stages are a way of watching the measurement, not part of it. When
    // the stream breaks, the plain request returns the same answer.
    assert.match(analyzer, /requestMeasuredAnalysis/);
  });

  test('the candidate can stop the measurement', () => {
    assert.match(analyzer, /AbortController/);
    assert.match(analyzer, /abortRef/);
    assert.match(analyzer, /Cancel/);
  });

  test('a re-analysis keeps the earlier one', () => {
    // The history is read back from the server, where every run is a new row.
    assert.match(analyzer, /fetchMeasurementHistory/);
    assert.match(analyzer, /Earlier measurements/);
  });

  test('a saved CV can be analysed without uploading again', () => {
    assert.match(analyzer, /cvVersions/);
    assert.match(analyzer, /cvVersionId/);
  });

  test('a re-analysis measures the same CV again instead of uploading it twice', () => {
    // The button lives in the results header. The window around it is the
    // button itself, so an upload cannot hide in it.
    const at = analyzer.indexOf("t('Re-analyze')");
    assert.ok(at > 0, 'the results header must offer a re-analysis');
    const button = analyzer.slice(Math.max(0, at - 700), at + 80);

    assert.match(button, /measure\(subject\)/, 'the re-analysis measures what was measured');
    assert.doesNotMatch(
      button,
      /analyseUploadedFile/,
      'a re-analysis must not upload the file again: that would create a second CV'
    );
  });
});
