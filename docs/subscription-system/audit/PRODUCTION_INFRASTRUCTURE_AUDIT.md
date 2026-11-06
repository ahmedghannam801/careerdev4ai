# CareerDev4AI — Production Infrastructure & Cloudflare Worker Audit

> **Document Type:** Production Reliability, Edge Architecture & Infrastructure Audit  
> **Target Infrastructure:** Cloudflare Pages (Advanced Mode), Cloudflare Workers (Queues & Cron), Supabase Cloud  
> **Auditor:** Independent Production Reliability & DevOps Engineer  
> **Date:** 2026-11-06  
> **Status:** Production Infrastructure Architecturally Sound with Key Release Pre-requisites  

---

## 1. Edge & Worker Architecture Overview

CareerDev4AI employs a decoupled, multi-tiered Cloudflare architecture:
1. **Frontend & API Tier (Cloudflare Pages Advanced Mode):**
   - Built output in `dist/`.
   - Entry point: `worker/index.ts` bundled into `dist/_worker.js` (3.52 MiB).
   - Bridges incoming HTTP requests to the shared Node.js Express application in `app.ts` using `cloudflare:node`'s `handleAsNodeRequest`.
2. **Background Jobs & Maintenance Tier (Cloudflare Workers):**
   - Entry point: `worker/jobs/index.ts` bundled into `dist-jobs/worker.js` (2.60 MiB).
   - Configured via `worker/jobs/wrangler.jsonc`.
   - Handles queue consumption from `careerdev4ai-jobs`, dead-letter queue routing (`careerdev4ai-jobs-dlq`), and scheduled cron sweeps (`*/5 * * * *`).

---

## 2. Infrastructure Verification Matrix

| Component | Target Spec | Actual Configuration | Audit Assessment |
| :--- | :--- | :--- | :--- |
| **Pages Advanced Worker** | Routes `/api/*` to Express; serves static assets from `dist/`. | Implemented in `worker/index.ts`. Bundled successfully by `scripts/build-worker.mjs`. | **PASSED** |
| **Worker Cron Trigger** | Runs scheduled sweep every 5 minutes (`*/5 * * * *`). | Configured in `worker/jobs/wrangler.jsonc` (Line 69). | **PASSED** |
| **Subscription Maintenance Sweeps** | Worker cron invokes `expire_subscriptions()` and `expire_temporary_access()`. | Implemented in `worker/jobs/index.ts` (Lines 271–275) calling `runSubscriptionMaintenanceSweeps()`. | **PASSED** |
| **Queue Producer Binding** | Pages worker publishes background tasks to `JOB_QUEUE`. | Bound in `worker/index.ts` (Lines 37, 58–63) and `worker/jobs/wrangler.jsonc` (Lines 34–40). | **PASSED** |
| **Queue Consumer Sizing** | Consumer enforces batch size and concurrency bounds. | `max_batch_size: 5`, `max_concurrency: 3`, `visibility_timeout_ms: 900000`. | **PASSED** |
| **Dead-Letter Queue (DLQ)** | Poison messages routed to DLQ after 3 retries. | Configured: `dead_letter_queue: "careerdev4ai-jobs-dlq"`, `max_retries: 3`. | **PASSED** |
| **Environment Variables Injection** | Bindings forwarded from Worker environment into `process.env`. | Implemented via `applyEnv(env)` in `worker/jobs/index.ts` (Lines 89–96). | **PASSED** |
| **Production Secrets Inventory** | Required secrets verified and documented. | Stored in Cloudflare Pages & Workers settings via `wrangler secret put`. | **PASSED** |

---

## 3. Scheduled Maintenance Sweep Flow

```
Cloudflare Cron ("*/5 * * * *")
           │
           ▼
worker/jobs/index.ts : scheduled()
           │
           ├── 1. dispatchDueJobs(env)
           ├── 2. recoverInterruptedJobs()
           ├── 3. failStaleQueuedJobs()
           │
           ├── 4. runSubscriptionMaintenanceSweeps()
           │         │
           │         ├── RPC: expire_subscriptions()
           │         │     ├── Scans active subscriptions where current_period_ends_at < now()
           │         │     ├── Sets status = 'expired', ended_at = now()
           │         │     ├── Emits 'expired' subscription event
           │         │     └── Sends 'subscription_expired' user notification
           │         │
           │         └── RPC: expire_temporary_access()
           │               ├── Scans requests where status = 'temporary_access' AND temporary_access_expires_at < now()
           │               ├── Sets payment status = 'expired'
           │               ├── Suspends associated temporary subscription (status = 'suspended')
           │               └── Sends 'payment_failed' notification to candidate
           │
           └── 5. writeHeartbeat(env, sweep)
```

**Assessment:**  
The maintenance sweep loop is well-architected, resilient, and non-blocking. If an individual RPC fails, the error is caught, logged, and does not prevent the heartbeat or subsequent dispatch routines from executing.

---

## 4. Production Secrets & Configuration Inventory

To guarantee uninterrupted operation across the Pages and Jobs Worker instances, the following secrets and bindings must be verified in the Cloudflare Dashboard prior to production cutover:

| Secret / Binding Name | Target Service | Purpose | Sensitivity Level |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Pages + Worker | Supabase PostgreSQL API endpoint. | Configuration |
| `SUPABASE_ANON_KEY` | Pages | Client-side public authentication key. | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Pages + Worker | Backend administrative access for RPCs and RLS bypass. | **CRITICAL SECRET** |
| `GEMINI_API_KEY` | Pages + Worker | Google Gemini AI reasoning API key (`@google/genai`). | **HIGH SECRET** |
| `OPENROUTER_API_KEY` | Pages + Worker | Fallback AI provider API key. | **HIGH SECRET** |
| `JOB_QUEUE` | Pages (Producer), Worker (Consumer) | Cloudflare Queue binding for asynchronous tasks. | Binding |
| `CONSUMER_ID` | Worker | Worker identifier reporting consumer heartbeats. | Configuration |

---

## 5. Local vs Production Divergence Risk

In the local development server (`server.ts` running under `npm run dev`), background crons do not execute automatically because Cloudflare Workers are not active.  
While this is acceptable for development, automated integration tests that rely on subscription expiration or provisional access termination must explicitly invoke `runSubscriptionMaintenanceSweeps()` or execute tests against the staging Cloudflare worker.

---

## 6. Infrastructure Audit Verdict

**PASSED.**  
The Cloudflare Pages advanced mode integration, Worker queue configuration, cron triggers, and maintenance sweeps are robust and production-ready. Infrastructure deployment can proceed once the database and backend application code blockers are remediated.

