# CareerDev4AI — AI Credit Integrity & Concurrency Audit

> **Document Type:** AI Credits Ledger, Mathematical Consistency & Concurrency Audit  
> **Target Subsystems:** `public.ai_credit_ledger`, Stored Procedures (`consume_ai_credits`, `refund_ai_credits`), Express Middleware (`requireCredits`), AI Route Protection  
> **Auditors:** Independent PostgreSQL Systems Architect & FinTech Systems Auditor  
> **Date:** 2026-11-06  
> **Status:** Critical Defects & Gaps Identified  

---

## 1. Credit Ledger Architecture Overview

The CareerDev4AI AI credit system is built on an append-only double-entry ledger design in PostgreSQL:
- **Table:** `public.ai_credit_ledger`
- **Invariants:**
  - `running_balance >= 0` enforced by check constraint `ai_credit_ledger_running_balance_positive`.
  - Negative values for deductions (`consume`, `expire`), positive values for additions (`grant`, `refund`, `bonus`).
  - Strict idempotency key uniqueness on column `idempotency_key`.
- **Atomic Operations:**
  - `consume_ai_credits(p_profile_id, p_operation, p_amount, p_idempotency_key, p_metadata)`
  - `refund_ai_credits(p_profile_id, p_amount, p_reason, p_idempotency_key, p_source_id)`

---

## 2. Technical Evaluation of Ledger Guarantees

| Invariant / Property | Required Standard | Observed Implementation | Audit Finding |
| :--- | :--- | :--- | :--- |
| **Negative Balance Prevention** | Balance can never drop below 0 under any circumstance. | Check constraint `running_balance >= 0` rejects any negative insertion at PostgreSQL engine level. | **PASSED** |
| **Concurrency Serialization** | Concurrent requests from the same user cannot cause a race condition or double-spend. | Uses transaction-level advisory locking: `PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text))`. | **PASSED** |
| **Idempotency Protection** | Replayed client requests must return the previous outcome without re-deducting. | Table enforces `UNIQUE (idempotency_key)`. Procedure checks for existing key before locking. | **PASSED** |
| **Eligible Internal Failure Refunds** | Downstream model crashes or 5xx/429 errors must automatically refund credits. | Middleware `requireCredits` attaches `res.on('finish', ...)` hook to trigger `refundAiCreditReservation`. | **PASSED** |
| **Refund Replay Protection** | Refunds cannot be replayed or abused to inflate balances. | Refund procedure checks idempotency key and prevents duplicate insertions. | **PASSED** |
| **Action Weight Tampering** | Clients cannot manipulate the credit cost of an action. | Costs are hardcoded server-side in `CREDIT_WEIGHTS` (`shared/credits.ts`). Client parameters ignored. | **PASSED** |
| **Credit Separation (Monthly vs Pack)** | Expiring monthly allocations must be distinguishable from non-expiring purchased packs. | Single scalar `running_balance`. No bucket separation or lot expiration tracking exists. | **FAILED (HIGH)** |
| **Monthly Credit Non-Rollover** | Unused monthly subscription credits must not roll over into the next cycle. | `expire_subscriptions()` does not decrement ledger balance. Unused credits roll over indefinitely. | **FAILED (HIGH)** |
| **Comprehensive Endpoint Gating** | Every expensive AI endpoint must enforce server-side credit deduction. | 6 AI endpoints call the Gemini API directly with **ZERO** credit checks or deductions. | **FAILED (HIGH)** |
| **Admin Grant Procedure Integrity** | Admin credit grants must use serialized procedures and valid constraints. | Admin route executes raw SQL insert with invalid `source_type` and hardcoded `running_balance: 0`. | **FAILED (CRITICAL)** |

---

## 3. Concurrency & Race Condition Deep Dive

### Concurrency Mechanism Analysis
In `supabase/migrations/20261110000004_privacy_birthdays_events_and_procs.sql`, lines 404–493:
```sql
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_profile_id uuid,
  p_operation text,
  p_amount integer,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_existing_ledger public.ai_credit_ledger;
  v_ledger_id uuid;
BEGIN
  ...
  -- Check for existing idempotent execution
  SELECT * INTO v_existing_ledger
  FROM public.ai_credit_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'remaining_balance', v_existing_ledger.running_balance,
      'ledger_id', v_existing_ledger.id
    );
  END IF;

  -- Serialize credit mutations for this candidate profile
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text));

  SELECT running_balance INTO v_current_balance
  FROM public.ai_credit_ledger
  WHERE profile_id = p_profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_current_balance := coalesce(v_current_balance, 0);

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', p_amount,
      'available', v_current_balance
    );
  END IF;

  v_new_balance := v_current_balance - p_amount;

  INSERT INTO public.ai_credit_ledger (...)
  VALUES (...)
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'deducted', p_amount,
    'remaining_balance', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;
```

### Concurrency Evaluation
1. **Advisory Lock Scope:**  
   `pg_advisory_xact_lock(hashtext(p_profile_id::text))` takes an exclusive lock hash on the candidate's UUID. This lock is automatically released at transaction commit or rollback.
2. **Race Condition Prevention:**  
   If a user with **5 credits** fires 5 simultaneous requests costing 2 credits each:
   - Request A acquires the advisory lock, reads balance 5, deducts 2, writes balance 3, commits.
   - Request B, waiting on the advisory lock, acquires the lock, reads balance 3, deducts 2, writes balance 1, commits.
   - Request C acquires the lock, reads balance 1, sees $1 < 2$, and returns `INSUFFICIENT_CREDITS`.
   - Requests D and E also return `INSUFFICIENT_CREDITS`.
   - The user spent exactly 4 credits across 2 successful requests and was blocked on the remaining 3.
   - Balance never drops below 0.
3. **Database Constraint Safety Net:**  
   Even if an application developer bypassed the advisory lock and attempted a concurrent raw insert, the check constraint `ai_credit_ledger_running_balance_positive CHECK (running_balance >= 0)` ensures that PostgreSQL aborts the transaction with an integrity violation before writing a negative balance.

---

## 4. Defect Deep Dives

### Defect AI-01: Multiple Expensive AI Endpoints Bypass Credit Checks Entirely
- **Locations in `app.ts`:**
  1. `POST /api/analyze-career` (Line 1787):  
     Invokes Gemini model for an extensive career and skills gap analysis.  
     **Observed:** Protected by `requireAuth` and `aiRateLimit`. **Zero credit check or deduction.**
  2. `POST /api/suggest-summary` (Line 2021):  
     Invokes Gemini model to compose tailored professional summaries.  
     **Observed:** Protected by `requireAuth` and `aiRateLimit`. **Zero credit check or deduction.**
  3. `POST /api/cv/job-description/generate` (Line 2604):  
     Invokes Gemini model to create complete JD specifications.  
     **Observed:** Protected by `requireAuth` and `aiRateLimit`. **Zero credit check or deduction.**
  4. `POST /api/projects/recommendations` (Line 2682) & `/api/projects/analyze` (Line 2744):  
     Invokes Gemini model for portfolio project suggestions and technical review.  
     **Observed:** Even though `project_analysis` (weight = 1) is defined in `AICreditAction`, these routes do not use `requireCredits('project_analysis')`.
  5. `POST /api/learning/recommendations` (Line 5875):  
     Invokes Gemini model for learning catalog analysis.  
     **Observed:** Even though `learning_recommendation` (weight = 1) is defined in `AICreditAction`, this route does not use `requireCredits('learning_recommendation')`.
  6. `POST /api/copilot` (Line 1646):  
     Uses `requireCredits('career_consultation_chat')`, but lacks `requireEntitlement('ai_mentor.session')`.  
     **Impact:** Free and Student users can deplete basic trial credits on the Pro/Career Plus exclusive AI Mentor feature.

- **Financial & Abuse Impact:**  
  A rogue user or bot can repeatedly call `/api/analyze-career` or `/api/suggest-summary` to generate unlimited text from Gemini at zero credit cost, exhausting server API quotas and incurring Gemini API billing charges for the business.

---

### Defect AI-02: Missing Separation Between Monthly Subscription Credits and Purchased Packs
- **Location:**  
  `supabase/migrations/20261110000003_verifications_and_ai_credits.sql` (Lines 88–135)  
  `supabase/migrations/20261110000004_privacy_birthdays_events_and_procs.sql` (Lines 575–639)
- **Approved Business Requirement:**  
  "Purchased credits and monthly subscription credits remain distinguishable. Monthly credits do not roll over."
- **Analysis:**  
  `public.ai_credit_ledger` tracks credit additions and subtractions as a single running balance:
  ```sql
  running_balance integer NOT NULL
  ```
  When `expire_subscriptions()` runs upon billing cycle expiration:
  - It transitions the subscription status to `'expired'`.
  - It does **NOT** touch the credit ledger.
  - If a Student subscriber received 25 credits and only used 5 credits, the remaining 20 credits remain in their `running_balance` forever.
  - If the same user also bought a 40-credit pack, their balance is 60 credits. The system cannot distinguish which credits expire at the end of the month and which credits are non-expiring purchased pack credits.
- **Remediation Strategy:**  
  Implement a lot-based ledger or dual-balance tracking:
  - Track `subscription_credits` (expiring at `current_period_ends_at`) and `purchased_credits` (non-expiring).
  - Deduct from `subscription_credits` first before consuming `purchased_credits`.
  - When a subscription expires or renews, emit an `'expire'` operation in the ledger that clears the remaining unspent `subscription_credits`.

---

### Defect AI-03: Admin Credit Grant Route Fails Check Constraint & Sets Zero Balance
- **Location:**  
  `server/subscriptions/routes.ts` (Lines 551–569)
- **Observed Code:**
  ```typescript
  const { error: ledgerErr } = await getSupabaseServer()
    .from('ai_credit_ledger')
    .insert({
      profile_id: profileId,
      amount,
      running_balance: 0, // Computed by DB trigger or balance query
      operation: 'grant',
      source_type: 'admin_grant',
      source_id: req.admin!.id,
      idempotency_key: idempotencyKey,
      description: reason,
      metadata: { grantedByAdminEmail: req.admin!.email },
    });
  ```
- **Analysis:**
  1. `source_type: 'admin_grant'` causes PostgreSQL to throw:
     `new row for relation "ai_credit_ledger" violates check constraint "ai_credit_ledger_source_type_check"` because the allowed set is `('subscription', 'payment', 'admin', 'system', 'onboarding', 'birthday', 'trial')`.
  2. The code authors assumed a trigger would calculate `running_balance`. No such trigger exists in the schema.
  3. Hardcoding `running_balance: 0` means that if the insert succeeded, `getCreditBalance()` (which reads `ORDER BY created_at DESC LIMIT 1`) would report the candidate's balance as **0 credits**, completely wiping out their previous balance.
- **Remediation:**  
  Create a stored procedure `admin_grant_ai_credits()` in SQL that locks the user row, reads the current balance, adds `p_amount`, and inserts with `source_type = 'admin'`.

---

## 5. Audit Verdict on AI Credit Subsystem

**NOT APPROVED.**  
While the core concurrency locking mechanism (`pg_advisory_xact_lock`) and check constraints are technically sound, the platform is exposed to massive unmonetized AI API usage due to ungated endpoints, lacks required credit expiration isolation, and possesses broken administrative grant logic.

