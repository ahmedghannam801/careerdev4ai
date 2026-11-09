-- Migration: 20261116000004_cvs_template_id_no_foreign_key.sql
-- Description: The template recorded against a CV is a code identifier, not a
-- row of the administrator's metadata table, so the foreign key is removed.
--
-- Why
-- ---
-- `public.cv_templates` holds the ADMINISTRATOR's metadata rows. A built-in
-- template has no row there at all: the catalogue is code
-- (`shared/cvTemplates.ts`), and the table is only where an administrator
-- writes an override or an additional template that reuses a built-in
-- structure. That table is empty on a fresh deployment.
--
-- The foreign key added with the column therefore made every CV creation
-- fail: the id of a built-in template — which is what almost every CV
-- carries — had no row to point at, and the insert was refused with a
-- constraint violation. The error surfaced as a 500 on a perfectly ordinary
-- request.
--
-- The id is a code constant, and the tier is checked against the two values
-- the product defines. A CHECK constraint is the right guarantee here: the
-- value must be one of the two tiers, and the template itself must exist in
-- the catalogue, which the server resolves before it writes the row.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cvs_template_id_fkey'
       AND conrelid = 'public.cvs'::regclass
  ) THEN
    ALTER TABLE public.cvs DROP CONSTRAINT cvs_template_id_fkey;
  END IF;
END $$;

COMMENT ON COLUMN public.cvs.template_id IS
  'The id of the CV template this CV was generated with, as the catalogue names it. It is a code identifier rather than a row of cv_templates, which holds only the administrator''s metadata overrides. NULL for a CV created before templates were recorded.';
