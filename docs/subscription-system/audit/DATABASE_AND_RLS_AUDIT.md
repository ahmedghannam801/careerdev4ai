# CareerDev4AI — Database Schema, Migrations & Row-Level Security Audit

> **Document Type:** PostgreSQL Database Architecture, Migrations & RLS Security Audit  
> **Auditor:** Independent Principal PostgreSQL & Supabase Security Specialist  
> **Target Database:** Supabase PostgreSQL (`ciihprsfdojzvjnqgbxl`)  
> **Date:** 2026-11-06  
> **Status:** Critical RLS Vulnerabilities & Remote Deployment Gaps  

---

## 1. Migration Dependency & Sequencing Audit

The implementation introduced 6 sequential migration files in `supabase/migrations/`:

```
20261107000001_bootstrap_primary_super_admin.sql
    │
    ▼
20261110000001_subscription_plans_and_coupons.sql
    │
    ▼
20261110000002_subscriptions_and_payments.sql
    │
    ▼
20261110000003_verifications_and_ai_credits.sql
    │
    ▼
20261110000004_privacy_birthdays_events_and_procs.sql
    │
    ▼
20261110000005_payment_receipts_storage.sql
```

### Migration Verification Findings
1. **Timestamp Inconsistency:**  
   The migration files are dated between `2026-11-07` and `2026-11-10`. While forward-dated timestamps do not violate PostgreSQL syntax, they create potential ordering collisions if additional emergency migrations are introduced before these dates.
2. **Execution State in Production:**  
   **CRITICAL DEPLOYMENT FINDING:** These 6 migrations exist **only in the local repository** and have NOT yet been applied to the live Supabase production project (`ciihprsfdojzvjnqgbxl`). Deploying the frontend build right now will cause immediate runtime fatal crashes across all subscription views because tables such as `public.subscription_plans` and `public.subscriptions` do not exist in the remote database.
3. **Super Admin Bootstrap (`20261107000001`):**  
   - Resolves profile ID dynamically from `auth.users` joined with `public.profiles` for `ahmedghannam801@gmail.com`.
   - Safely guards against missing accounts (`IF v_profile_id IS NULL THEN RAISE NOTICE ...; RETURN; END IF;`).
   - Does not delete or overwrite the existing Super Admin account (`ahdabdalla77@gmail.com`), preventing administrator lockout.
   - Audit event logged in `public.admin_audit_log`. **PASSED.**

---

## 2. Table-by-Table Row-Level Security (RLS) & Grant Audit

| Table Name | RLS Enabled | Policies Defined | Permitted Roles | Security Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `public.subscription_plans` | **YES** | Public read on active plans; Super Admin write. | `anon`, `authenticated`, `service_role` | **SECURE.** Plan catalog is safely viewable by all users. |
| `public.coupon_definitions` | **YES** | Authenticated read for active valid coupons; Admin write. | `authenticated`, `service_role` | **INFORMATIONAL RISK.** Exposes all active coupon codes to direct client `SELECT`. |
| `public.user_privacy_consents` | **YES** | Candidates can read, insert, and update (`withdrawn`) own records. | `authenticated`, `service_role` | **SECURE.** Compliant with Egypt Law 151. |
| `public.payment_requests` | **YES** | Read own; Insert own; Admin all. | `authenticated`, `service_role` | **CRITICAL VULNERABILITY.** Direct client `INSERT` allows unauthorized Pro temporary access. |
| `public.subscriptions` | **YES** | Read own; Admin read; Super Admin write. | `authenticated`, `service_role` | **SECURE.** No direct candidate inserts or updates. |
| `public.payment_verifications` | **YES** | Read own (via payment request join); Admin all. | `authenticated`, `service_role` | **SECURE.** Candidate cannot forge verification records. |
| `public.ai_credit_ledger` | **YES** | Read own; Admin read; Service role all. | `authenticated`, `service_role` | **SECURE.** Candidates cannot write directly to ledger. |
| `public.birthday_rewards` | **YES** | Read own; Admin read; Service role all. | `authenticated`, `service_role` | **SECURE.** Provisioned server-side only. |
| `public.subscription_events` | **YES** | Read own; Admin read; Service role all. | `authenticated`, `service_role` | **SECURE.** Append-only event store. |
| `storage.objects` (`payment-receipts`) | **YES** | Candidate folder isolation (`{uid}/...`); Admin read. | `authenticated`, `service_role` | **SECURE.** Private bucket; 5MB limit; PNG/JPEG only. |

---

## 3. Detailed Security Findings

### RLS-01: Critical Flaw in `payment_requests_insert_own`
- **File:** `supabase/migrations/20261110000002_subscriptions_and_payments.sql` (Lines 169–173, 190)
- **Code:**
  ```sql
  DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;
  CREATE POLICY payment_requests_insert_own ON public.payment_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = profile_id);

  GRANT SELECT, INSERT ON public.payment_requests TO authenticated;
  ```
- **Exploitation Vector:**  
  By default in PostgREST, if a user has `INSERT` grant and matches the RLS policy `auth.uid() = profile_id`, they can submit any column value. A user can set `status = 'temporary_access'`, `plan_id = pro_plan_id`, and `temporary_access_expires_at = now() + 24 hours`. The application interprets this row as an active Pro subscription in `server/subscriptions/entitlements.ts`.
- **Fix:**  
  Drop the policy and revoke `INSERT` from `authenticated`:
  ```sql
  DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;
  REVOKE INSERT ON public.payment_requests FROM authenticated;
  ```
  All checkouts must be created exclusively via `createPaymentRequest()` in the server backend using `getSupabaseServer()` (`service_role`).

---

### RLS-02: Information Disclosure via `coupon_definitions` Client SELECT
- **File:** `supabase/migrations/20261110000001_subscription_plans_and_coupons.sql` (Lines 184–190, 208)
- **Code:**
  ```sql
  CREATE POLICY coupon_definitions_select_active ON public.coupon_definitions
    FOR SELECT TO authenticated
    USING (
      is_active = true AND
      now() BETWEEN valid_from AND valid_until
    );

  GRANT SELECT ON public.coupon_definitions TO authenticated;
  ```
- **Risk:**  
  Any signed-in user can run `supabase.from('coupon_definitions').select('*')` in browser DevTools to scrape all unreleased, influencer, or private promotion codes along with their discount amounts and rules.
- **Remediation:**  
  Revoke `SELECT` on `coupon_definitions` from `authenticated`. Coupon validation should occur strictly server-side through `validateCoupon()` in `server/coupons/service.ts`.

---

## 4. Stored Procedures Security & Search Path Hardening

Audit of `supabase/migrations/20261110000004_privacy_birthdays_events_and_procs.sql`:
1. **Search Path Hardening:**  
   All 6 stored procedures (`confirm_payment_and_activate`, `consume_ai_credits`, `refund_ai_credits`, `expire_subscriptions`, `expire_temporary_access`, `late_payment_restore`) include:
   ```sql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   ```
   This prevents schema-search-path hijacking attacks. **PASSED.**
2. **Execution Permissions:**  
   All procedures revoke permissions from `PUBLIC`, `anon`, and `authenticated`, granting execution strictly to `service_role`:
   ```sql
   REVOKE ALL ON FUNCTION public.confirm_payment_and_activate(...) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.confirm_payment_and_activate(...) TO service_role;
   ```
   Candidates cannot invoke these procedures directly via RPC. **PASSED.**

---

## 5. Storage Bucket Configuration Audit

Audit of `supabase/migrations/20261110000005_payment_receipts_storage.sql`:
- **Bucket ID:** `payment-receipts`
- **Public Access:** `public = false` (Private bucket).
- **Size Limit:** 5,242,880 bytes (5 MB).
- **MIME Types:** Restricted to `image/png` and `image/jpeg`.
- **Object Isolation Policy:**  
  Uses `public.storage_object_owner(name) = auth.uid()::text` to enforce that candidates can only upload into a top-level directory matching their own profile UUID (`{profileId}/{paymentRequestId}_{timestamp}.{ext}`).
- **Read Permissions:**  
  Candidate can read own receipts. Administrators can read receipts across all candidates. Public read is disabled. **PASSED.**

---

## 6. Database Audit Verdict

**FAIL.**  
While the core schema constraints, advisory locks, and storage policies are well designed, the direct client `INSERT` vulnerability on `public.payment_requests` and the coupon leakage on `coupon_definitions` constitute significant security weaknesses. Furthermore, the migrations have not been applied to production.

