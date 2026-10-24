/**
 * Cloudflare Pages *advanced mode* entry point.
 *
 * Pages serves `dist/` as the build output. Because `dist/_worker.js` exists,
 * Pages routes every request through this module instead of the automatic
 * static handler, so this file has to do two jobs:
 *
 *   1. Forward `/api/*` to the Express application defined in `app.ts`. The
 *      Workers runtime implements `node:http` (including `http.createServer`)
 *      when the `nodejs_compat` flag is on, and `handleAsNodeRequest` bridges
 *      a Worker `Request` into that Node server. The Express app therefore runs
 *      exactly as it does under `npm run dev` / `npm start` / the test suite.
 *
 *   2. Serve everything else from the Pages static asset binding, falling back
 *      to `index.html` for client-side routes. The SPA uses hash routing
 *      (`/#/dashboard`), so this fallback is only a safety net for stray
 *      path-based links; real asset requests must still 404 rather than
 *      returning HTML.
 *
 * `dist/_worker.js` is produced by `scripts/build-worker.mjs`, which bundles
 * this file with esbuild and leaves `node:*` / `cloudflare:*` external so the
 * runtime's own implementations are used.
 */
import { handleAsNodeRequest } from 'cloudflare:node';
import { app } from '../app.ts';

/** Routing key for the Node HTTP server registered below (not a TCP port). */
const NODE_PORT = 3000;

// Register the Express application once per isolate. `listen` does not open a
// socket in Workers; it adds the server to the runtime's internal routing table
// so `handleAsNodeRequest` can dispatch to it.
app.listen(NODE_PORT);

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
  [key: string]: unknown;
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * A request is treated as a navigation (and therefore eligible for the SPA
 * fallback) only when the browser explicitly asks for HTML and the path has no
 * file extension. This keeps missing assets, source maps and API paths honest.
 */
function isNavigationRequest(request: Request, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html') || accept === '*/*';
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

/**
 * Pages' local asset server can answer a missing file with the SPA shell and a
 * 200. Real static assets must not do that, so a request that clearly targets a
 * file (has an extension) and receives HTML is converted into a 404.
 */
function isAssetShapedPath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env && typeof env === 'object') {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && process.env[key] !== value) {
          process.env[key] = value;
        }
      }
    }

    const url = new URL(request.url);

    if (isApiPath(url.pathname)) {
      return handleAsNodeRequest(NODE_PORT, request);
    }

    const response = await env.ASSETS.fetch(request);

    if (
      isAssetShapedPath(url.pathname) &&
      !isNavigationRequest(request, url.pathname) &&
      isHtmlResponse(response)
    ) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (response.status !== 404 || !isNavigationRequest(request, url.pathname)) {
      return response;
    }

    // Serve the SPA shell for unknown client-side routes, preserving the
    // original response status semantics (200 for the shell itself).
    const shellUrl = new URL('/index.html', url);
    const shellRequest = new Request(shellUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });
    return env.ASSETS.fetch(shellRequest);
  },
};
