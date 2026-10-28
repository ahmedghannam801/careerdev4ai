/**
 * Measures the latency of the production REST API.
 *
 * The integration suite hit a 300 second header timeout on one request. This
 * measures the same endpoint in isolation, and then in a burst, to show
 * whether the endpoint itself is slow or whether the production connection
 * pool saturates when the suite is hammering it.
 */

const fs = require('node:fs');
const path = require('node:path');

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
const envValue = (name) => {
  const match = env.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
};

const SUPABASE_URL = envValue('SUPABASE_URL');
const SERVICE_ROLE_KEY = envValue('SUPABASE_SERVICE_ROLE_KEY');

async function timed(label, path_, run) {
  const started = Date.now();
  try {
    const result = await run();
    return { label, ms: Date.now() - started, status: result.status, ok: result.ok };
  } catch (error) {
    return { label, ms: Date.now() - started, status: 'ERR', ok: false, error: String(error.message).slice(0, 90) };
  }
}

async function main() {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };

  console.log('--- 12 sequential reads of the heaviest tables ---');
  const reads = [
    ['courses', `${SUPABASE_URL}/rest/v1/courses?select=*`],
    ['course_skills', `${SUPABASE_URL}/rest/v1/course_skills?select=*`],
    ['roadmap_tasks', `${SUPABASE_URL}/rest/v1/roadmap_tasks?select=*`],
    ['user_skills', `${SUPABASE_URL}/rest/v1/user_skills?select=*`],
    ['skills', `${SUPABASE_URL}/rest/v1/skills?select=*`],
    ['profiles', `${SUPABASE_URL}/rest/v1/profiles?select=*`],
  ];

  for (const [label, url] of reads) {
    const result = await timed(label, url, async () => {
      const response = await fetch(url, { headers });
      return { status: response.status, ok: response.ok };
    });
    console.log(
      `  ${String(result.ms).padStart(6)}ms  ${result.status}  ${result.label}` +
        (result.error ? `  ${result.error}` : '')
    );
  }

  console.log('\n--- 12 parallel reads (what the suite looks like) ---');
  const started = Date.now();
  const burst = await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const [label, url] = reads[index % reads.length];
      const at = Date.now();
      try {
        const response = await fetch(url, { headers });
        return { label, ms: Date.now() - at, status: response.status };
      } catch (error) {
        return { label, ms: Date.now() - at, status: 'ERR', error: String(error.message).slice(0, 80) };
      }
    })
  );
  for (const result of burst) {
    console.log(
      `  ${String(result.ms).padStart(6)}ms  ${result.status}  ${result.label}` +
        (result.error ? `  ${result.error}` : '')
    );
  }
  console.log(`  total burst wall clock: ${Date.now() - started}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
