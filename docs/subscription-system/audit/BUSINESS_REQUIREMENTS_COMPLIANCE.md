# CareerDev4AI — Business Requirements Compliance Audit

> **Document Type:** Independent Business Logic & Requirement Verification Matrix  
> **System Under Audit:** Subscription Plans, Egyptian Payment Rails, Credits, and Promotions  
> **Auditor:** Independent FinTech & SaaS Product Systems Auditor  
> **Date:** 2026-11-06  
> **Status:** Detailed Gap Analysis & Compliance Determination  

---

## 1. Compliance Matrix Overview

This matrix audits every approved business requirement against the physical codebase, database migrations, and operational endpoints.

| Requirement ID | Approved Business Requirement | Observed Implementation | Compliance Status | Defect Reference |
| :--- | :--- | :--- | :--- | :--- |
| **BR-01** | **Free Tier:** 0 EGP, 5 one-time trial credits, no recurring replenishment. | Seeded in `subscription_plans` with 0 EGP, 0 recurring credits. Idempotent one-time 5 credit grant in `server/db/credits.ts:111`. | **COMPLIANT** | None |
| **BR-02** | **Student Tier:** 99 EGP/mo, 999 EGP/yr, 25 monthly credits. | Seeded in `subscription_plans` (9900 & 99900 piasters, 25 credits). Entitlements mapped in `shared/subscriptions.ts`. | **COMPLIANT** | None |
| **BR-03** | **Pro Tier:** 179 EGP/mo, 1,790 EGP/yr, 60 monthly credits. | Seeded in `subscription_plans` (17900 & 179000 piasters, 60 credits). Entitlements mapped in `shared/subscriptions.ts`. | **COMPLIANT** | None |
| **BR-04** | **Career Plus Tier:** 299 EGP/mo, 2,990 EGP/yr, 120 monthly credits. | Seeded in `subscription_plans` (29900 & 299000 piasters, 120 credits). Entitlements mapped in `shared/subscriptions.ts`. | **COMPLIANT** | None |
| **BR-05** | **Credit Packs:** 15, 40, 100 credits at 49, 99, 199 EGP. | Defined in `shared/credits.ts`. Checkouts work, but **fulfillment in DB fails** (0 credits granted). | **NON-COMPLIANT** | `FIN-01` |
| **BR-06** | **Integer Piaster Calculations:** 1 EGP = 100 piasters, no floats. | All database schema columns, API inputs, and calculations use integer piasters. | **COMPLIANT** | None |
| **BR-07** | **Manual Egyptian Payment Rails:** Vodafone Cash & InstaPay instructions. | Dynamic bilingual instructions in `server/db/payments.ts`. Receipt upload to private bucket. | **COMPLIANT** | None |
| **BR-08** | **24-Hour Provisional Access:** Expires automatically after 24h. | Stored procedure `expire_temporary_access()` runs via worker cron every 5 minutes. | **COMPLIANT** | None |
| **BR-09** | **Provisional Access Cost Restrictions:** Block expensive AI actions. | Restricts `interview.mock_simulation` and `career.transition_plan`, but leaves `cv.tailoring` (4 credits) open. | **PARTIALLY COMPLIANT** | `BIZ-03` |
| **BR-10** | **Late Confirmation Restores Period:** Starts from confirmation date. | Procedure `late_payment_restore()` resets period start to `now()`. | **COMPLIANT** | None |
| **BR-11** | **Manual Renewal Only:** No auto-renewing subscriptions. | Column `auto_renew` defaults to `false`. Cron expires subscriptions without charging. | **COMPLIANT** | None |
| **BR-12** | **Birthday Discount Percentage & Cap:** 30% discount, max 100 EGP. | Table check constraints enforce `discount_percentage = 30` and `max_discount_piasters = 10000`. | **COMPLIANT** | None |
| **BR-13** | **Birthday Window Duration:** Strictly valid for 7 days. | Implemented as a **21-day celebration window** (7 days before to 14 days after). | **NON-COMPLIANT** | `BIZ-01` |
| **BR-14** | **Birthday Discount Plan Scope:** Monthly subscriptions only. | Implemented on all checkouts: applies to **annual plans** and **credit packs**. | **NON-COMPLIANT** | `BIZ-02` |
| **BR-15** | **Egypt Law 151 Consent:** Day/month only, no birth year, revocable. | Table `user_privacy_consents` logs consent; only `birth_month` and `birth_day` stored. | **COMPLIANT** | None |
| **BR-16** | **Super Admin Bootstrap:** `ahmedghannam801@gmail.com` via verified UUID. | Migration `20261107000001_...` joins `auth.users` with `profiles`. Safe conflict handling. | **COMPLIANT** | None |

---

## 2. Deep Dive: Investigation of Discrepant Requirements

### Discrepancy 1: Birthday Celebration Window (21 Days vs 7 Days)
- **Approved Requirement:**  
  "Birthday discount: 30%, maximum 100 EGP, **valid for 7 days**, once annually, monthly subscription only."
- **Code Inspection:** `server/birthday/service.ts`, lines 71–84:
  ```typescript
  // 2. Compute 21-day birthday celebration window (7 days before, 14 days after)
  let rewardYear = currentYear;
  const birthdayThisYear = new Date(Date.UTC(rewardYear, birthMonth - 1, birthDay));
  const validFrom = new Date(birthdayThisYear.getTime() - 7 * 24 * 60 * 60 * 1000);
  const validUntil = new Date(birthdayThisYear.getTime() + 14 * 24 * 60 * 60 * 1000);
  ```
- **Analysis:**  
  The implementation explicitly comments and codes a **21-day promotional window**.  
  If a user has a birthday on May 15, the reward is valid from May 8 to May 29.  
  This is a **300% expansion** of the approved 7-day liability period.
- **Root Cause:**  
  The implementation agent appears to have adopted an overly generous celebratory window concept without adhering strictly to the frozen business specification.
- **Required Remediation:**  
  Change `server/birthday/service.ts` to compute a strictly 7-day window. For example:
  ```typescript
  // 7-day birthday window starting on birthday
  const validFrom = new Date(Date.UTC(rewardYear, birthMonth - 1, birthDay));
  const validUntil = new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  ```

---

### Discrepancy 2: Birthday Discount Scope (Annual Plans & Credit Packs Leakage)
- **Approved Requirement:**  
  "Birthday discount: 30%, maximum 100 EGP, valid for 7 days, once annually, **monthly subscription only**."
- **Code Inspection:** `server/payments/service.ts`, lines 98–105:
  ```typescript
  // 2. Birthday reward (30% discount, Law 151 compliant, uncombinable)
  if (applyBirthdayReward && discountAmountPiasters === 0) {
    const birthdayReward = await getActiveBirthdayReward(profileId);
    if (birthdayReward && birthdayReward.status === 'available') {
      const bdayDiscount = Math.round((originalAmountPiasters * birthdayReward.discountPercentage) / 100);
      discountAmountPiasters = Math.min(bdayDiscount, birthdayReward.maxDiscountPiasters);
    }
  }
  ```
- **Analysis:**  
  The service does NOT verify `billingCycle === 'monthly'`, nor does it verify that `planCode` belongs to `['student', 'pro', 'career_plus']`.
  1. A user purchasing an **Annual Pro Plan** (1,790 EGP) can apply the birthday reward and get a 100 EGP discount (paying 1,690 EGP).
  2. A user purchasing a **100 AI Credit Booster Pack** (199 EGP) can apply the birthday reward and get a 59.70 EGP discount (paying 139.30 EGP).
- **Financial Impact:**  
  This results in unapproved margin erosion on high-tier annual plans and standalone credit packs.
- **Required Remediation:**  
  Enforce explicit gating in `server/payments/service.ts`:
  ```typescript
  const isMonthlySubscription = billingCycle === 'monthly' && ['student', 'pro', 'career_plus'].includes(planCode);
  if (applyBirthdayReward && isMonthlySubscription && discountAmountPiasters === 0) {
    // apply discount
  }
  ```

---

### Discrepancy 3: Credit Booster Pack Fulfillment Failure
- **Approved Requirement:**  
  "Credit packs: 15 / 40 / 100 credits at 49 / 99 / 199 EGP."
- **Code Inspection:** `server/payments/service.ts` lines 80–84 and `confirm_payment_and_activate()`:
  - When checkout is created for `pack_15`, `pack_40`, or `pack_100`, the payment request is created with `plan_id = freePlan.id`.
  - When confirmed by an admin, `confirm_payment_and_activate()` looks up `v_payment.plan_id` (the Free plan), sees `monthly_ai_credits = 0`, and executes:
    `IF v_plan.monthly_ai_credits > 0 THEN ...` -> evaluates to false.
  - Zero credits are added to the ledger!
  - The procedure also creates/updates a row in `public.subscriptions` linking the candidate to `free`, overriding an active paid subscription!
- **Root Cause:**  
  The implementation agent treated credit pack checkouts as "subscription checkouts" without creating a separate path or database entity for credit pack orders.
- **Required Remediation:**  
  Add a `product_type` column to `public.payment_requests` (`'subscription'` vs `'credit_pack'`), store `credit_pack_id`, and implement a dedicated stored procedure `confirm_credit_pack_payment()` that awards the credits under `source_type = 'payment'` and bypasses `public.subscriptions`.

---

### Discrepancy 4: Provisional Access AI Cost Boundary Enforcement
- **Approved Requirement:**  
  "Temporary access must not permit expensive AI operations (limit to $\le 2$ credits or specific low-cost actions)."
- **Code Inspection:** `server/subscriptions/entitlements.ts`, lines 34–37:
  ```typescript
  const HIGH_RISK_TEMPORARY_RESTRICTIONS = new Set<EntitlementFeature>([
    'interview.mock_simulation',
    'career.transition_plan',
  ]);
  ```
- **Analysis:**  
  - While `interview.mock_simulation` (5 credits) is restricted, `cv.tailoring` costs **4 credits** and is NOT restricted.
  - A user with 24-hour provisional access can repeatedly run `cv.tailoring` (4 credits) using their 5 initial trial credits or accumulated credits without waiting for payment verification.
- **Required Remediation:**  
  Expand `HIGH_RISK_TEMPORARY_RESTRICTIONS` to include `cv.tailoring` and `roadmap.full_stages`, or enforce a credit cost ceiling (`CREDIT_WEIGHTS[action] <= 2`) for temporary access sessions.

---

## 3. Summary of Compliance Score

```
Total Requirements Evaluated:    16
Fully Compliant:                 11  (68.75%)
Partially Compliant:              1  ( 6.25%)
Non-Compliant (Violations):       4  (25.00%)
```

**Conclusion:**  
Four core business decisions are directly violated in the running code. Commercial release cannot proceed until these business constraints are brought into 100% compliance.

