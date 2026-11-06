# CareerDev4AI — Test Coverage Gaps & Verification Plan

> **Document Type:** Quality Assurance, Test Coverage & Concurrency Verification Audit  
> **Auditor:** Independent QA Systems & Test Automation Specialist  
> **Date:** 2026-11-06  
> **Status:** Significant Test Coverage Gaps Identified  

---

## 1. Existing Test Suite Analysis

The repository currently contains two test files associated with the subscription and localization subsystems:
1. `tests/subscriptions-system.test.ts`:
   - **File Size:** 121 lines.
   - **Test Count:** 7 tests.
   - **Scope:** Pure unit assertions on static TypeScript constants and helper functions:
     - Defines the 4 official subscription plans (`free`, `student`, `pro`, `career_plus`).
     - Formats Egyptian Pound prices from piasters (`formatEgpPrice`).
     - Evaluates static feature matrix (`isPlanEntitled`).
     - Checks credit weights and positive integers (`CREDIT_WEIGHTS`).
     - Checks credit booster pack definitions (`CREDIT_PACKS`).
     - Checks payment method enums (`PAYMENT_METHODS`).
     - Checks static payment instruction formatting (`getPaymentInstructions`).
2. `tests/localization.test.ts`:
   - **Scope:** Verifies that all 1,808 dictionary keys have non-empty Arabic strings in `src/translations/parts/`. (100% passed).

### Critical Observation
There are **zero integration tests, zero end-to-end payment tests, zero database stored procedure tests, and zero concurrency tests** in the repository for the subscription system.

---

## 2. Test Coverage Gap Inventory

| Subsystem / Operation | Existing Coverage | Gap Severity | Description of Missing Verification |
| :--- | :--- | :--- | :--- |
| **Checkout Intent Creation** | None | **HIGH** | Verifying price calculations, coupon application, and birthday reward deductions. |
| **Receipt Upload & Hashing** | None | **HIGH** | Verifying SHA-256 hash computation, duplicate reference flagging, and fraud scoring. |
| **Provisional Access Granting** | None | **HIGH** | Verifying that risk score < 40 grants 24h temporary access, while risk score >= 40 blocks it. |
| **Admin Payment Confirmation** | None | **CRITICAL** | Invoking `confirm_payment_and_activate()` via API, validating status change, credit ledger grant, and subscription creation. |
| **Admin Late Payment Restore** | None | **HIGH** | Verifying that late-confirmed payments restore subscription dates starting from confirmation timestamp. |
| **Maintenance Sweeps** | None | **HIGH** | Executing `expire_temporary_access()` and `expire_subscriptions()`, validating status transitions and user notifications. |
| **Credit Ledger Concurrency** | None | **CRITICAL** | Executing 10+ simultaneous credit deduction requests against a single user account to prove no negative balance occurs. |
| **Auto-Refund on Model Crash** | None | **HIGH** | Triggering an intentional 500 error in Gemini route and verifying that middleware auto-refunds the deducted credits. |
| **Promotional Coupon Limits** | None | **HIGH** | Testing expired coupons, max total redemptions, max redemptions per user, and minimum order requirements. |
| **Law 151 Consent Revocation** | None | **MEDIUM** | Testing that revoking consent via `revokeBirthdayConsent()` cancels unredeemed rewards and updates privacy records. |

---

## 3. Concurrency Test Specification (Required Pre-Release)

To verify the integrity of PostgreSQL advisory locking (`pg_advisory_xact_lock`) and check constraint enforcement, the following concurrency test suite must be implemented and executed before release.

### Concurrency Test Scenario: Parallel Credit Consumption Race
```typescript
describe('AI Credit Concurrency Stress Test', () => {
  it('prevents double-spending and negative balances under high concurrent load', async () => {
    // 1. Seed a test user with exactly 5 credits
    const testUserId = await createTestCandidate({ initialCredits: 5 });

    // 2. Prepare 10 concurrent requests, each attempting to deduct 2 credits (Total attempted: 20 credits)
    const deductionPromises = Array.from({ length: 10 }).map((_, index) =>
      chargeAiAction({
        profileId: testUserId,
        action: 'cv_ats_analysis', // Cost = 2 credits
        idempotencyKey: `concurrent_test_${testUserId}_${index}`,
      })
    );

    // 3. Fire all 10 requests simultaneously
    const results = await Promise.allSettled(deductionPromises);

    // 4. Analyze results
    const successfulCharges = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success === true
    );
    const rejectedCharges = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success === false
    );

    // 5. Assertions
    // User started with 5 credits; each charge is 2 credits.
    // Exactly 2 charges must succeed (consuming 4 credits).
    // Exactly 8 charges must fail with INSUFFICIENT_CREDITS.
    assert.equal(successfulCharges.length, 2, 'Exactly 2 charges must succeed');
    assert.equal(rejectedCharges.length, 8, 'Exactly 8 charges must be rejected');

    // 6. Verify final ledger balance
    const finalBalance = await getCreditBalance(testUserId);
    assert.equal(finalBalance.balance, 1, 'Final balance must be exactly 1 credit');
    assert.ok(finalBalance.balance >= 0, 'Balance must never drop below 0');
  });
});
```

---

## 4. Integration Test Suite Blueprint

The missing integration tests should be added to `tests/subscriptions-integration.test.ts` and integrated into `tests/runner.mjs`.

### Test Group 1: End-to-End Payment State Machine
1. Create checkout for Student monthly plan (99 EGP / 9,900 piasters).
2. Submit valid receipt screenshot with unique transaction reference.
3. Verify payment request enters `temporary_access` (risk score < 40).
4. Verify user can access Student tier features (`cv.tailoring`).
5. Verify user is blocked from Pro tier features (`interview.mock_simulation`).
6. As Admin, approve payment via `POST /api/admin/payments/:id/confirm`.
7. Verify status transitions to `paid`.
8. Verify `public.subscriptions` row is active for 1 month from confirmation date.
9. Verify `public.ai_credit_ledger` contains a `grant` of 25 credits.

### Test Group 2: Temporary Access Expiration Sweep
1. Seed payment request in `temporary_access` with `temporary_access_expires_at = now() - 1 minute`.
2. Invoke `runSubscriptionMaintenanceSweeps()`.
3. Verify payment request transitions to `expired`.
4. Verify associated subscription transitions to `suspended`.
5. Verify user loses access to Student tier features.

### Test Group 3: Auto-Refund on AI Model Error
1. User with 10 credits calls `POST /api/optimize-cv` (cost: 4 credits).
2. Mock an internal error or rate limit from Gemini API (500 or 429).
3. Verify endpoint returns HTTP error.
4. Verify `res.on('finish')` triggers automatic refund.
5. Verify candidate's final balance remains 10 credits with matching ledger rows (`consume` -4, `refund` +4).

---

## 5. QA Audit Verdict

**FAIL.**  
The absence of automated integration tests and concurrency verification represents an unacceptable operational risk for a financial billing and credit management system. Launch cannot be approved without automated test validation.

