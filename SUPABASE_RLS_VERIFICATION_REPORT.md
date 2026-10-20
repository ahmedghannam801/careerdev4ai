=== SUPABASE RLS VERIFICATION ===
Phase B.2-RLS — Fix applied, verification partial (remote policy still blocked)
Project: CareerFlow (ciihprsfdojzvjnqgbxl)

1. Tables protected: 16 (profiles, skills, education, experience, career_goals, resumes, resume_versions, roadmaps, roadmap_phases, roadmap_tasks, roadmap_progress, saved_jobs, job_applications, notifications, admin_roles, audit_logs, ai_usage) — RLS enabled on 14 user-owned
2. Policies by table: profiles (4 intended), skills (3), resumes (3), roadmaps (4), notifications (3), saved_jobs (3), ai_usage (2). Additional: education, experience, career_goals, resume_versions, roadmap_phases, roadmap_tasks, roadmap_progress, job_applications — needed but not fully verified.
3. Ownership model: profiles.auth_uid -> auth.users(id); child tables via profiles.id FK lookup using auth.uid()
4. Admin model: admin_roles server-side; NO using(true) on sensitive tables
5. Anonymous access: BLOCKED by RLS enable
6. Cross-user read: BLOCKED by design (pending verification)
7. Cross-user insert: BLOCKED (pending verification)
8. Cross-user update: BLOCKED (pending verification)
9. Cross-user delete: BLOCKED (pending verification)
10. Final verdict: BLOCKED — RLS policies not fully applied remotely; auth_uid column fix migration created/appplied partially; verify column presence then apply 202510190002
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
