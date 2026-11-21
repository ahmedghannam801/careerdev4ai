/**
 * The spiral career timeline, driven.
 *
 * The pure geometry is covered by `tests/spiral-timeline.test.ts`. These tests
 * cover the part geometry cannot: that the drawing puts one marker on screen
 * per record, that a marker opens that record's own details, and that the
 * candidate's data is shown exactly as it was written rather than translated.
 *
 * The translation helper is deliberately a stub that answers "AR:key" — so a
 * value that reaches the page through the translator is visible as such.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';

import { SpiralTimeline } from '../../src/components/career/SpiralTimeline';
import type { SpiralMilestone } from '../../src/lib/spiralTimeline';

const t = (key: string) => `AR:${key}`;

const milestones: SpiralMilestone[] = [
  {
    id: 'edu-1',
    kind: 'education',
    label: 'Education',
    title: 'BSc Computer Science',
    subtitle: 'Cairo University',
    date: '2019-09-01',
    state: 'completed',
    details: [
      { label: 'Institution', value: 'Cairo University' },
      { label: 'Verified', value: 'Yes' },
    ],
  },
  {
    id: 'exp-1',
    kind: 'experience',
    label: 'Experience',
    title: 'Data Analyst',
    subtitle: 'Meridian Health',
    date: '2022-03-01',
    state: 'current',
    details: [
      { label: 'Company', value: 'Meridian Health' },
      { label: 'Role', value: 'Data Analyst' },
    ],
  },
  {
    id: 'proj-1',
    kind: 'project',
    label: 'Project',
    title: 'Churn dashboard',
    subtitle: 'Advanced',
    date: '2024-05-01',
    state: 'upcoming',
    details: [{ label: 'Status', value: 'In progress' }],
  },
];

describe('SpiralTimeline', () => {
  it('draws one marker per record, with its own state', () => {
    const { container } = render(<SpiralTimeline milestones={milestones} t={t} />);

    const markers = container.querySelectorAll('[data-spiral-marker]');
    expect(markers).toHaveLength(milestones.length);

    expect(container.querySelector('[data-spiral-state="completed"]')).not.toBeNull();
    expect(container.querySelector('[data-spiral-state="current"]')).not.toBeNull();
    expect(container.querySelector('[data-spiral-state="upcoming"]')).not.toBeNull();
  });

  it('names each marker for a screen reader in the interface language', () => {
    const { container } = render(<SpiralTimeline milestones={milestones} t={t} />);

    const marker = container.querySelector('[data-spiral-marker]') as HTMLElement;
    // The label is built from the translated words, while the candidate's own
    // title is left exactly as it was written.
    expect(marker.getAttribute('aria-label')).toContain('AR:Education');
    expect(marker.getAttribute('aria-label')).toContain('BSc Computer Science');
  });

  it('opens the record’s own details when its marker is pressed', () => {
    const { container } = render(<SpiralTimeline milestones={milestones} t={t} />);

    expect(container.querySelector('[data-spiral-detail]')).toBeNull();

    const currentMarker = container.querySelector(
      '[data-spiral-marker][data-spiral-state="current"]'
    ) as HTMLElement;
    fireEvent.click(currentMarker);

    const detail = container.querySelector('[data-spiral-detail]') as HTMLElement;
    expect(detail).not.toBeNull();

    // The record's own values, not a translation of them.
    expect(within(detail).getByText('Meridian Health')).toBeInTheDocument();
    // The role is both the panel's heading and one of its rows, so it appears
    // more than once — and every appearance is the candidate's own words.
    expect(within(detail).getAllByText('Data Analyst').length).toBeGreaterThan(0);
    // A word the platform chose is translated.
    expect(within(detail).getByText('AR:Company')).toBeInTheDocument();
  });

  it('closes the details again from the panel’s own control', () => {
    const { container } = render(<SpiralTimeline milestones={milestones} t={t} />);

    fireEvent.click(container.querySelector('[data-spiral-marker]') as HTMLElement);
    expect(container.querySelector('[data-spiral-detail]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'AR:Close' }));
    expect(container.querySelector('[data-spiral-detail]')).toBeNull();
  });

  it('shows the empty state, not an empty drawing, when there are no records', () => {
    const { container } = render(<SpiralTimeline milestones={[]} t={t} />);

    expect(container.querySelector('[data-spiral-timeline]')).toBeNull();
    expect(container.querySelector('[data-spiral-marker]')).toBeNull();
    expect(screen.getByText('AR:Your career timeline starts here')).toBeInTheDocument();
  });
});
