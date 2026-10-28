/**
 * A full inspection of Supabase Production.
 *
 * Everything here is a read. It answers the questions the synchronisation
 * brief asks: what the schema is, what the data is, whether the constraints
 * and policies are in place, and whether anything is orphaned.
 *
 * The access token is read from the file written by
 * scripts/read-db-credential.ps1 and never from the repository.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const TOKEN_FILE = path.join(os.tmpdir(), 'careerpilot-supabase-token.txt');

let token = '';
function auth() {
  if (!token) token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  return token;
}

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 800)}`);
  }
  return JSON.parse(body);
}

async function show(label, sql) {
  try {
    const rows = await query(sql);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(rows, null, 2));
    return rows;
  } catch (error) {
    console.log(`\n=== ${label} === ERROR: ${error.message}`);
    return [];
  }
}

async function main() {
  // ---- 1. Schema --------------------------------------------------------
  await show(
    'every table in public, with its row count and RLS state',
    `SELECT c.relname AS table_name,
            c.relrowsecurity AS rls_enabled,
            c.relforcerowsecurity AS rls_forced,
            (SELECT count(*) FROM pg_class x
              WHERE x.relname = c.relname AND x.relnamespace = 'public'::regnamespace) AS present
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`
  );

  await show(
    'row counts for every public table',
    `SELECT schemaname, relname AS table_name, n_live_tup AS rows
       FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY n_live_tup DESC, relname`
  );

  await show(
    'columns of the tables this change touches',
    `SELECT table_name, ordinal_position, column_name, data_type,
            is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN (
           'roadmaps','roadmap_phases','roadmap_milestones','roadmap_tasks',
           'volunteer_opportunities','volunteer_opportunity_saves',
           'user_guide_dismissals','volunteer_experiences','volunteer_projects',
           'courses','course_skills','course_roles','user_learning_items',
           'skills','user_skills','projects','profiles','user_preferences')
       ORDER BY table_name, ordinal_position`
  );

  await show(
    'check constraints on the roadmap tables',
    `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND contype = 'c'
         AND conrelid::regclass::text IN
           ('roadmaps','roadmap_phases','roadmap_milestones','roadmap_tasks',
            'volunteer_opportunities','volunteer_opportunity_saves','user_guide_dismissals')
       ORDER BY table_name, conname`
  );

  await show(
    'foreign keys on the tables this change touches',
    `SELECT conrelid::regclass::text AS table_name, conname,
            pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND contype = 'f'
         AND conrelid::regclass::text IN
           ('roadmap_phases','roadmap_milestones','roadmap_tasks',
            'volunteer_experiences','volunteer_projects',
            'volunteer_opportunity_saves','user_guide_dismissals')
       ORDER BY table_name, conname`
  );

  await show(
    'indexes on the new and changed tables',
    `SELECT tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('roadmaps','roadmap_phases','roadmap_milestones','roadmap_tasks',
                           'volunteer_opportunities','volunteer_opportunity_saves',
                           'user_guide_dismissals')
       ORDER BY tablename, indexname`
  );

  await show(
    'RLS policies on the new and changed tables',
    `SELECT tablename, policyname, permissive, roles::text, cmd, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('roadmaps','roadmap_phases','roadmap_milestones','roadmap_tasks',
                           'volunteer_opportunities','volunteer_opportunity_saves',
                           'user_guide_dismissals','volunteer_experiences','volunteer_projects')
       ORDER BY tablename, policyname`
  );

  await show(
    'functions and their execution grants',
    `SELECT p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS args,
            p.prosecdef AS security_definer,
            p.proconfig AS search_path,
            COALESCE(array_to_string(p.proacl, ' | '), '(default)') AS acl
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
       ORDER BY p.proname`
  );

  await show(
    'triggers',
    `SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`
  );

  // ---- 2. Data ----------------------------------------------------------
  await show(
    'volunteer opportunity catalogue, by organisation',
    `SELECT organization, count(*) AS rows, count(DISTINCT application_url) AS distinct_urls,
            count(*) FILTER (WHERE array_length(role_slugs, 1) > 0) AS tagged_with_roles,
            count(*) FILTER (WHERE application_url LIKE 'https://%') AS https_links,
            count(*) FILTER (WHERE is_active) AS active
       FROM public.volunteer_opportunities
       GROUP BY organization ORDER BY organization`
  );

  await show(
    'volunteer categories',
    `SELECT category, count(*) AS rows FROM public.volunteer_opportunities
       GROUP BY category ORDER BY rows DESC, category`
  );

  await show(
    'duplicate check: volunteer opportunities',
    `SELECT count(*) AS total_rows,
            count(DISTINCT id) AS distinct_ids,
            count(DISTINCT organization || '|' || title) AS distinct_org_title,
            count(DISTINCT application_url) AS distinct_urls
       FROM public.volunteer_opportunities`
  );

  await show(
    'duplicate check: courses, skills, course skills, course roles',
    `SELECT
       (SELECT count(*) FROM public.courses) AS courses,
       (SELECT count(DISTINCT id) FROM public.courses) AS course_ids,
       (SELECT count(*) FROM public.courses WHERE url IS NULL OR btrim(url) = '') AS courses_without_url,
       (SELECT count(*) FROM public.skills) AS skills,
       (SELECT count(DISTINCT lower(btrim(name))) FROM public.skills) AS distinct_skill_names,
       (SELECT count(*) FROM public.course_skills) AS course_skills,
       (SELECT count(*) FROM public.course_roles) AS course_roles`
  );

  await show(
    'course providers (the real organisations behind the catalogue)',
    `SELECT provider, count(*) AS courses FROM public.courses
       GROUP BY provider ORDER BY courses DESC, provider`
  );

  await show(
    'course integrity: every course_skill and course_role points at a real row',
    `SELECT
       (SELECT count(*) FROM public.course_skills cs LEFT JOIN public.courses c ON c.id = cs.course_id
         WHERE c.id IS NULL) AS course_skills_without_course,
       (SELECT count(*) FROM public.course_roles cr LEFT JOIN public.courses c ON c.id = cr.course_id
         WHERE c.id IS NULL) AS course_roles_without_course,
       (SELECT count(*) FROM public.course_skills cs LEFT JOIN public.skills s ON s.id = cs.skill_id
         WHERE s.id IS NULL AND cs.skill_id IS NOT NULL) AS course_skills_without_skill_row,
       (SELECT count(*) FROM public.course_skills WHERE skill_id IS NULL) AS course_skills_unlinked`
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
         WHERE p.id IS NULL) AS guide_dismissals_without_profile`
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
    'the target role recorded on each roadmap (must be a real catalogue role)',
    `SELECT r.target_role_id, r.target_role_title, r.domain_id, r.readiness_pct,
            (SELECT count(*) FROM public.roadmap_phases p WHERE p.roadmap_id = r.id) AS phases
       FROM public.roadmaps r ORDER BY r.created_at DESC LIMIT 20`
  );

  await show(
    'user data actually present (so the gap engine has real inputs)',
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
    'the saved volunteer opportunities and guide dismissals (per user)',
    `SELECT 'opportunity_saves' AS kind, profile_id::text, opportunity_id AS target, created_at
       FROM public.volunteer_opportunity_saves
       UNION ALL
       SELECT 'guide_dismissal', profile_id::text, guide_key, dismissed_at
         FROM public.user_guide_dismissals
       ORDER BY kind, created_at DESC LIMIT 40`
  );

  await show(
    'duplicated user data that must not exist',
    `SELECT
       (SELECT count(*) FROM (SELECT profile_id FROM public.roadmaps GROUP BY profile_id HAVING count(*) > 1) x)
         AS users_with_multiple_roadmaps,
       (SELECT count(*) FROM (SELECT user_id, skill_id FROM public.user_skills GROUP BY 1,2 HAVING count(*) > 1) y)
         AS duplicate_user_skills,
       (SELECT count(*) FROM (SELECT profile_id, opportunity_id FROM public.volunteer_opportunity_saves GROUP BY 1,2 HAVING count(*) > 1) z)
         AS duplicate_saves`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
