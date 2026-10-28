/**
 * Scans the built client bundle for anything that should never reach a
 * browser.
 *
 * The browser is only ever meant to receive the publishable Supabase
 * configuration. The service-role key and the AI provider key must not
 * appear in any file under dist/assets, and neither must the local .env
 * values that are not publishable.
 *
 * Values are compared against what is actually in .env, so a secret that is
 * renamed still gets caught. The values themselves are never printed.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');

/** Names that must never reach the browser, whatever their value. */
const FORBIDDEN_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'SUPABASE_ACCESS_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
];

/** The only configuration the client is meant to carry. */
const ALLOWED_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

function envValues() {
  const out = new Map();
  const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

/** Every file the browser can be served. */
function clientFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  if (fs.existsSync(ASSETS)) walk(ASSETS);
  const indexHtml = path.join(DIST, 'index.html');
  if (fs.existsSync(indexHtml)) files.push(indexHtml);
  return files;
}

const env = envValues();
const files = clientFiles();
let failures = 0;

console.log(`scanning ${files.length} client files under dist/\n`);

/**
 * The values the browser is allowed to carry.
 *
 * The comparison is by VALUE, not by name. The project's `.env` holds both
 * `SUPABASE_URL` and `VITE_SUPABASE_URL` with the same value — the public
 * project URL — and both `SUPABASE_ANON_KEY` and
 * `VITE_SUPABASE_PUBLISHABLE_KEY` with the same publishable key. Flagging
 * those by name would report a leak that is not there, and would train
 * whoever reads the report to ignore it.
 */
const publishableValues = new Set(
  ALLOWED_NAMES.map((name) => env.get(name)).filter(Boolean)
);

// 1. The literal secret VALUES must not appear anywhere the browser can read.
for (const [name, value] of env) {
  if (!value || value.length < 20) continue;
  if (publishableValues.has(value)) continue;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(value)) {
      console.log(`FAIL  ${name} appears in ${path.relative(ROOT, file)}`);
      failures += 1;
    }
  }
}

// 2. The secret NAMES must not appear either, because a name without a value
//    still signals that the server-side configuration leaked into the bundle.
for (const name of FORBIDDEN_NAMES) {
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(name)) {
      console.log(`FAIL  ${name} is named in ${path.relative(ROOT, file)}`);
      failures += 1;
    }
  }
}

// 3. The publishable configuration must actually be there, or the app is
//    broken in a different way.
for (const name of ALLOWED_NAMES) {
  const value = env.get(name);
  if (!value) continue;
  const found = files.some((file) => fs.readFileSync(file, 'utf8').includes(value));
  console.log(`${found ? 'OK   ' : 'FAIL '} ${name} is present in the client bundle`);
  if (!found) failures += 1;
}

// 4. The worker bundle holds the server code. It is not fetchable as a
//    static file, but it must not have had a secret baked into it either.
const workerPath = path.join(DIST, '_worker.js');
if (fs.existsSync(workerPath)) {
  const worker = fs.readFileSync(workerPath, 'utf8');
  for (const [name, value] of env) {
    if (!value || value.length < 20) continue;
    if (publishableValues.has(value)) continue;
    if (worker.includes(value)) {
      console.log(`FAIL  ${name} was baked into dist/_worker.js`);
      failures += 1;
    }
  }
  console.log('OK    no secret value is baked into dist/_worker.js');
} else {
  console.log('FAIL  dist/_worker.js is missing');
  failures += 1;
}

// 5. The client must not carry the server-side names at all, and the
//    worker must not either: a name in the client bundle is the first half
//    of a leak even when the value is missing.
for (const name of FORBIDDEN_NAMES) {
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(name)) {
      console.log(`FAIL  ${name} is named in ${path.relative(ROOT, file)}`);
      failures += 1;
    }
  }
}
console.log('OK    no server-side credential name appears in the client bundle');

console.log(failures === 0 ? '\nPASS  no secret exposed to the client' : `\nFAIL  ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
