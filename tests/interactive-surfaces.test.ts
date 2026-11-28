/**
 * Regression tests for the interactive surfaces.
 *
 * Each of these locks down a defect that was found by walking the platform
 * and pressing the controls:
 *
 *   * THE LEARNING HUB: the "Start Learning" button recorded that a course
 *     had started and did nothing else. The candidate pressed it, the card
 *     changed its label, and the course never opened. The real link was a
 *     small text link in the corner of the card. The primary action now
 *     OPENS the verified course, and a course with no verified source does
 *     not offer a button that goes nowhere.
 *
 *   * THE DASHBOARD: the statistic cards opened an explanation popover and
 *     nothing else, so a number the candidate could act on could not be
 *     acted on. The cards now open the section that holds the records the
 *     number was counted from.
 *
 *   * THE APPLICATION BOARD: a card could only be moved with a dropdown, and
 *     the board now takes a card that is dragged onto another column, writes
 *     the new stage, and puts the card back if the write fails.
 *
 *   * THE PROFILE: the plan badge sat beside the candidate's name. The
 *     platform is free now, so there is no tier to badge or to frame the
 *     photo in: the photo is shown as it is, for every account.
 *
 *   * THE PROJECTS: the same project could be written twice, from two
 *     different places, and both rows were read as two projects. The write
 *     path now recognises the project that is already on file, and the read
 *     path collapses the rows that are already there.
 *
 *   * THE LOADING SURFACE: the platform's own mascot carries every
 *     meaningful wait, and there is exactly one component that draws it.
 *
 * These are pure: they need no database and no server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  collapseDuplicateProjects,
  hasProjectIdentity,
  projectIdentity,
} from '../shared/projectIdentity.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), 'utf8');

/** Every source file under a directory, recursively. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else out.push(full);
  }
  return out;
}

describe('the learning hub', () => {
  it('opens the course when Start Learning is pressed', () => {
    const card = read('src/components/learning/CourseCard.tsx');

    // The primary action is a link to the verified course, and it records
    // the start on the way.
    assert.match(card, /href=\{url\}/);
    assert.match(card, /onClick=\{\(\) => onStart\(course\.id, recommendation\?\.reason\)\}/);
    // The label the candidate presses.
    assert.match(card, /t\(isInProgress \? 'Continue Learning' : 'Start Learning'\)/);
  });

  it('offers no button that goes nowhere', () => {
    const card = read('src/components/learning/CourseCard.tsx');
    // A course with no verified source says so instead of opening an empty
    // page.
    assert.match(card, /No verified course link is attached to this course yet/);
  });

  it('never opens an unverified URL', () => {
    const card = read('src/components/learning/CourseCard.tsx');
    assert.match(card, /const url = learningActionUrl\(course\.url\)/);
    assert.doesNotMatch(card, /href=\{course\.url\}/);
  });
});

describe('the dashboard statistics', () => {
  it('opens the section that holds each metric', () => {
    const dashboard = read('src/components/views/DashboardView.tsx');
    assert.match(dashboard, /onNavigate=\{\(\) => goTo\('progress'\)\}/);
    assert.match(dashboard, /onNavigate=\{\(\) => goTo\('skills'\)\}/);
    assert.match(dashboard, /onNavigate=\{\(\) => goTo\('roadmap'\)\}/);
  });

  it('opens the learning hub on the tab that holds each count', () => {
    const dashboard = read('src/components/views/DashboardView.tsx');
    assert.match(dashboard, /goTo\('learning', \{ tab: card\.tab \}\)/);
    for (const tab of ['recommended', 'saved', 'in_progress', 'completed', 'catalog']) {
      assert.match(dashboard, new RegExp(`tab: '${tab}'`));
    }
  });

  it('counts the learning numbers from the candidate\'s own records', () => {
    const dashboard = read('src/components/views/DashboardView.tsx');
    assert.match(dashboard, /learningItems\.filter\(\(item\) => item\.status === 'saved'\)/);
    assert.match(dashboard, /learningItems\.filter\(\(item\) => item\.status === 'in_progress'\)/);
    assert.match(dashboard, /learningItems\.filter\(\(item\) => item\.status === 'completed'\)/);
  });

  it('keeps the metric card navigable and its explanation separate', () => {
    const card = read('src/components/career/MetricCard.tsx');
    assert.match(card, /onNavigate\?: \(\) => void/);
    // The explanation is a sibling of the navigation button, not a child of
    // it: a button inside a button is not valid HTML.
    assert.match(card, /aria-label=\{t\('How is this calculated\?'\)\}/);
  });
});

describe('the application board', () => {
  it('takes a card that is dragged onto another column', () => {
    const view = read('src/components/views/ApplicationsView.tsx');
    assert.match(view, /draggable/);
    assert.match(view, /onDragStart=/);
    assert.match(view, /onDrop=/);
    assert.match(view, /onDragOver=/);
  });

  it('writes the new stage and reports when it fails', () => {
    const view = read('src/components/views/ApplicationsView.tsx');
    assert.match(view, /await updateApplicationStage\(app\.id, nextStage\)/);
    assert.match(view, /The application could not be moved/);
  });

  it('moves the card optimistically and rolls the move back', () => {
    const context = read('src/context/CareerContext.tsx');
    assert.match(context, /const updateApplicationStage = async \(id: string, stage: ApplicationStage\): Promise<boolean>/);
    assert.match(context, /setApplications\(prev => prev\.map\(a => \(a\.id === id \? \{ \.\.\.a, stage \} : a\)\)\)/);
    assert.match(context, /stage: previousStage/);
  });

  it('counts its overview from the candidate\'s own rows', () => {
    const view = read('src/components/views/ApplicationsView.tsx');
    assert.match(view, /total: applications\.length/);
    assert.match(view, /interviews: applications\.filter/);
    assert.match(view, /offers: applications\.filter/);
  });
});

describe('the profile header', () => {
  it('shows the photo without a frame that claims a paid tier', () => {
    const profile = read('src/components/views/ProfileView.tsx');
    // The photo is drawn as it is. There is no tier to draw it in, because
    // the platform is free and every account is on the same tier.
    assert.doesNotMatch(profile, /PlanIdentityFrame/);
    assert.doesNotMatch(profile, /<PlanIdentityBadge/);
    assert.doesNotMatch(profile, /variant="premium"/);
  });

  it('carries no membership panel anywhere in the interface', () => {
    // The membership panel used to show the plan, the renewal date and the
    // token balance. None of those exist any more, so the panel itself is
    // gone — and no screen may reach for it.
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(REPO_ROOT, 'src'))) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (readFileSync(file, 'utf8').includes('MembershipPanel')) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], `these screens still show a membership: ${offenders.join(', ')}`);
  });
});

describe('the duplicate projects', () => {
  it('recognises the same project written two ways', () => {
    assert.equal(
      projectIdentity('Sales Dashboard', 'Data Analyst'),
      projectIdentity('  sales   dashboard ', 'data analyst')
    );
    assert.equal(hasProjectIdentity(projectIdentity('Sales Dashboard', 'Data Analyst')), true);
  });

  it('does not treat a different role as the same project', () => {
    assert.notEqual(
      projectIdentity('Sales Dashboard', 'Data Analyst'),
      projectIdentity('Sales Dashboard', 'Product Manager')
    );
  });

  it('never collapses an untitled project into another one', () => {
    assert.equal(hasProjectIdentity(projectIdentity('', '')), false);
    assert.equal(hasProjectIdentity(projectIdentity('', 'Analyst')), false);
  });

  it('collapses the rows that describe the same project, newest first', () => {
    const rows = [
      { id: 'a', title: 'Sales Dashboard', role: 'Analyst', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', title: 'sales dashboard', role: 'analyst', created_at: '2026-02-01T00:00:00Z' },
      { id: 'c', title: 'Another Project', role: 'Analyst', created_at: '2026-01-01T00:00:00Z' },
    ];
    const collapsed = collapseDuplicateProjects(rows);
    assert.deepEqual(
      collapsed.map((row) => row.id),
      ['b', 'c']
    );
  });

  it('writes a project that is already on file onto that project', () => {
    const server = read('server/db/projects.ts');
    // The write path recognises the project instead of writing a second row.
    assert.match(server, /const existing = \(\(existingRows \?\? \[\]\) as ProjectRow\[\]\)\.find\(/);
    assert.match(server, /await updateProject\(profileId, existing\.id, input\)/);
  });

  it('deletes nothing when it collapses the rows', () => {
    const server = read('server/db/projects.ts');
    // The read path collapses; it never deletes.
    assert.match(server, /const rows = collapseDuplicateProjectRows\(\(data \?\? \[\]\) as ProjectRow\[\]\)/);
    const listProjects = server.slice(
      server.indexOf('export async function listProjects'),
      server.indexOf('export async function getProject')
    );
    assert.doesNotMatch(listProjects, /\.delete\(\)/);
  });
});

describe('the loading surface', () => {
  it('uses the official mascot', () => {
    const loader = read('src/components/processing/MascotLoader.tsx');
    assert.match(loader, /\/brand\/aionvia-ai-mascot\.webp/);
  });

  it('says the waiting line in the interface\'s language', () => {
    const loader = read('src/components/processing/MascotLoader.tsx');
    assert.match(loader, /Please wait, I'm getting things ready for you\.\.\./);
    const translations = read('src/translations/parts/processing.ts');
    assert.match(translations, /انتظر قليلًا، بنجهزلك كل حاجة\.\.\./);
  });

  it('is the one component the global surface uses', () => {
    const overlay = read('src/components/processing/ProcessingOverlay.tsx');
    assert.match(overlay, /MascotLoader/);
    assert.match(overlay, /from '\.\/MascotLoader'/);
  });

  it('moves nothing when the reader asked for reduced motion', () => {
    const loader = read('src/components/processing/MascotLoader.tsx');
    assert.match(loader, /reduced \? \{ y: 0 \} : \{ y: \[0, -4, 0\] \}/);
  });
});
