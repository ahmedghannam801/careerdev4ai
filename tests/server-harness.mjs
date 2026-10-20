// Starts and stops the API server for a test run.
//
// The server is started as a DIRECT child of the runner:
//
//   node --import <tsx loader> server.ts
//
// The `--import` form is used deliberately. `npx tsx` and `node_modules/.bin/tsx`
// re-spawn a second Node process, which on Windows means the runner's child is
// a wrapper that can outlive the kill signal and leave an orphaned server
// holding a port. Importing the loader directly keeps the server a single
// process that the runner owns and can terminate.
//
// The loader path is resolved to an absolute file:// URL because Windows
// rejects a bare absolute path in --import ("Received protocol 'd:'").

import { spawn } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { setTimeout as sleep } from 'timers/promises';
import { pathToFileURL } from 'url';
import { REPO_ROOT } from './env.mjs';

/** The absolute path of the local tsx ESM loader. */
export function resolveTsxLoader() {
  const candidates = [
    join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
    join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Could not locate the local tsx loader (node_modules/tsx/dist/loader.mjs). ' +
      'Run `npm install` before `npm test`.'
  );
}

/**
 * The tsx loader as a file:// URL, ready to be passed to --import.
 *
 * Windows rejects a bare absolute path in --import ("Received protocol 'd:'"),
 * so the URL form is the only one that works there.
 */
export function resolveTsxLoaderUrl() {
  return pathToFileURL(resolveTsxLoader()).href;
}

/** True when something is already listening on the given port. */
export async function isPortInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '127.0.0.1');
  });
}

/** Asks the OS for a free TCP port. */
export async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Waits until the server answers /api/health.
 *
 * Polls the endpoint rather than watching the process output, because the
 * health endpoint is the actual contract the tests depend on.
 */
export async function waitForServer(baseUrl, timeoutMs = 120_000) {
  const url = `${baseUrl}/api/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response yet';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.text();
        return true;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message ?? String(error);
    }
    await sleep(250);
  }

  throw new Error(
    `The server did not become ready at ${url} within ${timeoutMs}ms (last: ${lastError}).`
  );
}

/**
 * Starts the API server on the given port and waits until it is healthy.
 *
 * The server runs with NODE_ENV=production so that it serves the built app
 * instead of booting a Vite dev server: the Vite middleware takes several
 * seconds and opens its own websocket port, neither of which the API tests
 * need.
 *
 * Returns a handle with the child process and a `stop` function.
 */
export async function startServer({ port, env, timeoutMs = 120_000 } = {}) {
  if (await isPortInUse(port)) {
    throw new Error(
      `Port ${port} is already in use. Stop whatever is holding it (or set ` +
        `TEST_API_PORT to a different port) before running the tests — ` +
        `otherwise the suite would run against a stale server.`
    );
  }

  const loader = resolveTsxLoaderUrl();
  const child = spawn(process.execPath, ['--import', loader, 'server.ts'], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  const capture = (chunk) => {
    output += String(chunk);
    // Keep only the tail so a chatty server cannot grow the buffer forever.
    if (output.length > 20_000) output = output.slice(-20_000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  let exited = false;
  let exitCode = null;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  // Remember the port on the child so stopServer can wait for it to be freed.
  child.__testPort = port;
  try {
    await waitForServer(baseUrl, timeoutMs);
  } catch (error) {
    await stopServer(child);
    throw new Error(`${error.message}\n--- server output ---\n${output.slice(-2000)}`);
  }

  return {
    child,
    baseUrl,
    port,
    get exited() {
      return exited;
    },
    get exitCode() {
      return exitCode;
    },
    get output() {
      return output;
    },
    stop: () => stopServer(child),
  };
}

/**
 * Stops a server process and waits for the port to be released.
 *
 * On Windows a SIGTERM is delivered to the process, but a process that has
 * already spawned its own children may need the harder kill. The port is
 * polled until it is free so the next server can bind it immediately.
 */
export async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (child) await waitForPortRelease(child);
    return;
  }

  child.kill('SIGTERM');

  const deadline = Date.now() + 10_000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(100);
  }

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    const hardDeadline = Date.now() + 5_000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < hardDeadline) {
      await sleep(100);
    }
  }

  await waitForPortRelease(child);
}

/** Waits until the port the child was bound to is free again. */
async function waitForPortRelease(child) {
  const port = child?.__testPort;
  if (!port) return;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await isPortInUse(port))) return;
    await sleep(100);
  }
}
