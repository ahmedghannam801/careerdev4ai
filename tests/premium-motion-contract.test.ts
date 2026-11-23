/** Regression checks for the premium-motion integrations and their guardrails. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const credits = source('../src/components/subscription/CreditBalanceBadge.tsx');
const magnet = source('../src/components/react-bits/MagnetButton.tsx');

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

  it('animates dashboard metrics, token balances, and optimistic skill levels', () => {
    assert.match(dashboard, /<AnimatedCounter value=\{metrics\.roleReadinessPct\}/);
    assert.match(credits, /<AnimatedCounter value=\{balance\}/);
    assert.match(skills, /key=\{skill\.id\}/);
    assert.match(skills, /updateSkillLevel\(skill\.id, level\)/);
    assert.match(skillBar, /gsap\.fromTo\(/);
    assert.match(skillBar, /onLevelChange\(nextSkillLevel\(level\)\)/);
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
