import { useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { AnimatedCounter } from '../react-bits/AnimatedCounter';
import { MagnetButton } from '../react-bits/MagnetButton';
import {
  MAX_SKILL_LEVEL,
  SKILL_LEVEL_SEGMENTS,
  canLevelUp,
  clampSkillLevel,
  isSegmentFilled,
  levelToPercent,
  nextSkillLevel,
} from './skillLevelAnimation';

interface SkillLevelBarProps {
  /** The level the platform currently holds for this skill. */
  level: number;
  /** The level the target role asks for. */
  targetLevel: number;
  /** True when the skill already meets its target. */
  metTarget: boolean;
  /** Called with the level the candidate asked for. */
  onLevelChange: (level: number) => void;
  t: (key: string) => string;
  /** Readouts that belong beside the level badge. */
  aside?: ReactNode;
}

/**
 * The edge a segment's fill grows from.
 *
 * `transform-origin` has no logical keyword, so the direction is read from the
 * element itself: the Arabic interface flips the document to RTL, and there
 * the fill has to grow from the right so the bar reads the same way as the
 * text beside it.
 */
function segmentOrigin(element: HTMLElement): string {
  if (typeof window === 'undefined') return 'left center';
  return getComputedStyle(element).direction === 'rtl' ? 'right center' : 'left center';
}

/**
 * The level control of one skill: the numeric badge, the progress bar, the
 * five level segments and the slider.
 *
 * The bar is drawn optimistically. The context writes the new level into its
 * own state before the request leaves, so this component is handed the new
 * level immediately and animates towards it while the request is still in
 * flight. If the request fails the context puts the old level back, the same
 * effect runs again, and the bar travels back from wherever it actually is —
 * which is why the starting width is measured from the DOM rather than
 * remembered from the last level.
 */
export function SkillLevelBar({
  level,
  targetLevel,
  metTarget,
  onLevelChange,
  t,
  aside,
}: SkillLevelBarProps) {
  const reduced = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const segmentFills = useRef<(HTMLDivElement | null)[]>([]);
  const segmentTracks = useRef<(HTMLDivElement | null)[]>([]);
  const appliedOrigins = useRef<(string | null)[]>([]);
  const initialised = useRef(false);

  // The width the fill is painted with the first time it is rendered. React
  // keeps this value for the life of the component and therefore never writes
  // to the width again; from the first tween onwards GSAP owns it, which is
  // what lets a tween start from wherever the bar currently is.
  const [initialWidth] = useState(() => levelToPercent(level));

  const clamped = clampSkillLevel(level);
  const percent = levelToPercent(level);
  const up = canLevelUp(level);
  const fillColour = metTarget
    ? 'bg-[var(--color-success-strong)]'
    : 'bg-[var(--color-primary)]';

  /**
   * Points a segment's fill at the edge it grows from.
   *
   * The origin is only written when it changes: GSAP re-bases the transform
   * around a new origin, and re-writing the same one would move a fill that is
   * already scaled. It is remembered per segment, because a segment that has
   * not moved yet still needs the origin it will grow from.
   */
  const applyOrigin = (segment: HTMLElement, index: number) => {
    const origin = segmentOrigin(segment);
    if (appliedOrigins.current[index] === origin) return;
    appliedOrigins.current[index] = origin;
    gsap.set(segment, { transformOrigin: origin });
  };

  useGSAP(() => {
    const fill = fillRef.current;
    const track = trackRef.current;
    if (!fill || !track) return;

    if (reduced || !initialised.current) {
      // Reduced motion, and the very first paint: the values are simply set.
      // Nothing moves, but every number is still correct.
      //
      // The tweens that may still be running are killed first. A preference
      // that switches on mid-flight would otherwise be overruled by the
      // animation that was already under way.
      gsap.killTweensOf(fill);
      gsap.set(fill, { width: `${percent}%` });
      for (let index = 0; index < SKILL_LEVEL_SEGMENTS; index += 1) {
        const segment = segmentFills.current[index];
        if (!segment) continue;
        gsap.killTweensOf(segment);
        gsap.set(segment, { scaleX: isSegmentFilled(index, level) ? 1 : 0 });
        applyOrigin(segment, index);
        const segmentTrack = segmentTracks.current[index];
        if (segmentTrack) {
          gsap.killTweensOf(segmentTrack);
          gsap.set(segmentTrack, { scaleY: 1 });
        }
      }
      initialised.current = true;
      return;
    }

    // The width the bar is showing right now, measured from the DOM instead of
    // remembered. A level-up that is rolled back before it has finished
    // therefore carries on from where it actually is rather than jumping.
    const trackWidth = track.getBoundingClientRect().width;
    const fillWidth = fill.getBoundingClientRect().width;
    const from = trackWidth > 0 ? (fillWidth / trackWidth) * 100 : percent;

    gsap.killTweensOf(fill);
    gsap.fromTo(
      fill,
      { width: `${from}%` },
      { width: `${percent}%`, duration: 0.6, ease: 'power3.out' },
    );

    // The segments: only the ones that actually changed move, and they move
    // one after another so that a level reads as a sequence rather than a jump.
    const changed: Array<{ index: number; target: number; current: number }> = [];
    for (let index = 0; index < SKILL_LEVEL_SEGMENTS; index += 1) {
      const segment = segmentFills.current[index];
      if (!segment) continue;
      const target = isSegmentFilled(index, level) ? 1 : 0;
      const current = Number(gsap.getProperty(segment, 'scaleX')) || 0;
      if (Math.abs(current - target) < 0.001) continue;
      changed.push({ index, target, current });
    }

    changed.forEach((change, order) => {
      const segment = segmentFills.current[change.index];
      const segmentTrack = segmentTracks.current[change.index];
      if (!segment) return;
      const delay = order * 0.06;

      applyOrigin(segment, change.index);
      gsap.to(segment, {
        scaleX: change.target,
        duration: 0.45,
        ease: change.target > change.current ? 'back.out(2.4)' : 'power2.inOut',
        delay,
        overwrite: 'auto',
      });

      // The segment itself pops as it fills. This is what makes the sequence
      // read as a spring rather than as a colour change.
      if (segmentTrack && change.target > change.current) {
        gsap.fromTo(
          segmentTrack,
          { scaleY: 0.55 },
          {
            scaleY: 1,
            duration: 0.7,
            ease: 'elastic.out(1, 0.45)',
            delay,
            overwrite: 'auto',
          },
        );
      }
    });
  }, { dependencies: [level, reduced] });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--text-primary)] font-semibold">
            {t('Current:')} <AnimatedCounter value={clamped} duration={0.35} /> / 5
          </span>
          <MagnetButton
            type="button"
            onClick={() => onLevelChange(nextSkillLevel(level))}
            disabled={!up}
            aria-label={t('Level up')}
            title={up ? t('Level up') : t('Maximum level reached')}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
              up
                ? 'border-[var(--border-strong)] bg-[var(--accent-surface)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--color-on-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-muted)] opacity-60 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </MagnetButton>
        </div>
        {aside}
      </div>

      {/* The bar, with the target marked on it.
          A slider alone says "you are here"; the bar says how far that is from
          what the role asks for. The marker is placed with a logical property
          so it sits on the same side in Arabic as it does in English. */}
      <div
        ref={trackRef}
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-progress-track)]"
        role="img"
        aria-label={t('Current level {current} of 5. Target level {target} of 5.')
          .replace('{current}', String(clamped))
          .replace('{target}', String(targetLevel))}
      >
        {/* The fill is anchored to the inline start of the track, so it grows
            from the right in Arabic. It is absolutely positioned for a second
            reason: an animated width then costs the fill's own box instead of
            the track's layout. */}
        <div
          ref={fillRef}
          className={`absolute inset-y-0 start-0 rounded-full ${fillColour}`}
          style={{ width: `${initialWidth}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--text-primary)]"
          style={{ insetInlineStart: `${levelToPercent(targetLevel)}%` }}
          aria-hidden="true"
        />
      </div>

      {/* The five levels, one segment each. The segments restate what the bar
          and the badge already say, so they are decoration for the eye and
          are hidden from the screen reader. */}
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: SKILL_LEVEL_SEGMENTS }, (_, index) => (
          <div
            key={index}
            ref={(element) => {
              segmentTracks.current[index] = element;
            }}
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-progress-track)]"
          >
            <div
              ref={(element) => {
                segmentFills.current[index] = element;
              }}
              className={`absolute inset-0 h-full w-full rounded-full ${fillColour}`}
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
        ))}
      </div>

      <input
        type="range"
        min="1"
        max={MAX_SKILL_LEVEL}
        value={Math.max(1, clamped)}
        onChange={(event) => onLevelChange(parseInt(event.target.value, 10))}
        aria-label={t('Skill level')}
        className="w-full accent-[var(--accent-primary)] cursor-pointer"
      />
    </div>
  );
}
