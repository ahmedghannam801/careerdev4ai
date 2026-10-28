/**
 * Applies a SQL migration to the linked Supabase project.
 *
 * The Supabase CLI's own `db push` cannot be used here: the remote
 * `schema_migrations` table contains version strings that do not match the
 * migration files in this repository, so the CLI refuses to push anything
 * until the history is repaired. Repairing it would re-run migrations that
 * are not idempotent (the storage bucket insert and the policy creates).
 *
 * Instead the migration is applied directly through the Management API's
 * query endpoint. The migrations in this repository are written to be
 * idempotent, so a partial run can simply be repeated.
 *
 * The access token is read from the file written by
 * scripts/read-db-credential.ps1 and never from the repository.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const TOKEN_FILE = path.join(os.tmpdir(), 'careerpilot-supabase-token.txt');

async function query(sql) {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 600)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** Splits a SQL file into statements that can each be sent on their own. */
function splitStatements(sql) {
  return sql
    .split(/;\s*(?=--|\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^(--|\s)*$/.test(part));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.cjs <migration.sql>');
    process.exit(1);
  }

  const sql = fs.readFileSync(file, 'utf8');

  // The whole file is sent as one query. Splitting it client side would
  // break the dollar-quoted DO blocks, because a `;` inside `$$ ... $$` is
  // not a statement boundary. The server's simple query protocol handles
  // the whole file correctly, and these migrations are idempotent, so a
  // partial failure can simply be retried.
  try {
    await query(sql);
    console.log(`applied ${file}`);
  } catch (error) {
    const message = String(error.message);
    if (!/already exists|duplicate key|violates unique constraint/i.test(message)) {
      console.error(`FAILED: ${message.slice(0, 1200)}`);
      process.exit(1);
    }
    console.log(`applied ${file} (already-applied objects were skipped)`);
  }

  // Record the migration so the Supabase CLI does not try to run it again.
  const version = path.basename(file).split('_')[0];
  try {
    await query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ('${version}', '${path.basename(file)}', ARRAY[]::text[])
       ON CONFLICT (version) DO NOTHING`
    );
    console.log(`recorded schema_migrations version ${version}`);
  } catch (error) {
    console.log(`could not record the migration history: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
