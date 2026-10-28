/**
 * Backfills the personalisation columns on the roadmaps that already exist in
 * Supabase Production.
 *
 * The 45 roadmaps in production were written before the personalisation
 * migration, so every column it added is still NULL on them: the roadmap has
 * no `target_role_id`, no `domain_id`, no `readiness_pct`; its phases have no
 * `goal`; and its tasks have no difficulty, priority, rationale, skill tags,
 * prerequisites, recommended resources or recommended projects.
 *
 * Regenerating those roadmaps would rebuild the tree, and a rebuilt tree can
 * rename a step — which would silently drop the progress a user has already
 * recorded against it. So this script ENRICHES the existing rows IN PLACE:
 *
 *   - it never inserts, deletes or reorders a phase, milestone or task;
 *   - it never touches a column that already has a value;
 *   - it only fills the NULL columns that the personalisation migration
 *     introduced.
 *
 * The values are computed with the SAME engine the application uses
 * (`shared/skillGap.ts` and `shared/roadmapGenerator.ts`), so a backfilled
 * roadmap says exactly what the app would say if it were regenerated.
 *
 * The script is idempotent: running it twice changes nothing the second time.
 *
 * The access token is read from the file written by
 * scripts/read-db-credential.ps1 and never from the repository.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveRoleDefinition } from '../../shared/careerRoles.ts';
import {
  computeSkillGaps,
  normalizeSkillName,
  summarizeSkillGaps,
  toRoleSkillRequirements,
  type SkillGap,
} from '../../shared/skillGap.ts';
import { matchProjects, matchResources } from '../../shared/roadmapGenerator.ts';

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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 800)}`);
  }
  return JSON.parse(body) as T;
}

/** Escapes a value for a PostgreSQL string literal. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Renders an array of strings as a PostgreSQL text[] literal. */
function textArray(values: string[]): string {
  return `ARRAY[${values.map((value) => lit(value)).join(', ')}]::text[]`;
}

/** Serialises a value for a jsonb column. */
function jsonb(value: unknown): string {
  return lit(JSON.stringify(value));
}

interface TaskRow {
  roadmap_id: string;
  phase_id: string;
  phase_number: number;
  phase_sort: number;
  milestone_id: string;
  milestone_sort: number;
  task_id: string;
  task_title: string;
  task_skill_name: string | null;
  task_sort: number;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  let statements = 0;

  /** Runs a statement, or counts it without writing when this is a dry run. */
  async function run(sql: string): Promise<any> {
    statements += 1;
    if (dryRun) return [];
    return query(sql);
  }

  // ---- one read for the whole tree --------------------------------------
  const roadmaps = await query<any[]>(
    `SELECT r.id AS roadmap_id, r.profile_id, r.target_role_title,
            p.id AS phase_id, p.phase_number, p.sort_order AS phase_sort,
            m.id AS milestone_id, m.sort_order AS milestone_sort,
            t.id AS task_id, t.title AS task_title, t.skill_name AS task_skill_name,
            t.sort_order AS task_sort
       FROM public.roadmaps r
       JOIN public.roadmap_phases p ON p.roadmap_id = r.id
       JOIN public.roadmap_milestones m ON m.phase_id = p.id
       JOIN public.roadmap_tasks t ON t.milestone_id = m.id
      WHERE r.target_role_id IS NULL
      ORDER BY r.created_at, p.sort_order, p.phase_number,
               m.sort_order, t.sort_order`
  );

  const roadmapIds = Array.from(new Set(roadmaps.map((row) => row.roadmap_id as string)));
  console.log(
    `roadmaps to enrich: ${roadmapIds.length}${dryRun ? '  (dry run: nothing is written)' : ''}`
  );
  if (roadmapIds.length === 0) {
    console.log('nothing to do');
    return;
  }

  // ---- one read for every rated skill -----------------------------------
  const skillRows = await query<any[]>(
    `SELECT us.user_id, s.name, us.proficiency AS level
       FROM public.user_skills us
       JOIN public.skills s ON s.id = us.skill_id
      ORDER BY us.user_id, us.proficiency DESC`
  );
  const skillsByUser = new Map<string, { name: string; level: number }[]>();
  for (const row of skillRows) {
    const list = skillsByUser.get(row.user_id) ?? [];
    list.push({ name: row.name, level: row.level ?? 1 });
    skillsByUser.set(row.user_id, list);
  }

  // ---- one read for the course catalogue --------------------------------
  const courses = await query<any[]>(
    `SELECT c.id, c.title, c.provider, c.url, c.duration_hours,
            COALESCE(array_agg(cs.skill_name) FILTER (WHERE cs.skill_name IS NOT NULL), '{}') AS skill_names
       FROM public.courses c
       LEFT JOIN public.course_skills cs ON cs.course_id = c.id
      GROUP BY c.id, c.title, c.provider, c.url, c.duration_hours`
  );
  const resourceCandidates = courses.map((course) => ({
    id: course.id,
    title: course.title,
    provider: course.provider,
    url: course.url,
    durationHours: course.duration_hours,
    skillNames: course.skill_names as string[],
  }));

  const roleProjects = await query<any[]>(
    `SELECT DISTINCT title FROM public.projects ORDER BY title`
  );
  const projectCandidates = roleProjects.map((project) => ({
    title: project.title,
    description: `A portfolio-scale piece of work that proves you can do this role. ${project.title}.`,
    source: 'role' as const,
    skillNames: [] as string[],
  }));

  // ---- group the tree by roadmap ----------------------------------------
  interface Roadmap {
    id: string;
    profile_id: string;
    target_role_title: string | null;
    phases: Map<
      string,
      { id: string; number: number; sort: number; milestones: Map<string, { sort: number; tasks: any[] }> }
    >;
  }

  const byRoadmap = new Map<string, Roadmap>();
  for (const row of roadmaps) {
    let roadmap = byRoadmap.get(row.roadmap_id);
    if (!roadmap) {
      roadmap = {
        id: row.roadmap_id,
        profile_id: row.profile_id,
        target_role_title: row.target_role_title,
        phases: new Map(),
      };
      byRoadmap.set(row.roadmap_id, roadmap);
    }
    let phase = roadmap.phases.get(row.phase_id);
    if (!phase) {
      phase = {
        id: row.phase_id,
        number: row.phase_number,
        sort: row.phase_sort,
        milestones: new Map(),
      };
      roadmap.phases.set(row.phase_id, phase);
    }
    let milestone = phase.milestones.get(row.milestone_id);
    if (!milestone) {
      milestone = { sort: row.milestone_sort, tasks: [] };
      phase.milestones.set(row.milestone_id, milestone);
    }
    milestone.tasks.push(row);
  }

  // ---- enrich ----------------------------------------------------------
  const phaseUpdates: string[] = [];
  const taskUpdates: string[] = [];
  const roadmapUpdates: string[] = [];
  let skippedUnknownRole = 0;

  for (const roadmap of byRoadmap.values()) {
    const role = resolveRoleDefinition(roadmap.target_role_title);
    if (!role) {
      skippedUnknownRole += 1;
      console.log(`  skip ${roadmap.id}: "${roadmap.target_role_title}" is not a catalogue role`);
      continue;
    }

    const userSkills = skillsByUser.get(roadmap.profile_id) ?? [];
    const requirements = toRoleSkillRequirements(role);
    const gaps = computeSkillGaps(requirements, userSkills);
    const summary = summarizeSkillGaps(gaps, requirements);
    const gapByName = new Map<string, SkillGap>(
      gaps.map((gap) => [normalizeSkillName(gap.name), gap])
    );

    let totalTasks = 0;
    let estimatedHours = 0;
    let previousTaskTitle: string | null = null;

    const phases = Array.from(roadmap.phases.values()).sort(
      (a, b) => a.sort - b.sort || a.number - b.number
    );

    for (const phase of phases) {
      const stage = Math.min(3, Math.max(0, phase.number - 1));
      const path =
        stage === 0
          ? role.entryPath
          : stage === 1
            ? role.intermediatePath
            : role.advancedPath;
      const goal =
        stage === 3
          ? 'Be credible and hireable for this role.'
          : path && path.length
            ? path[0]
            : 'Reach the level this role expects and prove it.';

      phaseUpdates.push(
        `UPDATE public.roadmap_phases SET goal = ${lit(goal)} WHERE id = ${lit(phase.id)} AND goal IS NULL;`
      );

      const milestones = Array.from(phase.milestones.values()).sort((a, b) => a.sort - b.sort);
      let previousMilestoneLast: string | null = null;
      let isFirstTaskOfPhase = true;

      for (const milestone of milestones) {
        const tasks = milestone.tasks.sort((a, b) => a.task_sort - b.task_sort);
        let previousInMilestone: string | null = null;

        for (const task of tasks) {
          totalTasks += 1;

          const gap = task.task_skill_name
            ? gapByName.get(normalizeSkillName(task.task_skill_name))
            : undefined;

          const difficulty = gap
            ? gap.requiredLevel <= 2
              ? 'foundational'
              : gap.requiredLevel === 3
                ? 'intermediate'
                : 'advanced'
            : null;

          const priority = gap?.priority ?? null;
          const rationale = gap
            ? `${gap.name} is at ${gap.currentLevel}/5 and this role expects ${gap.requiredLevel}/5${
                gap.gap === 0
                  ? ' - you already meet it.'
                  : gap.priority === 'critical'
                    ? ' - this blocks the role.'
                    : gap.priority === 'high'
                      ? ' - this is a major requirement.'
                      : gap.priority === 'medium'
                        ? ' - worth closing next.'
                        : ' - a nice to have.'
              }`
            : null;

          const skillNames = gap
            ? [gap.name]
            : task.task_skill_name
              ? [task.task_skill_name]
              : [];

          const resources = gap
            ? matchResources(gap, resourceCandidates).slice(0, 2).map((resource) => ({
                id: resource.id,
                title: resource.title,
                provider: resource.provider,
                url: resource.url,
                durationHours: resource.durationHours,
              }))
            : [];

          const projectTitles = gap
            ? matchProjects(gap, projectCandidates).slice(0, 2).map((project) => project.title)
            : [];

          // The same chain the generator builds: inside a milestone each step
          // depends on the one before it, and the first step of a milestone
          // depends on the last step of the previous one.
          const prerequisites: string[] = [];
          if (previousInMilestone) prerequisites.push(previousInMilestone);
          else if (previousMilestoneLast) prerequisites.push(previousMilestoneLast);
          else if (previousTaskTitle && isFirstTaskOfPhase) prerequisites.push(previousTaskTitle);

          const hours = gap
            ? Math.max(
                2,
                Math.min(
                  40,
                  Math.round(((stage === 0 ? 6 : stage === 1 ? 8 : 10) + gap.gap * 2) / 2) * 2
                )
              )
            : null;
          if (hours) estimatedHours += hours;

          taskUpdates.push(
            `UPDATE public.roadmap_tasks
                SET difficulty = ${difficulty ? lit(difficulty) : 'NULL'},
                    priority = ${priority ? lit(priority) : 'NULL'},
                    rationale = ${rationale ? lit(rationale) : 'NULL'},
                    skill_names = ${textArray(skillNames)},
                    prerequisites = ${textArray(prerequisites)},
                    resources = ${jsonb(resources)}::jsonb,
                    project_titles = ${textArray(projectTitles)},
                    estimated_hours = COALESCE(estimated_hours, ${hours ?? 'NULL'})
              WHERE id = ${lit(task.task_id)}
                AND priority IS NULL AND difficulty IS NULL;`
          );

          previousInMilestone = task.task_title;
          isFirstTaskOfPhase = false;
        }

        if (tasks.length > 0) {
          previousMilestoneLast = tasks[tasks.length - 1].task_title;
          previousTaskTitle = previousMilestoneLast;
        }
      }
    }

    const openGaps = gaps.filter((gap) => gap.gap > 0);
    const planSummary = {
      totalTasks,
      estimatedHours,
      openGaps: openGaps.filter((gap) => gap.required).length,
      openPreferredGaps: openGaps.filter((gap) => !gap.required).length,
      coveredSkills: gaps.filter((gap) => gap.gap === 0).map((gap) => gap.name),
      tasksByPriority: {
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        sufficient: summary.sufficient,
      },
      backfilledAt: new Date().toISOString(),
    };

    roadmapUpdates.push(
      `UPDATE public.roadmaps
          SET target_role_id = ${lit(role.id)},
              domain_id = ${lit(role.domainId)},
              readiness_pct = ${summary.readinessPct},
              plan_summary = ${jsonb(planSummary)}::jsonb,
              generated_at = COALESCE(generated_at, now())
        WHERE id = ${lit(roadmap.id)} AND target_role_id IS NULL;`
    );

    console.log(
      `  ${roadmap.id}  ${role.title}  readiness=${summary.readinessPct}%  tasks=${totalTasks}`
    );
  }

  // ---- write in batches -------------------------------------------------
  const batch = (statements: string[], size: number) => {
    const chunks: string[][] = [];
    for (let index = 0; index < statements.length; index += size) {
      chunks.push(statements.slice(index, index + size));
    }
    return chunks;
  };

  const allUpdates = [...phaseUpdates, ...taskUpdates, ...roadmapUpdates];
  console.log(
    `\nstatements to run: ${allUpdates.length} (phases ${phaseUpdates.length}, tasks ${taskUpdates.length}, roadmaps ${roadmapUpdates.length})`
  );

  for (const chunk of batch(allUpdates, 40)) {
    await run(chunk.join('\n'));
  }

  console.log(
    `done${dryRun ? ` (dry run: ${statements} statements would have been run)` : ''}`
  );
  if (skippedUnknownRole > 0) {
    console.log(`skipped (role not in the catalogue): ${skippedUnknownRole}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
