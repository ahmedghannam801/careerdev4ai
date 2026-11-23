/**
 * The Career Timeline dashboard, driven.
 *
 * The figures themselves are covered by `tests/career-timeline-metrics.test.ts`.
 * These tests cover the part a pure function cannot: that the dashboard draws a
 * chart for the records the candidate really has, that it says so when there is
 * nothing to draw, and that a record's own details are shown exactly as they
 * were written rather than translated.
 *
 * The translation helper is a stub that answers "AR:key", so a value that
 * reaches the page through the translator is visible as such.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';

import { CareerTimelineDashboard } from '../../src/components/career/CareerTimelineDashboard';
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
    state: 'completed',
    details: [{ label: 'Status', value: 'In progress' }],
  },
];

describe('CareerTimelineDashboard', () => {
  it('draws the four figures from the candidate’s own records', () => {
    render(<CareerTimelineDashboard milestones={milestones} t={t} locale="en-GB" />);

    expect(screen.getByTestId('timeline-total').textContent).toContain('3');
    expect(screen.getByTestId('timeline-completed').textContent).toContain('2');
    expect(screen.getByTestId('timeline-current').textContent).toContain('1');
    // Two of three records are finished.
    expect(screen.getByTestId('timeline-completion').textContent).toContain('67%');
  });

  it('draws a chart for the state split, the kinds and the trend', () => {
    render(<CareerTimelineDashboard milestones={milestones} t={t} locale="en-GB" />);

    expect(screen.getByLabelText(/AR:Where your career stands/)).toBeTruthy();
    expect(screen.getByLabelText(/AR:What your records are/)).toBeTruthy();
    expect(screen.getByLabelText('AR:Your records over time')).toBeTruthy();
    expect(screen.getByLabelText('AR:Records added by year')).toBeTruthy();
  });

  it('opens one record’s own details when it is chosen', () => {
    render(<CareerTimelineDashboard milestones={milestones} t={t} locale="en-GB" />);

    expect(screen.queryByText('AR:Institution')).toBeNull();
    fireEvent.click(screen.getByText('BSc Computer Science'));

    // The record's own values reach the panel, and the detail labels come
    // through the translator.
    const panel = document.querySelector('[data-timeline-detail]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Cairo University');
    expect(panel?.textContent).toContain('AR:Institution');
  });

  it('says what to do when there is nothing to chart', () => {
    render(<CareerTimelineDashboard milestones={[]} t={t} locale="en-GB" />);

    expect(screen.getByText('AR:Your career timeline starts here')).toBeTruthy();
    expect(screen.queryByTestId('timeline-total')).toBeNull();
  });
});
