import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const assetsDir = join(root, 'dist', 'assets');
const chunkNames = new Set([
  'index',
  'vendor-other',
  'vendor-animation',
  'vendor-motion',
  'CVStudioView',
  'AdminCenterView',
]);

let files;
try {
  files = await readdir(assetsDir);
} catch {
  throw new Error('No dist/assets directory. Run `npx vite build --sourcemap` first.');
}

const maps = files.filter((file) => file.endsWith('.js.map'));
const selected = maps.filter((file) =>
  [...chunkNames].some((name) => file.startsWith(`${name}-`))
);
if (selected.length !== chunkNames.size) {
  throw new Error('Expected one sourcemap for each target chunk; rebuild with `npx vite build --sourcemap`.');
}

for (const file of selected.sort()) {
  const map = JSON.parse(await readFile(join(assetsDir, file), 'utf8'));
  const modules = map.sources.map((source, index) => ({
    source,
    rawBytes: Buffer.byteLength(map.sourcesContent?.[index] ?? ''),
  })).sort((a, b) => b.rawBytes - a.rawBytes).slice(0, 10);
  console.log(`\n${file.replace(/\.js\.map$/, '')}`);
  console.log('Largest source modules by original (unminified) source bytes; not emitted chunk attribution:');
  for (const { source, rawBytes } of modules) {
    console.log(`${(rawBytes / 1024).toFixed(1).padStart(7)} KB  ${source}`);
  }
}
