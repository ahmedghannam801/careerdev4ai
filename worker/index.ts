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
 *      The public SEO pages (`/about`, `/careers`, `/learning`,
 *      `/opportunities`), the legal documents (`/privacy`, `/terms`), the
 *      sitemap and `robots.txt` are forwarded the same way: they are
 *      server-rendered from live catalogue data, so they must not be a
 *      build-time snapshot of the asset binding.
 *
 *   2. Serve everything else from the Pages static asset binding, falling back
 *      to `index.html` for client-side routes. The SPA uses hash routing
 *      (`/#/dashboard`), so this fallback is only a safety net for stray
 *      path-based links; real asset requests must still 404 rather than
 *      returning HTML.
 *
 *   3. Serve the IndexNow key file, which the protocol requires to be
 *      fetchable at `<host>/<key>.txt`.
 *
 * `dist/_worker.js` is produced by `scripts/build-worker.mjs`, which bundles
 * this file with esbuild and leaves `node:*` / `cloudflare:*` external so the
 * runtime's own implementations are used.
 */
import { handleAsNodeRequest } from 'cloudflare:node';
import { app } from '../app.ts';
import { indexNowKey, indexNowKeyPath } from '../server/seo/indexnow.ts';
import { VERIFICATION_PATH } from '../server/seo/verification.ts';
import { CloudflareQueueProducer, setJobQueueProducer } from '../server/jobs/queue.ts';

/** Routing key for the Node HTTP server registered below (not a TCP port). */
const NODE_PORT = 3000;

// Register the Express application once per isolate. `listen` does not open a
// socket in Workers; it adds the server to the runtime's internal routing table
// so `handleAsNodeRequest` can dispatch to it.
app.listen(NODE_PORT);

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface QueueBinding {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

interface Env {
  ASSETS: AssetBinding;
  /**
   * The background-job queue.
   *
   * A Pages project can publish to a queue; it cannot consume one. The
   * consuming side is the background-job Worker, which is a separate
   * deployment. This binding is what the API hands a job to.
   */
  JOB_QUEUE?: QueueBinding;
  [key: string]: unknown;
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * The public pages, the sitemap and robots.txt.
 *
 * These are server-rendered by the shared Express application, so the local
 * server, the test suite and this worker answer identically. They are
 * forwarded here rather than served from the static asset binding, because
 * they are built from live catalogue data and must not be a build-time
 * snapshot.
 */
const PUBLIC_PAGE_PREFIXES = ['/careers', '/learning', '/opportunities'] as const;

function isSeoPath(pathname: string): boolean {
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') return true;
  // The legal and policy documents are server-rendered like every other
  // public page. The published Terms must be reachable at their own address:
  // a request that falls through to the asset binding would answer with the
  // SPA shell instead of the document.
  if (pathname === '/about' || pathname === '/privacy' || pathname === '/terms') return true;
  // The asset binding answers the `.html` path of the verification file with
  // a permanent redirect. Google asks for that exact path, so the request is
  // answered by the application instead.
  if (pathname === VERIFICATION_PATH) return true;
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
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

    // The queue this deployment publishes to. It is registered before the
    // request is handled, because the API asks for it when a job is started.
    // A deployment without the binding simply has no queue: the API then
    // refuses new background work with a reason instead of accepting a job
    // that nothing would ever carry out.
    setJobQueueProducer(env.JOB_QUEUE ? new CloudflareQueueProducer(env.JOB_QUEUE) : null);

    const url = new URL(request.url);

    // The IndexNow key file. The protocol requires it to be fetchable at
    // `<host>/<key>.txt` and to contain exactly the key, so it is served
    // here rather than from the asset binding.
    const keyPath = indexNowKeyPath();
    if (keyPath && url.pathname === keyPath) {
      return new Response(indexNowKey() ?? '', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    if (isApiPath(url.pathname) || isSeoPath(url.pathname)) {
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
