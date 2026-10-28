/**
 * Verifies the production relationship chain, end to end.
 *
 *   profile.target_role (title)
 *     -> catalogue -> role id + domain
 *       -> roadmaps.target_role_id / domain_id
 *         -> phases -> milestones -> tasks
 *           -> skill_names -> the skills the role requires
 *           -> resources -> real courses
 *           -> project_titles -> real projects
 *
 * The profile deliberately stores the role TITLE and derives the id from the
 * catalogue, so the check resolves the title the same way the application
 * does and compares it with what the roadmap recorded.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveRoleDefinition } from '../../shared/careerRoles.ts';
import { normalizeSkillName } from '../../shared/skillGap.ts';

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const TOKEN_FILE = path.join(os.tmpdir(), 'careerpilot-supabase-token.txt');

let token = '';
function auth(): string {
  if (!token) token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  return token;
}

async function query<T = any>(sql: string): Promise<T> {
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body) as T;
}

async function main(): Promise<void> {
  const rows = await query<any[]>(`
    SELECT r.id AS roadmap_id, r.profile_id, r.target_role_title, r.target_role_id, r.domain_id,
           r.readiness_pct, p.target_role AS profile_target_role
      FROM public.roadmaps r
      JOIN public.profiles p ON p.id = r.profile_id
     ORDER BY r.created_at
  `);

  let roleMatches = 0;
  const mismatches: string[] = [];

  for (const row of rows) {
    // The application resolves the role from the profile's stored title.
    const fromProfile = resolveRoleDefinition(row.profile_target_role);
    const fromRoadmap = resolveRoleDefinition(row.target_role_title);

    if (fromProfile && fromRoadmap && fromProfile.id === fromRoadmap.id) {
      roleMatches += 1;
      continue;
    }
    mismatches.push(
      `  ${row.roadmap_id}  profile="${row.profile_target_role}" -> ${fromProfile?.id ?? 'UNRESOLVED'}  |  roadmap="${row.target_role_title}" -> ${fromRoadmap?.id ?? 'UNRESOLVED'}`
    );
  }

  console.log(`roadmaps: ${rows.length}`);
  console.log(`profile title and roadmap title resolve to the same catalogue role: ${roleMatches}`);
  console.log(`mismatches: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.log(mismatches.join('\n'));
  }

  // The roadmap's recorded id must be the id the catalogue gives.
  let idMatches = 0;
  const idProblems: string[] = [];
  for (const row of rows) {
    const role = resolveRoleDefinition(row.profile_target_role);
    if (role && role.id === row.target_role_id) {
      idMatches += 1;
    } else {
      idProblems.push(
        `  ${row.roadmap_id}  recorded=${row.target_role_id}  catalogue=${role?.id ?? 'UNRESOLVED'}`
      );
    }
  }
  console.log(`\nroadmap target_role_id matches the catalogue: ${idMatches}/${rows.length}`);
  if (idProblems.length > 0) console.log(idProblems.join('\n'));

  // The skills named on tasks must be real catalogue skills for that role.
  const taskSkills = await query<any[]>(`
    SELECT t.skill_name, r.target_role_id, count(*) AS tasks
      FROM public.roadmap_tasks t
      JOIN public.roadmap_milestones m ON m.id = t.milestone_id
      JOIN public.roadmap_phases p ON p.id = m.phase_id
      JOIN public.roadmaps r ON r.id = p.roadmap_id
     WHERE t.skill_name IS NOT NULL
     GROUP BY 1, 2
  `);

  let known = 0;
  let unknown = 0;
  const unknownNames = new Map<string, number>();
  for (const row of taskSkills) {
    const role = resolveRoleDefinition(row.target_role_id);
    if (!role) continue;
    const names = [
      ...(role.coreSkills ?? []).map((skill) => skill.name),
      ...(role.preferredSkills ?? []).map((skill) => skill.name),
      ...(role.tools ?? []),
    ].map(normalizeSkillName);
    if (names.includes(normalizeSkillName(row.skill_name))) {
      known += 1;
    } else {
      unknown += 1;
      unknownNames.set(row.skill_name, (unknownNames.get(row.skill_name) ?? 0) + row.tasks);
    }
  }
  console.log(`\ntask skill references: ${known} match the role's skills or tools, ${unknown} do not`);
  if (unknownNames.size > 0) {
    const top = Array.from(unknownNames.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => `${name} (${count})`);
    console.log(`  not in any catalogue role: ${top.join(', ')}`);
  }

  // The resources named on tasks must be real courses.
  const resourceRows = await query<any[]>(`
    SELECT DISTINCT res->>'id' AS course_id, res->>'title' AS title
      FROM public.roadmap_tasks t, LATERAL jsonb_array_elements(t.resources) res
     WHERE t.resources IS NOT NULL AND jsonb_array_length(t.resources) > 0
  `);
  const courseIds = new Set(resourceRows.map((row) => row.course_id));
  const realCourses = await query<any[]>(
    `SELECT id FROM public.courses WHERE id IN (${Array.from(courseIds)
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(', ')})`
  );
  console.log(
    `\nresources on tasks: ${courseIds.size} distinct, ${realCourses.length} resolve to a real course`
  );
  const dangling = Array.from(courseIds).filter((id) => !realCourses.some((c) => c.id === id));
  if (dangling.length > 0) console.log(`  dangling course ids: ${dangling.join(', ')}`);

  // The projects named on tasks must be real projects.
  const projectRows = await query<any[]>(`
    SELECT DISTINCT p FROM public.roadmap_tasks t, LATERAL unnest(t.project_titles) p
     WHERE array_length(t.project_titles, 1) > 0
  `);
  const projectNames = Array.from(new Set(projectRows.map((row) => row.p)));
  const realProjects = await query<any[]>(
    `SELECT title FROM public.projects WHERE title IN (${projectNames
      .map((name) => `'${name.replace(/'/g, "''")}'`)
      .join(', ')})`
  );
  console.log(
    `projects on tasks: ${projectNames.length} distinct, ${realProjects.length} match a real project row`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
