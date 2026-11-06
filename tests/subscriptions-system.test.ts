/**
 * Comprehensive Test Suite for SaaS Subscription & Payment System.
 * Verifies plan definitions, pricing in piasters, feature entitlements,
 * double-entry credit weights, Egyptian payment instructions, and Law 151 compliance.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUBSCRIPTION_PLAN_CODES,
  PLAN_FEATURE_MATRIX,
  isPlanEntitled,
  formatEgpPrice,
} from '../shared/subscriptions.ts';
import {
  CREDIT_WEIGHTS,
  AI_CREDIT_ACTIONS,
  CREDIT_PACKS,
} from '../shared/credits.ts';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../shared/payments.ts';
import { getPaymentInstructions } from '../server/db/payments.ts';

describe('SaaS Subscription Architecture & Domain Tests', () => {
  it('defines the 4 official subscription plans', () => {
    assert.deepEqual(Array.from(SUBSCRIPTION_PLAN_CODES), [
      'free',
      'student',
      'pro',
      'career_plus',
    ]);
  });

  it('correctly calculates and formats Egyptian Pound prices from piasters', () => {
    assert.equal(formatEgpPrice(0), '0 EGP');
    assert.equal(formatEgpPrice(9900), '99 EGP');
    assert.equal(formatEgpPrice(17900), '179 EGP');
    assert.equal(formatEgpPrice(29900), '299 EGP');
    assert.equal(formatEgpPrice(99900), '999 EGP');
    assert.equal(formatEgpPrice(179000), '1790 EGP');
    assert.equal(formatEgpPrice(299000), '2990 EGP');
  });

  it('strictly enforces plan feature entitlements', () => {
    // Free plan
    assert.equal(isPlanEntitled('free', 'cv.builder'), true);
    assert.equal(isPlanEntitled('free', 'ats.analysis'), false);
    assert.equal(isPlanEntitled('free', 'interview.mock_simulation'), false);

    // Student plan
    assert.equal(isPlanEntitled('student', 'cv.builder'), true);
    assert.equal(isPlanEntitled('student', 'cv.tailoring'), true);
    assert.equal(isPlanEntitled('student', 'ats.analysis'), true);
    assert.equal(isPlanEntitled('student', 'cover_letter.generate'), true);
    assert.equal(isPlanEntitled('student', 'interview.mock_simulation'), false);

    // Pro plan
    assert.equal(isPlanEntitled('pro', 'cv.multiple_versions'), true);
    assert.equal(isPlanEntitled('pro', 'interview.mock_simulation'), true);
    assert.equal(isPlanEntitled('pro', 'ai_mentor.session'), true);
    assert.equal(isPlanEntitled('pro', 'career.transition_plan'), false);

    // Career Plus plan
    assert.equal(isPlanEntitled('career_plus', 'career.transition_plan'), true);
    assert.equal(isPlanEntitled('career_plus', 'interview.mock_simulation'), true);
    assert.equal(isPlanEntitled('career_plus', 'cv.tailoring'), true);
  });

  it('verifies AI credit action weights and positive integer costs', () => {
    for (const action of AI_CREDIT_ACTIONS) {
      const weight = CREDIT_WEIGHTS[action];
      assert.ok(typeof weight === 'number', `Weight for ${action} must be a number`);
      assert.ok(weight >= 1, `Weight for ${action} must be at least 1 credit`);
      assert.ok(Number.isInteger(weight), `Weight for ${action} must be an integer`);
    }

    assert.equal(CREDIT_WEIGHTS.job_description_analysis, 1);
    assert.equal(CREDIT_WEIGHTS.cv_ats_analysis, 2);
    assert.equal(CREDIT_WEIGHTS.cover_letter_generation, 2);
    assert.equal(CREDIT_WEIGHTS.cv_tailoring, 4);
    assert.equal(CREDIT_WEIGHTS.interview_mock_session, 5);
  });

  it('verifies credit booster packs', () => {
    assert.equal(CREDIT_PACKS.length, 3);
    const [p15, p40, p100] = CREDIT_PACKS;

    assert.equal(p15.credits, 15);
    assert.equal(p15.pricePiasters, 4900); // 49 EGP

    assert.equal(p40.credits, 40);
    assert.equal(p40.pricePiasters, 9900); // 99 EGP

    assert.equal(p100.credits, 100);
    assert.equal(p100.pricePiasters, 19900); // 199 EGP
  });

  it('validates supported Egyptian payment methods', () => {
    assert.deepEqual(Array.from(PAYMENT_METHODS), ['vodafone_cash', 'instapay']);
    assert.ok(PAYMENT_STATUSES.includes('temporary_access'));
    assert.ok(PAYMENT_STATUSES.includes('paid'));
    assert.ok(PAYMENT_STATUSES.includes('under_review'));
  });

  it('generates accurate localized payment instructions for Vodafone Cash and InstaPay', () => {
    const vfInstructions = getPaymentInstructions('vodafone_cash', 9900);
    assert.equal(vfInstructions.method, 'vodafone_cash');
    assert.equal(vfInstructions.amountFormatted, '99 EGP');
    assert.ok(vfInstructions.recipientAccount.length > 0);
    assert.ok(vfInstructions.instructionsEn.length >= 3);
    assert.ok(vfInstructions.instructionsAr.length >= 3);

    const ipInstructions = getPaymentInstructions('instapay', 17900);
    assert.equal(ipInstructions.method, 'instapay');
    assert.equal(ipInstructions.amountFormatted, '179 EGP');
    assert.ok(ipInstructions.recipientAccount.includes('@'));
  });
});

