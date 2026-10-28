/**
 * Behavioural checks for the CV studio's writing assistant and document.
 *
 * Two things are being protected here.
 *
 * The first is honesty. The assistant writes from the candidate's own record,
 * so a number the candidate has never recorded must not survive into a CV
 * they are about to send to an employer, and a record that does not belong to
 * them must not be written about at all.
 *
 * The second is the candidate's work. The document builder merges the
 * platform's records into a CV, and it must never overwrite something the
 * candidate wrote themselves — the whole point of the merge is to save them
 * typing, not to take the document away from them.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CV_ASSIST_FIELDS,
  cvAssistBulletBudget,
  cvAssistVariationHint,
  cvAssistWordBudget,
  isCvAssistField,
  isCvAssistLength,
  isCvAssistSourceKind,
  isCvAssistTone,
  parseCvAssistPayload,
  validateCvAssistPayload,
} from '../shared/cvAiAssist.ts';

import {
  buildCvAssistPrompt,
  groundCvAssistAnswer,
} from '../server/cv/aiAssist.ts';

import { buildGroundingProfile } from '../server/ai/grounding.ts';

import {
  buildCvDocument,
  cvLinkLabel,
  descriptionToBullets,
  formatCvPeriod,
} from '../shared/cvDocument.ts';

describe('cv assist field contract', () => {
  it('accepts every field the studio offers', () => {
    for (const field of Object.keys(CV_ASSIST_FIELDS)) {
      assert.ok(isCvAssistField(field), `${field} must be a known field`);
    }
  });

  it('rejects a field it does not know', () => {
    assert.equal(isCvAssistField('references'), false);
    assert.equal(isCvAssistField(''), false);
    assert.equal(isCvAssistField(null), false);
    // A prototype key must not pass as a field.
    assert.equal(isCvAssistField('toString'), false);
  });

  it('accepts only the tones and lengths it offers', () => {
    assert.ok(isCvAssistTone('professional'));
    assert.ok(isCvAssistTone('concise'));
    assert.equal(isCvAssistTone('sarcastic'), false);
    assert.ok(isCvAssistLength('medium'));
    assert.equal(isCvAssistLength('enormous'), false);
  });

  it('accepts only the record kinds the server can resolve', () => {
    assert.ok(isCvAssistSourceKind('experience'));
    assert.ok(isCvAssistSourceKind('course'));
    assert.equal(isCvAssistSourceKind('made_up'), false);
  });

  it('scales the word budget with the requested length', () => {
    const short = cvAssistWordBudget('summary', 'short');
    const medium = cvAssistWordBudget('summary', 'medium');
    const long = cvAssistWordBudget('summary', 'long');

    assert.ok(short.max < medium.max, 'short must be shorter than medium');
    assert.ok(medium.max < long.max, 'medium must be shorter than long');
    // The floor never moves: a short answer that still says something beats a
    // long one that pads.
    assert.equal(short.min, medium.min);
    assert.equal(medium.min, long.min);
  });

  it('gives a bullet field a sensible bullet count', () => {
    assert.ok(cvAssistBulletBudget('short').max <= cvAssistBulletBudget('long').max);
    assert.ok(cvAssistBulletBudget('medium').min >= 1);
  });

  it('asks each regeneration to lead from a different angle', () => {
    assert.equal(cvAssistVariationHint(0), '', 'the first attempt has no hint');
    assert.notEqual(cvAssistVariationHint(1), '');
    assert.notEqual(
      cvAssistVariationHint(1),
      cvAssistVariationHint(2),
      'two attempts must not use the same hint'
    );
  });
});

describe('cv assist answer validation', () => {
  it('accepts a well-formed answer', () => {
    const errors = validateCvAssistPayload(
      { text: 'A senior engineer who builds reliable systems.', bullets: [] },
      'summary'
    );
    assert.deepEqual(errors, []);
  });

  it('rejects an answer with no text', () => {
    const errors = validateCvAssistPayload({ text: '   ' }, 'summary');
    assert.ok(errors.length > 0, 'an empty answer must be rejected');
  });

  it('rejects an answer that is not an object', () => {
    assert.ok(validateCvAssistPayload('a string', 'summary').length > 0);
    assert.ok(validateCvAssistPayload(null, 'summary').length > 0);
    assert.ok(validateCvAssistPayload(['an', 'array'], 'summary').length > 0);
  });

  it('requires bullets for a bullet-shaped field', () => {
    const errors = validateCvAssistPayload({ text: 'Some text' }, 'experience');
    assert.ok(
      errors.some((error) => error.includes('bullets are required')),
      'an experience answer without bullets must be rejected'
    );
  });

  it('rejects an empty bullet', () => {
    const errors = validateCvAssistPayload({ text: 'x', bullets: ['ok', '   '] }, 'experience');
    assert.ok(errors.length > 0, 'an empty bullet must be rejected');
  });

  it('gives a bullet field its bullets and a text field its paragraph', () => {
    const bullets = parseCvAssistPayload(
      { text: 'one\ntwo', bullets: ['one', 'two'] },
      'experience'
    );
    assert.deepEqual(bullets.bullets, ['one', 'two']);
    assert.equal(bullets.text, 'one\ntwo');

    const text = parseCvAssistPayload({ text: 'A paragraph.', bullets: [] }, 'summary');
    assert.equal(text.text, 'A paragraph.');
    assert.deepEqual(text.bullets, []);
  });
});

describe('cv assist prompt', () => {
  const base = {
    field: 'experience' as const,
    targetRoleTitle: 'Backend Engineer',
    context: 'The candidate notes: I owned the billing service.',
    existingText: 'Rewrote the billing service.',
  };

  it('always carries the grounding rules', () => {
    const prompt = buildCvAssistPrompt({
      request: base,
      careerContextBlock: 'The candidate records.',
      sourceBlock: null,
    });
    assert.ok(
      /never invent/i.test(prompt),
      'the prompt must forbid invention'
    );
    assert.ok(prompt.includes('GROUNDING RULES'));
  });

  it('carries the candidate\'s own record', () => {
    const prompt = buildCvAssistPrompt({
      request: base,
      careerContextBlock: 'THE RECORD FROM THE DATABASE',
      sourceBlock: null,
    });
    assert.ok(prompt.includes('THE RECORD FROM THE DATABASE'));
  });

  it('carries the specific record the field belongs to', () => {
    const prompt = buildCvAssistPrompt({
      request: base,
      careerContextBlock: 'record',
      sourceBlock: 'Employer: Acme',
    });
    assert.ok(prompt.includes('Employer: Acme'));
  });

  it('states the target role when there is one', () => {
    const prompt = buildCvAssistPrompt({
      request: base,
      careerContextBlock: 'record',
      sourceBlock: null,
    });
    assert.ok(prompt.includes('Backend Engineer'));
  });

  it('asks for Arabic when the interface is Arabic', () => {
    const prompt = buildCvAssistPrompt({
      request: { ...base, language: 'ar' },
      careerContextBlock: 'record',
      sourceBlock: null,
    });
    assert.ok(prompt.includes('Arabic'));
  });

  it('asks for bullets only for a bullet-shaped field', () => {
    const bullets = buildCvAssistPrompt({
      request: base,
      careerContextBlock: 'record',
      sourceBlock: null,
    });
    assert.ok(bullets.includes('bullet points, one per line'));

    const paragraph = buildCvAssistPrompt({
      request: { ...base, field: 'summary' },
      careerContextBlock: 'record',
      sourceBlock: null,
    });
    assert.ok(
      !paragraph.includes('bullet points, one per line'),
      'a paragraph field must not ask for bullet points'
    );
    assert.ok(paragraph.includes('one short paragraph'));
  });
});

describe('cv assist grounding of the answer', () => {
  const profile = buildGroundingProfile({
    organisations: ['Meridian Health'],
    roles: ['Data Analyst'],
    skills: ['SQL'],
    certifications: ['ECBA'],
    projects: ['Demand forecast'],
    freeText: ['Reduced reporting time by 30%.', 'Supported a team of 8 analysts.'],
  });

  it('keeps a metric the candidate has recorded', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'Cut reporting time by 30%.',
        bullets: ['Cut reporting time by 30% by automating the extract.'],
      },
      profile,
      []
    );
    assert.equal(result.bullets.length, 1);
    assert.equal(result.removedClaims.length, 0);
    assert.equal(result.groundingNote, null);
  });

  it('removes a bullet that invents a number', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'Grew revenue by 400%.',
        bullets: ['Grew revenue by 400%.', 'Led a team of 8 analysts.'],
      },
      profile,
      []
    );
    assert.equal(result.bullets.length, 1, 'the invented bullet must be dropped');
    assert.ok(result.removedClaims.length > 0);
    assert.ok(result.groundingNote, 'the candidate must be told something was removed');
  });

  it('keeps a number the candidate wrote themselves', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'Improved retention by 12%.',
        bullets: ['Improved retention by 12%.'],
      },
      profile,
      ['I improved retention by 12% last quarter.']
    );
    assert.equal(result.bullets.length, 1, 'the candidate\'s own number must survive');
    assert.equal(result.removedClaims.length, 0);
  });

  it('removes a bullet that names an employer the candidate never worked for', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'Led a data transformation programme at Acme Corporation.',
        bullets: ['Led a data transformation programme at Acme Corporation.'],
      },
      profile,
      []
    );
    assert.equal(result.bullets.length, 0, 'a fabricated employer must be dropped');
    assert.ok(result.removedClaims.length > 0);
  });

  it('keeps an employer the candidate really worked for', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'Built reporting tools at Meridian Health.',
        bullets: ['Built reporting tools at Meridian Health.'],
      },
      profile,
      []
    );
    assert.equal(result.bullets.length, 1, 'a real employer must survive');
  });

  it('removes a bullet that carries a link the candidate never supplied', () => {
    const result = groundCvAssistAnswer(
      {
        text: 'See https://example.com/portfolio for the work.',
        bullets: ['See https://example.com/portfolio for the work.'],
      },
      profile,
      []
    );
    assert.equal(result.bullets.length, 0, 'a fabricated URL must be dropped');
  });

  it('strips the offending sentence from a paragraph rather than the whole thing', () => {
    const result = groundCvAssistAnswer(
      {
        text:
          'Led a data transformation programme at Acme Corporation. Cut reporting time by 30%.',
        bullets: [],
      },
      profile,
      []
    );
    assert.ok(result.text.includes('30%'), 'the grounded sentence must survive');
    assert.ok(!result.text.includes('Acme'), 'the fabricated sentence must be removed');
  });

  it('removes every bullet when every one of them invents a number', () => {
    const result = groundCvAssistAnswer(
      { text: 'x', bullets: ['Grew by 90%.', 'Cut costs by 35%.'] },
      profile,
      []
    );
    assert.equal(result.bullets.length, 0);
  });

  it('keeps a bare number that is not a metric claim', () => {
    // The shared validator treats a number as a claim only when it carries a
    // unit. "Led a team of 12" is ordinary career language; "grew by 90%" is
    // a claim about the world. The CV studio follows the same rule, so the
    // two can never disagree about the same sentence.
    const result = groundCvAssistAnswer(
      { text: 'x', bullets: ['Led a team of 12 engineers.'] },
      profile,
      []
    );
    assert.equal(result.bullets.length, 1);
  });
});

describe('cv document from the platform records', () => {
  it('carries the candidate\'s experience across', () => {
    const document = buildCvDocument({
      experiences: [
        {
          id: 'e1',
          role: 'Backend Engineer',
          company: 'Acme',
          startDate: '2023-01-01',
          isCurrent: true,
          description: 'Owned the billing service.',
        },
      ],
    });
    assert.equal(document.experiences.length, 1);
    assert.equal(document.experiences[0].company, 'Acme');
    assert.equal(document.experiences[0].role, 'Backend Engineer');
    // A description the candidate wrote as a paragraph becomes one bullet, not
    // a set of sentences the candidate never chose.
    assert.deepEqual(document.experiences[0].bullets, ['Owned the billing service.']);
  });

  it('keeps what the candidate has already written', () => {
    const document = buildCvDocument(
      {
        profile: { fullName: 'Platform Name', summary: 'Platform summary' },
        experiences: [
          {
            id: 'e1',
            role: 'Backend Engineer',
            company: 'Acme',
            description: 'Owned billing.',
          },
        ],
      },
      {
        fullName: 'Their Own Name',
        summary: 'Their own summary.',
        experiences: [
          {
            id: 'e1',
            company: 'Acme',
            role: 'Backend Engineer',
            period: '2023 - Present',
            location: '',
            bullets: ['A bullet the candidate wrote themselves.'],
          },
        ],
      }
    );

    assert.equal(document.fullName, 'Their Own Name', 'their name must not be replaced');
    assert.equal(document.summary, 'Their own summary.', 'their summary must not be replaced');
    assert.deepEqual(
      document.experiences[0].bullets,
      ['A bullet the candidate wrote themselves.'],
      'their bullets must not be replaced'
    );
  });

  it('never invents a metric', () => {
    const document = buildCvDocument({
      experiences: [
        {
          id: 'e1',
          role: 'Engineer',
          company: 'Acme',
          description: 'Improved revenue by 40%.',
        },
      ],
    });
    // The metric is carried because the candidate wrote it, and it is
    // carried exactly — nothing is added.
    assert.deepEqual(document.experiences[0].bullets, ['Improved revenue by 40%.']);
  });

  it('leaves a section empty when the candidate has no records for it', () => {
    const document = buildCvDocument({});
    assert.deepEqual(document.experiences, []);
    assert.deepEqual(document.education, []);
    assert.deepEqual(document.projects, []);
    assert.deepEqual(document.skillsList, []);
    assert.deepEqual(document.volunteering, []);
    assert.deepEqual(document.courses, []);
  });

  it('carries the professional links across', () => {
    const document = buildCvDocument({
      links: [{ id: 'l1', kind: 'linkedin', url: 'https://linkedin.com/in/them' }],
    });
    assert.equal(document.links?.length, 1);
    assert.equal(document.links?.[0].label, 'LinkedIn');
    assert.equal(document.links?.[0].enabled, true);
  });

  it('keeps a link the candidate switched off switched off', () => {
    const document = buildCvDocument(
      { links: [{ id: 'l1', kind: 'github', url: 'https://github.com/them' }] },
      {
        links: [
          { id: 'l1', kind: 'github', label: 'GitHub', url: 'https://github.com/them', enabled: false },
        ],
      }
    );
    assert.equal(document.links?.[0].enabled, false, 'the candidate\'s choice must be kept');
  });

  it('carries the rated skills across', () => {
    const document = buildCvDocument({
      skills: [
        { name: 'SQL', level: 4 },
        { name: 'Python', level: 3 },
      ],
    });
    assert.deepEqual(document.skillsList, ['SQL', 'Python']);
  });

  it('carries the completed courses across', () => {
    const document = buildCvDocument({
      courses: [{ id: 'c1', title: 'Intro to SQL', provider: 'Coursera' }],
    });
    assert.equal(document.courses?.length, 1);
    assert.equal(document.courses?.[0].title, 'Intro to SQL');
    assert.equal(document.courses?.[0].provider, 'Coursera');
  });

  it('carries the volunteering across', () => {
    const document = buildCvDocument({
      volunteering: [
        {
          id: 'v1',
          organization: 'Refugee Support',
          role: 'Mentor',
          startDate: '2022-01-01',
          endDate: '2023-01-01',
          achievements: ['Mentored 12 students.'],
        },
      ],
    });
    assert.equal(document.volunteering?.length, 1);
    assert.equal(document.volunteering?.[0].organization, 'Refugee Support');
    assert.deepEqual(document.volunteering?.[0].bullets, ['Mentored 12 students.']);
  });

  it('formats a period without guessing an end date', () => {
    assert.equal(formatCvPeriod('2023-01-01', '2024-01-01', false), 'Jan 2023 – Jan 2024');
    assert.equal(formatCvPeriod('2023-01-01', null, true), 'Jan 2023 – Present');
    // No end date and not current: nothing is invented.
    assert.equal(formatCvPeriod('2023-01-01', null, false), 'Jan 2023');
    assert.equal(formatCvPeriod(null, null, false), '');
  });

  it('turns a written description into bullets without inventing structure', () => {
    assert.deepEqual(descriptionToBullets('One line.\nTwo lines.'), ['One line.', 'Two lines.']);
    assert.deepEqual(descriptionToBullets('- A bullet\n• Another bullet'), [
      'A bullet',
      'Another bullet',
    ]);
    assert.deepEqual(descriptionToBullets('   '), []);
  });

  it('leaves a field of study that is only punctuation out of the document', () => {
    // A field of study recorded as a full stop is a typo in the profile, not
    // a subject. Putting "B.Sc in ." on a CV reads as an error.
    const document = buildCvDocument({
      education: [
        { id: 'ed1', institution: 'Kafr El-Sheikh University', degree: 'B.Sc', field: '.' },
      ],
    });
    assert.equal(document.education[0].field, '');
    assert.equal(document.education[0].degree, 'B.Sc');
  });

  it('keeps a real field of study', () => {
    const document = buildCvDocument({
      education: [
        { id: 'ed1', institution: 'Northgate University', degree: 'BSc', field: 'Computer Science' },
      ],
    });
    assert.equal(document.education[0].field, 'Computer Science');
  });

  it('labels a link kind it recognises and does not guess at one it does not', () => {
    assert.equal(cvLinkLabel('linkedin'), 'LinkedIn');
    assert.equal(cvLinkLabel('kaggle'), 'Kaggle');
    assert.equal(cvLinkLabel('medium'), 'Medium');
    assert.equal(cvLinkLabel('something_new'), 'Link');
    // A label the candidate gave is kept.
    assert.equal(cvLinkLabel('linkedin', 'My Profile'), 'My Profile');
  });
});
