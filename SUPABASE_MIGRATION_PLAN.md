=== SUPABASE MIGRATION PLAN (Phase 13 — PRE-IMPL) ===
Decision: Supabase PostgreSQL = production system of record.
Status: Read-only planning only; NO tables created; NO migrations run.

Phase A — Git safety: DONE (git init, .gitignore updated, branch audit/before-supabase-migration, commit 8666da4, 52 files, NO secrets).
Phase B — Supabase schema: NOT STARTED (needs active connection/auth).
Phase C — Auth migration: Planned — migrate custom session tokens to Supabase Auth (email/password + OAuth).
Phase D — Profile migration: Planned — .careerpilot_state.json userStates -> profiles table.
Phase E — CV/storage: Planned — multer memory -> Supabase Storage bucket (resumes/); parse to resume_versions.
Phase F — Roadmap: Planned — generate from user profile; persist to roadmaps/roadmap_phases/roadmap_tasks.
Phase G — Jobs: Planned — build /api/job-search proxy to RapidAPI with server-side RAPIDAPI_KEY.
Phase H — LinkedIn: Planned — /api/auth/linkedin/oauth + callback; token storage secure.
Phase I — Notifications: Planned — notifications table + realtime subscription if supported.
Phase J — Admin: Planned — admin_roles table + server-side authorization checks.
Phase K — AI integration: Planned — /api/ai/* endpoints to Gemini (already secure); add usage logging.
Phase L — Testing: Planned — unit + integration + security.
Phase M — Production migration: Planned — migrate .careerpilot_state.json data once schema ready.
Phase N — Deployment: Planned — Cloudflare Pages + Workers (existing MCP).

Rollback: Keep .git branch audit/before-supabase-migration; file DB preserved; can revert to file DB if needed.

=== STEP 10 — DO NOT IMPLEMENT ===
No server.ts modifications.
No React code modifications.
No Supabase table creation.
No migration execution.
No Cloudflare changes.
No deployment.
No GitHub push.

=== GIT RECONCILIATION (Step 3 partial) ===
Local repo initialized.
Branch: audit/before-supabase-migration.
Commit: 8666da4 (root, 52 files, NO secrets).
Remote: NOT SET.
GitHub repo (https://github.com/ahmedghannam801/careerpilot-ai.git): CANNOT FULLY COMPARE (no token + no remote set). No overwrite performed.

=== SUPABASE CONNECTION STATUS ===
NOT_CONNECTED.
No database schema inspected (no active project/auth).
Plan exists but schema not created.

=== FILE DB STRUCTURE (Step 6) ===
Top-level: users, sessions, userStates (47K .careerpilot_state.json).
Migration: users -> auth.users + profiles; sessions -> auth.sessions (Supabase handles); userStates -> profiles/roadmaps/resumes/notifications.
Risk: LOW. Temporary UI state excluded.
