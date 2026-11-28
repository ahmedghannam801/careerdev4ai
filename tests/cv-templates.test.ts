/**
 * The CV template library, against the running API.
 *
 * The catalogue and the rendering are proved in `cv-template-library.test.ts`,
 * which needs no database. This file proves the rule that is actually enforced
 * where it matters: the API. The platform is free, so EVERY template belongs to
 * EVERY candidate — a template may not be locked, priced or refused, not even
 * when the API is called directly.
 *
 * The history is still there and it still says what it says, but it no longer
 * decides anything: a candidate whose subscription lapsed keeps the whole
 * library, exactly like a candidate who never had one.
 *
 * These tests need a disposable Supabase project. Point
 * SUPABASE_TEST_PROJECT_REF at one before running them.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { FREE_CV_TEMPLATE_ID } from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';

/**
 * A complete CV, used by the export tests.
 *
 * The export is the one thing that must carry the candidate's facts all the
 * way into a file, so the tests export a real CV rather than an empty shape.
 */
const sampleEn = cvTemplateSample('en');

/* -------------------------------------------------------------------------- */
/* Access control — the API                                                    */
/* -------------------------------------------------------------------------- */

let candidate: TestUser;
let otherUser: TestUser;

/**
 * The balance the candidate sees.
 *
 * This is the number the API reports, which is the number the interface shows
 * and the number a charge is checked against. It is read from the API on
 * purpose: the platform holds the balance in the ledger AND in the daily
 * allowance bucket, and a reader that looked at the ledger alone would be
 * reading a different number from the one the product uses.
 */
async function apiBalance(token: string): Promise<number> {
  const res = await api('GET', '/api/credits/balance', { token });
  assert.equal(res.status, 200);
  return res.body?.balance as number;
}

/**
 * The ledger rows that would record a premium template purchase.
 *
 * A purchase is a `consume` of the stated price with the action that names
 * it, so the money can be traced from the ledger to the template it bought.
 * While the platform is free there must never be such a row.
 */
async function unlockLedgerRows(profileId: string): Promise<Array<{ amount: number }>> {
  const { data } = await admin
    .from('ai_credit_ledger')
    .select('amount, operation, ai_action_type')
    .eq('profile_id', profileId)
    .eq('ai_action_type', 'premium_template_unlock');
  return (data ?? []) as Array<{ amount: number }>;
}

/**
 * Gives a candidate credits, the way the ledger records a grant.
 *
 * The grant is written with the same columns the platform uses, so the balance
 * the server reads afterwards is the balance this test believes it granted.
 * The platform is free, so a credit balance must not change what a candidate
 * may do — this helper exists to PROVE that, not to buy anything.
 */
async function grantCredits(
  profileId: string,
  amount: number,
  idempotencyKey: string
): Promise<void> {
  const { data: latest } = await admin
    .from('ai_credit_ledger')
    .select('running_balance')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from('ai_credit_ledger').insert({
    profile_id: profileId,
    operation: 'grant',
    amount,
    running_balance: (latest?.running_balance ?? 0) + amount,
    source_type: 'admin',
    ai_action_type: null,
    idempotency_key: idempotencyKey,
    description: 'Test harness credit grant',
  });
  assert.equal(error, null, `the credit grant must succeed: ${error?.message ?? ''}`);
}

before(async () => {
  candidate = await createTestUser('cvtpl-candidate', { subscription: false });
  otherUser = await createTestUser('cvtpl-other', { subscription: false });
});

after(async () => {
  await deleteTestUser(candidate);
  await deleteTestUser(otherUser);
});

describe('the template API', () => {
  test('the catalogue requires a session', async () => {
    const res = await apiAnonymous('GET', '/api/cv-templates');
    assert.equal(res.status, 401);
  });

  test('it answers with the whole library and a decision for each template', async () => {
    const res = await api('GET', '/api/cv-templates', { token: candidate.token });
    assert.equal(res.status, 200);
    assert.ok(res.body?.templates?.length >= 30, 'the candidate sees the whole library');
    for (const template of res.body?.templates ?? []) {
      assert.ok(template.access, `${template.id} must carry an access decision`);
      assert.equal(typeof template.access.allowed, 'boolean');
    }
    const free = res.body.templates.find((t: any) => t.id === FREE_CV_TEMPLATE_ID);
    assert.equal(free?.access.allowed, true, 'the free template is always available');
  });

  test('the platform is free, so the catalogue says so', async () => {
    const res = await api('GET', '/api/cv-templates', { token: candidate.token });
    assert.equal(res.status, 200);
    assert.equal(
      res.body?.enforcementEnabled,
      false,
      'the premium-template enforcement must be switched off while the platform is free'
    );
  });

  test('every template in the library is available to every candidate', async () => {
    const res = await api('GET', '/api/cv-templates', { token: candidate.token });
    assert.equal(res.status, 200);

    for (const template of res.body?.templates ?? []) {
      assert.equal(
        template.access?.allowed,
        true,
        `${template.id} must be available to every candidate while the platform is free`
      );
      assert.equal(
        template.access?.canUnlockWithCredits,
        false,
        `${template.id} must not be something a candidate can still have to pay for`
      );
      assert.equal(
        template.access?.unlockCredits,
        0,
        `${template.id} must not carry a price`
      );
    }
  });

  test('the catalogue carries the layout of every template, free or not', async () => {
    const res = await api('GET', '/api/cv-templates', { token: candidate.token });
    assert.equal(res.status, 200);

    const freeTemplate = res.body.templates.find((t: any) => t.id === FREE_CV_TEMPLATE_ID);
    const premiumTemplate = res.body.templates.find((t: any) => t.id !== FREE_CV_TEMPLATE_ID);

    assert.ok(freeTemplate, 'the catalogue holds the free template');
    assert.ok(freeTemplate.structure, 'a template the candidate may use carries its layout');
    assert.ok(premiumTemplate, 'the catalogue holds a template that used to be paid for');
    assert.ok(
      premiumTemplate.structure,
      'the layout of every template must reach the browser — looking at a template is free'
    );
    assert.ok(
      premiumTemplate.name,
      'every template is still shown — the candidate can see what it is'
    );
  });

  test('the preview of every template is allowed', async () => {
    const allowed = await api('GET', `/api/cv-templates/${FREE_CV_TEMPLATE_ID}/preview`, {
      token: candidate.token,
    });
    assert.equal(allowed.status, 200);
    assert.ok(allowed.body?.structure, 'the layout is handed over for a free template');

    // A template that used to be paid for is no longer hidden behind a price.
    const premium = await api('GET', '/api/cv-templates/modern-gradient/preview', {
      token: candidate.token,
    });
    assert.equal(premium.status, 200, 'the preview of every template must be allowed');
    assert.ok(premium.body?.structure, 'the layout of every template is handed over too');
    assert.equal(
      premium.body?.access?.allowed,
      true,
      'every template may be used, not only looked at'
    );
  });

  test('a candidate may apply any template', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: candidate.token,
      body: { templateId: 'modern-gradient' },
    });
    assert.equal(res.status, 200, 'the server must not refuse a template while the platform is free');
    assert.equal(res.body?.templateId, 'modern-gradient');
    assert.equal(res.body?.access?.allowed, true);
  });

  test('a refusal never names a price, because there is no price', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: candidate.token,
      body: { templateId: 'modern-gradient' },
    });
    assert.equal(res.status, 200);
    assert.notEqual(res.body?.code, 'UPGRADE_REQUIRED');
    assert.equal(res.body?.requiredCredits, undefined);
  });

  test('the choice is written to the account', async () => {
    await api('POST', '/api/cv-templates/apply', {
      token: candidate.token,
      body: { templateId: 'technical-data' },
    });
    const { data } = await admin
      .from('user_preferences')
      .select('cv_template_id')
      .eq('user_id', candidate.id)
      .maybeSingle();
    assert.equal(data?.cv_template_id, 'technical-data');
  });

  test('changing the template never changes the CV', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: candidate.token,
      body: { name: 'Template switching CV', targetRoleTitle: 'Data Analyst' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body?.cv?.id as string;

    const before = await api('GET', `/api/cvs/${cvId}`, { token: candidate.token });
    assert.equal(before.status, 200);
    const beforeJson = JSON.stringify(before.body?.cv);

    for (const templateId of ['ats-classic', 'technical-data', 'creative-studio']) {
      const applied = await api('POST', '/api/cv-templates/apply', {
        token: candidate.token,
        body: { templateId },
      });
      assert.equal(applied.status, 200, `applying ${templateId} must succeed`);
    }

    const after = await api('GET', `/api/cvs/${cvId}`, { token: candidate.token });
    assert.equal(after.status, 200);
    assert.equal(
      JSON.stringify(after.body?.cv),
      beforeJson,
      'the CV must be byte-identical after three template changes'
    );
  });

  test('an expired subscription does not take the library away', async () => {
    // Its own candidate: the expiry must not disturb the candidate the other
    // tests rely on.
    const expiring = await createTestUser('cvtpl-expired', {
      subscription: true,
      planCode: 'pro',
    });
    try {
      const { data: subscription } = await admin
        .from('subscriptions')
        .select('id')
        .eq('profile_id', expiring.id)
        .maybeSingle();
      assert.ok(subscription?.id, 'the harness provisions an active subscription');

      // The subscription is moved into the past as a whole: the period must
      // still end after it starts, or the row would not be storable.
      await admin
        .from('subscriptions')
        .update({
          status: 'expired',
          current_period_starts_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
          current_period_ends_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        })
        .eq('id', subscription!.id);

      const res = await api('POST', '/api/cv-templates/apply', {
        token: expiring.token,
        body: { templateId: 'executive-board' },
      });
      assert.equal(res.status, 200, 'the library belongs to the candidate, not to the subscription');
    } finally {
      await deleteTestUser(expiring);
    }
  });

  test('a cancelled subscription does not take the library away either', async () => {
    const cancelled = await createTestUser('cvtpl-cancelled', {
      subscription: true,
      planCode: 'pro',
    });
    try {
      const { data: subscription } = await admin
        .from('subscriptions')
        .select('id')
        .eq('profile_id', cancelled.id)
        .maybeSingle();
      await admin
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', subscription!.id);

      const res = await api('POST', '/api/cv-templates/apply', {
        token: cancelled.token,
        body: { templateId: 'executive-board' },
      });
      assert.equal(res.status, 200, 'a cancelled subscription changes nothing while the platform is free');
    } finally {
      await deleteTestUser(cancelled);
    }
  });

  test('the export needs the server to say yes', async () => {
    const allowed = await api('GET', '/api/cv-templates/modern-gradient/export/authorize', {
      token: candidate.token,
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body?.allowed, true);
  });

  test('a candidate can export the free template as an editable document', async () => {
    const res = await fetch(
      `${process.env.TEST_API_BASE_URL}/api/cv-templates/${FREE_CV_TEMPLATE_ID}/export/docx`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.token}`,
        },
        body: JSON.stringify({ cv: sampleEn, language: 'en' }),
      }
    );
    assert.equal(res.status, 200, 'the free template must be exportable without a plan');
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 1000, 'the exported file must not be empty');
    // A DOCX is a zip: the readable text lives in word/document.xml, and the
    // file must not be a picture of the CV.
    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK');
    const text = buffer.toString('latin1');
    assert.ok(text.includes('word/document.xml'), 'the file must be a real Word document');
    assert.ok(!text.includes('word/media/'), 'the CV must not be rasterised into an image');
  });

  test('a candidate can export every template, the ones that used to be paid for included', async () => {
    const res = await api('POST', '/api/cv-templates/modern-gradient/export/docx', {
      token: candidate.token,
      body: { cv: sampleEn, language: 'en' },
    });
    assert.equal(res.status, 200, 'no template may be refused an export while the platform is free');
    assert.notEqual(res.body?.code, 'UPGRADE_REQUIRED');
  });

  test("a candidate cannot export somebody else's CV", async () => {
    const cv = await api('POST', '/api/cvs', {
      token: otherUser.token,
      body: { name: 'Private CV' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body?.cv?.id as string;

    const res = await api('POST', `/api/cv-templates/${FREE_CV_TEMPLATE_ID}/export/docx`, {
      token: candidate.token,
      body: { cvId },
    });
    assert.equal(
      res.status,
      404,
      "another candidate's CV must be answered exactly like a missing one"
    );
  });

  test('the template administration is closed to ordinary candidates', async () => {
    const anonymous = await apiAnonymous('GET', '/api/admin/cv-templates');
    assert.equal(anonymous.status, 401);

    const ordinary = await api('GET', '/api/admin/cv-templates', { token: candidate.token });
    assert.ok(
      ordinary.status === 403 || ordinary.status === 404,
      `an ordinary candidate must not reach the template administration, got ${ordinary.status}`
    );

    const write = await api('POST', '/api/admin/cv-templates', {
      token: candidate.token,
      body: { templateId: 'smuggled-template', baseTemplateId: 'ats-classic' },
    });
    assert.ok(
      write.status === 403 || write.status === 404,
      `an ordinary candidate must not create a template, got ${write.status}`
    );
  });

  test('an unknown template is refused', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: candidate.token,
      body: { templateId: 'does-not-exist' },
    });
    assert.equal(res.status, 404);
  });
});

/* -------------------------------------------------------------------------- */
/* The unlock route — it must never charge anybody                              */
/* -------------------------------------------------------------------------- */

describe('unlocking a template', () => {
  test('it succeeds and charges nothing', async () => {
    const buyer = await createTestUser('cvtpl-buyer', { subscription: false });
    try {
      await grantCredits(buyer.id, 50, `cvtpl-unlock-${buyer.id}`);
      const before = await apiBalance(buyer.token);

      const res = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: buyer.token,
      });
      assert.equal(res.status, 200, 'the unlock must succeed');
      assert.equal(res.body?.success, true);
      assert.equal(res.body?.templateId, 'modern-gradient');
      assert.equal(
        res.body?.creditsCharged,
        0,
        'the platform is free: a template may never cost credits'
      );

      // The balance really did not move, and no ledger row records a purchase.
      assert.equal(await apiBalance(buyer.token), before, 'no credits may be taken');
      assert.equal(
        (await unlockLedgerRows(buyer.id)).length,
        0,
        'a free template must never be written to the ledger as a purchase'
      );
    } finally {
      await deleteTestUser(buyer);
    }
  });

  test('a candidate with no credits at all is not refused', async () => {
    const buyer = await createTestUser('cvtpl-poor', { subscription: false });
    try {
      const before = await apiBalance(buyer.token);

      const res = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: buyer.token,
      });
      assert.equal(res.status, 200, 'a balance of nothing must not refuse a free template');
      assert.equal(res.body?.creditsCharged, 0);
      assert.equal(await apiBalance(buyer.token), before, 'no credits may be taken');
      assert.equal((await unlockLedgerRows(buyer.id)).length, 0);
    } finally {
      await deleteTestUser(buyer);
    }
  });

  test('the template it selected can then be applied and exported', async () => {
    const buyer = await createTestUser('cvtpl-buyer2', { subscription: false });
    try {
      const unlocked = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: buyer.token,
      });
      assert.equal(unlocked.status, 200);

      const applied = await api('POST', '/api/cv-templates/apply', {
        token: buyer.token,
        body: { templateId: 'modern-gradient' },
      });
      assert.equal(applied.status, 200, 'the template is one the candidate may use');
      assert.equal(applied.body?.access?.allowed, true);

      const exportAuthorized = await api(
        'GET',
        '/api/cv-templates/modern-gradient/export/authorize',
        { token: buyer.token }
      );
      assert.equal(exportAuthorized.status, 200, 'the export must be allowed');
      assert.equal(exportAuthorized.body?.allowed, true);
    } finally {
      await deleteTestUser(buyer);
    }
  });

  test('unlocking twice costs nothing either time', async () => {
    const buyer = await createTestUser('cvtpl-buyer3', { subscription: false });
    try {
      await grantCredits(buyer.id, 50, `cvtpl-unlock3-${buyer.id}`);

      const first = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: buyer.token,
      });
      assert.equal(first.status, 200);
      assert.equal(first.body?.creditsCharged, 0);

      const afterFirst = await apiBalance(buyer.token);

      const second = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: buyer.token,
      });
      assert.equal(second.status, 200);
      assert.equal(second.body?.creditsCharged, 0);
      assert.equal(
        await apiBalance(buyer.token),
        afterFirst,
        'the balance must not have moved'
      );
      assert.equal(
        (await unlockLedgerRows(buyer.id)).length,
        0,
        'no purchase may be written to the ledger at all'
      );
    } finally {
      await deleteTestUser(buyer);
    }
  });

  test('the unlock needs a session', async () => {
    const res = await apiAnonymous('POST', '/api/cv-templates/modern-gradient/unlock');
    assert.equal(res.status, 401);
  });
});
