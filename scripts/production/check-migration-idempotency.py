"""Report non-idempotent statements in the SQL migrations.

A migration can safely be re-applied only if every statement is guarded. This
scans for the statements that would fail on a second run: adding a column
that already exists, creating an index that already exists, inserting rows
that are already there, and so on.

Used before touching the remote migration history, where a re-run is part of
the recovery path.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))

# Patterns that are safe to re-run.
SAFE = [
    r"CREATE TABLE IF NOT EXISTS",
    r"CREATE INDEX IF NOT EXISTS",
    r"CREATE UNIQUE INDEX IF NOT EXISTS",
    r"CREATE OR REPLACE VIEW",
    r"CREATE OR REPLACE FUNCTION",
    r"DROP POLICY IF EXISTS",
    r"DROP TABLE IF EXISTS",
    r"DROP INDEX IF EXISTS",
    r"DROP CONSTRAINT IF EXISTS",
    r"ALTER TABLE .* ADD COLUMN IF NOT EXISTS",
    r"INSERT INTO .* ON CONFLICT",
    r"DO \$\$",
    r"BEGIN",
    r"COMMIT",
    r"--",
]

RISKY = [
    (r"^\s*CREATE TABLE\b(?!.*IF NOT EXISTS)", "CREATE TABLE without IF NOT EXISTS"),
    (r"^\s*CREATE (UNIQUE )?INDEX\b(?!.*IF NOT EXISTS)", "CREATE INDEX without IF NOT EXISTS"),
    (r"^\s*CREATE POLICY\b", "CREATE POLICY without a DROP first"),
    (r"^\s*INSERT INTO\b(?!.*ON CONFLICT)", "INSERT without ON CONFLICT"),
    (r"^\s*ALTER TABLE .* ADD COLUMN\b(?!.*IF NOT EXISTS)", "ADD COLUMN without IF NOT EXISTS"),
    (r"^\s*ALTER TABLE .* ADD CONSTRAINT\b", "ADD CONSTRAINT"),
    (r"^\s*ALTER TABLE .* RENAME\b", "RENAME"),
    (r"^\s*DROP TABLE\b(?!.*IF EXISTS)", "DROP TABLE without IF EXISTS"),
    (r"^\s*UPDATE \w+", "UPDATE"),
    (r"^\s*DELETE FROM", "DELETE"),
]

total_risky = 0
for path in MIGRATIONS:
    text = path.read_text(encoding="utf-8")
    # Strip comments so commented-out SQL is not counted.
    body = re.sub(r"--[^\n]*", "", text)
    risky: list[str] = []
    for statement in body.split(";"):
        stripped = statement.strip()
        if not stripped:
            continue
        if any(re.search(pattern, stripped, re.I) for pattern in SAFE):
            continue
        for pattern, label in RISKY:
            if re.search(pattern, stripped, re.I | re.M):
                risky.append(f"{label}: {stripped[:110].replace(chr(10), ' ')}")
                break
    if risky:
        total_risky += len(risky)
        print(f"\n=== {path.name} ({len(risky)}) ===")
        for item in risky[:14]:
            print("   ", item)
        if len(risky) > 14:
            print(f"    ... and {len(risky) - 14} more")

print(f"\ntotal risky statements: {total_risky}")
sys.exit(0)
