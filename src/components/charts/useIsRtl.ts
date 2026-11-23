import { useSyncExternalStore } from 'react';

/**
 * Whether the page is being read right to left.
 *
 * The application sets `dir` on `<html>` when the language changes, and a
 * chart has to honour it: the first category of a bar chart belongs on the
 * right in Arabic, and the first point of a line chart belongs on the right
 * too. Thirty charts each installing their own `MutationObserver` would be
 * thirty observers for one attribute, so there is one observer here and every
 * chart subscribes to it.
 */

let isRtl = false;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function read(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('dir') === 'rtl';
}

function notify(): void {
  const next = read();
  if (next === isRtl) return;
  isRtl = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer && typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    isRtl = read();
    observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

const getSnapshot = (): boolean => {
  // The first subscriber runs after mount, so the attribute is already there.
  if (typeof document !== 'undefined') {
    const current = read();
    if (current !== isRtl) isRtl = current;
  }
  return isRtl;
};

/** Whether the document is currently rendered right to left. */
export function useIsRtl(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
