# CareerDev4AI — Database Migration Remediation Report

> **Document Type:** PostgreSQL Migration Sequencing, Integrity & Production Deployment Guide  
> **Target Database:** Supabase PostgreSQL (`ciihprsfdojzvjnqgbxl`)  
> **Auditors:** PostgreSQL Architect & DevSecOps Engineer  
> **Date:** 2026-11-06  
> **Status:** All Migrations Hardened, Sequenced, and Verified Locally  

---

## 1. Migration Inventory and Dependency Chain

The subscription subsystem is defined by 7 sequential, additive SQL migrations in `supabase/migrations/`:

```
1. 20261107000001_bootstrap_primary_super_admin.sql
   └── Bootstraps ahmedghannam801@gmail.com without locking out existing admins.

2. 20261110000001_subscription_plans_and_coupons.sql
   └── Creates subscription_plans catalog (Free, Student, Pro, Career Plus) and coupon_definitions.
   └── Remediation applied: Direct authenticated SELECT on coupon_definitions revoked.

3. 20261110000002_subscriptions_and_payments.sql
   └── Creates user_privacy_consents, payment_requests, and subscriptions.
   └── Remediation applied: Direct authenticated INSERT on payment_requests revoked.

4. 20261110000003_verifications_and_ai_credits.sql
   └── Creates payment_verifications audit trail and double-entry ai_credit_ledger.

5. 20261110000004_privacy_birthdays_events_and_procs.sql
   └── Creates birthday_rewards, subscription_events, and core procedures (confirm, consume, refund).

6. 20261110000005_payment_receipts_storage.sql
   └── Provisions private Supabase Storage bucket 'payment-receipts' with folder isolation.

7. 20261110000006_subscription_system_remediation.sql (NEW ADDITIVE CORRECTIVE MIGRATION)
   └── Drops insecure RLS policies (BLK-01, BLK-11).
   └── Adds item_type, credit_pack_id, credits_to_grant to payment_requests (BLK-02).
   └── Creates confirm_credit_pack_payment procedure (BLK-02).
   └── Creates admin_grant_ai_credits procedure (BLK-03).
   └── Updates confirm_payment_and_activate with duplicate reference protection (BLK-10).
   └── Updates expire_subscriptions to isolate and expire only unspent monthly credits (BLK-08).
```

---

## 2. Production Safety Invariants

- **Additive Only:** No historical migrations dropped or altered destructively.
- **No Table Drops:** Zero production tables dropped.
- **No Production Data Modification:** Existing profiles, authentication records, and CVs are 100% preserved.
- **RLS Enabled on All Tables:** Every newly provisioned table enforces Row Level Security.
- **Security Definer Search Path Hardened:** Every procedure explicitly sets `SET search_path = public, pg_temp`.

---

## 3. Remote Deployment Prerequisites (Awaiting Explicit User Authorization)

Per the mandatory rules of this audit:
> **"Do not apply migrations to Production without explicit authorization."**
> **"Never run an unreviewed production db push."**

### Verification of Remote Schema State
A diagnostic check executed on the live remote database (`ciihprsfdojzvjnqgbxl`) confirmed:
- Baseline tables (`profiles`, `admin_users`, `experiences`, `cv_files`, etc.) exist and are healthy.
- Subscription tables (`subscription_plans`, `payment_requests`, `ai_credit_ledger`) have **NOT YET been created on the remote instance**.
- The 7 subscription migrations are ready for controlled staging/production application.

### Exact CLI Deployment Procedure (When Authorized by User)
```bash
# 1. Verify Supabase project link
npx supabase link --project-ref ciihprsfdojzvjnqgbxl

# 2. Dry-run / review pending migrations
npx supabase migration list

# 3. Apply migrations sequentially
npx supabase db push
```

