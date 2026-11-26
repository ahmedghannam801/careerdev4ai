import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CopilotRobot } from '../../src/components/copilot/CopilotRobot';

/**
 * The copilot's mark, exercised as a reader meets it.
 *
 * It is a small drawing of the product's mascot that stands in the chat
 * composer. Two things have to stay true as it is reused:
 *
 *   * it is decorative unless somebody gives it a name, so a screen reader
 *     never reads "Aionvia AI assistant" beside a Send button that already
 *     says Send;
 *   * its state is carried in the markup, not only in an animation, so the
 *     interface can be tested in the state the candidate actually sees.
 */

describe('the copilot robot', () => {
  it('is hidden from a reader when it is only decoration', () => {
    const { container } = render(<CopilotRobot />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelector('title')).toBeNull();
  });

  it('is announced when it is given a name', () => {
    render(<CopilotRobot title="Aionvia is thinking" />);

    const image = screen.getByRole('img', { name: 'Aionvia is thinking' });
    expect(image.getAttribute('aria-hidden')).toBeNull();
  });

  it('reports the state it is drawn in', () => {
    const { container, rerender } = render(<CopilotRobot state="idle" />);
    expect(container.querySelector('svg')?.getAttribute('data-copilot-robot')).toBe('idle');

    rerender(<CopilotRobot state="composing" />);
    expect(container.querySelector('svg')?.getAttribute('data-copilot-robot')).toBe('composing');

    rerender(<CopilotRobot state="thinking" />);
    expect(container.querySelector('svg')?.getAttribute('data-copilot-robot')).toBe('thinking');
  });

  it('draws the mascot: a visor, two lit eyes and the ear pads', () => {
    const { container } = render(<CopilotRobot />);
    const svg = container.querySelector('svg');

    // Three circles and two ear pads: the shapes that make the character
    // recognisable at the size the composer draws it.
    expect(svg?.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
    expect(svg?.querySelectorAll('rect').length).toBeGreaterThanOrEqual(3);
  });
});
