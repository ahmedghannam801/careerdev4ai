-- Migration: 20261128000002_ledger_balance_ordering.sql
-- Description: The ledger's rows are stamped in the order they were written,
-- so that the balance a reader reports is the balance the LAST operation left.
--
-- Why this migration exists
-- -------------------------
-- Every credit function in this schema reads the balance the same way:
--
--     SELECT running_balance
--       FROM public.ai_credit_ledger
--      WHERE profile_id = p_profile_id
--      ORDER BY created_at DESC, id DESC
--      LIMIT 1;
--
-- That order is only as good as the column it sorts on, and `created_at` was
-- `DEFAULT now()`.
--
-- `now()` is the START OF THE TRANSACTION. Every row written by the same
-- transaction therefore carries the SAME timestamp, to the microsecond. And
-- `id` is `DEFAULT gen_random_uuid()` — a RANDOM value. So whenever one
-- transaction writes more than one ledger row, the "latest" row is chosen
-- between them by the coin toss of a random uuid.
--
-- The daily claim is exactly such a transaction. It writes the EXPIRY row for
-- yesterday's leftover tokens and the GRANT row for today, in that order, in
-- one transaction:
--
--     expire row : running_balance = (balance before today's grant) - expired
--     grant row  : running_balance = (balance before today's grant) + allowance
--
-- The reader then picks one of the two at random. Half of the time it picks
-- the expiry row, which is the balance as it stood BEFORE the day's tokens
-- arrived. The candidate's tokens were granted, the bucket holds them, the
-- ledger row is in the table — and the number the interface reports says they
-- are not there.
--
-- This is the mechanism behind the complaint that a paid account does not
-- receive its daily AI tokens: the tokens DO arrive, and on the days when the
-- claim also expires yesterday's leftovers, the balance that is read back is
-- the balance from before the grant. The failure is intermittent, which is
-- what makes it read as "sometimes the tokens do not show up".
--
-- The fix
-- --------
-- The rows are stamped in the order they are written, by a trigger that
-- guarantees each new row's `created_at` is strictly later than every row
-- already in the table. The balance read then names the last operation
-- without any ambiguity, and the `id DESC` tie-break is never reached.
--
-- Why a trigger rather than a sequence column
-- -------------------------------------------
-- A sequence column is the textbook answer to "order by insertion", but it
-- only helps if EVERY reader switches to it. There are eleven credit
-- functions in this schema that read the balance, several of them in the
-- payment path, and the server reads the balance through PostgREST with the
-- same order. Restating eleven functions that were written by others is a
-- large and risky change to the money path, and this migration does not have
-- to touch a single one of them: a trigger that keeps the EXISTING ordering
-- column honest repairs all of them at once.
--
-- Why the trigger does not merely use `clock_timestamp()`
-- ---------------------------------------------------
-- `clock_timestamp()` is the wall clock at the moment of the statement, which
-- is the right idea, but its resolution is not guaranteed to separate two
-- statements. On some builds it is a millisecond, and two inserts inside one
-- transaction easily share a millisecond — which is exactly the case that
-- needs separating. The trigger does not rely on the resolution at all: it
-- compares against the latest row already in the table and moves the stamp
-- forward by a microsecond when it has to. The result is a total order that
-- holds whatever the clock does.
--
-- What this migration does NOT change
-- -----------------------------------
--   * No row is inserted, updated or deleted. The change is a trigger and a
--     default; the existing history is untouched.
--   * No balance is overwritten. The values in `running_balance` are the same
--     values they were.
--   * No function body is restated. Not one of the eleven readers changes.
--   * The column stays `NOT NULL` with the same type. A caller that writes
--     `created_at` explicitly is still honoured, except that a stamp older
--     than the table's latest is moved forward — a ledger row that claims to
--     be older than the operation before it would break the very order this
--     migration is about.
--   * `now()` remains the meaning of "now" for everything else. Only the
--     ledger's stamp changes, and only so that it can order its own rows.
--
-- The concurrency argument
-- ------------------------
-- The credit functions take the account's advisory lock before they touch
-- the ledger, so two rows for the SAME account are never written at the same
-- time, and the second writer's statement sees the first writer's committed
-- row. Two accounts can be written at the same moment; their rows may share
-- a stamp, and that is harmless, because the balance of one account is never
-- ordered against the balance of another.
--
-- ---------------------------------------------------------------------------
-- 1. The stamp follows the wall clock
-- ---------------------------------------------------------------------------
--
-- The default becomes the moment of the statement rather than the moment the
-- transaction began. For a transaction that writes a single row the
-- difference is invisible; for one that writes two it is the difference
-- between one order and another.
ALTER TABLE public.ai_credit_ledger
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();

-- ---------------------------------------------------------------------------
-- 2. The stamp is strictly increasing
-- ---------------------------------------------------------------------------
--
-- A BEFORE INSERT trigger that puts every new row after every row that is
-- already in the table.
CREATE OR REPLACE FUNCTION public.careerpilot_ledger_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest timestamptz;
BEGIN
  -- The latest stamp already in the table. Inside one transaction the row
  -- that was inserted a moment ago is visible to this statement, so a second
  -- row in the same transaction is stamped after the first.
  SELECT max(l.created_at) INTO v_latest
    FROM public.ai_credit_ledger l;

  -- The stamp never moves backwards: it is the moment of the statement, and
  -- at least one microsecond after the row that came before it.
  NEW.created_at := GREATEST(
    COALESCE(NEW.created_at, clock_timestamp()),
    COALESCE(v_latest, '-infinity'::timestamptz) + interval '1 microsecond'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_credit_ledger_stamp ON public.ai_credit_ledger;

CREATE TRIGGER ai_credit_ledger_stamp
  BEFORE INSERT ON public.ai_credit_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_ledger_stamp();

-- The trigger looks the latest stamp up on every insert, so the lookup needs
-- an index of its own.
CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_created_at
  ON public.ai_credit_ledger (created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. A canonical read of the balance
-- ---------------------------------------------------------------------------
--
-- One place that says how the balance is read, so that a reader does not
-- have to repeat the order, and so that the order can be changed in one
-- place if it ever has to be. The credit functions keep their own read — the
-- trigger is what makes that read correct — and the server calls this
-- function, and so can anything else that needs the number.
--
-- SECURITY DEFINER with the read restricted to the service role: the balance
-- is the candidate's own money, and it is not readable by a signed-in
-- candidate directly.
CREATE OR REPLACE FUNCTION public.careerpilot_credit_balance(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT l.running_balance
      FROM public.ai_credit_ledger l
     WHERE l.profile_id = p_profile_id
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.careerpilot_credit_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careerpilot_credit_balance(uuid) TO service_role;
