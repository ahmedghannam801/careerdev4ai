/**
 * Minimal typings for the `cloudflare:node` runtime module.
 *
 * `@cloudflare/workers-types` is not a dependency of this project (the frontend
 * is a Vite SPA and the API is Express), so the one import the Pages worker
 * needs is declared here instead of pulling in the full Workers type package.
 * Keep this in sync with:
 * https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
 */
declare module 'cloudflare:node' {
  /**
   * Routes a Worker `Request` to the Node.js HTTP server registered with
   * `server.listen(port)` in the same isolate. `port` is a routing key, not a
   * real TCP port.
   */
  export function handleAsNodeRequest(
    port: number,
    request: Request,
  ): Promise<Response>;

  export function httpServerHandler(
    options: number | { port: number },
  ): { fetch(request: Request): Promise<Response> };
}
