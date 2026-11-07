// Checks the reported credit balance against the ledger, on the live database.
//
// It creates an ordinary account, reads the balance twice, and compares what
// the interface reports with what the ledger actually holds.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].trim().replace(/^["']/, '').replace(/["']$/, '');
}

// The server modules read the environment from `process.env`, so the values
// have to be published there, not only held in a local object.
for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `cd4-bal-${Date.now().toString(36)}@example.invalid`;
const created = await admin.auth.admin.createUser({
  email,
  password: 'Pr0be!Passw0rd!23',
  email_confirm: true,
});

const { getCreditBalance } = await import('../server/db/credits.ts');

try {
  const first = await getCreditBalance(created.data.user.id);
  const second = await getCreditBalance(created.data.user.id);

  const { data: ledger } = await admin
    .from('ai_credit_ledger')
    .select('operation, amount, running_balance, source_type')
    .eq('profile_id', created.data.user.id)
    .order('created_at');

  const ledgerBalance = ledger?.[ledger.length - 1]?.running_balance ?? 0;

  console.log('reported balance (first read) :', first.balance);
  console.log('reported balance (second read):', second.balance);
  console.log('ledger running_balance        :', ledgerBalance);
  console.log('daily allowance               :', JSON.stringify(first.daily));
  console.log('');
  console.log(
    first.balance === ledgerBalance && second.balance === ledgerBalance
      ? 'MATCH: the reported balance is the ledger balance.'
      : 'MISMATCH: the reported balance is not the ledger balance.'
  );
  console.log('ledger rows:', JSON.stringify(ledger));
} finally {
  await admin.auth.admin.deleteUser(created.data.user.id);
}
