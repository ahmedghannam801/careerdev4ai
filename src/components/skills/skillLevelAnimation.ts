/**
 * The arithmetic behind the skills centre level control.
 *
 * The level model itself lives in `shared/skillEvidence.ts` — a skill is a
 * claim plus whatever the platform can actually prove, and the effective level
 * is the strongest of those. What lives here is only what the interface needs
 * in order to DRAW the control: how wide the bar is, which of the five
 * segments are lit, and what the level-up button would set.
 *
 * It is deliberately free of React and of GSAP so the numbers can be checked
 * without a browser. A control that rounds the wrong way looks, to the
 * candidate, like a level that refuses to move.
 */

/** The highest level the platform recognises. */
export const MAX_SKILL_LEVEL = 5;

/** One segment per level, so the bar and the segments always agree. */
export const SKILL_LEVEL_SEGMENTS = MAX_SKILL_LEVEL;

/**
 * Clamps a level to the 0–5 range the platform understands.
 *
 * 0 is a legal value and not a synonym for 1: it is the level of a skill the
 * candidate has never rated, and the bar has to show it as empty rather than
 * as a quarter filled.
 */
export function clampSkillLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.round(level)));
}

/** The width of the progress fill, as a percentage of the track. */
export function levelToPercent(level: number): number {
  return (clampSkillLevel(level) / MAX_SKILL_LEVEL) * 100;
}

/**
 * The level the level-up control would set: one step higher, and never past
 * the ceiling however many times the button is pressed.
 */
export function nextSkillLevel(level: number): number {
  return Math.min(MAX_SKILL_LEVEL, clampSkillLevel(level) + 1);
}

/** True while there is still a level to gain. */
export function canLevelUp(level: number): boolean {
  return clampSkillLevel(level) < MAX_SKILL_LEVEL;
}

/** True when the segment at this index belongs to the level that is reached. */
export function isSegmentFilled(index: number, level: number): boolean {
  return index < clampSkillLevel(level);
}
