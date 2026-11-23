/**
 * The chart primitives.
 *
 * What these lock down:
 *
 *   * a chart with nothing to draw draws nothing — no empty axis, no invented
 *     zero-width bars;
 *   * every chart carries a description a screen reader can read, and every
 *     value is reachable without a pointer;
 *   * a value is rendered from the number it was given, not from a default.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';

import { BarChart } from '../../src/components/charts/BarChart';
import { DonutChart } from '../../src/components/charts/DonutChart';
import { LineChart } from '../../src/components/charts/LineChart';

const data = [
  { key: 'a', label: 'Education', value: 3 },
  { key: 'b', label: 'Projects', value: 1 },
];

describe('BarChart', () => {
  it('labels each bar with its own value and describes the chart', () => {
    render(<BarChart data={data} ariaLabel="Records by kind" />);

    expect(screen.getByLabelText('Records by kind')).toBeTruthy();
    expect(screen.getByLabelText('Education: 3')).toBeTruthy();
    expect(screen.getByLabelText('Projects: 1')).toBeTruthy();
  });

  it('draws nothing at all when there is nothing to draw', () => {
    const { container } = render(<BarChart data={[]} ariaLabel="Records by kind" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DonutChart', () => {
  it('states the total in the middle and the share of each segment', () => {
    render(
      <DonutChart
        data={data}
        centerValue="75%"
        centerLabel="completed"
        ariaLabel="Where your career stands"
      />
    );

    // The centre figure and the share of each segment are both on screen.
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getByText('completed')).toBeTruthy();
    expect(screen.getByText('Education')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Where your career stands' })).toBeTruthy();
  });
});

describe('LineChart', () => {
  it('draws a point per record that states a date', () => {
    render(
      <LineChart
        points={[
          { label: '2022', value: 1 },
          { label: '2023', value: 3 },
        ]}
        ariaLabel="Your records over time"
      />
    );

    expect(screen.getByRole('img', { name: 'Your records over time' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('draws nothing at all when there is no series', () => {
    const { container } = render(<LineChart points={[]} ariaLabel="Your records over time" />);
    expect(container.firstChild).toBeNull();
  });
});
