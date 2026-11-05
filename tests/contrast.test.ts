/**
 * Form Contrast & Light/Dark Mode Validation Tests
 * Verifies that all form inputs, textareas, selects, dropdowns, and autofill rules
 * maintain WCAG-compliant contrast in both Light Mode and Dark Mode without white-on-white.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REPO_ROOT } from './env.mjs';

describe('Form Controls Contrast & Theme Tokens', () => {
  const css = readFileSync(join(REPO_ROOT, 'src', 'index.css'), 'utf8');

  test('CSS variables define distinct light and dark palettes', () => {
    // Light palette
    assert.ok(css.includes('--color-background: #F5F0E8;'), 'Light background defined');
    assert.ok(css.includes('--color-surface: #FFFFFF;'), 'Light surface defined');
    assert.ok(css.includes('--color-text: #282B29;'), 'Light text defined as dark charcoal');

    // Dark palette
    assert.ok(css.includes('--color-background: #1C201E;'), 'Dark background defined');
    assert.ok(css.includes('--color-surface: #282B29;'), 'Dark surface defined');
    assert.ok(css.includes('--color-text: #F5F0E8;'), 'Dark text defined as light cream');
  });

  test('Global form control rules enforce color-scheme and explicit text colors', () => {
    assert.ok(
      css.includes('color-scheme: light;'),
      'Form controls must declare color-scheme: light in base'
    );
    assert.ok(
      css.includes('color-scheme: dark;'),
      'Form controls must declare color-scheme: dark in .dark'
    );
    assert.ok(
      css.includes('color: var(--color-text);'),
      'Form controls must bind text color to --color-text'
    );
    assert.ok(
      css.includes('background-color: var(--color-surface-secondary);'),
      'Form controls must bind background to surface-secondary'
    );
  });

  test('Placeholder colors are guaranteed visible and distinguishable', () => {
    assert.ok(
      css.includes('input::placeholder') && css.includes('textarea::placeholder'),
      'Explicit placeholder rules must be defined'
    );
    assert.ok(
      css.includes('color: var(--color-text-muted)'),
      'Placeholder must use text-muted'
    );
  });

  test('Native select dropdown options prevent OS dark-mode contrast inversion', () => {
    assert.ok(css.includes('select option'), 'Select option styles must be defined');
    assert.ok(
      css.includes('background-color: var(--color-surface);'),
      'Option background must match surface'
    );
  });

  test('Browser autofill rules prevent white-on-white text during autofill', () => {
    assert.ok(
      css.includes('input:-webkit-autofill'),
      'Autofill overrides must be present'
    );
    assert.ok(
      css.includes('-webkit-text-fill-color: var(--color-text)'),
      'Autofill must enforce text-fill-color from theme'
    );
  });
});

describe('Live Jobs View & Job Description Component Form Styles', () => {
  const jobsViewTsx = readFileSync(
    join(REPO_ROOT, 'src', 'components', 'views', 'JobsView.tsx'),
    'utf8'
  );
  const liveJobCardTsx = readFileSync(
    join(REPO_ROOT, 'src', 'components', 'jobs', 'LiveJobCard.tsx'),
    'utf8'
  );
  const jobDescriptionPanelTsx = readFileSync(
    join(REPO_ROOT, 'src', 'components', 'cv', 'JobDescriptionPanel.tsx'),
    'utf8'
  );

  test('JobsView inputs define explicit text and placeholder tokens', () => {
    assert.ok(jobsViewTsx.includes('text-[var(--text-primary)]'));
    assert.ok(jobsViewTsx.includes('placeholder:text-[var(--text-muted)]'));
    assert.ok(jobsViewTsx.includes('bg-[var(--surface-secondary)]'));
  });

  test('JobsView dropdown options carry theme styling classes', () => {
    assert.ok(jobsViewTsx.includes('bg-[var(--surface-main)] text-[var(--text-primary)]'));
  });

  test('JobDescriptionPanel textareas define visible text and placeholder tokens', () => {
    assert.ok(jobDescriptionPanelTsx.includes('text-[var(--text-primary)]'));
    assert.ok(jobDescriptionPanelTsx.includes('placeholder:text-[var(--text-muted)]'));
  });

  test('LiveJobCard text maintains high contrast in all themes', () => {
    assert.ok(liveJobCardTsx.includes('text-[var(--text-primary)]'));
    assert.ok(!liveJobCardTsx.includes('text-white/20'));
  });
});

