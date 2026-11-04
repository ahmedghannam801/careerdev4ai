/**
 * Behavioural checks for the public website and the surfaces it added.
 *
 * The landing page was rebuilt around three promises that can all rot
 * silently, so they are held here:
 *
 *  1. The interactive product preview runs the platform's OWN planning
 *     engine against the platform's OWN role catalogue. If the preview ever
 *     diverges from the engine, the preview is lying to a visitor — so the
 *     preview's roles have to exist in the catalogue, and the plan it
 *     shows has to be the plan the engine produces.
 *  2. The public page's legal and contact links are REAL destinations. The
 *     published documents live at their own addresses on the server, and the
 *     footer has to reach them rather than print a label that looks like a
 *     link.
 *  3. The contact channels are published from ONE place. A second copy of an
 *     address is a second address that can drift.
 *
 * Pure: no database, no server, no model.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROLE_DEFINITION_LIST } from '../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../shared/roadmapGenerator.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../shared/skillGap.ts';
import { SUPPORT_EMAIL, OPERATOR_LINKEDIN_URL, PUBLIC_PATHS } from '../shared/contact.ts';
import { AR_STRINGS } from '../src/translations/sourceStrings.ts';

const SRC = join(import.meta.dirname, '..', 'src');

/** The roles the landing preview offers, read from the component itself. */
const PREVIEW_SOURCE = readFileSync(
  join(SRC, 'components', 'landing', 'ProductPreview.tsx'),
  'utf8'
);

const LANDING_SOURCE = readFileSync(join(SRC, 'components', 'views', 'LandingView.tsx'), 'utf8');
const APP_SHELL_SOURCE = readFileSync(join(SRC, 'components', 'layout', 'AppShell.tsx'), 'utf8');
const SETTINGS_SOURCE = readFileSync(join(SRC, 'components', 'views', 'SettingsView.tsx'), 'utf8');

/** The role ids the preview offers, as written in the component. */
function previewRoleIds(): string[] {
  const block = PREVIEW_SOURCE.match(/PREVIEW_ROLE_IDS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'the preview must declare its role list');
  const ids = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'the preview must offer at least one role');
  return ids;
}

describe('the landing product preview', () => {
  it('offers only roles that exist in the catalogue', () => {
    for (const id of previewRoleIds()) {
      const role = ROLE_DEFINITION_LIST.find((candidate) => candidate.id === id);
      assert.ok(role, `the preview offers "${id}", which is not in the role catalogue`);
    }
  });

  it('offers roles from more than one domain, so the preview is not a developer tool', () => {
    const domains = new Set(
      previewRoleIds().map((id) => ROLE_DEFINITION_LIST.find((role) => role.id === id)?.domainId)
    );
    assert.ok(domains.size >= 3, `the preview should span several domains, saw ${domains.size}`);
  });

  it('runs the real planning engine, so the preview cannot drift from the product', () => {
    for (const id of previewRoleIds()) {
      const role = ROLE_DEFINITION_LIST.find((candidate) => candidate.id === id);
      assert.ok(role);

      // The same call the component makes.
      const plan = generateRoadmapPlan({ role, userSkills: [] });

      assert.ok(plan.phases.length > 0, `${id} must produce at least one phase`);
      assert.ok(plan.summary.totalTasks > 0, `${id} must produce at least one task`);
      assert.ok(plan.summary.estimatedHours > 0, `${id} must produce an hour estimate`);

      // Every phase names a goal, so the preview shows a reason and not just
      // a list of titles.
      for (const phase of plan.phases) {
        assert.ok(phase.goal.length > 0, `${id} has a phase without a goal`);
      }
    }
  });

  it('shows gaps that are specific to the role, not a generic list', () => {
    const hr = ROLE_DEFINITION_LIST.find((role) => role.id === 'hr-specialist');
    const analyst = ROLE_DEFINITION_LIST.find((role) => role.id === 'data-analyst');
    assert.ok(hr && analyst);

    const hrGaps = computeSkillGaps(toRoleSkillRequirements(hr), []).map((gap) => gap.name);
    const analystGaps = computeSkillGaps(toRoleSkillRequirements(analyst), []).map((gap) => gap.name);

    assert.ok(hrGaps.length > 0 && analystGaps.length > 0);
    // An HR Specialist must not be handed an SQL-only gap, and a Data
    // Analyst must not be handed an HR-only gap.
    assert.ok(
      !hrGaps.some((name) => /^SQL/i.test(name)),
      'an HR Specialist must not be shown an SQL gap'
    );
    assert.ok(
      !analystGaps.some((name) => /Employee Relations/i.test(name)),
      'a Data Analyst must not be shown an HR gap'
    );
  });

  it('invents nothing: every preview string comes from the catalogue or the engine', () => {
    // The preview must not carry a hand-written phase, task or hour figure.
    assert.ok(
      !/\b\d+\s*(hours|hrs)\b/i.test(PREVIEW_SOURCE),
      'the preview must not hard-code hour figures'
    );
    assert.ok(
      PREVIEW_SOURCE.includes('generateRoadmapPlan'),
      'the preview must build its plan with the real engine'
    );
  });
});

describe('the public page links', () => {
  it('links the published legal documents at their real addresses', () => {
    assert.ok(LANDING_SOURCE.includes('PUBLIC_PATHS.terms'), 'the footer must link /terms');
    assert.ok(LANDING_SOURCE.includes('PUBLIC_PATHS.privacy'), 'the footer must link /privacy');
    assert.equal(PUBLIC_PATHS.terms, '/terms');
    assert.equal(PUBLIC_PATHS.privacy, '/privacy');
  });

  it('publishes the contact channels from one place', () => {
    assert.ok(SUPPORT_EMAIL.includes('@'), 'a support address must be published');
    assert.ok(OPERATOR_LINKEDIN_URL.startsWith('https://'), 'the profile link must be absolute');

    // The address must not be written out a second time in the interface.
    // One address, one definition, one place to change it.
    assert.ok(
      !LANDING_SOURCE.includes(SUPPORT_EMAIL),
      'the landing page must import the support address, not repeat it'
    );
    assert.ok(
      !SETTINGS_SOURCE.includes(SUPPORT_EMAIL),
      'the settings page must import the support address, not repeat it'
    );
    assert.ok(SETTINGS_SOURCE.includes('SUPPORT_EMAIL'), 'the settings page must use the shared address');
  });

  it('offers a language control that actually changes the interface', () => {
    assert.ok(
      /updateSettings\(\{\s*language:/.test(LANDING_SOURCE),
      'the footer language control must write the language preference'
    );
  });
});

describe('the surfaces the public work added', () => {
  it('gives the signed-in shell a skip-to-content link', () => {
    assert.ok(
      APP_SHELL_SOURCE.includes('Skip to content'),
      'the application shell must offer a skip-to-content link'
    );
    assert.ok(
      APP_SHELL_SOURCE.includes('id="main-content"'),
      'the skip link needs a target to jump to'
    );
  });

  it('shows the user their own recent activity on the dashboard', () => {
    const dashboard = readFileSync(join(SRC, 'components', 'views', 'DashboardView.tsx'), 'utf8');
    assert.ok(
      dashboard.includes('RecentActivityPanel'),
      'the dashboard must show the recent-activity panel'
    );
    const panel = readFileSync(
      join(SRC, 'components', 'career', 'RecentActivityPanel.tsx'),
      'utf8'
    );
    assert.ok(panel.includes('activities'), 'the panel must read the recorded activity');
  });

  it('lets the assistant show the evidence it reasons over', () => {
    const evidence = readFileSync(join(SRC, 'components', 'copilot', 'EvidencePanel.tsx'), 'utf8');
    for (const record of [
      'targetRole',
      'skills',
      'roadmapPhases',
      'applications',
      'evidenceItems',
    ]) {
      assert.ok(evidence.includes(record), `the evidence panel must show ${record}`);
    }
  });
});

describe('the new public copy', () => {
  it('is fully translated, so the Arabic interface has no English left behind', () => {
    // Every literal translation call in the new public components has to
    // resolve to an Arabic entry.
    const files = [
      join(SRC, 'components', 'landing', 'ProductPreview.tsx'),
      join(SRC, 'components', 'landing', 'FeatureGrid.tsx'),
      join(SRC, 'components', 'landing', 'TrustSection.tsx'),
      join(SRC, 'components', 'landing', 'FaqSection.tsx'),
      join(SRC, 'components', 'landing', 'ContactSection.tsx'),
      join(SRC, 'components', 'career', 'RecentActivityPanel.tsx'),
      join(SRC, 'components', 'copilot', 'EvidencePanel.tsx'),
    ];

    const pattern = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) {
        const source = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (!source) continue;
        assert.ok(
          AR_STRINGS[source],
          `"${source}" has no Arabic translation (in ${file.split(/[\\/]/).slice(-2).join('/')})`
        );
      }
    }
  });
});
