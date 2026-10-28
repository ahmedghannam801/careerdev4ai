"""Validate the volunteer opportunities seed against the real catalogue.

Reads:
  shared/roles/*.ts          -> valid role slugs and skill names
  shared/careerDomains.ts    -> valid domain slugs
  supabase/migrations/202610270001_personalization_core.sql -> the seed rows

Reports every role slug, domain slug and skill name in the seed that does not
exist in the catalogue. Those entries are dead weight: the relevance scorer
would never match them, so the opportunity would silently lose relevance for
the roles it was meant to serve.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202610270001_personalization_core.sql"

role_ids = set()
skill_names = set()
for path in sorted((ROOT / "shared" / "roles").glob("*.ts")):
    text = path.read_text(encoding="utf-8")
    role_ids.update(re.findall(r"^\s+id: '([a-z0-9-]+)',", text, re.M))
    skill_names.update(re.findall(r"name: '([^']+)', category:", text))
    skill_names.update(re.findall(r"\{ name: '([^']+)', category:", text))

domains_text = (ROOT / "shared" / "careerDomains.ts").read_text(encoding="utf-8")
block = re.search(r"export type CareerDomainId\s*=\s*(.*?);", domains_text, re.S)
domain_ids = set(re.findall(r"'([^']+)'", block.group(1))) if block else set()

sql = MIGRATION.read_text(encoding="utf-8")

# Each seeded row is a parenthesised tuple; arrays are ARRAY['a','b'].
rows = re.findall(r"\(\s*'([a-z0-9-]+)',.*?\n\)", sql, re.S)

problems = []

def check_array(row_id, column, values, vocabulary, label):
    for value in values:
        if value not in vocabulary:
            problems.append((row_id, column, value, label))

# Only look at the seed section, not at the CREATE TABLE statements above it.
seed_sql = sql[sql.index("INSERT INTO public.volunteer_opportunities"):]
row_ids = re.findall(r"^\(\s*'([a-z0-9-]+)',", seed_sql, re.M)

for row_id in row_ids:
    # Locate the chunk for this row by its id.
    start = seed_sql.index(f"'{row_id}',")
    chunk = seed_sql[start:start + 3000]

    role_match = re.search(r"role_slugs\s*,\s*\n\s*domain_ids", chunk)
    # role_slugs is the 12th column; grab the array literal before domain_ids.
    arrays = re.findall(r"ARRAY\[([^\]]*)\]", chunk)
    # order within the row: skills_gained, required_skills, role_slugs, domain_ids
    if len(arrays) >= 4:
        def items(raw):
            return [v.strip().strip("'") for v in raw.split(",") if v.strip()]

        check_array(row_id, "skills_gained", items(arrays[0]), skill_names, "skill")
        check_array(row_id, "required_skills", items(arrays[1]), skill_names, "skill")
        check_array(row_id, "role_slugs", items(arrays[2]), role_ids, "role")
        check_array(row_id, "domain_ids", items(arrays[3]), domain_ids, "domain")

print(f"catalogue: {len(role_ids)} roles, {len(domain_ids)} domains, {len(skill_names)} skills")
print(f"seed rows: {len(row_ids)}")

if not problems:
    print("OK - every seeded slug and skill name exists in the catalogue")
    sys.exit(0)

print(f"\n{len(problems)} invalid entries:")
for row_id, column, value, label in problems:
    print(f"  {row_id:<36} {column:<16} {value:<38} (not a catalogue {label})")

sys.exit(1)
