/** Regression checks for the motion integrations and their guardrails. */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = source('../src/components/views/DashboardView.tsx');
const jobs = source('../src/components/views/JobsView.tsx');
const roadmap = source('../src/components/roadmap/RoadmapTreeView.tsx');
const roadmapView = source('../src/components/views/RoadmapView.tsx');
const skills = source('../src/components/views/SkillsCenterView.tsx');
const skillBar = source('../src/components/skills/SkillLevelBar.tsx');
const animatedList = source('../src/components/react-bits/AnimatedList.tsx');
const smoothScroll = source('../src/providers/SmoothScrollProvider.tsx');
const magnet = source('../src/components/react-bits/MagnetButton.tsx');

const REPO_ROOT = join(import.meta.dirname, '..');

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else out.push(full);
  }
  return out;
}

describe('premium motion integration', () => {
  it('stagger-animates Dashboard, job cards, and roadmap topic branches with GSAP', () => {
    assert.match(dashboard, /<AnimatedList className="mt-4 grid gap-3 sm:grid-cols-3">/);
    assert.match(jobs, /<AnimatedList className="grid grid-cols-1 gap-4 lg:grid-cols-2">/);
    assert.match(roadmap, /<AnimatedList className="rdm-tree__side">/);
    assert.match(animatedList, /stagger,/);
    assert.match(animatedList, /Math\.min\(0\.05, 0\.5 \//);
  });

  it('respects reduced motion and guards browser-only matchMedia access', () => {
    assert.match(animatedList, /typeof window === 'undefined' \|\| typeof window\.matchMedia !== 'function'/);
    assert.match(animatedList, /prefers-reduced-motion:\s*reduce/);
    assert.match(skillBar, /useReducedMotion\(\)/);
    assert.match(magnet, /prefers-reduced-motion:\s*reduce/);
  });

  it('leaves scrolling to the browser and only registers the animation plugins', () => {
    // The page used to run a smooth-scroll library that intercepted the wheel
    // and animated the page towards it. That is what made scrolling feel
    // slower than the input, so it is gone: the browser's own scroll is used
    // and the provider registers the GSAP plugins the motion components need.
    assert.doesNotMatch(smoothScroll, /new Lenis/);
    assert.doesNotMatch(smoothScroll, /smoothWheel/);
    assert.match(smoothScroll, /gsap\.registerPlugin\(useGSAP, ScrollTrigger, GSAPSplitText\)/);
    assert.match(smoothScroll, /ScrollTrigger\.refresh\(\)/);
  });

  it('animates dashboard metrics and optimistic skill levels', () => {
    assert.match(dashboard, /<AnimatedCounter value=\{metrics\.roleReadinessPct\}/);
    assert.match(skills, /key=\{skill\.id\}/);
    assert.match(skills, /updateSkillLevel\(skill\.id, level\)/);
    assert.match(skillBar, /gsap\.fromTo\(/);
    assert.match(skillBar, /onLevelChange\(nextSkillLevel\(level\)\)/);
  });

  it('animates no token balance, because there is no balance to animate', () => {
    // The header chip used to count a token balance up to its new value. The
    // platform is free, so there is no balance and no chip: a counter that
    // animates a currency the candidate cannot spend is a lie with a
    // transition.
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(REPO_ROOT, 'src'))) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (readFileSync(file, 'utf8').includes('CreditBalanceBadge')) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these screens still show a token balance: ${offenders.join(', ')}`
    );
  });

  it('persists the tree/stages view and opens a topic drawer from a node click', () => {
    assert.match(roadmapView, /localStorage\.setItem\(ROADMAP_VIEW_MODE_KEY, mode\)/);
    assert.match(roadmapView, /viewMode === 'tree'/);
    assert.match(roadmap, /onClick=\{\(\) => onOpen\(node\)\}/);
    assert.match(roadmap, /<RoadmapNodeDrawer/);
    assert.match(roadmap, /roadmapTreeStorageKey\(profile\.email\)/);
    assert.match(roadmap, /updateSkillLevel\(linkedSkill\.id, level\)/);
  });
});
