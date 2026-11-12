/**
 * The career target's contract.
 * ---------------------------------------------------------------------------
 * The target role, the career track, the experience level and the goal are
 * ONE thing, and the platform has exactly one source of truth for them.
 *
 * WHY THIS FILE EXISTS
 * A candidate who skipped onboarding was permanently, invisibly a "Frontend
 * Engineer": the database held no role for them, so the interface fell back
 * to the first entry of the role catalogue and every screen spoke about a
 * career they had never chosen. Two things allowed it:
 *
 *   1. the target role was INITIALISED to a catalogue role instead of to
 *      nothing, and
 *   2. the Profile page and the Settings page each edited it through their
 *      own path, so the two screens could disagree and the platform's own
 *      idea of the target could lag behind both.
 *
 * The guards below are the regression tests for both:
 *   - the role is never seeded from a default;
 *   - the two screens share ONE component and ONE writer;
 *   - skipping the onboarding writes no role;
 *   - the catalogue is translated in both languages, so a candidate who
 *     picks a role in Arabic gets a role they can read.
 *
 * It is pure: no database, no API, no key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  impliedExperienceLevel,
  isExperienceLevel,
  normalizeExperienceLevel,
} from '../shared/experienceLevel.ts';
import { CAREER_DOMAINS } from '../shared/careerDomains.ts';
import { TARGET_ROLES } from '../shared/careerRoles.ts';
import { careerRolesAr } from '../src/translations/parts/careerRoles.ts';
import { careerTargetAr } from '../src/translations/parts/careerTarget.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

test.describe('the career target', () => {
  test('the target role is never seeded from a catalogue default', () => {
    const context = readRepoFile('src/context/CareerContext.tsx');

    // The state must start as NOTHING. A catalogue default is how a skipped
    // onboarding became a permanent "Frontend Engineer".
    assert.match(
      context,
      /useState<TargetRole\s*\|\s*null>\(null\)/,
      'the target role must start empty, not as a catalogue entry'
    );

    // The old default must not survive anywhere in the context.
    assert.doesNotMatch(
      context,
      /useState<TargetRole>\(TARGET_ROLES\[0\]\)/,
      'the target role must never be initialised to the first catalogue entry'
    );
  });

  test('the first catalogue entry is not what a candidate without a role is shown', () => {
    // The guard above is the real fix; this one documents WHY the default is
    // dangerous, so nobody reintroduces it as a convenience.
    assert.equal(
      TARGET_ROLES[0].title,
      'Frontend Engineer',
      'the first catalogue entry is "Frontend Engineer", which is exactly the role a skipped onboarding used to be stuck with'
    );
  });

  test('the Profile page and the Settings page share one career-target component', () => {
    const profile = readRepoFile('src/components/views/ProfileView.tsx');
    const settings = readRepoFile('src/components/views/SettingsView.tsx');

    for (const [name, source] of [
      ['ProfileView', profile],
      ['SettingsView', settings],
    ] as const) {
      assert.match(
        source,
        /<CareerGoalRolePanel/,
        `${name} must mount the shared career-target panel`
      );
    }
  });

  test('the shared panel writes through the one writer, not through its own API calls', () => {
    const panel = readRepoFile('src/components/career/CareerGoalRolePanel.tsx');

    assert.match(
      panel,
      /saveCareerTarget/,
      'the panel must save through the context’s single writer'
    );

    // The panel must not write to the profile API itself: a second write path
    // is exactly how the two screens drifted apart.
    assert.doesNotMatch(
      panel,
      /patchProfile|updateProfile\(/,
      'the panel must not open its own write path to the database'
    );
  });

  test('the context exposes one writer for the career target', () => {
    const context = readRepoFile('src/context/CareerContext.tsx');

    assert.match(
      context,
      /saveCareerTarget:\s*\(input: \{/,
      'the context must expose saveCareerTarget'
    );
    assert.match(
      context,
      /const saveCareerTarget = async \(input: \{/,
      'the context must define saveCareerTarget'
    );
  });

  test('a role change refreshes what was computed for the previous role', () => {
    const context = readRepoFile('src/context/CareerContext.tsx');

    // The learning ranking was built for the old role's skill gaps, so a role
    // change has to refresh it — with AI OFF, because asking the model to
    // explain a role the candidate just changed would spend a token for
    // nothing.
    assert.match(
      context,
      /invalidateRoleDependents/,
      'a role change must invalidate the views computed for the old role'
    );
    assert.match(
      context,
      /refreshLearningRecommendations\(\{ ai: false \}\)/,
      'the refresh must not charge a token'
    );
  });

  test('skipping the onboarding writes no target role', () => {
    const onboarding = readRepoFile('src/components/views/OnboardingView.tsx');

    // The skip handler must persist the onboarding flags and nothing else.
    const skipStart = onboarding.indexOf('const handleSkip');
    const skipEnd = onboarding.indexOf('\n  return (', skipStart);
    const skipHandler = onboarding.slice(skipStart, skipEnd);

    assert.ok(skipHandler.length > 0, 'the skip handler must exist');
    assert.doesNotMatch(
      skipHandler,
      /setPrimaryTargetRole|targetRoleId|targetRole/,
      'skipping the onboarding must not write a target role'
    );
    assert.match(
      skipHandler,
      /onboardingStatus: 'skipped'/,
      'skipping must still record that the onboarding was skipped'
    );
  });

  test('the experience level has one vocabulary, and it is enforced', () => {
    assert.deepEqual(
      [...EXPERIENCE_LEVELS],
      ['student', 'intern', 'junior', 'mid', 'senior', 'lead'],
      'the experience level vocabulary is fixed'
    );

    for (const level of EXPERIENCE_LEVELS) {
      assert.ok(isExperienceLevel(level), `${level} is a valid level`);
      assert.ok(
        EXPERIENCE_LEVEL_LABELS[level].en && EXPERIENCE_LEVEL_LABELS[level].ar,
        `${level} is labelled in both languages`
      );
    }

    assert.equal(isExperienceLevel('director'), false, 'an unknown level is refused');
  });

  test('an experience level that is not in the vocabulary is refused rather than normalised', () => {
    assert.deepEqual(normalizeExperienceLevel('junior'), { ok: true, value: 'junior' });
    assert.deepEqual(normalizeExperienceLevel('JUNIOR'), { ok: true, value: 'junior' });
    assert.deepEqual(normalizeExperienceLevel(''), { ok: true, value: null });
    assert.deepEqual(normalizeExperienceLevel(null), { ok: true, value: null });
    assert.deepEqual(normalizeExperienceLevel(undefined), { ok: true, value: null });

    const refused = normalizeExperienceLevel('director');
    assert.equal(refused.ok, false, 'an unknown level must be refused');
  });

  test('the career state implies a starting experience level', () => {
    assert.equal(impliedExperienceLevel('student'), 'student');
    assert.equal(impliedExperienceLevel('fresh_graduate'), 'junior');
    assert.equal(impliedExperienceLevel('working_professional'), 'mid');
    assert.equal(impliedExperienceLevel('career_switcher'), 'junior');
    assert.equal(impliedExperienceLevel('exploring'), 'intern');
    assert.equal(impliedExperienceLevel(null), null);
  });

  test('the database enforces the same vocabulary the application does', () => {
    const migration = readRepoFile(
      'supabase/migrations/20261118000001_experience_level.sql'
    );

    for (const level of EXPERIENCE_LEVELS) {
      assert.ok(
        migration.includes(`'${level}'`),
        `the migration must accept the "${level}" level`
      );
    }
    assert.match(
      migration,
      /CHECK \(/,
      'the column must be constrained, so a bad value can never be written'
    );
  });

  test('every career domain is translated', () => {
    for (const domain of CAREER_DOMAINS) {
      assert.ok(
        careerTargetAr[domain.label],
        `the "${domain.label}" domain must have an Arabic label`
      );
    }
  });

  test('every catalogue role is translated', () => {
    for (const role of TARGET_ROLES) {
      assert.ok(
        careerRolesAr[role.title],
        `the "${role.title}" role must have an Arabic title`
      );
    }
  });

  test('the catalogue is complete — every role file is in the shared catalogue', () => {
    // The catalogue is spread over four files; the shared module is what the
    // application reads. A role added to a file and forgotten in the shared
    // module would be invisible to the picker but visible to the roadmap.
    const roleFiles = readdirSync(join(REPO_ROOT, 'shared/roles'));
    assert.ok(roleFiles.length >= 4, 'the catalogue is spread over several files');

    for (const file of roleFiles) {
      const source = readRepoFile(join('shared/roles', file));
      const titles = [...source.matchAll(/^\s+title: '(.+?)',$/gm)].map((m) => m[1]);
      for (const title of titles) {
        assert.ok(
          TARGET_ROLES.some((role) => role.title === title),
          `the "${title}" role must be in the shared catalogue`
        );
      }
    }
  });
});
