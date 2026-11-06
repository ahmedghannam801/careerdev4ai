# CareerDev4AI — Current State Audit

> **Date**: 2026-11-06  
> **Auditor**: Principal Software Architect (Planning Agent)  
> **Scope**: Complete repository analysis for subscription/payment/credits system planning

---

## 1. Repository Structure Overview

| Directory | Purpose | Status |
|-----------|---------|--------|
| `src/` | React 19 frontend (SPA) | ✅ Functional |
| `server/` | Express API handlers | ✅ Functional |
| `worker/` | Cloudflare Workers entry + background jobs | ✅ Functional |
| `shared/` | Shared types/constants (server + client) | ✅ Functional |
| `supabase/migrations/` | 50+ migration files | ✅ Functional |
| `tests/` | Test suite with runner | ✅ Functional |
| `scripts/` | Build and production scripts | ✅ Functional |
| `public/` | Static assets (images, brand, SEO) | ✅ Functional |
| `.agents/skills/` | AI agent workspace skills | ✅ Functional |

---

## 2. Technology Stack (Verified)

| Layer | Technology | Version | Evidence |
|-------|-----------|---------|----------|
| Frontend Framework | React | 19.0.1 | `package.json` |
| Language | TypeScript | 7.0.2 | `package.json` |
| Build Tool | Vite | 8.3.5 | `package.json` |
| CSS Framework | Tailwind CSS | 4.3.3 | `package.json` |
| Animation | Motion | 12.23.24 | `package.json` |
| Icons | Lucide React | 0.546.0 | `package.json` |
| Backend Runtime | Cloudflare Workers (nodejs_compat) | `compatibility_date: 2026-09-01` | `wrangler.jsonc` |
| HTTP Framework | Express | 4.21.2 | `package.json` |
| Database | Supabase PostgreSQL | — | `supabase/.temp/` |
| Auth | Supabase Auth | — | `@supabase/supabase-js 2.118.0` |
| AI Primary | Google Gemini (gemini-3.1-flash-lite) | `@google/genai 2.31.0` | `server/ai/geminiConfig.ts` |
| AI Secondary | OpenRouter (openrouter/free) | — | `wrangler.jsonc` |
| File Upload | Multer | 2.5.0 | `package.json` |
| PDF Parsing | unpdf | 1.9.1 | `package.json` |
| Queue | Cloudflare Queues (`careerdev4ai-jobs`) | — | `wrangler.jsonc` |
| Mobile | Capacitor (Android) | 8.5.3 | `package.json`, `capacitor.config.ts` |

---

## 3. Database Schema Inventory

### Core Tables (from migrations)

| Table | Purpose | RLS | Client Grants | Owner Column |
|-------|---------|-----|---------------|--------------|
| `profiles` | User profiles | ✅ | SELECT, INSERT, UPDATE, DELETE | `id = auth.uid()` |
| `skills` | Global skill catalog | ✅ | SELECT only | N/A (catalog) |
| `experiences` | Work history | ✅ | Full CRUD | `user_id` |
| `educations` | Education history | ✅ | Full CRUD | `user_id` |
| `user_skills` | Profile ↔ skill join | ✅ | Full CRUD | `user_id` |
| `user_preferences` | Theme, language, notifications | ✅ | Full CRUD | `user_id` |
| `user_consents` | Legal consent (versioned) | ✅ | SELECT, INSERT | `user_id` |
| `cvs` | CV records | ✅ | Full CRUD | `profile_id` |
| `cv_versions` | CV version history | ✅ | Full CRUD | — |
| `cv_measurements` | CV quality metrics | ✅ | — | `profile_id` |
| `cover_letters` | Generated cover letters | ✅ | Full CRUD | `profile_id` |
| `application_packages` | JD + CV + cover letter bundles | ✅ | Full CRUD | `profile_id` |
| `roadmaps` | Career roadmaps | ✅ | Full CRUD | `profile_id` |
| `roadmap_phases` | Roadmap phases | ✅ | — | — |
| `roadmap_milestones` | Roadmap milestones | ✅ | — | — |
| `roadmap_tasks` | Roadmap tasks | ✅ | — | — |
| `notifications` | User notifications | ✅ | Full CRUD | `profile_id` |
| `job_bookmarks` | Saved jobs | ✅ | Full CRUD | `profile_id` |
| `courses` | Learning catalog | ✅ | SELECT | N/A (catalog) |
| `user_learning_items` | User learning progress | ✅ | Full CRUD | `profile_id` |
| `projects` | Portfolio projects | ✅ | Full CRUD | `profile_id` |
| `volunteer_experiences` | Volunteer history | ✅ | Full CRUD | `profile_id` |
| `volunteer_opportunities` | Opportunity listings | ✅ | SELECT (active) | N/A |
| `admin_users` | Admin hierarchy | ✅ | SELECT self only | `profile_id` |
| `admin_audit_log` | Admin action trail | ✅ | **REVOKED** from clients | N/A |
| `announcements` | Communication center | ✅ | SELECT (published only) | N/A |
| `announcement_deliveries` | Delivery ledger | ✅ | SELECT/UPDATE own | `profile_id` |
| `background_jobs` | Job queue state | ✅ | **REVOKED** from clients | `profile_id` |
| `background_job_consumers` | Worker heartbeat | ✅ | **REVOKED** from clients | N/A |
| `feedback_invitations` | Feedback requests | ✅ | — | `profile_id` |

### Database Functions (Security-Critical)

| Function | Privilege | Purpose |
|----------|-----------|---------|
| `claim_background_job()` | service_role only | Atomically claim a job for processing |
| `complete_background_job()` | service_role only | Mark a job as completed |
| `fail_background_job()` | service_role only | Mark a job as failed with retry logic |
| `careerpilot_handle_new_user()` | SECURITY DEFINER | Auth trigger: create profile + preferences on signup |
| `careerpilot_set_updated_at()` | — | Generic updated_at trigger |
| `background_jobs_touch_updated_at()` | — | updated_at trigger for background_jobs |

### Views

| View | Purpose | Access |
|------|---------|--------|
| `announcement_delivery_stats` | Aggregate delivery analytics | **REVOKED** from anon/authenticated |

---

## 4. Authentication & Authorization

### Authentication Flow
- **Supabase Auth** handles user registration, login, JWT issuance
- Server verifies JWT via `verifySupabaseToken()` in `server/auth/supabase-auth.ts`
- `requireAuth` middleware (`server/auth/require-auth.ts`):
  1. Verifies Supabase JWT
  2. Checks server-side legal terms approval
  3. Enforces versioned consent (Terms + Privacy Policy)
  4. Returns 403 `CONSENT_REQUIRED` if consent missing
- `requireSession` — lighter version, skips consent check (for CV measurement)

### Admin Authorization
- **Server-enforced, never client-trusted** (explicitly documented in code)
- `requireAdmin` middleware loads admin row by verified `profile_id`
- `requirePermission(perm)` checks specific permission from role's permission set
- Four roles: `super_admin`, `content_admin`, `opportunity_admin`, `moderator`
- 14 permissions defined in `shared/admin.ts`
- Super Admin cannot be last one demoted/disabled/removed (server guard)

### Current Super Admin Bootstrap
- **Email in migration**: `ahdabdalla77@gmail.com` (in `20261102000006_admin_communication.sql`)

> [!WARNING]
> **CRITICAL DISCREPANCY**: The requirement specifies `ahmedghannam801@gmail.com` as the owner email, but the existing migration bootstraps `ahdabdalla77@gmail.com`. A new migration is needed to add the correct Super Admin. The existing admin should NOT be removed without owner confirmation.

---

## 5. AI Integration Analysis

### Provider Configuration
- **Primary**: Google Gemini via `@google/genai` web SDK
- **Canonical Model**: `gemini-3.1-flash-lite` (hardcoded in `server/ai/geminiConfig.ts`)
- **Safeguards**: Auto-downgrades from deprecated models (`gemini-3.8-flash`, `gemini-3.6-flash`)
- **Secondary/Fallback**: OpenRouter (`openrouter/free` model)
- **Timeout**: 45,000ms per request
- **Retry**: 1 retry on transient 503/504/overloaded errors, 1s delay, exponential backoff

### Existing Quota System
- **In-process daily budget** in `server/ai/quota.ts`
- Per-user: 15 requests/day (env: `AI_DAILY_LIMIT`)
- Per-project: 20 requests/day (env: `AI_PROJECT_DAILY_LIMIT`)
- Has refund mechanism for provider quota (429) errors
- Returns 429 with Retry-After header

> [!IMPORTANT]
> **CRITICAL LIMITATION**: The quota is in-process memory only, NOT persisted. Multi-instance deployments multiply the effective allowance. This MUST be replaced with persistent credit ledger for the subscription system.

### AI-Powered Features (15 identified)

| Feature | File | Type | Notes |
|---------|------|------|-------|
| CV Processing | `server/jobs/tasks/processCv.ts` | Background job | Full CV analysis |
| Targeted CV Generation | `server/jobs/tasks/generateTargetedCv.ts` | Background job | JD-targeted rewrite |
| ATS Analysis | `server/cv/atsAnalysis.ts` | Synchronous API | Structured scoring |
| CV Analysis | `server/cv/cvAnalysis.ts` | Synchronous API | Quality assessment |
| Cover Letter | `server/cv/coverLetter.ts` | Synchronous API | Full document generation |
| Job Description Analysis | `server/cv/jobDescription.ts` | Synchronous API | JD parsing & matching |
| AI Assist (inline) | `server/cv/aiAssist.ts` | Synchronous API | Small inline suggestions |
| Document Extraction | `server/cv/documentExtraction.ts` | Synchronous API | PDF text extraction |
| Career Roadmap | `server/jobs/tasks/roadmap.ts` | Background job | Multi-step plan |
| AI Mentor | `server/jobs/tasks/aiMentor.ts` | Background job | Career advisory |
| Job Matching | `server/jobs/tasks/matchJobs.ts` | Background job | JSearch integration |
| Learning Recommendations | `server/learning/ai.ts` | Synchronous API | Course suggestions |
| Project Analysis | `server/projects/analysis.ts` | Synchronous API | Portfolio feedback |
| Project Recommendation | `server/projects/recommendation.ts` | Synchronous API | Project ideas |
| Copilot | (app.ts routes) | Synchronous API | General assistant |

### In-Memory Audit
- Provider call audit: last 50 entries stored in memory (`server/ai/provider.ts`)
- Not persisted — lost on restart

---

## 6. Background Jobs Infrastructure

### Architecture (Migrated from Trigger.dev to Cloudflare Queues)

| Component | Location | Purpose |
|-----------|----------|---------|
| Queue Producer | `server/jobs/queue.ts` | CloudflareQueueProducer / LocalJobQueue |
| Job Management | `server/jobs/jobs.ts` | Create, dispatch, retry logic |
| Job Consumer | `server/jobs/consumer.ts` | Process queue messages |
| Worker Entry | `worker/jobs/` | Separate Cloudflare Worker deployment |
| Heartbeat | `server/jobs/heartbeat.ts` | Consumer health tracking |
| Task Registry | `server/jobs/tasks/index.ts` | Task type registration |

### Registered Task Types

| Task Kind | File | Max Attempts | Backoff |
|-----------|------|-------------|---------|
| `process-cv` | `server/jobs/tasks/processCv.ts` | 2 | 5-30s |
| `generate-targeted-cv` | `server/jobs/tasks/generateTargetedCv.ts` | 2 | 10-60s |
| `match-jobs` | `server/jobs/tasks/matchJobs.ts` | 2 | 15-60s |
| `generate-career-roadmap` | `server/jobs/tasks/roadmap.ts` | 2 | 10-60s |
| `update-roadmap-progress` | (inline) | 1 | 5-30s |
| `process-ai-mentor-workflow` | `server/jobs/tasks/aiMentor.ts` | 2 | 10-60s |
| `validate-learning-resources` | `server/jobs/tasks/validateLearningResources.ts` | 1 | 30-60s |

### Job State Machine
`pending → queued → processing → completed | failed | cancelled`

Database functions enforce atomic state transitions with row-level locking.

---

## 7. Subscription/Payment/Credit System Status

### ❌ MISSING: No subscription system exists
- No `subscription_plans` table
- No `subscriptions` table
- No plan-based feature gating
- No entitlement middleware

### ❌ MISSING: No payment system exists
- No `payment_requests` table
- No `payment_verifications` table
- No receipt upload handling
- No payment state machine
- No Vodafone Cash or InstaPay integration

### ❌ MISSING: No credit system exists
- No `ai_credit_ledger` table
- No credit-based AI access control
- No credit purchase flow
- No trial credit mechanism
- Existing quota is in-process rate limiting only (not a credit system)

### ❌ MISSING: No coupon/discount system
- No `coupon_definitions` table
- No coupon validation/redemption

### ❌ MISSING: No birthday reward system
- No birthday data collection
- No birthday consent mechanism
- No reward generation

### ✅ EXISTS: Admin infrastructure (extensible)
- Admin roles and permissions → needs new permissions for subscription management
- Audit log → needs extension for financial operations
- Admin UI → needs new panels for subscription/payment/credit management

### ✅ EXISTS: Notification system (extensible)
- User notifications → needs new types for payment/subscription events
- Announcement delivery → can serve as template for subscription notifications

### ✅ EXISTS: Background jobs (extensible)
- Cloudflare Queues infrastructure → can add new task types for:
  - Temporary access expiration
  - Subscription expiration
  - Renewal reminders
  - Credit allocation

---

## 8. Frontend State Management

### CareerContext.tsx
- Single `CareerContext` provider wraps entire application
- Manages: user profile, preferences, language, onboarding, roadmap, skills, CV data
- **No subscription/plan/credit state exists**
- **No payment state exists**
- All data fetched from Supabase via API

### Admin Access
- `src/lib/useAdminAccess.ts` — hook that checks admin status via `/api/admin/me`
- Explicitly documented as "UI hint only — API re-checks every action"
- 30-second cache on admin status

### Admin Components (9 existing panels)
Located in `src/components/admin/`:
- AdminView, AdminOverviewPanel, AdminTeamPanel
- AdminAnnouncementsPanel, AdminLearningPanel
- AdminOpportunitiesPanel, TrafficAnalyticsPanel
- AdminUsersPanel, AdminAuditPanel

---

## 9. Deployment Infrastructure

### Production
- **Domain**: `https://careerdev4ai.pages.dev`
- **Platform**: Cloudflare Pages (advanced mode with Worker)
- **Build**: `npm run build` → Vite frontend + esbuild Worker bundle
- **Deploy**: `npm run cf:deploy` → `wrangler pages deploy`
- **Background Worker**: Separate deployment via `npm run cf:jobs:deploy`

### Environment Variables (from `.env.example`)

| Variable | Scope | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Supabase anon key |
| `SUPABASE_URL` | Server | Supabase URL (server-side) |
| `SUPABASE_ANON_KEY` | Server | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | **SECRET** — service role key |
| `GEMINI_API_KEY` | Server | **SECRET** — Gemini API key |
| `GEMINI_MODEL` | Server | Model override |
| `AI_DAILY_LIMIT` | Server | Per-user AI daily limit (default: 15) |
| `AI_PROJECT_DAILY_LIMIT` | Server | Per-project AI daily limit (default: 20) |
| `ALLOWED_ORIGINS` | Server | CORS origins |
| `GA4_*` | Server | Google Analytics 4 Data API credentials |
| `INDEXNOW_KEY` | Server | Search engine indexing |
| `TRIGGER_SECRET_KEY` | Server | Legacy Trigger.dev key (optional) |

### CI/CD
- GitHub repository with `.github/workflows/` (CI workflow exists)
- Supabase linked project (`.temp/project-ref` and `linked-project.json`)

---

## 10. Security Posture

### Strengths ✅
1. RLS enabled on ALL tables
2. Service-role key never in frontend (VITE_ prefix check)
3. Server-side JWT verification before any data access
4. Admin permissions checked server-side, never client-trusted
5. Versioned legal consent enforcement in middleware
6. Audit logging for admin actions
7. Background job functions restricted to service_role
8. Last Super Admin protection
9. Idempotency keys on background jobs

### Concerns ⚠️
1. AI quota is in-process only — not a reliable credit system
2. No rate limiting on API endpoints (beyond AI daily budget)
3. AI provider audit log is in-memory, lost on restart
4. No financial data protection measures (no payment system yet)
5. Super Admin email in migration differs from requirement
6. No MFA recommendation for admin accounts
7. No webhook signature verification (no webhooks yet)

---

## 11. Classification Summary

| System | Status | Evidence |
|--------|--------|----------|
| User Authentication | ✅ Functional | Supabase Auth + JWT verification |
| User Profiles | ✅ Functional | profiles table + API endpoints |
| CV Builder | ✅ Functional | cvs, cv_versions tables + API |
| Job Search | ✅ Functional | JSearch integration |
| Learning Hub | ✅ Functional | courses, user_learning_items |
| Career Roadmaps | ✅ Functional | roadmaps + phases + milestones + tasks |
| AI Integration | ✅ Functional | Gemini + OpenRouter with fallback |
| Background Jobs | ✅ Functional | Cloudflare Queues |
| Admin Center | ✅ Functional | Roles, permissions, announcements, analytics |
| Notifications | ✅ Functional | Notifications table + delivery |
| Legal Consent | ✅ Functional | Versioned consent with middleware |
| Portfolio/Projects | ✅ Functional | projects table |
| Volunteer | ✅ Functional | volunteer experiences + opportunities |
| SEO | ✅ Functional | Sitemap, robots, structured data, IndexNow |
| Google Analytics | ✅ Functional | GA4 integration + admin dashboard |
| Mobile (Android) | ⚠️ Partially implemented | Capacitor config exists |
| **Subscription Plans** | ❌ Missing | No tables, no API |
| **Payment Processing** | ❌ Missing | No tables, no API |
| **AI Credits** | ❌ Missing | In-process rate limit only |
| **Coupons** | ❌ Missing | No tables, no API |
| **Birthday Rewards** | ❌ Missing | No tables, no API |
| **Feature Entitlements** | ❌ Missing | No plan-gated access |
| **Financial Reporting** | ❌ Missing | No payment data to report |

