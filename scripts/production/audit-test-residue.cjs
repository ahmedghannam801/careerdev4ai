/**
 * Reports how much of the production data belongs to test accounts.
 *
 * The integration suite creates users with a `cp-test-...@example.invalid`
 * address and removes them afterwards. An interrupted run can leave rows
 * behind, so this counts what is left and what is genuinely a user's data.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const TOKEN_FILE = path.join(os.tmpdir(), 'careerpilot-supabase-token.txt');

async function query(sql) {
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body);
}

async function main() {
  const users = await query(`
    SELECT u.id::text, u.email,
           (SELECT count(*) FROM public.roadmaps r WHERE r.profile_id = u.id) AS roadmaps,
           (SELECT count(*) FROM public.user_skills s WHERE s.user_id = u.id) AS skills,
           (SELECT count(*) FROM public.profiles p WHERE p.id = u.id) AS profile
      FROM auth.users u
     ORDER BY u.created_at
  `);

  const test = users.filter((u) => u.email?.startsWith('cp-test-'));
  const real = users.filter((u) => !u.email?.startsWith('cp-test-'));

  console.log(`auth users: ${users.length}  (test: ${test.length}, non-test: ${real.length})`);

  console.log('\n--- non-test accounts ---');
  for (const user of real) {
    console.log(
      `  ${user.email}  profile=${user.profile} roadmaps=${user.roadmaps} skills=${user.skills}`
    );
  }

  console.log('\n--- test accounts still present ---');
  for (const user of test) {
    console.log(
      `  ${user.email}  profile=${user.profile} roadmaps=${user.roadmaps} skills=${user.skills}`
    );
  }

  const orphanProfiles = await query(`
    SELECT count(*)::int AS profiles_without_auth_user
      FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  `);
  console.log('\nprofiles with no auth user:', JSON.stringify(orphanProfiles));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
