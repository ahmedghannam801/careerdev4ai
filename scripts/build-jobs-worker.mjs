/**
 * Bundles the background-job Worker.
 *
 * The Pages worker and this worker share the same server modules, but they are
 * deployed separately and they are not the same program:
 *
 *   - `scripts/build-worker.mjs` produces `dist/_worker.js` for Pages. It
 *     carries the whole Express application and the public site.
 *   - this script produces `dist-jobs/worker.js` for the queue Worker. It
 *     carries only the consumer, the cron sweep and the health endpoint, so
 *     the public site is not deployed twice and the worker stays small.
 *
 * `node:*` and `cloudflare:*` stay external on purpose: the runtime provides
 * them. Everything else is bundled from `node_modules` exactly like a normal
 * Worker build.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(rootDir, 'dist-jobs');
const outfile = path.join(outdir, 'worker.js');

fs.mkdirSync(outdir, { recursive: true });

await build({
  absWorkingDir: rootDir,
  entryPoints: [path.join(rootDir, 'worker', 'jobs', 'index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  // Keep the runtime's own Node/Cloudflare built-ins.
  external: ['node:*', 'cloudflare:*'],
  // The same shims the Pages worker uses. The queue Worker does not serve
  // HTML, but it pulls in the same server modules, and those reach Express
  // helpers that need them.
  alias: {
    'iconv-lite': path.join(rootDir, 'server', 'shims', 'iconv-lite.cjs'),
    'supports-color': path.join(rootDir, 'server', 'shims', 'supports-color.cjs'),
  },
  minify: true,
  legalComments: 'none',
  banner: {
    js: [
      "import { createRequire as __careerpilotCreateRequire } from 'node:module';",
      "const require = __careerpilotCreateRequire('/worker.js');",
    ].join('\n'),
  },
  logLevel: 'warning',
});

const { size } = fs.statSync(outfile);
console.log(
  `[build-jobs-worker] wrote ${path.relative(rootDir, outfile)} (${(size / 1024 / 1024).toFixed(2)} MiB)`,
);
