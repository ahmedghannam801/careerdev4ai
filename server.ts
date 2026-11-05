/**
 * Node entry point.
 *
 * This is the only place that is allowed to load `.env`, open a port, or serve
 * static assets. The Express application itself lives in `app.ts` and is shared
 * verbatim with the Cloudflare Pages Worker in `worker/index.ts`, so the
 * deployed API and the local/test API run exactly the same routes.
 *
 * `dotenv` is loaded before the application module is imported so the app's
 * module-scope reads of the environment (Gemini client, CORS allow-list) see
 * the same values they did when this file contained the app.
 */
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

/**
 * The test server never reaches the live background-job platform.
 *
 * `dotenv` loads the machine's own `.env` above. A test must not start real
 * work against a live deployment: the work consumes the platform's quota and,
 * when no worker is connected, it stays waiting for ever — which then makes
 * the deployed site believe that no worker is available.
 *
 * The test server therefore has no queue at all. A background job started
 * against it is admitted, recorded and then failed with the reason that there
 * is no queue — which is exactly the contract the suite has to cover.
 *
 * Everything else the machine's `.env` provides stays, so the suite sees the
 * same model, the same analytics settings and the same behaviour it has
 * always had.
 */
if (process.env.CAREERDEV_TEST_SERVER === 'true') {
  // The same goes for the job provider: the suite proves the contract of a
  // server that has no credential, and it must not spend the owner's quota.
  delete process.env.JSEARCH_RAPIDAPI_KEY;
  delete process.env.RAPIDAPI_KEY;
}

const { app } = await import('./app.ts');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

/**
 * The local background-job queue.
 *
 * A developer running the server locally has no Cloudflare queue behind it,
 * so the server runs one of its own: the same consumer the deployed worker
 * uses, fed by an in-process queue. A job started in the browser behaves the
 * same way it behaves in production — it is written down, a message is
 * published, a worker claims it, the work happens and the row records the
 * outcome.
 *
 * The test server does not get one, unless a test asks for it explicitly with
 * `CAREERDEV_LOCAL_JOB_QUEUE=1`. It must never start real work on its own,
 * and it has to be able to prove what the API does when there is no queue at
 * all.
 *
 * `CAREERDEV_LOCAL_JOB_RUNNER=0` installs the queue without the runner that
 * drains it. That is how a test can watch what the API publishes without the
 * work being carried out underneath it.
 */
const wantsLocalQueue =
  process.env.CAREERDEV_TEST_SERVER !== 'true' || process.env.CAREERDEV_LOCAL_JOB_QUEUE === '1';

if (wantsLocalQueue) {
  const { installLocalJobQueue, startLocalJobRunner } = await import('./server/jobs/localRunner.ts');
  const localQueue = installLocalJobQueue();
  if (process.env.CAREERDEV_LOCAL_JOB_RUNNER !== '0') {
    startLocalJobRunner(localQueue);
    console.log('Background jobs run on the local in-process queue.');
  }
}

// Mount Vite in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareerDev4AI Server running on port ${PORT}`);
  });
}

startServer();
