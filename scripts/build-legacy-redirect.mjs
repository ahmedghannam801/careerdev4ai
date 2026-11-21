/**
 * Builds the redirect-only deployment for the predecessor origin.
 *
 * The platform moved from `careerdev4ai.pages.dev` to `aionvia.pages.dev`.
 * Once the new origin is verified in production, the old one becomes a
 * permanent pointer to it: every request is answered with a 301 to the
 * equivalent path on the new origin.
 *
 * The build contains no `_worker.js`, so the predecessor project serves static
 * assets and the `_redirects` rule applies. It also means the predecessor
 * stops serving the API itself — every API path is redirected to the new
 * origin, where the same API is live.
 *
 * The `:splat` placeholder carries the path over, and a query string is
 * passed through by Pages automatically, so a deep link keeps working. A
 * URL *fragment* is never sent to a server and cannot be carried by a
 * redirect; the browser inherits it, which is what a Supabase recovery link
 * (whose token travels in the fragment) needs.
 *
 * Usage:
 *   node scripts/build-legacy-redirect.mjs [targetDirectory]
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(ROOT, process.argv[2] ?? 'dist-legacy-redirect');
const NEW_ORIGIN = 'https://aionvia.pages.dev';

const REDIRECTS = `# The predecessor origin.
#
# Every request is redirected permanently to the same path on the current
# production origin. The platform moved; the address did not change meaning.
/*  ${NEW_ORIGIN}/:splat  301
`;

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aionvia</title>
    <meta http-equiv="refresh" content="0; url=${NEW_ORIGIN}/" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href="${NEW_ORIGIN}/" />
  </head>
  <body>
    <p>This address has moved to <a href="${NEW_ORIGIN}/">${NEW_ORIGIN}</a>.</p>
  </body>
</html>
`;

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
await writeFile(path.join(TARGET, '_redirects'), REDIRECTS, 'utf8');
await writeFile(path.join(TARGET, 'index.html'), INDEX, 'utf8');

console.log(`Built the redirect deployment in ${path.relative(ROOT, TARGET)}/`);
console.log(`  target: ${NEW_ORIGIN}`);
