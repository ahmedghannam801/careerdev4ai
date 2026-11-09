/**
 * The sections of the "My CV" step.
 * ------------------------------------------------------------------
 * The studio's own navigation is the five steps of the workflow, in
 * `CvStudioWorkflow`. The first step, "My CV", owns four more views of its
 * own: the document and its preview, the templates it can wear, the records
 * it is built from, and the history of its snapshots.
 *
 * Those four used to be a row of plain text links. They read as a caption
 * rather than as places a candidate could go, so they were easy to miss
 * entirely — the studio looked like it had one screen when it has four.
 * They are buttons here: each one carries an icon, a background of its own,
 * a rounded edge and a border, so the row reads as a set of controls.
 *
 * The active section is filled with the brand primary and its label is drawn
 * in the on-primary colour, so the open section is unmistakable at a glance
 * while the closed ones stay plainly recognisable as clickable. The fill
 * travels between the buttons with the same motion as the rest of the
 * product, and collapses to an instant change when the visitor asks for
 * reduced motion.
 *
 * The count of saved snapshots rides on the version history button as a
 * badge, because a history the candidate cannot see the size of is a history
 * they will not think to open. The badge only appears when there is
 * something to count.
 *
 * On a narrow screen the row scrolls sideways instead of wrapping into a tall
 * block or clipping the last button. The buttons are real buttons, in the
 * order they are read, and they carry the same `data-tour` hook the guided
 * tour already points at.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '../../../lib/motion';
import type { CvStudioTab } from '../../../lib/routing';

/** One section of the step: where it goes, what it is called, what it looks like. */
export interface CvStudioSection {
  /** The tab this section opens. */
  tab: CvStudioTab;
  /** The label of the section. */
  label: string;
  /** The icon that tells the sections apart at a glance. */
  icon: LucideIcon;
  /**
   * A number to show as a badge. It is shown only when it is greater than
   * zero: a badge that reads "0" is noise, not a notification.
   */
  badge?: number;
}

export interface CvStudioSectionNavProps {
  /** The sections of the step, in the order they are offered. */
  sections: CvStudioSection[];
  /** The tab the studio is showing. */
  activeTab: CvStudioTab;
  /** Switches the studio to a tab. */
  onSelectTab: (tab: CvStudioTab) => void;
  /** The translation helper. */
  t: (key: string) => string;
}

export const CvStudioSectionNav: React.FC<CvStudioSectionNavProps> = ({
  sections,
  activeTab,
  onSelectTab,
  t,
}) => {
  const reduced = useReducedMotion() ?? false;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const activeRef = React.useRef<HTMLButtonElement>(null);

  // On a narrow screen the row scrolls sideways. When the open section sits
  // outside the visible part of that scroll, it is brought back into it, so
  // the candidate always sees which section they are in. Only the horizontal
  // axis is touched — the page itself is never moved by this.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;

    const scrollerBox = scroller.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const overflowLeft = scrollerBox.left - activeBox.left;
    const overflowRight = activeBox.right - scrollerBox.right;
    if (overflowLeft <= 0 && overflowRight <= 0) return;

    scroller.scrollTo({
      left:
        scroller.scrollLeft +
        (overflowLeft > 0 ? -overflowLeft : overflowRight),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [activeTab, reduced]);

  return (
    <div className="border-b border-[var(--border-subtle)] pb-3">
      <div
        ref={scrollerRef}
        role="group"
        aria-label={t('My CV')}
        className={[
          '-mx-1.5 flex items-center gap-2 overflow-x-auto px-1.5 pt-1.5',
          // The scrollbar is a hint that there is more of the row, not a
          // feature: it is kept thin and quiet so it does not cut the row
          // in half.
          '[scrollbar-width:thin]',
          '[&::-webkit-scrollbar]:h-[6px]',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:bg-[var(--border-strong)]',
        ].join(' ')}
      >
        {sections.map((section) => {
          const active = activeTab === section.tab;
          const Icon = section.icon;
          const badge = section.badge ?? 0;

          return (
            <button
              key={section.tab}
              ref={active ? activeRef : undefined}
              type="button"
              data-tour={section.tab === 'data' ? 'cv-data-tab' : undefined}
              onClick={() => onSelectTab(section.tab)}
              aria-current={active ? 'page' : undefined}
              className={[
                'group relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2',
                'text-xs font-semibold',
                'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]',
                active
                  ? 'border-transparent text-[var(--color-on-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)]',
                // A closed section still has to look like something to press,
                // so it lifts towards the surface above it and takes the
                // brand colour on its icon.
                active
                  ? ''
                  : 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              {/* The active fill. It is drawn behind the icon and the label and
                  it travels between the buttons, so the candidate sees where
                  they are rather than only where they were. */}
              {active && (
                <motion.span
                  aria-hidden="true"
                  layoutId="cv-studio-section"
                  className="absolute inset-0 rounded-xl bg-[var(--accent-primary)] shadow-[var(--shadow-raised)]"
                  transition={{
                    duration: reduced ? 0 : MOTION_DURATION.ui,
                    ease: MOTION_EASE.out,
                  }}
                />
              )}

              <Icon
                className={`relative h-4 w-4 shrink-0 transition-colors duration-150 ${
                  active
                    ? 'text-[var(--color-on-primary)]'
                    : 'text-[var(--text-muted)] group-hover:text-[var(--color-primary-text)]'
                }`}
              />
              <span className="relative">{section.label}</span>

              {badge > 0 && (
                <span
                  className={[
                    'relative inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                    'text-[10px] font-bold tabular-nums transition-colors duration-150',
                    active
                      ? 'bg-[var(--color-on-primary)] text-[var(--accent-primary)]'
                      : 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]',
                  ].join(' ')}
                >
                  <span aria-hidden="true">{badge}</span>
                  {/* The number alone would be read as a bare digit, so it is
                      given the name of what it counts. */}
                  <span className="sr-only">
                    {badge} {t('Saved CV Snapshots')}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
