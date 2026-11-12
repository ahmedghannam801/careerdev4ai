/**
 * The cost of every token-spending action, and the label that shows it.
 *
 * A token must never be spent without the candidate knowing what it costs.
 * Every button that triggers a token-spending action therefore shows the cost
 * in its own label, built from the same table the server charges from
 * (`CREDIT_WEIGHTS`), so the number on the button and the number on the
 * ledger can never disagree.
 */

import { CREDIT_WEIGHTS, type AICreditAction } from '../../shared/credits';

/** The translation function the interface uses. */
export type Translate = (key: string) => string;

/**
 * The number of tokens an action costs.
 *
 * The server charges `CREDIT_WEIGHTS[action]`, so this is the same number by
 * construction.
 */
export function aiTokenCost(action: AICreditAction): number {
  return CREDIT_WEIGHTS[action] ?? 1;
}

/**
 * The cost of an action as a suffix for a button label.
 *
 * `aiTokenCostLabel('cv_tailoring', t)` returns `"(4 Tokens)"`, so a button
 * reads "Run ATS Audit (4 Tokens)".
 */
export function aiTokenCostLabel(action: AICreditAction, t: Translate): string {
  const cost = aiTokenCost(action);
  const unit = cost === 1 ? t('Token') : t('Tokens');
  return `(${cost} ${unit})`;
}

/**
 * The full label of a token-spending button.
 *
 * `aiButtonLabel('Run ATS Audit', 'cv_tailoring', t)` returns
 * "Run ATS Audit (4 Tokens)".
 */
export function aiButtonLabel(
  label: string,
  action: AICreditAction,
  t: Translate
): string {
  return `${label} ${aiTokenCostLabel(action, t)}`;
}
