/**
 * A read-only value with a copy-to-clipboard control.
 * ------------------------------------------------------------------
 * The recipient account of a manual payment rail is the one value the
 * customer has to copy by hand, so the button confirms the copy with a
 * short animated check instead of a silent state change, and the
 * confirmation is announced to assistive technology through a polite live
 * region.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Copy } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';

export interface CopyFieldProps {
  /** Small label above the value. */
  label: string;
  /** The value the customer copies. */
  value: string;
  /** Optional hint under the value. */
  hint?: string;
  /** The label of the idle copy button. */
  copyLabel: string;
  /** The label shown after a successful copy. */
  copiedLabel: string;
}

export const CopyField: React.FC<CopyFieldProps> = ({
  label,
  value,
  hint,
  copyLabel,
  copiedLabel,
}) => {
  const reduced = useReducedMotion() ?? false;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be refused by the browser. The value stays on
      // screen and selectable, so the customer can still copy it by hand.
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--text-muted)]">{label}</div>
          <div
            dir="ltr"
            className="mt-0.5 select-all break-all font-mono text-base font-bold text-[var(--text-primary)] sm:text-lg"
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              {hint}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-strong)]"
          >
            <AnimatePresence initial={false} mode="wait">
              {copied ? (
                <motion.span
                  key="copied"
                  initial={reduced ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? undefined : { opacity: 0, scale: 0.85 }}
                  transition={{
                    duration: reduced ? 0.01 : MOTION_DURATION.ui,
                    ease: MOTION_EASE.out,
                  }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4 text-[var(--color-success-strong)]" />
                  {copiedLabel}
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={reduced ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? undefined : { opacity: 0, scale: 0.85 }}
                  transition={{
                    duration: reduced ? 0.01 : MOTION_DURATION.ui,
                    ease: MOTION_EASE.out,
                  }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Copy className="h-4 w-4" />
                  {copyLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <span role="status" aria-live="polite" className="sr-only">
            {copied ? copiedLabel : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
