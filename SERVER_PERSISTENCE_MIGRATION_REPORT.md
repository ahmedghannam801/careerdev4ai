=== SERVER PERSISTENCE MIGRATION — PHASE B.3 ===
Status: PARTIAL — Data-access layer created; endpoint migration not yet applied

1. PREVIOUS ARCHITECTURE: file DB (.careerpilot_state.json) + multer memory
2. NEW ARCHITECTURE: Supabase PostgreSQL (CareerFlow / ciihprsfdojzvjnqgbxl)
3. DB TABLES USED (verified remote):
   - profiles (id UUID PK, full_name, username, avatar_url, phone)
   - skills (id, name, category, description) — different from audit
   - educations (id, user_id)
   - experiences (id, user_id, company, ...)
   - user_preferences (user_id, theme)
   - user_skills (user_id, ...)
4. SERVER DATA-ACCESS LAYER:
   - server/db/supabase.ts (client init — requires SUPABASE_URL + SERVICE_ROLE_KEY env)
   - server/db/profiles.ts (getProfile/upsertProfile — uses profiles.id = auth.uid())
   - server/db/experiences.ts
   - server/db/educations.ts
5. ENDPOINT MAPPING:
   - /api/auth/* → auth.users (Supabase Auth) — unchanged; server uses session
   - /api/state, profile endpoints → profiles table
   - /api/resumes/upload → resumes table + Supabase Storage (needs setup)
   - /api/copilot, /api/analyze-career → ai_usage + profiles
   - /api/roadmap/* → need new tables (not in remote yet — use metadata or create if needed)
6. AUTH MODEL: auth.uid() = profiles.id (direct link, verified remotely)
7. .careerpilot_state.json STATUS: PRESERVED (not deleted); file DB still referenced by server.ts; needs endpoint migration to switch to DB
8. TESTS: lint PASS, build PASS, endpoint migration NOT full (only layer created)
9. SECURITY: service-role isolated in server/db/supabase.ts; no secrets committed; RLS enabled
10. KNOWN LIMITATIONS:
    - @supabase/supabase-js dependency not installed (requires approval)
    - server.ts not yet modified (endpoints still use file DB)
    - Roadmap/job/notification tables not fully mapped to remote (some missing in verified schema)
    - Admin recursion documented (server-side control needed)
11. NEXT PHASE: Complete endpoint migration in server.ts (group by group)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
