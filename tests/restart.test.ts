// Server-restart persistence: data written before a restart must still be there
// after a new server process starts.
//
// This file manages its own server lifecycle so it can stop and restart the
// process on a dedicated port; the other suites use the shared server started
// by tests/runner.mjs.
//
// The port comes from TEST_RESTART_PORT, which the runner allocates from the
// operating system. It is therefore never the shared server's port and never
// a port a previous run left occupied.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestUser, deleteTestUser, deleteRow, api, type TestUser } from './helpers.ts';
import { startServer, stopServer } from './server-harness.mjs';
import type { ChildProcess } from 'child_process';

const RESTART_PORT = Number(process.env.TEST_RESTART_PORT ?? 3112);
const RESTART_BASE_URL = `http://127.0.0.1:${RESTART_PORT}`;

let user: TestUser;
let server: { child: ChildProcess; stop: () => Promise<void> };
const created: Array<{ table: string; id: string }> = [];

before(async () => {
  user = await createTestUser('restart');
  server = await startServer({ port: RESTART_PORT });
});

after(async () => {
  await server?.stop();
  for (const row of created) await deleteRow(row.table, row.id);
  await deleteTestUser(user);
});

describe('server restart', () => {
  test('a project written before a restart is still there after it', async () => {
    const project = await api('POST', '/api/projects', {
      token: user.token,
      body: { title: 'Survives restart', goal: 'g', description: 'd' },
      baseUrl: RESTART_BASE_URL,
    });
    assert.equal(project.status, 201);
    created.push({ table: 'projects', id: project.body.project.id });

    // Stop the server and start a new one.
    await server.stop();
    server = await startServer({ port: RESTART_PORT });

    const read = await api('GET', '/api/projects', { token: user.token, baseUrl: RESTART_BASE_URL });
    assert.ok(
      (read.body?.projects ?? []).some((p: any) => p.id === project.body.project.id),
      'the project must survive a server restart'
    );
  });

  test('roadmap progress survives a restart', async () => {
    const roadmap = await api('POST', '/api/roadmap', {
      token: user.token,
      body: { title: 'Restart roadmap', isEnrolled: true },
      baseUrl: RESTART_BASE_URL,
    });
    assert.equal(roadmap.status, 201);
    created.push({ table: 'roadmaps', id: roadmap.body.roadmap.id });

    await server.stop();
    server = await startServer({ port: RESTART_PORT });

    const read = await api('GET', '/api/roadmap', { token: user.token, baseUrl: RESTART_BASE_URL });
    assert.equal(read.body?.roadmap?.title, 'Restart roadmap');
    assert.equal(read.body?.roadmap?.isEnrolled, true);
  });
});
