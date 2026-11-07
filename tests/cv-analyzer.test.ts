// The CV Analyzer.
//
// The analyzer used to be a page that did the measuring on its own, while
// the studio had a second implementation of the same measurement. It is now
// one panel — `CvAnalysisPanel` — rendered by the studio's analysis tab.
//
// The navigation entry was removed by product decision: the analyzer is not a
// destination of its own any more, it is the "Analyze" step of the CV Studio.
// The address is still kept as an alias, so a link to it — in a shared CV, in
// a support message or in the browser history — still lands the candidate on
// the measurement instead of on a broken page.
//
// These tests hold that to the rules the platform already follows:
//
//   * it is reachable — the old link still works and lands inside the studio;
//   * there is one implementation, so the two cannot drift apart;
//   * it never shows a score it cannot explain;
//   * it does not fake progress: the stage list comes from the server's real
//     stage events, and the interface has no timer that moves it;
//   * the ATS score of the model stays a separate, labelled system.
//
// The behavioural guarantees are asserted against the file that now holds
// the behaviour, which is the point of the merge: a guarantee that lives in
// the implementation is checked in the implementation.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isAppRoute,
  isKnownRoute,
  buildRouteHash,
  parseRouteHash,
  resolveRouteAlias,
} from '../src/lib/routing.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

const panel = readFileSync(
  join(REPO_ROOT, 'src', 'components', 'cv', 'CvAnalysisPanel.tsx'),
  'utf-8'
);
const studio = readFileSync(
  join(REPO_ROOT, 'src', 'components', 'views', 'CVStudioView.tsx'),
  'utf-8'
);
const app = readFileSync(join(REPO_ROOT, 'src', 'App.tsx'), 'utf-8');
const shell = readFileSync(join(REPO_ROOT, 'src', 'components', 'layout', 'AppShell.tsx'), 'utf-8');
const api = readFileSync(join(REPO_ROOT, 'src', 'lib', 'cvAnalysisApi.ts'), 'utf-8');
const serverApp = readFileSync(join(REPO_ROOT, 'app.ts'), 'utf-8');

describe('the CV Analyzer is reachable from the CV Studio', () => {
  test('the old link still names a route the application knows', () => {
    // Links to the analyzer exist in shared CVs, in support messages and in
    // browser history. The address is kept so none of them breaks — but the
    // analyzer is no longer a view of the application, so the application
    // must never open one.
    assert.equal(isAppRoute('cv-analyzer'), false);
    assert.equal(isKnownRoute('cv-analyzer'), true);
    assert.equal(buildRouteHash('cv-analyzer'), '#/cv-analyzer');
    assert.equal(parseRouteHash('#/cv-analyzer').route, 'cv-analyzer');
  });

  test('the old link lands on the studio analysis tab', () => {
    const alias = resolveRouteAlias('cv-analyzer');
    assert.ok(alias, 'the analyzer route must resolve to where the analyzer lives');
    assert.equal(alias.route, 'cv-studio');
    assert.equal(alias.params.tab, 'ats');
    assert.equal(buildRouteHash(alias.route, alias.params), '#/cv-studio?tab=ats');
  });

  test('the application follows the alias instead of rendering a second page', () => {
    assert.match(app, /resolveRouteAlias/);
    assert.doesNotMatch(app, /CvAnalyzerView/);
    assert.doesNotMatch(app, /case 'cv-analyzer':/);
  });

  test('there is no second analyzer implementation on disk', () => {
    assert.equal(
      existsSync(join(REPO_ROOT, 'src', 'components', 'views', 'CvAnalyzerView.tsx')),
      false,
      'the standalone analyzer page must not come back'
    );
  });

  test('it is not in the navigation', () => {
    // The navigation entry was removed by product decision: the analyzer is
    // the "Analyze" step of the CV Studio, not a destination of its own.
    assert.doesNotMatch(shell, /id: 'cv-analyzer'/);
  });
});

describe('the analyzer is merged into CV Studio', () => {
  test('the studio renders the one panel', () => {
    // One implementation. If the studio grew its own copy of the
    // measurement, the two would drift apart and the candidate would get
    // two different answers to the same question.
    assert.match(studio, /CvAnalysisPanel/);
    assert.doesNotMatch(studio, /streamMeasuredAnalysis/);
  });

  test('the studio measures the document it is working on', () => {
    assert.match(studio, /cv=\{activeCV\}/);
  });

  test('the studio also offers the upload and the saved-CV picker', () => {
    // "Upload or select an existing CV" is part of the studio now, so the
    // candidate never has to leave it to measure a document they have not
    // imported yet.
    assert.match(studio, /showUpload/);
  });

  test('the studio does not send the candidate out to another analyzer page', () => {
    assert.doesNotMatch(studio, /onNavigate\?\.\('cv-analyzer'\)/);
  });
});

describe('the analyzer never shows a score it cannot explain', () => {
  test('it shows the measured score and the evidence behind it', () => {
    assert.match(panel, /report\.overallScore/);
    assert.match(panel, /CvMeasurementReport/);
  });

  test('the ATS score of the model is shown as a separate system', () => {
    // The measured score and the model's score are different numbers from
    // different systems. They are never shown as one score.
    assert.match(panel, /AI ATS score/);
    assert.match(panel, /atsScore/);
  });
});

describe('the analyzer does not fake progress', () => {
  test('the stage list comes from the server, not from a timer', () => {
    assert.match(panel, /CV_ANALYSIS_STAGES/);
    assert.match(panel, /streamMeasuredAnalysis/);

    // There is no timer in the analyzer. A stage only moves because the
    // server reported it.
    assert.doesNotMatch(panel, /setInterval/);
    assert.doesNotMatch(panel, /setTimeout/);
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
    assert.match(panel, /requestMeasuredAnalysis/);
  });

  test('the candidate can stop the measurement', () => {
    assert.match(panel, /AbortController/);
    assert.match(panel, /abortRef/);
    assert.match(panel, /Cancel/);
  });

  test('a re-analysis keeps the earlier one', () => {
    // The history is read back from the server, where every run is a new row.
    assert.match(panel, /fetchMeasurementHistory/);
    assert.match(panel, /Earlier measurements/);
  });

  test('a saved CV can be analysed without uploading again', () => {
    assert.match(panel, /cvVersions/);
    assert.match(panel, /cvVersionId/);
  });

  test('a re-analysis measures the same CV again instead of uploading it twice', () => {
    // The button lives in the results header. The window around it is the
    // button itself, so an upload cannot hide in it.
    const at = panel.indexOf("t('Re-analyze')");
    assert.ok(at > 0, 'the results header must offer a re-analysis');
    const button = panel.slice(Math.max(0, at - 700), at + 80);

    assert.match(button, /measure\(subject\)/, 'the re-analysis measures what was measured');
    assert.doesNotMatch(
      button,
      /analyseUploadedFile/,
      'a re-analysis must not upload the file again: that would create a second CV'
    );
  });
});

describe('there is one way to bring a CV into the product', () => {
  test('the studio sends the candidate to the review', () => {
    // The header button used to open a modal that wrote the CV without
    // showing anything first. It now opens the review tab, which is the
    // journey that reads the document, shows what was found, and only then
    // writes what the candidate accepted.
    assert.match(studio, /setActiveTab\('review'\)/);
    assert.doesNotMatch(studio, /CVImportModal/);
  });

  test('the modal that imported without review is gone', () => {
    assert.equal(
      existsSync(join(REPO_ROOT, 'src', 'components', 'cv', 'CVImportModal.tsx')),
      false,
      'the modal that wrote a CV without a review must not come back'
    );
  });

  test('measuring a file does not put it in the account', () => {
    // The analyzer's upload used to post to the upload route, which created
    // a CV and made it the active one. A file that arrives is a file the
    // candidate may want to look at; it must not replace the CV they have.
    assert.match(panel, /extractCv/);
    assert.doesNotMatch(panel, /uploadCvFile/);
    assert.doesNotMatch(panel, /resumes\/upload/);
  });

  test('the upload route does not take over as the active CV', () => {
    // The route stays: it is a public API and the production security check
    // asks it for a 401. What it must not do is make its CV the candidate's
    // active one behind their back.
    const start = serverApp.indexOf("app.post('/api/resumes/upload'");
    const end = serverApp.indexOf("app.post('/api/cv/extract'", start);
    assert.ok(start >= 0 && end > start, 'the upload route must be present');
    const route = serverApp.slice(start, end);
    assert.doesNotMatch(
      route,
      /setActiveCv/,
      "an upload must not replace the candidate's active CV"
    );
  });
});
