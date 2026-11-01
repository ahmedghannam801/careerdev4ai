/**
 * Guided tours.
 *
 * The product had no way to show a user what a screen is for, and no way to
 * remember that it had already shown them. This module provides both: a
 * spotlight coach-mark that points at the meaningful parts of a screen, and a
 * dismissal that is persisted on the server so the tour appears once and
 * never again.
 *
 * The positioning uses the target element's own bounding box, so the overlay
 * follows the layout and works in both start-to-right and end-to-left
 * layouts without any direction-specific maths.
 */

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { dismissGuide } from '../../lib/personalizationApi';

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
        title: 'How ready you are',
        body: 'This is your readiness for the role you picked. It rises as you rate the skills the role actually asks for.',
      },
      {
        target: '[data-guide="next-action"]',
        title: 'Your next action',
        body: 'The single step worth doing today, taken from the top of your gap list.',
      },
      {
        target: '[data-guide="skill-gaps"]',
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
        title: 'Your roadmap is built for your role',
        body: 'The phases come from the role catalogue, and the steps come from the skills you are actually missing.',
      },
      {
        target: '[data-guide="roadmap-task"]',
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
  /** The interface language, used for the button labels. */
  language: 'en' | 'ar';
  /** Labels for the tour chrome. */
  labels: {
    next: string;
    back: string;
    done: string;
    close: string;
    step: string;
  };
}

interface Position {
  top: number;
  /**
   * The target's offset from the left edge of the viewport.
   *
   * This is a physical coordinate: `getBoundingClientRect` always measures
   * from the left, so it must not be flipped in an Arabic layout.
   */
  left: number;
  width: number;
  height: number;
}

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
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);

  const isRtl = language === 'ar';
  const steps = guide?.steps ?? [];
  const step = steps[stepIndex];

  // Find the target and keep the overlay aligned with it.
  useLayoutEffect(() => {
    if (!step) {
      setPosition(null);
      return;
    }
    const element = document.querySelector(step.target);
    if (!element) {
      setTargetMissing(true);
      setPosition(null);
      return;
    }
    setTargetMissing(false);

    const update = () => {
      const rect = element.getBoundingClientRect();
      setPosition({
        top: rect.top,
        // The bounding box is a physical viewport coordinate, so it must stay
        // physical: a logical inset would move the spotlight to the wrong
        // side of the screen in an Arabic layout.
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  // Skip a step whose target is not on the page.
  useEffect(() => {
    if (!targetMissing || !steps.length) return;
    if (stepIndex >= steps.length - 1) {
      onClose();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [targetMissing, stepIndex, steps.length, onClose]);

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
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guide, finish]);

  if (!guide || !step || !position) return null;

  const cardWidth = 320;
  const cardHeight = 190;
  const margin = 16;

  // Place the card below the target when there is room, otherwise above it.
  const spaceBelow = window.innerHeight - position.top - position.height;
  const placeBelow = spaceBelow > cardHeight + margin * 2;
  const cardTop = placeBelow
    ? position.top + position.height + margin
    : Math.max(margin, position.top - cardHeight - margin);

  // Align the card to the start edge of the target, then keep it on screen.
  const rawLeft = isRtl
    ? position.left + position.width - cardWidth
    : position.left;
  const cardLeft = Math.min(
    Math.max(margin, rawLeft),
    Math.max(margin, window.innerWidth - cardWidth - margin)
  );

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-[rgba(8,10,16,0.55)]"
        onClick={finish}
        aria-hidden="true"
      />

      {/* The spotlight around the target. The position is physical, because
          the bounding box is measured from the left of the viewport. */}
      <div
        className="absolute rounded-xl border-2 border-[var(--color-primary)] transition-all duration-200"
        style={{
          top: position.top - 4,
          left: position.left - 4,
          width: position.width + 8,
          height: position.height + 8,
          boxShadow: '0 0 0 9999px rgba(8,10,16,0.55)',
        }}
        aria-hidden="true"
      />

      <div
        className="absolute rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
          minHeight: cardHeight,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {step.title}
          </h3>
          <button
            type="button"
            onClick={finish}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            aria-label={labels.close}
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            {labels.step} {stepIndex + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                {labels.back}
              </button>
            )}
            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {labels.next}
                {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <Check size={14} />
                {labels.done}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
