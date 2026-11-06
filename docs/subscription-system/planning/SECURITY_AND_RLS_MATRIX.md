# Security & Row Level Security (RLS) Matrix
## CareerDev4AI Subscription, Payment & AI Credit Architecture

- **Document Version**: 1.0.0
- **Status**: ARCHITECTURAL SPECIFICATION — AUTHORITATIVE SINGLE SOURCE OF TRUTH
- **Target Platform**: CareerDev4AI (Egypt-First Career Super App)
- **Runtime Environment**: React 19, Vite, Tailwind CSS 4, Supabase PostgreSQL 15+, Supabase Auth, Cloudflare Pages/Workers, Cloudflare Queues, Google Gemini AI, Express
- **Target File Path**: `docs/subscription-system/planning/SECURITY_AND_RLS_MATRIX.md`
- **Primary Currency**: Egyptian Pound (EGP / ج.م), stored as integer Egyptian Piasters (1 EGP = 100 Piasters)

---

## 1. Executive Summary & Security Baseline

This document specifies the authoritative security model, PostgreSQL Row Level Security (RLS) policies, server-side role-based access control (RBAC), rate-limiting profiles, secret isolation boundaries, and audit logging standards for the CareerDev4AI Subscription, Payment, and AI Credit system.

### 1.1 Architectural Classification: Facts, Assumptions, and Recommendations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE TAXONOMY                         │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│     VERIFIED FACTS       │       ASSUMPTIONS        │    RECOMMENDATIONS    │
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│ • Supabase Auth JWT      │ • Vodafone Cash/InstaPay │ • Zero-trust credit   │
│   verification server-   │   proofs require manual  │   balance checks via  │
│   side (getUser)         │   admin review + async   │   atomic SQL ledger   │
│ • profiles(id) =         │   OCR assist             │ • Private bucket for  │
│   auth.users(id)         │ • Temporary access       │   receipts with       │
│ • Admin RBAC enforced in │   granted optimistically │   signed URLs only    │
│   server/admin/          │   for Low Risk (<25)     │ • Multi-tier sliding  │
│ • Client never receives  │ • Birthday consent       │   window rate limits  │
│   service-role key       │   strictly omits year    │   at edge worker      │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

#### Verified Facts (Existing Codebase)
1. **Authentication & Identity**: Supabase Auth issues JWT access tokens. Server-side token validation is performed by [`verifySupabaseToken`](file:///d:/Saas/careerpilot-ai/server/auth/supabase-auth.ts#L18-L85) via `supabase.auth.getUser()`. User identity is permanently bound to `auth.users.id`, which mirrors 1:1 to `public.profiles.id` ([`20251019000000_fresh_project_baseline.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/20251019000000_fresh_project_baseline.sql#L29-L56)).
2. **Legal Consent Enforcement**: The [`requireAuth`](file:///d:/Saas/careerpilot-ai/server/auth/require-auth.ts#L79-L134) middleware verifies the JWT and validates current acceptance of the Terms of Service (`TERMS_VERSION = '2026-11-04'`) and Privacy Policy (`PRIVACY_VERSION = '2026-11-03'`) from `public.user_consents`. Consent-exempt routes use [`requireSession`](file:///d:/Saas/careerpilot-ai/server/auth/require-auth.ts#L37-L65).
3. **Privileged Database Access**: The server-side client ([`getSupabaseServer`](file:///d:/Saas/careerpilot-ai/server/db/supabase.ts#L10-L22)) utilizes `process.env.SUPABASE_SERVICE_ROLE_KEY`. This key bypasses PostgreSQL RLS and is strictly confined to server-side Node/Worker runtimes. It is never prefixed with `VITE_` and never bundled to the client.
4. **Administrative Hierarchy & RBAC**: Administrative roles (`super_admin`, `content_admin`, `opportunity_admin`, `moderator`) are stored in `public.admin_users` ([`20261102000006_admin_communication.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/20261102000006_admin_communication.sql#L24-L42)). Server routes enforce authorization via [`requireAdmin`](file:///d:/Saas/careerpilot-ai/server/admin/permissions.ts#L32-L51) and [`requirePermission`](file:///d:/Saas/careerpilot-ai/server/admin/permissions.ts#L54-L64). Client-supplied roles or permissions are never trusted.
5. **Last Super Admin Invariant**: The database layer protects the platform by preventing demotion, deactivation, or deletion of the last remaining active Super Admin ([`server/db/admin.ts`](file:///d:/Saas/careerpilot-ai/server/db/admin.ts#L237-L276)).
6. **Hardened Audit Logging**: The administrative audit trail lives in `public.admin_audit_log` ([`20261102000006_admin_communication.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/20261102000006_admin_communication.sql#L103-L121)). Public table grants were completely revoked from `anon` and `authenticated` in [`20261104000001_admin_audit_log_grants.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/20261104000001_admin_audit_log_grants.sql#L19-L20).
7. **Storage Object Ownership**: Supabase Storage enforces ownership via `public.storage_object_owner(object_name text)` which extracts the root path segment (`(storage.foldername(object_name))[1]`), hardened with a locked search path in [`202610270002_production_security_function_hardening.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/202610270002_production_security_function_hardening.sql#L38).
8. **Discrepancy in Super Admin Bootstrap**: Migration `20261102000006_admin_communication.sql` bootstraps `ahdabdalla77@gmail.com` as the initial `super_admin`. However, the subscription specification explicitly requires `ahmedghannam801@gmail.com` as the primary Super Admin. This discrepancy is reconciled via a dedicated, idempotent migration detailed in Section 10.

#### Assumptions
1. **Egyptian Payment Landscape**: Egypt's dominant payment channels (Vodafone Cash and InstaPay) lack public automated merchant webhooks for standard accounts. Payment confirmation relies on user-submitted transaction reference IDs and screenshot receipts, requiring human administrative verification augmented by automated OCR/perceptual hashing.
2. **Provisional Access Risk Tolerance**: To prevent drop-off while human administrators reconcile manual transfers, submissions with an automated risk score $\le 25$ are granted an optimistic 24-hour `temporary_access` window. Access is restricted to operations costing $\le 2$ AI credits to contain financial exposure.
3. **Privacy by Design**: Storing birth years poses age-discrimination and compliance risks. Birthday reward eligibility requires only birth month (1–12) and birth day (1–31). Birth year is never requested or stored.

#### Recommendations
1. **Integer Piaster Standard**: All financial values must be stored as signed 32-bit or 64-bit integers representing Egyptian Piasters (1 EGP = 100 Piasters) to eliminate IEEE 754 floating-point rounding errors.
2. **Immutable Double-Entry Ledger**: AI credits must never be managed via a mutable counter column on `profiles`. Every addition, deduction, reservation, and refund must exist as an append-only entry in `public.ai_credit_ledger`.
3. **Row-Level Advisory Locks**: Concurrent credit-spend operations for a single profile must be serialized using PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) keyed to the candidate's UUID hash.

---

## 2. Row Level Security (RLS) Policy Matrix for All New Tables

All 9 tables introduced by the subscription, payment, and AI credit system have Row Level Security explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Client access (`anon` and `authenticated`) is reduced to the absolute minimum necessary for user experience. Privileged mutations are executed exclusively via the server-side service-role client.

### 2.1 Complete RLS Matrix

| Table | Operation | Target Role | Policy Definition (`USING` / `WITH CHECK`) | Defense-in-Depth Rationale |
|---|---|---|---|---|
| `subscription_plans` | `SELECT` | `anon`, `authenticated` | `USING (is_active = true)` | Public pricing catalog; hidden or deprecated plans are invisible to clients. |
| `subscription_plans` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Catalog definitions are immutable to clients; managed solely by Super Admin via API. |
| `subscription_plans` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Prevents price or credit allocation tampering. |
| `subscription_plans` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Prevents destructive deletion of active plan tiers. |
| `subscriptions` | `SELECT` | `authenticated` | `USING (auth.uid() = profile_id)` | Candidates may inspect only their own active and historical subscriptions. |
| `subscriptions` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Candidates cannot grant themselves subscriptions. |
| `subscriptions` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | State, tier, and expiration dates are strictly server-managed. |
| `subscriptions` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Subscriptions are permanent financial records; cancellation updates `status`. |
| `payment_requests` | `SELECT` | `authenticated` | `USING (auth.uid() = profile_id)` | Candidates may view their own payment history and review statuses. |
| `payment_requests` | `INSERT` | `authenticated` | `WITH CHECK (auth.uid() = profile_id AND status = 'pending')` | Candidate initiates checkout; initial state must be `pending`. |
| `payment_requests` | `UPDATE` | `authenticated` | `USING (auth.uid() = profile_id AND status = 'pending') WITH CHECK (auth.uid() = profile_id AND status IN ('pending', 'under_review'))` | Candidate can attach receipt reference and advance to `under_review`; cannot transition to `paid`. |
| `payment_requests` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Payment requests form an immutable financial audit trail. |
| `payment_verifications` | `SELECT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Internal fraud scores, admin notes, and OCR evidence are admin-only via API. |
| `payment_verifications` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Verifications are created solely by background workers or authorized admins. |
| `payment_verifications` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Verification records are append-only audit artifacts. |
| `payment_verifications` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Deletion strictly forbidden. |
| `ai_credit_ledger` | `SELECT` | `authenticated` | `USING (auth.uid() = profile_id)` | Candidates may read their own balance and credit transaction history. |
| `ai_credit_ledger` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Ledger modifications must pass through server-side credit reservation engine. |
| `ai_credit_ledger` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Double-entry ledger is immutable; adjustments require offsetting entry. |
| `ai_credit_ledger` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Ledger history is legally and operationally immutable. |
| `coupon_definitions` | `SELECT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Prevents enumeration/scraping of coupon codes; validation runs via server API. |
| `coupon_definitions` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Admin-only creation. |
| `coupon_definitions` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Admin-only updates (deactivation, redemption limit changes). |
| `coupon_definitions` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Soft-deactivation via `is_active = false` preferred. |
| `birthday_rewards` | `SELECT` | `authenticated` | `USING (auth.uid() = profile_id)` | Candidates can inspect their own birthday discounts. |
| `birthday_rewards` | `INSERT` | `authenticated` | `WITH CHECK (auth.uid() = profile_id)` | Candidate can submit birthday data when consenting. |
| `birthday_rewards` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Redemption status and discount validity are managed by server. |
| `birthday_rewards` | `DELETE` | `authenticated` | `USING (auth.uid() = profile_id)` | Right to erasure: candidate may delete birthday reward data upon consent revocation. |
| `subscription_events` | `SELECT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Internal state machine transitions and audit snapshots are server-only. |
| `subscription_events` | `INSERT` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Written solely by PostgreSQL triggers or server state machine handlers. |
| `subscription_events` | `UPDATE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Event stream is append-only. |
| `subscription_events` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Audit trail cannot be purged by clients. |
| `user_privacy_consents` | `SELECT` | `authenticated` | `USING (auth.uid() = profile_id)` | Candidate views own privacy consents. |
| `user_privacy_consents` | `INSERT` | `authenticated` | `WITH CHECK (auth.uid() = profile_id)` | Candidate grants specific consent (e.g., birthday reward). |
| `user_privacy_consents` | `UPDATE` | `authenticated` | `USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id)` | Candidate withdraws consent (`status = 'withdrawn'`). |
| `user_privacy_consents` | `DELETE` | `anon`, `authenticated` | `DENY ALL` (Revoked grants) | Consents are legally versioned audit logs; never hard-deleted. |

---

### 2.2 DDL Implementation of RLS Policies & Grants

```sql
-- ============================================================================
-- 1. subscription_plans
-- ============================================================================
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_select_active ON public.subscription_plans;
CREATE POLICY subscription_plans_select_active ON public.subscription_plans
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Strip mutation grants from client roles
REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM anon, authenticated;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;

-- ============================================================================
-- 2. subscriptions
-- ============================================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

REVOKE ALL ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

-- ============================================================================
-- 3. payment_requests
-- ============================================================================
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_requests_select_own ON public.payment_requests;
CREATE POLICY payment_requests_select_own ON public.payment_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS payment_requests_insert_own ON public.payment_requests;
CREATE POLICY payment_requests_insert_own ON public.payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = profile_id 
    AND status = 'pending'
  );

DROP POLICY IF EXISTS payment_requests_update_own ON public.payment_requests;
CREATE POLICY payment_requests_update_own ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = profile_id 
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = profile_id 
    AND status IN ('pending', 'under_review')
  );

REVOKE ALL ON public.payment_requests FROM anon;
REVOKE DELETE ON public.payment_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO authenticated;

-- ============================================================================
-- 4. payment_verifications
-- ============================================================================
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;

-- Complete isolation: no client policies. Handled entirely via service role.
REVOKE ALL ON public.payment_verifications FROM anon, authenticated;

-- ============================================================================
-- 5. ai_credit_ledger
-- ============================================================================
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_credit_ledger_select_own ON public.ai_credit_ledger;
CREATE POLICY ai_credit_ledger_select_own ON public.ai_credit_ledger
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

REVOKE ALL ON public.ai_credit_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_credit_ledger FROM authenticated;
GRANT SELECT ON public.ai_credit_ledger TO authenticated;

-- ============================================================================
-- 6. coupon_definitions
-- ============================================================================
ALTER TABLE public.coupon_definitions ENABLE ROW LEVEL SECURITY;

-- Deny enumeration to clients: validation goes through RPC or API
REVOKE ALL ON public.coupon_definitions FROM anon, authenticated;

-- ============================================================================
-- 7. birthday_rewards
-- ============================================================================
ALTER TABLE public.birthday_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS birthday_rewards_select_own ON public.birthday_rewards;
CREATE POLICY birthday_rewards_select_own ON public.birthday_rewards
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS birthday_rewards_insert_own ON public.birthday_rewards;
CREATE POLICY birthday_rewards_insert_own ON public.birthday_rewards
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS birthday_rewards_delete_own ON public.birthday_rewards;
CREATE POLICY birthday_rewards_delete_own ON public.birthday_rewards
  FOR DELETE TO authenticated
  USING (auth.uid() = profile_id);

REVOKE ALL ON public.birthday_rewards FROM anon;
REVOKE UPDATE ON public.birthday_rewards FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.birthday_rewards TO authenticated;

-- ============================================================================
-- 8. subscription_events
-- ============================================================================
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Pure server/trigger audit table
REVOKE ALL ON public.subscription_events FROM anon, authenticated;

-- ============================================================================
-- 9. user_privacy_consents
-- ============================================================================
ALTER TABLE public.user_privacy_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_privacy_consents_select_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_select_own ON public.user_privacy_consents
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_privacy_consents_insert_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_insert_own ON public.user_privacy_consents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_privacy_consents_update_own ON public.user_privacy_consents;
CREATE POLICY user_privacy_consents_update_own ON public.user_privacy_consents
  FOR UPDATE TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

REVOKE ALL ON public.user_privacy_consents FROM anon;
REVOKE DELETE ON public.user_privacy_consents FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_privacy_consents TO authenticated;
```

---

## 3. Server-Side Authorization Matrix

Frontend visibility toggles are cosmetic. True security boundaries reside in server middleware. Every incoming request must traverse the authentication pipeline before reaching business logic handlers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API REQUEST AUTHORIZATION PIPELINE                       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Cloudflare Pages Worker    │ (IP Rate Limiting)
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    verifySupabaseToken()      │ (Validates JWT)
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   requireAuth / requireSession│ (Validates Legal Consent)
                      └───────────────┬───────────────┘
                                      │
                                      ├─────────────────────────────────┐
                                      │ (End-User Route)                │ (Admin Route)
                                      ▼                                 ▼
                      ┌───────────────────────────────┐ ┌─────────────────────────────┐
                      │ Ownership Check:              │ │ requireAdmin                │
                      │ req.authUser.id === profile_id│ │ (Status === 'active')       │
                      └───────────────┬───────────────┘ └──────────────┬──────────────┘
                                      │                                │
                                      │                                ▼
                                      │                 ┌─────────────────────────────┐
                                      │                 │ requirePermission(perm)     │
                                      │                 │ (e.g. 'payments.verify')    │
                                      │                 └──────────────┬──────────────┘
                                      │                                │
                                      ▼                                ▼
                      ┌───────────────────────────────────────────────────────────────┐
                      │ Atomic Business Logic Handler (getSupabaseServer)             │
                      └───────────────────────────────────────────────────────────────┘
```

### 3.1 Extended Admin Permissions Definition

To support subscription, payment, and financial administration, the permission vocabulary in [`shared/admin.ts`](file:///d:/Saas/careerpilot-ai/shared/admin.ts#L31-L46) is extended as follows:

```typescript
export const SUBSCRIPTION_ADMIN_PERMISSIONS = [
  'payments.read',      // View payment requests, verifications, receipts, and user billing records
  'payments.verify',    // Confirm or reject payment requests; trigger plan activation
  'payments.refund',    // Issue refunds and revoke subscription access (Super Admin / Finance)
  'coupons.manage',     // Create, update, toggle, or archive coupon codes
  'plans.manage',       // Create, edit, and toggle subscription plan catalog items
  'credits.manage',     // Issue manual credit adjustments, investigate disputes
] as const;

export type SubscriptionAdminPermission = (typeof SUBSCRIPTION_ADMIN_PERMISSIONS)[number];
```

The updated `ROLE_PERMISSIONS` mapping:
- `super_admin`: All permissions (inclusive).
- `content_admin`: Standard content permissions (no payment/financial permissions).
- `opportunity_admin`: Standard opportunity permissions (no payment/financial permissions).
- `moderator`: May be granted `payments.read` for first-line payment triage, but strictly excluded from `payments.verify`, `payments.refund`, and `plans.manage`.

---

### 3.2 Detailed Endpoint Authorization Matrix

| HTTP Method & Route Path | Authentication Level | Required Permission | Data Access Scope | Server-Side Validations Beyond Auth | Rate Limit Profile |
|---|---|---|---|---|---|
| `GET /api/subscription/plans` | Public (Unauthenticated) | None | Active plans catalog only (`is_active = true`) | Filters out draft or deprecated plans. | 30 req / IP / min (Fixed) |
| `GET /api/subscription/me` | Authenticated | None | Caller's profile only (`auth.uid()`) | Verifies user consent; hydrates plan, status, period dates, and credits. | 60 req / user / min (Fixed) |
| `POST /api/subscription/checkout` | Authenticated | None | Caller's profile only | 1. Plan exists & is active.<br>2. Billing cycle in `('monthly', 'annual')`.<br>3. Calculates expected price in piasters.<br>4. Validates coupon (if supplied) and calculates discount.<br>5. Generates `idempotency_key`. | 3 req / user / hour (Sliding) |
| `POST /api/subscription/payment-request/:id/receipt` | Authenticated | None | Own payment request only | 1. Payment request belongs to caller.<br>2. Status is `pending`.<br>3. Validates MIME type and 5MB size limit.<br>4. Computes SHA-256 and pHash.<br>5. Advances state to `under_review`. | 5 req / user / hour (Sliding) |
| `GET /api/subscription/credits` | Authenticated | None | Own balance & history | Reads latest running balance from `ai_credit_ledger`. | 60 req / user / min (Fixed) |
| `POST /api/subscription/credits/reserve` | Internal Server / Worker | Service-Role Token | Target user's ledger | 1. Checks `running_balance >= requested_amount`.<br>2. Acquires row advisory lock.<br>3. Generates reservation UUID. | Internal (No edge limit) |
| `POST /api/subscription/credits/commit` | Internal Server / Worker | Service-Role Token | Target user's ledger | 1. Verifies reservation UUID exists & is pending.<br>2. Writes permanent deduction entry.<br>3. Updates running balance. | Internal (No edge limit) |
| `POST /api/subscription/credits/release` | Internal Server / Worker | Service-Role Token | Target user's ledger | 1. Releases reservation lock on failure.<br>2. Restores balance without penalty. | Internal (No edge limit) |
| `POST /api/subscription/coupons/validate` | Authenticated | None | Coupon validation result | 1. Code exists & `is_active = true`.<br>2. Current time within `valid_from` and `valid_until`.<br>3. Current redemptions < `max_total_redemptions`.<br>4. User hasn't exceeded redemption limit.<br>5. Plan eligibility check. | 5 req / user / min (Fixed) |
| `POST /api/subscription/birthday-reward` | Authenticated | None | Caller's profile only | 1. Explicit consent record in `user_privacy_consents`.<br>2. Month (1–12) and Day (1–31) valid calendar date.<br>3. Checks user hasn't already claimed reward in current calendar year. | 3 req / user / day |
| `GET /api/subscription/birthday-reward/me` | Authenticated | None | Caller's profile only | Returns current year's birthday reward status. | 10 req / user / min |
| `GET /api/admin/payments` | Authenticated Admin | `payments.read` | Filtered list of all payment requests | 1. Validates status filter (`pending`, `under_review`, `paid`, `rejected`).<br>2. Paginates results.<br>3. Sanitizes user profile fields. | 60 req / admin / min |
| `GET /api/admin/payments/:id` | Authenticated Admin | `payments.read` | Specific payment request & verification history | 1. Loads verification audit logs.<br>2. Generates time-bounded signed URL (15 min) for receipt viewing. | 30 req / admin / min |
| `POST /api/admin/payments/:id/verify` | Authenticated Admin | `payments.verify` | Specific payment request | 1. State must be `under_review` or `temporary_access`.<br>2. Executes atomic `transition_payment_state` to `paid`.<br>3. Activates/extends subscription.<br>4. Grants monthly AI credits.<br>5. Emits `admin_audit_log` entry. | 10 req / admin / min (Fixed) |
| `POST /api/admin/payments/:id/reject` | Authenticated Admin | `payments.verify` | Specific payment request | 1. State must be `under_review` or `temporary_access`.<br>2. Requires mandatory rejection reason code.<br>3. Revokes temporary access immediately.<br>4. Sends notification.<br>5. Emits `admin_audit_log` entry. | 10 req / admin / min (Fixed) |
| `POST /api/admin/payments/:id/refund` | Authenticated Admin | `payments.refund` | Confirmed paid transaction | 1. State must be `paid`.<br>2. Must be initiated within 14 days of confirmation.<br>3. Revokes subscription.<br>4. Deducts unused monthly credits.<br>5. Emits `admin_audit_log` entry. | 5 req / admin / min (Fixed) |
| `GET /api/admin/coupons` | Authenticated Admin | `coupons.manage` | All coupon definitions | Full listing with redemption counts and status. | 30 req / admin / min |
| `POST /api/admin/coupons` | Authenticated Admin | `coupons.manage` | New coupon definition | 1. Unique code constraint.<br>2. Valid date range (`valid_until > valid_from`).<br>3. Discount value validation (percentage 1–100 or fixed piasters > 0). | 10 req / admin / min |
| `PATCH /api/admin/coupons/:id` | Authenticated Admin | `coupons.manage` | Specific coupon | Permits deactivation or expiration extension. | 10 req / admin / min |
| `GET /api/admin/subscriptions` | Authenticated Admin | `payments.read` | Platform subscription roster | Paged, filterable by tier and status. | 30 req / admin / min |

---

## 4. Threat Modeling & Attack Surface Mitigations

### 4.1 Threat 1: Privilege Escalation & Tier Spoofing

#### Attack Vector A: Client Claims Elevated Subscription Tier in Request Headers/Payload
- **Scenario**: An attacker sends `{ "plan": "career_plus" }` or headers like `X-User-Tier: career_plus` when requesting premium AI features (e.g., unlimited ATS optimization or Gemini 1.5 Pro analysis).
- **Mitigation (Server Authoritative)**:
  - The server **NEVER** trusts plan tier or feature flags provided in client payloads.
  - The middleware extracts the verified `auth.uid()` from the validated JWT.
  - The server executes an authoritative database query against `public.subscriptions`:
    ```typescript
    const activeSub = await getActiveSubscription(req.authUser.id);
    const effectiveTier = (activeSub && activeSub.status === 'active') ? activeSub.plan_code : 'free';
    ```
  - If the operation requires a higher tier than `effectiveTier`, the server immediately responds with `403 Forbidden` (`INSUFFICIENT_PLAN_TIER`).

#### Attack Vector B: Client Claims Administrative Role
- **Scenario**: An attacker alters client local storage or injects an `admin: true` property into requests to access `/api/admin/*`.
- **Mitigation (Zero-Trust RBAC)**:
  - Every administrative route executes [`requireAdmin`](file:///d:/Saas/careerpilot-ai/server/admin/permissions.ts#L32-L51) and [`requirePermission`](file:///d:/Saas/careerpilot-ai/server/admin/permissions.ts#L54-L64).
  - The server retrieves the administrator row from `public.admin_users` keyed strictly to `profile_id = req.authUser.id`.
  - If no active admin record exists, the server returns `403 Forbidden` (`Administrator access required`). The response is indistinguishable from a nonexistent admin user to prevent enumeration.

#### Attack Vector C: Self-Escalation to Admin Role
- **Scenario**: An attacker attempts to execute an SQL `UPDATE public.admin_users SET role = 'super_admin'`.
- **Mitigation**:
  - `public.admin_users` has RLS enabled with a single policy: `admin_users_select_self` (`auth.uid() = profile_id`).
  - All direct client `INSERT`, `UPDATE`, and `DELETE` grants are revoked (`REVOKE ALL ON public.admin_users FROM anon, authenticated`).
  - Mutations are restricted to server-side procedures that enforce the `admin.manage` permission and the Last Super Admin invariant.

---

### 4.2 Threat 2: Payment Fraud & Manipulation

#### Attack Vector A: Forged or Recycled Receipt Images
- **Scenario**: A user submits a Photoshop-altered receipt, a receipt from Google Images, or a receipt used by another user for an earlier transaction.
- **Mitigation (Cryptographic Hashing + Perceptual Hashing + Non-Automated Confirmation)**:
  - **SHA-256 Binary Hash**: Upon receipt upload, the server computes the cryptographic SHA-256 hash of the binary file and checks `public.payment_requests(receipt_sha256)`. If a collision is found, the submission is rejected immediately (`DUPLICATE_RECEIPT_DETECTED`).
  - **Perceptual Image Hash (pHash)**: The server computes a 64-bit DCT perceptual hash. Receipts within a Hamming distance $\le 3$ are flagged as potential duplicates (crop/re-encode attacks).
  - **OCR is Evidence, NOT Final Authority**: Automated receipt OCR extracts the transfer amount, sender number, and transaction ID solely to assist triage and calculate risk scores. OCR **NEVER** automatically transitions a payment to `paid`. Confirmation requires either:
    1. An authorized human administrator validating against the real Vodafone Cash / InstaPay account.
    2. A verified SMS gateway reconciliation service.

#### Attack Vector B: Reused Transaction Reference IDs
- **Scenario**: A user submits a valid transaction ID (e.g., InstaPay RRN `431289012345`) that was already claimed in a previous request.
- **Mitigation (Database-Enforced Uniqueness)**:
  - A unique partial index enforces global uniqueness across active and confirmed payments:
    ```sql
    CREATE UNIQUE INDEX idx_payment_requests_unique_tx_ref 
      ON public.payment_requests (transaction_reference)
      WHERE status IN ('under_review', 'temporary_access', 'paid');
    ```
  - Attempting to resubmit an in-flight or approved transaction reference fails immediately at the database level with a `23505 unique_violation`.

#### Attack Vector C: Amount Manipulation via Parameter Tampering
- **Scenario**: A malicious client alters the checkout payload from 150.00 EGP (`15000` piasters) to 1.00 EGP (`100` piasters) before submitting.
- **Mitigation (Authoritative Server Pricing Engine)**:
  - The client provides only `plan_id` and optional `coupon_code`.
  - The server queries `public.subscription_plans` directly to retrieve `price_monthly_piasters` or `price_annual_piasters`.
  - The server calculates any valid coupon discount and writes the immutable `amount_piasters` to `public.payment_requests`.
  - The expected amount is stored on the server. During verification, if the OCR-extracted amount or admin-inspected receipt does not match `amount_piasters`, the verification fails.

#### Attack Vector D: Concurrency Race Condition on Confirmation
- **Scenario**: Two administrators (or an automated worker and an admin) simultaneously confirm the same payment request, resulting in double credit grants or duplicate subscription periods.
- **Mitigation (Pessimistic Row Locking & Atomic State Transition Function)**:
  - All state transitions execute within the stored procedure `transition_payment_state()` using `SELECT ... FOR UPDATE`:
    ```sql
    SELECT * INTO v_payment 
    FROM public.payment_requests 
    WHERE id = p_payment_request_id 
    FOR UPDATE;
    ```
  - The function asserts that `v_payment.status IN ('under_review', 'temporary_access')`. The first caller transitions the row to `paid`; the second caller encounters `INVALID_STATE_TRANSITION` and aborts cleanly.

---

### 4.3 Threat 3: AI Credit Manipulation & Exploitation

#### Attack Vector A: Client Fabricates AI Credits
- **Scenario**: An attacker attempts to inject AI credits by modifying client-side profile data or dispatching synthetic credit updates.
- **Mitigation**:
  - The `public.ai_credit_ledger` table permits `SELECT` only to `authenticated` users for their own rows.
  - `INSERT`, `UPDATE`, and `DELETE` privileges are strictly revoked from `anon` and `authenticated`.
  - Credit operations must pass through server-side functions using the service-role client.

#### Attack Vector B: Double-Spending AI Credits
- **Scenario**: A user fires 10 concurrent requests to an expensive AI endpoint (e.g., CV Tailoring, costing 5 credits) with an available balance of only 5 credits.
- **Mitigation (Two-Phase Reservation Pattern + Transaction Advisory Locks)**:
  ```
  [Client Request] ──> [Acquire pg_advisory_xact_lock(user_id)]
                              │
                              ▼
                      [Balance >= Cost?]
                       ├── NO ──> Return 402 Insufficient Credits
                       │
                       └── YES ─> [Insert Pending Reservation]
                                       │
                                       ▼
                              [Execute Gemini AI Call]
                               ├── SUCCESS ──> [Commit Ledger Deduction]
                               └── FAILURE ──> [Release Reservation]
  ```
  - Concurrency is serialized per user via `pg_advisory_xact_lock(hashtext(profile_id::text))`.
  - The ledger guarantees that pending reservations reduce the effective available balance:
    $$\text{Available Balance} = \text{Running Balance} - \sum \text{Pending Reservations}$$

#### Attack Vector C: Negative Balance Exploitation
- **Scenario**: An attacker attempts to force their credit balance below zero through race conditions or edge cases.
- **Mitigation (Database Check Constraint)**:
  - The `public.ai_credit_ledger` table enforces:
    ```sql
    CONSTRAINT ai_credit_ledger_balance_non_negative CHECK (running_balance >= 0)
    ```
  - Any transaction that would result in a negative `running_balance` fails at the database engine level, causing the outer transaction to roll back.

---

### 4.4 Threat 4: Data Exposure & Confidentiality Breaches

#### Attack Vector A: Unauthorized Viewing of Financial Receipts
- **Scenario**: An attacker guesses or enumerates receipt image URLs to view financial transfer details, bank account numbers, or personal phone numbers belonging to other users.
- **Mitigation (Private Storage Bucket + Signed URLs)**:
  - The `payment-receipts` bucket is private (`public = false`).
  - Storage RLS permits users to read only files within their own folder segment:
    ```sql
    public.storage_object_owner(name) = auth.uid()::text
    ```
  - Administrators cannot view receipts via direct public URLs. The server generates a short-lived Supabase Signed URL (expiry: 900 seconds / 15 minutes) only after validating that the admin holds the `payments.read` permission.
  - Viewing a receipt is recorded in `public.admin_audit_log` (`payment.receipt_viewed`).

#### Attack Vector B: Sensitive Data Leakage in Server Logs
- **Scenario**: Vodafone Cash mobile numbers, InstaPay Instant Payment Addresses (IPAs), or national bank account numbers appear in cleartext in server logs.
- **Mitigation (PII Redaction)**:
  - Phone numbers are masked in logs and client DTOs: `010****5678`.
  - InstaPay IPAs are masked: `u****@instapay`.
  - Transaction reference IDs keep only the first 3 and last 4 characters: `431****2345`.
  - Raw binary image data or base64 streams are strictly excluded from logging.

---

## 5. Service-Role Key Protection & Cloudflare Architecture

The Supabase `SUPABASE_SERVICE_ROLE_KEY` possesses root-level administrative access to the PostgreSQL database, bypassing all Row Level Security policies. Compromise of this key represents a total system compromise.

### 5.1 Defense-in-Depth Isolation Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ENVIRONMENT ISOLATION BOUNDARY                     │
├──────────────────────────────────────┬──────────────────────────────────────┤
│        PUBLIC / BROWSER REALM        │       SECURE / SERVER-EDGE REALM     │
│       (Compromise Risk: High)        │      (Zero Client Surface Area)      │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Vite Client Bundle (dist/)         │ • Express Server (Node.js)           │
│ • VITE_SUPABASE_URL                  │ • Cloudflare Pages Worker            │
│ • VITE_SUPABASE_PUBLISHABLE_KEY      │ • Cloudflare Jobs Worker             │
│ • Public wrangler.jsonc "vars"       │ • SUPABASE_SERVICE_ROLE_KEY          │
│                                      │ • GEMINI_API_KEY                     │
│ ❌ NEVER SERVICE-ROLE KEY            │ 🔒 Managed via wrangler secret put   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 5.2 Secret Protection Rules
1. **No Frontend Prefixing**: The service-role key must **NEVER** be assigned to any variable prefixed with `VITE_`. Any variable starting with `VITE_` is automatically inlined into the client-side JavaScript bundle during `npm run build`.
2. **Exclusion from `wrangler.jsonc` `vars`**: The public Pages configuration ([`wrangler.jsonc`](file:///d:/Saas/careerpilot-ai/wrangler.jsonc#L56-L61)) contains public environment variables only. The `SUPABASE_SERVICE_ROLE_KEY` must **NEVER** appear in `vars`. Any variable placed in `vars` is committed to git and exposed in Cloudflare build artifacts.
3. **Cloudflare Pages Secret Management**:
   - Production secrets are provisioned directly to Cloudflare via the encrypted secret store:
     ```bash
     npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name careerdev4ai
     ```
   - Cloudflare Pages injects these secrets into the runtime environment at edge execution time.
4. **Cloudflare Background Jobs Worker**:
   - The queue consumer ([`worker/jobs/wrangler.jsonc`](file:///d:/Saas/careerpilot-ai/worker/jobs/wrangler.jsonc)) runs as an isolated Worker. Secrets are provisioned separately:
     ```bash
     npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config worker/jobs/wrangler.jsonc
     ```
5. **Git Pre-Commit Hook Enforcement**: A local pre-commit hook scans staged files for regex patterns matching Supabase service-role JWTs (`eyJh...service_role...`) and rejects the commit if detected.

---

## 6. File Upload Security for Receipt Images

Receipt screenshots constitute external untrusted binary input. They must be validated, sanitized, and stored with maximum isolation to protect against Remote Code Execution (RCE), Cross-Site Scripting (XSS), and storage exhaustion attacks.

### 6.1 Storage Bucket Configuration

The `payment-receipts` bucket is provisioned with private access and strict limits:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false, -- Strictly private
  5242880, -- 5 MB (5 * 1024 * 1024 bytes)
  ARRAY[
    'image/jpeg',
    'image/png'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png'];
```

### 6.2 Path Convention & Storage RLS Policies

All uploads must follow an immutable path convention:
```
payment-receipts/{profile_id}/{payment_request_id}/{filename}
```

```sql
-- Authenticated users can upload receipts ONLY to their own directory
DROP POLICY IF EXISTS "payment_receipts_insert_own" ON storage.objects;
CREATE POLICY "payment_receipts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- Authenticated users can view ONLY their own receipts
DROP POLICY IF EXISTS "payment_receipts_select_own" ON storage.objects;
CREATE POLICY "payment_receipts_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- Receipts are immutable: client UPDATE and DELETE are completely blocked
DROP POLICY IF EXISTS "payment_receipts_update_deny" ON storage.objects;
DROP POLICY IF EXISTS "payment_receipts_delete_deny" ON storage.objects;
-- (No policies created for UPDATE or DELETE; operations fail closed)
```

### 6.3 Server-Side Binary Validation & Magic Byte Inspection

Client-provided MIME headers are untrusted. The server-side upload handler must verify the true file signature (magic bytes) before persisting to storage:

```typescript
export function validateReceiptBuffer(buffer: Buffer): { valid: boolean; mimeType?: string; error?: string } {
  // Check maximum file size (5MB)
  if (buffer.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'File size exceeds 5MB limit' };
  }
  
  // Inspect magic bytes
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, mimeType: 'image/jpeg' };
  }
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return { valid: true, mimeType: 'image/png' };
  }
  
  return { valid: false, error: 'Invalid file signature. Only authentic JPEG and PNG images are permitted.' };
}
```

### 6.4 Sanitization & SVG/Polyglot Rejection
- **SVG Strictly Prohibited**: SVG files can embed JavaScript payloads (`<script>`, `onload=...`) leading to Stored XSS when rendered in admin browsers. SVG is omitted from `allowed_mime_types`.
- **EXIF Stripping**: Image metadata (GPS coordinates, camera serial numbers, personal device metadata) is automatically stripped prior to permanent storage using an image transform pipeline to protect candidate privacy.
- **Content-Disposition**: When serving images via signed URLs, the server forces the header `Content-Disposition: attachment; filename="receipt.png"` or `Content-Security-Policy: default-src 'none'` to prevent browser HTML interpretation of polyglot files.

---

## 7. Rate Limiting Strategy

Rate limiting prevents denial-of-service (DoS) attacks, brute-force coupon enumeration, payment submission spam, and credit-scraping abuse. Limits are enforced at the Cloudflare Edge Worker before database execution.

### 7.1 Tiered Rate Limit Profiles

| Endpoint Category | Scope | Limit | Window | Window Type | Key Identifier | Action on Breach (HTTP 429) |
|---|---|---|---|---|---|---|
| **Payment Submission** (`POST /checkout`) | Authenticated User | 3 requests | 1 hour | Sliding Window | `rl:checkout:{profile_id}` | Block checkout; return `PAYMENT_SUBMISSION_RATE_LIMIT`. |
| **Receipt Upload** (`POST /receipt`) | Authenticated User | 5 requests | 1 hour | Sliding Window | `rl:receipt:{profile_id}` | Block upload; protect storage quotas. |
| **Credit Balance Check** (`GET /credits`) | Authenticated User | 60 requests | 1 minute | Fixed Window | `rl:credits:{profile_id}` | Throttled; client must rely on local state. |
| **Plan Catalog Listing** (`GET /plans`) | Public IP | 30 requests | 1 minute | Fixed Window | `rl:plans:{client_ip}` | Throttled; CDN cache response served. |
| **Coupon Validation** (`POST /coupons/validate`) | Authenticated User | 5 requests | 1 minute | Fixed Window | `rl:coupon:{profile_id}` | Block validation; mitigates dictionary attacks. |
| **Admin Payment Confirm** (`POST /verify`) | Admin Profile | 10 requests | 1 minute | Fixed Window | `rl:admin_verify:{admin_id}` | Guard against compromised admin token spam. |
| **Birthday Reward Claim** (`POST /birthday-reward`) | Authenticated User | 3 requests | 24 hours | Fixed Window | `rl:bday:{profile_id}` | Prevents rapid consent flip/re-claim attempts. |

### 7.2 Edge Worker Rate Limiter Implementation Architecture

```typescript
// Edge rate-limiting helper executed in Cloudflare Pages Worker (worker/index.ts)
interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export async function checkRateLimit(
  env: { RATE_LIMIT_KV?: KVNamespace },
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  
  // In environments without KV (e.g. local tests), use in-memory bounded LRU cache
  if (!env.RATE_LIMIT_KV) {
    return memoryRateLimiter.check(key, config, now);
  }

  const record = await env.RATE_LIMIT_KV.get<{ count: number; resetTime: number }>(key, 'json');
  
  if (!record || now > record.resetTime) {
    const resetTime = now + config.windowMs;
    await env.RATE_LIMIT_KV.put(
      key, 
      JSON.stringify({ count: 1, resetTime }), 
      { expirationTtl: Math.ceil(config.windowMs / 1000) }
    );
    return { allowed: true, remaining: config.limit - 1, resetTime };
  }

  if (record.count >= config.limit) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count += 1;
  await env.RATE_LIMIT_KV.put(
    key, 
    JSON.stringify(record), 
    { expirationTtl: Math.ceil((record.resetTime - now) / 1000) }
  );

  return { allowed: true, remaining: config.limit - record.count, resetTime: record.resetTime };
}
```

When rate limits are exceeded, endpoints return:
```json
{
  "error": "Too many requests. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfterSeconds": 42
}
```
with headers:
- `Retry-After: 42`
- `X-RateLimit-Limit: 5`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: 1792359000`

---

## 8. Audit Logging & Security Event Requirements

Audit logs are legally required financial and security records. They must be immutable, tamper-evident, and comprehensively tracked.

### 8.1 Audit Destinations & Taxonomies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SYSTEM AUDIT TRAIL ARCHITECTURE                       │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│    admin_audit_log       │   subscription_events    │   ai_credit_ledger    │
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│ • Human Administrator    │ • Complete subscription  │ • Complete financial  │
│   interventions          │   lifecycle state stream │   credit ledger       │
│ • payment.verified       │ • created                │ • monthly_grant       │
│ • payment.rejected       │ • upgraded               │ • manual_adjustment   │
│ • payment.refunded       │ • downgraded             │ • ai_deduction        │
│ • coupon.created         │ • expired                │ • refund              │
│ • plan.updated           │ • cancelled              │ • expired             │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

#### 1. Administrative Audit Trail (`public.admin_audit_log`)
Every administrative action must be recorded via [`logAdminAction()`](file:///d:/Saas/careerpilot-ai/server/db/admin.ts#L1386-L1401):
- `payment.verified`: Admin ID, payment request ID, amount, method, granted tier.
- `payment.rejected`: Admin ID, payment request ID, rejection reason code, evidence flags.
- `payment.refunded`: Admin ID, payment request ID, refund transaction reference.
- `payment.receipt_viewed`: Admin ID, payment request ID, timestamp (tracks receipt data access).
- `coupon.created` / `coupon.updated`: Admin ID, coupon code, discount parameters.
- `subscription.override`: Admin ID, user profile ID, manual status override justification.

#### 2. Subscription Lifecycle Stream (`public.subscription_events`)
Records every automated or manual state change:
- `subscription_id`, `profile_id`, `event_type`, `actor_type` (`'user'`, `'admin'`, `'system'`, `'worker'`), `actor_id`.
- `state_before` and `state_after` (full JSON snapshots).
- Automatically emitted by PostgreSQL triggers on `public.subscriptions` mutations.

#### 3. AI Credit Double-Entry Ledger (`public.ai_credit_ledger`)
Records every token spend, reservation, refund, and subscription allocation:
- Immutable append-only entries with `running_balance`, `operation` (`'credit'`, `'debit'`), `source_type` (`'subscription'`, `'purchase'`, `'birthday'`, `'feature_spend'`, `'admin_adjustment'`), and `idempotency_key`.

### 8.2 Security Anomaly Detection Rules

The following patterns trigger automated alerts in the background worker:
1. **Receipt Hash Collisions**: Multiple accounts attempting to upload the same receipt image SHA-256 within 30 days triggers an instant `FRAUD_RING_SUSPECTED` alert, locking both payment requests into `under_review` (High Risk).
2. **Velocity Spikes**: A single user submitting $\ge 3$ payment requests across different mobile numbers within 2 hours.
3. **Coupon Dictionary Probing**: An IP or profile triggering 5 consecutive invalid coupon attempts within 1 minute results in an automatic 1-hour IP/user ban on coupon validation endpoints.

---

## 9. Data Privacy & MENA / Egyptian Compliance

CareerDev4AI operates primarily in Egypt and the MENA region. The data architecture complies with Egyptian Personal Data Protection Law (Law No. 151 of 2020) and international GDPR principles.

### 9.1 Birthday Data Minimization Architecture

#### The Problem
Full dates of birth (DD/MM/YYYY) allow exact age calculation. In professional recruitment platforms, this creates severe risks of age-based discrimination, bias in resume parsing, and potential identity theft if intercepted.

#### The Solution (Day & Month Only)
For the Birthday Reward program (a celebratory discount on Pro subscriptions):
1. **Zero Year Storage**: The database schema strictly prohibits storing birth years:
   ```sql
   ALTER TABLE public.birthday_rewards
     ADD COLUMN birth_month smallint NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
     ADD COLUMN birth_day smallint NOT NULL CHECK (birth_day BETWEEN 1 AND 31);
   ```
2. **Explicit Consent Gate**: Birthday data cannot be submitted during registration. It requires an affirmative, opt-in consent record in `public.user_privacy_consents` with `consent_purpose = 'birthday_reward'`.
3. **Right to Erasure (One-Click Revocation)**: Candidates can revoke birthday consent at any time via `DELETE /api/subscription/birthday-reward`. The deletion cascades to `public.birthday_rewards`, purging the birth day and month completely.

---

### 9.2 Financial Record Retention & Purging Lifecycle

#### Accounting & Tax Retention Requirements
Under Egyptian commercial practice and Egyptian Tax Authority audit requirements, records of completed financial transactions must be retained for **5 years**.
- `public.payment_requests` and `public.ai_credit_ledger` rows for completed payments (`status = 'paid'`) are retained for 5 years.
- If a candidate exercises their Right to Erasure (`deleteAccount` in [`server/db/account.ts`](file:///d:/Saas/careerpilot-ai/server/db/account.ts#L99-L120)):
  - The profile identity is anonymized in financial records:
    - `profile_id` is disassociated or assigned to an anonymized ledger tombstone.
    - Candidate name, email, phone numbers, and sender IPAs are permanently scrubbed: `full_name = 'Anonymized User'`, `sender_number = NULL`.
  - Transaction reference, piaster amount, and confirmation timestamps are preserved to maintain ledger balance integrity without identifying the natural person.

#### Receipt Screenshot Retention Policy
Receipt images contain sensitive personal data (bank account balances, personal phone numbers, device battery levels).
- **Active Receipts**: Retained during review and active subscription duration.
- **Automated Purging**: A durable Cloudflare Queues cron job purges physical receipt images from the `payment-receipts` bucket **90 days** after payment confirmation.
- **Immediate Account Deletion Cascade**: When an account is deleted via [`server/db/account.ts`](file:///d:/Saas/careerpilot-ai/server/db/account.ts#L99-L120), the candidate's receipt folder in `payment-receipts` is purged immediately alongside `cv-files`.

---

## 10. Secrets Inventory

The following table documents every secret required by the Subscription, Payment, and Credit architecture:

| Secret Environment Variable | Target Location | Sensitivity Level | Status / Availability | Purpose & Scope | Recommended Rotation Schedule |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Pages Secret / Worker Secret | **Critical** | **Available** (in `.env`) | Bypasses RLS for trusted server operations, state transitions, and ledger writes. | 180 days (or immediately upon suspected breach) |
| `SUPABASE_ANON_KEY` | Pages Vars (`wrangler.jsonc`) | Public / Low | **Available** | Public client-side Supabase authentication and RLS-governed queries. | Annual |
| `GEMINI_API_KEY` | Pages Secret / Worker Secret | **High** | **Available** (in `.env`) | Powers Gemini reasoning, ATS analysis, CV tailoring, and OCR assist. | 90 days |
| `VODAFONE_CASH_MERCHANT_SECRET` | Pages Secret | **Critical** | **To Be Obtained** (Future) | API secret for automated Vodafone Cash merchant webhook callbacks (when enterprise gateway secured). | 90 days |
| `INSTAPAY_EBC_GATEWAY_KEY` | Pages Secret | **Critical** | **To Be Obtained** (Future) | Merchant digital certificate for EBC InstaPay direct clearing (when enterprise gateway secured). | Annual |
| `RECEIPT_OCR_SERVICE_KEY` | Pages Secret / Worker Secret | **Medium** | **To Be Obtained** (Or Gemini) | Dedicated vision OCR service key (fallback if not using primary Gemini 1.5 Flash). | 180 days |
| `PAYMENT_HMAC_SIGNING_KEY` | Pages Secret / Worker Secret | **High** | **To Be Generated** | Internal HMAC key for generating tamper-evident idempotency tokens and receipt hashes. | 90 days |

---

## 11. Super Admin Bootstrap Process

### 11.1 Discrepancy Analysis

In migration [`20261102000006_admin_communication.sql`](file:///d:/Saas/careerpilot-ai/supabase/migrations/20261102000006_admin_communication.sql#L149-L164), the initial Super Admin bootstrap was executed with the following statement:

```sql
INSERT INTO public.admin_users (profile_id, email, full_name, role, status)
SELECT
  p.id,
  u.email,
  coalesce(p.full_name, split_part(u.email, '@', 1)),
  'super_admin',
  'active'
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower('ahdabdalla77@gmail.com')
ON CONFLICT (profile_id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = 'super_admin',
  status = 'active',
  updated_at = now();
```

**Critical Discrepancy**: The product requirements state that **`ahmedghannam801@gmail.com`** is the authorized platform owner and Super Admin.

### 11.2 Secure Bootstrap Procedure

To grant `ahmedghannam801@gmail.com` Super Admin status safely without violating the Last Super Admin invariant or breaking existing environments:

1. **Prerequisite**: The target account `ahmedghannam801@gmail.com` must register via Supabase Auth (or be provisioned via the Supabase Admin API).
2. **Identity Resolution**: The user's UUID is resolved from `auth.users` and verified in `public.profiles`.
3. **Idempotent Migration Script**: The migration assigns the `super_admin` role with an empty permissions array (inheriting all permissions). It uses `ON CONFLICT (profile_id) DO UPDATE` to guarantee safe re-execution.
4. **Audit Trail Logging**: The grant action is recorded in `public.admin_audit_log`.

### 11.3 Migration DDL (`20261107000001_bootstrap_primary_super_admin.sql`)

```sql
-- Migration: 20261107000001_bootstrap_primary_super_admin.sql
-- Description: Bootstraps ahmedghannam801@gmail.com as primary Super Admin.
--
-- Defense-in-depth:
-- 1. Verifies that the user exists in auth.users and public.profiles.
-- 2. Inserts or updates the row in public.admin_users with role 'super_admin'.
-- 3. Does not remove ahdabdalla77@gmail.com (protects against last-super-admin lockout).
-- 4. Records the bootstrap event in public.admin_audit_log.

DO $$
DECLARE
  v_profile_id uuid;
  v_email text := 'ahmedghannam801@gmail.com';
  v_admin_id uuid;
BEGIN
  -- 1. Resolve profile_id from auth.users joined with public.profiles
  SELECT p.id INTO v_profile_id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'Target Super Admin user % does not exist in auth.users/profiles yet. Bootstrap deferred until user registers.', v_email;
    RETURN;
  END IF;

  -- 2. Upsert the admin_users record
  INSERT INTO public.admin_users (
    profile_id,
    email,
    full_name,
    role,
    status,
    permissions
  )
  VALUES (
    v_profile_id,
    lower(v_email),
    'Ahmed Ghannam',
    'super_admin',
    'active',
    '{}'::text[] -- Empty array inherits all permissions for super_admin
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    role = 'super_admin',
    status = 'active',
    updated_at = now()
  RETURNING id INTO v_admin_id;

  -- 3. Record in admin_audit_log for audit accountability
  INSERT INTO public.admin_audit_log (
    admin_id,
    admin_email,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_admin_id,
    lower(v_email),
    'admin.bootstrapped',
    'admin_user',
    v_admin_id::text,
    jsonb_build_object(
      'reason', 'Primary platform owner bootstrap via migration 20261107000001',
      'assigned_role', 'super_admin',
      'profile_id', v_profile_id
    )
  );

  RAISE NOTICE 'Successfully bootstrapped % (profile_id: %) as Super Admin.', v_email, v_profile_id;
END $$;
```

---

## 12. Implementation Readiness Checklist

Before applying migrations or deploying subscription endpoints, the senior engineering agent must verify:

- [ ] All 9 subscription tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` executed.
- [ ] Explicit `REVOKE ALL ON ... FROM anon;` executed for all 9 tables.
- [ ] `REVOKE INSERT, UPDATE, DELETE ON ... FROM authenticated;` executed on `subscriptions`, `payment_verifications`, `ai_credit_ledger`, `coupon_definitions`, and `subscription_events`.
- [ ] Storage bucket `payment-receipts` created with `public = false` and 5MB limit.
- [ ] Magic byte validator integrated in Express/Worker receipt upload router.
- [ ] Admin permissions extended with `payments.read`, `payments.verify`, `payments.refund`, `coupons.manage`, `plans.manage`, and `credits.manage` in [`shared/admin.ts`](file:///d:/Saas/careerpilot-ai/shared/admin.ts).
- [ ] Edge rate limiting active on `/api/subscription/*` endpoints.
- [ ] Migration `20261107000001_bootstrap_primary_super_admin.sql` queued and applied.
- [ ] Automated integration test proving an `authenticated` client cannot directly insert or update `subscriptions` or `ai_credit_ledger`.
- [ ] Account deletion routine ([`server/db/account.ts`](file:///d:/Saas/careerpilot-ai/server/db/account.ts)) updated to purge `payment-receipts` bucket.
