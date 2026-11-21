/**
 * The Career Timeline, drawn as a spiral.
 * ---------------------------------------------------------------------------
 * The timeline used to be a straight list down a page. It was readable and it
 * said nothing about the shape of a career.
 *
 * A spiral says something a list cannot. The records a candidate owns are not
 * equal entries — they accumulate, and the path they take winds outward as the
 * career gets longer. So the earliest record sits at the centre and the newest
 * one is furthest out, and the drawing itself becomes the progress.
 *
 * THE SPIRAL AND THE LIST ARE THE SAME THING.
 *
 * The spiral carries the shape and the states; the list carries the words.
 * A spiral alone cannot be read — the markers are too small to hold a title,
 * and twelve of them would overlap if they tried. A list alone says nothing
 * about the shape. So both are drawn, from the same milestones, and either one
 * opens the same detail panel.
 *
 * NOTHING HERE IS INVENTED.
 *
 * Every marker is a record the candidate really has, and its state is read off
 * that record's own status. A candidate with four records sees four markers.
 *
 * THE DETAIL PANEL IS THE POINT.
 *
 * Clicking a milestone opens the record's own details — the institution, the
 * company, the stage, the dates — read from the record rather than summarised.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

import {
  currentMilestoneId,
  formatMilestoneDate,
  SPIRAL_LITERAL_VALUES,
  SPIRAL_STATE_LABELS,
  spiralLayout,
  spiralMarkerSize,
  spiralPathSegment,
  spiralProgress,
  type SpiralMilestone,
  type SpiralMilestoneState,
} from '../../lib/spiralTimeline';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion';

export interface SpiralTimelineProps {
  /** The milestones, in the career's own order. */
  milestones: SpiralMilestone[];
  /** The translation helper. */
  t: (key: string) => string;
}

/** The colours of each state. The word that names it is in the library. */
const STATE_STYLE: Record<
  SpiralMilestoneState,
  { marker: string; ring: string; text: string }
> = {
  completed: {
    marker: 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--color-on-primary)]',
    ring: 'ring-[var(--accent-primary)]/25',
    text: 'text-[var(--color-success-strong)]',
  },
  current: {
    marker:
      'bg-[var(--surface-main)] border-[var(--accent-primary)] text-[var(--accent-primary)]',
    ring: 'ring-[var(--accent-primary)]/40',
    text: 'text-[var(--color-primary-text)]',
  },
  upcoming: {
    marker: 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-muted)]',
    ring: 'ring-transparent',
    text: 'text-[var(--text-muted)]',
  },
};

export const SpiralTimeline: React.FC<SpiralTimelineProps> = ({ milestones, t }) => {
  const reduced = useReducedMotion() ?? false;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drawingRef = useRef<HTMLDivElement | null>(null);
  const [drawingWidth, setDrawingWidth] = useState(0);

  const layout = useMemo(() => spiralLayout(milestones.length), [milestones.length]);
  const points = layout.points;
  const path = useMemo(() => spiralPathSegment(layout, 1), [layout]);
  const currentId = useMemo(() => currentMilestoneId(milestones), [milestones]);
  const progress = useMemo(() => spiralProgress(milestones), [milestones]);
  const markerSize = spiralMarkerSize(layout.separation, drawingWidth);

  /**
   * The width of the drawing, measured.
   *
   * The markers are sized from the gap the layout affords, and that gap is a
   * fraction of the drawing — so the marker has to be sized from the real
   * width of the drawing, not from an assumed one. On a phone the drawing is
   * narrower, so the markers get smaller rather than covering each other.
   */
  useEffect(() => {
    const node = drawingRef.current;
    if (!node) return;
    const measure = () => setDrawingWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const selected = useMemo(
    () => milestones.find((entry) => entry.id === selectedId) ?? null,
    [milestones, selectedId]
  );

  if (!milestones.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {t('Your career timeline starts here')}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t('Add your education, experience, certifications and projects and they will appear on the spiral as your career grows.')}
        </p>
      </div>
    );
  }

  const toggle = (id: string) => setSelectedId((previous) => (previous === id ? null : id));

  return (
    <div className="space-y-5" data-spiral-timeline>
      {/* How far along the career is. It is the share of records that are
          finished, so it is a fact about the records and not an estimate. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{t('Milestones')}:</span>
          <span>{milestones.length}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-[var(--text-primary)]">{t('Completed')}:</span>
          <span>{milestones.filter((entry) => entry.state === 'completed').length}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">
            {t('Journey completed')}
          </span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* THE SPIRAL
            The column may shrink below the width of the drawing. A grid item
            keeps its content's minimum width by default, so without this the
            spiral pushed the page wider than a phone on a phone. */}
        <div className="relative mx-auto w-full min-w-0 max-w-[26rem]">
          <div className="relative aspect-square w-full" ref={drawingRef}>
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
              focusable="false"
            >
              {/* The path of the spiral. It is drawn behind the markers and
                  carries no meaning of its own beyond "the path travelled". */}
              <path
                d={path}
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth={0.6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* The part already travelled, up to the record happening now.
                  It is drawn on the same layout as the whole spiral, so the
                  travelled line lies exactly on the path. */}
              {currentId
                ? (() => {
                    const currentIndex = milestones.findIndex(
                      (entry) => entry.id === currentId
                    );
                    const share =
                      points.length > 1 ? currentIndex / (points.length - 1) : 0;
                    const travelled = spiralPathSegment(layout, share);
                    return travelled ? (
                      <path
                        d={travelled}
                        fill="none"
                        stroke="var(--accent-primary)"
                        strokeWidth={1.1}
                        strokeLinecap="round"
                        strokeOpacity={0.55}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null;
                  })()
                : null}
            </svg>

            {milestones.map((entry, index) => {
              const point = points[index];
              if (!point) return null;
              const style = STATE_STYLE[entry.state];
              const isCurrent = entry.id === currentId;
              const isSelected = entry.id === selectedId;

              return (
                <motion.button
                  key={entry.id}
                  type="button"
                  data-spiral-marker
                  data-spiral-state={entry.state}
                  onClick={() => toggle(entry.id)}
                  aria-pressed={isSelected}
                  aria-label={`${t(entry.label)}: ${entry.title}. ${t(SPIRAL_STATE_LABELS[entry.state])}.`}
                  initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: reduced ? 0 : MOTION_DURATION.ui,
                    delay: reduced ? 0 : Math.min(index * 0.03, 0.4),
                    ease: MOTION_EASE.out,
                  }}
                  className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[10px] font-bold transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${style.marker} ${
                    isSelected || isCurrent ? `ring-4 ${style.ring}` : ''
                  }`}
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                    width: `${markerSize}px`,
                    height: `${markerSize}px`,
                  }}
                >
                  {entry.state === 'completed' ? (
                    <Check
                      style={{
                        width: Math.max(10, Math.round(markerSize * 0.42)),
                        height: Math.max(10, Math.round(markerSize * 0.42)),
                      }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{ fontSize: Math.max(8, Math.round(markerSize * 0.36)) }}
                    >
                      {index + 1}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* The key to the drawing. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-[var(--text-secondary)]">
            {(Object.keys(STATE_STYLE) as SpiralMilestoneState[]).map((state) => (
              <span key={state} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full border-2 ${STATE_STYLE[state].marker}`}
                />
                {t(SPIRAL_STATE_LABELS[state])}
              </span>
            ))}
          </div>
        </div>

        {/* THE LIST — the same milestones, with their words. */}
        <div className="min-w-0 space-y-2">
          <ul className="space-y-1.5" data-spiral-list>
            {milestones.map((entry) => {
              const style = STATE_STYLE[entry.state];
              const isSelected = entry.id === selectedId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    aria-expanded={isSelected}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
                      isSelected
                        ? 'border-[var(--accent-primary)]/50 bg-[var(--surface-secondary)]/60'
                        : 'border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/35'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${style.marker}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t(entry.label)}
                        {entry.date ? ` · ${formatMilestoneDate(entry.date)}` : ''}
                      </span>
                      <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                        {entry.title || t('Untitled')}
                      </span>
                      {entry.subtitle ? (
                        <span className="block truncate text-[11px] text-[var(--text-secondary)]">
                          {entry.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <span className={`shrink-0 text-[10px] font-semibold ${style.text}`}>
                      {t(SPIRAL_STATE_LABELS[entry.state])}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* THE DETAILS OF THE RECORD THAT WAS CHOSEN. */}
      {selected ? (
        <div
          data-spiral-detail
          className="rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--surface-secondary)]/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t(selected.label)}
              </p>
              <h4 className="truncate text-sm font-bold text-[var(--text-primary)]">
                {selected.title || t('Untitled')}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            >
              {t('Close')}
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {selected.details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t(detail.label)}
                </dt>
                <dd className="truncate text-xs text-[var(--text-primary)]">
                  {SPIRAL_LITERAL_VALUES.has(detail.value) ? t(detail.value) : detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
};

export default SpiralTimeline;
