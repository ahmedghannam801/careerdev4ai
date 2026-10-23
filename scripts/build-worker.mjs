/**
 * Bundles the Cloudflare Pages advanced-mode worker.
 *
 * Cloudflare Pages has two ways to run server code:
 *
 *   - `functions/` — the standard Functions bundler. It substitutes Node
 *     built-ins with `unenv` polyfills, whose `node:http` throws
 *     "http.createServer is not implemented yet!". Express cannot run that way.
 *
 *   - `dist/_worker.js` — advanced mode. Pages deploys this file as a normal
 *     Workers module, so the runtime's real `node:http` (enabled by the
 *     `nodejs_compat` flag) is used instead of `unenv`.
 *
 * This script produces the second. `node:*` and `cloudflare:*` stay external on
 * purpose: the runtime provides them. Everything else is bundled from
 * `node_modules` exactly like a normal Worker build.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(rootDir, 'dist');
const outfile = path.join(outdir, '_worker.js');

if (!fs.existsSync(path.join(outdir, 'index.html'))) {
  console.error(
    '[build-worker] dist/index.html is missing. Run `vite build` first.',
  );
  process.exit(1);
}

await build({
  absWorkingDir: rootDir,
  entryPoints: [path.join(rootDir, 'worker', 'index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  // Keep the SPA's own runtime out of the server bundle and let the runtime
  // supply Node/Cloudflare built-ins.
  external: ['node:*', 'cloudflare:*'],
  // body-parser (pulled in by Express internals) depends on iconv-lite, whose
  // `browser` mapping breaks under the Workers bundler. The API only ever
  // handles UTF-8, so the shim is a drop-in replacement.
  alias: {
    'iconv-lite': path.join(rootDir, 'server', 'shims', 'iconv-lite.cjs'),
    // `debug` → `supports-color` requires node:process, which the Workers
    // runtime does not expose through require(). ANSI colour is meaningless in
    // a Worker, so a no-op implementation is used.
    'supports-color': path.join(rootDir, 'server', 'shims', 'supports-color.cjs'),
  },
  minify: true,
  legalComments: 'none',
  // Express and its CommonJS dependencies call `require("path")` and friends at
  // runtime. esbuild's ESM output cannot resolve those on its own, so provide a
  // real `require` backed by the runtime's `node:module` implementation. Only
  // built-ins are resolvable this way, which is all these calls need.
  banner: {
    js: [
      "import { createRequire as __careerpilotCreateRequire } from 'node:module';",
      // `import.meta.url` is not populated for Pages' bundled `_worker.js`, so a
      // stable absolute path is used. Only built-in specifiers are resolved, and
      // those do not depend on the referrer path.
      "const require = __careerpilotCreateRequire('/_worker.js');",
    ].join('\n'),
  },
  logLevel: 'warning',
});

const { size } = fs.statSync(outfile);
console.log(
  `[build-worker] wrote ${path.relative(rootDir, outfile)} (${(size / 1024 / 1024).toFixed(2)} MiB)`,
);
