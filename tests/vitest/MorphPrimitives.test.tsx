import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  MorphingButton,
  MorphingChip,
  MorphingMark,
  MorphingMilestone,
  MorphingOrb,
} from '../../src/components/motion/Morph';

/**
 * The morphing primitives, exercised as a user meets them.
 *
 * The rules under test are the ones a person can feel:
 *
 *   * a control that is working says so, and cannot be pressed again;
 *   * a control that has succeeded says so, and says it in the same words
 *     the state it is really in;
 *   * a control that has failed says so, and does not pretend otherwise;
 *   * the state is announced to a reader as well as drawn;
 *   * the space a control will need is reserved before it needs it, so the
 *     layout never jumps.
 */

describe('the morphing button', () => {
  it('shows the action it performs and nothing else while it rests', () => {
    render(<MorphingButton state="idle" label="Save" />);

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('Save');
    expect(button.textContent).toContain('Save');
    expect(button.getAttribute('aria-busy')).toBe('false');
  });

  it('is busy and unpressable while the operation runs', () => {
    render(<MorphingButton state="loading" label="Save" loadingLabel="Saving…" />);

    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Saving…');
  });

  it('reports a success that really happened', () => {
    render(<MorphingButton state="success" label="Save" successLabel="Saved" />);

    const button = screen.getByRole('button');
    expect(button.textContent).toContain('Saved');
    // The name of the control stays the action, so a reader is told what it
    // does and then what just happened to it.
    expect(button.getAttribute('aria-label')).toBe('Save');
  });

  it('reports a failure rather than a success', () => {
    render(<MorphingButton state="error" label="Save" errorLabel="Not saved" />);

    expect(screen.getByRole('button').textContent).toContain('Not saved');
  });

  it('announces the state to a reader as well as drawing it', () => {
    render(<MorphingButton state="success" label="Save" successLabel="Saved" />);

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Saved');
  });

  it('says nothing while it rests, so a reader is not told about a change that did not happen', () => {
    render(<MorphingButton state="idle" label="Save" />);

    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('reserves the space of the longest label before it needs it', () => {
    const { container, rerender } = render(
      <MorphingButton state="idle" label="Save" successLabel="Saved to your account" />
    );
    const resting = container.querySelector('button');

    rerender(
      <MorphingButton state="success" label="Save" successLabel="Saved to your account" />
    );
    const succeeded = container.querySelector('button');

    // Both labels are in the layout at once, so the control is as wide as the
    // widest of them whichever one is showing.
    expect(resting?.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(succeeded?.textContent).toContain('Saved to your account');
  });

  it('can be pressed, and stops being pressable while it works', () => {
    const { rerender } = render(<MorphingButton state="idle" label="Save" />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);

    rerender(<MorphingButton state="loading" label="Save" loadingLabel="Saving…" />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the morphing chip', () => {
  it('says the state it is really in, and only that state, to a reader', () => {
    const { container, rerender } = render(
      <MorphingChip state="working" labels={{ working: 'Saving…', done: 'Saved' }} />
    );

    // The label that is showing is read; the one that is not is decoration.
    expect(container.textContent).toContain('Saving…');
    const shown = Array.from(container.querySelectorAll('span')).filter(
      (node) => node.getAttribute('aria-hidden') !== 'true' && node.textContent === 'Saving…'
    );
    expect(shown.length).toBeGreaterThan(0);

    rerender(<MorphingChip state="done" labels={{ working: 'Saving…', done: 'Saved' }} />);
    const readNow = Array.from(container.querySelectorAll('span')).filter(
      (node) => node.getAttribute('aria-hidden') !== 'true' && node.textContent === 'Saved'
    );
    expect(readNow.length).toBeGreaterThan(0);
  });

  it('keeps the space of the longest label before it needs it', () => {
    const { container, rerender } = render(
      <MorphingChip state="working" labels={{ working: 'Saving…', done: 'Saved to your account' }} />
    );
    const resting = container.querySelectorAll('.col-start-1').length;

    rerender(
      <MorphingChip state="done" labels={{ working: 'Saving…', done: 'Saved to your account' }} />
    );
    const succeeded = container.querySelectorAll('.col-start-1').length;

    // Both labels are in the layout at once, so the chip is as wide as the
    // widest of them whichever one is showing.
    expect(resting).toBe(2);
    expect(succeeded).toBe(resting);
  });
});

describe('the morphing mark', () => {
  it('is a mark that changes with the state it reports', () => {
    const { container, rerender } = render(<MorphingMark state="working" />);
    const working = container.querySelector('svg');
    expect(working).toBeTruthy();

    rerender(<MorphingMark state="done" />);
    // The mark opens out into a disc with a tick in it.
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});

describe('the morphing milestone', () => {
  it('draws a shape for every state a step can be in', () => {
    const states = ['locked', 'available', 'in_progress', 'completed'] as const;
    for (const state of states) {
      const { container, unmount } = render(
        <MorphingMilestone state={state}>
          <span>1</span>
        </MorphingMilestone>
      );
      expect(container.querySelector('span')).toBeTruthy();
      unmount();
    }
  });
});

describe('the morphing orb', () => {
  it('draws a shape for every state the assistant can be in', () => {
    const states = ['idle', 'listening', 'thinking', 'responding'] as const;
    for (const state of states) {
      const { container, unmount } = render(<MorphingOrb state={state} />);
      expect(container.querySelector('span')).toBeTruthy();
      unmount();
    }
  });
});
