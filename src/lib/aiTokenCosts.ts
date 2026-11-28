/**
 * The cost of every token-spending action, and the label that shows it.
 *
 * A token must never be spent without the candidate knowing what it costs.
 * Every button that triggers a token-spending action therefore shows the cost
 * in its own label, built from the same table the server charges from
 * (`CREDIT_WEIGHTS`), so the number on the button and the number on the
 * ledger can never disagree.
 *
 * Most actions are FREE. A free action has a weight of zero and shows no
 * cost at all: the label stays exactly as it was written, and the action never
 * runs a credit check on the server. Those routes are what a candidate can use
 * with a balance of zero, so a "(0 Tokens)" badge on them would be misleading
 * in the opposite direction.
 *
 * WHILE THE PLATFORM IS FREE
 * --------------------------
 * There is no currency, so no label carries a price. The table is still read,
 * so the two sides cannot drift: the server's own weights and the interface's
 * labels come from the same place, and the same one place decides whether a
 * price is shown at all.
 */

import { CREDIT_WEIGHTS, type AICreditAction } from '../../shared/credits';
import { isMonetizationEnabled } from '../../shared/platformAccess';

/** The translation function the interface uses. */
export type Translate = (key: string) => string;

/**
 * The number of tokens an action costs.
 *
 * The server charges `CREDIT_WEIGHTS[action]`, so this is the same number by
 * construction.
 */
export function aiTokenCost(action: AICreditAction): number {
  return CREDIT_WEIGHTS[action] ?? 0;
}

/**
 * The cost of an action as a suffix for a button label.
 *
 * A paid action renders `"(1 Token)"` or `"(5 Tokens)"`. A free action renders
 * the empty string, so callers can append it to a label without changing the
 * label of a free action.
 */
export function aiTokenCostLabel(action: AICreditAction, t: Translate): string {
  if (!isMonetizationEnabled()) return '';
  const cost = aiTokenCost(action);
  if (cost <= 0) return '';
  const unit = cost === 1 ? t('Token') : t('Tokens');
  return `(${cost} ${unit})`;
}

/**
 * The full label of a token-spending button.
 *
 * A paid action renders "Run ATS Audit (1 Token)". A free action renders just
 * "Run ATS Audit".
 */
export function aiButtonLabel(
  label: string,
  action: AICreditAction,
  t: Translate
): string {
  const costLabel = aiTokenCostLabel(action, t);
  return costLabel ? `${label} ${costLabel}` : label;
}
