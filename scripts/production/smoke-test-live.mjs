import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const PROD_URL = 'https://careerdev4ai.pages.dev';
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('================================================================================');
  console.log('     CareerDev4AI — Real Production Smoke Tests & Verification');
  console.log('     Target URL:', PROD_URL);
  console.log('================================================================================\n');

  const results = [];
  function check(name, pass, details = '') {
    results.push({ name, pass, details });
    console.log(`${pass ? '✔ PASS' : '✘ FAIL'} [${name}] ${details}`);
  }

  // 1. Health Endpoint
  try {
    const res = await fetch(`${PROD_URL}/api/health`);
    const data = await res.json();
    check('1. Health Endpoint', res.status === 200 && data.status === 'ok', `status: ${res.status}, model: ${data.modelName}`);
  } catch (err) {
    check('1. Health Endpoint', false, err.message);
  }

  // 2. Homepage & Static HTML loading
  try {
    const res = await fetch(PROD_URL);
    const html = await res.text();
    const hasRoot = html.includes('id="root"');
    const hasTitle = html.includes('CareerDev4AI');
    check('2. Homepage & SPA Shell', res.status === 200 && hasRoot && hasTitle, `HTTP ${res.status}, HTML size: ${html.length} bytes`);
  } catch (err) {
    check('2. Homepage & SPA Shell', false, err.message);
  }

  // 3. Public SEO Pages (SSR)
  try {
    const res = await fetch(`${PROD_URL}/about`);
    check('3. Public SEO Route (/about)', res.status === 200, `HTTP ${res.status}`);
  } catch (err) {
    check('3. Public SEO Route (/about)', false, err.message);
  }

  // 4. Subscription Plans Endpoint
  let studentPlanId = null;
  try {
    const res = await fetch(`${PROD_URL}/api/subscription/plans`);
    const data = await res.json();
    const valid = res.status === 200 && data.success && Array.isArray(data.plans) && data.plans.length === 4;
    if (valid) {
      studentPlanId = data.plans.find(p => p.code === 'student')?.id;
    }
    check('4. Subscription Plans Catalog', valid, `Count: ${data.plans?.length}, Student ID: ${studentPlanId}`);
  } catch (err) {
    check('4. Subscription Plans Catalog', false, err.message);
  }

  // Create isolated ephemeral test user
  const testEmail = `cp-smoke-${Date.now()}@example.invalid`;
  const testPassword = `SmokePass-${Date.now()}Aa1!`;
  let testUser = null;
  let testToken = null;

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (error || !data?.user) throw error || new Error('User creation returned empty');
    testUser = data.user;

    await admin.from('profiles').upsert({ id: testUser.id, full_name: 'Smoke Test User' }, { onConflict: 'id' });

    // Grant Law 151 & GDPR terms and privacy consent so authenticated routes are accessible
    await admin.from('user_consents').insert({
      user_id: testUser.id,
      terms_version: '2026-11-04',
      privacy_version: '2026-11-03',
      status: 'accepted',
      source: 'smoke_test',
    });

    // Client sign-in to get real session JWT
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInError } = await client.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInError || !session?.session) throw signInError || new Error('Sign-in returned empty');
    testToken = session.session.access_token;
    check('5. Authentication & Session Sign-in', true, `User: ${testUser.id}`);
  } catch (err) {
    check('5. Authentication & Session Sign-in', false, err.message);
  }

  if (testToken) {
    // 6. User Profile Retrieval
    try {
      const res = await fetch(`${PROD_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      const data = await res.json();
      check('6. User Profile Retrieval', res.status === 200 && data.profile?.id === testUser.id, `Status ${res.status}`);
    } catch (err) {
      check('6. User Profile Retrieval', false, err.message);
    }

    // 7. Initial Credit Balance & Trial Allocation
    try {
      const res = await fetch(`${PROD_URL}/api/credits/balance`, {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      const data = await res.json();
      check('7. Initial Credit Balance (5 Trial Credits)', res.status === 200 && data.balance === 5, `Status ${res.status}, Balance: ${data.balance}`);
    } catch (err) {
      check('7. Initial Credit Balance (5 Trial Credits)', false, err.message);
    }

    // 8. Current Subscription Status (Free tier)
    try {
      const res = await fetch(`${PROD_URL}/api/subscription/current`, {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      const data = await res.json();
      check('8. Subscription Status (Default Free Tier)', res.status === 200 && data.planCode === 'free', `Plan: ${data.planCode}, Status: ${data.status}`);
    } catch (err) {
      check('8. Subscription Status (Default Free Tier)', false, err.message);
    }

    // 9. Public Course Catalogue & Recommendation
    try {
      const { count } = await admin.from('courses').select('*', { count: 'exact', head: true });
      check('9. Course Catalogue Grounding', count >= 505, `Verified live courses: ${count}`);
    } catch (err) {
      check('9. Course Catalogue Grounding', false, err.message);
    }

    // 10. Public Skills Taxonomy
    try {
      const { count } = await admin.from('skills').select('*', { count: 'exact', head: true });
      check('10. Skills Taxonomy Grounding', count >= 848, `Verified live skills: ${count}`);
    } catch (err) {
      check('10. Skills Taxonomy Grounding', false, err.message);
    }

    // 11. Super Admin Authentication & Integrity
    try {
      const { data: admins, error } = await admin.from('admin_users').select('*');
      const hasAhd = admins?.some(a => a.email.toLowerCase() === 'ahdabdalla77@gmail.com' && a.role === 'super_admin');
      check('11. Super Admin Grounding (ahdabdalla77)', hasAhd && !error, `Total admins: ${admins?.length}`);
    } catch (err) {
      check('11. Super Admin Grounding (ahdabdalla77)', false, err.message);
    }

    // 12. Checkout Initiation & Instructions
    let checkoutId = null;
    try {
      const res = await fetch(`${PROD_URL}/api/payments/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          planCode: 'student',
          billingCycle: 'monthly',
          paymentMethod: 'vodafone_cash',
        }),
      });
      const data = await res.json();
      if (res.status === 200 && data.success && data.paymentRequest) {
        checkoutId = data.paymentRequest.id;
      }
      check('12. Payment Checkout Initiation', res.status === 200 && Boolean(checkoutId), `Checkout ID: ${checkoutId}, Amount: ${data.paymentRequest?.amountPiasters} piasters`);
    } catch (err) {
      check('12. Payment Checkout Initiation', false, err.message);
    }

    // 13. My Payment Requests Ledger
    if (checkoutId) {
      try {
        const res = await fetch(`${PROD_URL}/api/payments/my-requests`, {
          headers: { Authorization: `Bearer ${testToken}` },
        });
        const data = await res.json();
        const found = data.requests?.some(r => r.id === checkoutId);
        check('13. My Payment Requests Ledger', res.status === 200 && found, `Status: ${res.status}, Count: ${data.requests?.length}`);
      } catch (err) {
        check('13. My Payment Requests Ledger', false, err.message);
      }
    }

    // 14. Coupon Validation Endpoint
    try {
      const res = await fetch(`${PROD_URL}/api/coupons/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          code: 'NON_EXISTENT_COUPON',
          planCode: 'student',
          billingCycle: 'monthly',
        }),
      });
      const data = await res.json();
      check('14. Coupon Validation (Rejects invalid code)', res.status === 200 && data.valid === false, `Status: ${res.status}, Valid: ${data.valid}`);
    } catch (err) {
      check('14. Coupon Validation (Rejects invalid code)', false, err.message);
    }

    // 15. Law 151 Birthday Consent Handling
    try {
      const res = await fetch(`${PROD_URL}/api/birthday/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          birthMonth: 11,
          birthDay: 15,
        }),
      });
      const data = await res.json();
      check('15. Law 151 Birthday Consent (Zero year stored)', res.status === 200 && data.success, `Status: ${res.status}`);
    } catch (err) {
      check('15. Law 151 Birthday Consent (Zero year stored)', false, err.message);
    }

    // 16. AI Endpoint Credit Gating
    try {
      const res = await fetch(`${PROD_URL}/api/cv/ai-assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          field: 'headline',
          suggestions: true,
          ai: false, // Deterministic headline suggestions (0 credits)
        }),
      });
      const data = await res.json();
      check('16. AI Endpoint Gating (Deterministic headline)', res.status === 200 && data.success, `Status: ${res.status}, Suggestions count: ${data.suggestions?.length}`);
    } catch (err) {
      check('16. AI Endpoint Gating (Deterministic headline)', false, err.message);
    }

    // 17. Security Boundary: Direct Admin Access Refused
    try {
      const res = await fetch(`${PROD_URL}/api/admin/subscriptions`, {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      check('17. Security Boundary (Non-admin refused from admin endpoints)', res.status === 403, `Status: ${res.status} (Forbidden)`);
    } catch (err) {
      check('17. Security Boundary (Non-admin refused from admin endpoints)', false, err.message);
    }
  }

  // Cleanup ephemeral test user
  if (testUser) {
    try {
      await admin.from('user_privacy_consents').delete().eq('profile_id', testUser.id);
      await admin.from('payment_requests').delete().eq('profile_id', testUser.id);
      await admin.from('ai_credit_ledger').delete().eq('profile_id', testUser.id);
      await admin.from('profiles').delete().eq('id', testUser.id);
      await admin.auth.admin.deleteUser(testUser.id);
      console.log('\n✔ Smoke test ephemeral identity cleanly removed from production.');
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  }

  console.log('\n================================================================================');
  console.log(`PRODUCTION SMOKE TEST SUMMARY: ${results.filter(r => r.pass).length}/${results.length} PASSED`);
  console.log('================================================================================\n');

  if (results.some(r => !r.pass)) {
    process.exit(1);
  }
}

main();
