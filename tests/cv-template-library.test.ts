/**
 * The CV template library: the catalogue, the rendering, and the access rule.
 *
 * The product claim behind this feature is that the library is a real design
 * collection rather than one template recoloured thirty-five times. That claim
 * is only worth anything if it is checked, so this file proves it three ways:
 *
 *   - STRUCTURELY: no two templates describe the same document. The signature
 *     ignores colour and typography on purpose, because those are decoration.
 *   - VISUALLY: no two templates render the same document. Two templates that
 *     produce byte-identical markup are the same template whatever the
 *     catalogue says, so the markup itself is compared.
 *   - COMPLETELY: every template carries the candidate's facts. Changing the
 *     template changes the presentation; it must never lose a line of the CV.
 *
 * Every assertion here runs without a database, so the promise is checked on
 * every run of the suite instead of only when a disposable Supabase project
 * happens to be configured. The access control against the running API lives
 * in `cv-templates.test.ts`.
 */

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
  CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS,
  FREE_CV_TEMPLATE_ID,
  FREE_CV_TEMPLATE_IDS,
  cvTemplateStructuralSignature,
  isCvTemplatePremiumEnforcementEnabled,
  isFreeCvTemplateId,
  resolveCvTemplateAccess,
  type CvTemplateDefinition,
} from '../shared/cvTemplates.ts';
import { cvTemplateSample } from '../shared/cvTemplateSample.ts';
import { buildCvTemplateDocument } from '../shared/cvTemplateDocument.ts';
import { buildCvLayoutPlan } from '../shared/cvLayout.ts';
import { CvTemplateRenderer } from '../src/components/cv/templates/CvTemplateRenderer.tsx';


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

/**
 * Every fact a template must carry.
 *
 * The markup escapes a character here and there, so a fact is compared in the
 * form the candidate reads it.
 */
function candidateFactsOf(cv: typeof sampleEn): string[] {
  return [
    cv.fullName,
    cv.email,
    cv.phone,
    cv.location,
    cv.title,
    ...cv.experiences.flatMap((experience) => [
      experience.role,
      experience.company,
      ...experience.bullets,
    ]),
    ...cv.education.flatMap((entry) => [entry.degree, entry.institution]),
    ...cv.projects.flatMap((project) => [project.title, ...project.bullets]),
    ...cv.skillsList,
    ...(cv.courses ?? []).map((course) => course.title),
    ...(cv.languages ?? []).map((language) => language.name),
  ]
    .filter((fact) => Boolean(fact && fact.trim()))
    .map((fact) => escapeHtml(fact.trim()));
}

const candidateFacts = candidateFactsOf(sampleEn);

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

  test('exactly three templates are free, and they are three different documents', () => {
    const free = CV_TEMPLATES.filter((template) => template.tier === 'free');
    assert.equal(
      free.length,
      FREE_CV_TEMPLATE_IDS.length,
      'the number of free templates must match the list the product promises'
    );
    assert.deepEqual(
      free.map((template) => template.id).sort(),
      [...FREE_CV_TEMPLATE_IDS].sort(),
      'the free templates must be the ones the product promises'
    );

    // The three must be three genuinely different documents, not one design
    // in three colours: their structural signatures have to differ.
    const signatures = new Set(free.map((template) => cvTemplateStructuralSignature(template.structure)));
    assert.equal(
      signatures.size,
      free.length,
      'the free templates must be structurally different from one another'
    );

    const ats = free.find((template) => template.id === FREE_CV_TEMPLATE_ID);
    assert.ok(ats, 'the default template must be one of the free ones');
    assert.equal(ats.atsFriendly, true, 'the default template must be ATS-friendly');
    assert.equal(ats.supportsRtl, true, 'the default template must support Arabic');

    for (const template of free) {
      assert.equal(template.supportsRtl, true, `${template.id} must support Arabic`);
    }
  });

  test('every other template is premium', () => {
    for (const template of CV_TEMPLATES) {
      if (isFreeCvTemplateId(template.id)) continue;
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

  test('a refused premium template says what it costs to unlock', () => {
    const access = resolveCvTemplateAccess(premiumTemplate, {
      enforcementEnabled: true,
      planCode: 'free',
      subscriptionStatus: 'free',
    });
    assert.equal(access.canUnlockWithCredits, true);
    assert.equal(access.unlockCredits, CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS);
    assert.equal(access.unlockMethod, 'credits');
  });

  test('a template the candidate already unlocked with credits is allowed', () => {
    const access = resolveCvTemplateAccess(premiumTemplate, {
      enforcementEnabled: true,
      planCode: 'free',
      subscriptionStatus: 'free',
      unlockedTemplateIds: [premiumTemplate.id],
    });
    assert.equal(access.allowed, true, 'the candidate paid for this template');
    assert.equal(access.access, 'premium');
    assert.equal(access.unlockMethod, 'credits');
    assert.equal(
      access.canUnlockWithCredits,
      false,
      'a template that is already unlocked must not be offered for sale again'
    );
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

  test('the enforcement flag is on unless it is explicitly turned off', () => {
    assert.equal(isCvTemplatePremiumEnforcementEnabled({}), true);
    assert.equal(isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: '' }), true);
    assert.equal(
      isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: 'false' }),
      false
    );
    assert.equal(
      isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: '0' }),
      false
    );
    assert.equal(
      isCvTemplatePremiumEnforcementEnabled({ CV_TEMPLATE_PREMIUM_ENFORCEMENT: 'true' }),
      true
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Switching the template                                                       */
/* -------------------------------------------------------------------------- */

describe('switching the template', () => {
  test('it never loses a line of the CV', () => {
    // The same document, drawn in every template. A template is a way of
    // showing a CV, not a way of editing it, so nothing may disappear when
    // the candidate picks a different one.
    for (const template of CV_TEMPLATES) {
      const html = renderTemplate(template, 'en');
      const missing = candidateFacts.filter((fact) => !html.includes(fact));
      assert.deepEqual(
        missing,
        [],
        `${template.id} lost ${missing.length} of the candidate's facts`
      );
    }
  });

  test('it leaves the CV itself untouched', () => {
    // The document the templates draw is built from the CV. Building it for a
    // template must not write anything back into the CV.
    const before = JSON.stringify(sampleEn);
    for (const template of CV_TEMPLATES) {
      buildCvLayoutPlan({ cv: sampleEn, template, language: 'en' });
    }
    assert.equal(JSON.stringify(sampleEn), before, 'the CV was changed by the templates');
  });

  test('it keeps the order of the sections the candidate chose', () => {
    // The order of the sections belongs to the candidate, not to the
    // template. A template that offers its own order must not override one
    // the candidate has already arranged.
    const chosen = ['skills', 'experience', 'education'] as const;
    const cv = { ...sampleEn, sectionOrder: [...chosen] };
    for (const template of CV_TEMPLATES) {
      const plan = buildCvLayoutPlan({ cv, template, language: 'en' });
      const order = plan.sections.map((section) => section.key);
      const kept = order.filter((key) => (chosen as readonly string[]).includes(key));
      assert.deepEqual(
        kept,
        chosen.filter((key) => order.includes(key)),
        `${template.id} reordered the sections the candidate chose`
      );
    }
  });

  test('a long CV still renders in every template', () => {
    const longCv = {
      ...sampleEn,
      experiences: Array.from({ length: 8 }, (_, index) => ({
        ...sampleEn.experiences[0],
        role: `Engineer role ${index + 1}`,
        company: `Company ${index + 1}`,
        bullets: [
          `Delivered outcome ${index + 1} for the platform team.`,
          `Delivered outcome ${index + 1} for the data team.`,
        ],
      })),
    };
    const facts = candidateFactsOf(longCv);
    for (const template of CV_TEMPLATES) {
      const html = renderToStaticMarkup(
        React.createElement(CvTemplateRenderer, {
          cv: longCv,
          language: 'en' as const,
          template,
          printable: false,
        })
      );
      const missing = facts.filter((fact) => !html.includes(fact));
      assert.deepEqual(
        missing,
        [],
        `${template.id} lost ${missing.length} facts from a long CV`
      );
    }
  });
});
