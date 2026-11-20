/**
 * Reads the live interview table back out of the production database.
 *
 * The migration is only really done when the table exists, the policies are
 * in place, and there is no audio column anywhere in it. This script proves
 * those three things against the live project.
 *
 *   npx tsx scripts/verify-live-interview-table.mts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRef = 'ciihprsfdojzvjnqgbxl';

function accessToken(): string {
  const env = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
  if (!match) throw new Error('the access token is not in .env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

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
  if (!response.ok) throw new Error(`the database refused: ${response.status} ${body}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const columns = await query(
  `select column_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'live_interview_sessions'
    order by column_name;`
);
console.log('columns:', JSON.stringify(columns));

const policies = await query(
  `select policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = 'live_interview_sessions'
    order by policyname;`
);
console.log('policies:', JSON.stringify(policies));

const rls = await query(
  `select relrowsecurity, relforcerowsecurity from pg_class
    where oid = 'public.live_interview_sessions'::regclass;`
);
console.log('rls:', JSON.stringify(rls));

const audio = await query(
  `select count(*)::int as audio_columns from information_schema.columns
    where table_schema = 'public' and table_name = 'live_interview_sessions'
      and column_name ~* 'audio|recording|blob';`
);
console.log('audio columns:', JSON.stringify(audio));

const rows = await query(`select count(*)::int as rows from public.live_interview_sessions;`);
console.log('rows:', JSON.stringify(rows));
