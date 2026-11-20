/**
 * Applies one migration to the production database.
 * ---------------------------------------------------------------------------
 * The SQL is read from the repository's own file, so what runs is exactly
 * what was committed and tested. The Management API runs it over HTTPS as a
 * single statement batch, which Postgres runs in one transaction: if any
 * statement fails, nothing is left behind.
 *
 * The version is recorded in `supabase_migrations.schema_migrations` in the
 * same shape the Supabase CLI uses, so a later `db push` knows the file has
 * already been applied.
 *
 * WHY THIS EXISTS
 * The Supabase CLI applies migrations over a direct Postgres connection, and
 * that connection is IPv6 on this network — where IPv6 is not carried. The
 * CLI cannot open it, so the Management API is the way a migration reaches
 * the project from this machine. The token comes from the environment file
 * and is never printed.
 *
 * The file itself decides what runs. This script does not decide anything:
 * it applies the migration that is in the repository, and it records that it
 * was applied.
 *
 *   npx tsx scripts/apply-migration.mts <version> <name>
 *
 * For example:
 *
 *   npx tsx scripts/apply-migration.mts 20261128000001 plan_daily_ai_credits
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRef = 'ciihprsfdojzvjnqgbxl';
const [version, name] = process.argv.slice(2);

if (!version || !name) {
  console.error('Usage: apply-migration.mts <version> <name>');
  process.exit(1);
}

/** The access token, read from the environment file and never printed. */
function accessToken(): string {
  const env = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
  if (!match) throw new Error('the access token is not in .env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/** Runs SQL as the database's owner and returns what it returned. */
async function query(sql: string): Promise<unknown> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`the database refused the statement: ${response.status} ${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const file = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  `${version}_${name}.sql`
);
const sql = readFileSync(file, 'utf8');

console.log(`applying ${version}_${name}.sql (${sql.length} characters)`);

const outcome = await query(sql);
console.log('the statements ran:', JSON.stringify(outcome).slice(0, 400));

// The history: the version and the file's name, in the shape the Supabase
// CLI writes.
//
// The `statements` column is left empty on purpose. It is a copy of the SQL
// for an operator to read back, and the version and the name are what the
// CLI uses to decide what has already been applied.
await query(
  `insert into supabase_migrations.schema_migrations (version, name)
   values ('${version}', '${name}')
   on conflict (version) do nothing;`
);

const recorded = await query(
  `select version, name, array_length(statements, 1) as statements
     from supabase_migrations.schema_migrations
    where version = '${version}';`
);

console.log('recorded:', JSON.stringify(recorded));
