/**
 * The subscription system.
 *
 * Verifies plan definitions, pricing in piasters, feature entitlements,
 * credit weights and the booster packs. The payment instructions these tests
 * used to check belong to the rails that no longer exist; the entitlement and
 * pricing rules they sat beside are what still matters.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANNUAL_ENTITLEMENT_MONTHS,
  PLAN_RANK,
  SUBSCRIPTION_PLAN_CODES,
  PLAN_FEATURE_MATRIX,
  annualSavingsPercent,
  annualSavingsPiasters,
  isPlanEntitled,
  monthlyTokenAllowance,
  formatEgpPrice,
  savedJobsLimitFromFeatures,
  FALLBACK_SAVE_JOBS_LIMIT,
} from '../shared/subscriptions.ts';
import {
  CREDIT_WEIGHTS,
  AI_CREDIT_ACTIONS,
  CREDIT_PACKS,
} from '../shared/credits.ts';

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

  it('verifies AI credit action weights: four paid actions, everything else free', () => {
    for (const action of AI_CREDIT_ACTIONS) {
      const weight = CREDIT_WEIGHTS[action];
      assert.ok(typeof weight === 'number', `Weight for ${action} must be a number`);
      assert.ok(weight >= 0, `Weight for ${action} must not be negative`);
      assert.ok(Number.isInteger(weight), `Weight for ${action} must be an integer`);
    }

    // The only paid actions. A paid action is a substantial artefact the
    // candidate can keep and reuse.
    assert.equal(CREDIT_WEIGHTS.cv_ats_analysis, 1);
    assert.equal(CREDIT_WEIGHTS.cv_tailoring, 1);
    assert.equal(CREDIT_WEIGHTS.project_analysis, 1);
    assert.equal(CREDIT_WEIGHTS.premium_template_unlock, 5);

    // Everything else is free. These are the flows a candidate with a zero
    // balance can use without buying anything.
    assert.equal(CREDIT_WEIGHTS.career_consultation_chat, 0);
    assert.equal(CREDIT_WEIGHTS.interview_mock_session, 0);
    assert.equal(CREDIT_WEIGHTS.job_description_analysis, 0);
    assert.equal(CREDIT_WEIGHTS.cover_letter_generation, 0);
    assert.equal(CREDIT_WEIGHTS.ai_assist_inline, 0);
    assert.equal(CREDIT_WEIGHTS.learning_recommendation, 0);
    assert.equal(CREDIT_WEIGHTS.roadmap_generation, 0);
    assert.equal(CREDIT_WEIGHTS.cv_generation, 0);
  });

  it('reads the saved-jobs allowance from the plan, never as unlimited', () => {
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 5 }), 5);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 50 }), 50);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 200 }), 200);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 1000 }), 1000);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: '40' }), 40);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 0 }), 0);
    assert.equal(savedJobsLimitFromFeatures({}), FALLBACK_SAVE_JOBS_LIMIT);
    assert.equal(savedJobsLimitFromFeatures(null), FALLBACK_SAVE_JOBS_LIMIT);
    assert.equal(savedJobsLimitFromFeatures({ save_jobs_limit: 'not a number' }), FALLBACK_SAVE_JOBS_LIMIT);
    assert.equal(FALLBACK_SAVE_JOBS_LIMIT, 5);
  });

  it('publishes the new Egyptian-pound catalogue as the annual price of ten months', () => {
    // Published prices, in piasters. The annual price is exactly ten monthly
    // payments, which is why every plan can say "two months free".
    const catalogue = [
      { code: 'free', monthly: 0, annual: 0, tokens: 0 },
      { code: 'student', monthly: 4900, annual: 49000, tokens: 15 },
      { code: 'pro', monthly: 9900, annual: 99000, tokens: 40 },
      { code: 'career_plus', monthly: 17900, annual: 179000, tokens: 85 },
    ] as const;

    assert.equal(ANNUAL_ENTITLEMENT_MONTHS, 12);
    for (const plan of catalogue) {
      const price = { priceMonthlyPiasters: plan.monthly, priceAnnualPiasters: plan.annual };
      assert.equal(formatEgpPrice(plan.monthly), `${plan.monthly / 100} EGP`);
      if (plan.monthly > 0) {
        assert.equal(plan.annual, plan.monthly * 10, `${plan.code} annual is ten months`);
        assert.equal(annualSavingsPiasters(price), plan.monthly * 2);
        assert.equal(annualSavingsPercent(price), 17);
      } else {
        assert.equal(annualSavingsPiasters(price), 0);
        assert.equal(annualSavingsPercent(price), 0);
      }
      assert.equal(monthlyTokenAllowance({ monthlyAiCredits: plan.tokens }), plan.tokens);
    }
  });

  it('ranks the plans so the interface can say upgrade or downgrade', () => {
    assert.deepEqual(PLAN_RANK, { free: 0, student: 1, pro: 2, career_plus: 3 });
    assert.ok(PLAN_RANK.career_plus > PLAN_RANK.pro);
    assert.ok(PLAN_RANK.pro > PLAN_RANK.student);
    assert.ok(PLAN_RANK.student > PLAN_RANK.free);
  });

  it('grants the deeper features only to the plans that advertise them', () => {
    // Professional adds the interview, mentor and portfolio tier.
    assert.equal(isPlanEntitled('student', 'interview.mock_simulation'), false);
    assert.equal(isPlanEntitled('pro', 'interview.mock_simulation'), true);
    assert.equal(isPlanEntitled('pro', 'career.comparative_fit'), false);
    assert.equal(isPlanEntitled('pro', 'interview.deep_simulation'), false);
    assert.equal(isPlanEntitled('pro', 'ai.priority_processing'), false);

    // Career Plus adds the transition engine and priority processing.
    assert.equal(isPlanEntitled('career_plus', 'career.comparative_fit'), true);
    assert.equal(isPlanEntitled('career_plus', 'interview.deep_simulation'), true);
    assert.equal(isPlanEntitled('career_plus', 'ai.priority_processing'), true);
    assert.equal(isPlanEntitled('career_plus', 'career.reports'), true);
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

});

