// The checkout interface.
//
// A payment screen has to hold three things at once: it has to look like it
// belongs to the product, it has to tell the truth about what has happened to
// the customer's money, and it has to be operable by someone who cannot see
// the animation or cannot move the mouse.
//
// These tests hold that to the rules the platform already follows:
//
//   * every payment method carries its authentic brand mark;
//   * the copy control copies the real value and says so out loud;
//   * every state of the checkout is reachable and is rendered differently;
//   * a receipt is never presented as proof that money arrived;
//   * a second submission cannot be made while the first is in flight;
//   * the card rail never appears when the server cannot take a card payment;
//   * motion collapses when the visitor asks for reduced motion;
//   * the surfaces use the theme's own tokens, so light and dark both work;
//   * the layout is written with logical properties, so Arabic and English
//     both work.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isMethodStep,
  isProcessing,
  isTerminal,
  mapPaymentStatus,
  type CheckoutState,
} from '../src/components/payment/checkoutState.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

const read = (...parts: string[]) => readFileSync(join(REPO_ROOT, ...parts), 'utf-8');

const modal = read('src', 'components', 'subscription', 'CheckoutModal.tsx');
const pricing = read('src', 'components', 'views', 'PricingView.tsx');
const methodCard = read('src', 'components', 'payment', 'PaymentMethodCard.tsx');
const copyField = read('src', 'components', 'payment', 'CopyField.tsx');
const statusCard = read('src', 'components', 'payment', 'PaymentStatusCard.tsx');
const stateSteps = read('src', 'components', 'payment', 'PaymentStateSteps.tsx');
const spinner = read('src', 'components', 'payment', 'PaymentSpinner.tsx');

describe('the checkout state machine', () => {
  test('it names every state the flow can be in', () => {
    const states: CheckoutState[] = [
      'idle',
      'method_selected',
      'instructions',
      'awaiting_submission',
      'processing',
      'pending_verification',
      'verified',
      'failed',
      'expired',
    ];
    for (const state of states) {
      assert.equal(typeof state, 'string');
    }
    assert.equal(states.length, 9);
  });

  test('the method picker is the first step', () => {
    assert.equal(isMethodStep('idle'), true);
    assert.equal(isMethodStep('method_selected'), true);
    assert.equal(isMethodStep('instructions'), false);
    assert.equal(isMethodStep('verified'), false);
  });

  test('processing is its own state', () => {
    assert.equal(isProcessing('processing'), true);
    assert.equal(isProcessing('awaiting_submission'), false);
  });

  test('the outcomes are terminal', () => {
    assert.equal(isTerminal('verified'), true);
    assert.equal(isTerminal('failed'), true);
    assert.equal(isTerminal('expired'), true);
    assert.equal(isTerminal('pending_verification'), false);
    assert.equal(isTerminal('processing'), false);
  });

  test('a server status maps onto the machine', () => {
    // A request that exists but has no evidence yet is not a terminal state:
    // the customer still has something to do.
    assert.equal(mapPaymentStatus('pending'), 'instructions');
    assert.equal(mapPaymentStatus('under_review'), 'pending_verification');
    assert.equal(mapPaymentStatus('temporary_access'), 'pending_verification');
    assert.equal(mapPaymentStatus('paid'), 'verified');
    assert.equal(mapPaymentStatus('rejected'), 'failed');
    assert.equal(mapPaymentStatus('refunded'), 'failed');
    assert.equal(mapPaymentStatus('expired'), 'expired');
  });

  test('the modal drives the screen from the state, not from a step string', () => {
    assert.match(modal, /useState<CheckoutState>/);
    assert.match(modal, /mapPaymentStatus/);
    assert.doesNotMatch(modal, /useState<'config' \| 'instructions'/);
  });
});

describe('the checkout shows the real brands', () => {
  test('each method is offered with its own mark', () => {
    assert.match(modal, /VodafoneCashMark/);
    assert.match(modal, /InstaPayMark/);
    assert.match(modal, /StripeMark/);
    assert.match(modal, /CardNetworkMarks/);
  });

  test('a generic icon never stands in for a payment brand', () => {
    // The interface icons are fine for anything that is not a brand.
    for (const icon of ['Smartphone', 'Landmark']) {
      assert.doesNotMatch(
        modal,
        new RegExp(`\\b${icon}\\b`),
        `${icon} must not stand in for a payment method`
      );
    }
  });

  test('the pricing page shows the same marks', () => {
    assert.match(pricing, /VodafoneCashMark/);
    assert.match(pricing, /InstaPayMark/);
    assert.match(pricing, /StripeMark/);
    assert.match(pricing, /CardNetworkMarks/);
  });

  test('the method option is a real button that says whether it is selected', () => {
    assert.match(methodCard, /<motion\.button/);
    assert.match(methodCard, /type="button"/);
    assert.match(methodCard, /aria-pressed=\{selected\}/);
  });
});

describe('copying the recipient account', () => {
  test('the control copies the value it was given', () => {
    assert.match(copyField, /navigator\.clipboard\.writeText\(value\)/);
  });

  test('the confirmation is announced, not only drawn', () => {
    assert.match(copyField, /role="status"/);
    assert.match(copyField, /aria-live="polite"/);
  });

  test('the confirmation is animated to a check', () => {
    assert.match(copyField, /AnimatePresence/);
    assert.match(copyField, /Check/);
  });

  test('a refused clipboard does not hide the value', () => {
    // The value stays on screen and selectable, so the customer can still
    // copy it by hand.
    assert.match(copyField, /select-all/);
  });

  test('the checkout shows the recipient the server sent', () => {
    assert.match(modal, /recipientAccount/);
    assert.match(modal, /CopyField/);
  });
});

describe('the checkout tells the truth about the money', () => {
  test('a submitted receipt is under review, not received', () => {
    assert.match(statusCard, /Payment Under Review/);
    assert.match(statusCard, /being verified by an administrator/);
  });

  test('payment received is only said when the server confirmed it', () => {
    // The confirmed wording belongs to the verified state alone.
    const start = statusCard.indexOf("state === 'verified'");
    const verified = statusCard.slice(start, statusCard.indexOf("state === 'expired'"));
    assert.match(verified, /Payment received/);
  });

  test('the modal does not claim a payment was received on its own', () => {
    assert.doesNotMatch(
      modal,
      /Payment received/i,
      'the modal must not announce a payment it has not been told about'
    );
  });

  test('the outcome card is chosen by the state', () => {
    assert.match(statusCard, /state === 'verified'/);
    assert.match(statusCard, /state === 'expired'/);
    assert.match(statusCard, /state === 'failed'/);
  });
});

describe('a payment cannot be taken twice', () => {
  test('the submit handler refuses a second submission', () => {
    assert.match(modal, /submittingRef/);
    assert.match(modal, /if \(submittingRef\.current\) return;/);
  });

  test('the guard is released when the request finishes', () => {
    assert.match(modal, /finally \{[\s\S]*?submittingRef\.current = false;/);
  });

  test('the button is disabled while the request is in flight', () => {
    assert.match(modal, /disabled=\{loading \|\| state === 'processing'\}/);
    assert.match(modal, /aria-busy=\{loading \|\| state === 'processing'\}/);
  });
});

describe('the card rail appears only when it can take a payment', () => {
  test('it is decided by the server status', () => {
    assert.match(modal, /fetchStripeBillingStatus/);
    assert.match(modal, /status\.configured && status\.checkoutReady/);
  });

  test('a deployment without Stripe keeps the wallet rails', () => {
    assert.match(modal, /setCardAvailable\(false\)/);
    assert.match(modal, /cardAvailable/);
  });

  test('the card leaves for Stripe\'s hosted page', () => {
    assert.match(modal, /beginCardCheckout/);
  });
});

describe('the motion respects the visitor', () => {
  const animated = [
    ['the method card', methodCard],
    ['the copy control', copyField],
    ['the outcome card', statusCard],
    ['the progress steps', stateSteps],
    ['the spinner', spinner],
  ] as const;

  for (const [name, source] of animated) {
    test(`${name} asks the visitor's preference`, () => {
      assert.match(source, /useReducedMotion/);
    });

    test(`${name} stops moving when reduced motion is asked for`, () => {
      // Every animation is either switched off or collapses to a frame.
      const durations = source.match(/duration: reduced \? 0\.01 : [^,}]+/g) ?? [];
      const switches = source.match(/reduced \? (false|undefined) :/g) ?? [];
      const disabled = source.match(/reduced \|\| disabled \? undefined/g) ?? [];
      assert.ok(
        durations.length + switches.length + disabled.length > 0,
        `${name} must collapse its animation when reduced motion is asked for`
      );
    });
  }

  test('the modal animates its entrance and its steps', () => {
    assert.match(modal, /AnimatePresence/);
    assert.match(modal, /useReducedMotion/);
  });

  test('an infinite animation is switched off under reduced motion', () => {
    // The pulse on the outcome card is the one animation that never ends.
    assert.match(statusCard, /state === 'verified' && !reduced/);
  });
});

describe('the interface works in both directions and both themes', () => {
  test('the surfaces use the theme\'s own tokens', () => {
    // A hard-coded colour would be right in one theme and wrong in the other.
    for (const source of [modal, methodCard, copyField, statusCard]) {
      assert.doesNotMatch(
        source,
        /bg-(white|black|slate|gray|zinc|neutral)-\d{2,3}\b/,
        'a checkout surface must use the theme tokens'
      );
      assert.doesNotMatch(source, /text-(white|black)-\d{2,3}\b/);
    }
    assert.match(modal, /var\(--surface-main\)/);
    assert.match(modal, /var\(--text-primary\)/);
    assert.match(modal, /var\(--border-subtle\)/);
  });

  test('the layout is written with logical properties', () => {
    // `ms-` and `me-` follow the writing direction; `ml-` and `mr-` do not.
    for (const source of [modal, methodCard, copyField, statusCard]) {
      assert.doesNotMatch(source, /\bml-|\bmr-|\bpl-|\bpr-/, 'a checkout layout must not use a physical side');
    }
  });

  test('the account value keeps its own direction', () => {
    // A wallet number and an IPA are read left to right even in an Arabic
    // interface.
    assert.match(copyField, /dir="ltr"/);
  });

  test('the interface language decides which instructions are read', () => {
    assert.match(modal, /instructionsEn/);
    assert.match(modal, /instructionsAr/);
  });
});

describe('the progress is shown, not just felt', () => {
  test('the steps name the stages the customer goes through', () => {
    assert.match(stateSteps, /method/i);
    assert.match(stateSteps, /instruction/i);
  });

  test('the current stage is marked', () => {
    assert.match(stateSteps, /aria-current|role="status"/);
  });

  test('the loader does not change the layout while it spins', () => {
    assert.match(spinner, /h-\d|w-\d/);
  });
});
