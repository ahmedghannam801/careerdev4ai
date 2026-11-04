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
    // The CV studio's writing assistant and the document it builds from the
    // platform's records. Pure, like the two above: no database needed.
    join(TESTS_DIR, 'cv-studio.test.ts'),
    join(TESTS_DIR, 'cv-preview.test.ts'),
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
    // The recommendation relevance gate, the learning CTA URL rule and
    // roadmap resource attachment. Pure.
    join(TESTS_DIR, 'recommendation-relevance.test.ts'),
    // The CV headline generator, the professional-link diff and the
    // Training & Courses page rules. Pure.
    join(TESTS_DIR, 'headline-suggestions.test.ts'),
    join(TESTS_DIR, 'professional-links.test.ts'),
    join(TESTS_DIR, 'training-courses.test.ts'),
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
    // Persisted onboarding status distinguishes resumable, skipped and completed.
    join(TESTS_DIR, 'onboarding.test.ts'),
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
    // The public website: the interactive product preview runs the real
    // planning engine, the legal and contact links reach their real
    // destinations, and the new copy is fully translated. Pure.
    join(TESTS_DIR, 'public-site.test.ts'),
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
