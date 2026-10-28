/**
 * Removes the temporary smoke-test accounts from Supabase Production.
 *
 * The smoke test creates a `cp-smoke-...@example.invalid` account so it can
 * exercise the real signup and login path. It removes the account again
 * afterwards, but a run that is interrupted can leave one behind, and an
 * account in production is not something to leave lying around.
 *
 * The account id is found through the Management API and the account itself
 * is deleted through the Auth admin API, so the cascade that removes the
 * profile, the roadmap and the skills all runs.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const ROOT = path.join(__dirname, '..', '..');

function envValue(name) {
  const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

const SUPABASE_URL = envValue('SUPABASE_URL');
const SERVICE_ROLE_KEY = envValue('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_FILE = path.join(os.tmpdir(), 'careerpilot-supabase-token.txt');

async function managementQuery(sql) {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function deleteAuthUser(id) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  return response.status;
}

async function main() {
  const rows = await managementQuery(`
    SELECT u.id::text, u.email, u.created_at
      FROM auth.users u
     WHERE u.email LIKE 'cp-smoke-%@example.invalid'
        OR u.email LIKE 'cp-test-%@example.invalid'
     ORDER BY u.created_at
  `);

  if (!rows.length) {
    console.log('no smoke-test or suite-test accounts remain');
    return 0;
  }

  console.log(`found ${rows.length} temporary account(s):`);
  for (const row of rows) {
    console.log(`  ${row.email}  (${row.id})  created ${row.created_at}`);
  }

  let removed = 0;
  for (const row of rows) {
    const status = await deleteAuthUser(row.id);
    console.log(`  delete ${row.email} -> ${status}`);
    if (status === 200 || status === 204) removed += 1;
  }

  const after = await managementQuery(`
    SELECT count(*)::int AS remaining
      FROM auth.users u
     WHERE u.email LIKE 'cp-smoke-%@example.invalid'
        OR u.email LIKE 'cp-test-%@example.invalid'
  `);
  console.log(`\nremoved ${removed}; remaining: ${after[0].remaining}`);
  return 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
