# CareerDev4AI — Open Decisions, Risks, and Unresolved Blockers

> **Document Version:** 1.0.0  
> **Date:** 2026-11-06  
> **Status:** Active / Pre-Implementation Alignment  
> **Author:** Architecture and Engineering Planning Group

---

## 1. Executive Summary of Unresolved Decisions

The technical audit and target architecture for CareerDev4AI have established a robust, backend-enforced, Supabase-backed subscription, payment, and AI credit model. However, several operational, legal, and third-party API dependencies require explicit stakeholder decisions before production execution.

This document catalogues these open decisions, categorizes their risk, identifies the recommended architectural path, and outlines any technical workarounds that preserve platform integrity while awaiting resolution.

---

## 2. Critical Blockers & Open Decisions

### Blocker 01: Super Admin Identity Discrepancy
- **Verified Codebase Fact:** Migration `supabase/migrations/20261102000006_admin_communication.sql` bootstraps `ahdabdalla77@gmail.com` as the initial `super_admin`.
- **User Requirement:** Prompt specifies `ahmedghannam801@gmail.com` as the designated owner and Super Admin.
- **Risk:** High. Applying a migration that alters or demotes existing admin accounts without explicit confirmation could lock out an active platform operator or fail if `ahmedghannam801@gmail.com` has not yet registered an Auth account in Supabase.
- **Architectural Decision:** 
  1. Additive bootstrap migration: Query `auth.users` for `ahmedghannam801@gmail.com`. If present, insert/update in `public.admin_users` with role `super_admin` and status `active`.
  2. Do NOT delete or demote `ahdabdalla77@gmail.com` unless explicitly requested by the platform owner.
  3. If `ahmedghannam801@gmail.com` is not yet registered in Supabase Auth, the migration will safely do nothing via conditional query (`INSERT ... SELECT ... WHERE lower(email) = ...`), and provide an idempotent CLI bootstrap script for when the account registers.

---

### Blocker 02: Egyptian Manual Payment Rails & Receipt Verification
- **Verified Codebase Fact:** Neither Vodafone Cash nor InstaPay exposes an official public REST webhook or callback API for personal wallet/account transfers.
- **Approved Policy:** 
  - Hybrid model: User submits transfer reference, phone/account, and receipt image.
  - Automated pre-checks (duplicate reference detection, binary image hashing, basic OCR parsing if available) generate a risk score.
  - Low-risk submissions receive 24-hour temporary access.
  - Full subscription activation requires human financial confirmation by an authorized administrator verifying real money arrival.
- **Open Decision:** 
  - *Receipt OCR Engine:* Should the platform use an external OCR service (e.g., Google Cloud Vision, Tesseract, or Gemini Vision) to parse receipt screenshots, or rely strictly on human admin review in the Admin Control Center?
  - *Recommendation:* In Phase 1-4, implement automated binary hashing (SHA-256) and perceptual hashing to prevent duplicate receipt reuse, along with strict regex validation on Vodafone Cash / InstaPay transaction references. If Gemini Vision is enabled via existing `@google/genai` credentials, extract text opportunistically; if unavailable or unparseable, route directly to `under_review` queue without blocking the user.

---

### Blocker 03: Gemini Free-Tier Daily Quota vs. Commercial Subscriptions
- **Verified Codebase Fact:**
  - `server/ai/quota.ts` enforces `AI_PROJECT_DAILY_LIMIT = 20` and `AI_DAILY_LIMIT = 15` reflecting the Google Gemini Free-Tier cap (20 requests/day per project).
  - OpenRouter is configured with `openrouter/free` as a fallback.
- **Commercial Offering:**
  - Free: 5 one-time trial credits.
  - Student: 25 monthly credits (99 EGP/mo).
  - Pro: 60 monthly credits (179 EGP/mo).
  - Career Plus: 120 monthly credits (299 EGP/mo).
- **Risk:** CRITICAL. A single Pro subscriber using 60 credits in a month (avg 2/day) combined with free trial users will immediately exhaust the 20 requests/day project-wide free ceiling.
- **Open Decision:** 
  - The project owner must provide a paid Google Gemini API key (Pay-as-you-go) before onboarding paying commercial subscribers.
  - *Workaround:* The AI Credit Ledger and Entitlement Engine are built to support pay-per-token/pay-per-request accounting. The server-side quota checks in `server/ai/quota.ts` will be updated to honor the user's active credit balance instead of the static 15-request in-memory bucket.

---

### Blocker 04: Temporary Access Feature Scope & Expensive AI Operations
- **Requirement:** 24-hour provisional access while payment is pending manual verification.
- **Risk:** A malicious user could submit a fake or edited receipt, claim temporary access, generate 5 targeted CVs and 3 mock interviews (costing significant AI tokens), and abandon the account before rejection.
- **Decision:**
  - Temporary access is restricted to:
    - Standard features: Job tracking, skill gap analysis, basic CV builder, roadmap browsing.
    - AI actions capped at operations costing $\le 2$ credits (e.g., JD Analysis, ATS Match, Cover Letter generation).
    - Expensive operations (> 2 credits: CV Full Tailoring, Deep Roadmap Generation, Multi-turn Interview Simulation) are locked with an explicit UI notice: *"Available upon payment verification confirmation"*.
    - Absolute temporary cap: Maximum 5 credits consumed during the 24-hour provisional window.

---

### Blocker 05: Cloudflare Pages Cron Execution Environment
- **Verified Codebase Fact:**
  - Cloudflare Pages Worker (`worker/index.ts`) handles API traffic and publishes to `careerdev4ai-jobs` queue.
  - Pages projects do NOT natively support `[triggers.crons]` in `wrangler.jsonc`.
  - The dedicated background worker (`worker/jobs/wrangler.jsonc`) DOES have `triggers = { crons = ["*/5 * * * *"] }`.
- **Decision:**
  - All scheduled subscription sweeps (`expire_temporary_access`, `expire_subscriptions`, `send_renewal_reminders`) will execute in the background jobs worker (`worker/jobs/`), which already holds scheduled cron execution rights and consumer queue bindings.
  - The database procedures (`expire_temporary_access()`, `expire_subscriptions()`) are exposed as atomic `SECURITY DEFINER` functions callable by this background worker or manually by a Super Admin.

---

### Blocker 06: Egyptian Personal Data Protection Law (Law No. 151 of 2020)
- **Birthday Rewards Policy:**
  - Requires collecting user birth date.
- **Compliance Rules:**
  1. Do NOT collect birth year. Only `birth_month` (1-12) and `birth_day` (1-31).
  2. Mandatory separate, unbundled consent checkbox stored in `user_privacy_consents`.
  3. Immediate support for consent revocation (`DELETE /api/birthday/consent`) which purges birth month/day data immediately.
  4. Birthday data is strictly confidential and never displayed on public profile cards or shared with other candidates.

---

## 3. Summary of Implementation Safeguards

| Subsystem | Verified Assumption | Safety Guard |
|---|---|---|
| **Subscriptions** | Free tier must never break | User defaults to Free plan if no active subscription row exists |
| **Payments** | No automatic bank webhooks | Two-man rule or signed admin confirmation for status `paid` |
| **Credits** | Floating-point rounding errors | All credit balances and piasters stored as integers |
| **Receipt Storage** | Unauthenticated file access | Private Supabase Storage bucket `payment-receipts` under RLS |
| **Concurrency** | Double-spending credits | `SELECT ... FOR UPDATE` row locks in atomic stored procedures |
| **Migrations** | Accidental table drops | Strictly additive migrations; no destructive DDL |

