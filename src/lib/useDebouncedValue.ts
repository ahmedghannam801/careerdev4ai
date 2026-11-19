/**
 * A trailing-edge debounce for a value the screen derives from the document.
 *
 * The CV editor writes every keystroke into the document, and the paper
 * preview is drawn from that document. Rebuilding a whole sheet of A4 for
 * every character makes typing cost a document render, which is exactly the
 * work a candidate feels as lag on a phone. This hook lets the paper follow
 * the document once the typing has stopped, while the field being typed in
 * keeps updating on every keystroke.
 *
 * It is a *preview* delay, never a data delay: the document itself is written
 * by `updateCV` immediately, so autosave, the Word export and the saved CV all
 * see the newest value. Only the drawing waits.
 */

import { useEffect, useRef, useState } from 'react';

/** The delay the CV paper waits for before it is redrawn. */
export const CV_PREVIEW_DELAY_MS = 160;

export function useDebouncedValue<T>(value: T, delayMs: number = CV_PREVIEW_DELAY_MS): T {
  const [settled, setSettled] = useState(value);
  // The newest value, so the timer that fires delivers the last keystroke
  // rather than the one that was current when the timer was armed.
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (Object.is(settled, value)) return;

    const timer = setTimeout(() => {
      setSettled(latest.current);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, settled, value]);

  return settled;
}
