/**
 * Verifies the personalisation schema and its seed data in the live database.
 *
 * Run after applying the migration, to prove the tables exist, the columns
 * are in place and the volunteer catalogue really holds real organisations.
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

const CHECKS = [
  ['new tables', `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN
     ('volunteer_opportunities','volunteer_opportunity_saves','user_guide_dismissals')
     ORDER BY table_name`],
  ['roadmap_tasks new columns', `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='roadmap_tasks'
       AND column_name IN ('difficulty','prerequisites','skill_names','project_titles','resources','priority','rationale')
     ORDER BY column_name`],
  ['roadmaps new columns', `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='roadmaps'
       AND column_name IN ('target_role_id','domain_id','readiness_pct','plan_summary','generated_at')
     ORDER BY column_name`],
  ['roadmap_phases goal', `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='roadmap_phases' AND column_name='goal'`],
  ['volunteer seed count', `SELECT count(*)::int AS opportunities,
       count(*) FILTER (WHERE application_url LIKE 'https://%')::int AS with_https_url,
       count(*) FILTER (WHERE array_length(role_slugs,1) > 0)::int AS with_roles,
       count(DISTINCT organization)::int AS organisations
     FROM public.volunteer_opportunities`],
  ['volunteer categories', `SELECT category, count(*)::int AS n FROM public.volunteer_opportunities
     GROUP BY category ORDER BY n DESC, category`],
  ['volunteer sample', `SELECT id, organization, application_url, array_length(role_slugs,1) AS roles
     FROM public.volunteer_opportunities ORDER BY organization LIMIT 5`],
  ['rls on new tables', `SELECT tablename, policyname FROM pg_policies
     WHERE schemaname='public' AND tablename IN
     ('volunteer_opportunities','volunteer_opportunity_saves','user_guide_dismissals')
     ORDER BY tablename, policyname`],
  ['migration recorded', `SELECT version FROM supabase_migrations.schema_migrations
     WHERE version = '202610270001'`],
  ['catalog integrity', `SELECT
       (SELECT count(*)::int FROM public.courses) AS courses,
       (SELECT count(*)::int FROM public.course_skills) AS course_skills,
       (SELECT count(*)::int FROM public.course_roles) AS course_roles`],
];

async function main() {
  for (const [label, sql] of CHECKS) {
    try {
      const result = await query(sql);
      console.log(`\n--- ${label} ---`);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.log(`\n--- ${label} --- ERROR: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
