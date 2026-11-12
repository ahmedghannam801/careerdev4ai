/**
 * Builds a translatable sentence out of a skill gap.
 *
 * The gap engine produces the facts; this file turns them into a sentence in
 * the user's own language. The English sentence the server produces
 * (`describeGap`) cannot be translated because it is already a finished
 * string — so the interface uses the structured explanation instead.
 */

import type { GapExplanation } from '../../shared/skillGap';

/** The translator, as returned by `useCareer().t`. */
export type Translate = (source: string) => string;

/**
 * The reason a gap is prioritised, in the user's language.
 *
 * The two sentences match `describeGap` exactly in English, so the server and
 * the browser say the same thing.
 */
export function explainGapTranslated(explanation: GapExplanation, t: Translate): string {
  if (explanation.met) {
    return t('You already meet the {level}/5 this role expects for {skill}.')
      .replace('{level}', String(explanation.requiredLevel))
      .replace('{skill}', explanation.name);
  }

  const urgency = t(
    {
      blocks_the_role: 'blocks the role',
      major_requirement: 'is a major requirement',
      worth_closing_next: 'is worth closing next',
      nice_to_have: 'is a nice-to-have',
    }[explanation.urgency]
  );

  return t('{skill} is at {current}/5 and this role expects {required}/5 — {urgency}.')
    .replace('{skill}', explanation.name)
    .replace('{current}', String(explanation.currentLevel))
    .replace('{required}', String(explanation.requiredLevel))
    .replace('{urgency}', urgency);
}
