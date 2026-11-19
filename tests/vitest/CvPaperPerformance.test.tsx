/**
 * The paper is redrawn once per pause, not once per keystroke.
 *
 * Typing in the CV editor writes the document on every character, which is
 * what makes autosave and the Word export correct. Redrawing a sheet of A4 on
 * every character is a different thing and it is not free: the preview scales
 * a full page, measures it, and paints it again. These tests pin the rule the
 * studio now follows — the paper trails the document by one short delay, and a
 * burst of typing ends in exactly one redraw carrying the last character
 * typed.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import { useDebouncedValue } from '../../src/lib/useDebouncedValue';
import { CvPreview } from '../../src/components/cv/CvPreview';
import { CvTemplateRenderer } from '../../src/components/cv/templates/CvTemplateRenderer';
import { cvTemplateSample } from '../../shared/cvTemplateSample';
import type { CVProfile } from '../../src/types/career';

/** Draws the paper the way the studio does: the document, on a delay. */
function PaperHarness({ cv, onDraw }: { cv: CVProfile; onDraw: () => void }) {
  const paperCv = useDebouncedValue(cv);
  const draw = React.useRef(onDraw);
  draw.current = onDraw;
  // Counted where the paper is drawn, not where the form is rendered: the
  // parent is expected to render on every keystroke.
  React.useEffect(() => {
    draw.current();
  }, [paperCv]);
  return <span data-testid="paper">{paperCv.summary}</span>;
}

describe('the CV paper while the candidate types', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redraws once for a burst of keystrokes, with the last character typed', () => {
    const cv = cvTemplateSample('en');
    let draws = 0;
    const { rerender } = render(<PaperHarness cv={cv} onDraw={() => (draws += 1)} />);

    // The first sheet.
    expect(screen.getByTestId('paper').textContent).toBe(cv.summary);

    // Eight characters, faster than the delay between them.
    for (const summary of ['P', 'Pr', 'Pro', 'Prod', 'Produ', 'Produc', 'Product', 'Product ']) {
      rerender(<PaperHarness cv={{ ...cv, summary }} onDraw={() => (draws += 1)} />);
    }

    expect(draws, 'no redraw while the keys are still arriving').toBe(1);

    act(() => {
      vi.advanceTimersByTime(159);
    });
    expect(draws, 'still waiting for the pause').toBe(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(draws, 'one redraw for the whole burst').toBe(2);
    expect(screen.getByTestId('paper').textContent, 'the last character is drawn').toBe(
      'Product '
    );
  });

  it('gives the paper the same document when nothing was typed', () => {
    const cv = cvTemplateSample('en');
    let draws = 0;
    const { rerender } = render(<PaperHarness cv={cv} onDraw={() => (draws += 1)} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(<PaperHarness cv={cv} onDraw={() => (draws += 1)} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The parent re-rendered, but the document is the same object, so the
    // paper keeps the value it already had and no timer is armed.
    expect(draws).toBe(1);
    expect(screen.getByTestId('paper').textContent).toBe(cv.summary);
  });

  it('stops waiting when the editor is closed mid-keystroke', () => {
    const cv = cvTemplateSample('en');
    let draws = 0;
    const { rerender, unmount } = render(
      <PaperHarness cv={cv} onDraw={() => (draws += 1)} />
    );

    rerender(<PaperHarness cv={{ ...cv, summary: 'Half typed' }} onDraw={() => (draws += 1)} />);
    unmount();

    // Nothing is written after the page is gone: the timer was cleared.
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(5000);
      })
    ).not.toThrow();
    expect(draws).toBe(1);
  });
});

describe('the paper components are remembered by their inputs', () => {
  it('memoises the preview so unrelated studio state does not redraw it', () => {
    expect((CvPreview as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('memoises the renderer so the gallery does not redraw a sheet for nothing', () => {
    expect((CvTemplateRenderer as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo')
    );
  });
});
