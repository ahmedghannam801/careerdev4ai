/** Focused production queries for the synchronisation report. */

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

async function show(label, sql) {
  try {
    const rows = await query(sql);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.log(`\n=== ${label} === ERROR: ${error.message}`);
  }
}

async function main() {
  await show(
    'policies on the volunteer and guide tables',
    `SELECT tablename, policyname, cmd, roles::text,
            coalesce(qual, '') AS using_expr,
            coalesce(with_check, '') AS check_expr
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('volunteer_opportunities','volunteer_opportunity_saves','user_guide_dismissals')
       ORDER BY tablename, policyname`
  );

  await show(
    'orphan check across the whole graph',
    `SELECT
       (SELECT count(*) FROM public.roadmap_phases p LEFT JOIN public.roadmaps r ON r.id = p.roadmap_id
         WHERE r.id IS NULL) AS phases_without_roadmap,
       (SELECT count(*) FROM public.roadmap_milestones m LEFT JOIN public.roadmap_phases p ON p.id = m.phase_id
         WHERE p.id IS NULL) AS milestones_without_phase,
       (SELECT count(*) FROM public.roadmap_tasks t LEFT JOIN public.roadmap_milestones m ON m.id = t.milestone_id
         WHERE m.id IS NULL) AS tasks_without_milestone,
       (SELECT count(*) FROM public.roadmaps r LEFT JOIN public.profiles p ON p.id = r.profile_id
         WHERE p.id IS NULL) AS roadmaps_without_profile,
       (SELECT count(*) FROM public.user_skills us LEFT JOIN public.profiles p ON p.id = us.user_id
         WHERE p.id IS NULL) AS user_skills_without_profile,
       (SELECT count(*) FROM public.user_skills us LEFT JOIN public.skills s ON s.id = us.skill_id
         WHERE s.id IS NULL) AS user_skills_without_skill,
       (SELECT count(*) FROM public.volunteer_experiences v LEFT JOIN public.profiles p ON p.id = v.profile_id
         WHERE p.id IS NULL) AS volunteer_without_profile,
       (SELECT count(*) FROM public.volunteer_opportunity_saves s
         LEFT JOIN public.volunteer_opportunities o ON o.id = s.opportunity_id
         WHERE o.id IS NULL) AS saves_without_opportunity,
       (SELECT count(*) FROM public.user_guide_dismissals g LEFT JOIN public.profiles p ON p.id = g.profile_id
         WHERE p.id IS NULL) AS guide_dismissals_without_profile,
       (SELECT count(*) FROM public.user_learning_items li
         LEFT JOIN public.courses c ON c.id = li.course_id WHERE c.id IS NULL) AS learning_items_without_course`
  );

  await show(
    'roadmap rows and the new columns actually populated',
    `SELECT
       (SELECT count(*) FROM public.roadmaps) AS roadmaps,
       (SELECT count(*) FROM public.roadmaps WHERE target_role_id IS NOT NULL) AS with_target_role_id,
       (SELECT count(*) FROM public.roadmaps WHERE domain_id IS NOT NULL) AS with_domain_id,
       (SELECT count(*) FROM public.roadmaps WHERE readiness_pct IS NOT NULL) AS with_readiness,
       (SELECT count(*) FROM public.roadmap_phases) AS phases,
       (SELECT count(*) FROM public.roadmap_phases WHERE goal IS NOT NULL AND btrim(goal) <> '') AS phases_with_goal,
       (SELECT count(*) FROM public.roadmap_tasks) AS tasks,
       (SELECT count(*) FROM public.roadmap_tasks WHERE difficulty IS NOT NULL) AS tasks_with_difficulty,
       (SELECT count(*) FROM public.roadmap_tasks WHERE priority IS NOT NULL) AS tasks_with_priority,
       (SELECT count(*) FROM public.roadmap_tasks WHERE rationale IS NOT NULL) AS tasks_with_rationale,
       (SELECT count(*) FROM public.roadmap_tasks WHERE array_length(skill_names, 1) > 0) AS tasks_with_skills,
       (SELECT count(*) FROM public.roadmap_tasks WHERE array_length(project_titles, 1) > 0) AS tasks_with_projects,
       (SELECT count(*) FROM public.roadmap_tasks WHERE jsonb_array_length(resources) > 0) AS tasks_with_resources,
       (SELECT count(*) FROM public.roadmap_tasks WHERE array_length(prerequisites, 1) > 0) AS tasks_with_prerequisites`
  );

  await show(
    'roadmaps whose target_role_id is not a catalogue role',
    `SELECT r.id, r.target_role_id, r.target_role_title
       FROM public.roadmaps r
      WHERE r.target_role_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.skills s WHERE false)
      LIMIT 20`
  );

  await show(
    'the distinct target roles recorded on production roadmaps',
    `SELECT target_role_id, target_role_title, domain_id, count(*) AS roadmaps,
            min(readiness_pct) AS min_readiness, max(readiness_pct) AS max_readiness
       FROM public.roadmaps
       GROUP BY target_role_id, target_role_title, domain_id
       ORDER BY roadmaps DESC, target_role_id`
  );

  await show(
    'user data present, so the gap engine has real inputs',
    `SELECT
       (SELECT count(*) FROM public.profiles) AS profiles,
       (SELECT count(*) FROM public.profiles WHERE target_role IS NOT NULL) AS with_target_role,
       (SELECT count(*) FROM public.user_skills) AS user_skill_rows,
       (SELECT count(DISTINCT user_id) FROM public.user_skills) AS users_with_skills,
       (SELECT count(*) FROM public.user_learning_items) AS learning_items,
       (SELECT count(*) FROM public.volunteer_experiences) AS volunteer_experiences,
       (SELECT count(*) FROM public.projects) AS projects,
       (SELECT count(*) FROM public.user_preferences) AS preferences_rows,
       (SELECT count(*) FROM public.user_preferences WHERE language IN ('en','ar')) AS preferences_with_language`
  );

  await show(
    'duplicate protection',
    `SELECT
       (SELECT count(*) FROM (SELECT profile_id FROM public.roadmaps GROUP BY profile_id HAVING count(*) > 1) x)
         AS users_with_multiple_roadmaps,
       (SELECT count(*) FROM (SELECT user_id, skill_id FROM public.user_skills GROUP BY 1,2 HAVING count(*) > 1) y)
         AS duplicate_user_skills,
       (SELECT count(*) FROM (SELECT profile_id, opportunity_id FROM public.volunteer_opportunity_saves GROUP BY 1,2 HAVING count(*) > 1) z)
         AS duplicate_saves,
       (SELECT count(*) FROM (SELECT lower(btrim(name)) FROM public.skills GROUP BY 1 HAVING count(*) > 1) w)
         AS duplicate_skill_names,
       (SELECT count(*) FROM (SELECT id FROM public.courses GROUP BY id HAVING count(*) > 1) v)
         AS duplicate_course_ids,
       (SELECT count(*) FROM (SELECT organization, title FROM public.volunteer_opportunities GROUP BY 1,2 HAVING count(*) > 1) u)
         AS duplicate_volunteer_rows`
  );

  await show(
    'course integrity and providers',
    `SELECT
       (SELECT count(*) FROM public.courses) AS courses,
       (SELECT count(*) FROM public.courses WHERE url IS NULL OR btrim(url) = '') AS courses_without_url,
       (SELECT count(*) FROM public.course_skills cs LEFT JOIN public.courses c ON c.id = cs.course_id
         WHERE c.id IS NULL) AS course_skills_without_course,
       (SELECT count(*) FROM public.course_roles cr LEFT JOIN public.courses c ON c.id = cr.course_id
         WHERE c.id IS NULL) AS course_roles_without_course,
       (SELECT count(*) FROM public.course_skills WHERE skill_id IS NULL) AS course_skills_unlinked,
       (SELECT count(DISTINCT provider) FROM public.courses) AS distinct_providers`
  );

  await show(
    'a sample of the real course catalogue',
    `SELECT id, title, provider, url, is_verified
       FROM public.courses ORDER BY provider, title LIMIT 10`
  );

  await show(
    'a sample of the volunteer catalogue',
    `SELECT id, organization, title, application_url, array_length(role_slugs, 1) AS role_tags
       FROM public.volunteer_opportunities ORDER BY organization LIMIT 10`
  );

  await show(
    'tables without row level security (a leak risk)',
    `SELECT c.relname AS table_name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY c.relname`
  );

  await show(
    'grants to anon and authenticated on the public tables',
    `SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
       FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon','authenticated')
        AND table_name IN ('volunteer_opportunities','courses','skills','roadmaps','user_guide_dismissals')
      GROUP BY table_name, grantee
      ORDER BY table_name, grantee`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
