// Reports the PRESENCE and shape of the Stripe configuration without ever
// printing a secret value. Used to confirm which mode the integration is in.
import { existsSync, readFileSync } from 'fs';

const files = ['.env', '.env.test', '.env.production', '.dev.vars'].filter((f) => existsSync(f));

const KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_ALLOW_LIVE',
  'STRIPE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  console.log(`--- ${file} ---`);
  for (const key of KEYS) {
    const match = src.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (!match) {
      console.log(`${key}: ABSENT`);
      continue;
    }
    const value = match[1].trim().replace(/^["']/, '').replace(/["']$/, '');
    if (!value) {
      console.log(`${key}: PRESENT (empty)`);
      continue;
    }
    if (key === 'STRIPE_ALLOW_LIVE') {
      console.log(`${key}: value=${value}`);
    } else if (value.startsWith('sk_test_')) {
      console.log(`${key}: PRESENT (test secret key)`);
    } else if (value.startsWith('sk_live_')) {
      console.log(`${key}: PRESENT (LIVE secret key)`);
    } else if (value.startsWith('whsec_')) {
      console.log(`${key}: PRESENT (webhook signing secret)`);
    } else if (value.startsWith('pk_test_')) {
      console.log(`${key}: PRESENT (test publishable key)`);
    } else if (value.startsWith('pk_live_')) {
      console.log(`${key}: PRESENT (LIVE publishable key)`);
    } else if (value.startsWith('sb_')) {
      console.log(`${key}: PRESENT (publishable key)`);
    } else if (value.startsWith('http')) {
      console.log(`${key}: PRESENT (url)`);
    } else {
      console.log(`${key}: PRESENT`);
    }
  }
}
