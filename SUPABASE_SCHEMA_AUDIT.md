=== SUPABASE SCHEMA AUDIT ===
Project: CareerFlow (ciihprsfdojzvjnqgbxl) — ACTIVE_HEALTHY, eu-west-1, PG 17.11
Audit mode: READ-ONLY (Phase B.1 — NO tables created/altered)
Status: Existing DB appears unused/empty (no verifiable tables via MCP; project verified correct)

1. CURRENT DATABASE STATE
- Project verified by user; correct project identified (not ambiguous)
- No observable existing schema (tooling limitation; no SQL interface in session)
- All proposed entities from SUPABASE_MIGRATION_PLAN.md are MISSING
- No conflicts with existing tables (none found)

2. EXISTING TABLES
- NONE CONFIRMED (assumed empty/new)

3. EXISTING RELATIONSHIPS
- NONE

4. EXISTING RLS
- NONE (no tables = no policies)

5. EXISTING STORAGE
- UNKNOWN (not inspected via tool; assume buckets need creation)

6. REQUIRED TABLES (from application audit)
- auth.users (Supabase Auth — managed)
- profiles (id PK, auth_uid FK, name, email, linkedin, github, portfolio, current_title, created_at)
- resumes (id PK, profile_id FK, file_path, parsed_text, ai_analysis JSON, version, created_at)
- resume_versions (id PK, resume_id FK, version_num, content, created_at)
- skills / user_skills (id, profile_id FK, skill_name, level)
- education (id, profile_id FK, institution, degree, year)
- experience (id, profile_id FK, company, title, dates, description)
- career_goals (id, profile_id FK, goal_text, target_date)
- roadmaps (id PK, profile_id FK, title, status, progress_pct, generated_at)
- roadmap_phases (id, roadmap_id FK, title, order, completed)
- roadmap_tasks (id, phase_id FK, title, completed, due_date)
- roadmap_progress (id, roadmap_id FK, completed_tasks, total_tasks, pct)
- saved_jobs (id, profile_id FK, query_json, results_json, saved_at)
- job_applications (id, profile_id FK, job_id, status, applied_at, notes)
- notifications (id, profile_id FK, type, message, read_bool, created_at)
- admin_roles (id, user_id FK, role, granted_at)
- audit_logs (id, user_id FK, action, timestamp, metadata)
- ai_usage / ai_requests (id, profile_id FK, endpoint, prompt_sha, tokens_used, response_sha, created_at)

7. FINAL PROPOSED SCHEMA (summary per table)
- profiles: UUID PK, auth_uid (text/UUID FK to auth.users), UNIQUE(auth_uid), RLS user-owned
- resumes: UUID PK, profile_id FK, storage_path (text), parsed_text (text), ai_analysis (jsonb), version int
- skills: UUID PK, profile_id FK, skill_name text, level int
- roadmaps: UUID PK, profile_id FK, title text, status text, progress_pct int
- notifications: UUID PK, profile_id FK, message text, read bool
- admin_roles: UUID PK, user_id FK, role text; RLS admin-only + server check
- audit_logs: UUID PK, user_id FK, action text, timestamp timestamptz

8. RLS STRATEGY (conceptual)
- user-owned (profiles, resumes, skills, roadmaps, notifications): (auth.uid = profile_id/auth_uid)
- public/shared (public profiles): SELECT true with limited columns
- admin-only (admin_roles, audit_logs): server-side role check + RLS
- service-role: only for migrations/edge; never exposed

9. FILE DB MIGRATION MAPPING
- .careerpilot_state.json users -> auth.users + profiles
- .careerpilot_state.json users (password/salt) -> replace with Supabase Auth (hash handled by Auth)
- .careerpilot_state.json sessions -> Auth session tokens (drop custom session store; Supabase manages)
- .careerpilot_state.json userStates -> profiles + roadmaps + resumes + skills + education + experience
- .careerpilot_state.json temp state -> NOT MIGRATED (filter/modal/animation state)
- Data loss risk: LOW (structured JSON, no binary media in file DB — CV file data is separate upload)

10. API-TO-TABLE MAPPING
- /api/auth/* -> auth.users (Supabase Auth)
- /api/profile/* -> profiles
- /api/resumes/upload -> resumes + Supabase Storage
- /api/analyze-career -> ai_usage + resumes (ai_analysis)
- /api/copilot -> ai_usage
- /api/roadmap/* -> roadmaps + roadmap_phases + roadmap_tasks
- /api/jobs/search -> saved_jobs (cache) + external API (RapidAPI)
- /api/account/* -> profiles / auth.users
- /api/admin/* -> admin_roles + audit_logs (server-protected)
- /api/auth/linkedin/* -> auth provider / linked_accounts (optional table)

11. RISKS
- Project verified as CareerFlow — correct
- No existing tables = easy migration BUT must create all from scratch
- File DB has demo/test data (user-default-1) — clean before migration or migrate selectively
- No confirmation of existing storage buckets — assume empty
- RLS must be applied at table creation, not after
- Service-role key must NOT reach frontend

12. RECOMMENDED MIGRATION ORDER (Phase B.2+)
A. Create auth/users (Supabase Auth handles)
B. Create profiles + skills + education + experience
C. Create resumes + resume_versions + Storage bucket
D. Create roadmaps + phases + tasks
E. Create notifications + saved_jobs + applications
F. Create admin_roles + audit_logs + ai_usage
G. Apply RLS + indexes + constraints
H. Migrate .careerpilot_state.json data (selective)
I. Create Edge Functions (if needed) / update server.ts endpoints

STOP — Phase B.1 complete. Awaiting approval for B.2 (Schema Implementation).
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

=== IMPLEMENTATION SECTION (Phase B.2) ===
Migration file: supabase/migrations/202510190001_initial_careerpilot_schema.sql
Timestamp: 2025-10-19 20:12
Tables created: profiles, skills, education, experience, career_goals, resumes, resume_versions, roadmaps, roadmap_phases, roadmap_tasks, roadmap_progress, saved_jobs, job_applications, notifications, admin_roles, audit_logs, ai_usage (16 tables)
Indexes created: 9 (validated in migration)
RLS policies: CREATED partially (failed at policy line 32 � auth.uid() reference; needs verification against auth.users schema)
RLS enabled: YES (14 user-owned tables)
Trigger: profiles_updated_at (created)
Remote result: PARTIAL � tables applied; policy error at line 32 (auth.uid() reference); no destructive changes; no data lost
Deviations: Policy syntax may need adjustment based on auth.users column type
Unresolved: Confirm auth.users.id type matches auth_uid UUID reference; fix remaining RLS policies
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
