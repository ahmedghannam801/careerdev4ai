/**
 * The CV template library: its catalogue, its access rules and its exports.
 *
 * The product claim behind this feature is that the library is a real design
 * collection rather than one template recoloured thirty-five times. That claim
 * is only worth anything if it is checked, so the first half of this file
 * proves it three ways:
 *
 *   - STRUCTURALLY: no two templates describe the same document. The signature
 *     ignores colour and typography on purpose, because those are decoration.
 *   - VISUALLY: no two templates render the same document. Two templates that
 *     produce byte-identical markup are the same template whatever the
 *     catalogue says, so the markup itself is compared.
 *   - COMPLETELY: every template carries the candidate's facts. Changing the
 *     template changes the presentation; it must never lose a line of the CV.
 *
 * The second half is the access control, against the running API. A candidate
 * without an active paid plan must not be able to apply, preview-export or
 * download a premium template — including by calling the API directly, which is
 * the only place the rule is actually enforced.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  CV_TEMPLATES,
  CV_TEMPLATE_CATEGORIES,
  FREE_CV_TEMPLATE_ID,
  cvTemplateStructuralSignature,
  isCvTemplatePremiumEnforcementEnabled,
  resolveCvTemplateAccess,
  type CvTemplateDefinition,
} from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvTemplateDocument } from '../shared/cvTemplateDocument.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const sampleEn = cvTemplateSample('en');
const sampleAr = cvTemplateSample('ar');

function renderTemplate(template: CvTemplateDefinition, language: 'en' | 'ar'): string {
  return renderToStaticMarkup(
    React.createElement(CvTemplateRenderer, {
      cv: language === 'ar' ? sampleAr : sampleEn,
      language,
      template,
      printable: false,
    })
  );
}

const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

/** The markup escapes a heading; the check compares what the candidate reads. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* -------------------------------------------------------------------------- */
/* The catalogue                                                               */
/* -------------------------------------------------------------------------- */

describe('the template catalogue', () => {
  test('it holds at least thirty templates', () => {
    assert.ok(
      CV_TEMPLATES.length >= 30,
      `the library must ship at least 30 templates, found ${CV_TEMPLATES.length}`
    );
  });

  test('exactly one template is free, and it is the ATS one', () => {
    const free = CV_TEMPLATES.filter((template) => template.tier === 'free');
    assert.equal(free.length, 1, 'there must be exactly one free template');
    assert.equal(free[0].id, FREE_CV_TEMPLATE_ID);
    assert.equal(
      free[0].atsFriendly,
      true,
      'the free template must be ATS-friendly: it is the one every candidate can reach'
    );
    assert.equal(free[0].supportsRtl, true, 'the free template must support Arabic');
  });

  test('every other template is premium', () => {
    for (const template of CV_TEMPLATES) {
      if (template.id === FREE_CV_TEMPLATE_ID) continue;
      assert.equal(
        template.tier,
        'premium',
        `${template.id} must require a paid plan`
      );
    }
  });

  test('no two templates share a structure', () => {
    const signatures = new Map<string, string[]>();
    for (const template of CV_TEMPLATES) {
      const signature = cvTemplateStructuralSignature(template.structure);
      const list = signatures.get(signature) ?? [];
      list.push(template.id);
      signatures.set(signature, list);
    }
    const duplicates = [...signatures.values()].filter((ids) => ids.length > 1);
    assert.deepEqual(
      duplicates,
      [],
      `these templates are structurally identical: ${duplicates.map((d) => d.join(' = ')).join(', ')}`
    );
  });

  test('no two templates render the same document', () => {
    for (const language of ['en', 'ar'] as const) {
      const rendered = new Map<string, string[]>();
      for (const template of CV_TEMPLATES) {
        const key = hash(renderTemplate(template, language));
        const list = rendered.get(key) ?? [];
        list.push(template.id);
        rendered.set(key, list);
      }
      const duplicates = [...rendered.values()].filter((ids) => ids.length > 1);
      assert.deepEqual(
        duplicates,
        [],
        `these templates render identically in ${language}: ${duplicates
          .map((d) => d.join(' = '))
          .join(', ')}`
      );
    }
  });

  test('the library spans the required categories and audiences', () => {
    const byCategory = new Map<string, number>();
    for (const template of CV_TEMPLATES) {
      byCategory.set(template.category, (byCategory.get(template.category) ?? 0) + 1);
    }
    for (const category of CV_TEMPLATE_CATEGORIES) {
      assert.ok(
        (byCategory.get(category.id) ?? 0) >= 5,
        `the "${category.nameEn}" category must hold at least 5 templates, found ${
          byCategory.get(category.id) ?? 0
        }`
      );
    }
    assert.ok(
      CV_TEMPLATES.filter((template) => template.atsFriendly).length >= 5,
      'at least five templates must be ATS-focused'
    );
  });

  test('every template is described in both languages', () => {
    for (const template of CV_TEMPLATES) {
      assert.ok(template.name.trim().length > 0, `${template.id} needs an English name`);
      assert.ok(template.nameAr.trim().length > 0, `${template.id} needs an Arabic name`);
      assert.ok(
        template.description.trim().length > 0,
        `${template.id} needs a description`
      );
      assert.ok(
        template.descriptionAr.trim().length > 0,
        `${template.id} needs an Arabic description`
      );
      assert.ok(
        template.layoutLabel.trim().length > 0,
        `${template.id} must say how it is laid out`
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

describe('a rendered template', () => {
  test('it shows every section the document holds, in every template', () => {
    const document = buildCvTemplateDocument(sampleEn, 'en');
    for (const template of CV_TEMPLATES) {
      const html = renderTemplate(template, 'en');
      for (const section of document.sections) {
        assert.ok(
          html.includes(escapeHtml(section.heading)),
          `${template.id} must show the "${section.heading}" section`
        );
      }
    }
  });

  test('it shows the content of every section, in every template', () => {
    const facts = [
      sampleEn.fullName,
      sampleEn.email,
      sampleEn.phone,
      sampleEn.location,
      sampleEn.title,
      ...sampleEn.experiences.flatMap((experience) => [
        experience.company,
        experience.role,
        ...experience.bullets,
      ]),
      ...sampleEn.education.flatMap((education) => [education.institution, education.degree]),
      ...sampleEn.projects.flatMap((project) => [project.title, ...project.bullets]),
      ...sampleEn.skillsList,
      ...sampleEn.courses.map((course) => course.title),
      ...sampleEn.volunteering.map((entry) => entry.organization),
      ...sampleEn.internships.map((entry) => entry.organization),
      ...sampleEn.languages.map((language) => language.name),
      ...sampleEn.awards.map((award) => award.title),
      ...sampleEn.publications.map((publication) => publication.title),
      ...sampleEn.research.map((entry) => entry.title),
      ...sampleEn.leadership.map((entry) => entry.organization),
    ].filter((fact) => fact && fact.trim().length > 0);

    for (const template of CV_TEMPLATES) {
      const html = renderTemplate(template, 'en');
      for (const fact of facts) {
        assert.ok(
          html.includes(escapeHtml(fact)),
          `${template.id} must not lose the fact "${fact}" — a template changes the look, not the CV`
        );
      }
    }
  });

  test('it never prints an empty section', () => {
    const emptyCv = {
      ...sampleEn,
      summary: '',
      experiences: [],
      education: [],
      projects: [],
      skillsList: [],
      certifications: [],
      certificationDetails: [],
      courses: [],
      internships: [],
      volunteering: [],
      languages: [],
      awards: [],
      publications: [],
      research: [],
      leadership: [],
      links: [],
    };
    const empty = buildCvTemplateDocument(emptyCv, 'en');
    assert.equal(empty.sections.length, 0, 'an empty CV produces no sections');

    for (const template of CV_TEMPLATES) {
      const html = renderToStaticMarkup(
        React.createElement(CvTemplateRenderer, {
          cv: emptyCv,
          language: 'en' as const,
          template,
          printable: false,
        })
      );
      for (const heading of ['Work Experience', 'Education', 'Projects', 'Certifications']) {
        assert.ok(
          !html.includes(heading),
          `${template.id} must not print "${heading}" when the CV holds nothing for it`
        );
      }
    }
  });

  test('it is laid out in the right direction for each language', () => {
    for (const template of CV_TEMPLATES) {
      const english = renderTemplate(template, 'en');
      assert.ok(
        english.includes('dir="ltr"'),
        `${template.id} must lay an English CV out left to right`
      );
      const arabic = renderTemplate(template, 'ar');
      assert.ok(
        arabic.includes('dir="rtl"'),
        `${template.id} must lay an Arabic CV out right to left`
      );
    }
  });

  test('it keeps the Arabic text intact', () => {
    for (const template of CV_TEMPLATES) {
      const html = renderTemplate(template, 'ar');
      assert.ok(html.includes('ليلى حسن'), `${template.id} must show the Arabic name`);
      assert.ok(
        html.includes('مهندسة منتجات أولى'),
        `${template.id} must show the Arabic headline`
      );
    }
  });

  test('the library preview is not the printable document', () => {
    // A library card draws the template with sample data. If that carried the
    // print marker, printing from the library would put every sample CV on the
    // page.
    const html = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv: sampleEn,
        language: 'en',
        template: CV_TEMPLATES[0],
        printable: false,
      })
    );
    assert.ok(!html.includes('data-cv-print'));
  });
});

/* -------------------------------------------------------------------------- */
/* Access control — the rule itself                                            */
/* -------------------------------------------------------------------------- */

describe('the template access rule', () => {
  const freeTemplate = CV_TEMPLATES.find((t) => t.id === FREE_CV_TEMPLATE_ID)!;
  const premiumTemplate = CV_TEMPLATES.find((t) => t.tier === 'premium')!;

  test('the free template is allowed for everyone', () => {
    for (const planCode of ['free', 'student', 'pro', 'career_plus'] as const) {
      const access = resolveCvTemplateAccess(freeTemplate, {
        enforcementEnabled: true,
        planCode,
        subscriptionStatus: planCode === 'free' ? 'free' : 'active',
      });
      assert.equal(access.allowed, true);
      assert.equal(access.access, 'free');
    }
  });

  test('a premium template is refused without a verified paid plan', () => {
    const access = resolveCvTemplateAccess(premiumTemplate, {
      enforcementEnabled: true,
      planCode: 'free',
      subscriptionStatus: 'free',
    });
    assert.equal(access.allowed, false);
    assert.equal(access.access, 'locked');
  });

  test('a premium template is allowed for an active paid plan', () => {
    for (const planCode of ['student', 'pro', 'career_plus'] as const) {
      const access = resolveCvTemplateAccess(premiumTemplate, {
        enforcementEnabled: true,
        planCode,
        subscriptionStatus: 'active',
      });
      assert.equal(access.allowed, true, `${planCode} must unlock the premium library`);
      assert.equal(access.access, 'premium');
    }
  });

  test('an unverified payment does not unlock a premium template', () => {
    const access = resolveCvTemplateAccess(premiumTemplate, {
      enforcementEnabled: true,
      planCode: 'pro',
      subscriptionStatus: 'temporary_access',
    });
    assert.equal(
      access.allowed,
      false,
      'a payment that has not been verified is not a paid subscription'
    );
  });

  test('while the free-access policy is in force, nothing is locked out', () => {
    const access = resolveCvTemplateAccess(premiumTemplate, {
      enforcementEnabled: false,
      planCode: 'free',
      subscriptionStatus: 'free',
    });
    assert.equal(access.allowed, true);
    assert.equal(access.access, 'included');
  });

  test('the enforcement flag is off unless it is explicitly turned on', () => {
    assert.equal(isCvTemplatePremiumEnforcementEnabled({}), false);
    assert.equal(isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: '' }), false);
    assert.equal(
      isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: 'false' }),
      false
    );
    assert.equal(
      isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: 'true' }),
      true
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Access control — the API                                                    */
/* -------------------------------------------------------------------------- */

let freeUser: TestUser;
let paidUser: TestUser;
let otherUser: TestUser;

/** The plan the harness gives a subscribed candidate. */
const PAID_PLAN = 'pro';

before(async () => {
  freeUser = await createTestUser('cvtpl-free', { subscription: false });
  paidUser = await createTestUser('cvtpl-paid', { subscription: true, planCode: PAID_PLAN });
  otherUser = await createTestUser('cvtpl-other', { subscription: false });
});

after(async () => {
  await deleteTestUser(freeUser);
  await deleteTestUser(paidUser);
  await deleteTestUser(otherUser);
});

describe('the template API', () => {
  test('the catalogue requires a session', async () => {
    const res = await apiAnonymous('GET', '/api/cv-templates');
    assert.equal(res.status, 401);
  });

  test('it answers with the whole library and a decision for each template', async () => {
    const res = await api('GET', '/api/cv-templates', { token: freeUser.token });
    assert.equal(res.status, 200);
    assert.ok(res.body?.templates?.length >= 30, 'the candidate sees the whole library');
    for (const template of res.body?.templates ?? []) {
      assert.ok(template.access, `${template.id} must carry an access decision`);
      assert.equal(typeof template.access.allowed, 'boolean');
    }
    const free = res.body.templates.find((t: any) => t.id === FREE_CV_TEMPLATE_ID);
    assert.equal(free?.access.allowed, true, 'the free template is always available');
  });

  test('a candidate without a paid plan cannot apply a premium template', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: freeUser.token,
      body: { templateId: 'modern-gradient' },
    });
    assert.equal(res.status, 403, 'the server must refuse the premium template');
    assert.equal(res.body?.code, 'UPGRADE_REQUIRED');
  });

  test('a candidate with an active paid plan can apply a premium template', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: paidUser.token,
      body: { templateId: 'modern-gradient' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.templateId, 'modern-gradient');
  });

  test('the choice is written to the account', async () => {
    await api('POST', '/api/cv-templates/apply', {
      token: paidUser.token,
      body: { templateId: 'technical-data' },
    });
    const { data } = await admin
      .from('user_preferences')
      .select('cv_template_id')
      .eq('user_id', paidUser.id)
      .maybeSingle();
    assert.equal(data?.cv_template_id, 'technical-data');
  });

  test('changing the template never changes the CV', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: paidUser.token,
      body: { name: 'Template switching CV', targetRoleTitle: 'Data Analyst' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body?.cv?.id as string;

    const before = await api('GET', `/api/cvs/${cvId}`, { token: paidUser.token });
    assert.equal(before.status, 200);
    const beforeJson = JSON.stringify(before.body?.cv);

    for (const templateId of ['ats-classic', 'technical-data', 'creative-studio']) {
      const applied = await api('POST', '/api/cv-templates/apply', {
        token: paidUser.token,
        body: { templateId },
      });
      assert.equal(applied.status, 200, `applying ${templateId} must succeed`);
    }

    const after = await api('GET', `/api/cvs/${cvId}`, { token: paidUser.token });
    assert.equal(after.status, 200);
    assert.equal(
      JSON.stringify(after.body?.cv),
      beforeJson,
      'the CV must be byte-identical after three template changes'
    );
  });

  test('an expired subscription loses the premium library', async () => {
    // Its own candidate: the expiry must not disturb the paid candidate the
    // other tests rely on.
    const expiring = await createTestUser('cvtpl-expired', {
      subscription: true,
      planCode: PAID_PLAN,
    });
    try {
      const first = await api('POST', '/api/cv-templates/apply', {
        token: expiring.token,
        body: { templateId: 'executive-board' },
      });
      assert.equal(first.status, 200, 'the paid plan works first');

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

      const refused = await api('POST', '/api/cv-templates/apply', {
        token: expiring.token,
        body: { templateId: 'executive-board' },
      });
      assert.equal(refused.status, 403, 'an expired subscription must lose the premium library');
    } finally {
      await deleteTestUser(expiring);
    }
  });

  test('a cancelled subscription loses the premium library', async () => {
    const cancelled = await createTestUser('cvtpl-cancelled', {
      subscription: true,
      planCode: PAID_PLAN,
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
      assert.equal(res.status, 403, 'a cancelled subscription must lose the premium library');
    } finally {
      await deleteTestUser(cancelled);
    }
  });

  test('the export needs the server to say yes', async () => {
    const refused = await api('GET', '/api/cv-templates/modern-gradient/export/authorize', {
      token: freeUser.token,
    });
    assert.equal(refused.status, 403, 'a free candidate may not export a premium template');

    const allowed = await api('GET', '/api/cv-templates/modern-gradient/export/authorize', {
      token: paidUser.token,
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body?.allowed, true);
  });

  test('a free candidate can export the free template as an editable document', async () => {
    const res = await fetch(
      `${process.env.TEST_API_BASE_URL}/api/cv-templates/${FREE_CV_TEMPLATE_ID}/export/docx`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freeUser.token}`,
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

  test('a candidate cannot export a premium template', async () => {
    const res = await api('POST', '/api/cv-templates/modern-gradient/export/docx', {
      token: freeUser.token,
      body: { cv: sampleEn, language: 'en' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body?.code, 'UPGRADE_REQUIRED');
  });

  test('a candidate cannot export somebody else\'s CV', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: otherUser.token,
      body: { name: 'Private CV' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body?.cv?.id as string;

    const res = await api('POST', `/api/cv-templates/${FREE_CV_TEMPLATE_ID}/export/docx`, {
      token: freeUser.token,
      body: { cvId },
    });
    assert.equal(
      res.status,
      404,
      'another candidate\'s CV must be answered exactly like a missing one'
    );
  });

  test('the template administration is closed to ordinary candidates', async () => {
    const anonymous = await apiAnonymous('GET', '/api/admin/cv-templates');
    assert.equal(anonymous.status, 401);

    const candidate = await api('GET', '/api/admin/cv-templates', { token: freeUser.token });
    assert.ok(
      candidate.status === 403 || candidate.status === 404,
      `an ordinary candidate must not reach the template administration, got ${candidate.status}`
    );

    const write = await api('POST', '/api/admin/cv-templates', {
      token: freeUser.token,
      body: { templateId: 'smuggled-template', baseTemplateId: 'ats-classic' },
    });
    assert.ok(
      write.status === 403 || write.status === 404,
      `an ordinary candidate must not create a template, got ${write.status}`
    );
  });

  test('an unknown template is refused', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token: paidUser.token,
      body: { templateId: 'does-not-exist' },
    });
    assert.equal(res.status, 404);
  });
});
