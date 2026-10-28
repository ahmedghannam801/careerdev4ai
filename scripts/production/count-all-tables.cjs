/** Prints the production row counts, straight from the database. */

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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function main() {
  const tables = await query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  const out = [];
  for (const table of tables) {
    const name = table.tablename;
    try {
      const rows = await query(
        `SELECT count(*)::int AS n FROM public."${name.replace(/"/g, '""')}"`
      );
      out.push({ table: name, rows: rows[0].n });
    } catch (error) {
      out.push({ table: name, rows: `error: ${String(error.message).slice(0, 60)}` });
    }
  }
  out.sort((a, b) => (typeof b.rows === 'number' ? b.rows : -1) - (typeof a.rows === 'number' ? a.rows : -1));
  console.log('table'.padEnd(38) + 'rows');
  console.log('-'.repeat(48));
  for (const row of out) {
    console.log(row.table.padEnd(38) + String(row.rows).padStart(10));
  }
  console.log(`\n${out.length} tables`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
