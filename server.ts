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
 * The test server never reaches the live Trigger.dev project.
 *
 * `dotenv` loads the machine's own `.env` above, which includes the
 * Trigger.dev secret key. A test must not start real work on the live
 * project: the run consumes the platform's quota and, when no development
 * worker is connected, it stays queued for ever — which then makes the
 * deployed site believe that no runner is available.
 *
 * Everything else the machine's `.env` provides stays, so the suite sees the
 * same model, the same analytics settings and the same behaviour it has
 * always had.
 */
if (process.env.CAREERDEV_TEST_SERVER === 'true') {
  delete process.env.TRIGGER_SECRET_KEY;
  delete process.env.TRIGGER_PROJECT_REF;
  delete process.env.TRIGGER_API_URL;
  // The same goes for the job provider: the suite proves the contract of a
  // server that has no credential, and it must not spend the owner's quota.
  delete process.env.JSEARCH_RAPIDAPI_KEY;
  delete process.env.RAPIDAPI_KEY;
}

const { app } = await import('./app.ts');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

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
