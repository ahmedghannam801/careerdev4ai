/**
 * `supports-color` replacement for the Cloudflare Worker bundle.
 *
 * `debug` (used by Express and its middleware) requires `supports-color` to
 * decide whether to emit ANSI escapes. The real package imports
 * `node:process`, `node:os` and `node:tty` at load time. The Workers runtime
 * exposes `process` as a global but not as a require()-able module, so the
 * dynamic require throws "No such module: node:process" during startup.
 *
 * Terminals do not exist in Workers and coloured logs are useless there, so a
 * plain "no colour support" module is the correct implementation.
 */
module.exports = { stdout: false, stderr: false };
