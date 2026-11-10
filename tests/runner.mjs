// The test runner.
//
// `npm test` runs this file. It owns the whole lifecycle of a test run:
//
//   1. load the test environment (and fail clearly if a credential is missing)
//   2. clean up anything a previous, interrupted run left behind
//   3. start exactly ONE isolated API server and wait until it is healthy
//   4. run every test file against that server
//   5. stop the server
//   6. clean up everything this run created
//   7. exit non-zero if any test failed
//
// Design notes that matter on Windows:
//
//   * The server is a direct child of this process (see server-harness.mjs), so
//     it can always be terminated. Nothing is left running after the run.
//   * The ports are chosen by the OS at run time, so a development server, a
//     stale process or a second concurrent run cannot collide with the suite.
//   * The restart test needs a port of its own; it is given a second, separate
//     free port so restarting it never collides with the shared server.
//
// One run at a time, on every machine:
//
//   The suite runs against the shared Supabase project. Every identity this
//   run creates carries this run's id, so two runs can never remove each
//   other's identities — the failure that used to make an overlapping CI run
//   fail for reasons that had nothing to do with the commit under test.
//
//   The tables the suite writes to — announcements, the delivery ledger, the
//   scheduler and the rate limits — are still shared, so two runs can still
//   disturb each other there. The workflow serialises its own runs, and a
//   local run should wait for a CI run to finish before it starts.
//
// This file is plain ESM JavaScript: it must be runnable before any TypeScript
// tooling is known to be healthy, so that a loader problem is reported as a
// loader problem and not as a mysterious test failure.

import { spawn } from 'child_process';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { setTimeout as sleep } from 'timers/promises';
import { loadTestEnv, REPO_ROOT } from './env.mjs';
import { startServer, findFreePort, resolveTsxLoaderUrl } from './server-harness.mjs';
import {
  createAdminClient,
  deleteAllTestIdentities,
  deleteTestIdentities,
  listTestIdentities,
  listForeignTestIdentities,
  listStaleTestIdentities,
  deleteSkillsById,
  listSkillIds,
  removeTestStorageFolders,
  listOrphanedStorageFolders,
} from './cleanup.mjs';

const TESTS_DIR = join(REPO_ROOT, 'tests');

/** The legacy JSON state file the suite must never write to. */
const STATE_FILE = join(REPO_ROOT, '.careerpilot_state.json');

function log(message) {
  console.log(`[test] ${message}`);
}

function fail(message) {
  console.error(`[test] ${message}`);
}

/**
 * The server the current run started, kept at module scope so that an
 * interrupt can stop it. Without this the server would survive the runner and
 * keep holding its port.
 */
let activeServer = null;

/** Reads a file's bytes for the unchanged-check, or null when it is absent. */
function readFileOrNull(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

/**
 * The user id the server seeds on a fresh checkout. `server.ts` writes the
 * state file with this single default account when the file does not exist.
 */
const BOOTSTRAP_USER_ID = 'user-default-1';

/**
 * Verifies that the legacy JSON state file was not written to by the suite.
 *
 * Two cases, and they must be treated differently:
 *
 *   The file existed before the run  → it must be byte-identical afterwards.
 *   The file did not exist before    → the server's own bootstrap creates it
 *                                       (it seeds the default account), which
 *                                       is normal server startup, not test
 *                                       contamination. The file is checked
 *                                       for test data and then removed, so
 *                                       the checkout is left exactly as it
 *                                       was found.
 */
function verifyStateFile(stateBefore) {
  const stateAfter = readFileOrNull(STATE_FILE);

  if (stateBefore !== null) {
    if (stateAfter === null) {
      fail('.careerpilot_state.json was deleted by the test run. It must never be written to.');
      return false;
    }
    if (!stateBefore.equals(stateAfter)) {
      fail('.careerpilot_state.json was modified by the test run. It must never be written to.');
      return false;
    }
    log('.careerpilot_state.json is unchanged');
    return true;
  }

  // The file was absent before the run.
  if (stateAfter === null) {
    log('.careerpilot_state.json is absent (unchanged)');
    return true;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(stateAfter.toString('utf-8'));
  } catch {
    fail('.careerpilot_state.json was created by the test run and is not valid JSON.');
    return false;
  }

  // The only account the server seeds is the default one. Any other user —
  // and any user state — would mean the suite wrote to the file.
  const userIds = Object.keys(parsed?.users ?? {});
  const hasUnexpectedUser = userIds.some((id) => id !== BOOTSTRAP_USER_ID);
  const hasUnexpectedState = Object.keys(parsed?.userStates ?? {}).some(
    (key) => key !== 'default'
  );

  if (hasUnexpectedUser || hasUnexpectedState) {
    fail(
      '.careerpilot_state.json was created by the test run and contains data ' +
        'the server bootstrap does not create.'
    );
    return false;
  }

  // The file is gitignored and is regenerated by the server on its next
  // start, so removing it restores the checkout to exactly its prior state.
  rmSync(STATE_FILE, { force: true });
  log('.careerpilot_state.json was created by the server bootstrap and removed again');
  return true;
}

/**
 * Runs the test files with Node's built-in test runner.
 *
 * The tsx loader is passed with --import so that each test file — which runs in
 * its own child process — can import TypeScript directly. The file list is
 * passed explicitly rather than as a glob: Node's own glob handling has
 * changed between releases, and an explicit list is unambiguous.
 */
function runTestFiles(files, { baseUrl, env }) {
  return new Promise((resolve) => {
    const loader = resolveTsxLoaderUrl();
    const child = spawn(
      process.execPath,
      [
        '--import',
        loader,
        '--test',
        '--test-concurrency=1',
        '--test-reporter=spec',
        ...files,
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, ...env, TEST_API_BASE_URL: baseUrl },
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      }
    );

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      fail(`Could not start the test runner: ${error.message}`);
      resolve(1);
    });
  });
}

async function main() {
  let exitCode = 0;
  let server = null;
  let admin = null;
  let skillIdsBefore = new Set();
  const createdUserIds = [];

  // The state file must be byte-identical after the run.
  const stateBefore = readFileOrNull(STATE_FILE);

  // Fail fast and clearly if the environment is not configured.
  let env;
  try {
    env = loadTestEnv();
  } catch (error) {
    fail(error.message);
    return 1;
  }

  admin = createAdminClient(env);

  // This run's namespace. Every identity the run creates carries it, so two
  // runs against the same database cannot remove each other's data.
  //
  // The id is set before anything reads it, and it is inherited by the test
  // files this run spawns, so the runner and the tests agree on the namespace.
  if (!process.env.TEST_RUN_ID) {
    process.env.TEST_RUN_ID = randomBytes(4).toString('hex');
  }
  log(`run namespace ${process.env.TEST_RUN_ID}`);

  // A previous run may have been interrupted and left identities behind. Only
  // the ones that no live run can be using are swept: an identity that is
  // younger than the maximum run length may belong to a run that is executing
  // right now, and removing it would break that run.
  try {
    const stale = await listStaleTestIdentities(admin);
    if (stale.length > 0) {
      log(`sweeping ${stale.length} abandoned test identit${stale.length === 1 ? 'y' : 'ies'} from an interrupted run`);
      const removedIds = await deleteTestIdentities(admin, stale);
      createdUserIds.push(...removedIds);
    }
    skillIdsBefore = await listSkillIds(admin);
    const removedIds = await deleteAllTestIdentities(admin);
    createdUserIds.push(...removedIds);
  } catch (error) {
    fail(`Could not clean up before the run: ${error.message}`);
    return 1;
  }

  // Find the test files.
  //
  // `TEST_ONLY` runs a subset, by file name without the extension. It exists
  // so a single suite can be re-run in isolation when a run fails for an
  // environmental reason (a dropped connection to Supabase Auth, say) and
  // the failure has to be distinguished from a real regression.
  const only = (process.env.TEST_ONLY ?? '').trim();
  const onlyNames = only
    ? only
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const testFiles = [
    join(TESTS_DIR, 'auth.test.ts'),
    // The authentication surface and the configuration the browser bundle is
    // built from: that the public values resolve in a clean checkout, that the
    // interface still offers every sign-in method, and that the Supabase
    // project still has the providers enabled. The regression this covers
    // shipped a site with every sign-in method removed.
    join(TESTS_DIR, 'auth-config.test.ts'),
    join(TESTS_DIR, 'domains.test.ts'),
    join(TESTS_DIR, 'persistence.test.ts'),
    join(TESTS_DIR, 'regression.test.ts'),
    join(TESTS_DIR, 'lifecycle.test.ts'),
    join(TESTS_DIR, 'roadmap.test.ts'),
    join(TESTS_DIR, 'skills.test.ts'),
    join(TESTS_DIR, 'notifications.test.ts'),
    // The administrative layer: server-enforced roles, announcement delivery
    // to real inboxes and the moderator report in the audit log.
    join(TESTS_DIR, 'admin.test.ts'),
    // The Admin Center traffic dashboard: the Google credential behind it,
    // the lifetime of the access token, and the gate the route keeps.
    join(TESTS_DIR, 'ga4-analytics.test.ts'),
    join(TESTS_DIR, 'security.test.ts'),
    join(TESTS_DIR, 'coverage.test.ts'),
    join(TESTS_DIR, 'restart.test.ts'),
    join(TESTS_DIR, 'b4.test.ts'),
    join(TESTS_DIR, 'b5.test.ts'),
    join(TESTS_DIR, 'career-catalog.test.ts'),
    join(TESTS_DIR, 'cv-pipeline.test.ts'),
    // The extraction review: the confidence, the evidence and the issues a
    // candidate is shown before they accept a CV, and the idempotent write
    // that applies it. Pure.
    join(TESTS_DIR, 'cv-extraction-review.test.ts'),
    // The accuracy of the extraction engine against documents whose contents
    // are known, with the metrics printed so they can be watched. Pure.
    join(TESTS_DIR, 'cv-extraction-quality.test.ts'),
    join(TESTS_DIR, 'target-role.test.ts'),
    join(TESTS_DIR, 'volunteer.test.ts'),
    // Live job vacancies: what the provider record becomes, what the fit
    // explanation says, how the provider's failures are answered, and that the
    // route is private and fails safely without a credential.
    join(TESTS_DIR, 'jobs.test.ts'),
    // The personalisation engine, the grounding validator and the
    // localisation catalogue. These are pure: they need no database, but
    // they run in the same process as the rest of the suite so a regression
    // in them is caught by `npm test` rather than only by a separate command.
    join(TESTS_DIR, 'personalization.test.ts'),
    join(TESTS_DIR, 'personalization-api.test.ts'),
    join(TESTS_DIR, 'grounding.test.ts'),
    join(TESTS_DIR, 'localization.test.ts'),
    // The feedback invitation policy: never during onboarding or a focused
    // task, never for a new account, one invitation per period, and a card
    // dismissal that does not silence the contextual invitation. Pure.
    join(TESTS_DIR, 'feedback.test.ts'),
    // The same policy against the running API: the session counter, the three
    // events, the rejected values, and one account's history staying private
    // from another.
    join(TESTS_DIR, 'feedback-api.test.ts'),
    // Stripe: the form encoder, the catalogue, the lookup keys and webhook
    // signature verification. Pure: no key and no database are needed.
    join(TESTS_DIR, 'stripe-billing.test.ts'),
    // Stripe lifecycle: the exact rules that decide whether a verified event
    // grants an entitlement, grants credits once, or is acknowledged because
    // retrying cannot fix it. Dependency-injected: no key or database.
    join(TESTS_DIR, 'stripe-lifecycle.test.ts'),
    // The daily credit allowance, the referral programme and the birthday
    // discount, against the live database: the daily grant happens once, the
    // expiring bucket is spent first, a replay is refused, a referral pays
    // exactly once, a birthday belongs to one day in the candidate's own
    // timezone, and a signed-in client cannot write the tables that hold money.
    join(TESTS_DIR, 'credits-referrals-birthday.test.ts'),
    // The token economy's own contract: the daily allowance is two tokens, a
    // premium CV template is five, and the price the interface quotes is the
    // price the server charges. Pure: no key and no database are needed.
    join(TESTS_DIR, 'token-economy.test.ts'),
    // The Checkout Studio parameters sent to Stripe, and the rule that picks
    // the hosted checkout's user-interface mode from the account's API
    // version. Pure: no key and no database are needed.
    join(TESTS_DIR, 'checkout-studio-params.test.ts'),
    // The payment accounts: the authoritative Vodafone Cash wallet and InstaPay
    // address, the one place they are written down, and a scan of the whole
    // repository for an identifier that was wrong. Pure.
    join(TESTS_DIR, 'payment-accounts.test.ts'),
    // The payment brand marks: the real Simple Icons and InstaPay assets, and
    // the proof that the checkout and the pricing page render them. Pure.
    join(TESTS_DIR, 'payment-brand-marks.test.ts'),
    // The checkout interface: the state machine, the truthfulness of the
    // outcome screen, the guard against a second submission, the fail-closed
    // card rail, and the reduced-motion, theme and direction rules. Pure.
    join(TESTS_DIR, 'payment-checkout-ui.test.ts'),
    // The CV studio's writing assistant and the document it builds from the
    // platform's records. Pure, like the two above: no database needed.
    join(TESTS_DIR, 'cv-studio.test.ts'),
    join(TESTS_DIR, 'cv-preview.test.ts'),
    // The studio's own data: the resume language and its separation from the
    // interface language, the AI actions offered on each section, the order
    // of the entries on the document, and the placement of the tour's
    // instruction card. Pure.
    join(TESTS_DIR, 'resume-language.test.ts'),
    join(TESTS_DIR, 'cv-assist-actions.test.ts'),
    join(TESTS_DIR, 'cv-studio-data.test.ts'),
    // The same, against the live database: the resume language is stored on
    // the account and refused when it is a language the studio cannot
    // render, and the order of the entries survives a reload.
    join(TESTS_DIR, 'cv-studio-persistence.test.ts'),
    // The CV template library: that no two templates are the same template
    // (structurally and in the document they render), that exactly one is free,
    // that a candidate without a paid plan cannot apply, export or download a
    // premium template even by calling the API directly, that an expired or
    // cancelled subscription loses the library, that changing the template
    // never changes the CV, and that the DOCX export is editable text. Pure
    // for the catalogue and the documents; the access rules run against the
    // API.
    join(TESTS_DIR, 'cv-templates.test.ts'),
    // The document the CV studio shows is a projection of the platform's
    // records, so a change to a record reaches the CV on its own. Pure.
    join(TESTS_DIR, 'cv-projection.test.ts'),
    // The dates a career record carries: history is accepted, contradictions
    // are not. Pure.
    join(TESTS_DIR, 'historical-dates.test.ts'),
    // The job description flow: what the advertisement asks for, how it is
    // compared with the candidate's record, and what is written onto their
    // document. Pure.
    join(TESTS_DIR, 'job-description.test.ts'),
    // The deterministic CV analysis: the score is measured from the document
    // rather than described by a model, a dimension the document cannot support
    // is left out of the average instead of being scored as zero, and the
    // market dimension reports only the job description it was given. Pure.
    join(TESTS_DIR, 'cv-analysis.test.ts'),
    // The measured analysis route: the score the candidate sees is counted from
    // their own CV, it needs no model, and it is private to them.
    join(TESTS_DIR, 'cv-analysis-route.test.ts'),
    // The CV Analyzer: the address is an alias of the studio's analysis step,
    // and the stage list comes from the server rather than from a timer.
    join(TESTS_DIR, 'cv-analyzer.test.ts'),
    // The guard on the administrative route: the answer comes from the
    // server, the Admin Center is mounted only for an administrator, and the
    // interface says "checking" until the server has answered. Pure.
    join(TESTS_DIR, 'admin-route-guard.test.ts'),
    // The project advisor: what it recommends and what it finds wrong with
    // the projects the candidate already has. Pure.
    join(TESTS_DIR, 'project-recommendation.test.ts'),
    // The advisor's two AI requests: the abort signal they carry and the
    // deterministic answer with its fallback reason. Pure.
    join(TESTS_DIR, 'project-advisor-ai.test.ts'),
    // The URL is the state of the application, so a refresh reopens the same
    // page. Pure.
    join(TESTS_DIR, 'routing.test.ts'),
    // The public SEO surface — the pages a crawler can index, the sitemap,
    // robots.txt and the metadata of the application — and the privacy rules
    // the analytics has to keep.
    join(TESTS_DIR, 'seo.test.ts'),
    // Certificates: what the record holds, and what may be called a
    // certificate. Pure.
    join(TESTS_DIR, 'certificates.test.ts'),
    // The shared AI answer formatter: what the copilot's markdown becomes
    // before it reaches the reader. Pure.
    join(TESTS_DIR, 'ai-response.test.ts'),
    join(TESTS_DIR, 'openrouter.test.ts'),
    join(TESTS_DIR, 'contrast.test.ts'),
    join(TESTS_DIR, 'recommendation-dedup.test.ts'),
    // The recommendation relevance gate, the learning CTA URL rule and
    // roadmap resource attachment. Pure.
    join(TESTS_DIR, 'recommendation-relevance.test.ts'),
    // The CV headline generator, the professional-link diff and the
    // Training & Courses page rules. Pure.
    join(TESTS_DIR, 'headline-suggestions.test.ts'),
    join(TESTS_DIR, 'professional-links.test.ts'),
    join(TESTS_DIR, 'training-courses.test.ts'),
    join(TESTS_DIR, 'learning-search.test.ts'),
    // The sequential adaptive interview plan and the catalogue's provider
    // tier / availability vocabulary. Pure.
    join(TESTS_DIR, 'interview-plan.test.ts'),
    // The explicit AI response language shared by the client and the server.
    // Pure.
    join(TESTS_DIR, 'ai-languages.test.ts'),
    // The same two tools against the running API: a real user's headline
    // options and a link that survives a reload.
    join(TESTS_DIR, 'career-tools.test.ts'),
    // Saved application packages are persisted as owner-scoped records.
    join(TESTS_DIR, 'application-packages.test.ts'),
    // Background jobs: a request without a session is refused, a job belongs
    // to the candidate who asked for it, the same request twice is one job, a
    // job that could not start says why, and a finished job survives a
    // refresh.
    join(TESTS_DIR, 'background-jobs.test.ts'),
    // The background-job queue itself: what a message carries, how a worker
    // claims a job, what happens when the same message arrives twice, how a
    // failure is retried and when it is given up on, how a job whose worker
    // died is handed back, and what a client may not do with a job.
    join(TESTS_DIR, 'background-queue.test.ts'),
    // Persisted onboarding status distinguishes resumable, skipped and completed.
    join(TESTS_DIR, 'onboarding.test.ts'),
    // Multi-stage interactive product tour: 10 chapters, 47 steps, and full Arabic coverage.
    join(TESTS_DIR, 'product-tour.test.ts'),
    // The public legal document versions and the server's acceptance predicate.
    // Pure; the user-provided legal copy remains an operator TODO.
    join(TESTS_DIR, 'legal.test.ts'),
    // The consent gate against the running API: a protected route is refused
    // until the current documents are accepted, an old acceptance is not
    // current, one user's acceptance cannot unlock another, and the history
    // survives a version change.
    join(TESTS_DIR, 'consent-gate.test.ts'),
    // The shared AI request lifecycle: a late answer never reaches the
    // interface, a save that started is not cancelled, and a failed save is
    // reported. Pure.
    join(TESTS_DIR, 'ai-processing-contract.test.ts'),
    // The public website: the interactive product preview runs the real
    // planning engine, the legal and contact links reach their real
    // destinations, and the new copy is fully translated. Pure.
    join(TESTS_DIR, 'public-site.test.ts'),
    // The subscription architecture: plan catalog, pricing in piasters, feature matrix. Pure.
    join(TESTS_DIR, 'subscriptions-system.test.ts'),
    // Subscription security and concurrency: RLS boundaries, payment confirmation idempotency,
    // AI endpoint gating, and credit expiration isolation.
    join(TESTS_DIR, 'subscriptions-security-and-concurrency.test.ts'),
  ].filter((file) => existsSync(file));

  const selected = onlyNames.length
    ? testFiles.filter((file) =>
        onlyNames.some((name) => file.includes(`${name}.test.ts`))
      )
    : testFiles;

  if (selected.length === 0) {
    fail(
      only
        ? `No test file matched TEST_ONLY="${only}".`
        : 'No test files were found in tests/.'
    );
    return 1;
  }
  if (onlyNames.length) {
    console.log(`[test] running only "${onlyNames.join(', ')}" (${selected.length} files)`);
  }

  // Pick free ports up front so the shared server and the restart server can
  // never collide with each other or with anything already running.
  let sharedPort;
  let restartPort;
  try {
    sharedPort = await findFreePort();
    restartPort = await findFreePort();
    while (restartPort === sharedPort) restartPort = await findFreePort();
  } catch (error) {
    fail(`Could not reserve a test port: ${error.message}`);
    return 1;
  }

  try {
    log(`starting an isolated server on port ${sharedPort}`);
    server = await startServer({
      port: sharedPort,
      env: {
        ...env,
        ADMIN_SCHEDULER_DISABLED: 'true',
        // The CV template premium rules are enforced ON in the test server so
        // that the access control is exercised the way it will behave once the
        // product owner turns the paywall on. Production keeps the flag off
        // (the platform is currently free) — this changes nothing outside this
        // run's own server.
        CV_TEMPLATE_PREMIUM_ENFORCEMENT: 'true',
      },
    });
    activeServer = server;
    log(`server ready at ${server.baseUrl}`);
  } catch (error) {
    fail(`Could not start the test server: ${error.message}`);
    return 1;
  }

  try {
    const code = await runTestFiles(selected, {
      baseUrl: server.baseUrl,
      env: {
        ...env,
        TEST_API_PORT: String(sharedPort),
        TEST_RESTART_PORT: String(restartPort),
        // The restart test starts its own server on TEST_RESTART_PORT.
        TEST_API_BASE_URL: server.baseUrl,
      },
    });
    exitCode = code;
  } finally {
    log('stopping the test server');
    await server.stop();
    activeServer = null;
    server = null;
  }

  // ---- Cleanup ------------------------------------------------------------
  //
  // Everything the run created is removed here, whether the tests passed or
  // failed. The skill catalogue is swept by comparing against the snapshot
  // taken before the run: only rows that are new are removed, so a skill that
  // already existed for a real user is never touched.
  log('cleaning up the data this run created');
  try {
    const skillIdsAfter = await listSkillIds(admin);
    const newSkillIds = [...skillIdsAfter].filter((id) => !skillIdsBefore.has(id));
    if (newSkillIds.length > 0) {
      await deleteSkillsById(admin, newSkillIds);
      log(`removed ${newSkillIds.length} catalogue skill row(s) created by this run`);
    }

    const removedIds = await deleteAllTestIdentities(admin);
    createdUserIds.push(...removedIds);

    // Storage folders of the identities this run created, plus the folders of
    // any identity an earlier interrupted run left behind.
    const storageIds = [...new Set(createdUserIds)];
    const removedObjects = await removeTestStorageFolders(admin, storageIds);
    if (removedObjects.length > 0) {
      log(`removed ${removedObjects.length} storage object(s)`);
    }
  } catch (error) {
    fail(`Cleanup failed: ${error.message}`);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }

  // ---- Verification -------------------------------------------------------
  if (!verifyStateFile(stateBefore)) {
    exitCode = exitCode === 0 ? 1 : exitCode;
  }

  // Give a just-deleted identity a moment to disappear from the auth list.
  await sleep(500);
  try {
    // Only this run's own identities are checked. An identity that belongs to
    // another run is that run's business: it may be in the middle of a test
    // there, and deleting it or failing because of it would break that run.
    let remaining = await listTestIdentities(admin);
    if (remaining.length > 0) {
      // One more sweep before the run is failed: an identity can survive the
      // first removal when the hosted Auth service throttles the deletion.
      // A leak that is still there after this sweep is a real leak.
      await deleteAllTestIdentities(admin);
      await sleep(500);
      remaining = await listTestIdentities(admin);
    }
    if (remaining.length > 0) {
      fail(`${remaining.length} test identity/identities still exist after cleanup:`);
      for (const { email } of remaining) fail(`  - ${email}`);
      exitCode = exitCode === 0 ? 1 : exitCode;
    } else {
      log('no test identities remain');
    }

    // Identities from another run are reported, never deleted. An abandoned
    // one is swept at the start of a later run; a live one belongs to a run
    // that is executing right now.
    const foreign = await listForeignTestIdentities(admin);
    if (foreign.length > 0) {
      log(
        `${foreign.length} test identit${foreign.length === 1 ? 'y' : 'ies'} belong to another run and were left untouched`
      );
    }

    // A bucket folder whose owner no longer exists is unreachable by any
    // authenticated user. The suite removes a folder *before* it removes the
    // identity, so this run cannot have produced one; anything reported here
    // predates the suite and is reported rather than silently deleted.
    const orphaned = await listOrphanedStorageFolders(admin);
    if (orphaned.length > 0) {
      fail(`${orphaned.length} orphaned CV storage folder(s) found (owner no longer exists):`);
      for (const name of orphaned) fail(`  - ${name}`);
      exitCode = exitCode === 0 ? 1 : exitCode;
    } else {
      log('no orphaned storage objects remain');
    }
  } catch (error) {
    fail(`Could not verify the cleanup: ${error.message}`);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }

  if (exitCode === 0) {
    log('PASS');
  } else {
    fail('FAIL');
  }
  return exitCode;
}

// Never leave a stray server behind, whatever happens: an interrupt must stop
// the server before the runner exits, or the port would stay occupied.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`\n[test] received ${signal} — stopping the test server`);
    const stop = activeServer
      ? activeServer.stop()
      : Promise.resolve();
    stop
      .catch(() => {})
      .finally(() => process.exit(130));
  });
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    fail(error?.stack ?? String(error));
    process.exitCode = 1;
  });
