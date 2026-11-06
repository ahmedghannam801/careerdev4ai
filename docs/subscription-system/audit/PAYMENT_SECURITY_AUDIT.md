# CareerDev4AI — Payment Security & Settlement Audit

> **Document Type:** FinTech Systems Security & Payment State Machine Audit  
> **Target Subsystems:** Offline Egyptian Rails (Vodafone Cash, InstaPay), Receipt Verification, Fraud Scoring, Administrative Settlement  
> **Auditor:** Independent FinTech Systems Security Auditor  
> **Date:** 2026-11-06  
> **Status:** Critical Vulnerabilities Identified  

---

## 1. Egyptian Offline Payment Architecture Context

CareerDev4AI does not use automated online payment gateways (like Stripe or Paymob) because student and fresh-graduate adoption in Egypt relies overwhelmingly on peer-to-peer mobile wallet transfers (**Vodafone Cash**) and instant banking handles (**InstaPay**). 

Because these rails lack direct webhooks or third-party merchant APIs in this operational tier, the platform operates a **hybrid state machine**:
1. Candidate creates checkout intent (calculating piasters and promotional discounts).
2. Candidate transfers funds offline to the designated wallet/handle.
3. Candidate submits proof (transaction reference number, sender phone/handle, receipt screenshot).
4. Automated system performs duplicate detection, SHA-256 hash checks, and fraud scoring.
5. High-confidence submissions receive 24-hour provisional access (`temporary_access`).
6. An authorized human administrator independently confirms financial settlement in the bank/wallet app, transitioning the payment to `paid`.

---

## 2. Security Requirements & Verification Checklist

| Security Control | Required Standard | Actual Implementation | Audit Finding |
| :--- | :--- | :--- | :--- |
| **Receipt Independence** | Receipt upload must NEVER independently mark payment as `paid`. | Handled in `submitEvidence()` (`server/payments/service.ts:195–227`). Status transitions strictly to `temporary_access` or `under_review`. | **PASSED** |
| **OCR / Risk Independence** | Automated risk scores must NEVER be treated as settlement proof. | Risk score strictly gates provisional access (`riskScore < 40`). Never sets status to `paid`. | **PASSED** |
| **Human Settlement Gate** | Transition to `paid` requires an authenticated human administrator with valid permissions. | Stored procedure `confirm_payment_and_activate()` verifies `admin_users` record; route requires `requirePermission('payments.confirm')`. | **PASSED** |
| **Direct Client Tampering** | Clients must NOT be able to insert or update payment records via Supabase direct API. | RLS policy `payment_requests_insert_own` allows direct `INSERT` with `status = 'temporary_access'`. | **FAILED (CRITICAL)** |
| **Confirmation Idempotency** | Replaying payment confirmation must not double-grant credits or extend periods. | Checked in `confirm_payment_and_activate()` (Lines 201–203): exits early with `success: true` if already `paid`. | **PASSED** |
| **Duplicate Reference Protection** | System must flag identical transaction references across payment requests. | `isTransactionReferenceDuplicate()` flags matches, adds 50 to risk score. Non-unique index in DB. | **PARTIALLY PASSED** |
| **Receipt Image Replay Protection** | System must detect reused receipt screenshots across different users. | SHA-256 hash computed on upload; `isReceiptHashDuplicate()` flags matches, adds 60 to risk score. | **PASSED** |
| **Provisional Access Expiry** | Expired temporary access must automatically revoke privileges. | Stored procedure `expire_temporary_access()` sets status to `'expired'` and suspends subscription. | **PASSED** |
| **Late Settlement Restoration** | Legitimate payments verified after expiration must restore access from confirmation date. | Procedure `late_payment_restore()` updates start date to `now()` and extends duration from confirmation. | **PASSED** |
| **Revenue Isolation** | Unverified, pending, and temporary payments must NOT enter financial revenue totals. | `/api/admin/revenue` filters strictly on `status = 'paid'`. | **PASSED** |
| **Audit Trail Accountability** | All admin actions (confirm, reject, restore) must be logged in `admin_audit_log`. | Handled via `logAdminAction()` in `server/subscriptions/routes.ts` and `payment_verifications` rows. | **PASSED** |

---

## 3. Deep Vulnerability Analysis

### CRITICAL-01: Unauthorized Elevation to Pro Tier via Direct Client Database Insertion
- **Location:**  
  `supabase/migrations/20261110000002_subscriptions_and_payments.sql` (Lines 169–173, 190)  
  `server/subscriptions/entitlements.ts` (Lines 54–61)
- **Vulnerability Mechanism:**  
  The migration grants `INSERT` on `public.payment_requests` to `authenticated` users:
  ```sql
  CREATE POLICY payment_requests_insert_own ON public.payment_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = profile_id);
  
  GRANT SELECT, INSERT ON public.payment_requests TO authenticated;
  ```
  Because PostgreSQL Row Level Security `WITH CHECK` clauses only evaluate the specified predicate (`auth.uid() = profile_id`), PostgreSQL does not restrict what values can be inserted into the remaining columns (`status`, `plan_id`, `temporary_access_expires_at`).
  
  An attacker can bypass the frontend checkout entirely and send a raw HTTP request to the Supabase PostgREST endpoint:
  ```bash
  curl -X POST 'https://ciihprsfdojzvjnqgbxl.supabase.co/rest/v1/payment_requests' \
    -H 'apikey: <anon-key>' \
    -H 'Authorization: Bearer <attacker-jwt>' \
    -H 'Content-Type: application/json' \
    -d '{
      "profile_id": "<attacker-profile-id>",
      "plan_id": "<pro-plan-uuid>",
      "billing_cycle": "monthly",
      "original_amount_piasters": 17900,
      "discount_amount_piasters": 0,
      "amount_piasters": 17900,
      "payment_method": "instapay",
      "status": "temporary_access",
      "temporary_access_granted_at": "2026-11-06T18:00:00Z",
      "temporary_access_expires_at": "2026-11-07T18:00:00Z",
      "idempotency_key": "exploit_temp_access_01",
      "expires_at": "2026-11-07T18:00:00Z"
    }'
  ```
  When the attacker makes subsequent requests to the CareerDev4AI backend API:
  1. `getUserEffectivePlan(attackerId)` runs.
  2. It invokes `getActiveTemporaryAccessPayment(attackerId)`.
  3. The database returns the maliciously injected row because `status = 'temporary_access'` and `temporary_access_expires_at > now()`.
  4. The candidate is granted active Pro tier status for 24 hours.
  5. The attacker can repeat this call every 24 hours to obtain perpetual free Pro tier access without ever submitting a payment.

- **Remediation Steps:**
  1. In `supabase/migrations/`: Drop the client insert policy:
     ```sql
     DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;
     REVOKE INSERT ON public.payment_requests FROM authenticated;
     ```
  2. Ensure only `service_role` has `INSERT` and `UPDATE` grants on `payment_requests`.
  3. Add a database check constraint or trigger ensuring that even if a row were somehow inserted by a non-service role, `status` can only ever be initialized to `'pending'`.

---

### MEDIUM-01: Missing Database Uniqueness Constraint on Confirmed Transaction References
- **Location:**  
  `supabase/migrations/20261110000002_subscriptions_and_payments.sql` (Lines 154–156)  
  `supabase/migrations/20261110000004_privacy_birthdays_events_and_procs.sql` (Lines 158–285)
- **Vulnerability Mechanism:**  
  The index created on transaction references is non-unique:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_payment_requests_tx_reference
    ON public.payment_requests (payment_method, lower(trim(transaction_reference)))
    WHERE (transaction_reference IS NOT NULL AND status IN ('paid', 'under_review', 'temporary_access'));
  ```
  While `submitEvidence()` checks `isTransactionReferenceDuplicate()` and flags the fraud score, there is **no database-level constraint** preventing an administrator from confirming multiple payments with the exact same transaction reference.
  
  If two candidates submit the same transaction reference (or one candidate submits twice and two admins review concurrently), stored procedure `confirm_payment_and_activate()` does not check whether another row with the same `(payment_method, transaction_reference)` is already marked `status = 'paid'`. Both payments will transition to `paid` and activate separate subscriptions.

- **Remediation Steps:**
  In `confirm_payment_and_activate()`, add a pre-confirmation check:
  ```sql
  IF v_payment.transaction_reference IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.payment_requests
      WHERE payment_method = v_payment.payment_method
        AND lower(trim(transaction_reference)) = lower(trim(v_payment.transaction_reference))
        AND status = 'paid'
        AND id <> p_payment_id
    ) THEN
      RAISE EXCEPTION 'Transaction reference % has already been confirmed for another payment.', v_payment.transaction_reference;
    END IF;
  END IF;
  ```

---

## 4. State Machine Transition Verification

```
[Checkout Created] ─────────────> status: 'pending'
         │
         ▼
[Evidence Submitted]
         ├── Risk Score >= 40 ──> status: 'under_review' (No temporary access)
         └── Risk Score < 40 ───> status: 'temporary_access' (24h temporary access granted)
                  │
         ┌────────┴───────────────────────────┬──────────────────────────────┐
         ▼                                    ▼                              ▼
[Admin Confirms]                     [24h Window Elapses]           [Admin Rejects]
  status: 'paid'                       status: 'expired'              status: 'rejected'
  subscription: 'active'               subscription: 'suspended'      subscription: 'cancelled'
  credits granted                      no credits granted             no credits granted
                                              │
                                              ▼
                                     [Late Admin Restore]
                                       status: 'paid'
                                       subscription: 'active' (restored from now())
                                       credits granted
```

**State Transition Integrity Assessment:**  
The transitions defined above are logically sound in `confirm_payment_and_activate()`, `expire_temporary_access()`, and `late_payment_restore()`.  
The single point of failure in the state machine is that direct database writes (`INSERT`) are currently permitted from the client browser, undermining the entire state machine.

---

## 5. Settlement & Audit Logging Integrity

1. **Isolation of Collected Revenue:**  
   In `server/subscriptions/routes.ts`, `/api/admin/revenue` exclusively filters:
   ```typescript
   .eq('status', 'paid')
   ```
   Payments in `'pending'`, `'under_review'`, `'temporary_access'`, `'rejected'`, or `'expired'` are completely excluded from the financial metrics. This adheres strictly to international accounting standards and Egyptian tax/financial reporting principles.

2. **Immutable Audit Trail:**  
   Every admin confirmation, rejection, and restoration writes a record to both `public.payment_verifications` and `public.admin_audit_log`.  
   The audit log captures the acting admin ID, email, target entity, timestamp, and metadata notes.

---

## 6. Payment Security Audit Verdict

**FAIL.**  
The Egyptian offline payment flow is robust in its human confirmation requirements, risk scoring, and SHA-256 receipt hashing. However, the critical vulnerability permitting direct client insertion on `public.payment_requests` allows unauthorized temporary access creation and must be remediated immediately prior to production launch.

