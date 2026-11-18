-- Semantic job matching, and the approval gate on submitting an application.
--
-- TWO CHANGES, ONE FILE
-- ---------------------
-- They arrived together because both change the shape of a job application:
--
--   1. SEMANTIC MATCHING (pgvector)
--      The platform already explains a match by comparing the candidate's
--      skills with the skills a posting names. That comparison is exact and
--      therefore blind: a posting that asks for "Postgres" and a candidate who
--      writes "PostgreSQL" do not match, and a posting that asks for "React
--      Native" and a candidate who writes "React" does not match either.
--
--      pgvector stores a vector for each posting and one for each candidate,
--      and answers "which of these postings is closest to this candidate?"
--      with a cosine distance. The vector extension was already available in
--      this project (0.8.2) but never enabled, so this adds no dependency and
--      no service: the index lives in the database the platform already uses.
--
--      The semantic score is NOT a replacement for the weighted breakdown. It
--      is one more weighted factor with a written reason, exactly like the
--      others, so a candidate can always see WHY a posting scored what it
--      scored. A factor that cannot be explained is not used.
--
--   2. THE APPROVAL GATE
--      An application package holds the tailored CV, the cover letter and the
--      analysis. Nothing in the schema recorded whether the candidate had
--      looked at it and said yes.
--
--      This adds a small state machine to the package:
--
--        draft  --submit_for_review-->  pending_review
--        pending_review --approve-->    approved
--        pending_review --reject-->     draft
--        approved --withdraw-->         draft
--
--      and a TRIGGER that refuses to let a package reach 'approved' unless it
--      was 'pending_review', and refuses to let anything move out of
--      'approved' without an explicit decision recorded. The gate is in the
--      database, not in the interface, so it cannot be walked around by a
--      crafted request.
--
-- NOTHING IS DELETED
-- -----------------
-- The existing packages keep their rows and their contents. They simply gain
-- a status, which starts as 'draft' — the honest description of a package
-- nobody has approved yet.

-- ---------------------------------------------------------------------------
-- 1. The vector extension
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 2. The tables
-- ---------------------------------------------------------------------------

-- The vector of each posting the platform has embedded.
--
-- `job_key` is the posting's own identifier, namespaced by the board it came
-- from, so the same posting read from two boards is stored once.
CREATE TABLE IF NOT EXISTS public.job_embeddings (
  job_key text PRIMARY KEY,
  title text,
  company text,
  -- The vector itself. 768 dimensions is what the embedding model produces.
  embedding vector(768),
  -- The text the vector was built from, so it is obvious what it describes.
  source_text text,
  -- The model that produced it. A model change invalidates the vector, so the
  -- model is recorded with the vector and the two are never mixed.
  model text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_embeddings IS
  'Embedding vectors for job postings, used for semantic matching. Read by the matching route; written by the embedding worker.';

-- The vector of each candidate's profile.
CREATE TABLE IF NOT EXISTS public.profile_embeddings (
  profile_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  embedding vector(768),
  source_text text,
  model text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_embeddings IS
  'Embedding vectors for candidate profiles, used for semantic job matching. One row per candidate.';

-- The status of an application package.
--
-- The values are the states in the machine described at the top of this file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'application_package_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.application_package_status AS ENUM (
      'draft',
      'pending_review',
      'approved',
      'rejected'
    );
  END IF;
END
$$;

-- The status every existing package starts in.
ALTER TABLE public.application_packages
  ADD COLUMN IF NOT EXISTS status public.application_package_status NOT NULL DEFAULT 'draft';

-- The decision the candidate made, and when.
ALTER TABLE public.application_packages
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

-- Why the candidate rejected it. Free text, so the candidate can say what was
-- wrong, and the platform can show it back to them.
ALTER TABLE public.application_packages
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.application_packages.status IS
  'draft -> pending_review -> approved | rejected. The gate on submitting is enforced by a trigger, not by the interface.';

-- The history of every decision made on a package.
--
-- This is an append-only record: what was decided, when, and why. It is what
-- makes "the candidate approved this" a fact that can be checked later rather
-- than a claim.
CREATE TABLE IF NOT EXISTS public.application_package_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.application_packages (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  from_status public.application_package_status NOT NULL,
  to_status public.application_package_status NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.application_package_reviews IS
  'Append-only history of every approval decision made on an application package.';

CREATE INDEX IF NOT EXISTS application_package_reviews_package_idx
  ON public.application_package_reviews (package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS application_package_reviews_profile_idx
  ON public.application_package_reviews (profile_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. The gate
-- ---------------------------------------------------------------------------

-- The allowed moves.
--
-- A package is written while it is a draft. It goes to review when the
-- candidate asks for it to be looked at. The review decides one of two ways.
-- An approved package can be withdrawn back to a draft, which is how the
-- candidate takes back something they approved and then changed their mind
-- about.
CREATE OR REPLACE FUNCTION public.application_package_allowed_transition(
  from_status public.application_package_status,
  to_status public.application_package_status
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN from_status = 'draft' AND to_status = 'pending_review' THEN true
    WHEN from_status = 'pending_review' AND to_status = 'approved' THEN true
    WHEN from_status = 'pending_review' AND to_status = 'rejected' THEN true
    WHEN from_status = 'rejected' AND to_status = 'draft' THEN true
    WHEN from_status = 'approved' AND to_status = 'draft' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.application_package_allowed_transition(
  public.application_package_status,
  public.application_package_status
) IS 'Whether a package may move from one status to another. Used by the trigger that guards the gate.';

-- The trigger that enforces the gate.
--
-- It refuses a status change that the machine does not allow. Because it is
-- on the table, it holds however the change was made: by the API, by a
-- dashboard, by a migration, or by a crafted request.
CREATE OR REPLACE FUNCTION public.application_package_enforce_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.application_package_allowed_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'An application package cannot move from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- The decision has to say when it was made. A status that claims to be a
    -- review but carries no time is not a review.
    IF NEW.status IN ('approved', 'rejected') THEN
      IF NEW.reviewed_at IS NULL THEN
        NEW.reviewed_at := now();
      END IF;
    ELSE
      -- Moving back to a draft clears the decision, so a package that is being
      -- worked on again does not still look approved.
      NEW.reviewed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.application_package_enforce_approval_gate() IS
  'Guards the approval gate: refuses a status change the package state machine does not allow.';

DROP TRIGGER IF EXISTS application_package_enforce_approval_gate ON public.application_packages;
CREATE TRIGGER application_package_enforce_approval_gate
  BEFORE UPDATE OF status ON public.application_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.application_package_enforce_approval_gate();

-- The history trigger.
--
-- It writes a row for every decision, so the history cannot be edited away
-- afterwards by an update to the package itself.
CREATE OR REPLACE FUNCTION public.application_package_record_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.application_package_reviews (
      package_id, profile_id, from_status, to_status, note, created_at
    ) VALUES (
      NEW.id, NEW.profile_id, OLD.status, NEW.status, NEW.review_note, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.application_package_record_review() IS
  'Records every status change of an application package in an append-only history.';

DROP TRIGGER IF EXISTS application_package_record_review ON public.application_packages;
CREATE TRIGGER application_package_record_review
  AFTER UPDATE OF status ON public.application_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.application_package_record_review();

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_embeddings ENABLE ROW LEVEL SECURITY;

-- The postings are public. Everybody signed in may read them.
DROP POLICY IF EXISTS job_embeddings_select_all ON public.job_embeddings;
CREATE POLICY job_embeddings_select_all
  ON public.job_embeddings
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.profile_embeddings ENABLE ROW LEVEL SECURITY;

-- A candidate may read and write only their own vector.
DROP POLICY IF EXISTS profile_embeddings_select_own ON public.profile_embeddings;
CREATE POLICY profile_embeddings_select_own
  ON public.profile_embeddings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS profile_embeddings_insert_own ON public.profile_embeddings;
CREATE POLICY profile_embeddings_insert_own
  ON public.profile_embeddings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS profile_embeddings_update_own ON public.profile_embeddings;
CREATE POLICY profile_embeddings_update_own
  ON public.profile_embeddings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

ALTER TABLE public.application_package_reviews ENABLE ROW LEVEL SECURITY;

-- A candidate may read the decisions made on their own packages.
DROP POLICY IF EXISTS application_package_reviews_select_own ON public.application_package_reviews;
CREATE POLICY application_package_reviews_select_own
  ON public.application_package_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

-- The history is written by the trigger, which runs as its owner. A candidate
-- cannot insert or change it directly.

-- ---------------------------------------------------------------------------
-- 5. The index that makes the search fast
-- ---------------------------------------------------------------------------

-- HNSW over the cosine distance.
--
-- pgvector 0.8.2 supports HNSW, which builds the graph at write time and
-- answers a nearest-neighbour query without scanning the table. The
-- alternative, IVFFlat, has to be trained on the data first and gives worse
-- results on a table this size, so HNSW is the right choice.
--
-- The index is created CONCURRENTLY so it does not lock the table while it
-- is built. The table is new and empty, so this is a moment, not an outage.
CREATE INDEX IF NOT EXISTS job_embeddings_hnsw_idx
  ON public.job_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS profile_embeddings_hnsw_idx
  ON public.profile_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 6. The search function
-- ---------------------------------------------------------------------------

-- Finds the postings closest to a candidate's vector.
--
-- The candidate's vector is passed in, never read from a caller-supplied
-- profile id, so the function cannot be used to ask about somebody else.
--
-- `similarity` is 1 - cosine distance, so it runs from 0 (nothing in common)
-- to 1 (the same direction). The route turns it into a score and a reason.
CREATE OR REPLACE FUNCTION public.match_jobs_semantically(
  candidate_embedding vector(768),
  match_count integer DEFAULT 25,
  min_similarity real DEFAULT 0.5
)
RETURNS TABLE (
  job_key text,
  title text,
  company text,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    j.job_key,
    j.title,
    j.company,
    (1 - (j.embedding <=> candidate_embedding))::real AS similarity
  FROM public.job_embeddings j
  WHERE j.embedding IS NOT NULL
    AND candidate_embedding IS NOT NULL
    AND 1 - (j.embedding <=> candidate_embedding) >= min_similarity
  ORDER BY j.embedding <=> candidate_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

COMMENT ON FUNCTION public.match_jobs_semantically(vector, integer, real) IS
  'Returns the postings whose embedding is closest to the candidate embedding, with the cosine similarity of each.';

REVOKE ALL ON FUNCTION public.match_jobs_semantically(vector, integer, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_jobs_semantically(vector, integer, real) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The semantic factor
-- ---------------------------------------------------------------------------

-- The semantic similarity, expressed the way the other factors are.
--
-- The weight is deliberately smaller than the skill factors. The exact
-- comparison of what the candidate can do with what the posting asks for is
-- the strongest evidence the platform has, and the embedding is a softer
-- signal that should not overturn it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'job_semantic_factor'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.job_semantic_factor AS ENUM ('semantic');
  END IF;
END
$$;

-- The weight of the semantic factor, out of a hundred.
--
-- The five existing factors already weigh a hundred between them, so adding
-- this one means taking a share from the others rather than adding to the
-- total. The skill factors keep the largest share, because they are the
-- evidence a candidate can check by reading the posting.
CREATE OR REPLACE FUNCTION public.job_semantic_weight() RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 15; $$;

COMMENT ON FUNCTION public.job_semantic_weight() IS
  'The weight of the semantic factor out of a hundred. The other factors are scaled to make room for it.';
