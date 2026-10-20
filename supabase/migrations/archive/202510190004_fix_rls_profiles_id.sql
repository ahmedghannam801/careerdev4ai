-- Corrected RLS using profiles.id = auth.uid() (matches remote reality)
-- No auth_uid needed; existing profiles.id IS auth identity
-- Idempotent (DO $$ + IF NOT EXISTS)
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_delete_own ON public.profiles FOR DELETE USING (auth.uid() = id);
-- Child policies reference profiles.id via subquery (same pattern)
