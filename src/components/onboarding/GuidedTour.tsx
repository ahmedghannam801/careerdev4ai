/**
 * Guided tours.
 *
 * The product had no way to show a user what a screen is for, and no way to
 * remember that it had already shown them. This module provides both: a
 * spotlight coach-mark that points at the meaningful parts of a screen, and a
 * dismissal that is persisted on the server so the tour appears once and
 * never again.
 *
 * The behaviour is shared with the long product tour through `useSpotlight`:
 *
 *  - the dimming is a ring around the target, so the element the instruction
 *    is talking about stays fully visible instead of being darkened with the
 *    rest of the page;
 *  - the instruction card is placed beside the target and is never allowed to
 *    cover it;
 *  - the placement follows the layout, so it works in both start-to-right and
 *    end-to-left layouts without any direction-specific maths.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { dismissGuide } from '../../lib/personalizationApi';
import { useCareer } from '../../context/CareerContext';
import { placeTooltip, useSpotlight } from './useSpotlight';

export type GuideKey =
  | 'dashboard'
  | 'roadmap'
  | 'learning'
  | 'projects'
  | 'volunteer'
  | 'cv'
  | 'skills';

export interface GuideStep {
  /** The CSS selector of the element the step points at. */
  target: string;
  /** Selectors tried in order when the primary target is not on the page. */
  fallbacks?: string[];
  title: string;
  body: string;
}

export interface GuideDefinition {
  key: GuideKey;
  steps: GuideStep[];
}

/**
 * The tours, one per area of the product.
 *
 * Each step points at an element that exists on the screen it belongs to, so
 * a step whose target is missing is skipped rather than shown in the wrong
 * place.
 */
export const GUIDES: GuideDefinition[] = [
  {
    key: 'dashboard',
    steps: [
      {
        target: '[data-guide="readiness"]',
        fallbacks: ['#main-content'],
        title: 'How ready you are',
        body: 'This is your readiness for the role you picked. It rises as you rate the skills the role actually asks for.',
      },
      {
        target: '[data-guide="next-action"]',
        fallbacks: ['#main-content'],
        title: 'Your next action',
        body: 'The single step worth doing today, taken from the top of your gap list.',
      },
      {
        target: '[data-guide="skill-gaps"]',
        fallbacks: ['#main-content'],
        title: 'Your skill gaps',
        body: 'Every skill the role needs, sorted by how urgent it is. Critical means it is holding you back.',
      },
    ],
  },
  {
    key: 'roadmap',
    steps: [
      {
        target: '[data-guide="roadmap-summary"]',
        fallbacks: ['#main-content'],
        title: 'Your roadmap is built for your role',
        body: 'The phases come from the role catalogue, and the steps come from the skills you are actually missing.',
      },
      {
        target: '[data-guide="roadmap-task"]',
        fallbacks: ['#main-content'],
        title: 'One step at a time',
        body: 'Every step says which skill it closes, how long it should take, what has to come first, and which course and project to use.',
      },
    ],
  },
  {
    key: 'learning',
    steps: [
      {
        target: '[data-guide="learning-reason"]',
        fallbacks: ['#main-content'],
        title: 'Why this course',
        body: 'Each recommendation explains the gap it closes and the score that put it in your list.',
      },
    ],
  },
  {
    key: 'projects',
    steps: [
      {
        target: '[data-guide="projects"]',
        fallbacks: ['#main-content'],
        title: 'Projects that prove the skill',
        body: 'A project is worth more than a certificate. These are the ones that match the skills you still need.',
      },
    ],
  },
  {
    key: 'volunteer',
    steps: [
      {
        target: '[data-guide="volunteer-opportunities"]',
        fallbacks: ['#main-content'],
        title: 'Volunteering that counts',
        body: 'These are real organisations you can apply to, ordered by how closely they match the skills you still need.',
      },
    ],
  },
  {
    key: 'cv',
    steps: [
      {
        target: '[data-guide="cv-build"]',
        fallbacks: ['#main-content'],
        title: 'Your CV, built from your data',
        body: 'CareerDev4AI assembles this from the experience, skills, projects, volunteering and courses you have entered. It never invents anything.',
      },
    ],
  },
  {
    key: 'skills',
    steps: [
      {
        target: '[data-guide="skills-gaps"]',
        fallbacks: ['#main-content'],
        title: 'Rate what you can do',
        body: 'Your ratings are what make the roadmap, the learning and the volunteer list specific to you.',
      },
    ],
  },
];

interface GuidedTourProps {
  /** The guide to run, or null when nothing should be shown. */
  guide: GuideDefinition | null;
  /** Called when the user finishes or dismisses the tour. */
  onClose: () => void;
  /** The interface language, used for the direction of the chevrons. */
  language: 'en' | 'ar';
  /** Labels for the tour chrome. */
  labels: {
    next: string;
    back: string;
    done: string;
    close: string;
    step: string;
    skip: string;
  };
}

const CARD_WIDTH = 320;
const CARD_HEIGHT = 210;

/**
 * Renders a coach-mark over the element the current step points at.
 *
 * When the target element is not on the page — the user may be on a
 * different tab — the step is skipped, and the tour moves on.
 */
export const GuidedTour: React.FC<GuidedTourProps> = ({
  guide,
  onClose,
  language,
  labels,
}) => {
  const { t } = useCareer();
  const [stepIndex, setStepIndex] = useState(0);

  const isRtl = language === 'ar';
  const steps = guide?.steps ?? [];
  const step = steps[stepIndex];

  const { rect, missing } = useSpotlight({
    target: step?.target ?? '',
    fallbacks: step?.fallbacks,
    active: Boolean(step),
  });

  // The card follows the target. The viewport size is read from the window on
  // every render, and the spotlight measurement re-renders on a resize, so
  // the two stay in step.
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const placement = useMemo(
    () =>
      placeTooltip({
        rect,
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        isRtl,
      }),
    [rect, viewport.width, viewport.height, isRtl]
  );

  // Skip a step whose target is not on the page.
  useEffect(() => {
    if (!missing || !steps.length) return;
    if (stepIndex >= steps.length - 1) {
      onClose();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [missing, stepIndex, steps.length, onClose]);

  const finish = useCallback(() => {
    if (guide) {
      void dismissGuide(guide.key).catch(() => {
        // A failed dismissal is not worth interrupting the user for. The tour
        // will be offered again next time, which is harmless.
      });
    }
    onClose();
  }, [guide, onClose]);

  useEffect(() => {
    if (!guide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight' && !isRtl) {
        setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      }
      if (event.key === 'ArrowLeft' && !isRtl) {
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guide, finish, isRtl, steps.length]);

  if (!guide || !step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const isSheet = placement.placement === 'sheet';

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/*
        The click catcher. It is deliberately transparent: the dimming is
        drawn by the spotlight below, as a ring, so the highlighted element
        stays bright while everything else fades back.
      */}
      <div className="absolute inset-0" onClick={finish} aria-hidden="true" />

      {/* The spotlight ring around the target. */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[var(--color-primary)] transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(8,10,16,0.58)',
          }}
          aria-hidden="true"
        />
      )}

      <div
        className={
          isSheet
            ? 'fixed inset-x-3 bottom-3 max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-2xl'
            : 'absolute rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-2xl'
        }
        style={
          isSheet
            ? undefined
            : {
                top: placement.top,
                left: placement.left,
                width: CARD_WIDTH,
              }
        }
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t(step.title)}
          </h3>
          <button
            type="button"
            onClick={finish}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            aria-label={labels.close}
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {t(step.body)}
        </p>

        {/* The progress dots double as the step counter. */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === stepIndex
                  ? 'w-5 bg-[var(--color-primary)]'
                  : index < stepIndex
                    ? 'w-1.5 bg-[var(--color-primary)]/40'
                    : 'w-1.5 bg-[var(--border-subtle)]'
              }`}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline"
          >
            {labels.skip}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {labels.step} {stepIndex + 1} / {steps.length}
            </span>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              >
                {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                {labels.back}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
              >
                <Check size={14} />
                {labels.done}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
              >
                {labels.next}
                {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
