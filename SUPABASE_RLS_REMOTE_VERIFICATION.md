=== REMOTE SCHEMA VERIFICATION ===
READ-ONLY — NO MIGRATION APPLIED — NO DATA CHANGED

profiles.auth_uid: UNKNOWN (direct SELECT unavailable; best evidence: error 42703 on policy suggests COL missing, fix migration created, apply attempted but not fully verified)
type: UUID (expected per audit)
nullable: expected (existing rows possible)
FK -> auth.users(id): UNKNOWN (expected; cannot verify without SELECT)
unique: UNKNOWN (expected; audit requires one profile per auth user)

RLS
- RLS-enabled tables: 14/16 (verified from first migration apply — profiles, skills, education, experience, career_goals, resumes, resume_versions, roadmaps, roadmap_phases, roadmap_tasks, roadmap_progress, saved_jobs, job_applications, notifications, ai_usage)
- policies currently present: UNKNOWN (partial apply blocked at profile policy; others unverified)
- profiles policies: UNKNOWN (blocked — auth_uid missing or unconfirmed)
- admin_roles policies: UNKNOWN (not applied; recursion noted in audit)

MIGRATION HISTORY
- 001 (initial): applied remotely; policies FAILED at line 32 (42703)
- 002 (fix_rls): local only; never applied remotely (not in remote history — needs apply after column fixed)
- 003 (fix_profiles_auth_uid): listed remotely; apply result unclear (error on 001 still suggests column missing OR 001 replaying)

VERDICT: REMOTE VERIFICATION BLOCKED — cannot confirm auth_uid via SELECT
Reason: No SQL query interface available in session (only CLI apply/status, not SELECT)
SAFE METHOD AVAILABLE: Supabase MCP (docs/account) OR Supabase CLI status (no SELECT)
DO NOT proceed to apply RLS policies until auth_uid confirmed remotely
DO NOT apply 202510190002 until column verified
NEED: Direct query execution (via Supabase Studio SQL editor or SQL CLI) to confirm column
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
